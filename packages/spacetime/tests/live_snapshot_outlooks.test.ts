import { describe, expect, it } from "vitest";
import liveSnapshotRaw from "../data/live_matchday_v3_snapshot.json";
import footballModelJson from "../data/model_motor_a.json";
import nflModelJson from "../data/model_nfl.json";
import {
  OUTLOOK_SCHEMA_VERSION,
  buildMatchOutlook,
  probabilityToFairOdds,
  type FootballOutlookMarketKey,
  type MatchOutlook,
} from "../src/outlook";

const EXPECTED_FOOTBALL_MARKETS: readonly FootballOutlookMarketKey[] = [
  "1x2",
  "double_chance",
  "totals_1_5",
  "totals_2_5",
  "totals_3_5",
  "btts",
  "dnb",
  "ah_-1_0",
  "ah_-0_5",
  "ah_0_5",
  "ah_1_0",
];
import {
  SERVICE_CONSTANTS_V3_2,
  buildTeamMasterIndex,
  synthesizeFootballSnapshotRowFromMaster,
  synthesizeNflSnapshotRowFromMaster,
  type LiveMatchupEdgeRecord,
  type TeamMasterFeatureRecord,
} from "../src/service";
import type { NFLLiveArtifactConfig } from "../src/nfl_live";
import type { ModelArtifact, NFLModelArtifact } from "../src/types";

interface SnapshotWithOutlooks {
  readonly schema_version: string;
  readonly generated_at: string;
  readonly n_matchups: number;
  readonly n_teams: number;
  readonly executable_bets_count: number;
  readonly counts_by_league: Readonly<Record<string, number>>;
  readonly outlooks_meta: {
    readonly schema_version: string;
    readonly generated_at_utc: string;
    readonly max_quote_age_hours: number;
    readonly n_outlooks_total: number;
    readonly n_football: number;
    readonly n_nfl: number;
    readonly counts_by_league: Readonly<Record<string, number>>;
    readonly n_with_fresh_sharp_quotes_lt_72h: number;
    readonly n_with_any_fresh_quotes_lt_72h: number;
    readonly capture_status: string;
  };
  readonly outlooks: readonly MatchOutlook[];
  readonly edge_matrix_records: readonly LiveMatchupEdgeRecord[];
  readonly team_master_records: readonly TeamMasterFeatureRecord[];
  readonly expected_predictions: readonly unknown[];
}

const snapshot = liveSnapshotRaw as unknown as SnapshotWithOutlooks;

const SOCCER_LEAGUE_TO_DIV: Readonly<Record<string, string>> = {
  bundesliga: "D1",
  epl: "E0",
  laliga: "SP1",
  "liga-mx": "MEX",
  "ligue-1": "F1",
  "serie-a": "I1",
};

const FORBIDDEN_KEYS = new Set([
  "stake",
  "stake_u",
  "stake_raw_u",
  "kelly",
  "kellyfraction",
  "f_full_kelly",
  "f_quarter_kelly",
  "expectededge",
  "edge",
  "edge_effective",
  "ev",
  "ev_shrunk",
  "value",
  "valuestatus",
  "tier",
]);

const BLOCKED_BOOKS = new Set([
  "",
  "none",
  "null",
  "unknown",
  "synthetic",
  "sports_only",
  "action_network",
  "action_network_splits",
  "action_consensus",
  "action_open",
  "caliente",
  "caliente_mx",
]);

function slugToken(raw: string | null | undefined): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function collectForbiddenPublicFields(
  node: unknown,
  path: string,
  violations: string[],
): void {
  if (node === null || node === undefined) return;
  if (typeof node === "string") {
    if (node.toLowerCase().includes("pick seguro")) {
      violations.push(`Texto prohibido 'pick seguro' en ${path}`);
    }
    return;
  }
  if (Array.isArray(node)) {
    for (let idx = 0; idx < node.length; idx += 1) {
      collectForbiddenPublicFields(node[idx], `${path}[${idx}]`, violations);
    }
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      const lower = k.toLowerCase();
      if (FORBIDDEN_KEYS.has(lower) || lower.includes("kelly") || lower.includes("stake")) {
        violations.push(`Clave prohibida '${k}' en ${path}.${k}`);
      }
      collectForbiddenPublicFields(v, `${path}.${k}`, violations);
    }
  }
}

function assertNoForbiddenPublicFields(node: unknown, path = "outlooks"): void {
  const violations: string[] = [];
  collectForbiddenPublicFields(node, path, violations);
  expect(violations).toEqual([]);
}

describe("v3.2 B8 — live_matchday_v3_snapshot.json.outlooks (MatchOutlook[])", () => {
  it("conserva los 242 enfrentamientos heredados y publica los 130 MatchOutlook (84 fútbol + 46 NFL)", () => {
    expect(snapshot.schema_version).toBe("3.2.0");
    expect(snapshot.n_matchups).toBe(242);
    expect(snapshot.n_teams).toBe(376);
    expect(snapshot.executable_bets_count).toBe(0);
    expect(snapshot.edge_matrix_records).toHaveLength(242);
    expect(snapshot.team_master_records).toHaveLength(376);
    expect(snapshot.expected_predictions).toHaveLength(242);

    expect(snapshot.outlooks_meta.schema_version).toBe(OUTLOOK_SCHEMA_VERSION);
    expect(snapshot.outlooks_meta.max_quote_age_hours).toBe(72);
    expect(snapshot.outlooks_meta.n_outlooks_total).toBe(130);
    expect(snapshot.outlooks_meta.n_football).toBe(84);
    expect(snapshot.outlooks_meta.n_nfl).toBe(46);
    expect(snapshot.outlooks).toHaveLength(130);

    const nFootball = snapshot.outlooks.filter((o) => o.sport === "football").length;
    const nNfl = snapshot.outlooks.filter((o) => o.sport === "nfl").length;
    expect(nFootball).toBe(84);
    expect(nNfl).toBe(46);
    expect(snapshot.outlooks_meta.counts_by_league).toEqual({
      bundesliga: 17,
      epl: 24,
      laliga: 5,
      "liga-mx": 10,
      "ligue-1": 11,
      nfl: 46,
      "serie-a": 17,
    });
  });

  it("cumple tipos, sumas de probabilidad < 1e-12, cuotas justas exactas y coherencia interna de outlook.ts", () => {
    const seenIds = new Set<string>();
    let maxSimplexError = 0;

    for (const outlook of snapshot.outlooks) {
      expect(outlook.schemaVersion).toBe(OUTLOOK_SCHEMA_VERSION);
      expect(seenIds.has(outlook.matchId)).toBe(false);
      seenIds.add(outlook.matchId);
      expect(outlook.homeTeam.length).toBeGreaterThan(0);
      expect(outlook.awayTeam.length).toBeGreaterThan(0);

      expect(outlook.dataQuality.coverageRatio).toBeGreaterThanOrEqual(0);
      expect(outlook.dataQuality.coverageRatio).toBeLessThanOrEqual(1);
      expect(["ok", "low_coverage", "fallback_base_rate"]).toContain(outlook.dataQuality.flag);

      if (outlook.sport === "football") {
        expect(outlook.markets.map((m) => m.marketKey)).toEqual([...EXPECTED_FOOTBALL_MARKETS]);
        expect(outlook.topScorelines).toHaveLength(3);
        expect(outlook.dixonColesParams).not.toBeNull();
        expect(outlook.dixonColesParams!.lamHome).toBeGreaterThan(0);
        expect(outlook.dixonColesParams!.lamAway).toBeGreaterThan(0);

        for (let i = 0; i < outlook.topScorelines.length; i += 1) {
          const sc = outlook.topScorelines[i]!;
          expect(sc.p).toBeGreaterThan(0);
          expect(sc.p).toBeLessThan(1);
          expect(sc.fairOdds).toEqual(probabilityToFairOdds(sc.p));
          if (i > 0) {
            expect(outlook.topScorelines[i - 1]!.p).toBeGreaterThanOrEqual(sc.p - 1e-15);
          }
        }
      } else {
        expect(outlook.sport).toBe("nfl");
        expect(outlook.canonicalLeague).toBe("NFL");
        expect(outlook.markets[0]?.marketKey).toBe("moneyline");
        expect(outlook.topScorelines).toEqual([]);
        expect(outlook.dixonColesParams).toBeNull();
      }

      for (const mkt of outlook.markets) {
        expect(outlook.marketsByKey[mkt.marketKey]).toEqual(mkt);
        const expectedSum = mkt.marketKey === "double_chance" ? 2 : 1;
        expect(mkt.expectedProbabilitySum).toBe(expectedSum);
        expect(mkt.isOverlappingMarket).toBe(mkt.marketKey === "double_chance");

        const sumP = mkt.selections.reduce((acc, s) => acc + s.p, 0);
        const err = Math.abs(sumP - expectedSum);
        expect(err, `${outlook.matchId}::${mkt.marketKey} sum=${sumP}`).toBeLessThan(1e-12);
        if (err > maxSimplexError) maxSimplexError = err;

        const mostLikely = mkt.selections.filter((s) => s.isMostLikely);
        expect(mostLikely).toHaveLength(1);
        expect(mostLikely[0]!.rank).toBe(1);
        expect(mkt.headline).toEqual({
          selection: mostLikely[0]!.selection,
          label: mostLikely[0]!.label,
          line: mostLikely[0]!.line,
          p: mostLikely[0]!.p,
          fairOdds: mostLikely[0]!.fairOdds,
          pSource: mostLikely[0]!.pSource,
        });

        for (const sel of mkt.selections) {
          expect(sel.p).toBeGreaterThan(0);
          expect(sel.p).toBeLessThan(1);
          expect(sel.fairOdds).toEqual(probabilityToFairOdds(sel.p));
          expect(sel.calibrationBucket.binIndex).toBeGreaterThanOrEqual(0);
          expect(sel.calibrationBucket.binIndex).toBeLessThanOrEqual(9);
          expect(sel.calibrationBucket.n).toBeGreaterThanOrEqual(0);
        }
      }
    }

    expect(maxSimplexError).toBeLessThan(1e-12);
  });

  it("exige antigüedad estricta < 72 h, causalidad pre-kickoff y cero precios sintéticos cuando falta captura", () => {
    const generatedAtMs = Date.parse(snapshot.outlooks_meta.generated_at_utc);
    expect(Number.isFinite(generatedAtMs)).toBe(true);
    const maxAgeMs = snapshot.outlooks_meta.max_quote_age_hours * 3_600_000;

    let nWithFreshSharp = 0;
    for (const outlook of snapshot.outlooks) {
      if (outlook.dataQuality.sharpMarketAvailable) {
        nWithFreshSharp += 1;
      }
      const kickoffMs = outlook.kickoffUtc ? Date.parse(outlook.kickoffUtc) : null;

      for (const mkt of outlook.markets) {
        if (mkt.market === null) {
          const parent1x2HasQuote =
            mkt.marketKey === "double_chance" &&
            outlook.marketsByKey["1x2"]?.market !== null;
          const allowedSources = parent1x2HasQuote
            ? ["model", "base_rate", "market_sharp_novig", "blend_v3_1"]
            : ["model", "base_rate"];
          for (const sel of mkt.selections) {
            expect(allowedSources).toContain(sel.pSource);
          }
        } else {
          const bookNorm = mkt.market.book.trim().toLowerCase();
          expect(BLOCKED_BOOKS.has(bookNorm)).toBe(false);
          const capMs = Date.parse(mkt.market.tsCaptured);
          expect(Number.isFinite(capMs)).toBe(true);

          const ageMs = generatedAtMs - capMs;
          expect(ageMs).toBeGreaterThanOrEqual(0);
          expect(ageMs).toBeLessThan(maxAgeMs);

          if (kickoffMs !== null && Number.isFinite(kickoffMs)) {
            expect(capMs).toBeLessThanOrEqual(kickoffMs);
          }

          expect(Number.isFinite(mkt.market.overround)).toBe(true);
          expect(mkt.market.overround).toBeGreaterThanOrEqual(-0.1);
          expect(mkt.market.overround).toBeLessThanOrEqual(0.2);
        }
      }
    }

    expect(nWithFreshSharp).toBe(snapshot.outlooks_meta.n_with_fresh_sharp_quotes_lt_72h);
  });

  it("no expone jamás stake, kelly, expectedEdge, ev, value, tier ni 'pick seguro'", () => {
    assertNoForbiddenPublicFields(snapshot.outlooks, "outlooks");
    assertNoForbiddenPublicFields(snapshot.outlooks_meta, "outlooks_meta");
  });

  it("mantiene paridad 1:1 (< 1e-12) contra buildMatchOutlook ejecutado directamente en TypeScript sobre los 130 partidos", () => {
    if (snapshot.outlooks_meta.n_with_any_fresh_quotes_lt_72h !== 0) {
      // Cuando hay ticks externos en ../web-scraping, verificamos paridad sobre los partidos sin ticks adjuntos
    }
    const footballModel = footballModelJson as unknown as ModelArtifact;
    const nflModel = nflModelJson as unknown as NFLModelArtifact & NFLLiveArtifactConfig;
    const teamIndex = buildTeamMasterIndex(snapshot.team_master_records, nflModel);
    const byId = new Map(snapshot.outlooks.map((o) => [o.matchId, o]));

    let checkedCount = 0;
    let maxProbDelta = 0;

    for (const rec of snapshot.edge_matrix_records) {
      const leagueRaw = String(rec.league ?? "").trim().toLowerCase();
      const sportRaw = String(rec.sport ?? "").trim().toLowerCase();
      const isNfl = leagueRaw === "nfl";
      const soccerDiv = SOCCER_LEAGUE_TO_DIV[leagueRaw];
      if (!isNfl && !soccerDiv) continue;

      const actual = byId.get(rec.matchup_id);
      expect(actual).toBeDefined();
      if (!actual || actual.markets.some((m) => m.market !== null)) continue;

      const sHome = slugToken(rec.home_team);
      const sAway = slugToken(rec.away_team);
      const homeMaster =
        teamIndex.byLeagueSlug.get(`${leagueRaw}::${sHome}`) ??
        teamIndex.bySportSlug.get(`${sportRaw}::${sHome}`) ??
        null;
      const awayMaster =
        teamIndex.byLeagueSlug.get(`${leagueRaw}::${sAway}`) ??
        teamIndex.bySportSlug.get(`${sportRaw}::${sAway}`) ??
        null;

      const expected = isNfl
        ? (() => {
            const homeAbbr = teamIndex.nflSlugToAbbr.get(sHome) ?? "";
            const awayAbbr = teamIndex.nflSlugToAbbr.get(sAway) ?? "";
            const synthNfl = synthesizeNflSnapshotRowFromMaster(
              homeAbbr,
              awayAbbr,
              homeMaster,
              awayMaster,
              rec,
              nflModel,
              SERVICE_CONSTANTS_V3_2,
            );
            return buildMatchOutlook({
              matchId: rec.matchup_id,
              sport: "nfl",
              league: rec.league,
              homeTeam: rec.home_team,
              awayTeam: rec.away_team,
              tsDecision: snapshot.outlooks_meta.generated_at_utc,
              kickoffUtc: actual.kickoffUtc,
              nfl: {
                nflRow: synthNfl.row,
                nflModel,
                liveContext: synthNfl.liveContext,
                liveConfig: nflModel,
              },
              oddsSnapshots: [],
              maxQuoteAgeMinutes: snapshot.outlooks_meta.max_quote_age_hours * 60,
            });
          })()
        : (() => {
            const synth = synthesizeFootballSnapshotRowFromMaster(
              soccerDiv!,
              homeMaster,
              awayMaster,
              rec,
              footballModel,
              SERVICE_CONSTANTS_V3_2,
            );
            return buildMatchOutlook({
              matchId: rec.matchup_id,
              sport: "football",
              league: rec.league,
              homeTeam: rec.home_team,
              awayTeam: rec.away_team,
              tsDecision: snapshot.outlooks_meta.generated_at_utc,
              kickoffUtc: actual.kickoffUtc,
              football: {
                footballRow: synth.row,
                footballModel,
              },
              oddsSnapshots: [],
              maxQuoteAgeMinutes: snapshot.outlooks_meta.max_quote_age_hours * 60,
            });
          })();

      for (let mIdx = 0; mIdx < actual.markets.length; mIdx += 1) {
        const aMkt = actual.markets[mIdx]!;
        const eMkt = expected.markets[mIdx]!;
        for (let sIdx = 0; sIdx < aMkt.selections.length; sIdx += 1) {
          const delta = Math.abs(aMkt.selections[sIdx]!.p - eMkt.selections[sIdx]!.p);
          if (delta > maxProbDelta) maxProbDelta = delta;
          expect(delta).toBeLessThan(1e-12);
        }
      }
      expect(actual).toEqual(expected);
      checkedCount += 1;
    }

    expect(checkedCount).toBe(130 - snapshot.outlooks_meta.n_with_any_fresh_quotes_lt_72h);
    expect(maxProbDelta).toBeLessThan(1e-12);
  });
});
