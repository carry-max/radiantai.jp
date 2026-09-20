import { access } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { app } from "electron";

type NativeProbe = { ok: true; durationMs: number; width: number; height: number; fps: number; sha256: string };
type NativeFrames = { ok: true; frames: Array<{ path: string; timestampMs: number }> };
type NativeResponse = NativeProbe | NativeFrames | { ok: false; error: string };

export class NativeWorker {
  private readonly binary: string;

  constructor() {
    this.binary = app.isPackaged
      ? path.join(process.resourcesPath, "native", "radiantai-native.exe")
      : path.join(app.getAppPath(), "native", "target", "release", "radiantai-native.exe");
  }

  async available() {
    try { await access(this.binary); return true; }
    catch { return false; }
  }

  async probe(input: string) {
    const result = await this.run({ type: "probe", input });
    if (!("durationMs" in result)) throw new Error("動画情報を読み取れませんでした。");
    return result;
  }

  async extractReplay(input: string, outputDirectory: string, timestampsMs: number[]) {
    const result = await this.run({ type: "extract_replay", input, outputDirectory, timestampsMs });
    if (!("frames" in result)) throw new Error("リプレイのフレームを切り出せませんでした。");
    return result.frames;
  }

  private run(payload: Record<string, unknown>): Promise<Exclude<NativeResponse, { ok: false }>> {
    return new Promise((resolve, reject) => {
      const ffmpeg = process.env.RADIANTAI_FFMPEG_PATH?.trim();
      const ffprobe = process.env.RADIANTAI_FFPROBE_PATH?.trim();
      const child = spawn(this.binary, [], {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, ...(ffmpeg ? { RADIANTAI_FFMPEG: ffmpeg } : {}), ...(ffprobe ? { RADIANTAI_FFPROBE: ffprobe } : {}) },
      });
      let stdout = ""; let stderr = "";
      child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
      child.stdout.on("data", chunk => { stdout += chunk; if (stdout.length > 2_000_000) child.kill(); });
      child.stderr.on("data", chunk => { stderr += chunk; if (stderr.length > 16_000) stderr = stderr.slice(-16_000); });
      const timeout = setTimeout(() => child.kill(), 120_000);
      child.on("error", error => { clearTimeout(timeout); reject(error); });
      child.on("close", code => {
        clearTimeout(timeout);
        try {
          const response = JSON.parse(stdout) as NativeResponse;
          if (code !== 0 || !response.ok) reject(new Error(response.ok ? stderr || `native worker exited ${code}` : response.error));
          else resolve(response);
        } catch { reject(new Error(stderr || "ネイティブ処理の結果を読み取れませんでした。")); }
      });
      child.stdin.end(JSON.stringify(payload));
    });
  }
}
