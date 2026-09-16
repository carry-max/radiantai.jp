import { authForm } from "@/lib/supabase-auth";
import { riotRedirect, startRiotFlow } from "@/lib/riot-auth";
import { getSiteUser, withAuth } from "@/lib/site-user";

export const POST = withAuth(async (request: Request) => {
  const form = await authForm(request);
  if (!form) return Response.json({ error: "このサイトから操作してください。" }, { status: 403 });
  const user = await getSiteUser(request);
  if (!user || form.get("account") !== user.id) return riotRedirect("account-changed");
  const flow = await startRiotFlow(user.id);
  if (!flow) return riotRedirect("riot-pending");
  return new Response(null, { status: 303, headers: { Location: flow.destination.toString(), "Set-Cookie": flow.cookie } });
});
