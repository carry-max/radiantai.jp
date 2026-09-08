import { getMissionDb, getMonthlySummary } from "@/lib/monthly-store";
import { getSiteUser } from "@/lib/site-user";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  const user = getSiteUser(request);
  if (!user) return Response.json({ error: "ミッションを保存するにはログインしてください。" }, { status: 401, headers });
  try {
    return Response.json(await getMonthlySummary(getMissionDb(), user.id), { headers });
  } catch (error) {
    console.error("monthly mission read failed", error instanceof Error ? error.message : "storage error");
    return Response.json({ error: "月間ミッションを読み込めませんでした。再読み込みをお試しください。" }, { status: 503, headers });
  }
}
