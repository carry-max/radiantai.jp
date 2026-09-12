import { env } from "@/lib/runtime-env";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Database is unavailable. Check DATABASE_URL or the local SQLite configuration."
    );
  }

  return drizzle(env.DB as Parameters<typeof drizzle>[0], { schema });
}
