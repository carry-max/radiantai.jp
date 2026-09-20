export type AppPhase = "idle" | "game_detected" | "in_match" | "match_finished" | "error";
export type RecorderPhase = "unavailable" | "stopped" | "buffering" | "capturing";
export type NativePhase = "ready" | "missing";
export type AnalysisPhase = "local" | "uploading" | "analyzing" | "complete" | "error";

export type ClipRecord = {
  id: string;
  path: string;
  fileName: string;
  capturedAt: string;
  beforeSeconds: 25;
  afterSeconds: 5;
  matchId: string;
  deathIndex: number;
  sizeBytes: number;
  durationMs?: number;
  analysisPhase: AnalysisPhase;
  analysisError?: string;
  review?: unknown;
};

export type ReplayRecord = {
  id: string;
  path: string;
  fileName: string;
  sizeBytes: number;
  durationMs: number;
  width: number;
  height: number;
  analysisPhase: AnalysisPhase;
  review?: unknown;
  analysisError?: string;
};

export type AccountState = {
  signedIn: boolean;
  id?: string;
  name?: string;
  riotLinked: boolean;
};

export type DesktopSnapshot = {
  runtime: "ow-electron" | "electron" | "browser-preview";
  version: string;
  phase: AppPhase;
  recorder: RecorderPhase;
  native: NativePhase;
  valorantDetected: boolean;
  gameName: string;
  matchId: string;
  kills: number;
  deaths: number;
  clips: ClipRecord[];
  replays: ReplayRecord[];
  account: AccountState;
  lastMessage: string;
};

export type RadiantDesktopApi = {
  getSnapshot(): Promise<DesktopSnapshot>;
  subscribe(listener: (snapshot: DesktopSnapshot) => void): () => void;
  openLogin(): Promise<AccountState>;
  refreshAccount(): Promise<AccountState>;
  chooseReplay(): Promise<ReplayRecord | null>;
  analyzeReplay(id: string): Promise<ReplayRecord>;
  analyzeClip(id: string): Promise<ClipRecord>;
  openClipFolder(): Promise<void>;
  retryRecorder(): Promise<void>;
};
