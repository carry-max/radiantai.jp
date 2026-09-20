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
  Film,
  Gamepad2,
  History,
  LoaderCircle,
  MapPinned,
  MonitorUp,
  Play,
  QrCode,
  RotateCcw,
  ScanLine,
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
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { MonthlyMissions } from "@/components/monthly-missions";
import { PlayerGrowth } from "@/components/player-growth";
import { AimMeasurement } from "@/components/aim-measurement";
import { captureTargets, captureRoundTargets, preciseTime, aimFrameLabel, ROUND_FRAME_LABELS, type ReviewMode, type AimCrop } from "@/lib/review-modes";
import { AccountLink, useAccount } from "@/components/account-provider";
import { accountStorageKeys } from "@/lib/account-storage";
import type { AnalysisAllowance } from "@/lib/analysis-access";
import { fingerprintRecording, monthlyPhase, type MonthlySummary } from "@/lib/monthly-missions";
import { TrainingVideoList } from "@/components/training-video-list";
import { recommendTrainingVideos } from "@/lib/training-videos";
import { coachMode, type TacticsCoach } from "@/lib/tactics-coaches";
import {
  type DeathCandidate,
  type DeathDetectionSample,
  extractDeathCandidates,
  measureDeathFrame,
} from "@/lib/death-detection";

type Frame = { label: string; time: number; dataUrl: string };
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type MissionCheckStatus = "cleared" | "improving" | "not_cleared" | "insufficient" | "not_applicable";

type MissionCheck = {
  status: MissionCheckStatus;
  evidence: string;
  confidence: "low" | "medium" | "high";
};

type Review = {
  mode?: ReviewMode;
  aim_crop?: AimCrop;
  status: "ok" | "insufficient";
  headline: string;
  observed: string[];
  evidence_frames?: { time: number; observation: string }[];
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
  round_review?: {
    initial_setup: string;
    player_distribution: string;
    information_gained: string;
    rotation: string;
    loss_reason: string;
  };
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

const XP_PER_CLEAR = 50;
const XP_PER_LEVEL = 100;
const MAX_VOD_SECONDS = 60 * 60;
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

function reviewModeLabel(mode?: ReviewMode) {
  if (mode === "aim") return "ミクロ";
  if (mode === "round") return "Deep";
  return "立ち回り";
}

function isVideoFile(file: File) {
  return file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(file.name);
}

function waitForSeek(video: HTMLVideoElement, target: number) {
  return new Promise<void>((resolve, reject) => {
    if (Math.abs(video.currentTime - target) < 0.001 && video.readyState >= 2) {
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

function frameDataUrl(video: HTMLVideoElement, mode: ReviewMode, crop: AimCrop) {
  const central = mode === "aim" && crop === "center";
  const side = Math.min(video.videoWidth, video.videoHeight) * 0.7;
  const width = Math.min(video.videoWidth, mode === "aim" ? 512 : 960);
  const height = central ? width : Math.round(width * (video.videoHeight / video.videoWidth));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("画像を切り出せませんでした。");
  if (central) context.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, width, height);
  else context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.74);
}

function demoReview(firstTag?: string, mode: ReviewMode = "tactics"): Review {
  if (mode === "aim") return {
    mode, status: "ok", headline: "照準の初期位置から見直す",
    observed: ["これはミクロレビューの表示例です。実際の録画を確認していません。", "本解析では同じ敵と照準が見える複数の画像を確認します。"],
    main_issue: { category: "照準の初期位置", severity: "medium", evidence: "例：接敵前の照準が頭の高さより低く、大きな修正が必要になっている場面。" },
    improvements: ["射撃場で頭の高さを意識して照準を置く。", "同じ距離・武器で練習を繰り返し、接敵前の照準位置を見比べる。"],
    next_focus: "次の練習では、敵を見る前の照準の高さを1つ確認する。",
    confidence: "low", uncertainty: "表示例です。6枚の画像から反応速度・命中率・マウスの動きは測定しません。",
  };
  if (mode === "round") return {
    mode, status: "ok", headline: "情報に合わせて守備配置を更新する",
    observed: ["これはラウンドレビューの表示例です。実際の録画を確認していません。", "本解析では開始から終了までの6枚を時系列で確認します。"],
    main_issue: { category: "ローテ", severity: "medium", evidence: "例：反対サイトの接敵情報が見えた後も、初期配置から人数配分が変わっていません。" },
    improvements: ["確定した敵人数とスパイク情報を基準に、寄る人数を決める。", "ローテ後も空いたレーンと退路を1つ残す。"],
    next_focus: "次のラウンドは、確定情報を得た時点で人数配分を1回見直す。",
    mission_check: { status: "not_applicable", evidence: "ラウンドレビューでは月間ミッションを判定しません。", confidence: "low" },
    confidence: "low", uncertainty: "表示例です。画像間の通話や視点外の動きは確認できません。",
    round_review: {
      initial_setup: "開始時は両サイトを確認できる配置です。",
      player_distribution: "中央を含む複数レーンへ人数を分けています。",
      information_gained: "反対サイト側で接敵した想定の表示例です。",
      rotation: "情報後の人数移動が遅れた場面として扱います。",
      loss_reason: "確定情報に対する配置更新が遅れ、守備人数が足りなくなった想定です。",
    },
  };
  const category = firstTag === "不要ピーク" ? "ピーク判断" : firstTag === "スキル残し" ? "スキル運用" : firstTag === "人数有利" ? "人数管理" : "トレード";
  return {
    status: "ok",
    headline: "撃ち合う前の条件を整える",
    observed: [
      "登録した時刻までの場面を、デス直前の時系列として扱います。",
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

export function AnalysisWorkspace() {
  const [reviewMode, setReviewMode] = useState<ReviewMode>("tactics");
  const [tacticsCoach, setTacticsCoach] = useState<TacticsCoach>("riot");
  const [aimCrop, setAimCrop] = useState<AimCrop>("center");
  const captureRunRef = useRef(0);
  const account = useAccount();
  const accountFetch = account.request;
  const { history: HISTORY_KEY, growth: GROWTH_KEY } = accountStorageKeys(account.snapshot?.user?.id || "signed-out");
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
  const [pricingOpen, setPricingOpen] = useState(false);
  const [billingConfigured, setBillingConfigured] = useState(false);
  const [billingLoaded, setBillingLoaded] = useState(false);
  const [paypayEnabled, setPaypayEnabled] = useState(false);
  const [serviceReady, setServiceReady] = useState(false);
  const [growthRefreshKey, setGrowthRefreshKey] = useState(0);
  const [signedIn, setSignedIn] = useState(false);
  const [allowance, setAllowance] = useState<AnalysisAllowance | null>(null);
  const [allowanceError, setAllowanceError] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const [analysisId, setAnalysisId] = useState("");
  const [feedbackNotice, setFeedbackNotice] = useState("");
  const [pendingPlan, setPendingPlan] = useState<BillingPlan | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<BillingPlan | null>(null);
  const [entitlement, setEntitlement] = useState<BillingEntitlement | null>(null);
  const [billingNotice, setBillingNotice] = useState<{ message: string; tone: "neutral" | "success" | "error" } | null>(null);
  const [fileName, setFileName] = useState("");
  const [aimClips, setAimClips] = useState<File[]>([]);
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
  const [roundStart, setRoundStart] = useState<number | null>(null);
  const [roundEnd, setRoundEnd] = useState<number | null>(null);
  const [deathSource, setDeathSource] = useState<"auto" | "manual">("auto");
  const [deathCandidates, setDeathCandidates] = useState<DeathCandidate[]>([]);
  const [selectedDeathId, setSelectedDeathId] = useState("");
  const [isDetectingDeaths, setIsDetectingDeaths] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState(0);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isReviewPlaying, setIsReviewPlaying] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isWindows, setIsWindows] = useState(false);
  const [isWindowsApp, setIsWindowsApp] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [status, setStatus] = useState({ message: "モードを選ぶとレビューを開始できます。", tone: "neutral" as "neutral" | "success" | "error" });
  const [map, setMap] = useState("");
  const [agent, setAgent] = useState("");
  const [role, setRole] = useState("不明");
  const [side, setSide] = useState("不明");
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
      const response = await accountFetch("/api/missions", { cache: "no-store" });
      const data = await response.json() as MonthlySummary & { error?: string };
      if (readId !== monthlyReadRef.current) return;
      if (!response.ok) throw new Error(data.error || "月間ミッションを読み込めませんでした。");
      setMonthly(data);
      setClock(Date.parse(data.serverNow));
    } catch (error) {
      if (readId === monthlyReadRef.current) setMonthlyError(error instanceof Error ? error.message : "月間ミッションを読み込めませんでした。");
    } finally { if (readId === monthlyReadRef.current) setMonthlyLoading(false); }
  }, [accountFetch]);

  const reloadAllowance = useCallback(async () => {
    try {
      const response = await accountFetch("/api/analyze", { cache: "no-store" });
      const data = await response.json() as { configured?: boolean; signedIn?: boolean; allowance?: AnalysisAllowance | null; error?: string };
      setServiceReady(Boolean(data.configured)); setSignedIn(Boolean(data.signedIn));
      setAllowance(data.allowance || null);
      setAllowanceError(response.ok ? "" : data.error || "解析枠を確認できませんでした。");
    } catch { setAllowanceError("解析枠を読み込めませんでした。再読み込みしてください。"); }
  }, [accountFetch]);
  useEffect(() => {
    const start = window.setTimeout(() => void reloadAllowance(), 0);
    return () => window.clearTimeout(start);
  }, [reloadAllowance]);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const syncPlatform = () => {
      setIsWindows(/Windows/i.test(navigator.userAgent));
      setIsWindowsApp(displayMode.matches);
    };
    const installable = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    syncPlatform();
    displayMode.addEventListener("change", syncPlatform);
    window.addEventListener("beforeinstallprompt", installable);
    window.addEventListener("appinstalled", syncPlatform);
    return () => {
      displayMode.removeEventListener("change", syncPlatform);
      window.removeEventListener("beforeinstallprompt", installable);
      window.removeEventListener("appinstalled", syncPlatform);
    };
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
      if (!account.snapshot?.user) return;
      try {
        const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
        if (Array.isArray(saved)) setHistoryItems(saved.filter((entry: HistoryEntry) => entry.model !== "demo").slice(0, 50));
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
      captureRunRef.current += 1;
      analysisRunRef.current += 1;
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
          const response = await accountFetch("/api/billing/confirm", {
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
              : { message: "支払いを確認しました。Radiant AIの利用期間を反映しました。", tone: "success" });
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

        const response = await accountFetch("/api/billing/status", { cache: "no-store" });
        const result = (await response.json()) as { configured?: boolean; paypayEnabled?: boolean; entitlement?: BillingEntitlement | null };
        if (active) {
          setBillingConfigured(Boolean(result.configured));
          setPaypayEnabled(Boolean(result.paypayEnabled));
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
    timestamp: reviewMode === "aim" ? preciseTime(deathTimestamp) : reviewMode === "round" && roundStart !== null && roundEnd !== null ? `${formatTime(roundStart)}〜${formatTime(roundEnd)}` : formatTime(deathTimestamp),
    note: note.trim(),
    tags: selectedTags,
  }), [agent, deathTimestamp, map, note, role, round, roundEnd, roundStart, selectedTags, side, reviewMode]);

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
      const next = [entry, ...current.filter(item => !(item.matchId === entry.matchId && item.metadata.timestamp === entry.metadata.timestamp && (item.review.mode || "tactics") === (nextReview.mode || "tactics") && item.review.aim_crop === nextReview.aim_crop))].slice(0, 50);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, [deathSource, fileName, matchContext, matchId, HISTORY_KEY]);

  const loadVideo = useCallback((file?: File) => {
    if (!file) return;
    if (!isVideoFile(file)) {
      setStatus({ message: "MP4・WebM・MOVの動画を選んでください。", tone: "error" });
      return;
    }
    scanRunRef.current += 1;
    analysisRunRef.current += 1;
    captureRunRef.current += 1;
    setIsCapturing(false);
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
    setRoundStart(null);
    setRoundEnd(null);
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

  const loadSelectedVideos = useCallback((files?: FileList | null) => {
    if (!files?.length) return;
    const videos = Array.from(files).filter(isVideoFile);
    if (!videos.length) {
      setStatus({ message: "MP4・WebM・MOVの動画を選んでください。", tone: "error" });
      return;
    }
    if (reviewMode === "aim") setAimClips(videos.slice(0, 30));
    else setAimClips([]);
    loadVideo(videos[0]);
  }, [loadVideo, reviewMode]);

  const captureFramesAt = useCallback(async (markedAt: number, source: "auto" | "manual") => {
    const video = videoRef.current;
    if (!video || !videoReady || videoTooLong || isCapturing || isAnalyzing) return;
    video.pause();
    const targets = captureTargets(reviewMode, markedAt, video.duration);
    if (targets.length < 2) {
      setStatus({ message: reviewMode === "aim" ? "前後0.4秒を含められる時刻を選んでください（末尾は0.45秒以上手前）。" : "開始直後すぎるため、この候補は切り出せません。", tone: "error" });
      return;
    }
    const runId = ++captureRunRef.current;
    setReview(null); setAnalysisId(""); setIsDemo(false); setFeedbackNotice("");
    setIsCapturing(true);
    setDeathSource(source);
    setFrames([]);
    setCaptureProgress(0);
    setStatus({ message: reviewMode === "aim" ? "撃ち始め付近の0.8秒から6枚を切り出しています…" : source === "auto" ? "自動検出したデスの前後を切り出しています…" : "現在時刻の前後を切り出しています…", tone: "neutral" });
    try {
      const captured: Frame[] = [];
      for (let index = 0; index < targets.length; index += 1) {
        const item = targets[index];
        await waitForSeek(video, item.time);
        if (runId !== captureRunRef.current) return;
        captured.push({
          time: item.time,
          label: reviewMode === "aim" ? aimFrameLabel(item.offset) : frameLabel(Math.round(item.time - markedAt)),
          dataUrl: frameDataUrl(video, reviewMode, aimCrop),
        });
        setCaptureProgress(Math.round(((index + 1) / targets.length) * 100));
      }
      setFrames(captured);
      setDeathTimestamp(markedAt);
      await waitForSeek(video, markedAt);
      if (runId !== captureRunRef.current) return;
      setStatus({ message: `${reviewMode === "aim" ? preciseTime(markedAt) : formatTime(markedAt)}の${captured.length}枚を取得しました。確認して解析できます。`, tone: "success" });
    } catch (error) {
      if (runId === captureRunRef.current) setStatus({ message: error instanceof Error ? error.message : "フレーム取得に失敗しました。", tone: "error" });
    } finally {
      if (runId === captureRunRef.current) setIsCapturing(false);
    }
  }, [isAnalyzing, isCapturing, videoReady, videoTooLong, reviewMode, aimCrop]);

  const captureFrames = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setSelectedDeathId("");
    await captureFramesAt(video.currentTime, "manual");
  }, [captureFramesAt]);

  const captureRoundFrames = useCallback(async () => {
    const video = videoRef.current;
    if (!video || roundStart === null || roundEnd === null || isCapturing || isAnalyzing) return;
    const targets = captureRoundTargets(roundStart, roundEnd, video.duration);
    if (targets.length !== 6) {
      setStatus({ message: "ラウンド開始より10秒以上あとに終了を指定してください（最大5分）。", tone: "error" });
      return;
    }
    video.pause();
    const runId = ++captureRunRef.current;
    setReview(null); setAnalysisId(""); setIsDemo(false); setFeedbackNotice("");
    setIsCapturing(true); setFrames([]); setCaptureProgress(0); setDeathTimestamp(roundEnd);
    setStatus({ message: "ラウンド全体から6枚を時系列で切り出しています…", tone: "neutral" });
    try {
      const captured: Frame[] = [];
      for (let index = 0; index < targets.length; index += 1) {
        await waitForSeek(video, targets[index].time);
        if (runId !== captureRunRef.current) return;
        captured.push({
          time: targets[index].time,
          label: ROUND_FRAME_LABELS[index],
          dataUrl: frameDataUrl(video, "round", "full"),
        });
        setCaptureProgress(Math.round(((index + 1) / targets.length) * 100));
      }
      setFrames(captured);
      await waitForSeek(video, roundEnd);
      if (runId !== captureRunRef.current) return;
      setStatus({ message: `${formatTime(roundStart)}〜${formatTime(roundEnd)}の6枚を取得しました。ラウンド全体を解析できます。`, tone: "success" });
    } catch (error) {
      if (runId === captureRunRef.current) setStatus({ message: error instanceof Error ? error.message : "ラウンドの切り出しに失敗しました。", tone: "error" });
    } finally {
      if (runId === captureRunRef.current) setIsCapturing(false);
    }
  }, [isAnalyzing, isCapturing, roundEnd, roundStart]);

  const detectDeaths = useCallback(async () => {
    const sourceUrl = objectUrlRef.current;
    if (reviewMode !== "tactics" || !sourceUrl || !videoReady || videoTooLong || !duration || isDetectingDeaths) return;
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
  }, [captureFramesAt, duration, isDetectingDeaths, videoReady, videoTooLong, reviewMode]);

  useEffect(() => {
    const sourceUrl = objectUrlRef.current;
    if (reviewMode !== "tactics" || !sourceUrl || !videoReady || videoTooLong || !duration || autoScannedUrlRef.current === sourceUrl) return;
    autoScannedUrlRef.current = sourceUrl;
    const timer = window.setTimeout(() => void detectDeaths(), 80);
    return () => window.clearTimeout(timer);
  }, [detectDeaths, duration, videoReady, videoTooLong, reviewMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      if (reviewMode === "tactics" && event.key.toLowerCase() === "d" && !["INPUT", "TEXTAREA", "SELECT"].includes(tag)) {
        event.preventDefault();
        void captureFrames();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [captureFrames, reviewMode]);

  const playReviewWindow = useCallback(async () => {
    const video = videoRef.current;
    if (!video || frames.length < 2 || !duration) return;
    const start = reviewMode === "round" && roundStart !== null ? roundStart : Math.max(0, deathTimestamp - (reviewMode === "aim" ? 0.4 : 20));
    reviewEndRef.current = reviewMode === "round" && roundEnd !== null ? roundEnd : Math.min(duration, deathTimestamp + (reviewMode === "aim" ? 0.4 : 5));
    video.currentTime = start;
    setIsReviewPlaying(true);
    try {
      await video.play();
      setStatus({ message: reviewMode === "aim" ? "選択した基準時刻の前後0.4秒を再生しています。" : reviewMode === "round" ? "指定したラウンド全体を再生しています。" : "デス前20秒からデス後5秒まで再生しています。", tone: "neutral" });
    } catch {
      reviewEndRef.current = null;
      setIsReviewPlaying(false);
      setStatus({ message: "再生を開始できませんでした。動画の再生ボタンをお試しください。", tone: "error" });
    }
  }, [deathTimestamp, duration, frames.length, reviewMode, roundEnd, roundStart]);

  const finishReview = useCallback((nextReview: Review, usedModel: string, message: string) => {
    setReview(nextReview);
    setIsDemo(usedModel === "demo");
    if (usedModel === "demo") { setAnalysisId(""); setFeedbackNotice(""); }
    if (usedModel !== "demo") saveHistory(nextReview, usedModel);
    if (usedModel !== "demo" && nextReview.mode === "tactics" && nextReview.status === "ok") {
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

  const changeReviewMode = (nextMode: ReviewMode, crop: AimCrop = aimCrop, force = false) => {
    if (isAnalyzing || isCapturing || isDetectingDeaths) return;
    if (!force && nextMode === reviewMode && crop === aimCrop) return;
    videoRef.current?.pause(); reviewEndRef.current = null; setIsReviewPlaying(false);
    captureRunRef.current++; analysisRunRef.current++;
    setReviewMode(nextMode); setAimCrop(crop); setFrames([]); setReview(null);
    setRoundStart(null); setRoundEnd(null);
    setAnalysisId(""); setIsDemo(false); setFeedbackNotice(""); setSelectedDeathId(""); setSelectedTags([]);
    setStatus({ message: nextMode === "aim" ? "撃ち始め付近で動画を停止し、AIMの6枚を切り出してください。" : nextMode === "round" ? "動画上でラウンド開始と終了を指定してください。" : "デス候補を選ぶか、現在時刻を追加してください。", tone: "neutral" });
  };

  const selectTacticsCoach = (coach: TacticsCoach) => {
    if (coach === tacticsCoach && coachMode(coach) === reviewMode) return;
    setTacticsCoach(coach);
    changeReviewMode(coachMode(coach), aimCrop, true);
  };

  const installWindowsApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(null);
  };

  const analyze = async () => {
    if (isAnalyzing) return;
    if (frames.length < (reviewMode === "tactics" ? 2 : 6)) {
      setStatus({ message: "先に解析する場面を切り出してください。", tone: "error" });
      return;
    }
    if (!serviceReady) {
      setStatus({ message: "AIレビューは準備中です。録画の切り出しとサンプルをお試しください。", tone: "neutral" });
      return;
    }
    if (tacticsCoach === "riot" && reviewMode !== "aim") {
      if (!account.snapshot?.riot.configured) {
        setStatus({ message: "Riot AIは公式承認とRSO設定の完了後に利用できます。", tone: "error" });
        return;
      }
      if (!account.snapshot.riot.connection) {
        setStatus({ message: "先にアカウント画面でRiotアカウントを連携してください。", tone: "error" });
        return;
      }
      if (!isWindows || !isWindowsApp) {
        setStatus({ message: "Riot AIはWindowsにインストールしたRadiant AIアプリから利用してください。", tone: "error" });
        return;
      }
    }
    const file = recordingFileRef.current;
    if (!file) return;
    setIsAnalyzing(true);
    const runId = ++analysisRunRef.current;
    const activeMission = growthProgress.activeMission;
    const previousMission = reviewMode === "tactics" && activeMission && matchId && activeMission.sourceMatchId !== matchId && !activeMission.checkedMatchIds.includes(matchId) ? activeMission.text : "";
    setStatus({ message: reviewMode === "aim" ? "AIが照準と同じ敵の位置関係を6枚で確認しています…" : reviewMode === "round" ? "AIが初期配置からラウンド敗因までを6枚で確認しています…" : monthly?.cycle ? "AIが今回の場面と月間ミッションを照合しています…" : "AIが場面を確認し、30日間のミッションを作成しています…", tone: "neutral" });
    try {
      const nextRecordingId = recordingId || await fingerprintRecording(file);
      if (runId !== analysisRunRef.current) return;
      setRecordingId(nextRecordingId);
      const response = await accountFetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: reviewMode, tacticsCoach: reviewMode === "aim" ? undefined : tacticsCoach, clientKind: isWindowsApp && isWindows ? "windows-app" : "web", aimCrop, deathTimestamp, ...(reviewMode === "round" ? { roundStart } : {}), metadata: matchContext, previousMission, monthlyTracking: reviewMode === "tactics", recordingId: nextRecordingId, renewMonthly, frames: frames.map(({ label, dataUrl, time }) => ({ label, dataUrl, time })) }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; review?: Review; model?: string; monthly?: MonthlySummary; monthlyNotice?: string; xpAwarded?: number; monthlySaved?: boolean; analysisId?: string; cached?: boolean; growthNotice?: string };
      if (!response.ok || !data.ok || !data.review) throw new Error(data.error || "AI解析に失敗しました。");
      if (runId !== analysisRunRef.current) { void reloadMonthly(); return; }
      setMonthlyNotice(data.monthlyNotice || "");
      if (data.monthly) { monthlyReadRef.current++; setMonthlyLoading(false); setMonthly(data.monthly); setClock(Date.parse(data.monthly.serverNow)); setMonthlyError(""); }
      if (data.monthlySaved === false) setMonthlyError(data.monthlyNotice || "進捗を保存できませんでした。");
      if (data.monthlySaved && data.monthly?.cycle && monthlyPhase(data.monthly.cycle, Date.parse(data.monthly.serverNow)) === "active") setRenewMonthly(false);
      setAnalysisId(data.analysisId || ""); setFeedbackNotice("");
      setGrowthRefreshKey(current => current + 1);
      if (data.cached) void reloadMonthly();
      finishReview(data.review, data.model || "AI", data.cached ? "保存済みのレビューを表示しました。解析枠は消費しません。" : data.review.status === "insufficient" ? "根拠が不足しているため判定保留です。試合枠は消費していません。" : "AIレビューが完了しました。次の試合で直すことを1つ確認しましょう。");
      if (data.growthNotice) setStatus({ message: `レビューは完了しました。${data.growthNotice}`, tone: "neutral" });
    } catch (error) {
      if (runId === analysisRunRef.current) setStatus({ message: error instanceof Error ? error.message : "AI解析に失敗しました。", tone: "error" });
    } finally {
      void reloadAllowance();
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
        `- モード: ${reviewModeLabel(entry.review.mode)}`,
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
    const verifiedHistory = historyItems.filter(entry => entry.model !== "demo" && (entry.review.mode || "tactics") === "tactics" && entry.review.status === "ok");
    const severityValue = { low: 1, medium: 2, high: 3 } as const;
    const rankedDimension = (selector: (entry: HistoryEntry) => string) => {
      const groups = new Map<string, { count: number; total: number }>();
      verifiedHistory.forEach((entry) => {
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
    verifiedHistory.forEach((entry) => {
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
    verifiedHistory.forEach((entry) => {
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
    const recent = verifiedHistory.slice(0, 5);
    const previous = verifiedHistory.slice(5, 10);
    const trend = recent.length >= 3 && previous.length >= 3
      ? averageSeverity(recent) - averageSeverity(previous)
      : null;
    const latest = verifiedHistory[0] || null;
    const comparable = latest
      ? verifiedHistory.slice(1).find((entry) => (
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

  const reviewReady = frames.length >= (reviewMode === "tactics" ? 2 : 6);
  const totalXp = growthProgress.totalXp + (monthly?.totalXp || 0);
  const growthLevel = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const xpInLevel = totalXp % XP_PER_LEVEL;
  const currentMissionText = growthProgress.activeMission?.text || "最初のAIレビューでミッションが決まります";
  const lastGrowthCheck = growthProgress.lastCheck;
  const activeTier = "Radiant AI";
  const activePayment = entitlement?.plan.includes("paypay") ? "PayPay 30日パス" : "カード月額";

  const startCheckout = async (plan: BillingPlan) => {
    setCheckoutPlan(plan);
    setBillingNotice(null);
    try {
      const response = await accountFetch("/api/billing/checkout", {
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

  const submitFeedback = async (rating: "helpful" | "incorrect") => {
    if (!analysisId || isDemo) return;
    setFeedbackNotice("評価を保存しています…");
    try {
      const response = await accountFetch("/api/review-feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: analysisId, rating }) });
      if (!response.ok) throw new Error();
      setFeedbackNotice(rating === "helpful" ? "役立ったという評価を保存しました。" : "見直しが必要という評価を保存しました。");
    } catch { setFeedbackNotice("評価を保存できませんでした。もう一度お試しください。"); }
  };
  const cancelRenewal = async () => {
    setCancelBusy(true);
    try {
      const response = await accountFetch("/api/billing/cancel", { method: "POST" });
      const data = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(data.error || "更新停止を確認できませんでした。");
      setBillingNotice({ tone: "success", message: data.message || "次回の自動更新を停止しました。" });
    } catch (error) { setBillingNotice({ tone: "error", message: error instanceof Error ? error.message : "更新停止を確認できませんでした。" }); }
    finally { setCancelBusy(false); }
  };
  const currentAllowance = reviewMode === "aim" ? allowance : allowance?.tactics?.[tacticsCoach];
  const currentScenes = currentAllowance?.recordings.find(item => item.recordingId === recordingId)?.scenesUsed || 0;
  const riotReady = Boolean(account.snapshot?.riot.configured && account.snapshot.riot.connection && isWindows && isWindowsApp);
  const pendingPrice = pendingPlan?.startsWith("climb_") ? 1800 : 900;
  const pendingMatches = pendingPlan?.startsWith("climb_") ? 10 : 5;

  return (
    <div className="app-shell analysis-page">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Radiant Review ホーム">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span><strong>RADIANT REVIEW</strong><small>VALORANT VOD COACH</small></span>
        </Link>
        <div className="top-actions">
          <AccountLink />
          <span className="local-state"><ShieldCheck aria-hidden="true" /> 録画は端末に保存</span>
          <Button asChild variant="outline" className="top-growth"><a href="/dashboard"><Activity /> ダッシュボード</a></Button>
          <Button asChild variant="outline" className="top-pricing"><a href="/pricing"><Wallet /> {entitlement?.status === "active" ? `残り${entitlement.remainingDays}日` : "料金・利用状況"}</a></Button>
          <Button asChild variant="outline" className="top-settings"><Link href="/privacy"><ShieldCheck /> データの取り扱い</Link></Button>
        </div>
      </header>

      <main id="review" className="main-content">
        <section className="intro-strip" aria-labelledby="page-title">
          <div>
            <p className="eyebrow">試合後の振り返り · 日本語AIコーチ</p>
            <h1 id="page-title">試合判断と撃ち合いを、別々に伸ばす。</h1>
            <p className="intro-copy">立ち回りはRiot APIだけで最大50試合を分類。ミクロはWindowsアプリがデス前後を自動保存し、映像から改善点を整理します。</p>
            <p className="intro-privacy">{reviewMode === "tactics" ? "立ち回りモードは録画不要。Riot APIの試合データだけをAIへ送信します。" : reviewMode === "aim" ? "手動録画・アップロード不要。自動保存した30秒クリップだけを試合後にAIへ送信します。" : "Deepは重要な試合や場面を詳しく確認する追加解析です。"}</p>
            <Button type="button" variant="ghost" className="intro-sample" disabled={isAnalyzing} onClick={() => finishReview(demoReview(undefined, reviewMode), "demo", "サンプルです。あなたの録画は解析せず、履歴・XP・解析枠を変更しません。")}><Play /> 録画なしでサンプルを見る</Button>
          </div>
          <div className="capability-row" aria-label="対応範囲">
            <span><Zap /> 立ち回り50試合</span><span><Crosshair /> ミクロ5試合</span><span><BrainCircuit /> Deep 2試合</span>
          </div>
        </section>

        <section className="review-mode-bar" aria-label="解析モード">
          <div className="review-mode-switch" role="group" aria-label="目的を選ぶ">
            <div className="review-mode-family tactics-coach-family"><span>立ち回りモード</span><div className="review-mode-options tactics-coach-options">
              <button type="button" aria-pressed={reviewMode === "tactics" && tacticsCoach === "riot"} disabled={isCapturing || isAnalyzing || isDetectingDeaths} onClick={() => selectTacticsCoach("riot")}><Zap /><span><strong>立ち回り <em>50試合</em></strong><small>録画不要 · Riot API</small></span></button>
            </div></div>
            <div className="review-mode-family"><span>ミクロモード</span><div className="review-mode-options single">
              <button type="button" aria-pressed={reviewMode === "aim"} disabled={isCapturing || isAnalyzing || isDetectingDeaths} onClick={() => changeReviewMode("aim")}><Crosshair /><span><strong>ミクロ <em>5試合</em></strong><small>録画操作不要 · Overwolf</small></span></button>
            </div></div>
            <div className="review-mode-family"><span>追加解析</span><div className="review-mode-options single">
              <button type="button" aria-pressed={reviewMode === "round"} disabled={isCapturing || isAnalyzing || isDetectingDeaths} onClick={() => selectTacticsCoach("deep")}><UsersRound /><span><strong>Deep <em>2試合</em></strong><small>重要場面を詳しく確認</small></span></button>
            </div></div>
          </div>
          <div className="review-mode-price"><Badge variant="outline">月額900円</Badge><p>立ち回り50試合・ミクロ5試合・Deep 2試合。</p><small>未使用分は月2試合まで、必要な別モードへ自動振替できます。</small></div>
        </section>
        {reviewMode === "aim" ? <section className="aim-autoclip-flow" aria-label="ミクロ自動クリップ解析の流れ">
          <div className="aim-autoclip-heading">
            <span className="pipeline-icon"><Gamepad2 /></span>
            <div><p className="eyebrow">MICRO / AUTOMATIC DEATH CLIPS</p><h2>録画操作なしで、デスごとに30秒を自動保存</h2><p>試合中はWindowsアプリが自動保存し、解析は試合終了後にまとめて実行します。</p></div>
            <Badge>AI解析</Badge>
          </div>
          <div className="aim-autoclip-steps">
            <div><small>01 / IN MATCH</small><strong>Overwolf</strong><span>VALORANTを検出</span></div>
            <div><small>02 / EVENT</small><strong>death検出</strong><span>自分のデスだけを受信</span></div>
            <div><small>03 / WINDOWS</small><strong>自動クリップ</strong><span>死亡前25秒＋死亡後5秒</span></div>
            <div><small>04 / AFTER MATCH</small><strong>クリップ一覧</strong><span>デスごとに選択・確認</span></div>
            <div><small>05 / AI REVIEW</small><strong>AI解析</strong><span>映像解析から改善点整理</span></div>
          </div>
          <p className="aim-autoclip-note"><ShieldCheck /> Overwolfのdeathイベントを保存トリガーに使います。試合中にAI解析や助言は表示しません。</p>
        </section> : null}
        {reviewMode === "tactics" && tacticsCoach === "riot" ? <section className="macro-data-flow" aria-label="立ち回り解析の流れ">
          <div><p className="eyebrow">TACTICS / NO VIDEO REQUIRED</p><h2>録画なしで、最大50試合の判断傾向を分析</h2><p>Riot APIの戦績・マップ・エージェント・ラウンド情報をAIが分類し、苦手傾向と次の改善行動を整理します。</p></div>
          <ol><li><span>01</span><strong>Riot API</strong><small>試合データを取得</small></li><li><span>02</span><strong>AI</strong><small>最大50試合を分類</small></li><li><span>03</span><strong>AI</strong><small>判断・マクロ分析を整理</small></li></ol>
          <p><ShieldCheck /> 録画・映像・音声は使用しません。Windowsアプリが試合後に同期します。</p>
        </section> : null}
        {reviewMode !== "aim" && tacticsCoach === "riot" ? <section className={`riot-ai-gate ${riotReady ? "ready" : "pending"}`} aria-live="polite">
          <div><Zap /><span><strong>Riot AI / 最大50試合</strong><small>{riotReady ? `${account.snapshot?.riot.connection?.displayName}・Windowsアプリから利用できます` : !account.snapshot?.riot.configured ? "Riot公式承認後にRSOを有効化します" : !account.snapshot.riot.connection ? "Riotアカウント連携が必要です" : !isWindows ? "Windows版が必要です" : "Windowsへアプリをインストールして起動してください"}</small></span></div>
          {!account.snapshot?.riot.connection ? <Button asChild variant="outline"><Link href="/account">Riot連携を設定</Link></Button> : !isWindowsApp && installPrompt ? <Button type="button" variant="outline" onClick={() => void installWindowsApp()}><MonitorUp /> Windowsにインストール</Button> : !isWindowsApp ? <span className="riot-install-help">Edge / Chromeのメニューから「アプリをインストール」を選択</span> : <Badge>{riotReady ? "利用可能" : "設定待ち"}</Badge>}
        </section> : null}
        {reviewMode === "round" ? <section className="pipeline" aria-label="処理の流れ">
          <div><span className="pipeline-icon"><Play /></span><p><small>01 / LOCAL</small><strong>録画を選択</strong></p></div>
          <div><span className="pipeline-icon"><ScanLine /></span><p><small>02 / SELECT ROUND</small><strong>開始と終了を指定</strong></p></div>
          <div><span className="pipeline-icon"><BrainCircuit /></span><p><small>03 / REVIEW</small><strong>ラウンド全体を解析</strong></p></div>
          <aside><Zap /> 自動検出・成長分析は全ユーザー利用可</aside>
        </section> : null}

        <div className="workspace-grid" hidden={(reviewMode === "tactics" && tacticsCoach === "riot") || reviewMode === "aim"}>
          <div className="primary-column">
            <section className="panel video-panel">
              <SectionHeading
                 step="01" eyebrow={reviewMode === "aim" ? "LOAD DEATH CLIPS" : "LOAD LOCAL VOD"} title={reviewMode === "aim" ? "デスクリップ" : "試合録画"}
                 trailing={<><input ref={fileInputRef} id="videoInput" type="file" multiple={reviewMode === "aim"} accept="video/mp4,video/webm,video/quicktime,video/*" hidden onChange={(event) => loadSelectedVideos(event.target.files)} /><Button asChild className="upload-button"><label htmlFor="videoInput"><UploadCloud /> {reviewMode === "aim" ? "クリップを選択" : "動画を選択"}</label></Button></>}
               />
              {reviewMode === "aim" && aimClips.length ? <div className="aim-clip-queue" aria-label="試合後のデスクリップ一覧">
                <div><strong>試合後のクリップ</strong><span>{aimClips.length}件</span></div>
                <ol>{aimClips.map((clip, index) => <li key={`${clip.name}:${clip.size}:${clip.lastModified}`}><button type="button" aria-pressed={fileName === clip.name} onClick={() => loadVideo(clip)}><span>CLIP {String(index + 1).padStart(2, "0")}</span><strong>{clip.name}</strong><small>{Math.max(1, Math.round(clip.size / 1024 / 1024))} MB</small></button></li>)}</ol>
              </div> : null}
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
                      setStatus({ message: "場面の確認が終わりました。気になった点を選んで解析できます。", tone: "success" });
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
                      : { message: reviewMode === "aim" ? "撃ち始め付近で停止して、AIMの6枚を切り出してください。" : reviewMode === "round" ? "録画を読み込みました。ラウンド開始と終了を指定してください。" : "録画を読み込みました。デス地点の自動検出を開始します。", tone: "success" });
                  }}
                  onError={() => setStatus({ message: "この動画を再生できません。MP4またはWebMをお試しください。", tone: "error" })}
                />
                {!fileName ? <button type="button" className="drop-zone" onClick={() => fileInputRef.current?.click()}><span className="drop-icon"><UploadCloud /></span><strong>録画をドロップ</strong><span>またはクリックして選択</span></button> : null}
                {fileName ? <Badge className="local-badge">LOCAL VOD</Badge> : null}
              </div>
              <div className="video-details">
                <div><small>FILE</small><strong title={fileName}>{fileName || "未選択"}</strong></div>
                <div><small>CURRENT</small><strong>{reviewMode === "aim" ? preciseTime(currentTime) : formatTime(currentTime)}</strong></div>
                <div><small>DURATION</small><strong>{duration ? formatTime(duration) : "--:--"}</strong></div>
              </div>
              {reviewMode === "tactics" ? <><div className="auto-detect-card">
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
                        disabled={isCapturing || isDetectingDeaths || isAnalyzing}
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
                <Button type="button" variant="ghost" disabled={!videoReady || videoTooLong || isDetectingDeaths || isCapturing || isAnalyzing} onClick={() => void captureFrames()}>
                  <Crosshair /> 現在時刻を追加
                </Button>
              </div>
              </> : reviewMode === "aim" ? <div className="aim-capture-controls">
                <div><p className="eyebrow">MANUAL CHECK / 0.8 SECOND WINDOW</p><h3>クリップ内の撃ち合いを、6枚で確認</h3><p>Windowsアプリの自動クリップ、または手元の録画を使えます。同じ敵と照準が見える時刻で停止してください。</p></div>
                <label>切り出す範囲<NativeSelect value={aimCrop} disabled={isCapturing || isAnalyzing} onChange={event => changeReviewMode("aim", event.target.value as AimCrop)}><NativeSelectOption value="center">中央を拡大（照準付近）</NativeSelectOption><NativeSelectOption value="full">全画面（敵が中央にいないとき）</NativeSelectOption></NativeSelect></label>
                <div className="aim-seek-controls">{[-0.03, 0.03].map(delta => <Button key={delta} variant="outline" size="sm" disabled={!videoReady || isCapturing || isAnalyzing} onClick={() => { const video = videoRef.current; if (video) { video.pause(); video.currentTime = Math.max(0, Math.min(video.duration - .05, video.currentTime + delta)); } }}>{delta < 0 ? "−0.03秒" : "＋0.03秒"}</Button>)}<Button disabled={!videoReady || videoTooLong || isCapturing || isAnalyzing} onClick={() => void captureFrames()}><Crosshair /> この時刻のAIMを切り出す</Button></div>
                <p className="aim-method-note">選んだ時刻の前0.4秒〜後0.4秒。中央拡大は固定の正方形です。敵・照準が隠れている場合は範囲や時刻を変えてください。基準時刻は実際の初弾時刻を自動検出したものではありません。</p>
              </div> : <div className="round-capture-controls">
                <div><p className="eyebrow">ROUND / SIX TIMELINE FRAMES</p><h3>開始から終了まで、ラウンド全体を見る</h3><p>動画をラウンド開始で止めて「開始に設定」、次に決着後で止めて「終了に設定」を押してください。</p></div>
                <div className="round-marker-grid">
                  <div><small>START</small><strong>{roundStart === null ? "未設定" : formatTime(roundStart)}</strong><Button type="button" variant="outline" disabled={!videoReady || isCapturing || isAnalyzing} onClick={() => { const video = videoRef.current; if (!video) return; const time = Math.min(video.currentTime, video.duration - .05); setRoundStart(time); setRoundEnd(null); setFrames([]); setReview(null); setStatus({ message: `${formatTime(time)}をラウンド開始に設定しました。決着後へ移動してください。`, tone: "success" }); }}><Play /> 現在時刻を開始に設定</Button></div>
                  <div><small>END</small><strong>{roundEnd === null ? "未設定" : formatTime(roundEnd)}</strong><Button type="button" variant="outline" disabled={!videoReady || roundStart === null || isCapturing || isAnalyzing} onClick={() => { const video = videoRef.current; if (!video || roundStart === null) return; const time = Math.min(video.currentTime, video.duration - .05); if (time - roundStart < 10 || time - roundStart > 300) { setStatus({ message: "終了は開始の10秒〜5分後に設定してください。", tone: "error" }); return; } setRoundEnd(time); setFrames([]); setReview(null); setStatus({ message: `${formatTime(time)}をラウンド終了に設定しました。6枚を切り出せます。`, tone: "success" }); }}><CheckCircle2 /> 現在時刻を終了に設定</Button></div>
                </div>
                <Button type="button" disabled={!videoReady || roundStart === null || roundEnd === null || isCapturing || isAnalyzing} onClick={() => void captureRoundFrames()}><UsersRound /> ラウンド全体を6枚で切り出す</Button>
                <p className="aim-method-note">10秒〜5分の区間に対応。開始・序盤・中盤・終盤・決着前・終了の6枚を端末内で作成します。</p>
              </div>}
              {isCapturing ? <div className="capture-progress"><Progress value={captureProgress} /><span>{captureProgress}%</span></div> : null}
              {reviewReady ? (
                <div className="review-window-row">
                  <Button type="button" variant="outline" disabled={isCapturing || isReviewPlaying} onClick={() => void playReviewWindow()}>
                    <Play /> {isReviewPlaying ? "場面を再生中…" : reviewMode === "aim" ? "前後0.4秒を再生" : reviewMode === "round" ? "ラウンド全体を再生" : "デス前20秒〜後5秒を再生"}
                  </Button>
                  <span>{reviewMode === "aim" ? `選択時刻 ${preciseTime(deathTimestamp)}` : reviewMode === "round" && roundStart !== null && roundEnd !== null ? `ラウンド ${formatTime(roundStart)}〜${formatTime(roundEnd)}` : `${deathSource === "auto" ? "自動検出" : "手動追加"} ${formatTime(deathTimestamp)}`}</span>
                </div>
              ) : null}
            </section>

            <section className="panel frames-panel">
              <SectionHeading step="02" eyebrow="TIMELINE SAMPLES" title="解析フレーム" trailing={<Badge variant="outline">{frames.length} / 6</Badge>} />
              {frames.length ? (
                <div className={`frame-grid ${reviewMode === "aim" ? "aim-frames" : ""}`}>
                  {frames.map((frame) => (
                    <figure key={`${frame.time}-${frame.label}`}>
                      <img src={frame.dataUrl} alt={frame.label} />
                      <figcaption><span>{frame.label}</span><time>{reviewMode === "aim" ? preciseTime(frame.time) : formatTime(frame.time)}</time></figcaption>
                    </figure>
                  ))}
                </div>
              ) : <div className="empty-frames"><Target /><div><strong>{isDetectingDeaths ? "デスを探しています" : "まだ場面がありません"}</strong><span>{reviewMode === "aim" ? "撃ち始め付近で停止し、上のボタンから切り出します。" : reviewMode === "round" ? "ラウンド開始と終了を指定すると、全体から6枚を切り出せます。" : isDetectingDeaths ? "検出後、最初のデス前20秒〜後5秒が自動で並びます。" : "録画を選ぶとデス地点を自動検出します。"}</span></div></div>}
              {reviewMode === "aim" && frames.length === 6 ? <AimMeasurement key={`${frames[0].dataUrl.slice(-80)}:${deathTimestamp}:${aimCrop}`} frames={frames} /> : null}
            </section>
          </div>

          <aside className="secondary-column">
            <section className="panel context-panel">
              <div className="allowance-box" aria-live="polite">
                <strong>{!serviceReady ? "AIレビューは準備中" : currentAllowance ? `${currentAllowance.tier} · ${reviewMode === "aim" ? "ミクロ" : tacticsCoach === "riot" ? "立ち回り" : "Deep"} 残り ${currentAllowance.remaining} / ${currentAllowance.limit}試合` : "解析にはログインが必要です"}</strong>
                <p>{serviceReady ? `このモードでは1試合につき最大3解析。${recordingId ? `この録画は${currentScenes} / 3場面を解析済み。` : currentAllowance?.tier === "無料体験" ? "無料体験は全モード合計で1アカウント1試合です。" : "未使用枠は月2試合まで別モードへ自動振替できます。"}` : "録画の切り出しとサンプルは利用できます。購入・請求はありません。"}</p>
                {allowanceError ? <p role="alert">{allowanceError}</p> : null}
                <Button variant="ghost" size="sm" onClick={() => void reloadAllowance()}><RotateCcw /> 利用状況を更新</Button>
                {serviceReady && !signedIn ? <a href="/login" target="_top">ログインして無料体験</a> : null}
              </div>
              <SectionHeading step="03" eyebrow="ADD CONTEXT" title="試合情報（任意）" />
              <div className="form-grid">
                <label><span>マップ</span><NativeSelect value={map} onChange={(event) => setMap(event.target.value)}><NativeSelectOption value="">選択</NativeSelectOption>{MAPS.map((item) => <NativeSelectOption key={item}>{item}</NativeSelectOption>)}</NativeSelect></label>
                <label><span>エージェント</span><Input value={agent} onChange={(event) => setAgent(event.target.value)} maxLength={40} placeholder="例：Sova" /></label>
                <label><span>ロール</span><NativeSelect value={role} onChange={(event) => setRole(event.target.value)}>{["不明", "イニシエーター", "デュエリスト", "コントローラー", "センチネル"].map((item) => <NativeSelectOption key={item}>{item}</NativeSelectOption>)}</NativeSelect></label>
                <label><span>攻守</span><NativeSelect value={side} onChange={(event) => setSide(event.target.value)}>{["攻め", "守り", "不明"].map((item) => <NativeSelectOption key={item}>{item}</NativeSelectOption>)}</NativeSelect></label>
                <label><span>ラウンド</span><Input value={round} onChange={(event) => setRound(event.target.value)} type="number" min="1" max="50" placeholder="例：7" /></label>
              </div>
              <fieldset className="tag-fieldset">
                <legend>自分で気になった点 <small>任意・複数</small></legend>
                <div className="tag-list">{(reviewMode === "aim" ? ["照準の高さ", "初期位置", "大きな修正", "追いAIM", "小さな修正"] : reviewMode === "round" ? ["初期配置", "人数配分", "情報取得", "ローテ", "ラウンド敗因"] : TAGS).map((tag) => {
                  const active = selectedTags.includes(tag);
                  return <Button key={tag} type="button" size="sm" variant="outline" aria-pressed={active} className={active ? "tag-active" : ""} onClick={() => toggleTag(tag)}>{active ? <CheckCircle2 /> : null}{tag}</Button>;
                })}</div>
              </fieldset>
              <label className="note-field"><span>補足メモ <small>任意</small></span><Textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} placeholder={reviewMode === "aim" ? "例：Vandal、20m程度。同じ敵を狙った場面。" : reviewMode === "round" ? "例：守り。Aサイトへのラッシュ対応で敗北したラウンド。" : "例：Aリテイク。味方のフラッシュを待てず先にピークした。"} /></label>
              <div className={`status-line ${status.tone}`} role="status" aria-live="polite">
                {status.tone === "error" ? <AlertTriangle /> : status.tone === "success" ? <CheckCircle2 /> : <Clock3 />}<span>{status.message}</span>
              </div>
              <Button type="button" size="lg" disabled={!reviewReady || isAnalyzing || (reviewMode !== "aim" && tacticsCoach === "riot" && !riotReady) || !serviceReady || !signedIn || Boolean(allowanceError)} onClick={() => void analyze()} className="analyze-button">
                {isAnalyzing ? <LoaderCircle className="spin" /> : <Sparkles />}{isAnalyzing ? "AI解析中…" : reviewMode === "round" ? "このラウンドをレビュー" : "この場面の改善点を確認"}
              </Button>
              <Button type="button" variant="ghost" disabled={isAnalyzing} onClick={() => finishReview(demoReview(selectedTags[0], reviewMode), "demo", "デモレビューを表示しました。月間ミッション・XPは変更されません。")} className="demo-button"><Play /> サンプルレビューを見る</Button>
              {reviewMode === "aim" ? <p className="aim-result-note">Windowsアプリの30秒クリップをAIが確認し、ピーク方法・クロスヘア・照準修正・ストッピング・射撃制御を試合後に解析します。この画面の6枚確認は、細かい照準位置を見直す手動機能です。</p> : reviewMode === "round" ? <p className="aim-result-note">ラウンドレビューは初期配置から敗因までを確認します。画像間の通話や画面外の動きは断定せず、月間ミッションとXPの判定対象にはしません。</p> : null}
              <p className="cost-note">{reviewMode === "aim" ? "自動クリップは選択した30秒動画をAIへ送信します。手動確認は最大6枚の画像だけをAIへ送ります。" : "最大6枚の画像・試合情報・練習課題をAIへ送ります。動画全体・音声は送りません。"}無料体験・有料プランの範囲内では追加料金はありません。</p>
            </section>

            <section className="panel result-panel" ref={resultRef}>
              <SectionHeading step="04" eyebrow="COACHING OUTPUT" title="今回のレビュー" trailing={review ? <Badge className={`confidence ${review.confidence}`}>{isDemo ? "表示例・未解析" : review.status === "insufficient" ? "判定保留" : `確度 ${({low: "低", medium: "中", high: "高"})[review.confidence]}`}</Badge> : undefined} />
              {review ? (
                <div className="review-content">
                  <p className="review-kicker">{reviewModeLabel(review.mode)} · {isDemo ? "サンプル · あなたの録画の解析結果ではありません" : "次の試合で直すこと"}</p>
                  <h3>{review.headline}</h3>
                  {review.mission_check && review.mission_check.status !== "not_applicable" ? (
                    <div className={`mission-check-card ${review.mission_check.status}`}>
                      <Award />
                      <div><small>前回ミッションのAI判定</small><strong>{review.mission_check.status === "cleared" ? `クリア・+${XP_PER_CLEAR} XP` : review.mission_check.status === "improving" ? "改善中・XPはクリア後" : review.mission_check.status === "not_cleared" ? "未クリア・次の録画へ継続" : "判定保留・次の録画へ継続"}</strong><p>{review.mission_check.evidence}</p></div>
                    </div>
                  ) : null}
                  <div className="focus-card"><Crosshair /><div><small>{review.mode === "aim" ? "次のAIM練習" : review.mode === "round" ? "次のラウンドの課題" : "現在の成長ミッション"}</small><strong>{isDemo || review.mode === "aim" || review.mode === "round" ? review.next_focus : growthProgress.activeMission?.text || review.next_focus}</strong></div></div>
                  <div className="issue-card"><div><span>主な問題</span><Badge variant="outline">{review.main_issue.category}</Badge></div><p>{review.main_issue.evidence}</p></div>
                  {review.mode === "round" && review.round_review ? <div className="round-review-grid" aria-label="ラウンドレビュー5項目">
                    {([
                      ["初期配置", review.round_review.initial_setup],
                      ["人数配分", review.round_review.player_distribution],
                      ["情報取得", review.round_review.information_gained],
                      ["ローテ", review.round_review.rotation],
                      ["ラウンド敗因", review.round_review.loss_reason],
                    ] as const).map(([label, value], index) => <article key={label}><span>{String(index + 1).padStart(2, "0")}</span><div><h4>{label}</h4><p>{value}</p></div></article>)}
                  </div> : null}
                  <div className="review-block"><h4>画面で確認できたこと</h4><ul>{review.observed.map((item) => <li key={item}>{item}</li>)}</ul></div>
                  {!isDemo && review.evidence_frames?.length ? <div className="review-block"><h4>結論の根拠となる場面</h4><div className="evidence-list">{review.evidence_frames.map((item, index) => {
                    const frame = frames.find(frame => Math.abs(frame.time - item.time) < 0.01);
                    return <button type="button" key={`${item.time}-${index}`} className="evidence-item" onClick={() => { if (videoRef.current) { videoRef.current.currentTime = item.time; videoRef.current.scrollIntoView({ behavior: "smooth", block: "center" }); } }}>
                      {frame ? <img src={frame.dataUrl} alt={`${(review.mode === "aim" ? preciseTime(item.time) : formatTime(item.time))}の根拠画像`} /> : null}<span><strong><Play size={14} /> {(review.mode === "aim" ? preciseTime(item.time) : formatTime(item.time))}を確認</strong>{item.observation}</span>
                    </button>;
                  })}</div></div> : null}
                  <div className="review-block"><h4>改善アクション</h4><ol>{review.improvements.map((item) => <li key={item}>{item}</li>)}</ol></div>
                  <TrainingVideoList
                    compact
                    title="この分析に合うおすすめ動画"
                    description="主な問題と次の練習から、関連する教材を上から3本選びました。"
                    videos={recommendTrainingVideos(
                      review.mode === "aim" ? "aim" : "tactics",
                      [review.main_issue.category, review.main_issue.evidence, review.next_focus, ...review.improvements].join(" "),
                    )}
                  />
                  {!isDemo && analysisId ? <div className="review-feedback"><span>このレビューは役立ちましたか？</span><div><Button size="sm" variant="outline" onClick={() => void submitFeedback("helpful")}>役立った</Button><Button size="sm" variant="outline" onClick={() => void submitFeedback("incorrect")}>根拠・指摘に疑問がある</Button></div><p role="status">{feedbackNotice}</p></div> : null}
                  <p className="uncertainty"><AlertTriangle />{review.uncertainty}</p>
                </div>
              ) : <div className="empty-result"><span><BrainCircuit /></span><strong>レビュー待ち</strong><p>6枚の時系列から、事実・問題・改善行動を分けて整理します。</p></div>}
            </section>
          </aside>
        </div>

        <section className="panel history-panel">
          <SectionHeading step="05" eyebrow="TRAINING LOG" title="レビュー履歴" trailing={<div className="history-actions"><Button type="button" size="sm" variant="outline" onClick={exportHistory}><Download /> 書き出す</Button><Button type="button" size="sm" variant="ghost" onClick={clearHistory}><Trash2 /> 全消去</Button></div>} />
          {historyItems.length ? (
            <div className="history-list">{historyItems.map((entry) => (
              <article key={entry.id} className="history-item">
                <time>{new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(entry.createdAt))}</time>
                <div><strong>{reviewModeLabel(entry.review.mode)} / {entry.metadata.map || "Map未設定"} / {entry.metadata.agent || entry.metadata.role}</strong><span>{entry.metadata.timestamp}・{entry.review.main_issue.category}</span></div>
                <p>{entry.review.next_focus}</p>
                <Button type="button" variant="ghost" size="icon-sm" aria-label="この履歴を削除" onClick={() => deleteHistory(entry.id)}><Trash2 /></Button>
              </article>
            ))}</div>
          ) : <div className="empty-history"><History /><span>解析結果はこのブラウザに最大50件保存されます。</span></div>}
        </section>

        <footer><span><ShieldCheck /> 試合後レビュー専用</span><p>Overwolfはdeathイベントを保存トリガーにだけ使用し、試合中の助言は表示しません。AIの提案は試合後に確認してください。</p></footer>
        <nav className="footer-links" aria-label="運営情報"><a href="/legal">販売条件・運営情報</a><a href="/privacy">データの取り扱い</a></nav>
      </main>

    </div>
  );
}
