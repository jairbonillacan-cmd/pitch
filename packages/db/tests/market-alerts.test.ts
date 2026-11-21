import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq, getTableName } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, marketAlerts, MIGRATIONS_DIR, users, type Db } from "../src/index";
import {
  applyMarketAlertBatch,
  countActiveMarketAlertsForUser,
  createMarketAlert,
  deleteMarketAlertForUser,
  getMarketAlertForUser,
  listActiveMarketAlertsByTrigger,
  listMarketAlertsForUser,
  MAX_MARKET_ALERT_BATCH_OPS,
  MAX_MARKET_ALERTS_PER_USER,
  recordMarketAlertFired,
  updateMarketAlertForUser,
} from "../src/market-alerts";

let client: PGlite;
let db: Db;
const T0 = new Date("2026-11-21T18:00:00Z");

async function createUser(handle: string) {
  const [created] = await db
    .insert(users)
    .values({
      email: `${handle}@example.com`,
      handle,
      displayName: handle,
      authUserId: `auth-${handle}`,
      isAdult: true,
    })
    .returning();
  return created!;
}

beforeAll(async () => {
  client = new PGlite();
  await applyMigrations((sqlText) => client.exec(sqlText));
  db = drizzle(client);
}, 120_000);

beforeEach(async () => {
  await client.exec("TRUNCATE TABLE market_alerts, users CASCADE");
});

afterAll(async () => {
  await client.close();
});

describe("migración 0026_alertas_mercado y esquema Drizzle", () => {
  it("expone market_alerts, registra entrada 26 en _journal.json y crea índices y constraints CHECK", async () => {
    expect(getTableName(marketAlerts)).toBe("market_alerts");

    const sqlPath = join(MIGRATIONS_DIR, "0026_alertas_mercado.sql");
    const sqlText = readFileSync(sqlPath, "utf8");
    expect(sqlText).toContain("CREATE TABLE IF NOT EXISTS market_alerts");
    expect(sqlText).toContain("market_alerts_user_active_created_idx");
    expect(sqlText).toContain("market_alerts_trigger_active_idx");
    const narrativeComments = sqlText
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith("--") && line.trim() !== "--> statement-breakpoint");
    expect(narrativeComments).toEqual([]);
    expect(sqlText).not.toContain("/" + "*");

    const journalPath = join(MIGRATIONS_DIR, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: Array<{ idx: number; tag: string; when: number; breakpoints: boolean }>;
    };
    const entry26 = journal.entries.find((e) => e.idx === 26);
    expect(entry26).toMatchObject({
      idx: 26,
      tag: "0026_alertas_mercado",
      when: 1794525000015,
      breakpoints: true,
    });

    const idxRes = await client.query<{ indexname: string }>(
      "select indexname from pg_indexes where schemaname = 'public' and tablename = 'market_alerts'",
    );
    const indexNames = idxRes.rows.map((r) => r.indexname);
    expect(indexNames).toContain("market_alerts_user_active_created_idx");
    expect(indexNames).toContain("market_alerts_trigger_active_idx");

    const socio = await createUser("check_owner");
    await expect(
      db.insert(marketAlerts).values({
        id: "bad_trigger",
        userId: socio.id,
        name: "Alerta inválida",
        trigger: "unknown_trigger",
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(marketAlerts).values({
        id: "bad_cooldown",
        userId: socio.id,
        name: "Cooldown inválido",
        trigger: "market_opened",
        cooldownMinutes: 2,
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(marketAlerts).values({
        id: "bad_channel",
        userId: socio.id,
        name: "Canal inválido",
        trigger: "market_opened",
        channel: "sms",
      }),
    ).rejects.toThrow();
    await expect(
      db.insert(marketAlerts).values({
        id: "bad_decimals",
        userId: socio.id,
        name: "Momios invertidos",
        trigger: "market_opened",
        minDecimal: 2.8,
        maxDecimal: 1.9,
      }),
    ).rejects.toThrow();
  });

  it("elimina alertas en cascada cuando se borra el socio propietario", async () => {
    const socio = await createUser("cascade_owner");
    const created = await createMarketAlert(
      db,
      socio.id,
      {
        name: "Córners América Liga MX",
        trigger: "market_opened",
        league: "liga-mx",
        marketFamily: "corners_total",
        thresholdEvPct: 4,
      },
      T0,
    );
    expect(created.ok).toBe(true);
    await db.delete(users).where(eq(users.id, socio.id));
    expect(await listMarketAlertsForUser(db, socio.id)).toHaveLength(0);
  });
});

describe("CRUD acotado de market_alerts (<= 40, anti-IDOR, batch <= 10, cooldown/dedupe)", () => {
  it("impone tope estricto de 40 alertas activas por socio y acota listMarketAlertsForUser a <= 40", async () => {
    const socio = await createUser("cap_socio");
    for (let i = 0; i < MAX_MARKET_ALERTS_PER_USER; i += 1) {
      const res = await createMarketAlert(
        db,
        socio.id,
        {
          name: `Alerta activa ${i + 1}`,
          trigger: "market_opened",
          league: "liga-mx",
          marketFamily: "corners_total",
        },
        new Date(T0.getTime() + i * 1_000),
      );
      expect(res.ok).toBe(true);
    }

    expect(await countActiveMarketAlertsForUser(db, socio.id)).toBe(40);

    const overflow = await createMarketAlert(
      db,
      socio.id,
      {
        name: "Alerta 41 bloqueada",
        trigger: "sharp_steam",
        league: "premier-league",
        marketFamily: "1x2",
      },
      new Date(T0.getTime() + 50_000),
    );
    expect(overflow).toEqual({ ok: false, reason: "limit_exceeded" });

    const paused = await createMarketAlert(
      db,
      socio.id,
      {
        name: "Alerta pausada 41",
        trigger: "stale_line_ev",
        league: "nba",
        marketFamily: "nba_totals",
        active: false,
      },
      new Date(T0.getTime() + 60_000),
    );
    expect(paused.ok).toBe(true);
    if (!paused.ok) return;

    const listed = await listMarketAlertsForUser(db, socio.id, { limit: 500 });
    expect(listed).toHaveLength(40);

    const reactivateFail = await updateMarketAlertForUser(
      db,
      socio.id,
      paused.alert.id,
      { active: true },
      new Date(T0.getTime() + 70_000),
    );
    expect(reactivateFail).toEqual({ ok: false, reason: "limit_exceeded" });

    const activeByTrigger = await listActiveMarketAlertsByTrigger(db, "market_opened", 999);
    expect(activeByTrigger).toHaveLength(40);
  });

  it("aísla estrictamente cada alerta por userId (anti-IDOR entre dos socios)", async () => {
    const socioA = await createUser("idor_a");
    const socioB = await createUser("idor_b");

    const createdA = await createMarketAlert(
      db,
      socioA.id,
      {
        name: "Steam Pinnacle Champions",
        trigger: "sharp_steam",
        league: "champions-league",
        marketFamily: "1x2",
        bookmaker: "pinnacle",
        thresholdEvPct: 3.5,
      },
      T0,
    );
    expect(createdA.ok).toBe(true);
    if (!createdA.ok) return;

    expect(await listMarketAlertsForUser(db, socioB.id)).toEqual([]);
    expect(await getMarketAlertForUser(db, socioB.id, createdA.alert.id)).toBeNull();

    const foreignUpdate = await updateMarketAlertForUser(
      db,
      socioB.id,
      createdA.alert.id,
      { name: "Secuestrada", active: false },
      new Date(T0.getTime() + 5_000),
    );
    expect(foreignUpdate).toEqual({ ok: false, reason: "not_found" });

    const foreignDelete = await deleteMarketAlertForUser(db, socioB.id, createdA.alert.id);
    expect(foreignDelete).toEqual({ ok: false, reason: "not_found" });

    const foreignBatch = await applyMarketAlertBatch(
      db,
      socioB.id,
      [{ op: "delete", id: createdA.alert.id }],
      new Date(T0.getTime() + 6_000),
    );
    expect(foreignBatch).toEqual({ ok: false, reason: "not_found", failedIndex: 0 });

    const stillIntact = await getMarketAlertForUser(db, socioA.id, createdA.alert.id);
    expect(stillIntact?.name).toBe("Steam Pinnacle Champions");
    expect(stillIntact?.active).toBe(true);
  });

  it("ejecuta applyMarketAlertBatch atómicamente con tope <= 10 y revierte todo el lote si una operación falla", async () => {
    const socio = await createUser("batch_socio");

    const emptyRes = await applyMarketAlertBatch(db, socio.id, [], T0);
    expect(emptyRes).toEqual({ ok: false, reason: "batch_size_invalid" });

    const tooManyOps = Array.from({ length: MAX_MARKET_ALERT_BATCH_OPS + 1 }, (_, i) => ({
      op: "create" as const,
      data: {
        name: `Lote ${i + 1}`,
        trigger: "market_opened" as const,
        league: "nba",
        marketFamily: "nba_totals",
      },
    }));
    const oversizedRes = await applyMarketAlertBatch(db, socio.id, tooManyOps, T0);
    expect(oversizedRes).toEqual({ ok: false, reason: "batch_limit_exceeded" });

    const created = await createMarketAlert(
      db,
      socio.id,
      {
        name: "Base MLB F5",
        trigger: "stale_line_ev",
        league: "mlb",
        marketFamily: "mlb_f5",
        thresholdEvPct: 4.5,
      },
      T0,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const batchOk = await applyMarketAlertBatch(
      db,
      socio.id,
      [
        { op: "pause", id: created.alert.id },
        {
          op: "create",
          data: {
            name: "Titular Salah Premier",
            trigger: "lineup_confirmed",
            league: "premier-league",
            marketFamily: "player_props_football",
            selection: "Mohamed Salah · shots_on_target",
          },
        },
      ],
      new Date(T0.getTime() + 10_000),
    );
    expect(batchOk.ok).toBe(true);
    if (!batchOk.ok) return;
    expect(batchOk.applied).toBe(2);

    const atomicRollback = await applyMarketAlertBatch(
      db,
      socio.id,
      [
        {
          op: "create",
          data: {
            name: "Debe revertirse",
            trigger: "schedule_change",
            league: "libertadores",
          },
        },
        { op: "delete", id: "alert_inexistente_999" },
      ],
      new Date(T0.getTime() + 20_000),
    );
    expect(atomicRollback).toEqual({ ok: false, reason: "not_found", failedIndex: 1 });

    const afterRollback = await listMarketAlertsForUser(db, socio.id);
    expect(afterRollback).toHaveLength(2);
    expect(afterRollback.some((a) => a.name === "Debe revertirse")).toBe(false);
  });

  it("aplica dedupe last_fired_hash y ventana cooldown_minutes en recordMarketAlertFired", async () => {
    const socio = await createUser("fire_socio");
    const created = await createMarketAlert(
      db,
      socio.id,
      {
        name: "BTTS Bet365 Premier",
        trigger: "stale_line_ev",
        league: "premier-league",
        marketFamily: "btts",
        bookmaker: "bet365",
        thresholdEvPct: 5,
        cooldownMinutes: 30,
      },
      T0,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const fire1 = await recordMarketAlertFired(db, {
      alertId: created.alert.id,
      userId: socio.id,
      eventHash: "hash_event_001",
      now: T0,
    });
    expect(fire1.ok).toBe(true);
    if (!fire1.ok) return;
    expect(fire1.alert.firedCount).toBe(1);
    expect(fire1.alert.lastFiredHash).toBe("hash_event_001");

    const dup = await recordMarketAlertFired(db, {
      alertId: created.alert.id,
      userId: socio.id,
      eventHash: "hash_event_001",
      now: new Date(T0.getTime() + 60 * 60_000),
    });
    expect(dup).toEqual({ ok: false, reason: "duplicate_hash" });

    const cooldownHit = await recordMarketAlertFired(db, {
      alertId: created.alert.id,
      userId: socio.id,
      eventHash: "hash_event_002",
      now: new Date(T0.getTime() + 10 * 60_000),
    });
    expect(cooldownHit.ok).toBe(false);
    if (!cooldownHit.ok) {
      expect(cooldownHit.reason).toBe("cooldown_active");
      expect(cooldownHit.nextEligibleAtIso).toBe(new Date(T0.getTime() + 30 * 60_000).toISOString());
    }

    const fire2 = await recordMarketAlertFired(db, {
      alertId: created.alert.id,
      userId: socio.id,
      eventHash: "hash_event_002",
      now: new Date(T0.getTime() + 31 * 60_000),
    });
    expect(fire2.ok).toBe(true);
    if (!fire2.ok) return;
    expect(fire2.alert.firedCount).toBe(2);
    expect(fire2.alert.lastFiredHash).toBe("hash_event_002");
  });
});
