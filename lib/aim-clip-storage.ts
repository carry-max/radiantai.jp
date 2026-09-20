import "server-only";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/runtime-env";

type StorageEnv = {
  SUPABASE_AUTH_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_AIM_CLIPS_BUCKET?: string;
};

let cached: { fingerprint: string; client: SupabaseClient; url: string; publishableKey: string; bucket: string } | null = null;

function storageConfig() {
  const values = env as unknown as StorageEnv;
  const url = (values.SUPABASE_AUTH_URL || values.NEXT_PUBLIC_SUPABASE_URL || values.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const publishableKey = (values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || values.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  const serviceKey = (values.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const bucket = (values.SUPABASE_AIM_CLIPS_BUCKET || "radiantai-aim-clips").trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !publishableKey || !serviceKey || !/^[a-z0-9][a-z0-9-]{2,62}$/i.test(bucket)) {
    throw new Error("AIM_CLIP_STORAGE_UNAVAILABLE");
  }
  return { url, publishableKey, serviceKey, bucket };
}

function storageAdmin() {
  const config = storageConfig();
  const fingerprint = `${config.url}:${config.serviceKey.slice(-12)}:${config.bucket}`;
  if (!cached || cached.fingerprint !== fingerprint) {
    cached = {
      fingerprint,
      url: config.url,
      publishableKey: config.publishableKey,
      bucket: config.bucket,
      client: createClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }),
    };
  }
  return cached;
}

function ownedPath(userId: string, value: string) {
  if (!/^[0-9a-f-]{20,64}$/i.test(userId) || !value.startsWith(`${userId}/`) || !/^[0-9a-f-]{20,64}\/[0-9a-f-]{36}\.mp4$/i.test(value)) throw new Error("INVALID_CLIP_PATH");
  return value;
}

export async function createAimClipUpload(userId: string) {
  const storage = storageAdmin();
  const path = ownedPath(userId, `${userId}/${randomUUID()}.mp4`);
  const { data, error } = await storage.client.storage.from(storage.bucket).createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.token) throw new Error("AIM_CLIP_UPLOAD_UNAVAILABLE");
  return { bucket: storage.bucket, path, token: data.token, supabaseUrl: storage.url, publishableKey: storage.publishableKey };
}

export async function createAimClipReadUrl(userId: string, path: string) {
  const storage = storageAdmin();
  const safePath = ownedPath(userId, path);
  const { data, error } = await storage.client.storage.from(storage.bucket).createSignedUrl(safePath, 600, { download: false });
  if (error || !data?.signedUrl) throw new Error("AIM_CLIP_READ_UNAVAILABLE");
  return data.signedUrl;
}

export async function removeAimClip(userId: string, path: string) {
  const storage = storageAdmin();
  const safePath = ownedPath(userId, path);
  const { error } = await storage.client.storage.from(storage.bucket).remove([safePath]);
  if (error) console.error("temporary aim clip cleanup failed", error.name);
}
