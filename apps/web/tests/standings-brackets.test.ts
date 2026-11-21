import { afterEach, describe, expect, it } from "vitest";
import { containsForbiddenFd16Term } from "@pitchlab/contracts";
import {
  buildLeagueAttackDefenseTable,
  buildLeagueKnockoutBracket,
  buildLeagueStandingsSplits,
  getTeamAttackDefenseComparison,
  resetStandingsBracketsCacheForTests,
} from "../src/server/standings-brackets";

afterEach(() => {
  resetStandingsBracketsCacheForTests();
});

describe("Standings Splits (Total | Local | Visitante) y Zonas por capacidad de liga", () => {
  it("cumple el invariante matemático exacto total = home + away en liga-mx, premier-league, nba y champions-league", () => {
    for (const league of ["liga-mx", "premier-league", "nba", "champions-league"] as const) {
      const splits = buildLeagueStandingsSplits(league);
      expect(splits).not.toBeNull();
      expect(splits!.total.length).toBeGreaterThan(0);
      expect(splits!.home.length).toBe(splits!.total.length);
      expect(splits!.away.length).toBe(splits!.total.length);

      const homeBySlug = new Map(splits!.home.map((row) => [row.teamSlug, row]));
      const awayBySlug = new Map(splits!.away.map((row) => [row.teamSlug, row]));

      for (const totalRow of splits!.total) {
        const homeRow = homeBySlug.get(totalRow.teamSlug);
        const awayRow = awayBySlug.get(totalRow.teamSlug);
        expect(homeRow).toBeDefined();
        expect(awayRow).toBeDefined();

        expect(totalRow.played).toBe(homeRow!.played + awayRow!.played);
        expect(totalRow.won).toBe(homeRow!.won + awayRow!.won);
        expect(totalRow.drawn).toBe(homeRow!.drawn + awayRow!.drawn);
        expect(totalRow.lost).toBe(homeRow!.lost + awayRow!.lost);
        expect(totalRow.goalsFor).toBe(homeRow!.goalsFor + awayRow!.goalsFor);
        expect(totalRow.goalsAgainst).toBe(homeRow!.goalsAgainst + awayRow!.goalsAgainst);
        expect(totalRow.goalDiff).toBe(homeRow!.goalDiff + awayRow!.goalDiff);
        expect(totalRow.points).toBe(homeRow!.points + awayRow!.points);
        expect(totalRow.form.length).toBeLessThanOrEqual(5);
      }

      expect(containsForbiddenFd16Term(JSON.stringify(splits))).toBe(false);
    }
  });

  it("respeta hasRelegationZones: Liga MX con 0 zonas de descenso falsas y Premier League con descenso 18-20", () => {
    const mx = buildLeagueStandingsSplits("liga-mx");
    expect(mx).not.toBeNull();
    expect(mx!.total.length).toBe(18);
    expect(mx!.hasRelegationZones).toBe(false);
    expect(mx!.zones.some((z) => z.tone === "rel" || /descenso/i.test(z.label))).toBe(false);
    expect(mx!.total.some((row) => row.zoneTone === "rel")).toBe(false);
    expect(mx!.zones.some((z) => z.id === "liguilla-direct" && z.startRank === 1 && z.endRank === 6)).toBe(true);
    expect(mx!.zones.some((z) => z.id === "play-in" && z.startRank === 7 && z.endRank === 10)).toBe(true);

    const prem = buildLeagueStandingsSplits("premier-league");
    expect(prem).not.toBeNull();
    expect(prem!.total.length).toBe(20);
    expect(prem!.hasRelegationZones).toBe(true);
    const relZone = prem!.zones.find((z) => z.tone === "rel");
    expect(relZone).toBeDefined();
    expect(relZone!.startRank).toBe(18);
    expect(relZone!.endRank).toBe(20);
    expect(prem!.total.slice(-3).every((row) => row.zoneTone === "rel")).toBe(true);

    const nba = buildLeagueStandingsSplits("nba");
    expect(nba).not.toBeNull();
    expect(nba!.total.length).toBe(30);
    expect(nba!.hasRelegationZones).toBe(false);
    expect(nba!.hasConferences).toBe(true);
    expect(nba!.conferences).toEqual(["Este", "Oeste"]);
    expect(nba!.zones.some((z) => z.tone === "rel")).toBe(false);

    const ucl = buildLeagueStandingsSplits("champions-league");
    expect(ucl).not.toBeNull();
    expect(ucl!.total.length).toBe(36);
    expect(ucl!.hasRelegationZones).toBe(false);
    expect(ucl!.zones.some((z) => z.tone === "rel")).toBe(false);

    expect(buildLeagueStandingsSplits("fa-cup")).toBeNull();
    expect(buildLeagueStandingsSplits("liga-inexistente")).toBeNull();
  });
});

describe("Ataque vs Defensa · rangos ordinales 1..N listos para AtomicStatComparisonBar", () => {
  it("calcula rangos ordinales 1..N en Liga MX y Premier League respetando lowerIsBetter", () => {
    const mxTable = buildLeagueAttackDefenseTable("liga-mx");
    expect(mxTable).not.toBeNull();
    expect(mxTable!.leagueSize).toBe(18);
    expect(mxTable!.teams.length).toBe(18);

    for (const team of mxTable!.teams) {
      expect(team.attackRank).toBeGreaterThanOrEqual(1);
      expect(team.attackRank).toBeLessThanOrEqual(18);
      expect(team.defenseRank).toBeGreaterThanOrEqual(1);
      expect(team.defenseRank).toBeLessThanOrEqual(18);
      expect(team.goalsForPerGame.lowerIsBetter).toBe(false);
      expect(team.goalsAgainstPerGame.lowerIsBetter).toBe(true);
      expect(team.goalsForPerGame.rank).toBeGreaterThanOrEqual(1);
      expect(team.goalsForPerGame.rank).toBeLessThanOrEqual(18);
      expect(team.goalsAgainstPerGame.rank).toBeGreaterThanOrEqual(1);
      expect(team.goalsAgainstPerGame.rank).toBeLessThanOrEqual(18);
      expect(team.shotsPerGame.rank).toBeGreaterThanOrEqual(1);
      expect(team.shotsPerGame.rank).toBeLessThanOrEqual(18);
      expect(team.cleanSheets.rank).toBeGreaterThanOrEqual(1);
      expect(team.cleanSheets.rank).toBeLessThanOrEqual(18);
    }

    const bestAttack = mxTable!.teams.find((t) => t.goalsForPerGame.rank === 1);
    const worstAttack = mxTable!.teams.reduce((prev, curr) =>
      (curr.goalsForPerGame.rank ?? 0) > (prev.goalsForPerGame.rank ?? 0) ? curr : prev,
    );
    expect(bestAttack!.goalsForPerGame.value!).toBeGreaterThanOrEqual(
      worstAttack.goalsForPerGame.value!,
    );

    const bestDefense = mxTable!.teams.find((t) => t.goalsAgainstPerGame.rank === 1);
    const worstDefense = mxTable!.teams.reduce((prev, curr) =>
      (curr.goalsAgainstPerGame.rank ?? 0) > (prev.goalsAgainstPerGame.rank ?? 0) ? curr : prev,
    );
    expect(bestDefense!.goalsAgainstPerGame.value!).toBeLessThanOrEqual(
      worstDefense.goalsAgainstPerGame.value!,
    );
    expect(containsForbiddenFd16Term(JSON.stringify(mxTable))).toBe(false);
  });

  it("genera bloques bilaterales y de equipo único listos para AtomicStatComparisonBar", () => {
    const h2h = getTeamAttackDefenseComparison("liga-mx", "america", "chivas");
    expect(h2h).not.toBeNull();
    expect(h2h!.leagueSize).toBe(18);
    expect(h2h!.teamA.teamSlug).toBe("america");
    expect(h2h!.teamB?.teamSlug).toBe("chivas");
    expect(h2h!.attackMetrics.length).toBeGreaterThanOrEqual(3);
    expect(h2h!.defenseMetrics.length).toBeGreaterThanOrEqual(3);

    const gaMetric = h2h!.defenseMetrics.find((m) => m.key === "goals_against_pg");
    expect(gaMetric).toBeDefined();
    expect(gaMetric!.lowerIsBetter).toBe(true);
    expect(gaMetric!.rankA).toBeGreaterThanOrEqual(1);
    expect(gaMetric!.rankA).toBeLessThanOrEqual(18);
    expect(gaMetric!.rankB).toBeGreaterThanOrEqual(1);
    expect(gaMetric!.rankB).toBeLessThanOrEqual(18);
    expect(containsForbiddenFd16Term(JSON.stringify(h2h))).toBe(false);

    const solo = getTeamAttackDefenseComparison("premier-league", "arsenal");
    expect(solo).not.toBeNull();
    expect(solo!.leagueSize).toBe(20);
    expect(solo!.teamA.teamSlug).toBe("arsenal");
    expect(solo!.teamB).toBeNull();
    expect(solo!.metrics.every((m) => m.rankB === null && m.leagueAverage !== null)).toBe(true);

    const nbaCmp = getTeamAttackDefenseComparison("nba", "los-angeles-lakers", "boston-celtics");
    expect(nbaCmp).not.toBeNull();
    expect(nbaCmp!.leagueSize).toBe(30);
    expect(nbaCmp!.attackMetrics.length).toBeGreaterThanOrEqual(2);
    expect(nbaCmp!.defenseMetrics.length).toBeGreaterThanOrEqual(2);
    expect(containsForbiddenFd16Term(JSON.stringify(nbaCmp))).toBe(false);

    expect(getTeamAttackDefenseComparison("liga-mx", "equipo-fantasma")).toBeNull();
    expect(getTeamAttackDefenseComparison("liga-mx", "america", "equipo-fantasma")).toBeNull();
  });
});

describe("Brackets eliminatorios · Liga MX, Libertadores real, UEFA proyectado, NBA Este/Oeste y Premier null", () => {
  it("devuelve null en ligas sin playoffs (Premier League) y ligas inválidas", () => {
    expect(buildLeagueKnockoutBracket("premier-league")).toBeNull();
    expect(buildLeagueKnockoutBracket("laliga")).toBeNull();
    expect(buildLeagueKnockoutBracket("liga-inexistente")).toBeNull();
  });

  it("construye Liguilla MX determinista con Play-In 7-10, Cuartos, Semis, Final y 0 descenso falso", () => {
    const mx = buildLeagueKnockoutBracket("liga-mx");
    expect(mx).not.toBeNull();
    expect(mx!.mode).toBe("projected_seeding");
    expect(mx!.format).toBe("liga_mx_liguilla");
    expect(mx!.hasRelegationZones).toBe(false);

    const keys = mx!.rounds.map((r) => r.key);
    expect(keys).toEqual(["play_in", "quarterfinals", "semifinals", "final"]);

    const playIn = mx!.rounds.find((r) => r.key === "play_in")!;
    expect(playIn.ties.length).toBe(3);
    expect(playIn.ties[0]!.teamA.seed).toBe(7);
    expect(playIn.ties[0]!.teamB.seed).toBe(8);
    expect(playIn.ties[1]!.teamA.seed).toBe(9);
    expect(playIn.ties[1]!.teamB.seed).toBe(10);

    const qf = mx!.rounds.find((r) => r.key === "quarterfinals")!;
    expect(qf.twoLegged).toBe(true);
    expect(qf.ties.length).toBe(4);
    expect(qf.ties[0]!.teamA.seed).toBe(1);
    expect(qf.ties[1]!.teamA.seed).toBe(2);
    expect(qf.ties[2]!.teamA.seed).toBe(3);
    expect(qf.ties[2]!.teamB.seed).toBe(6);
    expect(qf.ties[3]!.teamA.seed).toBe(4);
    expect(qf.ties[3]!.teamB.seed).toBe(5);
    expect(mx!.finalsTie).not.toBeNull();
    expect(containsForbiddenFd16Term(JSON.stringify(mx))).toBe(false);
  });

  it("construye bracket activo real de Copa Libertadores con ida + vuelta, globales, penales y Final programada", () => {
    const lib = buildLeagueKnockoutBracket("libertadores");
    expect(lib).not.toBeNull();
    expect(lib!.mode).toBe("active_knockout");
    expect(lib!.format).toBe("conmebol_knockout");
    expect(lib!.hasRelegationZones).toBe(false);

    const roundKeys = lib!.rounds.map((r) => r.key);
    expect(roundKeys).toEqual(["round_of_16", "quarterfinals", "semifinals", "final"]);

    const r16 = lib!.rounds.find((r) => r.key === "round_of_16")!;
    const qf = lib!.rounds.find((r) => r.key === "quarterfinals")!;
    const sf = lib!.rounds.find((r) => r.key === "semifinals")!;
    const finalRound = lib!.rounds.find((r) => r.key === "final")!;

    expect(r16.ties.length).toBe(8);
    expect(qf.ties.length).toBe(4);
    expect(sf.ties.length).toBe(2);
    expect(finalRound.ties.length).toBe(1);

    for (const tie of [...qf.ties, ...sf.ties]) {
      expect(tie.legs.length).toBe(2);
      expect(tie.aggregateA).not.toBeNull();
      expect(tie.aggregateB).not.toBeNull();
      expect(tie.status).toBe("decided");
      expect(tie.winnerTeamSlug).not.toBeNull();
    }

    const sfWinners = sf.ties.map((t) => t.winnerTeamSlug).sort();
    expect(sfWinners).toEqual(["estudiantes-la-plata", "palmeiras"]);
    expect(sf.ties.every((t) => t.penaltiesA !== null && t.penaltiesB !== null)).toBe(true);

    expect(lib!.finalsTie).not.toBeNull();
    expect(lib!.finalsTie!.status).toBe("scheduled");
    const finalTeams = [lib!.finalsTie!.teamA.teamSlug, lib!.finalsTie!.teamB.teamSlug].sort();
    expect(finalTeams).toEqual(["estudiantes-la-plata", "palmeiras"]);
    expect(containsForbiddenFd16Term(JSON.stringify(lib))).toBe(false);
  });

  it("construye brackets proyectados de Champions League y Europa League desde la fase de liga", () => {
    for (const league of ["champions-league", "europa-league"] as const) {
      const bracket = buildLeagueKnockoutBracket(league);
      expect(bracket).not.toBeNull();
      expect(bracket!.mode).toBe("projected_seeding");
      expect(bracket!.format).toBe("uefa_knockout");
      expect(bracket!.hasRelegationZones).toBe(false);
      expect(bracket!.rounds.map((r) => r.key)).toEqual([
        "knockout_playoffs",
        "round_of_16",
        "quarterfinals",
        "semifinals",
        "final",
      ]);
      expect(bracket!.finalsTie).not.toBeNull();
      expect(containsForbiddenFd16Term(JSON.stringify(bracket))).toBe(false);
    }
  });

  it("construye bracket NBA con Conferencias Este y Oeste, Play-In, sembrados, gamesBehind y series al mejor de 7", () => {
    const nba = buildLeagueKnockoutBracket("nba");
    expect(nba).not.toBeNull();
    expect(nba!.mode).toBe("projected_seeding");
    expect(nba!.format).toBe("nba_playoffs");
    expect(nba!.hasRelegationZones).toBe(false);
    expect(nba!.conferences.length).toBe(2);
    expect(nba!.conferences.map((c) => c.conference)).toEqual(["Este", "Oeste"]);

    for (const conf of nba!.conferences) {
      expect(conf.playIn.length).toBe(3);
      expect(conf.playIn[0]!.teamA.seed).toBe(7);
      expect(conf.playIn[0]!.teamB.seed).toBe(8);
      expect(conf.playIn[1]!.teamA.seed).toBe(9);
      expect(conf.playIn[1]!.teamB.seed).toBe(10);
      expect(conf.playIn[0]!.teamA.gamesBehind).not.toBeNull();

      const firstRound = conf.rounds.find((r) => r.key === "first_round")!;
      expect(firstRound.bestOf).toBe(7);
      expect(firstRound.ties.length).toBe(4);
      expect(firstRound.ties[0]!.teamA.seed).toBe(1);
      expect(firstRound.ties[0]!.teamA.gamesBehind).toBe("-");
      expect(firstRound.ties[1]!.teamA.seed).toBe(4);
      expect(firstRound.ties[1]!.teamB.seed).toBe(5);
      expect(firstRound.ties[2]!.teamA.seed).toBe(3);
      expect(firstRound.ties[2]!.teamB.seed).toBe(6);
      expect(firstRound.ties[3]!.teamA.seed).toBe(2);
    }

    expect(nba!.finalsTie).not.toBeNull();
    expect(nba!.finalsTie!.bestOf).toBe(7);
    expect(containsForbiddenFd16Term(JSON.stringify(nba))).toBe(false);
  });
});
