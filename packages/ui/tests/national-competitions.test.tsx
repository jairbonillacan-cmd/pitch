import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  LeagueSnapshotSchema,
  NATIONAL_COMPETITION_IDS,
  asLeagueId,
  isNationalCompetition,
  snapshotToMatchAnalyses,
  sportForLeague,
} from "@pitchlab/contracts";
import {
  LeagueHubClubView,
  PlatformProvider,
  buildPlatformDataset,
  type RawLeagueInput,
} from "../src/index";
import { ALL, filterGames, matchesSportFilter } from "../src/platform/club/home/home-model";

const FORBIDDEN_FD16_RE =
  /\b(dixon-coles|poisson|lightgbm|platt|pitágoras|log5|nflverse|openfootball|api-football|polymarket|kalshi|understat|espn)\b/i;

function loadNationalSnapshotInput(leagueKey: (typeof NATIONAL_COMPETITION_IDS)[number]): RawLeagueInput {
  const file = path.resolve(
    import.meta.dirname,
    "../../../data/snapshots",
    leagueKey,
    "latest.json",
  );
  const parsed = LeagueSnapshotSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  const { matches } = snapshotToMatchAnalyses(parsed);
  return {
    league: parsed.league,
    leagueLabel:
      leagueKey === "concacaf-nations"
        ? "Concacaf Nations League"
        : leagueKey === "uefa-nations"
          ? "UEFA Nations League"
          : leagueKey === "copa-del-mundo"
            ? "Copa del Mundo FIFA"
            : leagueKey,
    leagueLogoUrl: parsed.logoUrl,
    sport: sportForLeague(parsed.league),
    season: parsed.seasonLabel,
    roundLabel: parsed.periodLabel,
    generatedAt: parsed.updatedAt,
    games: matches,
    standings: parsed.standings,
  };
}

describe("Selecciones y competencias internacionales", () => {
  const dataset = buildPlatformDataset([
    loadNationalSnapshotInput("concacaf-nations"),
    loadNationalSnapshotInput("uefa-nations"),
    loadNationalSnapshotInput("amistosos"),
    loadNationalSnapshotInput("copa-del-mundo"),
  ]);

  it("construye snapshots de selecciones sin fugas FD-16 y con emblemas locales", () => {
    expect(dataset.leagues).toHaveLength(4);
    for (const lg of NATIONAL_COMPETITION_IDS) {
      expect(isNationalCompetition(lg)).toBe(true);
    }
    expect(isNationalCompetition("liga-mx")).toBe(false);

    const mxGame = dataset.games.find(
      (g) =>
        g.league === "concacaf-nations" &&
        (g.home.slug === "mexico" || g.away.slug === "mexico"),
    );
    expect(mxGame).toBeDefined();
    expect(mxGame!.picks.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(mxGame)).not.toMatch(FORBIDDEN_FD16_RE);
  });

  it("filtra selecciones separadas de clubes en el modelo de Inicio", () => {
    const clubGame = {
      ...dataset.games[0]!,
      id: "club-mock",
      league: asLeagueId("liga-mx"),
      sport: "football" as const,
    };
    const nationalGame = dataset.games[0]!;
    expect(matchesSportFilter(nationalGame, "selecciones")).toBe(true);
    expect(matchesSportFilter(nationalGame, "futbol")).toBe(true);
    expect(matchesSportFilter(clubGame, "selecciones")).toBe(false);
    expect(filterGames([clubGame, nationalGame], "selecciones", ALL).map((g) => g.id)).toEqual([
      nationalGame.id,
    ]);
  });

  it("renderiza el Hub de Concacaf Nations League con pestaña Selecciones", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <LeagueHubClubView leagueId={"concacaf-nations" as never} />
      </PlatformProvider>,
    );
    expect(html).toContain("Concacaf Nations League");
    expect(html).toContain("Selecciones");
    expect(html).not.toMatch(FORBIDDEN_FD16_RE);
  });
});
