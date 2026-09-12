import { getSqliteDatabase } from "@/db/node-sqlite";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getSqliteDatabase().prepare("SELECT 1 AS healthy").first();
    return Response.json({ status: "ok" }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ status: "unavailable" }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
