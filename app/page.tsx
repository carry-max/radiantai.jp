"use client";

/* eslint-disable @next/next/no-img-element */

import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Film,
  History,
  KeyRound,
  LoaderCircle,
  MonitorUp,
  Play,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UploadCloud,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

type Frame = { label: string; time: number; dataUrl: string };

type Review = {
  status: "ok" | "insufficient";
  headline: string;
  observed: string[];
  main_issue: {
    category: string;
    severity: "low" | "medium" | "high";
    evidence: string;
  };
  improvements: string[];
  next_focus: string;
  confidence: "low" | "medium" | "high";
  uncertainty: string;
};

type MatchContext = {
  map: string;
  agent: string;
  role: string;
  side: string;
  round: string;
  timestamp: string;
  note: string;
  tags: string[];
};

type HistoryEntry = {
  id: string;
  createdAt: string;
  model: string;
  metadata: MatchContext;
  review: Review;
};

const HISTORY_KEY = "radiant-review-web-history-v1";
const MAX_VOD_SECONDS = 60 * 60;
const CAPTURE_OFFSETS = [-18, -12, -7, -3, 0];
const TAGS = ["先落ち", "トレード不可", "スキル残し", "不要ピーク", "人数有利", "タイミング", "クロスヘア"];
const MAPS = ["Ascent", "Abyss", "Bind", "Breeze", "Corrode", "Fracture", "Haven", "Icebox", "Lotus", "Pearl", "Split", "Sunset"];

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return "--:--";
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function isVideoFile(file: File) {
  return file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
}

function waitForSeek(video: HTMLVideoElement, target: number) {
  return new Promise<void>((resolve, reject) => {
    if (Math.abs(video.currentTime - target) < 0.04 && video.readyState >= 2) {
      requestAnimationFrame(() => resolve());
      return;
    }
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("動画のシークに時間がかかっています。"));
    }, 9000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("動画を読み取れませんでした。")); };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = target;
  });
}

function frameDataUrl(video: HTMLVideoElement) {
  const width = Math.min(video.videoWidth, 960);
  const height = Math.round(width * (video.videoHeight / video.videoWidth));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("画像を切り出せませんでした。");
  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.74);
}

function demoReview(firstTag?: string): Review {
  const category = firstTag === "不要ピーク" ? "ピーク判断" : firstTag === "スキル残し" ? "スキル運用" : firstTag === "人数有利" ? "人数管理" : "トレード";
  return {
    status: "ok",
    headline: "撃ち合う前の条件を整える",
    observed: [
      "登録した時刻までの5場面を、デス直前の時系列として扱います。",
      "味方との距離・残りスキル・相手へ見せた射線を確認する場面です。",
    ],
    main_issue: {
      category,
      severity: "medium",
      evidence: "味方が同時に射線を通せる位置へ入る前に、自分だけが接敵した可能性があります。",
    },
    improvements: [
      "ピーク前にミニマップで最も近い味方を1回確認する。",
      "『トレード可能』か『必要スキル使用済み』のどちらかを満たしてから勝負する。",
    ],
    next_focus: "次の1試合は、ピーク前に味方との距離を1回確認する。",
    confidence: "low",
    uncertainty: "これは画面確認を行わないデモです。本解析では切り出した画像だけを根拠に判定します。",
  };
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SectionHeading({ step, eyebrow, title, trailing }: { step: string; eyebrow: string; title: string; trailing?: React.ReactNode }) {
  return (
    <div className="section-heading">
      <span className="step-index">{step}</span>
      <div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>
      {trailing ? <div className="heading-trailing">{trailing}</div> : null}
    </div>
  );
}

export default function Home() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState("gpt-5.4-mini");
  const [fileName, setFileName] = useState("");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoTooLong, setVideoTooLong] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [deathTimestamp, setDeathTimestamp] = useState(0);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [status, setStatus] = useState({ message: "録画を選ぶとレビューを開始できます。", tone: "neutral" as "neutral" | "success" | "error" });
  const [map, setMap] = useState("");
  const [agent, setAgent] = useState("");
  const [role, setRole] = useState("イニシエーター");
  const [side, setSide] = useState("攻め");
  const [round, setRound] = useState("");
  const [note, setNote] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    const loadSavedHistory = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
        if (Array.isArray(saved)) setHistoryItems(saved.slice(0, 50));
      } catch {
        localStorage.removeItem(HISTORY_KEY);
      }
    }, 0);
    return () => {
      window.clearTimeout(loadSavedHistory);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const matchContext = useMemo<MatchContext>(() => ({
    map,
    agent: agent.trim(),
    role,
    side,
    round,
    timestamp: formatTime(deathTimestamp),
    note: note.trim(),
    tags: selectedTags,
  }), [agent, deathTimestamp, map, note, role, round, selectedTags, side]);

  const saveHistory = useCallback((nextReview: Review, usedModel: string) => {
    const entry: HistoryEntry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString(),
      model: usedModel,
      metadata: matchContext,
      review: nextReview,
    };
    setHistoryItems((current) => {
      const next = [entry, ...current].slice(0, 50);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, [matchContext]);

  const loadVideo = useCallback((file?: File) => {
    if (!file) return;
    if (!isVideoFile(file)) {
      setStatus({ message: "MP4・WebM・MOVの動画を選んでください。", tone: "error" });
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setFileName(file.name);
    setDuration(0);
    setCurrentTime(0);
    setVideoReady(false);
    setVideoTooLong(false);
    setFrames([]);
    setReview(null);
    setCaptureProgress(0);
    setStatus({ message: "録画の情報を読み込んでいます…", tone: "neutral" });
    if (videoRef.current) { videoRef.current.src = url; videoRef.current.load(); }
  }, []);

  const captureFrames = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !videoReady || videoTooLong || isCapturing) return;
    video.pause();
    const markedAt = video.currentTime;
    const targets = CAPTURE_OFFSETS.map((offset) => ({ offset, time: Math.max(0, Math.min(markedAt + offset, video.duration - 0.05)) }))
      .filter((item, index, all) => all.findIndex((other) => Math.abs(other.time - item.time) < 0.25) === index);
    if (targets.length < 2) {
      setStatus({ message: "開始直後すぎます。少し進めてからデス地点を登録してください。", tone: "error" });
      return;
    }
    setIsCapturing(true);
    setFrames([]);
    setCaptureProgress(0);
    setStatus({ message: "デス直前の場面を端末内で切り出しています…", tone: "neutral" });
    try {
      const captured: Frame[] = [];
      for (let index = 0; index < targets.length; index += 1) {
        const item = targets[index];
        await waitForSeek(video, item.time);
        captured.push({
          time: item.time,
          label: item.offset === 0 ? "デス時点" : `デス${Math.abs(item.offset)}秒前`,
          dataUrl: frameDataUrl(video),
        });
        setCaptureProgress(Math.round(((index + 1) / targets.length) * 100));
      }
      setFrames(captured);
      setDeathTimestamp(markedAt);
      await waitForSeek(video, markedAt);
      setStatus({ message: `${captured.length}枚を取得しました。試合情報を足して解析できます。`, tone: "success" });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : "フレーム取得に失敗しました。", tone: "error" });
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, videoReady, videoTooLong]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (event.key.toLowerCase() === "m" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        event.preventDefault();
        void captureFrames();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [captureFrames]);

  const finishReview = useCallback((nextReview: Review, usedModel: string, message: string) => {
    setReview(nextReview);
    saveHistory(nextReview, usedModel);
    setStatus({ message, tone: "success" });
    window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }, [saveHistory]);

  const analyze = async () => {
    if (frames.length < 2) {
      setStatus({ message: "先にデス地点を登録してください。", tone: "error" });
      return;
    }
    if (!apiKey.trim()) {
      setSettingsOpen(true);
      setStatus({ message: "AI設定でOpenAI APIキーを入力してください。", tone: "error" });
      return;
    }
    setIsAnalyzing(true);
    setStatus({ message: "AIが5つの場面を時系列で確認しています…", tone: "neutral" });
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), model, metadata: matchContext, frames: frames.map(({ label, dataUrl }) => ({ label, dataUrl })) }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; review?: Review; model?: string };
      if (!response.ok || !data.ok || !data.review) throw new Error(data.error || "AI解析に失敗しました。");
      finishReview(data.review, data.model || model, "AIレビューが完了しました。");
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : "AI解析に失敗しました。", tone: "error" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  };

  const deleteHistory = (id: string) => {
    setHistoryItems((current) => {
      const next = current.filter((item) => item.id !== id);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  const clearHistory = () => {
    if (!historyItems.length || !window.confirm("保存したレビュー履歴をすべて消去しますか？")) return;
    setHistoryItems([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  const exportHistory = () => {
    if (!historyItems.length) {
      setStatus({ message: "書き出す履歴がありません。", tone: "error" });
      return;
    }
    const lines = ["# Radiant Review 反省メモ", ""];
    historyItems.forEach((entry, index) => {
      lines.push(
        `## ${index + 1}. ${entry.metadata.map || "Map未設定"} / ${entry.metadata.agent || entry.metadata.role}`,
        `- 日時: ${new Date(entry.createdAt).toLocaleString("ja-JP")}`,
        `- 攻守: ${entry.metadata.side || "未設定"}`,
        `- 動画時刻: ${entry.metadata.timestamp || "未設定"}`,
        `- 主な問題: ${entry.review.main_issue.category}`,
        `- 次の課題: ${entry.review.next_focus}`,
        "",
        ...entry.review.improvements.map((item) => `- ${item}`),
        "",
      );
    });
    downloadText(`radiant-review-${new Date().toISOString().slice(0, 10)}.md`, lines.join("\n"));
  };

  const reviewReady = frames.length >= 2;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#review" aria-label="Radiant Review ホーム">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span><strong>RADIANT REVIEW</strong><small>VALORANT VOD COACH</small></span>
        </a>
        <div className="top-actions">
          <span className="local-state"><ShieldCheck aria-hidden="true" /> 動画は端末内で処理</span>
          <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)} className="top-settings"><Settings2 /> AI設定</Button>
        </div>
      </header>

      <main id="review" className="main-content">
        <section className="intro-strip" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">BROWSER PROTOTYPE 0.1</p>
            <h1 id="page-title">1デスを、次のラウンドの武器に。</h1>
            <p className="intro-copy">60分の録画でも、選んだデス前後だけを端末内で切り出してレビューします。</p>
          </div>
          <div className="capability-row" aria-label="対応範囲">
            <span><Clock3 /> 最大60分</span><span><MonitorUp /> 1080p / 60fps</span><span><Film /> MP4・WebM・MOV</span>
          </div>
        </section>

        <section className="pipeline" aria-label="処理の流れ">
          <div><span className="pipeline-icon"><Play /></span><p><small>01 / LOCAL</small><strong>録画を再生</strong></p></div>
          <div><span className="pipeline-icon"><Crosshair /></span><p><small>02 / CAPTURE</small><strong>デス地点を記録</strong></p></div>
          <div><span className="pipeline-icon"><BrainCircuit /></span><p><small>03 / REVIEW</small><strong>5枚だけAI解析</strong></p></div>
          <aside><Zap /> 動画全体は送信しません</aside>
        </section>

        <div className="workspace-grid">
          <div className="primary-column">
            <section className="panel video-panel">
              <SectionHeading
                step="01" eyebrow="LOAD LOCAL VOD" title="試合録画"
                trailing={<><input ref={fileInputRef} id="videoInput" type="file" accept="video/mp4,video/webm,video/quicktime,video/*" hidden onChange={(event) => loadVideo(event.target.files?.[0])} /><Button asChild className="upload-button"><label htmlFor="videoInput"><UploadCloud /> 動画を選択</label></Button></>}
              />
              <div
                className={`video-shell ${dragging ? "is-dragging" : ""}`}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); loadVideo(event.dataTransfer.files?.[0]); }}
              >
                <video
                  ref={videoRef} controls preload="metadata"
                  onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                  onLoadedMetadata={(event) => {
                    const nextDuration = event.currentTarget.duration;
                    setDuration(nextDuration);
                    setVideoReady(true);
                    const tooLong = nextDuration > MAX_VOD_SECONDS;
                    setVideoTooLong(tooLong);
                    setStatus(tooLong
                      ? { message: "V0.1は最大60分です。短く分割して読み込んでください。", tone: "error" }
                      : { message: "デス直後まで再生し、地点を記録してください。", tone: "success" });
                  }}
                  onError={() => setStatus({ message: "この動画を再生できません。MP4またはWebMをお試しください。", tone: "error" })}
                />
                {!fileName ? <button type="button" className="drop-zone" onClick={() => fileInputRef.current?.click()}><span className="drop-icon"><UploadCloud /></span><strong>録画をドロップ</strong><span>またはクリックして選択</span></button> : null}
                {fileName ? <Badge className="local-badge">LOCAL VOD</Badge> : null}
              </div>
              <div className="video-details">
                <div><small>FILE</small><strong title={fileName}>{fileName || "未選択"}</strong></div>
                <div><small>CURRENT</small><strong>{formatTime(currentTime)}</strong></div>
                <div><small>DURATION</small><strong>{duration ? formatTime(duration) : "--:--"}</strong></div>
              </div>
              <div className="capture-row">
                <Button type="button" size="lg" disabled={!videoReady || videoTooLong || isCapturing} onClick={() => void captureFrames()} className="capture-button">
                  {isCapturing ? <LoaderCircle className="spin" /> : <Crosshair />}{isCapturing ? "切り出し中…" : "この時刻をデス地点として記録"}
                </Button>
                <p>デス直後で停止して押す <kbd>M</kbd></p>
              </div>
              {isCapturing ? <div className="capture-progress"><Progress value={captureProgress} /><span>{captureProgress}%</span></div> : null}
            </section>

            <section className="panel frames-panel">
              <SectionHeading step="02" eyebrow="TIMELINE SAMPLES" title="解析フレーム" trailing={<Badge variant="outline">{frames.length} / 5</Badge>} />
              {frames.length ? (
                <div className="frame-grid">
                  {frames.map((frame) => (
                    <figure key={`${frame.time}-${frame.label}`}>
                      <img src={frame.dataUrl} alt={frame.label} />
                      <figcaption><span>{frame.label}</span><time>{formatTime(frame.time)}</time></figcaption>
                    </figure>
                  ))}
                </div>
              ) : <div className="empty-frames"><Target /><div><strong>まだ場面がありません</strong><span>デス地点を登録すると、18秒前から5枚並びます。</span></div></div>}
            </section>
          </div>

          <aside className="secondary-column">
            <section className="panel context-panel">
              <SectionHeading step="03" eyebrow="ADD CONTEXT" title="試合情報" />
              <div className="form-grid">
                <label><span>マップ</span><NativeSelect value={map} onChange={(event) => setMap(event.target.value)}><NativeSelectOption value="">選択</NativeSelectOption>{MAPS.map((item) => <NativeSelectOption key={item}>{item}</NativeSelectOption>)}</NativeSelect></label>
                <label><span>エージェント</span><Input value={agent} onChange={(event) => setAgent(event.target.value)} maxLength={40} placeholder="例：Sova" /></label>
                <label><span>ロール</span><NativeSelect value={role} onChange={(event) => setRole(event.target.value)}>{["イニシエーター", "デュエリスト", "コントローラー", "センチネル"].map((item) => <NativeSelectOption key={item}>{item}</NativeSelectOption>)}</NativeSelect></label>
                <label><span>攻守</span><NativeSelect value={side} onChange={(event) => setSide(event.target.value)}>{["攻め", "守り", "不明"].map((item) => <NativeSelectOption key={item}>{item}</NativeSelectOption>)}</NativeSelect></label>
                <label><span>ラウンド</span><Input value={round} onChange={(event) => setRound(event.target.value)} type="number" min="1" max="50" placeholder="例：7" /></label>
              </div>
              <fieldset className="tag-fieldset">
                <legend>自分で気になった点 <small>任意・複数</small></legend>
                <div className="tag-list">{TAGS.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return <Button key={tag} type="button" size="sm" variant="outline" aria-pressed={active} className={active ? "tag-active" : ""} onClick={() => toggleTag(tag)}>{active ? <CheckCircle2 /> : null}{tag}</Button>;
                })}</div>
              </fieldset>
              <label className="note-field"><span>補足メモ <small>任意</small></span><Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder="例：Aリテイク。味方のフラッシュを待てず先にピークした。" /></label>
              <div className={`status-line ${status.tone}`} role="status" aria-live="polite">
                {status.tone === "error" ? <AlertTriangle /> : status.tone === "success" ? <CheckCircle2 /> : <Clock3 />}<span>{status.message}</span>
              </div>
              <Button type="button" size="lg" disabled={!reviewReady || isAnalyzing} onClick={() => void analyze()} className="analyze-button">
                {isAnalyzing ? <LoaderCircle className="spin" /> : <Sparkles />}{isAnalyzing ? "AI解析中…" : "AIで解析する"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => finishReview(demoReview(selectedTags[0]), "demo", "デモレビューを表示しました。")} className="demo-button"><Play /> APIキーなしでデモを見る</Button>
              <p className="cost-note">AIへ送るのは最大5枚。料金は選択モデルとAPI利用量で変わります。</p>
            </section>

            <section className="panel result-panel" ref={resultRef}>
              <SectionHeading step="04" eyebrow="COACHING OUTPUT" title="今回のレビュー" trailing={review ? <Badge className={`confidence ${review.confidence}`}>確度 {review.confidence}</Badge> : undefined} />
              {review ? (
                <div className="review-content">
                  <p className="review-kicker">NEXT ROUND PRIORITY</p>
                  <h3>{review.headline}</h3>
                  <div className="focus-card"><Crosshair /><div><small>次の1試合で意識すること</small><strong>{review.next_focus}</strong></div></div>
                  <div className="issue-card"><div><span>主な問題</span><Badge variant="outline">{review.main_issue.category}</Badge></div><p>{review.main_issue.evidence}</p></div>
                  <div className="review-block"><h4>画面で確認できたこと</h4><ul>{review.observed.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  <div className="review-block"><h4>改善アクション</h4><ol>{review.improvements.map((item) => <li key={item}>{item}</li>)}</ol></div>
                  <p className="uncertainty"><AlertTriangle />{review.uncertainty}</p>
                </div>
              ) : <div className="empty-result"><span><BrainCircuit /></span><strong>レビュー待ち</strong><p>5枚の時系列から、事実・問題・改善行動を分けて整理します。</p></div>}
            </section>
          </aside>
        </div>

        <section className="panel history-panel">
          <SectionHeading step="05" eyebrow="TRAINING LOG" title="レビュー履歴" trailing={<div className="history-actions"><Button type="button" size="sm" variant="outline" onClick={exportHistory}><Download /> 書き出す</Button><Button type="button" size="sm" variant="ghost" onClick={clearHistory}><Trash2 /> 全消去</Button></div>} />
          {historyItems.length ? (
            <div className="history-list">{historyItems.map((entry) => (
              <article key={entry.id} className="history-item">
                <time>{new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.createdAt))}</time>
                <div><strong>{entry.metadata.map || "Map未設定"} / {entry.metadata.agent || entry.metadata.role}</strong><span>{entry.metadata.timestamp}・{entry.review.main_issue.category}</span></div>
                <p>{entry.review.next_focus}</p>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="この履歴を削除" onClick={() => deleteHistory(entry.id)}><Trash2 /></Button>
              </article>
            ))}</div>
          ) : <div className="empty-history"><History /><span>解析結果はこのブラウザに最大50件保存されます。</span></div>}
        </section>

        <footer><span><ShieldCheck /> 試合後レビュー専用</span><p>ゲームへの接続・操作・リアルタイム情報の取得は行いません。AIの提案はVOD確認と組み合わせて判断してください。</p></footer>
      </main>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="settings-dialog">
          <DialogHeader><p className="eyebrow">AI CONNECTION</p><DialogTitle>AI設定</DialogTitle><DialogDescription>APIキーはブラウザのメモリだけに保持し、保存しません。解析時はこのサイトの中継処理を通してOpenAIへ送られます。</DialogDescription></DialogHeader>
          <div className="settings-fields">
            <label htmlFor="apiKey"><span>OpenAI APIキー</span></label>
            <div className="key-field"><KeyRound /><Input id="apiKey" type={showKey ? "text" : "password"} value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="sk-..." autoComplete="off" spellCheck={false} /><Button type="button" variant="ghost" size="icon-sm" aria-label={showKey ? "APIキーを隠す" : "APIキーを表示"} onClick={() => setShowKey((current) => !current)}>{showKey ? <EyeOff /> : <Eye />}</Button></div>
            <label htmlFor="model"><span>解析モデル</span></label>
            <NativeSelect id="model" value={model} onChange={(event) => setModel(event.target.value)}><NativeSelectOption value="gpt-5.4-mini">GPT-5.4 Mini（推奨・低コスト）</NativeSelectOption><NativeSelectOption value="gpt-5.6">GPT-5.6（高精度）</NativeSelectOption></NativeSelect>
          </div>
          <div className="privacy-box"><ShieldCheck /><div><strong>送信するのは最大5枚</strong><p>動画ファイル全体は送らず、切り出した圧縮画像・試合情報・APIキーだけを解析時に送ります。</p></div></div>
          <div className="dialog-actions"><Button type="button" variant="outline" onClick={() => { setApiKey(""); setShowKey(false); }}><RotateCcw /> キーを消去</Button><Button type="button" onClick={() => setSettingsOpen(false)}>設定を閉じる</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
