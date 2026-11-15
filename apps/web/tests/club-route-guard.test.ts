import { describe, expect, it } from "vitest";
import { resolveClubRoute } from "../src/server/club-route-guard";

const opts = {
  isLeague: (seg: string) =>
    seg === "nfl" || seg === "nba" || seg === "nhl" || seg === "liga-mx" || seg === "premier-league",
  gameExists: (league: string, id: string) =>
    (league === "nfl" && id === "nfl-buf-kc") ||
    (league === "nba" && id === "nba-2026-11-15-ind-phi"),
  teamExists: (league: string, id: string) =>
    (league === "nfl" && id === "kansas-city-chiefs") ||
    (league === "liga-mx" && id === "monterrey") ||
    (league === "nba" && id === "denver-nuggets"),
};

describe("resolveClubRoute", () => {
  it("redirige alias legados conservando parámetros de consulta", () => {
    expect(resolveClubRoute("/app/account/referrals", opts)).toEqual({
      kind: "redirect",
      to: "/app/account?tab=referrals",
    });
    expect(resolveClubRoute("/app/account/notifications", opts)).toEqual({
      kind: "redirect",
      to: "/app/account?tab=prefs",
    });
    expect(resolveClubRoute("/app/tipstar?connect=listo", opts)).toEqual({
      kind: "redirect",
      to: "/app/tipster?connect=listo",
    });
    expect(resolveClubRoute("/app/journal?vista=parlays", opts)).toEqual({
      kind: "redirect",
      to: "/app/lab?vista=parlays",
    });
    expect(resolveClubRoute("/app/epl/", opts)).toEqual({
      kind: "redirect",
      to: "/app/premier-league",
    });
  });

  it("permite rutas válidas del club, ligas, perfiles y partidos existentes", () => {
    expect(resolveClubRoute("/app", opts)).toEqual({ kind: "ok", pathname: "/app" });
    expect(resolveClubRoute("/app/lab?tab=pendientes", opts)).toEqual({
      kind: "ok",
      pathname: "/app/lab",
    });
    expect(resolveClubRoute("/app/nfl", opts)).toEqual({ kind: "ok", pathname: "/app/nfl" });
    expect(resolveClubRoute("/app/nba", opts)).toEqual({ kind: "ok", pathname: "/app/nba" });
    expect(resolveClubRoute("/app/nhl", opts)).toEqual({ kind: "ok", pathname: "/app/nhl" });
    expect(resolveClubRoute("/app/nfl/games/nfl-buf-kc", opts)).toEqual({
      kind: "ok",
      pathname: "/app/nfl/games/nfl-buf-kc",
    });
    expect(resolveClubRoute("/app/nba/games/nba-2026-11-15-ind-phi", opts)).toEqual({
      kind: "ok",
      pathname: "/app/nba/games/nba-2026-11-15-ind-phi",
    });
    expect(resolveClubRoute("/app/u/sofia_nfl", opts)).toEqual({
      kind: "ok",
      pathname: "/app/u/sofia_nfl",
    });
    expect(resolveClubRoute("/app/nfl/teams/kansas-city-chiefs", opts)).toEqual({
      kind: "ok",
      pathname: "/app/nfl/teams/kansas-city-chiefs",
    });
    expect(resolveClubRoute("/app/liga-mx/teams/monterrey?tab=partidos", opts)).toEqual({
      kind: "ok",
      pathname: "/app/liga-mx/teams/monterrey",
    });
  });

  it("marca 404 para rutas fantasma, ligas inexistentes, partidos o equipos faltantes", () => {
    expect(resolveClubRoute("/app/ruta-fantasma", opts).kind).toBe("not_found");
    expect(resolveClubRoute("/app/explore", opts).kind).toBe("not_found");
    expect(resolveClubRoute("/app/mlb", opts).kind).toBe("not_found");
    expect(resolveClubRoute("/app/nfl/games/inexistente", opts).kind).toBe("not_found");
    expect(resolveClubRoute("/app/nfl/teams/inexistente", opts).kind).toBe("not_found");
    expect(resolveClubRoute("/app/mlb/teams/dodgers", opts).kind).toBe("not_found");
    expect(resolveClubRoute("/app/nfl/otra/cosa", opts).kind).toBe("not_found");
  });
});
