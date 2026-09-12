import { authConfig, authResponse, AuthUnavailable, verifiedSupabaseUser } from "@/lib/supabase-auth";
import { authSubject, pinAccount, resolveAccount } from "@/lib/auth-accounts";
import { getMissionDb } from "@/lib/monthly-store";
import { env } from "@/lib/runtime-env";

export type SiteUser = {
  id: string;
  email: string;
};

export function getLegacySiteUser(request: Request): SiteUser | null {
  if (env.STANDARD_NEXT_RUNTIME === "true") return null;
  const id = request.headers.get("oai-authenticated-user-id")?.trim() || "";
  const email = request.headers.get("oai-authenticated-user-email")?.trim() || "";
  if (!id) return null;
  return { id, email };
}

const users = new WeakMap<Request, Promise<SiteUser | null>>();
export async function getSiteUser(request: Request): Promise<SiteUser | null> {
  if (!authConfig().enabled) return getLegacySiteUser(request);
  let pending = users.get(request);
  if (!pending) {
    pending = (async () => {
      const user = await verifiedSupabaseUser(request);
      if (!user) return null;
      const subject = await authSubject(authConfig().url, user.id);
      return { id: await resolveAccount(getMissionDb(), subject), email: user.email || "" };
    })();
    users.set(request, pending);
  }
  return pending;
}

export function withAuth(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    let response: Response;
    try {
      if (authConfig().enabled && new URL(request.url).pathname.startsWith("/api/")) {
        const expected = request.headers.get("x-radiant-account");
        if (expected || !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
          const user = await getSiteUser(request);
          if (!user) return authResponse(request, Response.json({ error: "ログインしてください。" }, { status: 401 }));
          if (expected !== user.id) return authResponse(request, Response.json({ error: "アカウントが変更されました。ページを再読み込みしてください。", accountChanged: true }, { status: 409 }));
          if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
            const verified = await verifiedSupabaseUser(request);
            if (!verified || !await pinAccount(getMissionDb(), await authSubject(authConfig().url, verified.id), user.id)) {
              return authResponse(request, Response.json({ error: "アカウントが変更されました。ページを再読み込みしてください。", accountChanged: true }, { status: 409 }));
            }
          }
        }
      }
      response = await handler(request);
    } catch (error) {
      console.error("account request unavailable", error instanceof AuthUnavailable ? "authentication" : "service");
      response = Response.json({ error: "ログイン情報または保存データを確認できませんでした。再度お試しください。" }, { status: 503 });
    }
    return authResponse(request, response);
  };
}
