import { accountRedirect, authConfig, authForm, verifiedSupabaseUser } from "@/lib/supabase-auth";
import { getLegacySiteUser, getSiteUser, withAuth } from "@/lib/site-user";
import { authSubject, importLegacyAccount } from "@/lib/auth-accounts";
import { getMissionDb } from "@/lib/monthly-store";

export const POST = withAuth(async (request: Request) => {
  const form = await authForm(request);
  if (!form) return Response.json({ error: "このサイトから操作してください。" }, { status: 403 });
  if (!authConfig().configured) return accountRedirect("setup");
  const legacy = getLegacySiteUser(request);
  const current = await getSiteUser(request);
  const verified = await verifiedSupabaseUser(request);
  if (!legacy || !current || !verified || form.get("account") !== current.id) return accountRedirect("account-changed");
  const result = await importLegacyAccount(getMissionDb(), await authSubject(authConfig().url, verified.id), legacy.id);
  return accountRedirect(result === "conflict" ? "import-conflict" : "imported");
});
