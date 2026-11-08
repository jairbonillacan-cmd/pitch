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
  it("registra los emblemas de Liga MX (r1), Premier League (r2) y NFL (r1)", () => {
    const mx = getLeagueAsset("liga-mx");
    const pl = getLeagueAsset("premier-league");
    const nfl = getLeagueAsset("nfl");

    expect(mx?.revision).toBe(1);
    expect(mx?.svgPath).toBe("/brand/sports/liga-mx/r1/svg/liga-mx.svg");
    expect(pl?.revision).toBe(2);
    expect(pl?.svgPath).toBe("/brand/sports/premier-league/r2/svg/premier-league.svg");
    expect(nfl?.revision).toBe(1);
    expect(nfl?.svgPath).toBe("/brand/sports/nfl/r1/svg/nfl.svg");
    expect(getLeagueAsset("nhl")).toBeNull();
  });

  it("distingue liga-mx.atlante de liga-mx.atlas y resuelve rutas versionadas", () => {
    const atlante = getTeamAsset("liga-mx.atlante");
    const atlas = getTeamAsset("liga-mx.atlas");
    expect(atlante?.code).toBe("ATE");
    expect(atlas?.code).toBe("ATS");
    expect(atlante?.svgPath).not.toBe(atlas?.svgPath);

    // 18 Liga MX + 20 Premier League + 32 NFL = 70 equipos
    expect(Object.keys(TEAM_ASSETS)).toHaveLength(70);
  });

  it("copia los archivos físicos a apps/web/public/brand", () => {
    const webPublic = resolve(import.meta.dirname, "../../../apps/web/public");
    expect(existsSync(resolve(webPublic, "brand/sports/premier-league/r2/svg/arsenal.svg"))).toBe(true);
    expect(existsSync(resolve(webPublic, "brand/sports/nfl/r1/svg/kansas-city-chiefs.svg"))).toBe(true);
    expect(existsSync(resolve(webPublic, "brand/mascot/r1/radar.webp"))).toBe(true);
    expect(getMascotPath("radar")).toBe("/brand/mascot/r1/radar.webp");
  });
});
