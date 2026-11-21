import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  asLeagueId,
  asMarketKey,
  type LiveIncident,
  type MatchAnalysis,
} from "@pitchlab/contracts";
import {
  AtomicAveragePositionsPitch,
  AtomicFormStrip,
  AtomicLineupPitch,
  AtomicMatchHeaderBar,
  AtomicOddsChip,
  AtomicShotmapPitch,
  AtomicStatComparisonBar,
  LIVE_ASIAN_STATE_LABEL_ES,
  LivePickProgressBar,
  PropBetLabChart,
  classifyPropPointHit,
  computeLiveProgressMetrics,
  computePropHitRates,
  computeShotRadius,
  computeStatBarWidths,
  normalizeShotBucket,
  parseAtomicForm,
  parseLineupFormationRows,
  resolveAveragePositionCollisions,
  resolveOddsMovement,
  type LiveAsianPickState,
  type PropBetLabPoint,
} from "../src/platform/atomic/index";
import {
  BetBuilderDrawer,
  BetBuilderQuickButton,
  BookmakerComparePill,
  EvidenceWindowPills,
  NonLinearOddsSlider,
  SavedViewsBar,
  classifyOddsMovement,
  computeExpectedValuePct,
  extractEvidenceWindows,
  formatOddsStepBound,
} from "../src/platform/club/picks/index";
import { buildPlatformDataset } from "../src/platform/match-picks-engine";
import { PlatformProvider } from "../src/platform/platform-provider";
import type { SavedScreenerView } from "../src/platform/screener-views";
import type { BookQuoteItem } from "../src/platform/types";

const FORBIDDEN_RENDER_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["Conf.", /\bconf\./i],
  ["Confianza", /\bconfianza\b/i],
  ["Datos completos", /datos\s+completos/i],
  ["Datos parciales", /datos\s+parciales/i],
  ["bzzoiro", /bzzoiro/i],
  ["sofascore", /sofascore/i],
  ["espncdn", /espncdn/i],
  ["api-football", /api-football/i],
  ["provider_id / external_id", /\b(?:provider_?id|external_?id|bzzoiro_?id|espn_?id)\b/i],
  ["api_key", /\bapi_?key\b/i],
  ["URL externa de proveedor", /https?:\/\/(?!www\.w3\.org\/2000\/svg)/i],
];

function assertCleanEditorialHtml(html: string, componentName: string): void {
  expect(html.length, `${componentName} debe renderizar HTML no vacío`).toBeGreaterThan(0);
  for (const [label, pattern] of FORBIDDEN_RENDER_PATTERNS) {
    expect(html, `${componentName} no debe contener "${label}"`).not.toMatch(pattern);
  }
}

function buildSampleDataset() {
  const match: MatchAnalysis = {
    id: "mx-atomic-ame-chi",
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    round: "Jornada 15",
    day: "2030-11-14",
    dayLabel: "jueves, 14 de noviembre",
    kickoffUtc: "2030-11-14T23:00:00Z",
    kickoffLocal: "17:00",
    venue: "Estadio Azteca",
    status: "NS",
    home: {
      slug: "america",
      name: "América",
      shortName: "América",
      code: "AME",
      record: "12G-4E-4P",
    },
    away: {
      slug: "chivas",
      name: "Guadalajara",
      shortName: "Chivas",
      code: "GDL",
      record: "7G-6E-7P",
    },
    x12: [0.56, 0.25, 0.19],
    projection: { home: 1.85, away: 1.05, total: 2.9 },
    outcomes: [
      { key: "home", label: "América gana", probability: 0.56 },
      { key: "draw", label: "Empate", probability: 0.25 },
      { key: "away", label: "Chivas gana", probability: 0.19 },
    ],
    marketGroups: [
      {
        group: "Resultado",
        rows: [
          { market: asMarketKey("h2h"), selection: "home", label: "América gana", p: 0.56, fairOdds: 1.79 },
          { market: asMarketKey("h2h"), selection: "draw", label: "Empate", p: 0.25, fairOdds: 4.0 },
          { market: asMarketKey("h2h"), selection: "away", label: "Chivas gana", p: 0.19, fairOdds: 5.26 },
        ],
      },
      {
        group: "Totales",
        rows: [
          { market: asMarketKey("totals"), selection: "over_2.5", label: "Más de 2.5 goles", line: 2.5, p: 0.58, fairOdds: 1.72 },
          { market: asMarketKey("totals"), selection: "under_2.5", label: "Menos de 2.5 goles", line: 2.5, p: 0.42, fairOdds: 2.38 },
        ],
      },
      {
        group: "Ambos anotan",
        rows: [
          { market: asMarketKey("btts"), selection: "yes", label: "Ambos anotan: Sí", p: 0.54, fairOdds: 1.85 },
          { market: asMarketKey("btts"), selection: "no", label: "Ambos anotan: No", p: 0.46, fairOdds: 2.17 },
        ],
      },
    ],
    factors: [
      {
        label: "Forma local",
        detail: "",
        impact: "",
        value: "G-G-E-G-P · 3-1",
        sub: "9 goles a favor",
      },
      {
        label: "Forma visitante",
        detail: "",
        impact: "",
        value: "P-E-G-P-G · 2-2",
        sub: "5 goles a favor",
      },
    ],
    headToHead: [
      { date: "2026-03-10", home: "América", away: "Chivas", homeGoals: 2, awayGoals: 1 },
      { date: "2025-10-18", home: "Chivas", away: "América", homeGoals: 0, awayGoals: 2 },
      { date: "2025-04-06", home: "América", away: "Chivas", homeGoals: 1, awayGoals: 1 },
    ],
    trace: [],
  };

  return buildPlatformDataset([
    {
      league: asLeagueId("liga-mx"),
      leagueLabel: "Liga MX",
      sport: "football",
      season: "Apertura",
      roundLabel: "Jornada 15",
      generatedAt: "2030-11-13T18:00:00Z",
      games: [match],
      standings: [],
    },
  ]);
}

describe("Componentes atómicos editoriales (`packages/ui/src/platform/atomic/*`)", () => {
  it("renderiza AtomicShotmapPitch en vista completa, media cancha, onSelectShot y estado vacío", () => {
    expect(normalizeShotBucket("save")).toBe("on_target");
    expect(normalizeShotBucket("block")).toBe("blocked");
    expect(computeShotRadius(0.5)).toBeGreaterThan(computeShotRadius(0.05));

    const shots = [
      { id: "s1", minute: 14, side: "home" as const, outcome: "goal" as const, xg: 0.42, x: 91, y: 52, player: "Henry Martín" },
      { id: "s2", minute: 38, addedTime: 2, side: "away" as const, outcome: "saved" as const, xg: 0.21, x: 84, y: 40, player: "R. Alvarado" },
      { id: "s3", minute: 61, side: "home" as const, outcome: "blocked" as const, xg: 0.09, x: 78, y: 63, player: "Á. Fidalgo" },
      { id: "s4", minute: 77, side: "away" as const, outcome: "post" as const, xg: 0.31, x: 88, y: 47 },
    ];

    const fullHtml = renderToStaticMarkup(
      <AtomicShotmapPitch
        shots={shots}
        homeLabel="América"
        awayLabel="Chivas"
        onSelectShot={() => {}}
      />,
    );
    expect(fullHtml).toContain('data-atomic-shotmap=""');
    expect(fullHtml).toContain('data-pitch-view="full"');
    expect(fullHtml).toContain('viewBox="0 0 360 224"');
    expect(fullHtml).toContain('role="button"');
    expect(fullHtml).toMatch(/tabindex="0"/i);
    expect(fullHtml).toContain("0.51");
    expect(fullHtml).toContain("0.52");
    expect(fullHtml).toContain("Ver tiros como tabla (4)");
    expect(fullHtml).toContain("Henry Martín");
    expect(fullHtml).toContain("Al poste");
    assertCleanEditorialHtml(fullHtml, "AtomicShotmapPitch(full)");

    const halfHtml = renderToStaticMarkup(
      <AtomicShotmapPitch shots={shots} homeLabel="América" awayLabel="Chivas" view="half" />,
    );
    expect(halfHtml).toContain('data-pitch-view="half"');
    expect(halfHtml).toContain('viewBox="0 0 320 216"');
    assertCleanEditorialHtml(halfHtml, "AtomicShotmapPitch(half)");

    expect(
      renderToStaticMarkup(<AtomicShotmapPitch shots={[]} homeLabel="América" awayLabel="Chivas" />),
    ).toBe("");
    const emptyHtml = renderToStaticMarkup(
      <AtomicShotmapPitch shots={[]} homeLabel="América" awayLabel="Chivas" showEmpty />,
    );
    expect(emptyHtml).toContain('data-atomic-shotmap="empty"');
    assertCleanEditorialHtml(emptyHtml, "AtomicShotmapPitch(empty)");
  });

  it("renderiza AtomicAveragePositionsPitch con colisiones deterministas, playerHref y onSelectPlayer", () => {
    const collided = resolveAveragePositionCollisions([
      { id: "p1", name: "Álvaro Fidalgo", number: 8, side: "home", x: 55, y: 50, touches: 80 },
      { id: "p2", name: "Jonathan dos Santos", number: 6, side: "home", x: 55, y: 50, touches: 60 },
    ]);
    expect(collided).toHaveLength(2);
    expect(
      collided[0]!.leftPct !== collided[1]!.leftPct || collided[0]!.topPct !== collided[1]!.topPct,
    ).toBe(true);
    for (const node of collided) {
      expect(node.leftPct).toBeGreaterThanOrEqual(10);
      expect(node.leftPct).toBeLessThanOrEqual(90);
      expect(node.topPct).toBeGreaterThanOrEqual(10);
      expect(node.topPct).toBeLessThanOrEqual(90);
    }

    const html = renderToStaticMarkup(
      <AtomicAveragePositionsPitch
        players={[
          { id: "h1", name: "Luis Malagón", number: 1, side: "home", x: 10, y: 50, touches: 34, position: "GK", playerHref: "/app/jugador/luis-malagon" },
          { id: "h2", name: "Israel Reyes", number: 3, side: "home", x: 38, y: 62, touches: 58, position: "DEF" },
          { id: "h3", name: "Álvaro Fidalgo", number: 8, side: "home", x: 60, y: 48, touches: 82, position: "MID", playerHref: "/app/jugador/alvaro-fidalgo" },
          { id: "h4", name: "Henry Martín", number: 21, side: "home", x: 78, y: 51, touches: 41, position: "FWD" },
          { id: "a1", name: "Raúl Rangel", number: 1, side: "away", x: 12, y: 50, touches: 29, position: "GK" },
          { id: "a2", name: "Roberto Alvarado", number: 25, side: "away", x: 69, y: 74, touches: 64, position: "MID" },
        ]}
        homeLabel="América"
        awayLabel="Chivas"
        homeFormation="4-2-3-1"
        awayFormation="4-3-3"
        onSelectPlayer={() => {}}
      />,
    );
    expect(html).toContain('data-atomic-avgpos=""');
    expect(html).toContain('data-side="home"');
    expect(html).toContain("Posiciones medias");
    expect(html).toContain("4-2-3-1");
    expect(html).toContain("Bloque medio");
    expect(html).toContain("Fidalgo");
    expect(html).toContain('href="/app/jugador/alvaro-fidalgo"');
    expect(html).toContain("pl-atom-node-trigger");
    expect(html).toContain("Ver posiciones medias como tabla (4)");
    assertCleanEditorialHtml(html, "AtomicAveragePositionsPitch");
  });

  it("renderiza AtomicLineupPitch con XI confirmado/probable, playerHref, onSelectPlayer e incidencias", () => {
    expect(parseLineupFormationRows("4-2-3-1")).toEqual([1, 4, 2, 3, 1]);
    expect(parseLineupFormationRows("3-5-2")).toEqual([1, 3, 5, 2]);
    expect(parseLineupFormationRows("1-4-4-2")).toEqual([1, 4, 4, 2]);

    const incidents: LiveIncident[] = [
      {
        order: 1,
        kind: "yellow",
        side: "away",
        minute: 34,
        addedTime: null,
        player: "Alan Mozo",
        secondary: null,
        score: null,
        note: null,
      },
    ];

    const homeStarters = [
      { name: "Luis Malagón", number: 1, position: "GK", rating: 7.4 },
      { name: "Kevin Álvarez", number: 5, position: "DEF", rating: 7.1 },
      { name: "Israel Reyes", number: 3, position: "DEF", rating: 7.3 },
      { name: "Sebastián Cáceres", number: 4, position: "DEF", rating: 6.9 },
      { name: "Cristian Calderón", number: 18, position: "DEF", rating: 7.0 },
      { name: "Jonathan dos Santos", number: 6, position: "MID", rating: 7.5 },
      { name: "Álvaro Fidalgo", number: 8, position: "MID", rating: 8.2, events: ["goal" as const], playerHref: "/app/jugador/alvaro-fidalgo" },
      { name: "Alejandro Zendejas", number: 17, position: "MID", rating: 7.6 },
      { name: "Diego Valdés", number: 10, position: "MID", rating: 7.8 },
      { name: "Brian Rodríguez", number: 7, position: "MID", rating: 7.2 },
      { name: "Henry Martín", number: 21, position: "FWD", isCaptain: true, rating: 8.1, playerHref: "/app/jugador/henry-martin" },
    ];
    const awayStarters = [
      { name: "Raúl Rangel", number: 1, position: "GK", rating: 6.8 },
      { name: "Alan Mozo", number: 2, position: "DEF", rating: 6.7 },
      { name: "Gilberto Sepúlveda", number: 3, position: "DEF", rating: 6.5 },
      { name: "Jesús Orozco", number: 13, position: "DEF", rating: 6.9 },
      { name: "Mateo Chávez", number: 50, position: "DEF", rating: 6.4 },
      { name: "Erick Gutiérrez", number: 15, position: "MID", rating: 6.6 },
      { name: "Fernando Beltrán", number: 20, position: "MID", rating: 6.8 },
      { name: "Víctor Guzmán", number: 5, position: "MID", rating: 6.7 },
      { name: "Roberto Alvarado", number: 25, position: "FWD", rating: 7.1 },
      { name: "Ricardo Marín", number: 19, position: "FWD", rating: 6.3 },
      { name: "Cade Cowell", number: 16, position: "FWD", rating: 6.6 },
    ];

    const confirmedHtml = renderToStaticMarkup(
      <AtomicLineupPitch
        homeName="América"
        awayName="Chivas"
        homeFormation="4-2-3-1"
        awayFormation="4-3-3"
        homeStarters={homeStarters}
        awayStarters={awayStarters}
        status="confirmed"
        homeCoach="A. Jardine"
        awayCoach="Ó. García"
        incidents={incidents}
        onSelectPlayer={() => {}}
      />,
    );
    expect(confirmedHtml).toContain('data-atomic-lineup=""');
    expect(confirmedHtml).toContain('data-lineup-status="confirmed"');
    expect(confirmedHtml).toContain("XI confirmado");
    expect(confirmedHtml).toContain("4-2-3-1");
    expect(confirmedHtml).toContain("A. Jardine");
    expect(confirmedHtml).toContain("pl-atom-rating is-elite");
    expect(confirmedHtml).toContain("pl-sport-evt-ico--goal");
    expect(confirmedHtml).toContain("pl-sport-evt-ico--yellow");
    expect(confirmedHtml).toContain('href="/app/jugador/henry-martin"');
    expect(confirmedHtml).toContain("pl-atom-node-trigger");
    assertCleanEditorialHtml(confirmedHtml, "AtomicLineupPitch(confirmed)");

    const probableHtml = renderToStaticMarkup(
      <AtomicLineupPitch
        homeName="América"
        awayName="Chivas"
        homeStarters={homeStarters}
        awayStarters={awayStarters}
        status="probable"
      />,
    );
    expect(probableHtml).toContain('data-lineup-status="probable"');
    expect(probableHtml).toContain("XI probable");
    assertCleanEditorialHtml(probableHtml, "AtomicLineupPitch(probable)");
  });

  it("renderiza AtomicStatComparisonBar con valores negativos, lowerIsBetter y ranks ordinales rankA/rankB", () => {
    const negWidths = computeStatBarWidths(-0.54, -0.44, { signed: true });
    expect(negWidths.homePct).toBe(100);
    expect(negWidths.awayPct).toBe(81.5);
    expect(negWidths.homeNegative).toBe(true);
    expect(negWidths.awayNegative).toBe(true);
    expect(negWidths.lead).toBe("away");

    const mixedWidths = computeStatBarWidths(0.62, -0.31);
    expect(mixedWidths.homePct).toBe(100);
    expect(mixedWidths.awayPct).toBe(50);
    expect(mixedWidths.homeNegative).toBe(false);
    expect(mixedWidths.awayNegative).toBe(true);
    expect(mixedWidths.lead).toBe("home");

    const lowerWidths = computeStatBarWidths(0.78, 1.42, { lowerIsBetter: true });
    expect(lowerWidths.lead).toBe("home");

    const lowerRankHtml = renderToStaticMarkup(
      <AtomicStatComparisonBar
        label="Goles concedidos / partido"
        homeValue={0.78}
        awayValue={1.42}
        homeLabel="América"
        awayLabel="Chivas"
        digits={2}
        lowerIsBetter
        rankA={1}
        rankB={14}
        showTeamLabels
      />,
    );
    expect(lowerRankHtml).toContain('data-lower-is-better="true"');
    expect(lowerRankHtml).toContain('data-rank="1"');
    expect(lowerRankHtml).toContain('data-rank="14"');
    expect(lowerRankHtml).toContain("1.º");
    expect(lowerRankHtml).toContain("14.º");
    expect(lowerRankHtml).toContain("0.78");
    expect(lowerRankHtml).toContain("1.42");
    assertCleanEditorialHtml(lowerRankHtml, "AtomicStatComparisonBar(lowerIsBetter+ranks)");

    const negativeHtml = renderToStaticMarkup(
      <AtomicStatComparisonBar
        label="Goles evitados"
        homeValue={-0.54}
        awayValue={-0.44}
        homeLabel="América"
        awayLabel="Chivas"
        digits={2}
        signed
        showTeamLabels
      />,
    );
    expect(negativeHtml).toContain('data-atomic-stat=""');
    expect(negativeHtml).toContain("Goles evitados");
    expect(negativeHtml).toContain("-0.54");
    expect(negativeHtml).toContain("-0.44");
    expect(negativeHtml).toContain('data-negative="true"');
    expect(negativeHtml).toContain("inline-size:100%");
    expect(negativeHtml).toContain("inline-size:81.5%");
    assertCleanEditorialHtml(negativeHtml, "AtomicStatComparisonBar(negative)");

    const pctHtml = renderToStaticMarkup(
      <dl>
        <AtomicStatComparisonBar
          label="Posesión"
          homeValue={58}
          awayValue={42}
          pct
          asDefinitionItem
        />
      </dl>,
    );
    expect(pctHtml).toContain("<dt");
    expect(pctHtml).toContain("<dd");
    expect(pctHtml).toContain("58 %");
    expect(pctHtml).toContain("42 %");
    expect(pctHtml).not.toContain("data-negative");
    assertCleanEditorialHtml(pctHtml, "AtomicStatComparisonBar(pct)");
  });

  it("renderiza AtomicFormStrip en notación española G/E/P, US W/L y tooltips por celda", () => {
    const parsedWithTips = parseAtomicForm("G-E-P-G-G · 3-1", {
      notation: "es",
      tooltips: ["2-0 vs Tigres", "1-1 @ Rayados", "0-1 vs Cruz Azul", "3-0 vs Pumas", "2-1 vs Chivas"],
    });
    expect(parsedWithTips.map((e) => e.glyph)).toEqual(["G", "E", "P", "G", "G"]);
    expect(parsedWithTips[0]!.tooltip).toBe("2-0 vs Tigres");
    expect(parsedWithTips[4]!.tooltip).toBe("2-1 vs Chivas");

    const esHtml = renderToStaticMarkup(
      <AtomicFormStrip form="G-E-P-G-G · 3-1" sport="football" teamName="América" />,
    );
    expect(esHtml).toContain('data-atomic-form=""');
    expect(esHtml).toContain('role="img"');
    expect(esHtml).toContain("Forma de América (últimos 5): Ganó, Empató, Perdió, Ganó, Ganó");
    assertCleanEditorialHtml(esHtml, "AtomicFormStrip(es)");

    const tipsHtml = renderToStaticMarkup(
      <AtomicFormStrip
        form="G-E-P-G-G"
        sport="football"
        teamName="América"
        tooltips={["2-0 vs Tigres", "1-1 @ Rayados", "0-1 vs Cruz Azul", "3-0 vs Pumas", "2-1 vs Chivas"]}
      />,
    );
    expect(tipsHtml).toContain('data-tooltip="2-0 vs Tigres"');
    expect(tipsHtml).toContain('title="2-1 vs Chivas"');
    expect(tipsHtml).toContain("has-tooltip");
    assertCleanEditorialHtml(tipsHtml, "AtomicFormStrip(tooltips)");

    const usHtml = renderToStaticMarkup(
      <AtomicFormStrip form="WWLWL" sport="basketball" teamName="Lakers" />,
    );
    expect(usHtml).toContain("Forma de Lakers (últimos 5): Victoria, Victoria, Derrota, Victoria, Derrota");
    assertCleanEditorialHtml(usHtml, "AtomicFormStrip(us)");

    const emptyHtml = renderToStaticMarkup(<AtomicFormStrip form="" />);
    expect(emptyHtml).toContain('data-atomic-form="empty"');
    assertCleanEditorialHtml(emptyHtml, "AtomicFormStrip(empty)");
  });

  it("renderiza AtomicOddsChip en variantes chip y cell tabular (máx. 2 indicadores) anclado a Momio justo", () => {
    expect(resolveOddsMovement({ marketDecimal: 1.85, openingDecimal: 2.05 }).direction).toBe("steam");
    expect(resolveOddsMovement({ marketDecimal: 1.95, openingDecimal: 1.8 }).direction).toBe("drifting");

    const steamHtml = renderToStaticMarkup(
      <AtomicOddsChip
        fairDecimal={1.72}
        marketDecimal={1.85}
        openingDecimal={2.05}
        oddsFormat="decimal"
        label="América gana"
        valuePct={7.6}
        highlight
      />,
    );
    expect(steamHtml).toContain('data-atomic-odds=""');
    expect(steamHtml).toContain('data-variant="chip"');
    expect(steamHtml).toContain('data-movement="steam"');
    expect(steamHtml).toContain("Momio justo");
    expect(steamHtml).toContain("1.72");
    expect(steamHtml).toContain("Casa");
    expect(steamHtml).toContain("1.85");
    expect(steamHtml).toContain("Steam");
    expect(steamHtml).toContain("Valor +7.6 %");
    assertCleanEditorialHtml(steamHtml, "AtomicOddsChip(steam)");

    const cellHtml = renderToStaticMarkup(
      <AtomicOddsChip
        fairDecimal={1.72}
        marketDecimal={1.85}
        openingDecimal={2.05}
        oddsFormat="decimal"
        valuePct={7.6}
        variant="cell"
        highlight
      />,
    );
    expect(cellHtml).toContain('data-variant="cell"');
    expect(cellHtml).toContain('data-indicator-count="2"');
    expect(cellHtml).toContain("pl-atom-odds--cell");
    expect(cellHtml).toContain("1.85");
    expect(cellHtml).toContain("Justo 1.72");
    expect(cellHtml).toContain("+7.6%");
    expect(cellHtml).toContain("Steam");
    assertCleanEditorialHtml(cellHtml, "AtomicOddsChip(cell)");

    const fairOnlyCellHtml = renderToStaticMarkup(
      <AtomicOddsChip fairDecimal={1.72} oddsFormat="american" variant="cell" compact />,
    );
    expect(fairOnlyCellHtml).toContain('data-variant="cell"');
    expect(fairOnlyCellHtml).toContain('data-indicator-count="0"');
    expect(fairOnlyCellHtml).toContain("-139");
    expect(fairOnlyCellHtml).toContain("Momio justo");
    assertCleanEditorialHtml(fairOnlyCellHtml, "AtomicOddsChip(cell-fair-only)");

    const fairOnlyAmericanHtml = renderToStaticMarkup(
      <AtomicOddsChip fairDecimal={1.72} oddsFormat="american" compact />,
    );
    expect(fairOnlyAmericanHtml).toContain("Momio justo");
    expect(fairOnlyAmericanHtml).toContain("-139");
    expect(fairOnlyAmericanHtml).not.toContain("Casa");
    assertCleanEditorialHtml(fairOnlyAmericanHtml, "AtomicOddsChip(fair-only)");
  });

  it("renderiza AtomicMatchHeaderBar en estado en vivo sticky compacto con expulsiones e incidencia reciente", () => {
    const html = renderToStaticMarkup(
      <AtomicMatchHeaderBar
        league={asLeagueId("liga-mx")}
        home={{ slug: "america", name: "América", shortName: "América", redCards: 0 }}
        away={{ slug: "chivas", name: "Guadalajara", shortName: "Chivas", redCards: 1 }}
        score={{ home: 2, away: 1 }}
        phase="live"
        clock="68"
        latestEvent={{ kind: "goal", minute: 67, label: "H. Martín (2-1)" }}
        sticky
      />,
    );
    expect(html).toContain('data-atomic-match-header=""');
    expect(html).toContain('data-sticky="true"');
    expect(html).toContain("is-sticky");
    expect(html).toContain("is-live");
    expect(html).toContain("América");
    expect(html).toContain("Chivas");
    expect(html).toContain("68");
    expect(html).toContain("pl-sport-evt-ico--red");
    expect(html).toContain("pl-sport-evt-ico--goal");
    expect(html).toContain("H. Martín (2-1)");
    assertCleanEditorialHtml(html, "AtomicMatchHeaderBar");
  });

  it("renderiza PropBetLabChart para Fútbol (0'-90' + xG + rival EB) y NBA (0-48m) con resumen L5/L10/L20 y FD-16 limpio", () => {
    const footballPoints: PropBetLabPoint[] = [
      { id: "f1", label: "J10", opponent: "Tigres", value: 3, minutes: 88, xg: 0.54, isHome: true },
      { id: "f2", label: "J11", opponent: "Toluca", value: 2, minutes: 74, xg: 0.28, isHome: false },
      { id: "f3", label: "J12", opponent: "Pumas", value: 4, minutes: 90, xg: 0.76, isHome: true },
      { id: "f4", label: "J13", opponent: "León", value: 3, minutes: 82, xg: 0.41, isHome: false },
      { id: "f5", label: "J14", opponent: "Santos", value: 5, minutes: 90, xg: 0.92, isHome: true },
      { id: "f6", label: "J15", opponent: "Chivas", value: 3, minutes: 86, xg: 0.63, isHome: true },
    ];

    expect(classifyPropPointHit(3, 2.5)).toBe("hit");
    expect(classifyPropPointHit(2, 2.5)).toBe("miss");
    expect(classifyPropPointHit(2, 2)).toBe("push");

    const fbRates = computePropHitRates(footballPoints, 2.5);
    expect(fbRates.l5).toEqual({ hits: 4, total: 5, pct: 80 });
    expect(fbRates.l10).toEqual({ hits: 5, total: 6, pct: 83 });

    const footballHtml = renderToStaticMarkup(
      <PropBetLabChart
        playerName="Henry Martín"
        statLabel="Remates totales"
        unitLabel="remates"
        sport="football"
        line={2.5}
        points={footballPoints}
        maxMinutes={90}
        rivalDefenseRank={16}
        rivalLeagueSize={18}
        rivalEbLabel="Rival cede +1.7 remates/p vs media"
        calibratedProb={0.64}
        fairDecimal={1.56}
        onLineChange={() => {}}
      />,
    );
    expect(footballHtml).toContain('data-atomic-betlab=""');
    expect(footballHtml).toContain('data-sport="football"');
    expect(footballHtml).toContain('role="img"');
    expect(footballHtml).toContain("<title>");
    expect(footballHtml).toContain('data-max-minutes="90"');
    expect(footballHtml).toContain("<polyline");
    expect(footballHtml).toMatch(/90(?:'|&#x27;)/);
    expect(footballHtml).toContain("xG 0.92");
    expect(footballHtml).toContain("Defensa rival");
    expect(footballHtml).toContain("16.º");
    expect(footballHtml).toContain("Rival cede +1.7 remates/p vs media");
    expect(footballHtml).toContain("4/5");
    expect(footballHtml).toContain("80 %");
    expect(footballHtml).toContain("p calibrada");
    expect(footballHtml).toContain("64.0 %");
    expect(footballHtml).toContain("Momio justo");
    expect(footballHtml).toContain("1.56");
    assertCleanEditorialHtml(footballHtml, "PropBetLabChart(football)");

    const nbaPoints: PropBetLabPoint[] = [
      { id: "n1", label: "DEN", opponent: "Nuggets", value: 28, minutes: 37, isHome: true },
      { id: "n2", label: "PHX", opponent: "Suns", value: 22, minutes: 34, isHome: false },
      { id: "n3", label: "GSW", opponent: "Warriors", value: 31, minutes: 39, isHome: true },
      { id: "n4", label: "DAL", opponent: "Mavericks", value: 26, minutes: 36, isHome: false },
      { id: "n5", label: "BOS", opponent: "Celtics", value: 29, minutes: 40, isHome: true },
    ];

    const nbaHtml = renderToStaticMarkup(
      <PropBetLabChart
        playerName="LeBron James"
        statLabel="Puntos"
        unitLabel="pts"
        sport="basketball"
        line={24.5}
        points={nbaPoints}
        maxMinutes={48}
        rivalDefenseRank={24}
        rivalLeagueSize={30}
        rivalEbLabel="Defensa exterior #24 en puntos permitidos"
        calibratedProb={0.61}
        fairDecimal={1.64}
      />,
    );
    expect(nbaHtml).toContain('data-sport="basketball"');
    expect(nbaHtml).toContain('data-max-minutes="48"');
    expect(nbaHtml).toContain("48m");
    expect(nbaHtml).toContain("0–48m");
    expect(nbaHtml).toContain("24.º");
    expect(nbaHtml).toContain("61.0 %");
    expect(nbaHtml).toContain("1.64");
    expect(nbaHtml).not.toContain('data-betlab-xg-strip=""');
    assertCleanEditorialHtml(nbaHtml, "PropBetLabChart(nba)");

    const emptyBetLabHtml = renderToStaticMarkup(
      <PropBetLabChart
        playerName="Jugador sin historial"
        statLabel="Remates"
        unitLabel="remates"
        sport="football"
        line={1.5}
        points={[]}
      />,
    );
    expect(emptyBetLabHtml).toContain('data-atomic-betlab="empty"');
    assertCleanEditorialHtml(emptyBetLabHtml, "PropBetLabChart(empty)");
  });

  it("renderiza LivePickProgressBar con los 5 estados asiáticos, proyección residual y alerta titular_en_banca", () => {
    const expectedLabels: ReadonlyArray<readonly [LiveAsianPickState, string]> = [
      ["won_full", "Ganado completo"],
      ["won_half", "Medio ganado"],
      ["push", "Empate · Push"],
      ["lost_half", "Medio perdido"],
      ["lost_full", "Perdido"],
    ];

    for (const [state, expectedText] of expectedLabels) {
      expect(LIVE_ASIAN_STATE_LABEL_ES[state]).toBe(expectedText);
      const html = renderToStaticMarkup(
        <LivePickProgressBar
          pickLabel="América -0.75 (Hándicap asiático)"
          matchLabel="América vs Chivas"
          clockLabel="64'"
          actualValue={1}
          targetLine={-0.75}
          unitLabel="goles"
          direction="handicap"
          projectedFinal={1.4}
          asianState={state}
        />,
      );
      expect(html).toContain('data-atomic-livebar=""');
      expect(html).toContain(`data-asian-state="${state}"`);
      expect(html).toContain(expectedText);
      expect(html).toContain('role="progressbar"');
      expect(html).toContain("Proy.");
      assertCleanEditorialHtml(html, `LivePickProgressBar(${state})`);
    }

    const overMetrics = computeLiveProgressMetrics({
      actualValue: 2,
      targetLine: 2.5,
      direction: "over",
      projectedFinal: 3.1,
    });
    expect(overMetrics.tone).toBe("on_pace");
    expect(overMetrics.projectedPct).toBeGreaterThan(overMetrics.targetPct);

    const benchAlertHtml = renderToStaticMarkup(
      <LivePickProgressBar
        pickLabel="Henry Martín Más de 2.5 remates"
        matchLabel="América vs Chivas"
        clockLabel="XI confirmado"
        actualValue={0}
        targetLine={2.5}
        unitLabel="remates"
        direction="over"
        projectedFinal={0.8}
        starterAlert="titular_en_banca"
        starterAlertDetail="Inicia en la banca según el XI confirmado."
        compact
      />,
    );
    expect(benchAlertHtml).toContain('data-starter-alert="titular_en_banca"');
    expect(benchAlertHtml).toContain("Titular en banca");
    expect(benchAlertHtml).toContain("Inicia en la banca según el XI confirmado.");
    expect(benchAlertHtml).toContain("is-compact");
    assertCleanEditorialHtml(benchAlertHtml, "LivePickProgressBar(titular_en_banca)");
  });
});

describe("Componentes del Screener de Picks (`packages/ui/src/platform/club/picks/*`)", () => {
  it("renderiza NonLinearOddsSlider en escala decimal y americana sin colisión de rangos", () => {
    expect(formatOddsStepBound(12, "decimal")).toBe("1.30");
    expect(formatOddsStepBound(80, "decimal")).toBe("3.00");
    expect(formatOddsStepBound(100, "decimal", true)).toBe("10.00+");
    expect(formatOddsStepBound(100, "american", true)).toBe("+900+");

    const boundedHtml = renderToStaticMarkup(
      <NonLinearOddsSlider minStep={12} maxStep={80} oddsFormat="decimal" onChange={() => {}} />,
    );
    expect(boundedHtml).toContain('data-odds-range-slider=""');
    expect(boundedHtml).toContain("Rango de momios");
    expect(boundedHtml).toContain("1.30 — 3.00");
    expect(boundedHtml).toContain("Limpiar");
    expect(boundedHtml).toContain('aria-valuetext="Momio mínimo 1.30"');
    expect(boundedHtml).toContain('aria-valuetext="Momio máximo 3.00"');
    assertCleanEditorialHtml(boundedHtml, "NonLinearOddsSlider(bounded)");

    const unrestrictedHtml = renderToStaticMarkup(
      <NonLinearOddsSlider minStep={0} maxStep={100} oddsFormat="american" compact onChange={() => {}} />,
    );
    expect(unrestrictedHtml).toContain("Sin límite");
    expect(unrestrictedHtml).toContain("Sin tope (+900+)");
    assertCleanEditorialHtml(unrestrictedHtml, "NonLinearOddsSlider(unrestricted)");
  });

  it("renderiza SavedViewsBar con vistas activas, insignia EV+ y botón de guardado", () => {
    const views: SavedScreenerView[] = [
      {
        id: "v-ev-futbol",
        name: "EV+ Fútbol 1.50–2.40",
        sport: "futbol",
        league: "all",
        band: "all",
        kind: "all",
        sort: "ventaja",
        onlyPositiveEdge: true,
        minOddsStep: 20,
        maxOddsStep: 56,
        window: "today",
      },
      {
        id: "v-nba-totales",
        name: "NBA Totales",
        sport: "nba",
        league: "nba",
        band: "alta",
        kind: "goles",
        sort: "p",
        onlyPositiveEdge: false,
        minOddsStep: 0,
        maxOddsStep: 100,
        window: "all",
      },
    ];

    const html = renderToStaticMarkup(
      <SavedViewsBar
        views={views}
        activeViewId="v-ev-futbol"
        onApply={() => {}}
        onSave={() => true}
        onDelete={() => {}}
      />,
    );
    expect(html).toContain('data-saved-views-bar=""');
    expect(html).toContain('data-saved-view-id="v-ev-futbol"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("EV+ Fútbol 1.50–2.40");
    expect(html).toContain("NBA Totales");
    expect(html).toContain("Solo con valor EV+");
    expect(html).toContain("Guardar vista");
    expect(html).toContain("2/12");
    assertCleanEditorialHtml(html, "SavedViewsBar");
  });

  it("renderiza BookmakerComparePill en variantes box e inline con EV+, Steam y multi-casa", () => {
    expect(computeExpectedValuePct(0.6, 1.85)).toBe(11);
    expect(classifyOddsMovement(2.05, 1.85, "shortening", "STEAM")?.kind).toBe("steam");

    const quotes: BookQuoteItem[] = [
      {
        book: "pinnacle",
        bookLabel: "Pinnacle",
        decimal: 1.85,
        capturedAtUtc: "2030-11-14T15:00:00Z",
        openingDecimal: 2.05,
        movementDirection: "shortening",
        isBest: true,
      },
      {
        book: "bet365",
        bookLabel: "Bet365",
        decimal: 1.8,
        capturedAtUtc: "2030-11-14T15:00:00Z",
      },
      {
        book: "codere",
        bookLabel: "Codere",
        decimal: 1.78,
        capturedAtUtc: "2030-11-14T15:00:00Z",
      },
    ];

    const boxHtml = renderToStaticMarkup(
      <BookmakerComparePill
        probability={0.6}
        fairDecimal={1.67}
        houseDecimal={1.85}
        houseBookLabel="Pinnacle"
        openingDecimal={2.05}
        movementSignal="STEAM"
        capturedAtUtc="2030-11-14T15:00:00Z"
        bookQuotes={quotes}
        oddsFormat="decimal"
        variant="box"
        showMultiBookQuotes
        showCaptureStamp
      />,
    );
    expect(boxHtml).toContain('data-bookmaker-compare="box"');
    expect(boxHtml).toContain("Pinnacle");
    expect(boxHtml).toContain("1.85");
    expect(boxHtml).toContain("Justo 1.67");
    expect(boxHtml).toContain("Valor +11.0 %");
    expect(boxHtml).toContain('data-ev-positive="true"');
    expect(boxHtml).toContain('data-line-movement="steam"');
    expect(boxHtml).toContain("Ap. 2.05");
    expect(boxHtml).toContain("Bet365");
    expect(boxHtml).toContain("Codere");
    expect(boxHtml).toContain('data-quote-captured=""');
    assertCleanEditorialHtml(boxHtml, "BookmakerComparePill(box)");

    const inlineHtml = renderToStaticMarkup(
      <BookmakerComparePill
        probability={0.6}
        fairDecimal={1.67}
        houseDecimal={1.85}
        houseBookLabel="Pinnacle"
        oddsFormat="decimal"
        variant="inline"
        showCasaPrefix
      />,
    );
    expect(inlineHtml).toContain('data-bookmaker-compare="inline"');
    expect(inlineHtml).toContain("Justo 1.67");
    expect(inlineHtml).toContain("Casa 1.85");
    expect(inlineHtml).toContain("Valor +11.0 %");
    assertCleanEditorialHtml(inlineHtml, "BookmakerComparePill(inline)");
  });

  it("renderiza EvidenceWindowPills y extrae ventanas reales L5/L20/H2H/xG", () => {
    const dataset = buildSampleDataset();
    const game = dataset.games[0]!;
    const extracted = extractEvidenceWindows({
      game,
      pick: {
        label: "América gana",
        selectionKey: "home",
        market: "1x2",
        marketGroup: "Resultado",
        line: null,
      },
    });

    const keys = extracted.map((w) => w.key);
    expect(keys).toContain("l5");
    expect(keys).toContain("l20");
    expect(keys).toContain("h2h");
    expect(keys).toContain("xg");

    const html = renderToStaticMarkup(<EvidenceWindowPills windows={extracted} size="md" />);
    expect(html).toContain('data-evidence-windows=""');
    expect(html).toContain('role="list"');
    expect(html).toContain('data-evidence-window="l5"');
    expect(html).toContain('data-evidence-window="l20"');
    expect(html).toContain('data-evidence-window="h2h"');
    expect(html).toContain('data-evidence-window="xg"');
    assertCleanEditorialHtml(html, "EvidenceWindowPills");

    expect(renderToStaticMarkup(<EvidenceWindowPills windows={[]} />)).toBe("");
  });

  it("renderiza BetBuilderDrawer y BetBuilderQuickButton bajo PlatformProvider sin fugas FD-16 ni copy prohibido", () => {
    const dataset = buildSampleDataset();
    const game = dataset.games[0]!;
    const basePick = game.picks[0]!;
    const enrichedPick = {
      ...basePick,
      marketDecimal: 1.92,
      marketBookLabel: "Pinnacle",
      marketCapturedAtUtc: "2030-11-14T15:00:00Z",
      bookQuotes: [
        {
          book: "pinnacle",
          bookLabel: "Pinnacle",
          decimal: 1.92,
          capturedAtUtc: "2030-11-14T15:00:00Z",
          openingDecimal: 2.06,
          movementDirection: "shortening" as const,
          isBest: true,
        },
        {
          book: "codere",
          bookLabel: "Codere",
          decimal: 1.85,
          capturedAtUtc: "2030-11-14T15:00:00Z",
        },
      ],
    };

    const drawerHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <BetBuilderQuickButton pick={enrichedPick} onInspect={() => {}} />
        <BetBuilderDrawer open pick={enrichedPick} game={game} onClose={() => {}} />
      </PlatformProvider>,
    );
    expect(drawerHtml).toContain(`data-open-bet-builder="${enrichedPick.id}"`);
    expect(drawerHtml).toContain('data-bet-builder-drawer=""');
    expect(drawerHtml).toContain("Bet Builder · Combinada rápida");
    expect(drawerHtml).toContain("Probabilidad Spacetime");
    expect(drawerHtml).toContain('data-bookmaker-compare="box"');
    expect(drawerHtml).toContain('data-builder-compat="allowed"');
    expect(drawerHtml).toContain("Agregar al boleto");
    expect(drawerHtml).toContain("Sellar simple");
    expect(drawerHtml).toContain("Combinar del mismo partido (SGP)");
    expect(drawerHtml).toContain("Abrir Parlays");
    assertCleanEditorialHtml(drawerHtml, "BetBuilderDrawer");

    const closedHtml = renderToStaticMarkup(
      <PlatformProvider dataset={dataset} initialRole="member">
        <BetBuilderDrawer open={false} pick={enrichedPick} game={game} onClose={() => {}} />
      </PlatformProvider>,
    );
    expect(closedHtml).toBe("");
  });
});
