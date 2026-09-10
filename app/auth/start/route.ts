import { authConfig, authForm, accountRedirect, AUTH_PROVIDERS, getSupabase, type AuthProvider } from "@/lib/supabase-auth";
import { getSiteUser, withAuth } from "@/lib/site-user";

export const POST = withAuth(async (request: Request) => {
  if (!authConfig().configured) return accountRedirect("setup");
  const form = await authForm(request);
  if (!form) return Response.json({ error: "このサイトのログインボタンから操作してください。" }, { status: 403 });
  const provider = form.get("provider");
  if (!AUTH_PROVIDERS.includes(provider as AuthProvider)) return accountRedirect("invalid-provider");
  const user = await getSiteUser(request);
  const linking = form.get("intent") === "link";
  if (linking && (!user || form.get("account") !== user.id)) return accountRedirect("account-changed");
  if (!linking && user) return accountRedirect();
  const client = getSupabase(request);
  const options = { redirectTo: `${authConfig().origin}/auth/callback`, skipBrowserRedirect: true };
  const result = linking
    ? await client.auth.linkIdentity({ provider: provider as AuthProvider, options })
    : await client.auth.signInWithOAuth({ provider: provider as AuthProvider, options });
  if (result.error || !result.data.url) return accountRedirect(linking ? "link-unavailable" : "provider-unavailable");
  const destination = new URL(result.data.url);
  if (destination.protocol !== "https:" && !(authConfig().origin.startsWith("http://") && destination.origin === new URL(authConfig().url).origin)) return accountRedirect("provider-unavailable");
  return Response.redirect(destination, 303);
});
