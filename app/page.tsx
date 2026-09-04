"use client";

/* eslint-disable @next/next/no-img-element */

import {
  Activity,
  AlertTriangle,
  BarChart3,
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
  MapPinned,
  MonitorUp,
  Play,
  RotateCcw,
  ScanLine,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trash2,
  UploadCloud,
  UsersRound,
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
import {
  type DeathCandidate,
  type DeathDetectionSample,
  extractDeathCandidates,
  measureDeathFrame,
} from "@/lib/death-detection";

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
  matchId?: string;
  fileName?: string;
  deathSource?: "auto" | "manual";
  metadata: MatchContext;
  review: Review;
};

const HISTORY_KEY = "radiant-review-web-history-v1";
const MAX_VOD_SECONDS = 60 * 60;
const CAPTURE_OFFSETS = [-20, -12, -6, 0, 5];
const AUTO_SCAN_SAMPLE_SECONDS = 0.75;
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

function frameLabel(offset: number) {
  if (offset === 0) return "デス時点";
  return offset < 0 ? `デス${Math.abs(offset)}秒前` : `デス${offset}秒後`;
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

function waitForVideoData(video: HTMLVideoElement) {
  return new Promise<void>((resolve, reject) => {
    if (video.readyState >= 2 && Number.isFinite(video.duration)) {
      resolve();
      return;
    }
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("自動検出用の動画を読み込めませんでした。"));
    }, 12_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("loadeddata", onLoaded);
      video.removeEventListener("error", onError);
    };
    const onLoaded = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error("自動検出用の動画を読み込めませんでした。")); };
    video.addEventListener("loadeddata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
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
  const reviewEndRef = useRef<number | null>(null);
  const scanRunRef = useRef(0);
  const autoScannedUrlRef = useRef<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState("gpt-5.6-luna");
  const [fileName, setFileName] = useState("");
  const [matchId, setMatchId] = useState("");
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [videoTooLong, setVideoTooLong] = useState(false);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [deathTimestamp, setDeathTimestamp] = useState(0);
  const [deathSource, setDeathSource] = useState<"auto" | "manual">("auto");
  const [deathCandidates, setDeathCandidates] = useState<DeathCandidate[]>([]);
  const [selectedDeathId, setSelectedDeathId] = useState("");
  const [isDetectingDeaths, setIsDetectingDeaths] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState(0);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isReviewPlaying, setIsReviewPlaying] = useState(false);
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
      scanRunRef.current += 1;
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
      matchId,
      fileName,
      deathSource,
      metadata: matchContext,
      review: nextReview,
    };
    setHistoryItems((current) => {
      const next = [entry, ...current].slice(0, 50);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, [deathSource, fileName, matchContext, matchId]);

  const loadVideo = useCallback((file?: File) => {
    if (!file) return;
    if (!isVideoFile(file)) {
      setStatus({ message: "MP4・WebM・MOVの動画を選んでください。", tone: "error" });
      return;
    }
    scanRunRef.current += 1;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    autoScannedUrlRef.current = null;
    setFileName(file.name);
    setMatchId(`${file.name}:${file.size}:${file.lastModified}`);
    setDuration(0);
    setCurrentTime(0);
    setVideoReady(false);
    setVideoTooLong(false);
    setFrames([]);
    setDeathCandidates([]);
    setSelectedDeathId("");
    setDetectionProgress(0);
    setIsDetectingDeaths(false);
    setReview(null);
    reviewEndRef.current = null;
    setIsReviewPlaying(false);
    setCaptureProgress(0);
    setStatus({ message: "録画の情報を読み込んでいます…", tone: "neutral" });
    if (videoRef.current) { videoRef.current.src = url; videoRef.current.load(); }
  }, []);

  const captureFramesAt = useCallback(async (markedAt: number, source: "auto" | "manual") => {
    const video = videoRef.current;
    if (!video || !videoReady || videoTooLong || isCapturing) return;
    video.pause();
    const targets = CAPTURE_OFFSETS.map((offset) => ({ offset, time: Math.max(0, Math.min(markedAt + offset, video.duration - 0.05)) }))
      .filter((item, index, all) => all.findIndex((other) => Math.abs(other.time - item.time) < 0.25) === index);
    if (targets.length < 2) {
      setStatus({ message: "開始直後すぎるため、この候補は切り出せません。", tone: "error" });
      return;
    }
    setIsCapturing(true);
    setDeathSource(source);
    setFrames([]);
    setCaptureProgress(0);
    setStatus({ message: source === "auto" ? "自動検出したデスの前後を切り出しています…" : "現在時刻の前後を切り出しています…", tone: "neutral" });
    try {
      const captured: Frame[] = [];
      for (let index = 0; index < targets.length; index += 1) {
        const item = targets[index];
        await waitForSeek(video, item.time);
        captured.push({
          time: item.time,
          label: frameLabel(Math.round(item.time - markedAt)),
          dataUrl: frameDataUrl(video),
        });
        setCaptureProgress(Math.round(((index + 1) / targets.length) * 100));
      }
      setFrames(captured);
      setDeathTimestamp(markedAt);
      await waitForSeek(video, markedAt);
      setStatus({ message: `${formatTime(markedAt)}の${captured.length}枚を取得しました。確認して解析できます。`, tone: "success" });
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : "フレーム取得に失敗しました。", tone: "error" });
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, videoReady, videoTooLong]);

  const captureFrames = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setSelectedDeathId("");
    await captureFramesAt(video.currentTime, "manual");
  }, [captureFramesAt]);

  const detectDeaths = useCallback(async () => {
    const sourceUrl = objectUrlRef.current;
    if (!sourceUrl || !videoReady || videoTooLong || !duration || isDetectingDeaths) return;
    const runId = scanRunRef.current + 1;
    scanRunRef.current = runId;
    const scanVideo = document.createElement("video");
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) {
      setStatus({ message: "ブラウザの映像解析機能を開始できませんでした。", tone: "error" });
      return;
    }

    setIsDetectingDeaths(true);
    setDetectionProgress(0);
    setDeathCandidates([]);
    setSelectedDeathId("");
    setFrames([]);
    setStatus({ message: "録画を端末内で高速再生し、デス画面を自動検出しています…", tone: "neutral" });

    scanVideo.src = sourceUrl;
    scanVideo.muted = true;
    scanVideo.playsInline = true;
    scanVideo.preload = "auto";
    scanVideo.setAttribute("aria-hidden", "true");
    Object.assign(scanVideo.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: "320px",
      height: "180px",
      pointerEvents: "none",
    });
    document.body.appendChild(scanVideo);

    const samples: DeathDetectionSample[] = [];
    let lastSampleAt = -AUTO_SCAN_SAMPLE_SECONDS;
    let lastProgress = -1;
    const recordSample = (mediaTime: number) => {
      if (runId !== scanRunRef.current || mediaTime - lastSampleAt < AUTO_SCAN_SAMPLE_SECONDS) return;
      lastSampleAt = mediaTime;
      context.drawImage(scanVideo, 0, 0, canvas.width, canvas.height);
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const signal = measureDeathFrame(image.data, canvas.width, canvas.height);
      samples.push({ time: mediaTime, ...signal });
      const progress = Math.min(99, Math.round((mediaTime / duration) * 100));
      if (progress >= lastProgress + 1) {
        lastProgress = progress;
        setDetectionProgress(progress);
      }
    };

    try {
      await waitForVideoData(scanVideo);
      try {
        scanVideo.playbackRate = 16;
        scanVideo.defaultPlaybackRate = 16;
      } catch {
        scanVideo.playbackRate = 4;
        scanVideo.defaultPlaybackRate = 4;
      }
      if ("preservesPitch" in scanVideo) scanVideo.preservesPitch = false;

      await new Promise<void>((resolve, reject) => {
        let finished = false;
        let frameRequest = 0;
        let pollTimer = 0;
        const timeout = window.setTimeout(() => finish(new Error("自動検出に時間がかかりすぎています。再検出をお試しください。")), Math.max(120_000, (duration / 8) * 1000 + 120_000));
        const cleanup = () => {
          window.clearTimeout(timeout);
          if (pollTimer) window.clearInterval(pollTimer);
          if (frameRequest && typeof scanVideo.cancelVideoFrameCallback === "function") scanVideo.cancelVideoFrameCallback(frameRequest);
          scanVideo.removeEventListener("ended", onEnded);
          scanVideo.removeEventListener("error", onError);
        };
        function finish(error?: Error) {
          if (finished) return;
          finished = true;
          cleanup();
          if (error) reject(error);
          else resolve();
        }
        const onEnded = () => {
          recordSample(Math.min(duration, scanVideo.currentTime));
          finish();
        };
        const onError = () => finish(new Error("動画の高速走査中に読み取りエラーが発生しました。"));
        const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
          if (runId !== scanRunRef.current) {
            finish();
            return;
          }
          recordSample(metadata.mediaTime);
          if (scanVideo.ended || scanVideo.currentTime >= duration - 0.05) finish();
          else frameRequest = scanVideo.requestVideoFrameCallback(onFrame);
        };

        scanVideo.addEventListener("ended", onEnded, { once: true });
        scanVideo.addEventListener("error", onError, { once: true });
        if (typeof scanVideo.requestVideoFrameCallback === "function") {
          frameRequest = scanVideo.requestVideoFrameCallback(onFrame);
        } else {
          pollTimer = window.setInterval(() => {
            if (runId !== scanRunRef.current) finish();
            else recordSample(scanVideo.currentTime);
          }, 55);
        }
        void scanVideo.play().catch(() => finish(new Error("自動検出を開始できませんでした。再検出ボタンを押してください。")));
      });

      if (runId !== scanRunRef.current) return;
      const candidates = extractDeathCandidates(samples, duration);
      setDetectionProgress(100);
      setDeathCandidates(candidates);
      if (!candidates.length) {
        setStatus({ message: "デス候補を見つけられませんでした。HUD表示を確認するか、現在時刻を追加してください。", tone: "error" });
        return;
      }
      setSelectedDeathId(candidates[0].id);
      setStatus({ message: `${candidates.length}件のデス候補を自動検出しました。最初の候補を準備しています…`, tone: "success" });
      await captureFramesAt(candidates[0].time, "auto");
    } catch (error) {
      if (runId === scanRunRef.current) {
        setStatus({ message: error instanceof Error ? error.message : "デスの自動検出に失敗しました。", tone: "error" });
      }
    } finally {
      scanVideo.pause();
      scanVideo.removeAttribute("src");
      scanVideo.load();
      scanVideo.remove();
      if (runId === scanRunRef.current) setIsDetectingDeaths(false);
    }
  }, [captureFramesAt, duration, isDetectingDeaths, videoReady, videoTooLong]);

  useEffect(() => {
    const sourceUrl = objectUrlRef.current;
    if (!sourceUrl || !videoReady || videoTooLong || !duration || autoScannedUrlRef.current === sourceUrl) return;
    autoScannedUrlRef.current = sourceUrl;
    const timer = window.setTimeout(() => void detectDeaths(), 80);
    return () => window.clearTimeout(timer);
  }, [detectDeaths, duration, videoReady, videoTooLong]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (event.key.toLowerCase() === "d" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        event.preventDefault();
        void captureFrames();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [captureFrames]);

  const playReviewWindow = useCallback(async () => {
    const video = videoRef.current;
    if (!video || frames.length < 2 || !duration) return;
    const start = Math.max(0, deathTimestamp - 20);
    reviewEndRef.current = Math.min(duration, deathTimestamp + 5);
    video.currentTime = start;
    setIsReviewPlaying(true);
    try {
      await video.play();
      setStatus({ message: "デス前20秒からデス後5秒まで再生しています。", tone: "neutral" });
    } catch {
      reviewEndRef.current = null;
      setIsReviewPlaying(false);
      setStatus({ message: "再生を開始できませんでした。動画の再生ボタンをお試しください。", tone: "error" });
    }
  }, [deathTimestamp, duration, frames.length]);

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

  const chooseDeathCandidate = useCallback(async (candidate: DeathCandidate) => {
    if (isCapturing || isDetectingDeaths) return;
    setSelectedDeathId(candidate.id);
    await captureFramesAt(candidate.time, "auto");
  }, [captureFramesAt, isCapturing, isDetectingDeaths]);

  const climbInsights = useMemo(() => {
    const severityValue = { low: 1, medium: 2, high: 3 } as const;
    const rankedDimension = (selector: (entry: HistoryEntry) => string) => {
      const groups = new Map<string, { count: number; total: number }>();
      historyItems.forEach((entry) => {
        const label = selector(entry).trim();
        if (!label) return;
        const current = groups.get(label) || { count: 0, total: 0 };
        current.count += 1;
        current.total += severityValue[entry.review.main_issue.severity];
        groups.set(label, current);
      });
      return [...groups.entries()]
        .map(([label, value]) => ({ label, count: value.count, average: value.total / value.count }))
        .sort((a, b) => b.average - a.average || b.count - a.count)[0] || null;
    };

    const matchGroups = new Map<string, { label: string; createdAt: string; entries: HistoryEntry[] }>();
    historyItems.forEach((entry) => {
      const key = entry.matchId || `${entry.createdAt.slice(0, 10)}:${entry.metadata.map}:${entry.metadata.agent || entry.metadata.role}`;
      const current = matchGroups.get(key) || {
        label: entry.fileName?.replace(/\.[^.]+$/, "") || `${entry.metadata.map || "Map未設定"} / ${entry.metadata.agent || entry.metadata.role}`,
        createdAt: entry.createdAt,
        entries: [],
      };
      current.entries.push(entry);
      if (entry.createdAt > current.createdAt) current.createdAt = entry.createdAt;
      matchGroups.set(key, current);
    });
    const matches = [...matchGroups.values()]
      .map((group) => {
        const categoryCounts = new Map<string, number>();
        let severityTotal = 0;
        group.entries.forEach((entry) => {
          const category = entry.review.main_issue.category;
          categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
          severityTotal += severityValue[entry.review.main_issue.severity];
        });
        const topIssue = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
        return {
          ...group,
          topIssue,
          average: severityTotal / Math.max(1, group.entries.length),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const categoryCounts = new Map<string, number>();
    historyItems.forEach((entry) => {
      const category = entry.review.main_issue.category;
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    });
    const reasons = [...categoryCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const reasonMax = Math.max(1, ...reasons.map((reason) => reason.count));

    const averageSeverity = (entries: HistoryEntry[]) => entries.reduce(
      (total, entry) => total + severityValue[entry.review.main_issue.severity],
      0,
    ) / Math.max(1, entries.length);
    const recent = historyItems.slice(0, 5);
    const previous = historyItems.slice(5, 10);
    const trend = recent.length >= 3 && previous.length >= 3
      ? averageSeverity(recent) - averageSeverity(previous)
      : null;
    const latest = historyItems[0] || null;
    const comparable = latest
      ? historyItems.slice(1).find((entry) => (
        entry.metadata.map === latest.metadata.map
        && (entry.metadata.agent || entry.metadata.role) === (latest.metadata.agent || latest.metadata.role)
      )) || historyItems[1] || null
      : null;

    return {
      matches,
      weakMap: rankedDimension((entry) => entry.metadata.map),
      weakAgent: rankedDimension((entry) => entry.metadata.agent || entry.metadata.role),
      reasons: reasons.map((reason) => ({ ...reason, percentage: Math.round((reason.count / reasonMax) * 100) })),
      trend,
      latest,
      comparable,
    };
  }, [historyItems]);

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
            <p className="eyebrow">BROWSER PROTOTYPE 0.2</p>
            <h1 id="page-title">1デスを、次のラウンドの武器に。</h1>
            <p className="intro-copy">録画を選ぶだけ。ブラウザがデス候補を自動検出し、前20秒〜後5秒を切り出します。</p>
          </div>
          <div className="capability-row" aria-label="対応範囲">
            <span><Clock3 /> 最大60分</span><span><MonitorUp /> 1080p / 60fps</span><span><Film /> MP4・WebM・MOV</span>
          </div>
        </section>

        <section className="pipeline" aria-label="処理の流れ">
          <div><span className="pipeline-icon"><Play /></span><p><small>01 / LOCAL</small><strong>録画を選択</strong></p></div>
          <div><span className="pipeline-icon"><ScanLine /></span><p><small>02 / AUTO DETECT</small><strong>デスを自動検出</strong></p></div>
          <div><span className="pipeline-icon"><BrainCircuit /></span><p><small>03 / REVIEW</small><strong>前20秒〜後5秒を解析</strong></p></div>
          <aside><Zap /> 自動検出は追加API料金なし</aside>
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
                  onTimeUpdate={(event) => {
                    const video = event.currentTarget;
                    setCurrentTime(video.currentTime);
                    if (reviewEndRef.current !== null && video.currentTime >= reviewEndRef.current - 0.05) {
                      reviewEndRef.current = null;
                      video.pause();
                      video.currentTime = deathTimestamp;
                      setIsReviewPlaying(false);
                      setStatus({ message: "25秒の確認が終わりました。気になった点を選んで解析できます。", tone: "success" });
                    }
                  }}
                  onPause={() => {
                    if (reviewEndRef.current !== null) {
                      reviewEndRef.current = null;
                      setIsReviewPlaying(false);
                    }
                  }}
                  onLoadedMetadata={(event) => {
                    const nextDuration = event.currentTarget.duration;
                    setDuration(nextDuration);
                    setVideoReady(true);
                    const tooLong = nextDuration > MAX_VOD_SECONDS;
                    setVideoTooLong(tooLong);
                    setStatus(tooLong
                      ? { message: "試作版は最大60分です。短く分割して読み込んでください。", tone: "error" }
                      : { message: "録画を読み込みました。デス地点の自動検出を開始します。", tone: "success" });
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
              <div className="auto-detect-card">
                <div className="auto-detect-summary">
                  <span className="scan-icon"><ScanLine /></span>
                  <div><span><Badge>CLIMB</Badge> ローカル検出</span><strong>デス地点を自動検出</strong><p>録画だけを高速走査します。動画の送信・追加API料金はありません。</p></div>
                </div>
                <Button type="button" variant="outline" disabled={!videoReady || videoTooLong || isDetectingDeaths || isCapturing} onClick={() => void detectDeaths()}>
                  {isDetectingDeaths ? <LoaderCircle className="spin" /> : <ScanLine />}{isDetectingDeaths ? "検出中…" : deathCandidates.length ? "再検出" : "自動検出"}
                </Button>
              </div>
              {isDetectingDeaths ? <div className="detection-progress"><Progress value={detectionProgress} /><span>{detectionProgress}%</span><small>60分の録画は数分かかる場合があります</small></div> : null}
              {deathCandidates.length ? (
                <div className="death-candidates" aria-label="自動検出したデス候補">
                  <div className="candidate-label"><strong>{deathCandidates.length}件検出</strong><span>選ぶと前後25秒を自動で準備</span></div>
                  <div className="candidate-list">
                    {deathCandidates.map((candidate, index) => (
                      <button
                        key={candidate.id}
                        type="button"
                        className={selectedDeathId === candidate.id ? "selected" : ""}
                        aria-pressed={selectedDeathId === candidate.id}
                        disabled={isCapturing || isDetectingDeaths}
                        onClick={() => void chooseDeathCandidate(candidate)}
                      >
                        <small>DEATH {String(index + 1).padStart(2, "0")}</small>
                        <strong>{formatTime(candidate.time)}</strong>
                        <span className={`candidate-confidence ${candidate.confidence}`}>{candidate.confidence === "high" ? "高確度" : candidate.confidence === "medium" ? "中確度" : "要確認"}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="manual-fallback">
                <p>検出漏れのときだけ、デス直後で追加 <kbd>D</kbd></p>
                <Button type="button" variant="ghost" disabled={!videoReady || videoTooLong || isDetectingDeaths || isCapturing} onClick={() => void captureFrames()}>
                  <Crosshair /> 現在時刻を追加
                </Button>
              </div>
              {isCapturing ? <div className="capture-progress"><Progress value={captureProgress} /><span>{captureProgress}%</span></div> : null}
              {reviewReady ? (
                <div className="review-window-row">
                  <Button type="button" variant="outline" disabled={isCapturing || isReviewPlaying} onClick={() => void playReviewWindow()}>
                    <Play /> {isReviewPlaying ? "25秒を再生中…" : "デス前20秒〜後5秒を再生"}
                  </Button>
                  <span>{deathSource === "auto" ? "自動検出" : "手動追加"} {formatTime(deathTimestamp)}</span>
                </div>
              ) : null}
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
              ) : <div className="empty-frames"><Target /><div><strong>{isDetectingDeaths ? "デスを探しています" : "まだ場面がありません"}</strong><span>{isDetectingDeaths ? "検出後、最初のデス前20秒〜後5秒が自動で並びます。" : "録画を選ぶとデス地点を自動検出します。"}</span></div></div>}
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

        <section className="panel climb-panel">
          <SectionHeading
            step="06"
            eyebrow="CLIMB INSIGHTS"
            title="成長ダッシュボード"
            trailing={<Badge variant="outline" className="local-insight-badge"><ShieldCheck /> 追加API料金なし</Badge>}
          />
          <div className="climb-grid">
            <article className="insight-card match-comparison">
              <div className="insight-title"><BarChart3 /><div><small>MATCH COMPARISON</small><h3>複数試合比較</h3></div><Badge variant="outline">{climbInsights.matches.length}試合</Badge></div>
              {climbInsights.matches.length ? (
                <div className="match-compare-list">
                  {climbInsights.matches.slice(0, 4).map((match) => (
                    <div key={`${match.createdAt}-${match.label}`}>
                      <time>{new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(new Date(match.createdAt))}</time>
                      <span><strong>{match.label}</strong><small>{match.entries.length}デス・最多 {match.topIssue}</small></span>
                      <b className={match.average >= 2.5 ? "risk-high" : match.average >= 1.7 ? "risk-medium" : "risk-low"}>負荷 {match.average.toFixed(1)}</b>
                    </div>
                  ))}
                </div>
              ) : <p className="insight-empty">2試合以上レビューすると、試合ごとの課題を並べて比較できます。</p>}
            </article>

            <article className="insight-card weakness-card">
              <div className="insight-title"><MapPinned /><div><small>WEAKNESS</small><h3>苦手マップ・エージェント</h3></div></div>
              <div className="weakness-pairs">
                <div><span><MapPinned /> 苦手マップ</span><strong>{climbInsights.weakMap?.label || "データ待ち"}</strong><small>{climbInsights.weakMap ? `${climbInsights.weakMap.count}件・負荷 ${climbInsights.weakMap.average.toFixed(1)}` : "マップを設定して解析"}</small></div>
                <div><span><UsersRound /> 苦手エージェント</span><strong>{climbInsights.weakAgent?.label || "データ待ち"}</strong><small>{climbInsights.weakAgent ? `${climbInsights.weakAgent.count}件・負荷 ${climbInsights.weakAgent.average.toFixed(1)}` : "エージェントを設定して解析"}</small></div>
              </div>
            </article>

            <article className="insight-card reason-card">
              <div className="insight-title"><Activity /><div><small>DEATH CAUSES</small><h3>デス原因</h3></div></div>
              {climbInsights.reasons.length ? (
                <div className="reason-list">
                  {climbInsights.reasons.map((reason) => (
                    <div key={reason.label}><span><b>{reason.label}</b><small>{reason.count}件</small></span><i><em style={{ width: `${reason.percentage}%` }} /></i></div>
                  ))}
                </div>
              ) : <p className="insight-empty">解析したデスの原因を自動で分類し、偏りを表示します。</p>}
            </article>

            <article className="insight-card trend-card">
              <div className="insight-title"><TrendingUp /><div><small>REVIEW TREND</small><h3>反省点の推移・過去比較</h3></div></div>
              <div className="trend-summary">
                {climbInsights.trend === null ? <span className="trend-wait"><Activity /> 6件以上で直近5件と前5件を比較</span> : climbInsights.trend <= 0 ? <span className="trend-good"><TrendingDown /> 課題負荷が {Math.abs(climbInsights.trend).toFixed(1)} 改善</span> : <span className="trend-alert"><TrendingUp /> 課題負荷が {climbInsights.trend.toFixed(1)} 上昇</span>}
              </div>
              {climbInsights.latest ? (
                <div className="report-compare">
                  <div><small>今回</small><p>{climbInsights.latest.review.next_focus}</p></div>
                  <div><small>過去</small><p>{climbInsights.comparable?.review.next_focus || "同条件の過去レポートはまだありません。"}</p></div>
                </div>
              ) : <p className="insight-empty">レポートが増えると、以前の課題と今回の変化を比較できます。</p>}
            </article>
          </div>
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
            <NativeSelect id="model" value={model} onChange={(event) => setModel(event.target.value)}><NativeSelectOption value="gpt-5.6-luna">GPT-5.6 Luna（推奨・低コスト）</NativeSelectOption><NativeSelectOption value="gpt-5.6-sol">GPT-5.6 Sol（高精度）</NativeSelectOption></NativeSelect>
          </div>
          <div className="privacy-box"><ShieldCheck /><div><strong>送信するのは最大5枚</strong><p>動画ファイル全体は送らず、切り出した圧縮画像・試合情報・APIキーだけを解析時に送ります。</p></div></div>
          <div className="dialog-actions"><Button type="button" variant="outline" onClick={() => { setApiKey(""); setShowKey(false); }}><RotateCcw /> キーを消去</Button><Button type="button" onClick={() => setSettingsOpen(false)}>設定を閉じる</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
