import { describe, expect, it } from "vitest";
import { resolveClubRoute } from "../src/server/club-route-guard";

const opts = {
  isLeague: (seg: string) => seg === "nfl" || seg === "liga-mx" || seg === "premier-league",
  gameExists: (league: string, id: string) => league === "nfl" && id === "nfl-buf-kc",
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
    expect(resolveClubRoute("/app/nfl/games/nfl-buf-kc", opts)).toEqual({
      kind: "ok",
      pathname: "/app/nfl/games/nfl-buf-kc",
    });
    expect(resolveClubRoute("/app/u/sofia_nfl", opts)).toEqual({
      kind: "ok",
      pathname: "/app/u/sofia_nfl",
    });
  });

  it("marca 404 para rutas fantasma, ligas inexistentes o partidos faltantes", () => {
    expect(resolveClubRoute("/app/ruta-fantasma", opts).kind).toBe("not_found");
    expect(resolveClubRoute("/app/explore", opts).kind).toBe("not_found");
    expect(resolveClubRoute("/app/nba", opts).kind).toBe("not_found");
    expect(resolveClubRoute("/app/nfl/games/inexistente", opts).kind).toBe("not_found");
    expect(resolveClubRoute("/app/nfl/otra/cosa", opts).kind).toBe("not_found");
  });
});
