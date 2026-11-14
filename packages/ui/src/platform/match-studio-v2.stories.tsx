import React, { useState } from "react";
import { asLeagueId, asMarketKey, type MatchAnalysis } from "@pitchlab/contracts";
import { CortexAnalysisCard } from "./club/match/CortexAnalysisCard";
import { MatchCommunityPoll } from "./club/match/MatchCommunityPoll";
import { MatchContextPanel } from "./club/match/MatchContextPanel";
import { MatchMarketsGrid } from "./club/match/MatchMarketsGrid";
import { MatchSimulator } from "./club/match/MatchSimulator";
import { ConfidenceChip } from "./components/ConfidenceChip";
import { HomeMatchCard } from "./components/HomeMatchCard";
import { WinningTicketDialog } from "./components/WinningTicketDialog";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";
import type { JournalEntry } from "./types";

/* Partido de ejemplo para las stories (cifras ilustrativas, no son datos de la jornada). */
const row = (market: string, selection: string, label: string, p: number, line?: number) => ({
  market: asMarketKey(market),
  selection,
  label,
  ...(line !== undefined ? { line } : {}),
  p,
  fairOdds: 1 / p,
});

const MATCH: MatchAnalysis = {
  id: "story-qro-mty",
  league: asLeagueId("liga-mx"),
  leagueLabel: "Liga MX",
  sport: "football",
  round: "Jornada 16",
  day: "2030-11-14",
  dayLabel: "sábado, 14 de noviembre",
  kickoffUtc: "2030-11-14T23:00:00Z",
  kickoffLocal: "17:00",
  venue: "Estadio Corregidora",
  status: "NS",
  home: { slug: "queretaro", name: "Querétaro", shortName: "Querétaro", code: "QRO", record: "15 PJ · 1.2 goles/p" },
  away: { slug: "monterrey", name: "Rayados de Monterrey", shortName: "Monterrey", code: "MTY", record: "15 PJ · 1.7 goles/p" },
  projection: { home: 1.53, away: 1.41, total: 2.94 },
  x12: [0.397, 0.257, 0.346],
  marketGroups: [
    { group: "Resultado", rows: [row("h2h", "home", "Querétaro gana", 0.397), row("h2h", "draw", "Empate", 0.257), row("h2h", "away", "Monterrey gana", 0.346)] },
    { group: "Doble oportunidad", rows: [row("double_chance", "1x", "Querétaro o empate", 0.654), row("double_chance", "12", "Sin empate", 0.743)] },
    { group: "Goles totales", rows: [row("totals", "over_1.5", "Más de 1.5", 0.798, 1.5), row("totals", "over_2.5", "Más de 2.5", 0.563, 2.5)] },
    { group: "Ambos anotan", rows: [row("btts", "yes", "Sí", 0.598), row("btts", "no", "No", 0.402)] },
  ],
  outcomes: [
    { key: "home", label: "Querétaro gana", probability: 0.397 },
    { key: "draw", label: "Empate", probability: 0.257 },
    { key: "away", label: "Monterrey gana", probability: 0.346 },
  ],
  factors: [
    { label: "Forma local", detail: "", impact: "", value: "G-E-P-G-G · 3-1", sub: "8 goles a favor · 5 en contra" },
    { label: "Forma visitante", detail: "", impact: "", value: "P-G-G-E-G · 3-1", sub: "9 goles a favor · 6 en contra" },
  ],
  trace: [],
  headToHead: [
    { date: "2026-04-12", home: "Monterrey", away: "Querétaro", homeGoals: 2, awayGoals: 1 },
    { date: "2025-09-20", home: "Querétaro", away: "Monterrey", homeGoals: 1, awayGoals: 1 },
    { date: "2025-02-08", home: "Monterrey", away: "Querétaro", homeGoals: 0, awayGoals: 2 },
  ],
  restDays: { home: 7, away: 4 },
  confidence: {
    score: 49,
    level: "media",
    reasons: ["Datos parciales (34 % del modelo)", "Muestra suficiente"],
    factors: [
      { key: "favorite", label: "Favorito", value: 0.15, weight: 0.5, detail: "El resultado más probable tiene 40 %." },
      { key: "coverage", label: "Datos disponibles", value: 0.34, weight: 0.3, detail: "El modelo tiene 34 % de los datos que usa." },
      { key: "sample", label: "Partidos jugados", value: 1, weight: 0.2, detail: "Ambos llevan 15 partidos." },
    ],
  },
};

const DATASET = buildPlatformDataset([
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "Apertura",
    roundLabel: "Jornada 16",
    generatedAt: "2030-11-12T00:00:00Z",
    games: [MATCH],
    standings: [],
  },
]);
const GAME = DATASET.games[0]!;

const SYNTHESIS =
  "Querétaro llega con mejor forma en casa y una semana completa de descanso; Monterrey viaja con tres días menos y produce más goles por partido. El modelo ve un partido abierto: 40 % para el local, 35 % para la visita y 56 % de que haya más de 2.5 goles.";

function Provider({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <PlatformProvider dataset={DATASET} initialRole="member">
      <div className="pl-stage" style={{ padding: 24, maxWidth: 1100, display: "grid", gap: 16 }}>{children}</div>
    </PlatformProvider>
  );
}

const WON: JournalEntry = {
  id: "story-won",
  pickId: "story-pick",
  gameId: "story-qro-mty",
  leagueLabel: "Liga MX",
  matchLabel: "3 selecciones",
  pickLabel: "Querétaro o empate + Más de 1.5 goles + Bills ganan",
  origin: "Parlay Combinado",
  units: 1,
  userDecimal: 3.4,
  fairDecimal: 3.1,
  clvPct: 2.1,
  status: "won",
  sealedAt: "14 nov",
  sealedAtIso: "2030-11-14T18:00:00Z",
};

function WinningStory(): React.JSX.Element {
  const [entry, setEntry] = useState<JournalEntry | null>(WON);
  return (
    <>
      <button type="button" className="pl-btn-primary min-h-10 px-4" onClick={() => setEntry(WON)}>
        Abrir boleto ganador
      </button>
      <WinningTicketDialog entry={entry} onClose={() => setEntry(null)} />
    </>
  );
}

export default {
  title: "Platform v4 / Ficha del partido v2",
  parameters: { layout: "fullscreen" },
};

const light = { globals: { theme: "light" } };

export const TarjetaInicio = {
  render: () => (
    <Provider>
      <div style={{ maxWidth: 380 }}>
        <HomeMatchCard game={GAME} />
      </div>
    </Provider>
  ),
};
export const TarjetaInicioClaro = { ...TarjetaInicio, ...light };

export const ChipConfianza = { render: () => <Provider><ConfidenceChip game={GAME} size="lg" /></Provider> };
export const ChipConfianzaClaro = { ...ChipConfianza, ...light };

export const AnalisisCortex = {
  render: () => (
    <Provider>
      <CortexAnalysisCard game={GAME} synthesis={SYNTHESIS} unlocked />
    </Provider>
  ),
};
export const AnalisisCortexClaro = { ...AnalisisCortex, ...light };

export const VotacionYSimulador = {
  render: () => (
    <Provider>
      <div className="pl-studio-duo">
        <MatchCommunityPoll game={GAME} />
        <MatchSimulator game={GAME} />
      </div>
    </Provider>
  ),
};
export const VotacionYSimuladorClaro = { ...VotacionYSimulador, ...light };

export const Contexto = { render: () => <Provider><MatchContextPanel game={GAME} /></Provider> };
export const ContextoClaro = { ...Contexto, ...light };

export const BoletoGanador = { render: () => <Provider><WinningStory /></Provider> };
export const BoletoGanadorClaro = { ...BoletoGanador, ...light };

const SAMPLE_DERIVED_FOOTBALL_ROWS = [
  ...GAME.markets.map((m, idx) => ({
    ...m,
    isDerived: false,
    isMostLikely: idx === 0,
  })),
  {
    group: "Goles · Querétaro",
    market: "team_goals_home",
    selection: "home_over_1.5",
    label: "Querétaro · Más de 1.5 goles",
    p: 0.452,
    fairDecimal: 2.21,
    fairAmerican: 121,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: true,
    cardCategory: "goles" as const,
    cardTitle: "Goles Querétaro (1.5)",
    isMostLikely: false,
  },
  {
    group: "Goles · Querétaro",
    market: "team_goals_home",
    selection: "home_under_1.5",
    label: "Querétaro · Menos de 1.5 goles",
    p: 0.548,
    fairDecimal: 1.82,
    fairAmerican: -122,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: true,
    cardCategory: "goles" as const,
    cardTitle: "Goles Querétaro (1.5)",
    isMostLikely: true,
  },
  {
    group: "Marcador exacto",
    market: "correct_score",
    selection: "1-1",
    label: "Marcador 1-1",
    p: 0.118,
    fairDecimal: 8.47,
    fairAmerican: 747,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: true,
    cardCategory: "marcador" as const,
    cardTitle: "Marcador exacto · Top 6",
    isMostLikely: true,
  },
  {
    group: "1er tiempo · Resultado",
    market: "ht_1x2",
    selection: "ht_draw",
    label: "1T · Empate",
    p: 0.415,
    fairDecimal: 2.41,
    fairAmerican: 141,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: true,
    cardCategory: "primer_tiempo" as const,
    cardTitle: "1er tiempo · Resultado 1X2",
    isMostLikely: true,
  },
];

const SAMPLE_DERIVED_NFL_ROWS = [
  {
    group: "Ganador",
    market: "moneyline",
    selection: "home",
    label: "Chiefs ganan",
    p: 0.62,
    fairDecimal: 1.61,
    fairAmerican: -163,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: false,
    cardCategory: "resultado" as const,
    cardTitle: "Ganador",
    isMostLikely: true,
  },
  {
    group: "Hándicap",
    market: "spread",
    selection: "home_-3.5",
    label: "Chiefs (-3.5)",
    p: 0.52,
    fairDecimal: 1.92,
    fairAmerican: -108,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: true,
    cardCategory: "handicap" as const,
    cardTitle: "Hándicap (-3.5)",
    isMostLikely: true,
  },
  {
    group: "Hándicap",
    market: "spread",
    selection: "away_+3.5",
    label: "Bills (+3.5)",
    p: 0.48,
    fairDecimal: 2.08,
    fairAmerican: 108,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: true,
    cardCategory: "handicap" as const,
    cardTitle: "Hándicap (-3.5)",
    isMostLikely: false,
  },
  {
    group: "Total de puntos",
    market: "totals",
    selection: "over_47.5",
    label: "Más de 47.5 pts",
    p: 0.54,
    fairDecimal: 1.85,
    fairAmerican: -117,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: true,
    cardCategory: "goles" as const,
    cardTitle: "Total de puntos (47.5)",
    isMostLikely: true,
  },
  {
    group: "Total de puntos",
    market: "totals",
    selection: "under_47.5",
    label: "Menos de 47.5 pts",
    p: 0.46,
    fairDecimal: 2.17,
    fairAmerican: 117,
    openDecimal: null,
    currentDecimal: null,
    edgePts: null,
    isDerived: true,
    cardCategory: "goles" as const,
    cardTitle: "Total de puntos (47.5)",
    isMostLikely: false,
  },
];

export const MercadosDerivados = {
  render: () => (
    <Provider>
      <MatchMarketsGrid
        sport="football"
        markets={SAMPLE_DERIVED_FOOTBALL_ROWS}
        oddsFormat="american"
        watermark="@socio_demo"
        onHouseOddChange={() => undefined}
        onSealRow={() => undefined}
      />
    </Provider>
  ),
};
export const MercadosDerivadosClaro = { ...MercadosDerivados, ...light };

export const MercadosDerivadosNFL = {
  render: () => (
    <Provider>
      <MatchMarketsGrid
        sport="american-football"
        markets={SAMPLE_DERIVED_NFL_ROWS}
        oddsFormat="decimal"
        watermark="@socio_demo"
        onHouseOddChange={() => undefined}
        onSealRow={() => undefined}
      />
    </Provider>
  ),
};
export const MercadosDerivadosNFLClaro = { ...MercadosDerivadosNFL, ...light };
