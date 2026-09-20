import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClipRecord, ReplayRecord } from "../src/contracts.js";

type PersistedState = { clips: ClipRecord[]; replays: ReplayRecord[] };

export class ClipStore {
  readonly clipDirectory: string;
  readonly workDirectory: string;
  private readonly statePath: string;
  private state: PersistedState = { clips: [], replays: [] };

  constructor(dataDirectory: string, videoDirectory: string) {
    this.statePath = path.join(dataDirectory, "windows-state.json");
    this.clipDirectory = path.join(videoDirectory, "RadiantAI", "Death Clips");
    this.workDirectory = path.join(dataDirectory, "native-work");
  }

  async initialize() {
    await Promise.all([mkdir(path.dirname(this.statePath), { recursive: true }), mkdir(this.clipDirectory, { recursive: true }), mkdir(this.workDirectory, { recursive: true })]);
    try {
      const parsed = JSON.parse(await readFile(this.statePath, "utf8")) as Partial<PersistedState>;
      this.state = { clips: Array.isArray(parsed.clips) ? parsed.clips.slice(0, 100) : [], replays: Array.isArray(parsed.replays) ? parsed.replays.slice(0, 30) : [] };
    } catch { this.state = { clips: [], replays: [] }; }
  }

  snapshot() { return structuredClone(this.state); }

  async upsertClip(clip: ClipRecord) {
    this.state.clips = [clip, ...this.state.clips.filter(item => item.id !== clip.id)].slice(0, 100);
    await this.save();
    return clip;
  }

  async upsertReplay(replay: ReplayRecord) {
    this.state.replays = [replay, ...this.state.replays.filter(item => item.id !== replay.id)].slice(0, 30);
    await this.save();
    return replay;
  }

  clip(id: string) { return this.state.clips.find(item => item.id === id); }
  replay(id: string) { return this.state.replays.find(item => item.id === id); }

  private async save() {
    const temporary = `${this.statePath}.tmp`;
    await writeFile(temporary, JSON.stringify(this.state, null, 2), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.statePath);
  }
}
