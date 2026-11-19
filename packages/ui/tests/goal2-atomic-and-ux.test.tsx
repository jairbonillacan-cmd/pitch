import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FormSquares } from "../src/platform/components/FormSquares";
import { SettingsGroup, SettingsRow } from "../src/platform/components/SettingsGroup";
import { getTrendingMatches, ALL } from "../src/platform/club/home/home-model";
import type { PlatformGame } from "../src/platform/types";

function makeGame(partial: Partial<PlatformGame> & { id: string }): PlatformGame {
  return {
    league: "liga-mx" as PlatformGame["league"],
    leagueLabel: "Liga MX",
    sport: "football",
    round: "Jornada 17",
    dayId: "2026-11-20",
    dayLabel: "viernes",
    kickoffUtc: "2026-11-20T23:00:00Z",
    kickoffLocal: "17:00",
    venue: "Estadio",
    status: "NS",
    home: { slug: "america", name: "América", shortName: "América", code: "AME", record: "" },
    away: { slug: "chivas", name: "Chivas", shortName: "Chivas", code: "GDL", record: "" },
    x12: [0.5, 0.25, 0.25],
    projection: { home: 1.8, away: 1.1, total: 2.9 },
    confidenceScore: 76,
    confidenceLevel: "alta",
    picks: [],
    preGame: {} as PlatformGame["preGame"],
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "",
    spacetime: null,
    ...partial,
  } as PlatformGame;
}

describe("ADR-044 · Componentes atómicos v2 y motor de Tendencias", () => {
  it("FormSquares renderiza cuadros individuales limpios y normaliza W/D/L a G/E/P", () => {
    const html = renderToStaticMarkup(<FormSquares form="WWDLW" size="sm" />);
    expect(html).toContain('data-form-squares=""');
    expect(html).toContain("pl-form-sq-row--sm");
    expect(html.match(/class="pl-form-sq is-/g)).toHaveLength(5);
    expect(html).toContain(">G<");
    expect(html).toContain(">E<");
    expect(html).toContain(">P<");
    expect(html).not.toContain("pl-st-form-pill");
  });

  it("SettingsGroup y SettingsRow renderizan título, filas interactivas y tonos", () => {
    const html = renderToStaticMarkup(
      <SettingsGroup title="Soporte">
        <SettingsRow icon="sparkles" title="Feedback e ideas" subtitle="Envíanos ideas" onClick={() => {}} />
        <SettingsRow icon="trash" title="Eliminar cuenta" tone="danger" showChevron={false} onClick={() => {}} />
      </SettingsGroup>,
    );
    expect(html).toContain("Soporte");
    expect(html).toContain("Feedback e ideas");
    expect(html).toContain("Eliminar cuenta");
    expect(html).toContain("is-danger");
  });

  it("getTrendingMatches mezcla deportes cuando está en Todos y prioriza partidos en vivo y próximos relevantes", () => {
    const today = "2026-11-19";
    const games = [
      makeGame({
        id: "ucl-live",
        league: "champions-league" as PlatformGame["league"],
        leagueLabel: "UEFA Champions League",
        dayId: "2026-11-19",
        status: "LIVE",
        kickoffUtc: "2026-11-19T20:00:00Z",
      }),
      makeGame({
        id: "nba-soon",
        league: "nba" as PlatformGame["league"],
        leagueLabel: "NBA",
        sport: "basketball",
        dayId: "2026-11-20",
        kickoffUtc: "2026-11-20T01:00:00Z",
      }),
      makeGame({
        id: "nfl-soon",
        league: "nfl" as PlatformGame["league"],
        leagueLabel: "NFL",
        sport: "american-football",
        dayId: "2026-11-20",
        kickoffUtc: "2026-11-20T02:00:00Z",
      }),
      makeGame({
        id: "far-away",
        league: "copa-america" as PlatformGame["league"],
        leagueLabel: "Copa América",
        dayId: "2027-06-20",
        kickoffUtc: "2027-06-20T20:00:00Z",
      }),
    ];

    const allTrending = getTrendingMatches({ games, sport: ALL, league: ALL, today, maxItems: 4 });
    expect(allTrending[0]?.id).toBe("ucl-live");
    expect(allTrending.some((g) => g.id === "nba-soon")).toBe(true);
    expect(allTrending.some((g) => g.id === "nfl-soon")).toBe(true);
    expect(allTrending.some((g) => g.id === "far-away")).toBe(false);
  });
});
