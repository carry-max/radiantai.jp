import { readFile } from "node:fs/promises";
import { session } from "electron";
import { createClient } from "@supabase/supabase-js";
import type { AccountState } from "../src/contracts.js";

type SessionResponse = { user: { id: string; name?: string } | null; riot?: { connection?: unknown } };
type UploadTicket = { bucket: string; path: string; token: string; supabaseUrl: string; publishableKey: string };

export class RadiantApiClient {
  readonly origin: string;
  private account: AccountState = { signedIn: false, riotLinked: false };

  constructor(origin = process.env.RADIANTAI_SITE_URL || "https://radiantai.jp") {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) throw new Error("RADIANTAI_SITE_URLを確認してください。");
    this.origin = parsed.origin;
  }

  currentAccount() { return { ...this.account }; }

  async refreshAccount() {
    const response = await session.fromPartition("persist:radiantai").fetch(`${this.origin}/auth/session`, { cache: "no-store" });
    if (!response.ok) { this.account = { signedIn: false, riotLinked: false }; return this.currentAccount(); }
    const data = await response.json() as SessionResponse;
    this.account = data.user ? { signedIn: true, id: data.user.id, name: data.user.name || "プレイヤー", riotLinked: Boolean(data.riot?.connection) } : { signedIn: false, riotLinked: false };
    return this.currentAccount();
  }

  async uploadAndAnalyzeClip(filePath: string, metadata: Record<string, unknown>) {
    const bytes = await readFile(filePath);
    const ticket = await this.post<UploadTicket>("/api/windows/clips/upload-url", { size: bytes.byteLength, contentType: "video/mp4" });
    const supabase = createClient(ticket.supabaseUrl, ticket.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const uploaded = await supabase.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, bytes, { contentType: "video/mp4" });
    if (uploaded.error) throw new Error("クリップを安全に送信できませんでした。");
    return this.post<Record<string, unknown>>("/api/aim/analyze", { storagePath: ticket.path, metadata });
  }

  async analyzeReplay(payload: Record<string, unknown>) {
    return this.post<Record<string, unknown>>("/api/analyze", payload);
  }

  private async post<T>(pathname: string, body: unknown): Promise<T> {
    const account = await this.refreshAccount();
    if (!account.signedIn || !account.id) throw new Error("RadiantAIへログインしてください。");
    const response = await session.fromPartition("persist:radiantai").fetch(`${this.origin}${pathname}`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json", "Origin": this.origin, "X-Radiant-Account": account.id },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null) as (T & { error?: string }) | null;
    if (!response.ok || !result) throw new Error(result?.error || "RadiantAI APIへ接続できませんでした。");
    return result;
  }
}
