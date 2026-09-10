import { accountRedirect, authConfig, authForm, clearAuthCookies, getSupabase } from "@/lib/supabase-auth";
import { getSiteUser, withAuth } from "@/lib/site-user";

export const POST = withAuth(async (request: Request) => {
  const form = await authForm(request);
  if (!form) return Response.json({ error: "このサイトから操作してください。" }, { status: 403 });
  if (!authConfig().configured) return accountRedirect("setup");
  let remoteFailed = false;
  try {
    const user = await getSiteUser(request);
    if (user && form.get("account") !== user.id) return accountRedirect("account-changed");
    const { error } = await getSupabase(request).auth.signOut({ scope: "local" });
    remoteFailed = Boolean(error);
  } catch {
    // A service outage must not leave a session on a shared browser.
    remoteFailed = true;
  }
  clearAuthCookies(request);
  return accountRedirect(remoteFailed ? "signed-out-local" : "signed-out");
});
