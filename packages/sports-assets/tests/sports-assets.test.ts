import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BZZOIRO_LEAGUE_IDS,
  BZZOIRO_TEAM_IDS,
  buildBzzoiroTeamEmblemUrlById,
  getBzzoiroLeagueEmblemUrl,
  getBzzoiroLeagueId,
  getBzzoiroTeamEmblemUrl,
  getBzzoiroTeamId,
  getEmblemPath,
  getMascotPath,
  getOfficialEspnLeagueLogoUrl,
  getOfficialEspnTeamLogoUrl,
  getResolvedTeamEmblem,
  getLeagueAsset,
  getTeamAsset,
  isValidBzzoiroImageUrl,
  resolvePersonPhotoUrl,
  TEAM_ASSETS,
} from "../src/index";

describe("@pitchlab/sports-assets", () => {
  it("registra los emblemas de Liga MX, Premier League, Bundesliga y NFL", () => {
    const mx = getLeagueAsset("liga-mx");
    const pl = getLeagueAsset("premier-league");
    const nfl = getLeagueAsset("nfl");

    expect(mx?.revision).toBe(1);
    expect(mx?.svgPath).toBe("/brand/sports/liga-mx/r1/svg/liga-mx.svg");
    expect(pl?.revision).toBe(2);
    expect(pl?.svgPath).toBe("/brand/sports/premier-league/r2/svg/premier-league.svg");
    expect(nfl?.revision).toBe(1);
    expect(nfl?.svgPath).toBe("/brand/sports/nfl/r1/svg/nfl.svg");
    expect(getLeagueAsset("bundesliga")?.svgPath).toBe(
      "/brand/sports/bundesliga/r1/svg/bundesliga.svg",
    );
    expect(getLeagueAsset("ncaaf")).toBeNull();
  });

  it("distingue liga-mx.atlante de liga-mx.atlas y resuelve rutas versionadas", () => {
    const atlante = getTeamAsset("liga-mx.atlante");
    const atlas = getTeamAsset("liga-mx.atlas");
    expect(atlante?.code).toBe("ATE");
    expect(atlas?.code).toBe("ATS");
    expect(atlante?.svgPath).not.toBe(atlas?.svgPath);

    expect(Object.keys(TEAM_ASSETS)).toHaveLength(208);

    const laliga = getLeagueAsset("laliga");
    expect(laliga?.svgPath).toBe("/brand/sports/laliga/r1/svg/laliga.svg");
    const realMadrid = getTeamAsset("laliga.real-madrid");
    expect(realMadrid?.code).toBe("RMA");
    expect(realMadrid?.svgPath).not.toBe(getTeamAsset("laliga.barcelona")?.svgPath);

    const bayern = getTeamAsset("bundesliga.bayern-munchen");
    const bayer = getTeamAsset("bundesliga.bayer-leverkusen");
    expect(bayern?.code).toBe("FCB");
    expect(bayer?.code).toBe("B04");
    expect(bayern?.svgPath).not.toBe(bayer?.svgPath);
  });

  it("copia los archivos físicos a apps/web/public/brand", () => {
    const webPublic = resolve(import.meta.dirname, "../../../apps/web/public");
    expect(existsSync(resolve(webPublic, "brand/sports/premier-league/r2/svg/arsenal.svg"))).toBe(true);
    expect(existsSync(resolve(webPublic, "brand/sports/nfl/r1/svg/kansas-city-chiefs.svg"))).toBe(true);
    const teamCounts = {
      bundesliga: 18,
      "serie-a": 20,
      "ligue-1": 18,
      mlb: 30,
      nhl: 32,
    };
    for (const [league, count] of Object.entries(teamCounts)) {
      const competition = getLeagueAsset(league);
      if (!competition) throw new Error(`Falta el emblema de ${league}`);
      const teams = Object.values(TEAM_ASSETS).filter((asset) => asset.league === league);
      expect(teams).toHaveLength(count);
      for (const asset of [competition, ...teams]) {
        expect(existsSync(resolve(webPublic, "." + asset.svgPath))).toBe(true);
        expect(existsSync(resolve(webPublic, "." + asset.pngPath))).toBe(true);
      }
    }
    expect(existsSync(resolve(webPublic, "brand/mascot/r1/radar.webp"))).toBe(true);
    expect(getMascotPath("radar")).toBe("/brand/mascot/r1/radar.webp");
  });

  it("resuelve escudos de Bzzoiro para los clubes de fútbol y mantiene fallback local", () => {
    const snapshotsRoot = resolve(import.meta.dirname, "../../../data/snapshots");
    const leagues = [
      "bundesliga",
      "laliga",
      "liga-mx",
      "ligue-1",
      "premier-league",
      "serie-a",
    ];
    for (const league of leagues) {
      expect(existsSync(resolve(snapshotsRoot, league, "latest.json"))).toBe(true);
    }

    let verifiedClubs = 0;
    for (const league of leagues) {
      const snapshotPath = resolve(snapshotsRoot, league, "latest.json");
      const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8")) as {
        games: Array<{
          home: { id: string; slug?: string };
          away: { id: string; slug?: string };
        }>;
      };
      const slugs = new Set<string>();
      for (const game of snapshot.games) {
        slugs.add(game.home.slug ?? game.home.id.split(".")[1]);
        slugs.add(game.away.slug ?? game.away.id.split(".")[1]);
      }
      for (const slug of slugs) {
        const id = getBzzoiroTeamId(league, slug);
        const url = getBzzoiroTeamEmblemUrl(league, slug);
        expect(id, `Falta id Bzzoiro para ${league}.${slug}`).not.toBeNull();
        expect(BZZOIRO_TEAM_IDS[`${league}.${slug}`]).toBe(id);
        expect(url).toBe(`https://sports.bzzoiro.com/img/team/${id}/?bg=transparent`);

        const resolved = getResolvedTeamEmblem(league, slug);
        expect(resolved.src).toBe(url);
        expect(resolved.isExternal).toBe(true);
        expect(resolved.fallbackSrc).toBe(getEmblemPath(league, slug));
        verifiedClubs += 1;
      }
    }
    expect(verifiedClubs).toBeGreaterThanOrEqual(100);

    expect(getBzzoiroTeamId("liga-mx", "monarcas-morelia")).toBe(4215);
    expect(getBzzoiroTeamId("serie-a", "chievo-verona")).toBe(1273);
    expect(getBzzoiroTeamId("liga-mx", "queretaro")).toBe(309);

    const editorial = getResolvedTeamEmblem("premier-league", "arsenal", { editorialOnly: true });
    expect(editorial).toEqual({
      src: "/brand/sports/premier-league/r2/svg/arsenal.svg",
      fallbackSrc: null,
      isExternal: false,
    });

    expect(getBzzoiroTeamId("nfl", "kansas-city-chiefs")).toBeNull();
    expect(getBzzoiroTeamEmblemUrl("mlb", "new-york-yankees")).toBeNull();
    expect(getBzzoiroTeamEmblemUrl("nhl", "boston-bruins")).toBeNull();
    expect(getResolvedTeamEmblem("nfl", "kansas-city-chiefs")).toEqual({
      src: "/brand/sports/nfl/r1/svg/kansas-city-chiefs.svg",
      fallbackSrc: null,
      isExternal: false,
    });
    expect(getResolvedTeamEmblem("mlb", "new-york-yankees")).toEqual({
      src: "/brand/sports/mlb/r1/svg/new-york-yankees.svg",
      fallbackSrc: null,
      isExternal: false,
    });
    expect(getResolvedTeamEmblem("nhl", "boston-bruins")).toEqual({
      src: "/brand/sports/nhl/r1/svg/boston-bruins.svg",
      fallbackSrc: null,
      isExternal: false,
    });
    expect(getResolvedTeamEmblem("premier-league", "club-inexistente")).toEqual({
      src: null,
      fallbackSrc: null,
      isExternal: false,
    });
  });

  it("resuelve los 30 escudos NBA en Bzzoiro basketball y mantiene los 32 de NHL locales", () => {
    const snapshotsRoot = resolve(import.meta.dirname, "../../../data/snapshots");
    const nbaSnap = JSON.parse(
      readFileSync(resolve(snapshotsRoot, "nba", "latest.json"), "utf8"),
    ) as { games: Array<{ home: { id: string; slug?: string }; away: { id: string; slug?: string } }> };

    const nbaSlugs = new Set<string>();
    for (const game of nbaSnap.games) {
      nbaSlugs.add(game.home.slug ?? game.home.id.split(".")[1]);
      nbaSlugs.add(game.away.slug ?? game.away.id.split(".")[1]);
    }
    expect(nbaSlugs.size).toBe(30);

    for (const slug of nbaSlugs) {
      const id = getBzzoiroTeamId("nba", slug);
      const url = getBzzoiroTeamEmblemUrl("nba", slug);
      expect(id, `Falta id Bzzoiro NBA para nba.${slug}`).not.toBeNull();
      expect(url).toBe(`https://sports.bzzoiro.com/img/basketball/team/${id}/?bg=transparent`);
      expect(getResolvedTeamEmblem("nba", slug)).toEqual({
        src: url,
        fallbackSrc: null,
        isExternal: true,
      });
      expect(getResolvedTeamEmblem("nba", slug, { editorialOnly: true })).toEqual({
        src: null,
        fallbackSrc: null,
        isExternal: false,
      });
    }

    const nhlSnap = JSON.parse(
      readFileSync(resolve(snapshotsRoot, "nhl", "latest.json"), "utf8"),
    ) as { games: Array<{ home: { id: string; slug?: string }; away: { id: string; slug?: string } }> };

    const nhlSlugs = new Set<string>();
    for (const game of nhlSnap.games) {
      nhlSlugs.add(game.home.slug ?? game.home.id.split(".")[1]);
      nhlSlugs.add(game.away.slug ?? game.away.id.split(".")[1]);
    }
    expect(nhlSlugs.size).toBe(32);

    for (const slug of nhlSlugs) {
      expect(getBzzoiroTeamId("nhl", slug)).toBeNull();
      expect(getResolvedTeamEmblem("nhl", slug)).toEqual({
        src: `/brand/sports/nhl/r1/svg/${slug}.svg`,
        fallbackSrc: null,
        isExternal: false,
      });
    }
  });

  it("resuelve los emblemas de ligas cubiertas en Bzzoiro y valida host", () => {
    expect(BZZOIRO_LEAGUE_IDS["liga-mx"]).toBe(19);
    expect(getBzzoiroLeagueId("premier-league")).toBe(1);
    expect(getBzzoiroLeagueId("la-liga")).toBe(3);
    expect(getBzzoiroLeagueEmblemUrl("liga-mx")).toBe(
      "https://sports.bzzoiro.com/img/league/19/?bg=transparent",
    );
    expect(getBzzoiroLeagueEmblemUrl("nba")).toBe(
      "https://sports.bzzoiro.com/img/basketball/league/1/?bg=transparent",
    );
    expect(getBzzoiroLeagueEmblemUrl("nfl")).toBeNull();
    expect(getBzzoiroLeagueEmblemUrl("mlb")).toBeNull();
    expect(getBzzoiroLeagueEmblemUrl("nhl")).toBeNull();

    expect(buildBzzoiroTeamEmblemUrlById("liga-mx", 309)).toBe(
      "https://sports.bzzoiro.com/img/team/309/?bg=transparent",
    );
    expect(buildBzzoiroTeamEmblemUrlById("nba", 10)).toBe(
      "https://sports.bzzoiro.com/img/basketball/team/10/?bg=transparent",
    );
    expect(buildBzzoiroTeamEmblemUrlById("liga-mx", 0)).toBeNull();

    expect(isValidBzzoiroImageUrl("https://sports.bzzoiro.com/img/team/309/?bg=transparent")).toBe(
      true,
    );
    expect(isValidBzzoiroImageUrl("http://sports.bzzoiro.com/img/team/309/")).toBe(false);
    expect(isValidBzzoiroImageUrl("https://evil.example.com/img/team/309/")).toBe(false);
  });

  it("resuelve los 30 escudos oficiales de MLB y retratos locales seguros de entrenadores", () => {
    const webPublic = resolve(import.meta.dirname, "../../../apps/web/public");
    expect(getOfficialEspnLeagueLogoUrl("mlb")).toBe("/brand/official/mlb/mlb.png");
    expect(existsSync(resolve(webPublic, "brand/official/mlb/mlb.png"))).toBe(true);

    const mlbTeams = Object.values(TEAM_ASSETS).filter((a) => a.league === "mlb");
    expect(mlbTeams).toHaveLength(30);
    for (const team of mlbTeams) {
      const url = getOfficialEspnTeamLogoUrl("mlb", team.slug);
      expect(url).toBe(`/brand/official/mlb/${team.slug}.png`);
      expect(existsSync(resolve(webPublic, `.${url}`))).toBe(true);
    }

    expect(resolvePersonPhotoUrl("/brand/official/coaches/mlb/los-angeles-dodgers.webp")).toBe(
      "/brand/official/coaches/mlb/los-angeles-dodgers.webp",
    );
    expect(resolvePersonPhotoUrl("/brand/official/coaches/../secrets.webp")).toBeNull();
    expect(resolvePersonPhotoUrl("https://img.mlbstatic.com/foo.png")).toBeNull();
  });
});
