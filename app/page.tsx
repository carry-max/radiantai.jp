"use client";

/* eslint-disable @next/next/no-img-element */

import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  BrainCircuit,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
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
  QrCode,
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
  Wallet,
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
import { MonthlyMissions } from "@/components/monthly-missions";
import { fingerprintRecording, monthlyPhase, type MonthlySummary } from "@/lib/monthly-missions";
import {
  type DeathCandidate,
  type DeathDetectionSample,
  extractDeathCandidates,
  measureDeathFrame,
} from "@/lib/death-detection";

type Frame = { label: string; time: number; dataUrl: string };

type MissionCheckStatus = "cleared" | "improving" | "not_cleared" | "insufficient" | "not_applicable";

type MissionCheck = {
  status: MissionCheckStatus;
  evidence: string;
  confidence: "low" | "medium" | "high";
};

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
  mission_check?: MissionCheck;
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

type GrowthMission = {
  id: string;
  text: string;
  createdAt: string;
  sourceMatchId: string;
  checkedMatchIds: string[];
};

type GrowthCheck = MissionCheck & {
  mission: string;
  checkedAt: string;
  matchId: string;
  xpGained: number;
};

type GrowthProgress = {
  totalXp: number;
  activeMission: GrowthMission | null;
  lastCheck: GrowthCheck | null;
};

type BillingPlan =
  | "card_monthly"
  | "paypay_30day"
  | "climb_card_monthly"
  | "climb_paypay_30day";

type BillingEntitlement = {
  plan: BillingPlan;
  status: "active" | "inactive";
  startsAt: string;
  endsAt: string;
  remainingDays: number;
};

const HISTORY_KEY = "radiant-review-web-history-v1";
const GROWTH_KEY = "radiant-review-web-growth-v1";
const XP_PER_CLEAR = 50;
const XP_PER_LEVEL = 100;
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
    mission_check: {
      status: "not_applicable",
      evidence: "デモでは前回ミッションの達成判定を行いません。",
      confidence: "low",
    },
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
  const recordingFileRef = useRef<File | null>(null);
  const analysisRunRef = useRef(0);
  const monthlyReadRef = useRef(0);
  const reviewEndRef = useRef<number | null>(null);
  const scanRunRef = useRef(0);
  const autoScannedUrlRef = useRef<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [billingConfigured, setBillingConfigured] = useState(false);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<BillingPlan | null>(null);
  const [entitlement, setEntitlement] = useState<BillingEntitlement | null>(null);
  const [billingNotice, setBillingNotice] = useState<{ message: string; tone: "neutral" | "success" | "error" } | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState("gpt-5.6-luna");
  const [fileName, setFileName] = useState("");
  const [matchId, setMatchId] = useState("");
  const [recordingId, setRecordingId] = useState("");
  const [monthly, setMonthly] = useState<MonthlySummary | null>(null);
  const [monthlyLoading, setMonthlyLoading] = useState(true);
  const [monthlyError, setMonthlyError] = useState("");
  const [monthlyNotice, setMonthlyNotice] = useState("");
  const [renewMonthly, setRenewMonthly] = useState(false);
  const [clock, setClock] = useState(0);
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
  const [growthProgress, setGrowthProgress] = useState<GrowthProgress>({
    totalXp: 0,
    activeMission: null,
    lastCheck: null,
  });

  const reloadMonthly = useCallback(async () => {
    const readId = ++monthlyReadRef.current;
    setMonthlyLoading(true);
    setMonthlyError("");
    try {
      const response = await fetch("/api/missions", { cache: "no-store" });
      const data = await response.json() as MonthlySummary & { error?: string };
      if (readId !== monthlyReadRef.current) return;
      if (!response.ok) throw new Error(data.error || "月間ミッションを読み込めませんでした。");
      setMonthly(data);
      setClock(Date.parse(data.serverNow));
    } catch (error) {
      if (readId === monthlyReadRef.current) setMonthlyError(error instanceof Error ? error.message : "月間ミッションを読み込めませんでした。");
    } finally { if (readId === monthlyReadRef.current) setMonthlyLoading(false); }
  }, []);

  useEffect(() => {
    const start = window.setTimeout(() => void reloadMonthly(), 0);
    const tick = window.setInterval(() => setClock((current) => current + 60_000), 60_000);
    const refresh = () => { if (document.visibilityState === "visible") void reloadMonthly(); };
    document.addEventListener("visibilitychange", refresh);
    return () => { window.clearTimeout(start); window.clearInterval(tick); document.removeEventListener("visibilitychange", refresh); };
  }, [reloadMonthly]);

  useEffect(() => {
    const loadSavedHistory = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
        if (Array.isArray(saved)) setHistoryItems(saved.slice(0, 50));
      } catch {
        localStorage.removeItem(HISTORY_KEY);
      }
      try {
        const savedGrowth = JSON.parse(localStorage.getItem(GROWTH_KEY) || "null") as Partial<GrowthProgress> | null;
        if (savedGrowth && Number.isFinite(savedGrowth.totalXp) && savedGrowth.totalXp! >= 0) {
          const mission = savedGrowth.activeMission;
          setGrowthProgress({
            totalXp: Math.floor(savedGrowth.totalXp!),
            activeMission: mission && typeof mission.text === "string" && typeof mission.sourceMatchId === "string"
              ? {
                id: typeof mission.id === "string" ? mission.id : `${Date.now()}-mission`,
                text: mission.text,
                createdAt: typeof mission.createdAt === "string" ? mission.createdAt : new Date().toISOString(),
                sourceMatchId: mission.sourceMatchId,
                checkedMatchIds: Array.isArray(mission.checkedMatchIds) ? mission.checkedMatchIds.filter((item): item is string => typeof item === "string").slice(-20) : [],
              }
              : null,
            lastCheck: savedGrowth.lastCheck && typeof savedGrowth.lastCheck.mission === "string"
              ? savedGrowth.lastCheck as GrowthCheck
              : null,
          });
        }
      } catch {
        localStorage.removeItem(GROWTH_KEY);
      }
    }, 0);
    return () => {
      window.clearTimeout(loadSavedHistory);
      scanRunRef.current += 1;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const loadBilling = async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const checkoutState = params.get("checkout");
        const sessionId = params.get("session_id");
        if (checkoutState === "success" && sessionId) {
          setPricingOpen(true);
          setBillingNotice({ message: "支払い結果を確認しています…", tone: "neutral" });
          const response = await fetch("/api/billing/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionId }),
          });
          const result = (await response.json()) as { state?: string; entitlement?: BillingEntitlement | null; error?: string };
          if (!response.ok && response.status !== 202) throw new Error(result.error || "支払い結果を確認できませんでした。");
          if (active) {
            setEntitlement(result.entitlement || null);
            setBillingNotice(result.state === "processing"
              ? { message: "PayPayの支払い処理中です。完了後に自動で利用可能になります。", tone: "neutral" }
              : { message: "支払いを確認しました。Climbの利用期間を反映しました。", tone: "success" });
          }
        } else if (checkoutState === "cancelled") {
          setPricingOpen(true);
          setBillingNotice({ message: "購入はキャンセルされました。料金は発生していません。", tone: "neutral" });
        }

        if (checkoutState) {
          params.delete("checkout");
          params.delete("session_id");
          const query = params.toString();
          window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
        }

        const response = await fetch("/api/billing/status", { cache: "no-store" });
        const result = (await response.json()) as { configured?: boolean; entitlement?: BillingEntitlement | null };
        if (active) {
          setBillingConfigured(Boolean(result.configured));
          if (result.entitlement) setEntitlement(result.entitlement);
        }
      } catch (error) {
        if (active) {
          setBillingNotice({
            message: error instanceof Error ? error.message : "利用状況を確認できませんでした。",
            tone: "error",
          });
        }
      } finally {
        if (active) setBillingLoaded(true);
      }
    };
    void loadBilling();
    return () => { active = false; };
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
    analysisRunRef.current += 1;
    setIsAnalyzing(false);
    recordingFileRef.current = file;
    setRecordingId("");
    void fingerprintRecording(file).then((id) => { if (recordingFileRef.current === file) setRecordingId(id); }).catch(() => {});
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
    if (usedModel !== "demo") {
      setGrowthProgress((current) => {
        const now = new Date().toISOString();
        const createMission = (): GrowthMission => ({
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          text: nextReview.next_focus,
          createdAt: now,
          sourceMatchId: matchId,
          checkedMatchIds: [],
        });
        let next: GrowthProgress = current;
        const mission = current.activeMission;
        const check = nextReview.mission_check;

        if (!mission && nextReview.next_focus) {
          next = { ...current, activeMission: createMission() };
        } else if (
          mission
          && matchId
          && mission.sourceMatchId !== matchId
          && !mission.checkedMatchIds.includes(matchId)
          && check
          && check.status !== "not_applicable"
        ) {
          const cleared = check.status === "cleared";
          next = {
            totalXp: current.totalXp + (cleared ? XP_PER_CLEAR : 0),
            activeMission: cleared
              ? createMission()
              : { ...mission, checkedMatchIds: [...mission.checkedMatchIds, matchId].slice(-20) },
            lastCheck: {
              ...check,
              mission: mission.text,
              checkedAt: now,
              matchId,
              xpGained: cleared ? XP_PER_CLEAR : 0,
            },
          };
        }

        localStorage.setItem(GROWTH_KEY, JSON.stringify(next));
        return next;
      });
    }
    setStatus({ message, tone: "success" });
    window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 40);
  }, [matchId, saveHistory]);

  const analyze = async () => {
    if (isAnalyzing) return;
    if (frames.length < 2) {
      setStatus({ message: "先にデス地点を登録してください。", tone: "error" });
      return;
    }
    if (!apiKey.trim()) {
      setSettingsOpen(true);
      setStatus({ message: "AI設定でOpenAI APIキーを入力してください。", tone: "error" });
      return;
    }
    const file = recordingFileRef.current;
    if (!file) return;
    setIsAnalyzing(true);
    const runId = ++analysisRunRef.current;
    const activeMission = growthProgress.activeMission;
    const previousMission = activeMission && matchId && activeMission.sourceMatchId !== matchId && !activeMission.checkedMatchIds.includes(matchId) ? activeMission.text : "";
    setStatus({ message: monthly?.cycle ? "AIが今回の場面と月間ミッションを照合しています…" : "AIが場面を確認し、30日間のミッションを作成しています…", tone: "neutral" });
    try {
      const nextRecordingId = recordingId || await fingerprintRecording(file);
      if (runId !== analysisRunRef.current) return;
      setRecordingId(nextRecordingId);
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim(), model, metadata: matchContext, previousMission, monthlyTracking: true, recordingId: nextRecordingId, renewMonthly, frames: frames.map(({ label, dataUrl, time }) => ({ label, dataUrl, time })) }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; review?: Review; model?: string; monthly?: MonthlySummary; monthlyNotice?: string; xpAwarded?: number; monthlySaved?: boolean };
      if (!response.ok || !data.ok || !data.review) throw new Error(data.error || "AI解析に失敗しました。");
      if (runId !== analysisRunRef.current) { void reloadMonthly(); return; }
      setMonthlyNotice(data.monthlyNotice || "");
      if (data.monthly) { monthlyReadRef.current++; setMonthlyLoading(false); setMonthly(data.monthly); setClock(Date.parse(data.monthly.serverNow)); setMonthlyError(""); }
      if (data.monthlySaved === false) setMonthlyError(data.monthlyNotice || "進捗を保存できませんでした。");
      if (data.monthlySaved && data.monthly?.cycle && monthlyPhase(data.monthly.cycle, Date.parse(data.monthly.serverNow)) === "active") setRenewMonthly(false);
      finishReview(data.review, data.model || model, "AIレビューが完了しました。");
    } catch (error) {
      if (runId === analysisRunRef.current) setStatus({ message: error instanceof Error ? error.message : "AI解析に失敗しました。", tone: "error" });
    } finally {
      if (runId === analysisRunRef.current) setIsAnalyzing(false);
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

  const growthInsights = useMemo(() => {
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
  const totalXp = growthProgress.totalXp + (monthly?.totalXp || 0);
  const growthLevel = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const xpInLevel = totalXp % XP_PER_LEVEL;
  const currentMissionText = growthProgress.activeMission?.text || "最初のAIレビューでミッションが決まります";
  const lastGrowthCheck = growthProgress.lastCheck;
  const activeTier = entitlement?.plan.startsWith("climb_") ? "Climb" : "Review";
  const activePayment = entitlement?.plan.includes("paypay") ? "PayPay 30日パス" : "カード月額";

  const startCheckout = async (plan: BillingPlan) => {
    setCheckoutPlan(plan);
    setBillingNotice(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const result = (await response.json()) as { url?: string; error?: string; code?: string };
      if (!response.ok || !result.url) {
        if (result.code === "billing_not_configured") setBillingConfigured(false);
        throw new Error(result.error || "決済画面を開けませんでした。");
      }
      window.location.assign(result.url);
    } catch (error) {
      setBillingNotice({
        message: error instanceof Error ? error.message : "決済画面を開けませんでした。",
        tone: "error",
      });
      setCheckoutPlan(null);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#review" aria-label="Radiant Review ホーム">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span><strong>RADIANT REVIEW</strong><small>VALORANT VOD COACH</small></span>
        </a>
        <div className="top-actions">
          <span className="local-state"><ShieldCheck aria-hidden="true" /> 動画は端末内で処理</span>
          <Button type="button" variant="outline" onClick={() => setPricingOpen(true)} className="top-pricing"><Wallet /> {entitlement?.status === "active" ? `残り${entitlement.remainingDays}日` : "料金・PayPay"}</Button>
          <Button type="button" variant="outline" onClick={() => setSettingsOpen(true)} className="top-settings"><Settings2 /> AI設定</Button>
        </div>
      </header>

      <main id="review" className="main-content">
        <section className="intro-strip" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">BROWSER PROTOTYPE 0.4</p>
            <h1 id="page-title">1デスを、次のラウンドの武器に。</h1>
            <p className="intro-copy">録画を選ぶだけ。ブラウザがデス候補を自動検出し、前20秒〜後5秒を切り出します。</p>
          </div>
          <div className="capability-row" aria-label="対応範囲">
            <span><Clock3 /> 最大60分</span><span><MonitorUp /> 1080p / 60fps</span><span><Film /> MP4・WebM・MOV</span>
          </div>
        </section>

        <section className="growth-level-strip" aria-labelledby="growth-level-title">
          <div className="level-emblem" aria-label={`成長レベル ${growthLevel}`}><small>GROWTH</small><strong>LV {growthLevel}</strong></div>
          <div className="level-progress-copy">
            <div><span><Award /> <strong id="growth-level-title">成長レベル</strong><Badge variant="outline">全ユーザー</Badge></span><b>{totalXp} XP</b></div>
            <Progress value={xpInLevel} aria-label={`次のレベルまで${XP_PER_LEVEL - xpInLevel} XP`} />
            <small>次のレベルまで {XP_PER_LEVEL - xpInLevel} XP</small>
          </div>
          <div className="active-mission-copy">
            <small>ACTIVE MISSION</small>
            <strong>{currentMissionText}</strong>
            <span><BrainCircuit /> 次の別試合の録画だけでAI判定・クリアで +50 XP</span>
          </div>
          {lastGrowthCheck ? (
            <div className={`last-mission-check ${lastGrowthCheck.status}`}>
              <small>LAST CHECK</small>
              <strong>{lastGrowthCheck.status === "cleared" ? `クリア +${lastGrowthCheck.xpGained} XP` : lastGrowthCheck.status === "improving" ? "改善中・0 XP" : lastGrowthCheck.status === "not_cleared" ? "継続中・0 XP" : "判定保留・0 XP"}</strong>
              <span>{lastGrowthCheck.evidence}</span>
            </div>
          ) : (
            <div className="last-mission-check pending">
              <small>LAST CHECK</small>
              <strong>AI判定待ち</strong>
              <span>ミッション作成後、次の別試合で初回判定</span>
            </div>
          )}
        </section>

        <MonthlyMissions summary={monthly} loading={monthlyLoading} error={monthlyError} notice={monthlyNotice} now={clock} recordingId={recordingId}
          renewRequested={renewMonthly}
          onRenew={() => { setRenewMonthly(true); setMonthlyNotice("次の新しい録画のAIレビューが完了すると、30日ミッションを開始します。"); }}
          onRetry={() => void reloadMonthly()}
          onChooseVideo={() => fileInputRef.current?.click()}
          onEvidence={(time) => { if (videoRef.current) { videoRef.current.currentTime = time; videoRef.current.scrollIntoView({ behavior: "smooth", block: "center" }); } }}
        />

        <section className="plan-banner" aria-label="Climb料金プラン">
          <div className="plan-banner-copy">
            <span className="plan-emblem"><QrCode /></span>
            <div><p><Badge>CLIMB</Badge> PAYPAY QR + STRIPE</p><strong>上位Climb：税込1,800円でAI解析10試合</strong><span>Reviewは900円・5試合。どちらも1試合あたり180円相当。PayPayは30日・自動更新なし。</span></div>
          </div>
          <div className="plan-banner-price"><small>税込</small><strong>¥1,800</strong><span>/ 30日・月</span></div>
          <Button type="button" onClick={() => setPricingOpen(true)}>料金と支払い方法を見る</Button>
        </section>

        <section className="pipeline" aria-label="処理の流れ">
          <div><span className="pipeline-icon"><Play /></span><p><small>01 / LOCAL</small><strong>録画を選択</strong></p></div>
          <div><span className="pipeline-icon"><ScanLine /></span><p><small>02 / AUTO DETECT</small><strong>デスを自動検出</strong></p></div>
          <div><span className="pipeline-icon"><BrainCircuit /></span><p><small>03 / REVIEW</small><strong>前20秒〜後5秒を解析</strong></p></div>
          <aside><Zap /> 自動検出・成長分析は全ユーザー利用可</aside>
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
                  <div><span><Badge>ALL USERS</Badge> 標準機能</span><strong>デス地点を自動検出</strong><p>録画だけを高速走査します。動画の送信・追加API料金はありません。</p></div>
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
              <Button type="button" variant="ghost" disabled={isAnalyzing} onClick={() => finishReview(demoReview(selectedTags[0]), "demo", "デモレビューを表示しました。月間ミッション・XPは変更されません。")} className="demo-button"><Play /> APIキーなしでデモを見る</Button>
              <p className="cost-note">AIへ送るのは最大5枚と課題・試合情報。月間ミッションも同時に判定します。料金はモデルと利用量で変わります。</p>
            </section>

            <section className="panel result-panel" ref={resultRef}>
              <SectionHeading step="04" eyebrow="COACHING OUTPUT" title="今回のレビュー" trailing={review ? <Badge className={`confidence ${review.confidence}`}>確度 {review.confidence}</Badge> : undefined} />
              {review ? (
                <div className="review-content">
                  <p className="review-kicker">NEXT ROUND PRIORITY</p>
                  <h3>{review.headline}</h3>
                  {review.mission_check && review.mission_check.status !== "not_applicable" ? (
                    <div className={`mission-check-card ${review.mission_check.status}`}>
                      <Award />
                      <div><small>前回ミッションのAI判定</small><strong>{review.mission_check.status === "cleared" ? `クリア・+${XP_PER_CLEAR} XP` : review.mission_check.status === "improving" ? "改善中・XPはクリア後" : review.mission_check.status === "not_cleared" ? "未クリア・次の録画へ継続" : "判定保留・次の録画へ継続"}</strong><p>{review.mission_check.evidence}</p></div>
                    </div>
                  ) : null}
                  <div className="focus-card"><Crosshair /><div><small>現在の成長ミッション</small><strong>{growthProgress.activeMission?.text || review.next_focus}</strong></div></div>
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

        <section className="panel growth-panel">
          <SectionHeading
            step="06"
            eyebrow="PLAYER INSIGHTS"
            title="成長ダッシュボード"
            trailing={<Badge variant="outline" className="local-insight-badge"><ShieldCheck /> 全ユーザー利用可</Badge>}
          />
          <div className="growth-grid">
            <article className="insight-card match-comparison">
              <div className="insight-title"><BarChart3 /><div><small>MATCH COMPARISON</small><h3>複数試合比較</h3></div><Badge variant="outline">{growthInsights.matches.length}試合</Badge></div>
              {growthInsights.matches.length ? (
                <div className="match-compare-list">
                  {growthInsights.matches.slice(0, 4).map((match) => (
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
                <div><span><MapPinned /> 苦手マップ</span><strong>{growthInsights.weakMap?.label || "データ待ち"}</strong><small>{growthInsights.weakMap ? `${growthInsights.weakMap.count}件・負荷 ${growthInsights.weakMap.average.toFixed(1)}` : "マップを設定して解析"}</small></div>
                <div><span><UsersRound /> 苦手エージェント</span><strong>{growthInsights.weakAgent?.label || "データ待ち"}</strong><small>{growthInsights.weakAgent ? `${growthInsights.weakAgent.count}件・負荷 ${growthInsights.weakAgent.average.toFixed(1)}` : "エージェントを設定して解析"}</small></div>
              </div>
            </article>

            <article className="insight-card reason-card">
              <div className="insight-title"><Activity /><div><small>DEATH CAUSES</small><h3>デス原因</h3></div></div>
              {growthInsights.reasons.length ? (
                <div className="reason-list">
                  {growthInsights.reasons.map((reason) => (
                    <div key={reason.label}><span><b>{reason.label}</b><small>{reason.count}件</small></span><i><em style={{ width: `${reason.percentage}%` }} /></i></div>
                  ))}
                </div>
              ) : <p className="insight-empty">解析したデスの原因を自動で分類し、偏りを表示します。</p>}
            </article>

            <article className="insight-card trend-card">
              <div className="insight-title"><TrendingUp /><div><small>REVIEW TREND</small><h3>反省点の推移・過去比較</h3></div></div>
              <div className="trend-summary">
                {growthInsights.trend === null ? <span className="trend-wait"><Activity /> 6件以上で直近5件と前5件を比較</span> : growthInsights.trend <= 0 ? <span className="trend-good"><TrendingDown /> 課題負荷が {Math.abs(growthInsights.trend).toFixed(1)} 改善</span> : <span className="trend-alert"><TrendingUp /> 課題負荷が {growthInsights.trend.toFixed(1)} 上昇</span>}
              </div>
              {growthInsights.latest ? (
                <div className="report-compare">
                  <div><small>今回</small><p>{growthInsights.latest.review.next_focus}</p></div>
                  <div><small>過去</small><p>{growthInsights.comparable?.review.next_focus || "同条件の過去レポートはまだありません。"}</p></div>
                </div>
              ) : <p className="insight-empty">レポートが増えると、以前の課題と今回の変化を比較できます。</p>}
            </article>
          </div>
        </section>

        <footer><span><ShieldCheck /> 試合後レビュー専用</span><p>ゲームへの接続・操作・リアルタイム情報の取得は行いません。AIの提案はVOD確認と組み合わせて判断してください。</p></footer>
      </main>

      <Dialog open={pricingOpen} onOpenChange={setPricingOpen}>
        <DialogContent className="pricing-dialog">
          <DialogHeader>
            <p className="eyebrow">REVIEW / CLIMB</p>
            <DialogTitle>解析量に合わせて2つのプランから選べます</DialogTitle>
            <DialogDescription>PayPay QRは30日間の一回払い、カードはStripe経由の月額自動更新です。複数試合比較・苦手マップ／エージェント・デス原因・過去比較は、プランに関係なく全ユーザーが利用できます。</DialogDescription>
          </DialogHeader>

          {entitlement?.status === "active" ? (
            <div className="active-pass"><CheckCircle2 /><div><strong>{activeTier}・{activePayment}を利用中</strong><span>{new Intl.DateTimeFormat("ja-JP", { dateStyle: "long" }).format(new Date(entitlement.endsAt))}まで・残り{entitlement.remainingDays}日</span></div></div>
          ) : null}

          <div className="payment-rules">
            <span><QrCode /><strong>PayPay QR</strong> 30日パス・自動更新なし</span>
            <span><CreditCard /><strong>カード（Stripe）</strong> 毎月自動更新</span>
          </div>

          <div className="payment-grid">
            <article className="payment-option review-tier">
              <div className="payment-option-head"><span className="payment-icon"><Target /></span><div><small>STANDARD</small><h3>Review</h3></div></div>
              <div className="payment-price"><strong>¥900</strong><span>税込 / 30日・月</span></div>
              <ul><li><CheckCircle2 />AI解析5試合分</li><li><CheckCircle2 />1試合あたり180円相当</li><li><CheckCircle2 />まず少ない試合数で試したい人向け</li></ul>
              <div className="payment-actions">
                <Button type="button" size="lg" variant="outline" disabled={!billingLoaded || !billingConfigured || checkoutPlan !== null} onClick={() => void startCheckout("paypay_30day")}>
                  {checkoutPlan === "paypay_30day" ? <LoaderCircle className="spin" /> : <QrCode />}{checkoutPlan === "paypay_30day" ? "準備中…" : "PayPay・30日"}
                </Button>
                <Button type="button" size="lg" variant="outline" disabled={!billingLoaded || !billingConfigured || checkoutPlan !== null} onClick={() => void startCheckout("card_monthly")}>
                  {checkoutPlan === "card_monthly" ? <LoaderCircle className="spin" /> : <CreditCard />}{checkoutPlan === "card_monthly" ? "準備中…" : "カード・月額"}
                </Button>
              </div>
            </article>

            <article className="payment-option recommended climb-tier">
              <div className="payment-option-head"><span className="payment-icon paypay"><TrendingUp /></span><div><Badge>上位プラン</Badge><h3>Climb</h3></div></div>
              <div className="payment-price"><strong>¥1,800</strong><span>税込 / 30日・月</span></div>
              <ul><li><CheckCircle2 />AI解析10試合分</li><li><CheckCircle2 />Reviewの2倍の解析枠</li><li><CheckCircle2 />継続して試合を見返す人向け</li></ul>
              <div className="payment-actions">
                <Button type="button" size="lg" disabled={!billingLoaded || !billingConfigured || checkoutPlan !== null} onClick={() => void startCheckout("climb_paypay_30day")}>
                  {checkoutPlan === "climb_paypay_30day" ? <LoaderCircle className="spin" /> : <QrCode />}{checkoutPlan === "climb_paypay_30day" ? "準備中…" : "PayPay・30日"}
                </Button>
                <Button type="button" size="lg" variant="outline" disabled={!billingLoaded || !billingConfigured || checkoutPlan !== null} onClick={() => void startCheckout("climb_card_monthly")}>
                  {checkoutPlan === "climb_card_monthly" ? <LoaderCircle className="spin" /> : <CreditCard />}{checkoutPlan === "climb_card_monthly" ? "準備中…" : "カード・月額"}
                </Button>
              </div>
            </article>
          </div>

          <div className="renewal-terms"><p><CalendarDays /><span><strong>PayPay QR</strong> 購入日から30日間利用でき、30日後に自動終了します。継続する場合だけ再購入してください。</span></p><p><RotateCcw /><span><strong>カード月額</strong> 毎月自動更新されます。いつでも解約でき、解約後も契約期間末まで利用できます。</span></p></div>
          {!billingConfigured && billingLoaded ? <div className="billing-setup-note"><AlertTriangle /><div><strong>決済接続は準備中です</strong><p>料金表示と購入導線は完成済みです。Stripeの秘密鍵とPayPay利用申請を設定すると、ボタンが有効になります。</p></div></div> : null}
          {billingNotice ? <div className={`billing-notice ${billingNotice.tone}`} role="status" aria-live="polite">{billingNotice.tone === "error" ? <AlertTriangle /> : billingNotice.tone === "success" ? <CheckCircle2 /> : <Clock3 />}<span>{billingNotice.message}</span></div> : null}
          <p className="billing-fineprint">PayPay QRとカード決済は、どちらもStripeの安全な決済画面で行います。年額Climbは返金条件の確定後に追加します。</p>
        </DialogContent>
      </Dialog>

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
