import { accountRedirect, authConfig, getSupabase, resetVerifiedUser } from "@/lib/supabase-auth";
import { getSiteUser, withAuth } from "@/lib/site-user";

export const GET = withAuth(async (request: Request) => {
  if (!authConfig().configured) return accountRedirect("setup");
  if (new URL(request.url).origin !== authConfig().origin) return Response.json({ error: "ログイン先のURLを確認してください。" }, { status: 400 });
  const params = new URL(request.url).searchParams;
  if (params.has("error")) return accountRedirect("cancelled");
  const code = params.get("code");
  if (!code || code.length > 2048) return accountRedirect("expired");
  const { error } = await getSupabase(request).auth.exchangeCodeForSession(code);
  if (error) return accountRedirect("expired");
  resetVerifiedUser(request);
  // Only a fresh Auth-server response can identify the visitor.
  if (!await getSiteUser(request)) return accountRedirect("expired");
  return accountRedirect("signed-in");
});
