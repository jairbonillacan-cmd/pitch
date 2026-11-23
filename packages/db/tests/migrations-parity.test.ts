import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { eq, MIGRATIONS_DIR, schema, sealedPicks, users } from "../src/index";

interface JournalEntry {
  readonly idx: number;
  readonly tag: string;
}

function readMigrationJournal(): readonly JournalEntry[] {
  const raw = readFileSync(join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("_journal.json inválido");
  }
  const entriesRaw: unknown = Reflect.get(parsed, "entries");
  if (!Array.isArray(entriesRaw)) {
    throw new Error("_journal.json sin arreglo entries");
  }
  const out: JournalEntry[] = [];
  for (const item of entriesRaw) {
    if (!item || typeof item !== "object") {
      throw new Error("Entrada inválida en _journal.json");
    }
    const idxVal: unknown = Reflect.get(item, "idx");
    const tagVal: unknown = Reflect.get(item, "tag");
    if (typeof idxVal !== "number" || typeof tagVal !== "string") {
      throw new Error("Entrada de migración sin idx/tag válido");
    }
    out.push({ idx: idxVal, tag: tagVal });
  }
  return out;
}

function readSchemaTableNames(): string[] {
  const names: string[] = [];
  for (const exportedValue of Object.values(schema)) {
    if (is(exportedValue, PgTable)) {
      names.push(getTableName(exportedValue));
    }
  }
  return [...new Set(names)].sort();
}

function extractPgErrorText(err: unknown): string {
  const parts: string[] = [String(err)];
  if (typeof err === "object" && err !== null) {
    const cause: unknown = Reflect.get(err, "cause");
    if (cause !== undefined) {
      parts.push(String(cause));
    }
  }
  return parts.join(" ");
}

async function expectTriggerRejects(promise: Promise<unknown>, codePattern: RegExp): Promise<void> {
  let caught: unknown = null;
  try {
    await promise;
  } catch (err) {
    caught = err;
  }
  expect(caught).not.toBeNull();
  const detail = extractPgErrorText(caught);
  expect(detail).toMatch(/sealed_picks_immutable/);
  expect(detail).toMatch(codePattern);
}

describe("paridad de migraciones 0000..0027 y triggers PGlite", () => {
  it("mantiene paridad 1:1 entre meta/_journal.json y los 28 archivos SQL en disco", () => {
    const entries = readMigrationJournal();
    expect(entries).toHaveLength(28);

    const expectedTags = new Set<string>();
    entries.forEach((entry, position) => {
      expect(entry.idx).toBe(position);
      const sqlFile = `${entry.tag}.sql`;
      expectedTags.add(sqlFile);
      expect(existsSync(join(MIGRATIONS_DIR, sqlFile))).toBe(true);
    });

    expect(entries[0]?.tag).toBe("0000_inicial");
    expect(entries[entries.length - 1]?.tag).toBe("0027_sealed_picks_insert_status_guard");

    const diskSqlFiles = readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    expect(diskSqlFiles).toHaveLength(entries.length);
    for (const fileName of diskSqlFiles) {
      expect(expectedTags.has(fileName)).toBe(true);
    }
  });

  it("aplica las 28 migraciones desde cero en PGlite con paridad de tablas y UNLOGGED rate buckets", async () => {
    const client = new PGlite();
    try {
      const db = drizzle(client);
      await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

      const appliedCountRes = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
      );
      expect(appliedCountRes.rows[0]?.count).toBe("28");

      const pgTablesRes = await client.query<{ table_name: string }>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
      );
      const actualTables = new Set(pgTablesRes.rows.map((r) => r.table_name));
      const expectedTables = readSchemaTableNames();

      for (const tableName of expectedTables) {
        expect(actualTables.has(tableName), `Falta tabla ${tableName} tras 0000..0027`).toBe(true);
      }

      const relRes = await client.query<{ relpersistence: string }>(
        `SELECT relpersistence::text AS relpersistence
         FROM pg_class
         WHERE relname = 'security_rate_buckets' AND relkind = 'r'`,
      );
      expect(relRes.rows[0]?.relpersistence).toBe("u");

      const idxRes = await client.query<{ indexname: string }>(
        `SELECT indexname
         FROM pg_indexes
         WHERE schemaname = 'public' AND tablename = 'security_rate_buckets'`,
      );
      const bucketIndexes = idxRes.rows.map((r) => r.indexname);
      expect(bucketIndexes).toContain("security_rate_buckets_pk");
      expect(bucketIndexes).toContain("security_rate_buckets_expires_idx");
    } finally {
      await client.close();
    }
  });

  it("hace cumplir todas las reglas del trigger sealed_picks_immutability_trg (0025/0027)", async () => {
    const client = new PGlite();
    try {
      const db = drizzle(client);
      await migrate(db, { migrationsFolder: MIGRATIONS_DIR });

      const [userRow] = await db
        .insert(users)
        .values({ email: "parity-trigger@example.com", handle: "parity_user" })
        .returning();
      expect(userRow).toBeDefined();
      const userId = userRow!.id;

      const futureKickoff = new Date(Date.now() + 2 * 60 * 60 * 1_000);
      const pastKickoff = new Date(Date.now() - 60 * 60 * 1_000);

      await expectTriggerRejects(
        db.insert(sealedPicks).values({
          userId,
          pickId: "pre-settled-1",
          gameId: "g-trigger-1",
          leagueLabel: "Liga MX",
          matchLabel: "América vs Chivas",
          pickLabel: "Local ML · 1u",
          origin: "Spacetime Suite",
          units: "1.00",
          userDecimal: "2.100",
          fairDecimal: "1.950",
          status: "won",
          sealHash: "a".repeat(64),
          kickoffAt: futureKickoff,
        }),
        /PRE_SETTLED_INSERT_FORBIDDEN/,
      );

      await expectTriggerRejects(
        db.insert(sealedPicks).values({
          userId,
          pickId: "retroactive-1",
          gameId: "g-trigger-2",
          leagueLabel: "Liga MX",
          matchLabel: "América vs Chivas",
          pickLabel: "Local ML · 1u",
          origin: "Spacetime Suite",
          units: "1.00",
          userDecimal: "2.100",
          fairDecimal: "1.950",
          status: "pending",
          sealHash: "b".repeat(64),
          kickoffAt: pastKickoff,
        }),
        /RETROACTIVE_SEALED_PICK_FORBIDDEN/,
      );

      const [pendingPick] = await db
        .insert(sealedPicks)
        .values({
          userId,
          pickId: "valid-pending-1",
          gameId: "g-trigger-3",
          leagueLabel: "Liga MX",
          matchLabel: "Cruz Azul vs Tigres",
          pickLabel: "Más de 2.5 goles · 1u",
          origin: "Spacetime Suite",
          units: "1.00",
          userDecimal: "2.050",
          fairDecimal: "1.920",
          status: "pending",
          sealHash: "c".repeat(64),
          kickoffAt: futureKickoff,
        })
        .returning();
      expect(pendingPick).toBeDefined();
      expect(pendingPick!.status).toBe("pending");

      await expectTriggerRejects(
        db.delete(sealedPicks).where(eq(sealedPicks.id, pendingPick!.id)),
        /IMMUTABLE_SEALED_PICK_DELETE/,
      );

      await expectTriggerRejects(
        db
          .update(sealedPicks)
          .set({ units: "2.00" })
          .where(eq(sealedPicks.id, pendingPick!.id)),
        /IMMUTABLE_SEALED_PICK_UPDATE/,
      );

      const settledAt = new Date();
      const [settledPick] = await db
        .update(sealedPicks)
        .set({
          status: "won",
          settledAt,
          closingDecimal: "1.880",
          clvPct: "9.04",
        })
        .where(eq(sealedPicks.id, pendingPick!.id))
        .returning();
      expect(settledPick?.status).toBe("won");

      await expectTriggerRejects(
        db
          .update(sealedPicks)
          .set({ status: "lost" })
          .where(eq(sealedPicks.id, pendingPick!.id)),
        /IMMUTABLE_SETTLED_PICK_UPDATE/,
      );

      await db.delete(users).where(eq(users.id, userId));
      const remainingRes = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sealedPicks)
        .where(eq(sealedPicks.userId, userId));
      expect(remainingRes[0]?.count).toBe(0);
    } finally {
      await client.close();
    }
  });
});
