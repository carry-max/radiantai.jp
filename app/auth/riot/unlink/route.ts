import { authForm } from "@/lib/supabase-auth";
import { getMissionDb } from "@/lib/monthly-store";
import { riotRedirect } from "@/lib/riot-auth";
import { getSiteUser, withAuth } from "@/lib/site-user";

export const POST = withAuth(async (request: Request) => {
  const form = await authForm(request);
  if (!form) return Response.json({ error: "このサイトから操作してください。" }, { status: 403 });
  const user = await getSiteUser(request);
  if (!user || form.get("account") !== user.id) return riotRedirect("account-changed");
  await getMissionDb().prepare("DELETE FROM riot_connections WHERE user_id = ?").bind(user.id).run();
  return riotRedirect("riot-unlinked");
});
