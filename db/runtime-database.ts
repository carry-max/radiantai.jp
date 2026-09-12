import { getPostgresDatabase } from "@/db/postgres";
import { getSqliteDatabase } from "@/db/node-sqlite";

export function getRuntimeDatabase() {
  const databaseUrl = process.env.SUPABASE_DATABASE_URL?.trim()
    || (!process.env.VERCEL ? process.env.DATABASE_URL?.trim() : "")
    || "";
  if (databaseUrl) return getPostgresDatabase(databaseUrl);
  if (process.env.VERCEL) throw new Error("SUPABASE_DATABASE_URL is required on Vercel");
  return getSqliteDatabase();
}
