"use client";

import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import Link from "next/link";

export type AccountSnapshot = {
  mode: "supabase" | "chatgpt";
  configured: boolean;
  user: { id: string; email: string; name: string; providers: string[] } | null;
  canImportHistory: boolean;
  canImportDeviceHistory: boolean;
};
type AccountContext = {
  snapshot: AccountSnapshot | null; error: string;
  refresh: () => Promise<void>;
  request: (path: string, init?: RequestInit) => Promise<Response>;
};
const Context = createContext<AccountContext | null>(null);
const NOTICE_KEY = "radiant-review-account-notice-v1";

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    try {
      const response = await fetch("/auth/session", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("ログイン情報を確認できませんでした。再読み込みしてください。");
      const next = await response.json() as AccountSnapshot;
      if (!alive.current || generation.current !== current) return;
      setSnapshot(next); setError("");
      try {
        const identity = next.user?.id || "signed-out";
        if (localStorage.getItem(NOTICE_KEY) !== identity) localStorage.setItem(NOTICE_KEY, identity);
      } catch { /* Authentication does not depend on browser storage. */ }
    } catch (e) {
      if (alive.current && generation.current === current) { setError(e instanceof Error ? e.message : "ログイン情報を確認できませんでした。"); setSnapshot(null); }
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    const changed = (event: StorageEvent) => { if (event.key === NOTICE_KEY) void refresh(); };
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("storage", changed);
    return () => { window.clearTimeout(initialRefresh); alive.current = false; generation.current++; document.removeEventListener("visibilitychange", visible); window.removeEventListener("storage", changed); };
  }, [refresh]);

  const request = useCallback(async (path: string, init: RequestInit = {}) => {
    if (!snapshot) throw new Error(error || "ログイン情報を確認しています。");
    if (!path.startsWith("/api/")) throw new Error("無効なリクエストです。");
    const headers = new Headers(init.headers);
    if (snapshot.user) headers.set("X-Radiant-Account", snapshot.user.id);
    const response = await fetch(path, { ...init, headers, cache: "no-store", credentials: "same-origin" });
    if (response.status === 409) {
      const data = await response.clone().json().catch(() => null) as { accountChanged?: boolean } | null;
      if (data?.accountChanged) { await refresh(); throw new Error("アカウントが変更されました。もう一度操作してください。"); }
    }
    if (response.status === 401 && snapshot.user) { await refresh(); throw new Error("ログインし直してください。"); }
    return response;
  }, [snapshot, error, refresh]);
  return <Context.Provider value={{ snapshot, error, refresh, request }}>
    <Fragment key={snapshot ? snapshot.user?.id || "signed-out" : "checking-account"}>{children}</Fragment>
  </Context.Provider>;
}

export function useAccount() {
  const context = useContext(Context);
  if (!context) throw new Error("AccountProvider is required");
  return context;
}
export function AccountLink() {
  const { snapshot } = useAccount();
  return <Link className="account-link" href="/login"><UserRound aria-hidden="true" /><span>{snapshot?.user ? "アカウント" : "ログイン"}</span></Link>;
}
