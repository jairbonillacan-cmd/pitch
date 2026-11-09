import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  getLeagueAsset,
  getMascotPath,
  getTeamAsset,
  TEAM_ASSETS,
} from "../src/index.js";

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
});
