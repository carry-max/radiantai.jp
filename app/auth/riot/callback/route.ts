import { authConfig } from "@/lib/supabase-auth";
import { getMissionDb } from "@/lib/monthly-store";
import { finishRiotFlow, readRiotFlow, riotRedirect, saveRiotConnection } from "@/lib/riot-auth";
import { getSiteUser, withAuth } from "@/lib/site-user";

export const GET = withAuth(async (request: Request) => {
  if (new URL(request.url).origin !== authConfig().origin) return Response.json({ error: "連携先のURLを確認してください。" }, { status: 400 });
  const url = new URL(request.url);
  const flow = readRiotFlow(request);
  if (url.searchParams.has("error")) return riotRedirect("riot-cancelled", true);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const user = await getSiteUser(request);
  if (!flow || !code || code.length > 2048 || state !== flow.state || !user || user.id !== flow.account) return riotRedirect("riot-expired", true);
  try {
    await saveRiotConnection(getMissionDb(), user.id, await finishRiotFlow(code, flow));
    return riotRedirect("riot-linked", true);
  } catch (error) {
    console.error("Riot connection failed", error instanceof Error ? error.message : "unknown");
    return riotRedirect("riot-unavailable", true);
  }
});
