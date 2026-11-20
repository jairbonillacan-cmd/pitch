import React from "react";
import { asLeagueId, asMarketKey, type MatchAnalysis } from "@pitchlab/contracts";
import { redactDatasetForVisitor } from "./access-guard";
import { groupMatchesByDayAndLeague } from "./club/home/home-model";
import { MatchList } from "./components/MatchList";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";

const row = (market: string, selection: string, label: string, p: number, line?: number) => ({
  market: asMarketKey(market),
  selection,
  label,
  ...(line !== undefined ? { line } : {}),
  p,
  fairOdds: 1 / p,
});

const SAMPLE_DAY1_LMX: MatchAnalysis = {
  id: "ml-story-qro-mty",
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
  projection: { home: 1.41, away: 1.55, total: 2.96 },
  x12: [0.34, 0.26, 0.4],
  marketGroups: [
    { group: "Resultado", rows: [row("h2h", "home", "Querétaro gana", 0.34), row("h2h", "draw", "Empate", 0.26), row("h2h", "away", "Monterrey gana", 0.4)] },
    { group: "Goles totales", rows: [row("totals", "over_2.5", "Más de 2.5", 0.57, 2.5), row("totals", "under_2.5", "Menos de 2.5", 0.43, 2.5)] },
  ],
  counts: {
    corners: { home: 5.4, away: 5.3, total: 10.7, line: 10.5, pOver: 0.52, sample: { home: 12, away: 12 } },
    fouls: { home: 11.8, away: 10.1, total: 21.9, line: 21.5, pOver: 0.54, sample: { home: 12, away: 12 } },
    yellow: { home: 2.1, away: 1.9, total: 4.0, line: 3.5, pOver: 0.58, sample: { home: 12, away: 12 } },
  },
  outcomes: [
    { key: "home", label: "Querétaro gana", probability: 0.34 },
    { key: "draw", label: "Empate", probability: 0.26 },
    { key: "away", label: "Monterrey gana", probability: 0.4 },
  ],
  factors: [],
  trace: [],
  restDays: { home: 6, away: 7 },
};

const SAMPLE_DAY1_PL: MatchAnalysis = {
  id: "ml-story-ars-liv",
  league: asLeagueId("premier-league"),
  leagueLabel: "Premier League",
  sport: "football",
  round: "Jornada 12",
  day: "2030-11-14",
  dayLabel: "sábado, 14 de noviembre",
  kickoffUtc: "2030-11-14T17:30:00Z",
  kickoffLocal: "11:30",
  venue: "Emirates Stadium",
  status: "NS",
  home: { slug: "arsenal", name: "Arsenal", shortName: "Arsenal", code: "ARS", record: "11 PJ · 2.1 goles/p" },
  away: { slug: "liverpool", name: "Liverpool", shortName: "Liverpool", code: "LIV", record: "11 PJ · 2.0 goles/p" },
  projection: { home: 1.65, away: 1.38, total: 3.03 },
  x12: [0.46, 0.25, 0.29],
  marketGroups: [
    { group: "Resultado", rows: [row("h2h", "home", "Arsenal gana", 0.46), row("h2h", "draw", "Empate", 0.25), row("h2h", "away", "Liverpool gana", 0.29)] },
    { group: "Goles totales", rows: [row("totals", "over_2.5", "Más de 2.5", 0.61, 2.5)] },
  ],
  counts: {
    corners: { home: 6.1, away: 5.0, total: 11.1, line: 10.5, pOver: 0.55, sample: { home: 11, away: 11 } },
  },
  outcomes: [
    { key: "home", label: "Arsenal gana", probability: 0.46 },
    { key: "draw", label: "Empate", probability: 0.25 },
    { key: "away", label: "Liverpool gana", probability: 0.29 },
  ],
  factors: [],
  trace: [],
};

const SAMPLE_DAY2_NFL: MatchAnalysis = {
  id: "ml-story-kc-buf",
  league: asLeagueId("nfl"),
  leagueLabel: "NFL",
  sport: "american-football",
  round: "Semana 11",
  day: "2030-11-15",
  dayLabel: "domingo, 15 de noviembre",
  kickoffUtc: "2030-11-15T21:25:00Z",
  kickoffLocal: "15:25",
  venue: "Arrowhead Stadium",
  status: "NS",
  home: { slug: "kansas-city-chiefs", name: "Kansas City Chiefs", shortName: "Chiefs", code: "KC", record: "8G-1P" },
  away: { slug: "buffalo-bills", name: "Buffalo Bills", shortName: "Bills", code: "BUF", record: "7G-2P" },
  projection: { home: 26.8, away: 23.2, total: 50.0 },
  x12: [0.58, 0, 0.42],
  marketGroups: [
    { group: "Ganador", rows: [row("h2h", "home", "Chiefs ganan", 0.58), row("h2h", "away", "Bills ganan", 0.42)] },
    { group: "Total", rows: [row("totals", "over_49.5", "Más de 49.5", 0.52, 49.5)] },
  ],
  outcomes: [
    { key: "home", label: "Chiefs ganan", probability: 0.58 },
    { key: "away", label: "Bills ganan", probability: 0.42 },
  ],
  factors: [],
  trace: [],
};

const DATASET = buildPlatformDataset([
  {
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    season: "Apertura",
    roundLabel: "Jornada 16",
    generatedAt: "2030-11-13T12:00:00Z",
    games: [SAMPLE_DAY1_LMX],
    standings: [],
  },
  {
    league: asLeagueId("premier-league"),
    leagueLabel: "Premier League",
    sport: "football",
    season: "2030/31",
    roundLabel: "Jornada 12",
    generatedAt: "2030-11-13T12:00:00Z",
    games: [SAMPLE_DAY1_PL],
    standings: [],
  },
  {
    league: asLeagueId("nfl"),
    leagueLabel: "NFL",
    sport: "american-football",
    season: "2030",
    roundLabel: "Semana 11",
    generatedAt: "2030-11-13T12:00:00Z",
    games: [SAMPLE_DAY2_NFL],
    standings: [],
  },
]);

const REDACTED = redactDatasetForVisitor(DATASET);
const GROUPS = groupMatchesByDayAndLeague(DATASET.games);
const REDACTED_GROUPS = groupMatchesByDayAndLeague(REDACTED.games);

export default {
  title: "Platform v4 / Lista de partidos",
  parameters: { layout: "fullscreen" },
};

const light = { globals: { theme: "light" } };

export const ListaPorDiaYLigaOscuro = {
  render: () => (
    <PlatformProvider dataset={DATASET} initialRole="member">
      <div className="pl-stage" style={{ padding: 24, maxWidth: 1120, margin: "0 auto" }}>
        <MatchList groups={GROUPS} today="2030-11-14" />
      </div>
    </PlatformProvider>
  ),
};

export const ListaPorDiaYLigaClaro = { ...ListaPorDiaYLigaOscuro, ...light };

export const ListaMovil375Oscuro = {
  render: () => (
    <PlatformProvider dataset={DATASET} initialRole="member">
      <div className="pl-stage" style={{ padding: 12, maxWidth: 375, margin: "0 auto" }}>
        <MatchList groups={GROUPS} today="2030-11-14" />
      </div>
    </PlatformProvider>
  ),
};

export const ListaMovil375Claro = { ...ListaMovil375Oscuro, ...light };

export const ListaVisitanteBloqueado = {
  render: () => (
    <PlatformProvider dataset={REDACTED} initialRole="visitor">
      <div className="pl-stage" style={{ padding: 24, maxWidth: 1120, margin: "0 auto" }}>
        <MatchList groups={REDACTED_GROUPS} today="2030-11-14" />
      </div>
    </PlatformProvider>
  ),
};
