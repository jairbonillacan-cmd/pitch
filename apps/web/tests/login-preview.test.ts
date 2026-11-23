import { describe, expect, it } from "vitest";
import { asLeagueId } from "@pitchlab/contracts";
import { buildHeroLeagueCards } from "@pitchlab/ui/public-sections";
import type { PlatformGame } from "@pitchlab/ui/types";
import {
  loadLoginPreviewData,
  selectHeroMainCards,
} from "../src/server/public-site-data";

function buildHeroTestGame(overrides: {
  id: string;
  homeSlug: string;
  homeName: string;
  awaySlug: string;
  awayName: string;
  x12: [number, number, number];
  projection: { home: number; away: number; total: number };
}): PlatformGame {
  return {
    id: overrides.id,
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    round: "Jornada 17",
    dayId: "2026-11-23",
    dayLabel: "lunes, 23 de noviembre",
    kickoffUtc: "2026-11-24T01:00:00Z",
    kickoffLocal: "19:00",
    venue: "Estadio Azteca",
    status: "NS",
    home: {
      slug: overrides.homeSlug,
      name: overrides.homeName,
      shortName: overrides.homeName,
      code: overrides.homeSlug.slice(0, 3).toUpperCase(),
      record: "9G-4E-3P",
    },
    away: {
      slug: overrides.awaySlug,
      name: overrides.awayName,
      shortName: overrides.awayName,
      code: overrides.awaySlug.slice(0, 3).toUpperCase(),
      record: "6G-5E-5P",
    },
    hasForecast: true,
    x12: overrides.x12,
    projection: overrides.projection,
    confidenceScore: 78,
    confidenceLevel: "alta",
    picks: [],
    preGame: {
      cortexSynthesis: "",
      tacticalKeys: [],
      lineupStatusLabel: "Probables",
      lineupsConfirmed60m: false,
      absences: [],
      moneyFlow: null,
      isRedacted: false,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "hoy",
    spacetime: null,
  };
}

describe("loadLoginPreviewData (LOGIN-2)", () => {
  it("carga partido principal y segundo partido de otra liga con momio justo en americano desde snapshots reales", async () => {
    const { primaryCard, secondaryCard } = await loadLoginPreviewData();

    expect(primaryCard).not.toBeNull();
    expect(primaryCard?.mostProbable.p).toBeGreaterThan(0);
    expect(primaryCard?.mostProbable.p).toBeLessThan(1);
    expect(primaryCard?.mostProbable.fairAmerican).toMatch(/^[+\u2212]\d+$/);

    expect(secondaryCard).not.toBeNull();
    expect(secondaryCard?.league).not.toBe(primaryCard?.league);
    expect(secondaryCard?.mostProbable.fairAmerican).toMatch(/^[+\u2212]\d+$/);
  });

  it("selectHeroMainCards devuelve arreglo vacío cuando no existen tarjetas reales", () => {
    expect(selectHeroMainCards([])).toEqual([]);
  });

  it("buildHeroLeagueCards omite partidos redactados con x12 en cero y elige el siguiente con masa de probabilidad positiva", () => {
    const redactedGame = buildHeroTestGame({
      id: "mx-redacted-1",
      homeSlug: "queretaro",
      homeName: "Querétaro",
      awaySlug: "monterrey",
      awayName: "Monterrey",
      x12: [0, 0, 0],
      projection: { home: 0, away: 0, total: 0 },
    });
    const openGame = buildHeroTestGame({
      id: "mx-open-2",
      homeSlug: "america",
      homeName: "América",
      awaySlug: "tigres",
      awayName: "Tigres",
      x12: [0.54, 0.26, 0.2],
      projection: { home: 1.7, away: 1.0, total: 2.7 },
    });

    expect(buildHeroLeagueCards([redactedGame])).toEqual([]);

    const cards = buildHeroLeagueCards([redactedGame, openGame]);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.home.slug).toBe("america");
    expect(cards[0]?.away.slug).toBe("tigres");
    expect(cards[0]?.mostProbable.p).toBeCloseTo(0.54, 4);
    expect(cards[0]?.mostProbable.fairAmerican).toBe("\u2212117");
  });
});
