import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  asLeagueId,
  asTeamId,
  type LeagueInjuriesFile,
  type LeagueSnapshot,
} from "@pitchlab/contracts";
import type { OddsSnapshotRow } from "@pitchlab/spacetime";
import {
  parseStrictIsoMs,
  validateLeagueInjuriesCandidate,
  validateLeagueSnapshotCandidate,
  validateLiveOddsSnapshotCandidate,
  validateOddsTickBatch,
  validateTeamIdentity,
  type LiveMatchdaySnapshotPayload,
} from "../src/validation/snapshot-validator.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");
const SNAPSHOTS_ROOT = resolve(REPO_ROOT, "data/snapshots");

function loadRealSnapshot(league: string): LeagueSnapshot {
  const file = resolve(SNAPSHOTS_ROOT, league, "latest.json");
  return JSON.parse(readFileSync(file, "utf8")) as LeagueSnapshot;
}

describe("Parte 3 · Validador común previo a publicar snapshots", () => {
  it("aprueba los 7 snapshots reales actuales de producción", () => {
    const leagues = [
      "nfl",
      "premier-league",
      "laliga",
      "bundesliga",
      "serie-a",
      "ligue-1",
      "liga-mx",
    ] as const;

    for (const league of leagues) {
      const snap = loadRealSnapshot(league);
      const nowMs = Date.parse(snap.updatedAt) + 60_000;
      const res = validateLeagueSnapshotCandidate(snap, null, { nowMs });
      expect(res.ok, `${league}: ${JSON.stringify(res.issues)}`).toBe(true);
    }
  });

  it("rechaza los casos reales de equipos y escudos cruzados (P0-03: West Ham→Coventry, Southampton→Sunderland, Wolves→Hull, Mazatlán→Atlante)", () => {
    const crossedCases = [
      {
        league: "premier-league" as const,
        team: {
          id: asTeamId("premier-league.coventry"),
          league: asLeagueId("premier-league"),
          name: "West Ham United",
          shortName: "West Ham",
          code: "COV",
        },
      },
      {
        league: "premier-league" as const,
        team: {
          id: asTeamId("premier-league.sunderland"),
          league: asLeagueId("premier-league"),
          name: "Southampton",
          shortName: "Southampton",
          code: "SUN",
        },
      },
      {
        league: "premier-league" as const,
        team: {
          id: asTeamId("premier-league.hull"),
          league: asLeagueId("premier-league"),
          name: "Wolverhampton Wanderers",
          shortName: "Wolves",
          code: "HUL",
        },
      },
      {
        league: "liga-mx" as const,
        team: {
          id: asTeamId("liga-mx.atlante"),
          league: asLeagueId("liga-mx"),
          name: "Mazatlán FC",
          shortName: "Mazatlán",
          code: "ATL",
        },
      },
    ];

    for (const item of crossedCases) {
      const issues = validateTeamIdentity(item.league, item.team, { path: "games[0].home" });
      expect(issues.length).toBeGreaterThan(0);
      expect(
        issues.some(
          (i) => i.code === "CROSSED_TEAM_IDENTITY" || i.code === "CROSSED_TEAM_CREST",
        ),
      ).toBe(true);
    }

    // También rechaza cuando el id canónico es correcto pero el código de escudo fue alterado
    const wrongCrestCode = validateTeamIdentity(
      "premier-league",
      {
        id: asTeamId("premier-league.arsenal"),
        league: asLeagueId("premier-league"),
        name: "Arsenal",
        shortName: "Arsenal",
        code: "COV",
      },
      { path: "games[0].home" },
    );
    expect(wrongCrestCode.some((i) => i.code === "CROSSED_TEAM_CREST")).toBe(true);
  });

  it("rechaza equipos desconocidos, partidos contra sí mismo e inversión de localía frente al snapshot previo", () => {
    const previous = loadRealSnapshot("liga-mx");
    const nowMs = Date.parse("2026-11-15T12:00:00Z");

    // 1. Equipo desconocido
    const withUnknown: LeagueSnapshot = structuredClone(previous);
    withUnknown.updatedAt = "2026-11-15T11:55:00Z";
    withUnknown.games[0] = {
      ...withUnknown.games[0]!,
      home: {
        id: asTeamId("liga-mx.club-inventado"),
        league: asLeagueId("liga-mx"),
        name: "Atlético Inventado FC",
        shortName: "Inventado",
        code: "INV",
      },
    };
    const resUnknown = validateLeagueSnapshotCandidate(withUnknown, previous, { nowMs });
    expect(resUnknown.ok).toBe(false);
    expect(resUnknown.issues.some((i) => i.code === "UNKNOWN_TEAM")).toBe(true);

    // 2. Equipo jugando contra sí mismo
    const selfMatch: LeagueSnapshot = structuredClone(previous);
    selfMatch.updatedAt = "2026-11-15T11:55:00Z";
    selfMatch.games[0] = {
      ...selfMatch.games[0]!,
      away: structuredClone(selfMatch.games[0]!.home),
    };
    const resSelf = validateLeagueSnapshotCandidate(selfMatch, previous, { nowMs });
    expect(resSelf.ok).toBe(false);
    expect(resSelf.issues.some((i) => i.code === "SELF_MATCH_TEAM")).toBe(true);

    // 3. Localía invertida respecto al mismo id de partido en el snapshot previo
    const swappedSides: LeagueSnapshot = structuredClone(previous);
    swappedSides.updatedAt = "2026-11-15T11:55:00Z";
    const g0 = swappedSides.games[0]!;
    swappedSides.games[0] = {
      ...g0,
      home: g0.away,
      away: g0.home,
    };
    const resSwapped = validateLeagueSnapshotCandidate(swappedSides, previous, { nowMs });
    expect(resSwapped.ok).toBe(false);
    expect(resSwapped.issues.some((i) => i.code === "SWAPPED_FIXTURE_SIDES")).toBe(true);
  });

  it("rechaza fechas imposibles (2026-02-30), timestamps futuros y candidatos más viejos que el snapshot actual", () => {
    expect(parseStrictIsoMs("2026-02-30T18:00:00Z", { requireTimezone: true })).toBeNull();
    expect(parseStrictIsoMs("2026-04-31T12:00:00Z", { requireTimezone: true })).toBeNull();
    expect(parseStrictIsoMs("2026-11-14T18:30:00Z", { requireTimezone: true })).not.toBeNull();

    const previous = loadRealSnapshot("premier-league");
    const prevMs = Date.parse(previous.updatedAt);

    // Fecha imposible en un partido
    const badDate: LeagueSnapshot = structuredClone(previous);
    badDate.updatedAt = new Date(prevMs + 3_600_000).toISOString();
    badDate.games[0] = {
      ...badDate.games[0]!,
      startTime: "2026-02-30T15:00:00Z",
    };
    const resBadDate = validateLeagueSnapshotCandidate(badDate, previous, {
      nowMs: prevMs + 3_660_000,
    });
    expect(resBadDate.ok).toBe(false);
    expect(resBadDate.issues.some((i) => i.code === "IMPOSSIBLE_DATE")).toBe(true);

    // Candidato más viejo que el snapshot actual -> se conserva lo anterior
    const olderCandidate: LeagueSnapshot = structuredClone(previous);
    olderCandidate.updatedAt = new Date(prevMs - 7_200_000).toISOString();
    const resOlder = validateLeagueSnapshotCandidate(olderCandidate, previous, {
      nowMs: prevMs + 60_000,
    });
    expect(resOlder.ok).toBe(false);
    expect(
      resOlder.issues.some((i) => i.code === "STALE_CANDIDATE_OLDER_THAN_CURRENT"),
    ).toBe(true);

    // Candidato que vacía la lista de partidos -> rechazado
    const emptied: LeagueSnapshot = structuredClone(previous);
    emptied.updatedAt = new Date(prevMs + 3_600_000).toISOString();
    emptied.games = [];
    const resEmptied = validateLeagueSnapshotCandidate(emptied, previous, {
      nowMs: prevMs + 3_660_000,
    });
    expect(resEmptied.ok).toBe(false);
    expect(resEmptied.issues.some((i) => i.code === "EMPTY_OR_REGRESSED_SNAPSHOT")).toBe(true);
  });

  it("rechaza momios fuera de rango, márgenes/overrounds absurdos, casas bloqueadas y capturas posteriores al saque inicial", () => {
    const nowMs = Date.parse("2026-11-14T18:00:00Z");
    const baseTick: OddsSnapshotRow = {
      event_id: "ws:football:premier-league:20261115:arsenal:chelsea",
      sport: "football",
      league: "E0",
      market: "1x2",
      line: null,
      selection: "home",
      book: "pinnacle",
      price_decimal: 2.1,
      ts_captured: "2026-11-14T17:30:00Z",
      ts_event_start: "2026-11-15T16:30:00Z",
      source: "scraped_ws",
    };

    // Lote 1X2 sano (overround ~1.028)
    const validGroup: OddsSnapshotRow[] = [
      baseTick,
      { ...baseTick, selection: "draw", price_decimal: 3.55 },
      { ...baseTick, selection: "away", price_decimal: 3.7 },
    ];
    const okBatch = validateOddsTickBatch(validGroup, { nowMs });
    expect(okBatch.acceptedRows).toHaveLength(3);
    expect(okBatch.rejectedIssues).toHaveLength(0);

    // event_id mal formado se rechaza como CROSSED_TEAM_IDENTITY
    const malformedEventId = validateOddsTickBatch(
      validGroup.map((r) => ({ ...r, event_id: "E0__2026-11-15__arsenal__chelsea" })),
      { nowMs },
    );
    expect(malformedEventId.acceptedRows).toHaveLength(0);
    expect(
      malformedEventId.rejectedIssues.some((i) => i.code === "CROSSED_TEAM_IDENTITY"),
    ).toBe(true);

    // Precio fuera de rango (<= 1.00 y > 1000)
    const outOfRange = validateOddsTickBatch(
      [
        { ...baseTick, selection: "home", price_decimal: 0.95 },
        { ...baseTick, selection: "draw", price_decimal: 3.4 },
        { ...baseTick, selection: "away", price_decimal: 1500 },
      ],
      { nowMs },
    );
    expect(outOfRange.acceptedRows).toHaveLength(0);
    expect(outOfRange.rejectedIssues.some((i) => i.code === "ODDS_OUT_OF_RANGE")).toBe(true);

    // Overround absurdo (tres cuotas de 1.20 -> suma implícita = 2.50 > 1.25)
    const absurdMargin = validateOddsTickBatch(
      [
        { ...baseTick, selection: "home", price_decimal: 1.2 },
        { ...baseTick, selection: "draw", price_decimal: 1.2 },
        { ...baseTick, selection: "away", price_decimal: 1.2 },
      ],
      { nowMs },
    );
    expect(absurdMargin.acceptedRows).toHaveLength(0);
    expect(absurdMargin.rejectedIssues.some((i) => i.code === "ABSURD_OVERROUND")).toBe(true);

    // Casa bloqueada legalmente (caliente_mx / action_network)
    const blockedBook = validateOddsTickBatch(
      validGroup.map((r) => ({ ...r, book: "caliente_mx" })),
      { nowMs },
    );
    expect(blockedBook.acceptedRows).toHaveLength(0);
    expect(blockedBook.rejectedIssues.some((i) => i.code === "BLOCKED_BOOK_SOURCE")).toBe(true);

    // Captura posterior al inicio del partido (in-play contaminado)
    const postKickoff = validateOddsTickBatch(
      validGroup.map((r) => ({
        ...r,
        ts_captured: "2026-11-15T16:45:00Z",
        ts_event_start: "2026-11-15T16:30:00Z",
      })),
      { nowMs: Date.parse("2026-11-15T17:00:00Z") },
    );
    expect(postKickoff.acceptedRows).toHaveLength(0);
    expect(postKickoff.rejectedIssues.some((i) => i.code === "POST_KICKOFF_QUOTE")).toBe(true);
  });

  it("valida candidatos de bajas y de live_matchday_v3_snapshot contra regresión temporal", () => {
    const nowMs = Date.parse("2026-11-14T18:00:00Z");
    const prevInjuries: LeagueInjuriesFile = {
      schemaVersion: 1,
      league: "nfl" as LeagueInjuriesFile["league"],
      observedAt: "2026-11-14T16:00:00Z",
      source: "nflverse-cc-by-4.0",
      coverageStatus: "ok",
      entries: [
        {
          teamId: asTeamId("nfl.buffalo-bills"),
          player: "Dalton Kincaid",
          position: "TE",
          status: "Baja",
          detail: "Rodilla",
          reportedAt: "2026-11-14T15:00:00Z",
        },
      ],
    };

    const staleInjuries: LeagueInjuriesFile = {
      ...prevInjuries,
      observedAt: "2026-11-14T12:00:00Z",
    };
    const resStaleInj = validateLeagueInjuriesCandidate(staleInjuries, prevInjuries, { nowMs });
    expect(resStaleInj.ok).toBe(false);
    expect(
      resStaleInj.issues.some((i) => i.code === "STALE_CANDIDATE_OLDER_THAN_CURRENT"),
    ).toBe(true);

    // Snapshot en vivo real debe pasar; uno más viejo que el actual debe rechazarse
    const realLive = JSON.parse(
      readFileSync(
        resolve(REPO_ROOT, "packages/spacetime/data/live_matchday_v3_snapshot.json"),
        "utf8",
      ),
    ) as LiveMatchdaySnapshotPayload;
    const realLiveGenMs = Math.max(
      Date.parse(realLive.generated_at),
      Date.parse(realLive.outlooks_meta?.generated_at_utc ?? realLive.generated_at),
    );
    const liveNowMs = Math.max(Date.parse("2026-11-14T18:00:00Z"), realLiveGenMs + 60_000);
    const liveOk = validateLiveOddsSnapshotCandidate(realLive, null, {
      nowMs: liveNowMs,
    });
    expect(liveOk.ok, JSON.stringify(liveOk.issues)).toBe(true);

    const olderLive: LiveMatchdaySnapshotPayload = {
      ...realLive,
      outlooks_meta: {
        ...realLive.outlooks_meta!,
        generated_at_utc: "2026-11-10T00:00:00Z",
      },
    };
    const liveOlderRes = validateLiveOddsSnapshotCandidate(olderLive, realLive, {
      nowMs: liveNowMs,
    });
    expect(liveOlderRes.ok).toBe(false);
    expect(
      liveOlderRes.issues.some((i) => i.code === "STALE_CANDIDATE_OLDER_THAN_CURRENT"),
    ).toBe(true);
  });
});
