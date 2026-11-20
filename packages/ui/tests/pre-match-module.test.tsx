import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { asLeagueId, asMarketKey, type MatchAnalysis } from "@pitchlab/contracts";
import { MatchStudioClubView } from "../src/platform/club/CoreMatchViews";
import { PreMatchModule } from "../src/platform/club/match/PreMatchModule";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import { PlatformProvider } from "../src/platform/platform-provider";
import type { FrozenMainPickSnapshot, PlatformGame } from "../src/platform/types";

const row = (market: string, selection: string, label: string, p: number, line?: number) => ({
  market: asMarketKey(market),
  selection,
  label,
  ...(line !== undefined ? { line } : {}),
  p,
  fairOdds: 1 / p,
});

const MATCH_FIXTURE: MatchAnalysis = {
  id: "test-prematch-qro-mty",
  league: asLeagueId("liga-mx"),
  leagueLabel: "Liga MX",
  sport: "football",
  round: "Jornada 16",
  day: "2030-11-14",
  dayLabel: "sábado, 14 de noviembre",
  kickoffUtc: "2030-11-15T01:00:00Z", // 19:00 CDMX -> congela a las 18:00 CDMX
  kickoffLocal: "19:00",
  venue: "Estadio Corregidora",
  status: "NS",
  home: {
    slug: "queretaro",
    name: "Querétaro",
    shortName: "Querétaro",
    code: "QRO",
    record: "15 PJ",
  },
  away: {
    slug: "monterrey",
    name: "Monterrey",
    shortName: "Monterrey",
    code: "MTY",
    record: "15 PJ",
  },
  projection: { home: 1.5, away: 1.4, total: 2.9 },
  x12: [0.4, 0.26, 0.34],
  marketGroups: [
    {
      group: "Resultado",
      rows: [
        row("h2h", "home", "Querétaro gana", 0.4),
        row("h2h", "draw", "Empate", 0.26),
        row("h2h", "away", "Monterrey gana", 0.34),
      ],
    },
    {
      group: "Doble oportunidad",
      rows: [row("double_chance", "1x", "Querétaro o empate", 0.66)],
    },
  ],
  outcomes: [
    { key: "home", label: "Querétaro gana", probability: 0.4 },
    { key: "draw", label: "Empate", probability: 0.26 },
    { key: "away", label: "Monterrey gana", probability: 0.34 },
  ],
  factors: [],
  trace: [],
  headToHead: [],
  restDays: { home: 7, away: 4 },
};

const DATASET = buildPlatformDataset([
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "Apertura",
    roundLabel: "Jornada 16",
    generatedAt: "2030-11-14T16:00:00Z",
    games: [MATCH_FIXTURE],
    standings: [],
  },
]);

const BASE_GAME: PlatformGame = DATASET.games[0]!;

describe("PreMatchModule («Antes del partido»): estados de componente", () => {
  it("estado por congelar + sin bajas + alineación apagada + aviso inactivo", () => {
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <PreMatchModule
          game={BASE_GAME}
          now={new Date("2030-11-14T22:00:00Z")}
          timeZone="America/Mexico_City"
        />
      </PlatformProvider>,
    );

    expect(html).toContain("Antes del partido");
    expect(html).toContain("Se congela a las 18:00");
    expect(html).toContain('data-freeze-state="before_freeze"');
    expect(html).toContain("Sin bajas reportadas en nuestras fuentes");
    expect(html).toContain('data-lineup-slot="off"');
    expect(html).toContain("Alineación confirmada");
    expect(html).toContain("Apagado");
    expect(html).toContain("Avísame 60 min antes");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("La comunidad vota");

    // Prohibido mostrar stake, Kelly, EV o alineaciones probables inventadas
    expect(html).not.toMatch(/\b(Kelly|stake|EV|probable|probables\s*XI)\b/i);
  });

  it("estado con bajas reportadas + pick congelado inmutable + aviso activo en campana", () => {
    const frozenSnapshot: FrozenMainPickSnapshot = {
      gameId: BASE_GAME.id,
      pickId: "frozen-pick-original",
      label: "Querétaro o empate",
      categoryLabel: "Doble oportunidad",
      marketGroup: "Doble oportunidad",
      selectionKey: "1x",
      p: 0.66,
      fairDecimal: 1.52,
      fairAmerican: -192,
      kickoffUtc: "2030-11-15T01:00:00.000Z",
      freezeAtUtc: "2030-11-15T00:00:00.000Z",
    };

    // Aunque el partido traiga un pick recalculado distinto, el módulo muestra el congelado:
    const recalculatedGameWithAbsences: PlatformGame = {
      ...BASE_GAME,
      picks: BASE_GAME.picks.map((p, idx) =>
        idx === 0
          ? {
              ...p,
              label: "Monterrey gana (recalculado)",
              p: 0.51,
              fairDecimal: 1.96,
              fairAmerican: -104,
            }
          : p,
      ),
      preGame: {
        ...BASE_GAME.preGame,
        absences: [
          {
            teamSide: "home",
            player: "2 lesionados · Querétaro",
            role: "Reporte de disponibilidad",
            status: "Baja",
            impactNote: "Ausencias equivalentes al 12.5 % del valor de la plantilla.",
          },
          {
            teamSide: "away",
            player: "1 lesionado · Monterrey",
            role: "Reporte de disponibilidad",
            status: "Duda",
            impactNote: "Impacto incluido en la probabilidad del motor.",
          },
        ],
      },
    };

    const ds = { ...DATASET, games: [recalculatedGameWithAbsences] };
    const html = renderToStaticMarkup(
      <PlatformProvider
        dataset={ds}
        initialRole="member"
        initialWatchlistGameIds={[BASE_GAME.id]}
      >
        <PreMatchModule
          game={recalculatedGameWithAbsences}
          detail={{
            markets: BASE_GAME.markets,
            headToHead: [],
            factors: [],
            frozenMainPick: frozenSnapshot,
          }}
          now={new Date("2030-11-15T00:30:00Z")}
          timeZone="America/Mexico_City"
        />
      </PlatformProvider>,
    );

    expect(html).toContain("Congelado a las 18:00");
    expect(html).toContain('data-freeze-state="frozen"');
    expect(html).toContain("Querétaro o empate");
    expect(html).toContain("66.0 %");
    expect(html).not.toContain("Monterrey gana (recalculado)");

    expect(html).toContain("2 lesionados · Querétaro");
    expect(html).toContain("12.5 % del valor de la plantilla");
    expect(html).toContain("1 lesionado · Monterrey");
    expect(html).not.toContain("Sin bajas reportadas en nuestras fuentes");

    // Campana activa y ranura de alineación apagada:
    expect(html).toContain('data-pre-match-bell=""');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Aviso activo en tu campana");
    expect(html).toContain('data-lineup-slot="off"');
  });

  it("integra MatchCommunityPoll una sola vez dentro de la ficha y oculta el módulo en partidos FT", () => {
    const preGameStudioHtml = renderToStaticMarkup(
      <PlatformProvider dataset={DATASET} initialRole="member">
        <MatchStudioClubView
          leagueId={asLeagueId("liga-mx")}
          gameId={BASE_GAME.id}
        />
      </PlatformProvider>,
    );

    const pollOccurrences = preGameStudioHtml.match(/data-community-poll=""/g) ?? [];
    expect(pollOccurrences).toHaveLength(1);
    expect(preGameStudioHtml).toContain('data-pre-match-module=""');

    const finishedGame: PlatformGame = {
      ...BASE_GAME,
      status: "FT",
      score: { home: 2, away: 1 },
    };
    const finishedStudioHtml = renderToStaticMarkup(
      <PlatformProvider dataset={{ ...DATASET, games: [finishedGame] }} initialRole="member">
        <MatchStudioClubView
          leagueId={asLeagueId("liga-mx")}
          gameId={finishedGame.id}
        />
      </PlatformProvider>,
    );
    expect(finishedStudioHtml).not.toContain('data-pre-match-module=""');
  });

  it("estado partido ya iniciado: deshabilita el aviso de 60 min, cierra la votación y mantiene el sello congelado", () => {
    const liveGame: PlatformGame = {
      ...BASE_GAME,
      status: "LIVE",
    };
    const html = renderToStaticMarkup(
      <PlatformProvider dataset={{ ...DATASET, games: [liveGame] }} initialRole="member">
        <PreMatchModule
          game={liveGame}
          now={new Date("2030-11-15T01:12:00Z")}
          timeZone="America/Mexico_City"
        />
      </PlatformProvider>,
    );

    expect(html).toContain('data-freeze-state="match_started"');
    expect(html).toContain("Congelado a las 18:00");
    expect(html).toContain("El partido ya comenzó");
    expect(html).toContain("Votación cerrada: el partido ya empezó.");
    expect(html).toContain('data-lineup-slot="off"');
  });

  it("respeta Cero-Fuga en vista visitante sin revelar bajas ni pick bloqueado", () => {
    const gameWithSecretAbsence: PlatformGame = {
      ...BASE_GAME,
      picks: BASE_GAME.picks.map((p) => ({
        ...p,
        isDailyOpenPromo: false,
        isRedacted: true,
        label: "Pick protegido",
      })),
      preGame: {
        ...BASE_GAME.preGame,
        isRedacted: true,
        absences: [
          {
            teamSide: "home",
            player: "2 lesionados · Querétaro",
            role: "Reporte",
            status: "Baja",
            impactNote: "Impacto reservado.",
          },
        ],
      },
    };
    const html = renderToStaticMarkup(
      <PlatformProvider
        dataset={{ ...DATASET, games: [gameWithSecretAbsence] }}
        initialRole="visitor"
      >
        <PreMatchModule
          game={gameWithSecretAbsence}
          now={new Date("2030-11-14T22:00:00Z")}
          timeZone="America/Mexico_City"
        />
      </PlatformProvider>,
    );

    expect(html).toContain("Activar Pase PitchLab Ultra");
    expect(html).not.toContain("2 lesionados · Querétaro");
    expect(html).toContain('data-lineup-slot="off"');
  });

  it("muestra Once estimado cuando probableLineups viene poblado y detalla lesión + fecha de regreso", () => {
    const starterSet = (prefix: string) =>
      Array.from({ length: 11 }, (_, idx) => ({
        name: `${prefix} Titular ${idx + 1}`,
        number: idx + 1,
        position: idx === 0 ? "GK" : "MF",
      }));
    const gameWithProbable: PlatformGame = {
      ...BASE_GAME,
      preGame: {
        ...BASE_GAME.preGame,
        absences: [
          {
            teamSide: "home",
            player: "P. Barrera",
            role: "EXT · Querétaro",
            status: "Baja",
            injuryType: "Lesión muscular",
            returnDate: "2030-11-28",
            impactNote: "Descartado para la jornada.",
          },
        ],
        probableLineups: {
          sourceLabel: "Fuente prepartido",
          verifiedAtUtc: "2030-11-14T21:00:00Z",
          confidence: 85,
          homeFormation: "4-3-3",
          awayFormation: "4-2-3-1",
          homeStarters: starterSet("Local"),
          awayStarters: starterSet("Visita"),
        },
      },
    };

    const html = renderToStaticMarkup(
      <PlatformProvider dataset={{ ...DATASET, games: [gameWithProbable] }} initialRole="member">
        <PreMatchModule
          game={gameWithProbable}
          now={new Date("2030-11-14T22:00:00Z")}
          timeZone="America/Mexico_City"
        />
      </PlatformProvider>,
    );

    expect(html).toContain("Lesión muscular");
    expect(html).toContain("Regreso est. 2030-11-28");
    expect(html).toContain("Once estimado · Confianza 85 %");
    expect(html).toContain('data-lineup-slot="estimated"');
    expect(html).toContain("4-3-3");
    expect(html).toContain("Local Titular 1");
  });
});
