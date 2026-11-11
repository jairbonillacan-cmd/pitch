import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Cliente para Neon/Postgres a partir de DATABASE_URL. Una conexión por proceso. */
export function createDb(url: string) {
  const sql = postgres(url, { max: 5, prepare: false });
  return drizzle(sql, { schema });
}
