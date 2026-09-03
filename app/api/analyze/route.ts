const MAX_REQUEST_BYTES = 12 * 1024 * 1024;
const ALLOWED_MODELS = new Set(["gpt-5.6-luna", "gpt-5.6-sol"]);

const REVIEW_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ok", "insufficient"] },
    headline: { type: "string" },
    observed: { type: "array", items: { type: "string" } },
    main_issue: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: [
            "先落ち",
            "トレード",
            "ポジショニング",
            "ピーク判断",
            "スキル運用",
            "人数管理",
            "味方とのタイミング",
            "クロスヘア",
            "情報不足",
            "判定困難",
          ],
        },
        severity: { type: "string", enum: ["low", "medium", "high"] },
        evidence: { type: "string" },
      },
      required: ["category", "severity", "evidence"],
      additionalProperties: false,
    },
    improvements: { type: "array", items: { type: "string" } },
    next_focus: { type: "string" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    uncertainty: { type: "string" },
  },
  required: [
    "status",
    "headline",
    "observed",
    "main_issue",
    "improvements",
    "next_focus",
    "confidence",
    "uncertainty",
  ],
  additionalProperties: false,
};

const COACH_INSTRUCTIONS = `あなたは高ランク帯VALORANT専門のVODコーチです。
入力は、ユーザーの死亡前20秒から死亡後5秒までの時系列スクリーンショットです。
画面に写る事実と推測を分け、見えない情報を断定しないでください。
音声、正確なエイム軌道、フレーム間の出来事は確認できないため、必要なら不確実性に明記してください。
死亡後のフレームは、味方のトレード可否やキルフィードなど、画面で確認できる結果だけの補助材料にしてください。
K/Dではなく、再現性のある判断改善を重視してください。
回答は日本語で簡潔にし、次の1試合で意識する課題は必ず1つに絞ってください。
イニシエーターなら、索敵、味方との同期、スキルを持ったままの死亡を特に確認してください。
材料不足ならstatusをinsufficient、categoryを判定困難にしてください。`;

type AnalyzeBody = {
  apiKey?: unknown;
  model?: unknown;
  metadata?: unknown;
  frames?: unknown;
};

type SafeFrame = { label: string; dataUrl: string };

class RequestError extends Error {}

function cleanText(value: unknown, maxLength = 240) {
  return typeof value === "string"
    ? value.trim().replaceAll("\u0000", "").slice(0, maxLength)
    : "";
}

function cleanMetadata(value: unknown) {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const rawTags = Array.isArray(raw.tags) ? raw.tags : [];
  return {
    map: cleanText(raw.map, 40),
    agent: cleanText(raw.agent, 40),
    role: cleanText(raw.role, 40),
    side: cleanText(raw.side, 20),
    round: cleanText(raw.round, 12),
    timestamp: cleanText(raw.timestamp, 20),
    note: cleanText(raw.note, 500),
    tags: rawTags.slice(0, 10).map((tag) => cleanText(tag, 40)).filter(Boolean),
  };
}

function cleanFrames(value: unknown): SafeFrame[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) {
    throw new RequestError("2〜6枚の時系列フレームが必要です。");
  }
  return value.map((item) => {
    const frame = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const dataUrl = cleanText(frame.dataUrl, 2_500_000);
    if (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=\r\n]+$/.test(dataUrl)) {
      throw new RequestError("JPEGまたはPNGのフレームを読み取れませんでした。");
    }
    if (dataUrl.length >= 2_500_000) {
      throw new RequestError("1枚の画像が大きすぎます。もう一度切り出してください。");
    }
    return {
      label: cleanText(frame.label, 40) || "時系列フレーム",
      dataUrl,
    };
  });
}

function extractOutputText(response: Record<string, unknown>) {
  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  const output = Array.isArray(response.output) ? response.output : [];
  for (const rawItem of output) {
    const item = rawItem && typeof rawItem === "object" ? rawItem as Record<string, unknown> : {};
    const content = Array.isArray(item.content) ? item.content : [];
    for (const rawPart of content) {
      const part = rawPart && typeof rawPart === "object" ? rawPart as Record<string, unknown> : {};
      if (part.type === "refusal") throw new Error("AIがこの解析への回答を拒否しました。");
      if (part.type === "output_text" && typeof part.text === "string") return part.text;
    }
  }
  throw new Error("AIの応答本文を取得できませんでした。");
}

function validateReview(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("AIの解析結果が想定形式ではありません。");
  const review = value as Record<string, unknown>;
  for (const key of REVIEW_SCHEMA.required) {
    if (!(key in review)) throw new Error("AIの解析結果に必要な項目がありません。");
  }
  return review;
}

function friendlyApiError(status: number, value: unknown) {
  if (status === 401) return "APIキーを確認してください。ChatGPT Plusとは別にAPI利用設定が必要です。";
  if (status === 429) return "APIの利用上限またはレート制限に達しました。少し待って再試行してください。";
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const error = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
  const detail = cleanText(error.message, 220);
  if (status === 400) return detail ? `APIリクエストを確認してください。${detail}` : "APIリクエストを確認してください。";
  return detail ? `OpenAI APIでエラーが発生しました（${status}）。${detail}` : `OpenAI APIでエラーが発生しました（${status}）。`;
}

function json(payload: Record<string, unknown>, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      throw new RequestError("送信データが大きすぎます。フレームをもう一度切り出してください。");
    }

    const body = await request.json() as AnalyzeBody;
    const apiKey = cleanText(body.apiKey, 300);
    const model = cleanText(body.model, 60) || "gpt-5.6-luna";
    if (!apiKey) throw new RequestError("OpenAI APIキーを入力してください。");
    if (!ALLOWED_MODELS.has(model)) throw new RequestError("選択されたモデルは利用できません。");
    const frames = cleanFrames(body.frames);
    const metadata = cleanMetadata(body.metadata);

    const content: Array<Record<string, unknown>> = [{
      type: "input_text",
      text: `以下はデス前20秒からデス後5秒まで、順番に並んだフレームです。画面で確認できる内容だけを根拠にレビューしてください。\n試合情報: ${JSON.stringify(metadata)}`,
    }];
    for (const frame of frames) {
      content.push({ type: "input_text", text: frame.label });
      content.push({ type: "input_image", image_url: frame.dataUrl, detail: "low" });
    }

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: COACH_INSTRUCTIONS,
        input: [{ role: "user", content }],
        reasoning: { effort: "low" },
        max_output_tokens: 1200,
        store: false,
        text: {
          format: {
            type: "json_schema",
            name: "valorant_review",
            strict: true,
            schema: REVIEW_SCHEMA,
          },
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });

    const upstreamBody = await upstream.json() as Record<string, unknown>;
    if (!upstream.ok) return json({ ok: false, error: friendlyApiError(upstream.status, upstreamBody) }, 502);

    const review = validateReview(JSON.parse(extractOutputText(upstreamBody)));
    return json({ ok: true, review, model: cleanText(upstreamBody.model, 80) || model, usage: upstreamBody.usage ?? {} });
  } catch (error) {
    if (error instanceof RequestError) return json({ ok: false, error: error.message }, 400);
    if (error instanceof SyntaxError) return json({ ok: false, error: "AIの解析結果を読み取れませんでした。" }, 502);
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return json({ ok: false, error: "AI解析が時間切れになりました。もう一度お試しください。" }, 504);
    }
    return json({ ok: false, error: error instanceof Error ? error.message : "AI解析中に予期しないエラーが発生しました。" }, 502);
  }
}
