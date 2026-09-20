import { EventEmitter } from "node:events";
import { app as electronApp } from "electron";
import { kGameIds } from "@overwolf/ow-electron-packages-types/game-list";
import type { CaptureSettingsBuilder, GepGameLaunchEvent, IOverwolfRecordingApi, OverwolfGameEventPackage, ReplayVideo } from "@overwolf/ow-electron-packages-types";

type GameInfo = { name?: string; processInfo?: { pid?: number; isElevated?: boolean }; type?: string };
type RuntimePatch = { valorantDetected?: boolean; gameName?: string; phase?: "idle" | "game_detected" | "in_match" | "match_finished" | "error"; recorder?: "unavailable" | "stopped" | "buffering" | "capturing"; matchId?: string; kills?: number; deaths?: number; lastMessage?: string };
type CapturedClip = { path: string; matchId: string; deathIndex: number; capturedAt: string };

export class OverwolfRuntime extends EventEmitter {
  private gep?: OverwolfGameEventPackage;
  private recorder?: IOverwolfRecordingApi;
  private game?: GameInfo;
  private replayStarted = false;
  private capturePending = false;
  private matchId = "";
  private deaths = 0;
  private kills = 0;

  constructor(private readonly outputDirectory: string) { super(); }

  initialize() {
    const app = electronApp as typeof electronApp & { overwolf?: { packages?: { on?: (...args: unknown[]) => void; gep?: OverwolfGameEventPackage; recorder?: IOverwolfRecordingApi } } };
    const packages = app.overwolf?.packages;
    if (!packages?.on) { this.patch({ recorder: "unavailable", lastMessage: "Overwolf Electronで起動すると自動検出が有効になります。" }); return; }
    packages.on("ready", (_event: unknown, name: string) => {
      if (name === "gep" && packages.gep) this.connectGep(packages.gep);
      if (name === "recorder" && packages.recorder) this.connectRecorder(packages.recorder);
    });
    // When the renderer reloads during development, a package may already be ready.
    if (packages.gep) this.connectGep(packages.gep);
    if (packages.recorder) this.connectRecorder(packages.recorder);
  }

  async retry() {
    if (this.game && this.recorder && !this.replayStarted) await this.startReplayBuffer();
  }

  private connectGep(gep: OverwolfGameEventPackage) {
    if (this.gep === gep) return;
    this.gep = gep;
    gep.removeAllListeners();
    gep.on("game-detected", (event: GepGameLaunchEvent, gameId: number, name: string, gameInfo: GameInfo) => {
      if (gameId !== kGameIds.VALORANT) return;
      event.enable(); this.game = gameInfo; this.matchId = crypto.randomUUID(); this.kills = 0; this.deaths = 0;
      this.patch({ valorantDetected: true, gameName: name || "VALORANT", matchId: this.matchId, phase: "game_detected", kills: 0, deaths: 0, lastMessage: "VALORANTを検出しました。録画バッファを準備しています。" });
      void gep.setRequiredFeatures(gameId, ["me", "game_info", "match_info", "kill", "death"]).catch(error => this.fail("ゲームイベントを準備できません。", error));
      void this.startReplayBuffer();
    });
    gep.on("new-game-event", (_event: unknown, gameId: number, data: unknown) => { if (gameId === kGameIds.VALORANT) void this.handleEvents(data); });
    gep.on("game-exit", (_event: unknown, gameId: number) => { if (gameId === kGameIds.VALORANT) void this.handleGameExit(); });
    gep.on("elevated-privileges-required", (_event: unknown, gameId: number) => { if (gameId === kGameIds.VALORANT) this.patch({ phase: "error", lastMessage: "VALORANTとRadiantAIを同じ権限で起動してください。" }); });
    gep.on("error", (_event: unknown, gameId: number, error: unknown) => { if (gameId === kGameIds.VALORANT) this.fail("Overwolfのゲームイベントを取得できません。", error); });
  }

  private connectRecorder(recorder: IOverwolfRecordingApi) {
    if (this.recorder === recorder) return;
    this.recorder = recorder;
    process.env.RADIANTAI_FFMPEG_PATH = recorder.ffmpegPath;
    process.env.RADIANTAI_FFPROBE_PATH = recorder.ffprobePath;
    recorder.registerGames({ gamesIds: [kGameIds.VALORANT] });
    recorder.on("replays-started", () => this.patch({ recorder: "buffering", phase: "in_match", lastMessage: "Deathを待機しています。" }));
    recorder.on("replays-stopped", () => this.patch({ recorder: "stopped" }));
    recorder.on("replay-captured", (video: ReplayVideo) => this.finishCapture(video));
    if (this.game) void this.startReplayBuffer();
  }

  private async startReplayBuffer() {
    if (!this.recorder || !this.game || this.replayStarted) return;
    if (this.game.processInfo?.isElevated) { this.patch({ recorder: "unavailable", phase: "error", lastMessage: "権限が異なるため録画できません。" }); return; }
    try {
      const builder: CaptureSettingsBuilder = await this.recorder.createSettingsBuilder({ includeDefaultAudioSources: true, separateAudioTracks: false });
      if (this.game.processInfo?.pid) builder.addGameSource({ gameProcess: this.game.processInfo.pid, captureOverlays: false });
      await this.recorder.startReplays({ rootFolder: this.outputDirectory, bufferSecond: 35, autoShutdownOnGameExit: true }, builder.build());
      this.replayStarted = true;
    } catch (error) { this.fail("録画バッファを開始できません。", error); }
  }

  private async handleEvents(input: unknown) {
    const root = input as { events?: unknown[]; name?: string; key?: string; feature?: string };
    const events = Array.isArray(root?.events) ? root.events : [root];
    for (const raw of events) {
      const event = raw as { name?: string; key?: string; feature?: string };
      const name = String(event?.name || event?.key || event?.feature || "").toLowerCase();
      if (name.includes("match_start")) this.patch({ phase: "in_match" });
      if (name === "kill" || name.includes("player_kill")) { this.kills++; this.patch({ kills: this.kills }); }
      if (name === "death" || name.includes("player_death")) { this.deaths++; this.patch({ deaths: this.deaths }); await this.captureDeath(); }
      if (name.includes("match_end")) this.patch({ phase: "match_finished", lastMessage: "試合が終了しました。クリップを選んで解析できます。" });
    }
  }

  private async captureDeath() {
    if (!this.recorder || !this.replayStarted || this.capturePending) return;
    this.capturePending = true;
    this.patch({ recorder: "capturing", lastMessage: `Death ${this.deaths} の前後30秒を保存しています。` });
    try {
      const fileName = `death-${this.matchId}-${String(this.deaths).padStart(2, "0")}`;
      await this.recorder.captureReplay({ fileName, pastDuration: 25_000, timeout: 5_000 }, video => this.finishCapture(video));
    } catch (error) { this.capturePending = false; this.fail("デスクリップを保存できません。", error); }
  }

  private finishCapture(video: ReplayVideo) {
    if (!this.capturePending || !video.filePath) return;
    this.capturePending = false;
    this.patch({ recorder: "buffering", lastMessage: `Death ${this.deaths} のクリップを保存しました。` });
    this.emit("clip", { path: video.filePath, matchId: this.matchId, deathIndex: this.deaths, capturedAt: new Date().toISOString() } satisfies CapturedClip);
  }

  private async handleGameExit() {
    try { if (this.recorder && this.replayStarted) await this.recorder.stopReplays(); } catch { /* recorder also stops on game exit */ }
    this.game = undefined; this.replayStarted = false;
    this.patch({ valorantDetected: false, phase: "match_finished", recorder: "stopped", lastMessage: "VALORANTを終了しました。保存済みクリップを解析できます。" });
  }

  private patch(patch: RuntimePatch) { this.emit("state", patch); }
  private fail(message: string, error: unknown) { console.error(message, error); this.patch({ phase: "error", recorder: "unavailable", lastMessage: message }); }
}
