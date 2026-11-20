import { describe, expect, it } from "vitest";
import { asTeamId, type LeagueSnapshot } from "@pitchlab/contracts";
import { parseBzzoiroOdds } from "../src/odds/bzzoiro-odds.js";
import {
  applyBzzoiroPreMatchEnrichmentToSnapshot,
  compareModelVsBzzoiroPredictions,
  parseBzzoiroLineupsToProjection,
  parseBzzoiroMatchContext,
  parseBzzoiroPredictionRow,
  parseBzzoiroScheduleChanges,
  parseBzzoiroSquadAvailability,
} from "../src/providers/bzzoiro-enrichment.js";
import {
  mergeCommentary,
  parseBroadcastsMx,
  parseCommentary,
  parseLiveTeamStats,
  parsePlayerStats,
} from "../src/providers/bzzoiro-live.js";
import {
  buildNbaPlayerPropSeeds,
  parseBzzoiroNbaBoxScore,
  parseBzzoiroNbaOdds,
  parseBzzoiroNbaStandings,
} from "../src/providers/bzzoiro-nba-rich.js";
import { readProviderConfigs } from "../src/providers/config.js";
import { createProviderClient } from "../src/providers/http.js";
import { mergeLeagueInjuryEntries } from "../src/adapters/injuries.js";

describe("Bzzoiro Fase 1 · Enriquecimiento, mercados, live y NBA", () => {
  it("reconoce cuota ilimitada cuando BZZOIRO_UNLIMITED=1 y no corta peticiones en http client", async () => {
    const cfg = readProviderConfigs({
      BZZOIRO_API_KEY: "test-key-1234",
      BZZOIRO_UNLIMITED: "1",
    }).bzzoiro;
    expect(cfg.unlimitedQuota).toBe(true);

    let hits = 0;
    const client = createProviderClient(cfg, {
      cacheDir: "/tmp/pitchlab-test-cache-unlimited",
      minIntervalMs: 0,
      maxRequests: 1,
      fetchImpl: async () => {
        hits += 1;
        return new Response(JSON.stringify({ ok: hits }), { status: 200 });
      },
    });
    const r1 = await client.get<{ ok: number }>("/leagues/?a=1", { cache: false });
    const r2 = await client.get<{ ok: number }>("/leagues/?a=2", { cache: false });
    expect(r1?.ok).toBe(1);
    expect(r2?.ok).toBe(2);
    expect(client.stats.requests).toBe(2);
  });

  it("parsea bajas por plantilla con fecha de regreso, alineaciones probables/confirmadas y contexto MX", () => {
    const squadInjuries = parseBzzoiroSquadAvailability({
      league: "premier-league",
      teamId: "premier-league.arsenal",
      observedAtIso: "2026-11-18T12:00:00Z",
      squad: [
        {
          id: 10,
          name: "Bukayo Saka",
          position: "RW",
          availability: "doubtful",
          injury_type: "Isquiotibiales",
          expected_return: "2026-11-24",
        },
        {
          id: 11,
          name: "Martin Odegaard",
          position: "CM",
          availability: "available",
        },
      ],
    });
    expect(squadInjuries).toHaveLength(1);
    expect(squadInjuries[0]).toMatchObject({
      teamId: asTeamId("premier-league.arsenal"),
      player: "Bukayo Saka",
      status: "Duda",
      injuryType: "Isquiotibiales",
      returnDate: "2026-11-24",
    });

    const merged = mergeLeagueInjuryEntries(squadInjuries, [
      {
        teamId: asTeamId("premier-league.arsenal"),
        player: "Bukayo Saka",
        status: "Duda",
        detail: "Parte ESPN",
        reportedAt: "2026-11-18T10:00:00Z",
      },
      {
        teamId: asTeamId("premier-league.arsenal"),
        player: "Takehiro Tomiyasu",
        status: "Baja",
        detail: "Rodilla",
        reportedAt: "2026-11-18T10:00:00Z",
      },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.find((m) => m.player === "Bukayo Saka")?.returnDate).toBe("2026-11-24");

    const starters = Array.from({ length: 11 }, (_, i) => ({
      id: i + 1,
      name: `Jugador ${i + 1}`,
      position: "MF",
      shirt_number: i + 1,
    }));
    const lineupsRes = parseBzzoiroLineupsToProjection({
      raw: {
        event_id: 99,
        lineup_status: "predicted",
        confidence: 82,
        lineups: {
          home: { formation: "4-3-3", players: starters },
          away: { formation: "4-2-3-1", players: starters },
        },
        unavailable_players: {
          away: [{ id: 50, name: "Reece James", status: "injured", reason: "Muscular" }],
        },
      },
      homeTeamId: "premier-league.arsenal",
      awayTeamId: "premier-league.chelsea",
      gameId: "epl-ars-che",
      updatedAtIso: "2026-11-18T15:00:00Z",
    });
    expect(lineupsRes.projection?.status).toBe("predicted");
    expect(lineupsRes.projection?.confidence).toBeCloseTo(0.82, 4);
    expect(lineupsRes.unavailableAway[0]?.player).toBe("Reece James");

    const ctx = parseBzzoiroMatchContext(
      {
        id: 99,
        league_id: 1,
        season_id: 1,
        home_team_id: 1,
        home_team: "Arsenal",
        away_team_id: 2,
        away_team: "Chelsea",
        event_date: "2026-11-22T16:30:00Z",
        status: "notstarted",
        home_score: null,
        away_score: null,
        is_local_derby: true,
        travel_distance_km: 18.4,
        pitch_condition: 1,
        weather: { description: "Lluvia ligera", temperature_c: 11.2, wind_speed: 19 },
        referee_name: "Michael Oliver",
      },
      { results: [{ channel: "Fox Sports" }, { broadcaster: "Max" }] },
    );
    expect(ctx).toMatchObject({
      referee: "Michael Oliver",
      pitchCondition: "Óptimo",
      travelDistanceKm: 18,
      isLocalDerby: true,
      broadcastsMx: ["Fox Sports", "Max"],
      weather: { description: "Lluvia ligera", temperatureC: 11.2, windSpeedKmh: 19 },
    });

    const changes = parseBzzoiroScheduleChanges({
      results: [
        {
          event_id: 501,
          home_team: "Arsenal",
          away_team: "Chelsea",
          old_event_date: "2026-11-22T15:00:00Z",
          new_event_date: "2026-11-22T16:30:00Z",
          status: "rescheduled",
        },
      ],
    });
    expect(changes).toHaveLength(1);
    expect(changes[0]?.newStartUtc).toBe("2026-11-22T16:30:00Z");

    const snapStub: LeagueSnapshot = {
      schemaVersion: 1,
      league: "premier-league" as LeagueSnapshot["league"],
      season: "2026-27" as LeagueSnapshot["season"],
      seasonLabel: "2026-27",
      periodLabel: "Jornada 12",
      updatedAt: "2026-11-18T12:00:00Z",
      source: "test",
      provenance: "derived",
      isDemo: false,
      teamRates: {},
      games: [],
      analyses: {},
    };
    expect(applyBzzoiroPreMatchEnrichmentToSnapshot(snapStub, new Map())).toBe(snapStub);
  });

  it("acepta Betcris, apertura/movimiento de línea, mejor momio y mercados extra (corners, DNB, DC, portería a cero)", () => {
    const capturedAtIso = "2026-11-18T18:00:00Z";
    const event = {
      id: 777,
      home_team: "Arsenal",
      away_team: "Chelsea",
      event_date: "2026-11-22T16:30:00Z",
      status: "notstarted",
    };
    const rows = [
      // 1X2 completo Codere vs Betcris (apertura y acortamiento)
      { market: "1x2", outcome: "home", bookmaker_slug: "codere", decimal_odds: 1.9, opening_odds: 2.05, movement: "SHORTENING" },
      { market: "1x2", outcome: "draw", bookmaker_slug: "codere", decimal_odds: 3.5, opening_odds: 3.4 },
      { market: "1x2", outcome: "away", bookmaker_slug: "codere", decimal_odds: 4.1, opening_odds: 3.8 },
      { market: "1x2", outcome: "home", bookmaker_slug: "betcris", decimal_odds: 1.95 },
      { market: "1x2", outcome: "draw", bookmaker_slug: "betcris", decimal_odds: 3.45 },
      { market: "1x2", outcome: "away", bookmaker_slug: "betcris", decimal_odds: 3.9 },
      // Córners 9.5
      { market: "total_corners", outcome: "over", line: 9.5, bookmaker_slug: "pinnacle", decimal_odds: 1.92 },
      { market: "total_corners", outcome: "under", line: 9.5, bookmaker_slug: "pinnacle", decimal_odds: 1.94 },
      // Doble oportunidad
      { market: "double_chance", outcome: "1x", bookmaker_slug: "bet365", decimal_odds: 1.25 },
      { market: "double_chance", outcome: "12", bookmaker_slug: "bet365", decimal_odds: 1.3 },
      { market: "double_chance", outcome: "x2", bookmaker_slug: "bet365", decimal_odds: 1.95 },
      // DNB
      { market: "draw_no_bet", outcome: "home", bookmaker_slug: "betcris", decimal_odds: 1.4 },
      { market: "draw_no_bet", outcome: "away", bookmaker_slug: "betcris", decimal_odds: 2.9 },
      // Clean sheet home
      { market: "clean_sheet", outcome: "home_yes", bookmaker_slug: "bet365", decimal_odds: 2.3 },
      { market: "clean_sheet", outcome: "home_no", bookmaker_slug: "bet365", decimal_odds: 1.62 },
    ];

    const oddsByEvent = new Map([[777, rows]]);
    const accepted = parseBzzoiroOdds({
      events: [event],
      oddsByEvent,
      appLeague: "premier-league",
      capturedAtIso,
      nowMs: Date.parse(capturedAtIso),
    });

    const codereHome = accepted.find((r) => r.market === "1x2" && r.book === "codere" && r.selection === "home");
    const betcrisHome = accepted.find((r) => r.market === "1x2" && r.book === "betcris" && r.selection === "home");
    const cornersOver = accepted.find((r) => r.market === "corners_total" && r.selection === "over");
    const dnbHome = accepted.find((r) => r.market === "dnb" && r.selection === "home");
    const dc = accepted.filter((r) => r.market === "double_chance");
    const cs = accepted.filter((r) => r.market === "clean_sheet_home");

    expect(codereHome?.opening_price).toBe(2.05);
    expect(codereHome?.movement_direction).toBe("shortening");
    expect(codereHome?.is_best_odds).toBeUndefined();
    expect(betcrisHome?.is_best_odds).toBe(true);
    expect(cornersOver?.line).toBe(9.5);
    expect(dnbHome?.book).toBe("betcris");
    expect(dc).toHaveLength(3);
    expect(cs).toHaveLength(2);
  });

  it("parsea commentary incremental, player-stats, stats avanzadas y broadcasts MX en vivo", () => {
    const st = parseLiveTeamStats({
      xg: 1.84,
      total_shots: 14,
      shots_on_target: 6,
      corner_kicks: 7,
      ball_possession: 58,
      fouls: 9,
      yellow_cards: 2,
      red_cards: 0,
      offsides: 1,
      big_chances: 3,
      goals_prevented: 0.72,
      touches_in_penalty_area: 29,
      accurate_passes_pct: 87,
    });
    expect(st.goalsPrevented).toBe(0.72);
    expect(st.touchesInBox).toBe(29);
    expect(st.passAccuracyPct).toBe(87);

    const c1 = parseCommentary({ results: [{ id: 1, minute: 12, text: "Tiro al poste de Saka", is_important: true, is_home: true }] });
    const c2 = parseCommentary({ results: [{ id: 2, minute: 45, added_time: 2, text: "Descanso en Londres" }] });
    expect(mergeCommentary(c1, c2).map((c) => c.minute)).toEqual([12, 45]);

    const players = parsePlayerStats({
      home: [
        { player: "Bukayo Saka", position: "RW", minutes_played: 90, rating: 8.6, goals: 1, assists: 1, total_shots: 4, shots_on_target: 2, key_passes: 3, xg: 0.48, xa: 0.35 },
      ],
      away: [
        { player_name: "Cole Palmer", position: "AM", minutes_played: 84, rating: 7.4, total_shots: 3, shots_on_target: 1 },
      ],
    });
    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({ player: "Bukayo Saka", side: "home", rating: 8.6, goals: 1 });
    expect(parseBroadcastsMx({ results: [{ channel: "ESPN" }, { channel: "ESPN" }, { name: "Disney+" }] })).toEqual(["ESPN", "Disney+"]);
  });

  it("parsea clasificación NBA, box score, cuotas con movimiento, props de jugador y benchmark de predicciones", () => {
    const standings = parseBzzoiroNbaStandings({
      east: [
        { team: "Boston Celtics", wins: 12, losses: 3, points_for: 1780, points_against: 1620, games_behind: 0, seed: 1 },
        { team: "Miami Heat", wins: 9, losses: 6, points_for: 1650, points_against: 1610, games_behind: 3, seed: 4 },
      ],
      west: [
        { team: "Denver Nuggets", wins: 11, losses: 4, points_for: 1720, points_against: 1640, games_behind: 0, seed: 1 },
      ],
    });
    expect(standings).toHaveLength(3);
    expect(standings[0]?.conference).toBe("Este");
    expect(standings.find((s) => s.teamId === "nba.denver-nuggets")?.conference).toBe("Oeste");

    const box = parseBzzoiroNbaBoxScore({
      home: { fg_pct: 49.2, three_pt_pct: 38.5, rebounds: 46, assists: 28, pace: 99.4 },
      away: { fg_pct: 44.1, rebounds: 39, turnovers: 15 },
    });
    expect(box?.home.fgPct).toBe(49.2);
    expect(box?.away.turnovers).toBe(15);

    const nbaOdds = parseBzzoiroNbaOdds({
      homeTeamRaw: "Boston Celtics",
      awayTeamRaw: "Miami Heat",
      kickoffUtc: "2026-11-22T00:30:00Z",
      capturedAtUtc: "2026-11-21T18:00:00Z",
      odds: [
        { market: "moneyline", outcome: "home", bookmaker_slug: "codere", decimal_odds: 1.48, opening_odds: 1.55 },
        { market: "spread", outcome: "home", line: -5.5, bookmaker_slug: "betcris", decimal_odds: 1.91 },
        { market: "totals", outcome: "over", line: 224.5, bookmaker_slug: "pinnacle", decimal_odds: 1.95 },
      ],
    });
    expect(nbaOdds).toHaveLength(3);
    expect(nbaOdds[0]?.movement_direction).toBe("shortening");

    const props = buildNbaPlayerPropSeeds({
      player: "Jayson Tatum",
      teamSlug: "boston-celtics",
      teamName: "Boston Celtics",
      position: "SF",
      games: [
        { points: 28, rebounds: 8, assists: 5, three_pointers_made: 4 },
        { points: 31, rebounds: 9, assists: 6, three_pointers_made: 5 },
        { points: 24, rebounds: 7, assists: 4, three_pointers_made: 2 },
        { points: 34, rebounds: 10, assists: 6, three_pointers_made: 4 },
      ],
    });
    expect(props.some((p) => p.statKey === "pts" && p.last10.length === 4)).toBe(true);
    expect(props.some((p) => p.statKey === "pra")).toBe(true);

    const pred = parseBzzoiroPredictionRow({
      event_id: 1,
      home_team: "Arsenal",
      away_team: "Chelsea",
      prob_home: 55,
      prob_draw: 25,
      prob_away: 20,
    });
    expect(pred?.pHome).toBeCloseTo(0.55, 3);
    const cmp = compareModelVsBzzoiroPredictions([
      { model1X2: [0.6, 0.25, 0.15], bzzoiro1X2: [0.55, 0.25, 0.2], actualOutcome: 0 },
    ]);
    expect(cmp.nGames).toBe(1);
    expect(cmp.logLossDelta).toBeLessThan(0);
  });
});
