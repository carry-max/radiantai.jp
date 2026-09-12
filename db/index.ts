import { env } from "@/lib/runtime-env";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "SQLite is unavailable. Check SQLITE_PATH and the server's filesystem permissions."
    );
  }

  return drizzle(env.DB as Parameters<typeof drizzle>[0], { schema });
}
