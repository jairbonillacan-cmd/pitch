import React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { asLeagueId } from "@pitchlab/contracts";
import { EmblemSurfaceProvider } from "../../../sports";
import { redactDatasetForVisitor } from "../../access-guard";
import { PlatformProvider } from "../../platform-provider";
import type {
  BookQuoteItem,
  MatchIntelligenceV5View,
  MatchPick,
  PlatformDataset,
  PlatformGame,
  PlatformMarketRow,
} from "../../types";
import { MatchPicksEvidenceBoard } from "./MatchPicksEvidenceBoard";

const meta = {
  title: "Platform v4 / Ficha del partido / MatchPicksEvidenceBoard",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const CAPTURED_UTC = "2026-11-19T18:45:00Z";
const LEAGUE_MX = asLeagueId("liga-mx");
const GAME_ID = "lmx-evb-ame-tig";

const QUOTES_HOME_WIN: readonly BookQuoteItem[] = [
  {
    book: "caliente_mx",
    bookLabel: "Caliente",
    decimal: 1.92,
    openingDecimal: 2.08,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
    isBest: true,
  },
  {
    book: "codere",
    bookLabel: "Codere",
    decimal: 1.88,
    openingDecimal: 2.02,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
  },
  {
    book: "bet365",
    bookLabel: "Bet365",
    decimal: 1.86,
    openingDecimal: 1.98,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
  },
];

const QUOTES_OVER_25: readonly BookQuoteItem[] = [
  {
    book: "bet365",
    bookLabel: "Bet365",
    decimal: 1.94,
    openingDecimal: 2.02,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
    isBest: true,
  },
  {
    book: "codere",
    bookLabel: "Codere",
    decimal: 1.9,
    openingDecimal: 1.96,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
  },
  {
    book: "novibet",
    bookLabel: "Novibet",
    decimal: 1.89,
    openingDecimal: 1.95,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
  },
];

const QUOTES_BTTS_YES: readonly BookQuoteItem[] = [
  {
    book: "codere",
    bookLabel: "Codere",
    decimal: 1.86,
    openingDecimal: 1.78,
    movementDirection: "drifting",
    capturedAtUtc: CAPTURED_UTC,
    isBest: true,
  },
  {
    book: "caliente_mx",
    bookLabel: "Caliente",
    decimal: 1.83,
    openingDecimal: 1.76,
    movementDirection: "drifting",
    capturedAtUtc: CAPTURED_UTC,
  },
];

const QUOTES_CORNERS: readonly BookQuoteItem[] = [
  {
    book: "bet365",
    bookLabel: "Bet365",
    decimal: 1.87,
    openingDecimal: 1.94,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
    isBest: true,
  },
  {
    book: "playdoit",
    bookLabel: "Playdoit",
    decimal: 1.84,
    openingDecimal: 1.9,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
  },
];

const QUOTES_CARDS: readonly BookQuoteItem[] = [
  {
    book: "caliente_mx",
    bookLabel: "Caliente",
    decimal: 1.84,
    openingDecimal: 1.98,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
    isBest: true,
  },
  {
    book: "codere",
    bookLabel: "Codere",
    decimal: 1.8,
    openingDecimal: 1.92,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
  },
];

const QUOTES_HANDICAP: readonly BookQuoteItem[] = [
  {
    book: "pinnacle",
    bookLabel: "Pinnacle",
    decimal: 1.95,
    openingDecimal: 1.89,
    movementDirection: "drifting",
    capturedAtUtc: CAPTURED_UTC,
    isBest: true,
  },
  {
    book: "bet365",
    bookLabel: "Bet365",
    decimal: 1.91,
    openingDecimal: 1.86,
    movementDirection: "drifting",
    capturedAtUtc: CAPTURED_UTC,
  },
];

const PRIMARY_PICKS: MatchPick[] = [
  {
    id: "evb-pick-home",
    gameId: GAME_ID,
    league: LEAGUE_MX,
    leagueLabel: "Liga MX",
    matchLabel: "América vs Tigres",
    kickoffLocal: "21:00",
    gameStatus: "NS",
    slotIndex: 0,
    category: "principal",
    categoryLabel: "Resultado",
    risk: "medio",
    engineKey: "singularity",
    engineName: "PitchLab Singularity v3.0",
    marketGroup: "Resultado",
    selectionKey: "home",
    market: "h2h",
    conflictGroup: "home_side",
    label: "América gana",
    rationale: "Dominio sostenido en goles esperados en casa y racha de 4 victorias en los últimos 5 partidos.",
    p: 0.584,
    fairDecimal: 1.71,
    fairAmerican: -140,
    marketDecimal: 1.92,
    marketAmerican: -109,
    marketBookLabel: "Caliente",
    marketCapturedAtUtc: CAPTURED_UTC,
    bookQuotes: QUOTES_HOME_WIN,
    edgePts: 6.3,
    confidenceScore: null,
    suggestedUnits: 1.25,
  },
  {
    id: "evb-pick-over25",
    gameId: GAME_ID,
    league: LEAGUE_MX,
    leagueLabel: "Liga MX",
    matchLabel: "América vs Tigres",
    kickoffLocal: "21:00",
    gameStatus: "NS",
    slotIndex: 1,
    category: "totales",
    categoryLabel: "Goles totales",
    risk: "medio",
    engineKey: "tachyon",
    engineName: "PitchLab Tachyon v3.0",
    marketGroup: "Goles totales",
    selectionKey: "over_2.5",
    market: "totals",
    line: 2.5,
    conflictGroup: "over_total",
    label: "Más de 2.5 goles",
    rationale: "Ritmo proyectado de 3.06 xG con ataque alto en ambos costados.",
    p: 0.575,
    fairDecimal: 1.74,
    fairAmerican: -135,
    marketDecimal: 1.94,
    marketAmerican: -106,
    marketBookLabel: "Bet365",
    marketCapturedAtUtc: CAPTURED_UTC,
    bookQuotes: QUOTES_OVER_25,
    edgePts: 6.0,
    confidenceScore: null,
    suggestedUnits: 1.0,
  },
  {
    id: "evb-pick-btts",
    gameId: GAME_ID,
    league: LEAGUE_MX,
    leagueLabel: "Liga MX",
    matchLabel: "América vs Tigres",
    kickoffLocal: "21:00",
    gameStatus: "NS",
    slotIndex: 2,
    category: "valor",
    categoryLabel: "Ambos anotan",
    risk: "medio",
    engineKey: "geodesic",
    engineName: "PitchLab Geodesic v2.0",
    marketGroup: "Ambos anotan",
    selectionKey: "yes",
    market: "btts",
    conflictGroup: "btts_yes",
    label: "Ambos anotan: Sí",
    rationale: "Los cuatro duelos directos recientes registraron goles de ambos clubes.",
    p: 0.592,
    fairDecimal: 1.69,
    fairAmerican: -145,
    marketDecimal: 1.86,
    marketAmerican: -116,
    marketBookLabel: "Codere",
    marketCapturedAtUtc: CAPTURED_UTC,
    bookQuotes: QUOTES_BTTS_YES,
    edgePts: 5.4,
    confidenceScore: null,
    suggestedUnits: 1.0,
  },
];

const EXTRA_MARKETS: PlatformMarketRow[] = [
  {
    group: "Doble oportunidad",
    market: "double_chance",
    selection: "1x",
    label: "América o empate",
    p: 0.82,
    fairDecimal: 1.22,
    fairAmerican: -455,
    openDecimal: 1.28,
    currentDecimal: 1.26,
    movementDirection: "shortening",
    quoteBookLabel: "Codere",
    quoteCapturedAtUtc: CAPTURED_UTC,
    edgePts: 2.6,
  },
  {
    group: "Goles totales",
    market: "totals",
    selection: "over_1.5",
    label: "Más de 1.5 goles",
    line: 1.5,
    p: 0.804,
    fairDecimal: 1.24,
    fairAmerican: -410,
    openDecimal: 1.3,
    currentDecimal: 1.28,
    movementDirection: "shortening",
    quoteBookLabel: "Caliente",
    quoteCapturedAtUtc: CAPTURED_UTC,
    edgePts: 2.3,
  },
  {
    group: "Tiros de esquina",
    market: "corners_total",
    selection: "over_9.5",
    label: "Más de 9.5 córners",
    line: 9.5,
    p: 0.59,
    fairDecimal: 1.69,
    fairAmerican: -144,
    openDecimal: 1.94,
    currentDecimal: 1.87,
    movementDirection: "shortening",
    quoteBookLabel: "Bet365",
    quoteCapturedAtUtc: CAPTURED_UTC,
    bookQuotes: QUOTES_CORNERS,
    edgePts: 5.5,
  },
  {
    group: "Tarjetas amarillas",
    market: "yellow_total",
    selection: "over_4.5",
    label: "Más de 4.5 tarjetas amarillas",
    line: 4.5,
    p: 0.612,
    fairDecimal: 1.63,
    fairAmerican: -158,
    openDecimal: 1.98,
    currentDecimal: 1.84,
    movementDirection: "shortening",
    quoteBookLabel: "Caliente",
    quoteCapturedAtUtc: CAPTURED_UTC,
    bookQuotes: QUOTES_CARDS,
    edgePts: 6.9,
  },
  {
    group: "Faltas totales",
    market: "fouls_total",
    selection: "over_22.5",
    label: "Más de 22.5 faltas",
    line: 22.5,
    p: 0.56,
    fairDecimal: 1.79,
    fairAmerican: -127,
    openDecimal: 1.82,
    currentDecimal: 1.85,
    movementDirection: "drifting",
    quoteBookLabel: "Novibet",
    quoteCapturedAtUtc: CAPTURED_UTC,
    edgePts: 1.9,
  },
  {
    group: "Hándicap asiático",
    market: "handicap",
    selection: "home_-0.5",
    label: "Hándicap América -0.5",
    line: -0.5,
    p: 0.584,
    fairDecimal: 1.71,
    fairAmerican: -140,
    openDecimal: 1.89,
    currentDecimal: 1.95,
    movementDirection: "drifting",
    quoteBookLabel: "Pinnacle",
    quoteCapturedAtUtc: CAPTURED_UTC,
    bookQuotes: QUOTES_HANDICAP,
    edgePts: 7.1,
  },
];

const MEMBER_GAME: PlatformGame = {
  id: GAME_ID,
  league: LEAGUE_MX,
  leagueLabel: "Liga MX",
  sport: "football",
  round: "Jornada 16",
  dayId: "2026-11-21",
  dayLabel: "sábado, 21 de noviembre",
  kickoffUtc: "2026-11-22T03:00:00Z",
  kickoffLocal: "21:00",
  venue: "Estadio Azteca",
  referee: "Luis Santander",
  status: "NS",
  home: {
    slug: "club-america",
    name: "Club América",
    shortName: "América",
    code: "AME",
    record: "14G-4E-3P",
  },
  away: {
    slug: "tigres-uanl",
    name: "Tigres UANL",
    shortName: "Tigres",
    code: "TIG",
    record: "11G-5E-5P",
  },
  hasForecast: true,
  x12: [0.584, 0.236, 0.18],
  projection: { home: 1.92, away: 1.14, total: 3.06 },
  goalLine: { line: 2.5, pOver: 0.575 },
  confidenceScore: null,
  confidenceLevel: null,
  picks: PRIMARY_PICKS,
  parlayCandidates: [],
  preGame: {
    cortexSynthesis:
      "América domina posesión y volumen de tiros en casa; Tigres sostiene producción ofensiva en transición.",
    tacticalKeys: ["Presión alta en primeros 30 minutos", "Ritmo elevado de faltas tácticas"],
    lineupStatusLabel: "Once probable disponible",
    lineupsConfirmed60m: false,
    absences: [],
    moneyFlow: null,
  },
  markets: EXTRA_MARKETS,
  factors: [
    { label: "Forma local", value: "G-G-E-G-G · 4-1-0", sub: "11 goles a favor · 4 en contra" },
    { label: "Forma visitante", value: "G-P-G-E-G · 3-1-1", sub: "8 goles a favor · 6 en contra" },
  ],
  headToHead: [
    { date: "2026-04-18", home: "América", away: "Tigres", homeGoals: 2, awayGoals: 1 },
    { date: "2025-10-25", home: "Tigres", away: "América", homeGoals: 1, awayGoals: 2 },
    { date: "2025-03-15", home: "América", away: "Tigres", homeGoals: 3, awayGoals: 1 },
    { date: "2024-09-21", home: "Tigres", away: "América", homeGoals: 1, awayGoals: 1 },
  ],
  counts: {
    corners: { home: 5.8, away: 4.6, total: 10.4, line: 9.5, pOver: 0.59, sample: { home: 15, away: 15 } },
    fouls: { home: 11.4, away: 12.1, total: 23.5, line: 22.5, pOver: 0.56, sample: { home: 15, away: 15 } },
    yellow: { home: 2.3, away: 2.7, total: 5.0, line: 4.5, pOver: 0.61, sample: { home: 15, away: 15 } },
  },
  updatedAtLabel: "Actualizado hace 5 min",
  spacetime: null,
};

const FINISHED_GAME: PlatformGame = {
  ...MEMBER_GAME,
  id: "lmx-evb-ame-tig-ft",
  status: "FT",
  score: { home: 2, away: 1 },
  picks: PRIMARY_PICKS.map((pk) => ({
    ...pk,
    id: `${pk.id}-ft`,
    gameId: "lmx-evb-ame-tig-ft",
    gameStatus: "FT" as const,
    result: "hit" as const,
  })),
};

const MATCH_V5: MatchIntelligenceV5View = {
  epistemic: {
    home: {
      pPoint: 0.584,
      pLower90: 0.531,
      pUpper90: 0.635,
      halfWidth90: 0.052,
      conservativeFairDecimal: 1.88,
      grade: "high",
    },
    draw: {
      pPoint: 0.236,
      pLower90: 0.194,
      pUpper90: 0.281,
      halfWidth90: 0.044,
      conservativeFairDecimal: 5.15,
      grade: "high",
    },
    away: {
      pPoint: 0.18,
      pLower90: 0.141,
      pUpper90: 0.224,
      halfWidth90: 0.042,
      conservativeFairDecimal: 7.09,
      grade: "high",
    },
  },
  microCounts: {
    refereeProfile: {
      name: "Luis Santander",
      games: 38,
      cardsMultiplier: 1.21,
      foulsMultiplier: 1.14,
      redsMultiplier: 1.32,
    },
  },
  verifiedSummaryEs:
    "América llega con 4 victorias en 5 partidos y el árbitro designado promedia 21 % más tarjetas amarillas que la media del torneo.",
  guardrailPassed: true,
};

const MEMBER_DATASET: PlatformDataset = {
  generatedAt: CAPTURED_UTC,
  leagues: [
    {
      league: LEAGUE_MX,
      label: "Liga MX",
      sport: "football",
      season: "Apertura 2026",
      roundLabel: "Jornada 16",
      generatedAt: CAPTURED_UTC,
      totalGames: 2,
      upcomingCount: 1,
      finishedCount: 1,
      standings: [],
    },
  ],
  games: [MEMBER_GAME, FINISHED_GAME],
  dailyPromoPickId: "promo-externo-del-dia",
  tipsterWeeklyPickId: "tipster-externo-semanal",
  tipsterWeeklySlug: "sofia-nfl",
  isServerRedactedForVisitor: false,
};

const VISITOR_DATASET: PlatformDataset = redactDatasetForVisitor(MEMBER_DATASET);
const VISITOR_GAME: PlatformGame = VISITOR_DATASET.games[0]!;

export const SocioFamiliasYEvidenciaOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <EmblemSurfaceProvider surface="app">
      <PlatformProvider dataset={MEMBER_DATASET} initialRole="member">
        <div className="pl-stage" style={{ padding: 24, maxWidth: 1080 }}>
          <MatchPicksEvidenceBoard
            game={MEMBER_GAME}
            markets={MEMBER_GAME.markets}
            v5={MATCH_V5}
          />
        </div>
      </PlatformProvider>
    </EmblemSurfaceProvider>
  ),
};

export const SocioFamiliasYEvidenciaClaro: Story = {
  globals: { theme: "light" },
  render: SocioFamiliasYEvidenciaOscuro.render,
};

export const VisitanteCeroFugaOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <EmblemSurfaceProvider surface="app">
      <PlatformProvider dataset={VISITOR_DATASET} initialRole="visitor">
        <div className="pl-stage" style={{ padding: 24, maxWidth: 1080 }}>
          <MatchPicksEvidenceBoard
            game={VISITOR_GAME}
            markets={VISITOR_GAME.markets}
            v5={null}
          />
        </div>
      </PlatformProvider>
    </EmblemSurfaceProvider>
  ),
};

export const VisitanteCeroFugaClaro: Story = {
  globals: { theme: "light" },
  render: VisitanteCeroFugaOscuro.render,
};

export const PartidoFinalizadoAuditableOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <EmblemSurfaceProvider surface="app">
      <PlatformProvider dataset={MEMBER_DATASET} initialRole="member">
        <div className="pl-stage" style={{ padding: 24, maxWidth: 1080 }}>
          <MatchPicksEvidenceBoard
            game={FINISHED_GAME}
            markets={FINISHED_GAME.markets}
            v5={MATCH_V5}
          />
        </div>
      </PlatformProvider>
    </EmblemSurfaceProvider>
  ),
};

export const PartidoFinalizadoAuditableClaro: Story = {
  globals: { theme: "light" },
  render: PartidoFinalizadoAuditableOscuro.render,
};
