export const MONTHLY_DAYS = 30;
export const WEEKLY_XP = 50;
export const MONTHLY_BONUS_XP = 100;
export const DAY_MS = 86_400_000;

export type MonthlyTask = { title: string; action: string; success_criteria: string };
export type MonthlyCheck = {
  status: "cleared" | "improving" | "not_cleared" | "insufficient" | "not_applicable";
  evidence: string;
  confidence: "low" | "medium" | "high";
  evidence_times: number[];
};
export type MonthlyAttempt = MonthlyCheck & {
  step: number;
  recordingId: string;
  createdAt: string;
  xp: number;
};
export type MonthlyCycle = {
  id: string;
  startedAt: string;
  endsAt: string;
  baselineFocus: string;
  tasks: MonthlyTask[];
  currentStep: number;
  xp: number;
  checks: MonthlyAttempt[];
};
export type MonthlySummary = { cycle: MonthlyCycle | null; totalXp: number; completedMonths: number; serverNow: string };

export const MONTHLY_PLAN_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      title: { type: "string" },
      action: { type: "string" },
      success_criteria: { type: "string" },
    },
    required: ["title", "action", "success_criteria"],
    additionalProperties: false,
  },
};

export function parseMonthlyPlan(value: unknown): MonthlyTask[] {
  if (!Array.isArray(value) || value.length !== 4) throw new Error("月間ミッションは4つ必要です。");
  return value.map((item) => {
    if (!item || typeof item !== "object") throw new Error("月間ミッションの形式を確認できませんでした。");
    const task = item as Record<string, unknown>;
    const text = (key: string, max: number) => {
      if (typeof task[key] !== "string" || !task[key].trim() || task[key].length > max) {
        throw new Error("月間ミッションの課題・達成条件を確認できませんでした。");
      }
      return task[key].trim();
    };
    return { title: text("title", 60), action: text("action", 300), success_criteria: text("success_criteria", 400) };
  });
}

// Missing evidence can never award XP, even if the model returns "cleared".
export function verifiedMonthlyCheck(value: unknown, frameTimes: number[], reviewOk: boolean): MonthlyCheck {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const statuses = ["cleared", "improving", "not_cleared", "insufficient", "not_applicable"];
  let status = statuses.includes(String(raw.status)) ? raw.status as MonthlyCheck["status"] : "insufficient";
  const confidence = ["low", "medium", "high"].includes(String(raw.confidence)) ? raw.confidence as MonthlyCheck["confidence"] : "low";
  let evidence = typeof raw.evidence === "string" ? raw.evidence.trim().slice(0, 800) : "";
  const evidenceTimes = Array.isArray(raw.evidence_times)
    ? [...new Set(raw.evidence_times.filter((time): time is number => typeof time === "number" && Number.isFinite(time) && frameTimes.some((frame) => Math.abs(frame - time) < 0.1)))].slice(0, 5)
    : [];
  if (status === "cleared" && (!reviewOk || confidence !== "high" || !evidence || evidenceTimes.length === 0)) {
    status = "insufficient";
    evidence = "達成を裏づける映像・時刻・確信度が足りないため保留しました。次の録画で確認します。";
  }
  return { status, confidence, evidence: evidence || "今回の場面では達成を確認できませんでした。", evidence_times: evidenceTimes };
}

export function monthlyPhase(cycle: MonthlyCycle, now: number) {
  if (cycle.currentStep >= 4) return "completed" as const;
  return now >= Date.parse(cycle.endsAt) ? "expired" as const : "active" as const;
}

// Sample video bytes without loading a multi-GB recording into browser memory.
// Renaming the same file preserves this ID; this does not identify re-encoded matches.
export async function fingerprintRecording(file: Blob): Promise<string> {
  const length = Math.min(file.size, 256 * 1024);
  const parts: BlobPart[] = [String(file.size)];
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const start = Math.floor(Math.max(0, file.size - length) * fraction);
    parts.push(await file.slice(start, start + length).arrayBuffer());
  }
  const digest = await crypto.subtle.digest("SHA-256", await new Blob(parts).arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
