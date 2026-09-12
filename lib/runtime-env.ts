import { getSqliteDatabase } from "@/db/node-sqlite";

// Server-only adapter. Never import this module from Client Components.
export const env = new Proxy({} as Record<string, unknown>, {
  get(_target, key: string) {
    if (key === "STANDARD_NEXT_RUNTIME") return "true";
    if (key === "DB") return getSqliteDatabase();
    return process.env[key];
  },
});
