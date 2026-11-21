import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Db } from "./billing";

export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbExecutor = Db | DbTransaction;

export function createDb(url: string): Db {
  const sql = postgres(url, { max: 5, prepare: false });
  return drizzle(sql);
}

export function withDbTransaction<T>(
  db: Db,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  return db.transaction((tx) => fn(tx));
}
