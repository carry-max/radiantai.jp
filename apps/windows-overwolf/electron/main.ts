import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { ClipRecord, DesktopSnapshot, ReplayRecord } from "../src/contracts.js";
import { RadiantApiClient } from "./api-client.js";
import { ClipStore } from "./clip-store.js";
import { NativeWorker } from "./native-worker.js";
import { OverwolfRuntime } from "./overwolf-runtime.js";

const appVersion = "0.1.0";
let mainWindow: BrowserWindow | null = null;
let store: ClipStore;
let nativeWorker: NativeWorker;
let overwolfRuntime: OverwolfRuntime;
let apiClient: RadiantApiClient;
let state: DesktopSnapshot = {
  runtime: "electron", version: appVersion, phase: "idle", recorder: "stopped", native: "missing", valorantDetected: false,
  gameName: "VALORANT", matchId: "", kills: 0, deaths: 0, clips: [], replays: [], account: { signedIn: false, riotLinked: false }, lastMessage: "VALORANTの起動を待っています。",
};

function broadcast(patch: Partial<DesktopSnapshot> = {}) {
  state = { ...state, ...patch };
  mainWindow?.webContents.send("radiant:snapshot", structuredClone(state));
}

function runtimeKind(): DesktopSnapshot["runtime"] {
  const overwolfApp = app as typeof app & { overwolf?: unknown };
  return overwolfApp.overwolf ? "ow-electron" : "electron";
}

async function loadPersistedState() {
  const saved = store.snapshot();
  const [nativeReady, account] = await Promise.all([nativeWorker.available(), apiClient.refreshAccount().catch(() => ({ signedIn: false, riotLinked: false }))]);
  broadcast({ runtime: runtimeKind(), native: nativeReady ? "ready" : "missing", clips: saved.clips, replays: saved.replays, account });
}

async function onCapturedClip(input: { path: string; matchId: string; deathIndex: number; capturedAt: string }) {
  const info = await stat(input.path);
  let durationMs: number | undefined;
  if (await nativeWorker.available()) durationMs = (await nativeWorker.probe(input.path).catch(() => null))?.durationMs;
  const clip: ClipRecord = {
    id: randomUUID(), path: input.path, fileName: path.basename(input.path), capturedAt: input.capturedAt,
    beforeSeconds: 25, afterSeconds: 5, matchId: input.matchId, deathIndex: input.deathIndex, sizeBytes: info.size, durationMs, analysisPhase: "local",
  };
  await store.upsertClip(clip);
  broadcast({ clips: store.snapshot().clips });
}

async function chooseReplay() {
  if (!(await nativeWorker.available())) throw new Error("Rustワーカーをビルドしてからリプレイを読み込んでください。");
  const selected = await dialog.showOpenDialog(mainWindow!, { title: "VALORANTのリプレイを選択", properties: ["openFile"], filters: [{ name: "動画", extensions: ["mp4", "mkv", "webm", "mov"] }] });
  if (selected.canceled || !selected.filePaths[0]) return null;
  const filePath = selected.filePaths[0];
  const [probe, info] = await Promise.all([nativeWorker.probe(filePath), stat(filePath)]);
  const replay: ReplayRecord = { id: probe.sha256, path: filePath, fileName: path.basename(filePath), sizeBytes: info.size, durationMs: probe.durationMs, width: probe.width, height: probe.height, analysisPhase: "local" };
  await store.upsertReplay(replay); broadcast({ replays: store.snapshot().replays }); return replay;
}

async function analyzeReplay(id: string) {
  const replay = store.replay(id); if (!replay) throw new Error("リプレイが見つかりません。");
  const working = { ...replay, analysisPhase: "analyzing" as const, analysisError: undefined }; await store.upsertReplay(working); broadcast({ replays: store.snapshot().replays });
  const workDirectory = path.join(store.workDirectory, id.slice(0, 16));
  try {
    await mkdir(workDirectory, { recursive: true });
    const timestampsMs = [Math.round(replay.durationMs * .35), Math.round(replay.durationMs * .65)];
    const extracted = await nativeWorker.extractReplay(replay.path, workDirectory, timestampsMs);
    const frames = await Promise.all(extracted.map(async (frame, index) => ({ label: `立ち回り ${index + 1}`, dataUrl: `data:image/jpeg;base64,${(await readFile(frame.path)).toString("base64")}`, time: frame.timestampMs / 1000 })));
    const result = await apiClient.analyzeReplay({ mode: "tactics", tacticsCoach: "replay", clientKind: "windows-app", recordingId: replay.id, deathTimestamp: replay.durationMs / 2000, metadata: { source: "windows-replay", fileName: replay.fileName }, monthlyTracking: true, frames });
    const complete: ReplayRecord = { ...replay, analysisPhase: "complete", review: result.review }; await store.upsertReplay(complete); broadcast({ replays: store.snapshot().replays }); return complete;
  } catch (error) {
    const failed: ReplayRecord = { ...replay, analysisPhase: "error", analysisError: error instanceof Error ? error.message : "解析できませんでした。" }; await store.upsertReplay(failed); broadcast({ replays: store.snapshot().replays }); throw error;
  } finally { await rm(workDirectory, { recursive: true, force: true }).catch(() => undefined); }
}

async function analyzeClip(id: string) {
  const clip = store.clip(id); if (!clip) throw new Error("クリップが見つかりません。");
  const uploading = { ...clip, analysisPhase: "uploading" as const, analysisError: undefined }; await store.upsertClip(uploading); broadcast({ clips: store.snapshot().clips });
  try {
    const recordingId = createHash("sha256").update(clip.matchId).digest("hex");
    const result = await apiClient.uploadAndAnalyzeClip(clip.path, { source: "overwolf-death-clip", recordingId, matchId: clip.matchId, deathIndex: clip.deathIndex, beforeSeconds: 25, afterSeconds: 5 });
    const complete: ClipRecord = { ...clip, analysisPhase: "complete", review: result.review || result }; await store.upsertClip(complete); broadcast({ clips: store.snapshot().clips }); return complete;
  } catch (error) {
    const failed: ClipRecord = { ...clip, analysisPhase: "error", analysisError: error instanceof Error ? error.message : "解析できませんでした。" }; await store.upsertClip(failed); broadcast({ clips: store.snapshot().clips }); throw error;
  }
}

async function openLogin() {
  const login = new BrowserWindow({ parent: mainWindow || undefined, modal: true, width: 520, height: 760, autoHideMenuBar: true, webPreferences: { partition: "persist:radiantai", contextIsolation: true, nodeIntegration: false, sandbox: true } });
  await login.loadURL(`${apiClient.origin}/login`);
  await new Promise<void>(resolve => login.once("closed", resolve));
  const account = await apiClient.refreshAccount(); broadcast({ account }); return account;
}

function registerIpc() {
  ipcMain.handle("radiant:get-snapshot", () => structuredClone(state));
  ipcMain.handle("radiant:open-login", () => openLogin());
  ipcMain.handle("radiant:refresh-account", async () => { const account = await apiClient.refreshAccount(); broadcast({ account }); return account; });
  ipcMain.handle("radiant:choose-replay", () => chooseReplay());
  ipcMain.handle("radiant:analyze-replay", (_event, id: string) => analyzeReplay(id));
  ipcMain.handle("radiant:analyze-clip", (_event, id: string) => analyzeClip(id));
  ipcMain.handle("radiant:open-clip-folder", () => shell.openPath(store.clipDirectory).then(() => undefined));
  ipcMain.handle("radiant:retry-recorder", () => overwolfRuntime.retry());
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820, minWidth: 920, minHeight: 680, autoHideMenuBar: true, backgroundColor: "#070b10",
    webPreferences: { preload: path.join(app.getAppPath(), "dist", "electron", "electron", "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: false, partition: "persist:radiantai" },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith("https://")) void shell.openExternal(url); return { action: "deny" }; });
  mainWindow.webContents.on("will-navigate", event => event.preventDefault());
  const rendererUrl = process.env.RADIANTAI_RENDERER_URL?.trim();
  if (rendererUrl) await mainWindow.loadURL(rendererUrl);
  else await mainWindow.loadFile(path.join(app.getAppPath(), "dist", "renderer", "index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  store = new ClipStore(app.getPath("userData"), app.getPath("videos"));
  nativeWorker = new NativeWorker(); apiClient = new RadiantApiClient(); overwolfRuntime = new OverwolfRuntime(store.clipDirectory);
  await store.initialize(); registerIpc(); await createWindow(); await loadPersistedState();
  overwolfRuntime.on("state", patch => broadcast(patch));
  overwolfRuntime.on("clip", clip => void onCapturedClip(clip));
  overwolfRuntime.initialize();
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (!mainWindow) void createWindow(); });
