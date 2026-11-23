import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableName } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import {
  authSession,
  defaultUserPreferences,
  incrementPgRateBucket,
  MAX_PREFERRED_BOOKMAKERS,
  MAX_SAVED_SCREENER_VIEWS,
  MIGRATIONS_DIR,
  pruneExpiredPgRateBuckets,
  recordSecurityAbuseEvent,
  revokeUserActiveSessions,
  sanitizePreferredBookmakers,
  sanitizeSavedViewsPref,
  securityAbuseEvents,
  securityRateBuckets,
  toUserPreferencesRecord,
  upsertUserPreferences,
  userPreferences,
  users,
  type Db,
  type SavedScreenerViewRecord,
} from "../src/index";

const SAMPLE_USER_UUID = "11111111-2222-4333-8444-555555555555";

interface StoredBucket {
  bucket: string;
  subjectKey: string;
  windowStart: number;
  hits: number;
  expiresAt: Date;
}

function createRateLimitMockDb() {
  const buckets = new Map<string, StoredBucket>();
  const insertedEvents: Array<Record<string, unknown>> = [];
  const deleteCalls: Array<{ table: unknown; where: unknown }> = [];
  const selectCalls: Array<{ table: unknown }> = [];
  const conflictTargets: unknown[] = [];

  let authUserIdLookup: string | null = "auth-user-42";
  let revokedSessionIds: string[] = ["sess-1", "sess-2"];
  let prunedBucketIds: string[] = ["api-read", "api-write"];

  const db = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((vals: Record<string, unknown>) => {
        if (table === securityAbuseEvents) {
          insertedEvents.push(vals);
          return Promise.resolve([]);
        }
        return {
          onConflictDoUpdate: vi.fn((cfg: { target: unknown; set: unknown }) => {
            conflictTargets.push(cfg.target);
            return {
              returning: vi.fn(async () => {
                const bucket = String(vals.bucket ?? "");
                const subjectKey = String(vals.subjectKey ?? "");
                const windowStart = Number(vals.windowStart ?? 0);
                const key = `${bucket}|${subjectKey}|${windowStart}`;
                const prev = buckets.get(key);
                const nextHits = prev ? prev.hits + 1 : Number(vals.hits ?? 1);
                buckets.set(key, {
                  bucket,
                  subjectKey,
                  windowStart,
                  hits: nextHits,
                  expiresAt: vals.expiresAt as Date,
                });
                return [{ hits: nextHits }];
              }),
            };
          }),
        };
      }),
    })),
    delete: vi.fn((table: unknown) => ({
      where: vi.fn((whereClause: unknown) => {
        deleteCalls.push({ table, where: whereClause });
        return {
          returning: vi.fn(async () => {
            if (table === securityRateBuckets) {
              return prunedBucketIds.map((bucket) => ({ bucket }));
            }
            if (table === authSession) {
              return revokedSessionIds.map((id) => ({ id }));
            }
            return [];
          }),
        };
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => {
        selectCalls.push({ table });
        return {
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              if (table === users && authUserIdLookup) {
                return [{ authUserId: authUserIdLookup }];
              }
              return [];
            }),
          })),
        };
      }),
    })),
  };

  return {
    db: db as unknown as Db,
    buckets,
    insertedEvents,
    deleteCalls,
    selectCalls,
    conflictTargets,
    setAuthUserIdLookup(next: string | null) {
      authUserIdLookup = next;
    },
    setRevokedSessionIds(next: string[]) {
      revokedSessionIds = next;
    },
    setPrunedBucketIds(next: string[]) {
      prunedBucketIds = next;
    },
  };
}

describe("security-rate-limit (PostgreSQL UNLOGGED + abuso + sesiones)", () => {
  it("incrementPgRateBucket acumula hits atómicamente por ventana fija y reinicia en la siguiente ventana", async () => {
    const mock = createRateLimitMockDb();
    const windowMs = 60_000;
    const expectedWindowStart = 1_795_000_020_000;
    const t0 = expectedWindowStart + 15_000;
    const expectedReset = expectedWindowStart + windowMs;

    const first = await incrementPgRateBucket(mock.db, {
      bucket: "api:picks",
      subjectKey: "ip:abc",
      windowMs,
      nowMs: t0,
    });
    const second = await incrementPgRateBucket(mock.db, {
      bucket: "api:picks",
      subjectKey: "ip:abc",
      windowMs,
      nowMs: t0 + 10_000,
    });
    const nextWin = await incrementPgRateBucket(mock.db, {
      bucket: "api:picks",
      subjectKey: "ip:abc",
      windowMs,
      nowMs: expectedReset + 500,
    });

    expect(first).toEqual({ hits: 1, resetAtMs: expectedReset });
    expect(second).toEqual({ hits: 2, resetAtMs: expectedReset });
    expect(nextWin).toEqual({ hits: 1, resetAtMs: expectedReset + windowMs });
    expect(mock.conflictTargets[0]).toEqual([
      securityRateBuckets.bucket,
      securityRateBuckets.subjectKey,
      securityRateBuckets.windowStart,
    ]);
    expect(mock.buckets.size).toBe(2);
  });

  it("incrementPgRateBucket rechaza bucket o subjectKey vacíos", async () => {
    const mock = createRateLimitMockDb();
    await expect(
      incrementPgRateBucket(mock.db, { bucket: "   ", subjectKey: "sub", windowMs: 60_000 }),
    ).rejects.toThrow("INVALID_RATE_BUCKET");
    await expect(
      incrementPgRateBucket(mock.db, { bucket: "api", subjectKey: "  ", windowMs: 60_000 }),
    ).rejects.toThrow("INVALID_RATE_SUBJECT");
  });

  it("pruneExpiredPgRateBuckets borra buckets vencidos y devuelve la cantidad purgada", async () => {
    const mock = createRateLimitMockDb();
    mock.setPrunedBucketIds(["b1", "b2", "b3"]);
    const removed = await pruneExpiredPgRateBuckets(mock.db, 1_795_000_000_000);
    expect(removed).toBe(3);
    expect(mock.deleteCalls).toHaveLength(1);
    expect(mock.deleteCalls[0]?.table).toBe(securityRateBuckets);
  });

  it("recordSecurityAbuseEvent registra eventos normalizados y limpia userId no UUID y claves peligrosas", async () => {
    const mock = createRateLimitMockDb();
    await recordSecurityAbuseEvent(mock.db, {
      userId: SAMPLE_USER_UUID,
      ipHash: "a".repeat(64),
      route: "/api/live/games/g1",
      kind: "scraping_velocity",
      severity: "high",
      details: { distinctGames: 52, tags: ["live", "nba"] },
    });
    await recordSecurityAbuseEvent(mock.db, {
      userId: "not-a-uuid",
      ipHash: "  ",
      route: "  ",
      kind: "idor_attempt",
      severity: "critical",
      details: { constructor: "bad", reason: "cross-user" },
    });

    expect(mock.insertedEvents).toHaveLength(2);
    expect(mock.insertedEvents[0]).toEqual({
      userId: SAMPLE_USER_UUID,
      ipHash: "a".repeat(64),
      route: "/api/live/games/g1",
      kind: "scraping_velocity",
      severity: "high",
      details: { distinctGames: 52, tags: ["live", "nba"] },
    });
    expect(mock.insertedEvents[1]).toEqual({
      userId: null,
      ipHash: "unknown",
      route: "/",
      kind: "idor_attempt",
      severity: "critical",
      details: { reason: "cross-user" },
    });
  });

  it("revokeUserActiveSessions resuelve authUserId cuando recibe UUID y elimina sesiones de auth_session", async () => {
    const mock = createRateLimitMockDb();
    mock.setAuthUserIdLookup("ba_user_99");
    mock.setRevokedSessionIds(["s1", "s2"]);

    const countFromUuid = await revokeUserActiveSessions(mock.db, SAMPLE_USER_UUID);
    expect(countFromUuid).toBe(2);
    expect(mock.selectCalls.map((c) => c.table)).toEqual([users]);
    expect(mock.deleteCalls[0]?.table).toBe(authSession);

    const mockDirect = createRateLimitMockDb();
    mockDirect.setRevokedSessionIds(["s3"]);
    const countFromAuthId = await revokeUserActiveSessions(mockDirect.db, "ba_user_direct");
    expect(countFromAuthId).toBe(1);
    expect(mockDirect.selectCalls).toHaveLength(0);
    expect(mockDirect.deleteCalls[0]?.table).toBe(authSession);

    const mockEmpty = createRateLimitMockDb();
    expect(await revokeUserActiveSessions(mockEmpty.db, "   ")).toBe(0);
    expect(mockEmpty.selectCalls).toHaveLength(0);
    expect(mockEmpty.deleteCalls).toHaveLength(0);
  });
});

describe("user_preferences: preferredBookmakers y savedViews", () => {
  it("sanitizePreferredBookmakers valida formato, deduplica y limita a 12 casas", () => {
    const raw = [
      "  Caliente MX ",
      "caliente-mx",
      "bet365",
      "x",
      "<script>",
      42,
      ...Array.from({ length: 15 }, (_, idx) => `book_${idx + 1}`),
    ];
    const clean = sanitizePreferredBookmakers(raw);
    expect(clean).toHaveLength(MAX_PREFERRED_BOOKMAKERS);
    expect(clean[0]).toBe("caliente_mx");
    expect(clean[1]).toBe("bet365");
    expect(clean).not.toContain("x");
    expect(clean).not.toContain("<script>");
  });

  it("sanitizeSavedViewsPref valida campos, conserva pinToHomeHub y limita a 20 vistas", () => {
    const raw = [
      {
        id: "v1",
        name: "<b>Valor NBA</b>",
        sport: "nba",
        league: "nba",
        band: "alta",
        kind: "resultado",
        sort: "ventaja",
        onlyPositiveEdge: true,
        minOddsStep: 90,
        maxOddsStep: 10,
        window: "today",
        pinToHomeHub: true,
      },
      { id: "v1", name: "Duplicada" },
      { id: "a", name: "Id muy corto" },
      ...Array.from({ length: 25 }, (_, i) => ({
        id: `view-${i + 2}`,
        name: `Vista ${i + 2}`,
        sport: "invalid_sport",
        minOddsStep: 12,
        maxOddsStep: 80,
      })),
    ];

    const views = sanitizeSavedViewsPref(raw);
    expect(views).toHaveLength(MAX_SAVED_SCREENER_VIEWS);
    expect(views[0]).toEqual({
      id: "v1",
      name: "bValor NBA/b",
      sport: "nba",
      league: "nba",
      band: "alta",
      kind: "resultado",
      sort: "ventaja",
      onlyPositiveEdge: true,
      minOddsStep: 9,
      maxOddsStep: 10,
      window: "today",
      pinToHomeHub: true,
    });
    expect(views[1]?.sport).toBe("all");
    expect(views[1]?.pinToHomeHub).toBe(false);
  });

  it("toUserPreferencesRecord lee columnas dedicadas y respeta respaldo legado de followedTopics", () => {
    const base = defaultUserPreferences(true);
    expect(base.preferredBookmakers).toEqual([]);
    expect(base.savedViews).toEqual([]);

    const pinnedView: SavedScreenerViewRecord = {
      id: "hub-ev",
      name: "EV+ Hoy",
      sport: "futbol",
      league: "premier",
      band: "alta",
      kind: "goles",
      sort: "ventaja",
      onlyPositiveEdge: true,
      minOddsStep: 15,
      maxOddsStep: 75,
      window: "today",
      pinToHomeHub: true,
    };

    const prefRow: typeof userPreferences.$inferSelect = {
      userId: SAMPLE_USER_UUID,
      oddsFormat: "decimal",
      themeMode: "dark",
      timezone: "America/Mexico_City",
      riskPreference: "medio",
      favoriteLeagues: ["premier"],
      unitMxnCentavos: 20_000,
      showMxnBalance: false,
      publicRecordVisible: true,
      emailPickResults: false,
      emailValueAlerts: true,
      emailBeforeMatch: false,
      emailBillingReminder: true,
      emailWeeklyDigest: false,
      emailMonthlyRecord: false,
      pushEnabled: false,
      showInRanking: true,
      pauseCommunity: false,
      responsiblePauseKind: null,
      responsiblePauseUntil: null,
      recordPrivacy: {},
      bankrollStartMxnCentavos: null,
      followedTopics: { leagues: [], teams: [], books: ["codere"] },
      featuredBadges: [],
      preferredBookmakers: ["bet365", "pinnacle"],
      savedViews: [pinnedView],
      updatedAt: new Date("2026-11-21T12:00:00Z"),
    };

    const parsed = toUserPreferencesRecord(prefRow, true);
    expect(parsed.preferredBookmakers).toEqual(["bet365", "pinnacle"]);
    expect(parsed.preferredBooks).toEqual(["bet365", "pinnacle"]);
    expect(parsed.savedViews).toEqual([pinnedView]);

    const legacyParsed = toUserPreferencesRecord(
      { ...prefRow, preferredBookmakers: [], savedViews: [] },
      true,
    );
    expect(legacyParsed.preferredBookmakers).toEqual(["codere"]);
  });

  it("upsertUserPreferences persiste preferredBookmakers y savedViews sanitizados en las columnas nuevas", async () => {
    let savedRow: typeof userPreferences.$inferSelect | undefined;
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn((table: unknown) => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => {
              if (table === userPreferences) return savedRow ? [savedRow] : [];
              if (table === users) return [{ publicProfile: true }];
              return [];
            }),
            for: vi.fn(async () => [{ id: SAMPLE_USER_UUID }]),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((vals: typeof userPreferences.$inferInsert) => ({
          onConflictDoUpdate: vi.fn(async () => {
            savedRow = {
              ...(vals as typeof userPreferences.$inferSelect),
            };
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
    };
    const db = {
      transaction: vi.fn(async (fn: (client: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as Db;

    const result = await upsertUserPreferences(
      db,
      SAMPLE_USER_UUID,
      {
        preferredBookmakers: ["Bet365", "Pinnacle", "Caliente MX"],
        savedViews: [
          {
            id: "sv-1",
            name: "Fútbol EV+",
            sport: "futbol",
            league: "ligamx",
            band: "alta",
            kind: "resultado",
            sort: "ventaja",
            onlyPositiveEdge: true,
            minOddsStep: 12,
            maxOddsStep: 80,
            window: "today",
            pinToHomeHub: true,
          },
        ],
      },
      new Date("2026-11-21T12:00:00Z"),
    );

    expect(savedRow?.preferredBookmakers).toEqual(["bet365", "pinnacle", "caliente_mx"]);
    expect(savedRow?.savedViews).toHaveLength(1);
    expect(savedRow?.savedViews[0]?.pinToHomeHub).toBe(true);
    expect(result.preferredBookmakers).toEqual(["bet365", "pinnacle", "caliente_mx"]);
    expect(result.savedViews[0]?.pinToHomeHub).toBe(true);
  });
});

describe("migración 0025 y esquema Drizzle", () => {
  it("expone las tablas security_rate_buckets y security_abuse_events en el esquema Drizzle", () => {
    expect(getTableName(securityRateBuckets)).toBe("security_rate_buckets");
    expect(getTableName(securityAbuseEvents)).toBe("security_abuse_events");
    expect(userPreferences.preferredBookmakers.name).toBe("preferred_bookmakers");
    expect(userPreferences.savedViews.name).toBe("saved_views");
  });

  it("0025_seguridad_rate_limit_inmutable_y_preferencias.sql define DDL completo, trigger físico y está registrada en _journal.json", () => {
    const sqlPath = join(MIGRATIONS_DIR, "0025_seguridad_rate_limit_inmutable_y_preferencias.sql");
    const sqlText = readFileSync(sqlPath, "utf8");

    expect(sqlText).toContain("CREATE UNLOGGED TABLE IF NOT EXISTS security_rate_buckets");
    expect(sqlText).toContain("PRIMARY KEY (bucket, subject_key, window_start)");
    expect(sqlText).toContain("security_rate_buckets_expires_idx");
    expect(sqlText).toContain("CREATE TABLE IF NOT EXISTS security_abuse_events");
    expect(sqlText).toContain("REFERENCES public.users(id) ON DELETE SET NULL");
    expect(sqlText).toContain("'rate_limit', 'scraping_velocity', 'session_revoked', 'csrf_rejected', 'idor_attempt'");
    expect(sqlText).toContain("'low', 'medium', 'high', 'critical'");
    expect(sqlText).toContain("security_abuse_events_created_idx");
    expect(sqlText).toContain("security_abuse_events_user_created_idx");

    expect(sqlText).toContain("CREATE OR REPLACE FUNCTION enforce_sealed_picks_immutability()");
    expect(sqlText).toContain("sealed_picks_immutable: IMMUTABLE_SEALED_PICK_DELETE");
    expect(sqlText).toContain("sealed_picks_immutable: RETROACTIVE_SEALED_PICK_FORBIDDEN");
    expect(sqlText).toContain("sealed_picks_immutable: IMMUTABLE_SETTLED_PICK_UPDATE");
    expect(sqlText).toContain("ERRCODE = '55000'");
    expect(sqlText).toContain("clock_timestamp()");
    expect(sqlText).toContain("pitchlab.allow_historical_seed");
    expect(sqlText).toContain("BEFORE INSERT OR UPDATE OR DELETE ON sealed_picks");
    expect(sqlText).toContain("DROP TRIGGER IF EXISTS \"pick_immutable\" ON sealed_picks");

    expect(sqlText).toContain(
      "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS preferred_bookmakers TEXT[] NOT NULL DEFAULT '{}'::text[]",
    );
    expect(sqlText).toContain(
      "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS saved_views JSONB NOT NULL DEFAULT '[]'::jsonb",
    );

    const narrativeCommentLines = sqlText
      .split(/\r?\n/)
      .filter((line) => line.trim().startsWith("--") && line.trim() !== "--> statement-breakpoint");
    expect(narrativeCommentLines).toEqual([]);
    expect(sqlText).not.toContain("/" + "*");

    const journalPath = join(MIGRATIONS_DIR, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      entries: Array<{ idx: number; tag: string; breakpoints: boolean }>;
    };
    const entry25 = journal.entries.find((e) => e.idx === 25);
    expect(entry25).toMatchObject({
      idx: 25,
      tag: "0025_seguridad_rate_limit_inmutable_y_preferencias",
      breakpoints: true,
    });
  });
});
