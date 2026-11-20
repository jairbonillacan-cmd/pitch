import { describe, expect, it } from "vitest";
import {
  BZZOIRO_EXPANSION_COMPETITIONS,
  COMPETITION_BY_ID,
  COMPETITION_CATALOG,
  LEAGUE_REGIONS,
  MatchPreGameContextSchema,
  VALID_LEAGUES,
  canonicalGameHref,
  canonicalGameSlug,
  canonicalPlayerHref,
  canonicalTeamHref,
  isLeagueActiveInWindow,
  opaqueShortCode,
  resolveGameBySlugOrId,
} from "../src/index";

describe("ADR-042 · URLs cortas canónicas en inglés y opacas", () => {
  const sampleGame = {
    id: "liga-mx-2026-11-22-america-chivas-bz654421",
    home: { slug: "liga-mx.club-america", name: "Club América", shortName: "América" },
    away: { slug: "liga-mx.guadalajara", name: "Chivas Guadalajara", shortName: "Guadalajara" },
  };

  it("genera rutas cortas /g/, /t/ y /t/.../p/ sin filtrar proveedores ni casas", () => {
    const gameHref = canonicalGameHref("liga-mx", sampleGame);
    expect(gameHref).toMatch(/^\/app\/liga-mx\/g\/[a-z0-9-]+-vs-[a-z0-9-]+-[a-z0-9]{6}$/);
    expect(gameHref).not.toMatch(/bz|bzzoiro|espn|caliente|bet365|2026/i);

    const teamHref = canonicalTeamHref("liga-mx", "liga-mx.club-america");
    expect(teamHref).toBe("/app/liga-mx/t/club-america");

    const playerHref = canonicalPlayerHref("liga-mx", "liga-mx.club-america", "henry-martin");
    expect(playerHref).toBe("/app/liga-mx/t/club-america/p/henry-martin");
  });

  it("resuelve tanto el slug corto canónico como el ID legado con resolveGameBySlugOrId", () => {
    const games = [sampleGame];
    const shortSlug = canonicalGameSlug(sampleGame);

    expect(resolveGameBySlugOrId(games, shortSlug)?.id).toBe(sampleGame.id);
    expect(resolveGameBySlugOrId(games, sampleGame.id)?.id).toBe(sampleGame.id);
    // Resuelve también por código corto final si cambia el apodo del club
    expect(resolveGameBySlugOrId(games, `ame-vs-chi-${opaqueShortCode(sampleGame.id)}`)?.id).toBe(
      sampleGame.id,
    );
    expect(resolveGameBySlugOrId(games, "inexistente-000000")).toBeNull();
  });
});

describe("ADR-043 · Catálogo de 57 competencias, filtro 30d y árbitros", () => {
  it("registra las 57 competencias homogéneas con regiones y MLB en mayúsculas", () => {
    expect(VALID_LEAGUES.length).toBeGreaterThanOrEqual(57);
    expect(COMPETITION_CATALOG).toHaveLength(57);
    expect(BZZOIRO_EXPANSION_COMPETITIONS.length).toBeGreaterThanOrEqual(35);
    expect(COMPETITION_BY_ID["mlb"]?.label).toBe("MLB");
    expect(COMPETITION_BY_ID["champions-league"]?.bzzoiroId).toBe(7);
    expect(COMPETITION_BY_ID["mls"]?.bzzoiroId).toBe(18);
    expect(COMPETITION_BY_ID["concacaf-champions"]?.espnSoccerSlug).toBe("concacaf.champions");
    expect(LEAGUE_REGIONS.length).toBeGreaterThanOrEqual(7);
  });

  it("oculta competencias sin partidos en vivo ni en los próximos 30 días", () => {
    const today = "2026-11-19";
    const games = [
      { league: "liga-mx", status: "NS", dayId: "2026-11-22" },
      { league: "champions-league", status: "LIVE", dayId: "2026-11-19" },
      { league: "copa-america", status: "NS", dayId: "2027-06-15" },
      { league: "eurocopa", status: "FT", dayId: "2026-11-18" },
    ];

    expect(isLeagueActiveInWindow(games, "liga-mx", today, 30)).toBe(true);
    expect(isLeagueActiveInWindow(games, "champions-league", today, 30)).toBe(true);
    expect(isLeagueActiveInWindow(games, "copa-america", today, 30)).toBe(false);
    expect(isLeagueActiveInWindow(games, "eurocopa", today, 30)).toBe(false);
  });

  it("valida RefereeStats y campos extendidos en MatchPreGameContextSchema", () => {
    const parsed = MatchPreGameContextSchema.parse({
      referee: "César Arturo Ramos",
      refereeStats: {
        country: "México",
        matches: 142,
        avgYellow: 4.6,
        avgRed: 0.28,
        avgFouls: 24.3,
      },
      venueCapacity: 83264,
      halfTimeScore: { home: 1, away: 0 },
      stageName: "Cuartos de final",
    });

    expect(parsed.refereeStats?.avgYellow).toBe(4.6);
    expect(parsed.venueCapacity).toBe(83264);
    expect(parsed.halfTimeScore).toEqual({ home: 1, away: 0 });
  });
});
