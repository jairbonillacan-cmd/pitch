import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertSourceLegallyAllowed,
  MissingCredentialsError,
  SOURCE_LEGAL_REGISTRY,
  SourceBlockedError,
} from "../src/odds/legal-registry.js";
import { parseTheOddsApiEvents } from "../src/odds/the-odds-api.js";
import { parseBetfairCatalogueAndBooks } from "../src/odds/betfair-exchange.js";
import { buildOddsCadencePlan } from "../src/odds/cadence-scheduler.js";
import { regenerateLiveMatchdaySnapshot } from "../src/odds/regenerate-live-snapshot.js";
import type { LiveMatchdaySnapshotPayload } from "../src/validation/snapshot-validator.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Parte 1 · Compuerta legal, adaptadores grabados, cadencia y armado de snapshots de momios", () => {
  it("permite únicamente las fuentes api_only autorizadas y bloquea las 5 fuentes prohibidas", () => {
    const validEnv = {
      THE_ODDS_API_KEY: "test_key_offline",
      BETFAIR_APP_KEY: "bf_app_offline",
      BETFAIR_SESSION_TOKEN: "bf_session_offline",
      PINNACLE_B2B_API_KEY: "even_with_key_blocked",
    };

    expect(() => assertSourceLegallyAllowed("the_odds_api", validEnv)).not.toThrow();
    expect(() => assertSourceLegallyAllowed("betfair_exchange", validEnv)).not.toThrow();
    expect(() => assertSourceLegallyAllowed("the_odds_api", {})).toThrow(MissingCredentialsError);

    const blockedIds = [
      "pinnacle",
      "smarkets",
      "caliente",
      "codere",
      "action_network",
    ] as const;

    for (const id of blockedIds) {
      expect(SOURCE_LEGAL_REGISTRY[id]?.legalStatus).toBe("blocked_pending_owner_decision");
      expect(() => assertSourceLegallyAllowed(id, validEnv)).toThrow(SourceBlockedError);
    }
    // Cualquier fuente no registrada también se bloquea de inmediato
    expect(() => assertSourceLegallyAllowed("oddsportal", validEnv)).toThrow(SourceBlockedError);
  });

  it("parsea eventos grabados de The Odds API v4 y Betfair Exchange API-NG con validación canónica", () => {
    const capturedAtIso = "2026-11-14T17:30:00Z";
    const nowMs = Date.parse("2026-11-14T17:31:00Z");

    // Fixture grabado de The Odds API (Bundesliga: Union Berlin vs RB Leipzig)
    const theOddsEvents = [
      {
        home_team: "1. FC Union Berlin",
        away_team: "RB Leipzig",
        commence_time: "2026-11-15T14:30:00Z",
        bookmakers: [
          {
            key: "pinnacle",
            markets: [
              {
                key: "h2h",
                outcomes: [
                  { name: "1. FC Union Berlin", price: 2.35 },
                  { name: "Draw", price: 3.35 },
                  { name: "RB Leipzig", price: 3.15 },
                ],
              },
              {
                key: "totals",
                outcomes: [
                  { name: "Over", point: 2.5, price: 1.92 },
                  { name: "Under", point: 2.5, price: 1.98 },
                ],
              },
            ],
          },
          // Una casa no mapeada o bloqueada se ignora en silencio
          {
            key: "caliente",
            markets: [
              {
                key: "h2h",
                outcomes: [
                  { name: "1. FC Union Berlin", price: 2.1 },
                  { name: "Draw", price: 3.1 },
                  { name: "RB Leipzig", price: 3.0 },
                ],
              },
            ],
          },
        ],
      },
    ];

    const oddsRows = parseTheOddsApiEvents({
      eventsPayload: theOddsEvents,
      appLeague: "bundesliga",
      capturedAtIso,
      rawSha256: "recorded-sha-theodds",
      nowMs,
    });

    expect(oddsRows).toHaveLength(5); // 3 de 1x2 + 2 de totals 2.5
    expect(oddsRows.every((r) => r.book === "pinnacle")).toBe(true);
    expect(oddsRows.every((r) => r.ts_captured === "2026-11-14T17:30:00Z")).toBe(true);

    // Fixture grabado de Betfair Exchange API-NG (Premier League: Arsenal v Chelsea)
    const betfairRows = parseBetfairCatalogueAndBooks({
      catalogue: [
        {
          marketId: "1.234567",
          marketName: "Match Odds",
          description: { marketType: "MATCH_ODDS" },
          competition: { name: "English Premier League" },
          event: { name: "Arsenal v Chelsea", openDate: "2026-11-15T16:30:00Z" },
          runners: [
            { selectionId: 10, runnerName: "Arsenal" },
            { selectionId: 20, runnerName: "Chelsea" },
            { selectionId: 30, runnerName: "The Draw" },
          ],
        },
      ],
      marketBooks: [
        {
          marketId: "1.234567",
          status: "OPEN",
          runners: [
            { selectionId: 10, status: "ACTIVE", ex: { availableToBack: [{ price: 1.88, size: 540 }] } },
            { selectionId: 20, status: "ACTIVE", ex: { availableToBack: [{ price: 4.3, size: 220 }] } },
            { selectionId: 30, status: "ACTIVE", ex: { availableToBack: [{ price: 3.75, size: 310 }] } },
          ],
        },
      ],
      sport: "football",
      capturedAtIso,
      rawSha256: "recorded-sha-betfair",
      nowMs,
    });

    expect(betfairRows).toHaveLength(3);
    expect(betfairRows.map((r) => r.selection).sort()).toEqual(["away", "draw", "home"]);
    expect(betfairRows[0]!.book).toBe("betfair_exchange");
  });

  it("clasifica regímenes de captura (prekickoff_1h, prekickoff_4h, matchday_8h, early_week) y respeta el enfriamiento", () => {
    const tmp = mkdtempSync(join(tmpdir(), "pl-cadence-"));
    tempDirs.push(tmp);
    const snapsDir = join(tmp, "snapshots");
    cpSync(resolve(REPO_ROOT, "data/snapshots/liga-mx"), join(snapsDir, "liga-mx"), {
      recursive: true,
    });

    const snapPath = join(snapsDir, "liga-mx", "latest.json");
    const snap = JSON.parse(readFileSync(snapPath, "utf8")) as {
      updatedAt: string;
      games: Array<{ status: string; startTime: string }>;
    };

    // Fijamos el próximo partido a 45 minutos del reloj evaluado -> prekickoff_1h
    const nowMs = Date.parse("2026-11-14T20:15:00Z");
    snap.updatedAt = "2026-11-14T18:00:00Z";
    snap.games = snap.games.map((g, idx) =>
      idx === 0
        ? { ...g, status: "scheduled", startTime: "2026-11-14T21:00:00Z" }
        : { ...g, status: "final" },
    );
    writeFileSync(snapPath, JSON.stringify(snap, null, 2), "utf8");

    const planWithoutCapture = buildOddsCadencePlan({
      snapshotsRoot: snapsDir,
      leagues: ["liga-mx"],
      nowMs,
      windowMode: "prekickoff",
    });
    expect(planWithoutCapture.decisions[0]?.regime).toBe("prekickoff_1h");
    expect(planWithoutCapture.decisions[0]?.shouldFetch).toBe(true);

    // Si ya hubo captura hace 5 minutos (< 15 min de enfriamiento en prekickoff_1h), no repite llamada
    const planCool = buildOddsCadencePlan({
      snapshotsRoot: snapsDir,
      leagues: ["liga-mx"],
      nowMs,
      windowMode: "prekickoff",
      existingTicks: [
        {
          event_id: "MEX__2026-11-14__queretaro__monterrey",
          sport: "football",
          league: "MEX",
          market: "1x2",
          line: null,
          selection: "home",
          book: "pinnacle",
          price_decimal: 2.9,
          ts_captured: "2026-11-14T20:10:00Z",
          ts_event_start: "2026-11-14T21:00:00Z",
          source: "scraped_ws",
        },
      ],
    });
    expect(planCool.decisions[0]?.shouldFetch).toBe(false);
  });

  it("regenera quotes_latest.json + live_matchday_v3_snapshot.json con oddsBySelection y conserva el archivo previo si falla la validación", () => {
    const tmp = mkdtempSync(join(tmpdir(), "pl-regen-"));
    tempDirs.push(tmp);

    // Copiamos solo los artefactos necesarios al workspace temporal
    const tmpSpacetimeData = join(tmp, "packages", "spacetime", "data");
    cpSync(resolve(REPO_ROOT, "packages/spacetime/data"), tmpSpacetimeData, { recursive: true });
    cpSync(resolve(REPO_ROOT, "data/snapshots"), join(tmp, "data", "snapshots"), {
      recursive: true,
    });

    const existingLive = JSON.parse(
      readFileSync(join(tmpSpacetimeData, "live_matchday_v3_snapshot.json"), "utf8"),
    ) as LiveMatchdaySnapshotPayload;
    const baseMs = Math.max(
      Date.parse("2026-11-14T18:00:00Z"),
      Date.parse(existingLive.outlooks_meta?.generated_at_utc ?? existingLive.generated_at),
    );
    const nowIso = new Date(baseMs + 30 * 60_000).toISOString().replace(".000Z", "Z");
    const capturedAtIso = new Date(baseMs + 20 * 60_000).toISOString().replace(".000Z", "Z");
    const commenceTimeIso = new Date(baseMs + 48 * 3600_000).toISOString().replace(".000Z", "Z");
    const incomingTicks = parseTheOddsApiEvents({
      eventsPayload: [
        {
          home_team: "1. FC Union Berlin",
          away_team: "RB Leipzig",
          commence_time: commenceTimeIso,
          bookmakers: [
            {
              key: "pinnacle",
              markets: [
                {
                  key: "h2h",
                  outcomes: [
                    { name: "1. FC Union Berlin", price: 2.38 },
                    { name: "Draw", price: 3.4 },
                    { name: "RB Leipzig", price: 3.05 },
                  ],
                },
              ],
            },
          ],
        },
      ],
      appLeague: "bundesliga",
      capturedAtIso,
      rawSha256: "sha-union-leipzig",
      nowMs: Date.parse(nowIso),
    });

    const result = regenerateLiveMatchdaySnapshot({
      rootDir: tmp,
      incomingTicks,
      activeSources: ["the_odds_api"],
      nowIso,
      forceSnapshotWrite: true,
    });

    expect(result.ok).toBe(true);
    expect(result.wroteQuotesLedger).toBe(true);
    expect(result.wroteLiveSnapshot).toBe(true);
    expect(result.nOutlooksTotal).toBe(existingLive.outlooks?.length ?? 130);
    expect(result.nWithFreshQuotesLt72h).toBeGreaterThanOrEqual(1);

    const updatedLive = JSON.parse(
      readFileSync(join(tmpSpacetimeData, "live_matchday_v3_snapshot.json"), "utf8"),
    ) as LiveMatchdaySnapshotPayload;
    const unionMatch = updatedLive.outlooks?.find(
      (o) => o.league === "bundesliga" && o.awayTeam === "RB Leipzig",
    );
    expect(unionMatch).toBeDefined();
    const x12Market = unionMatch?.marketsByKey["1x2"]?.market;
    expect(x12Market?.book).toBe("pinnacle");
    expect(x12Market?.tsCaptured).toBe(capturedAtIso);
    expect(x12Market?.oddsBySelection).toEqual({
      home: 2.38,
      draw: 3.4,
      away: 3.05,
    });

    // Ahora intentamos regenerar con un reloj más viejo que el snapshot recién escrito -> debe fallar y conservar el archivo
    const beforeBytes = readFileSync(
      join(tmpSpacetimeData, "live_matchday_v3_snapshot.json"),
      "utf8",
    );
    const staleAttempt = regenerateLiveMatchdaySnapshot({
      rootDir: tmp,
      incomingTicks: [],
      activeSources: ["the_odds_api"],
      nowIso: new Date(baseMs - 24 * 3600_000).toISOString().replace(".000Z", "Z"),
      forceSnapshotWrite: true,
    });
    expect(staleAttempt.ok).toBe(false);
    expect(staleAttempt.wroteLiveSnapshot).toBe(false);
    const afterBytes = readFileSync(
      join(tmpSpacetimeData, "live_matchday_v3_snapshot.json"),
      "utf8",
    );
    expect(afterBytes).toBe(beforeBytes);
  });
});
