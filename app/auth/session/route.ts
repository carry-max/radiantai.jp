import { authConfig, verifiedSupabaseUser } from "@/lib/supabase-auth";
import { getLegacySiteUser, getSiteUser, withAuth } from "@/lib/site-user";

export const GET = withAuth(async (request: Request) => {
  const config = authConfig();
  const user = await getSiteUser(request);
  const legacy = getLegacySiteUser(request);
  const verified = config.configured && user ? await verifiedSupabaseUser(request) : null;
  const name = verified?.user_metadata?.full_name || verified?.user_metadata?.name || verified?.user_metadata?.user_name;
  const providers = verified?.identities?.map(identity => identity.provider).filter(provider => ["google", "x", "twitter"].includes(provider)) || [];
  return Response.json({
    mode: config.enabled ? "supabase" : "chatgpt", configured: config.configured,
    user: user ? { ...user, name: typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : user.email || "プレイヤー", providers: verified ? [...new Set(providers)] : ["chatgpt"] } : null,
    canImportHistory: Boolean(verified && user && legacy && user.id !== legacy.id),
    canImportDeviceHistory: Boolean(user && legacy && user.id === legacy.id),
  });
});
