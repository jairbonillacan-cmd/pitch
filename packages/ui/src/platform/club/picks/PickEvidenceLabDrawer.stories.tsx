import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { asLeagueId } from "@pitchlab/contracts";
import { Button } from "../../../components/ui/primitives";
import { EmblemSurfaceProvider } from "../../../sports";
import { redactDatasetForVisitor } from "../../access-guard";
import { useSafeEffect } from "../../hooks";
import type {
  CatalogPickItem,
  PickLabMatchBar,
  PickLabResponsePayload,
} from "../../picks-catalog";
import { PlatformProvider } from "../../platform-provider";
import { STORY_DATASET } from "../../story-fixtures";
import type { PlatformGame } from "../../types";
import {
  PickEvidenceLabDrawer,
  type PickLabCustomSelection,
} from "./PickEvidenceLabDrawer";

const meta = {
  title: "Platform v4 / Picks / PickEvidenceLabDrawer",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const CAPTURED_UTC = "2026-11-21T16:30:00Z";
const LIGA_MX = asLeagueId("liga-mx");
const LA_LIGA = asLeagueId("laliga");

const PUMAS_GAME: PlatformGame = {
  id: "lmx-2026-pumas-monterrey",
  league: LIGA_MX,
  leagueLabel: "Liga MX",
  sport: "football",
  round: "Jornada 17",
  dayId: "2026-11-22",
  dayLabel: "domingo, 22 de noviembre",
  kickoffUtc: "2026-11-23T01:00:00Z",
  kickoffLocal: "19:00",
  venue: "Estadio Olímpico Universitario",
  referee: "César Ramos",
  status: "NS",
  home: {
    slug: "pumas-unam",
    name: "Pumas UNAM",
    shortName: "PUM",
    code: "PUM",
    record: "10G-4E-3P",
  },
  away: {
    slug: "monterrey",
    name: "Monterrey",
    shortName: "MNT",
    code: "MNT",
    record: "11G-3E-3P",
  },
  hasForecast: true,
  x12: [0.41, 0.28, 0.31],
  projection: { home: 1.54, away: 1.32, total: 2.86 },
  goalLine: { line: 2.5, pOver: 0.56 },
  confidenceScore: null,
  confidenceLevel: null,
  picks: [],
  preGame: {
    cortexSynthesis:
      "Pumas promedia volumen alto de centros y tiros de esquina en Ciudad Universitaria ante un Monterrey vertical.",
    tacticalKeys: ["Presión en bloque medio", "Alto volumen por bandas en casa"],
    lineupStatusLabel: "Once probable disponible",
    lineupsConfirmed60m: false,
    absences: [],
    moneyFlow: null,
  },
  markets: [],
  factors: [],
  headToHead: [],
  updatedAtLabel: "Actualizado hace 4 min",
  spacetime: null,
};

const BARCA_GAME: PlatformGame = {
  id: "laliga-2026-barcelona-real-madrid",
  league: LA_LIGA,
  leagueLabel: "LaLiga",
  sport: "football",
  round: "Jornada 14",
  dayId: "2026-11-22",
  dayLabel: "domingo, 22 de noviembre",
  kickoffUtc: "2026-11-22T20:00:00Z",
  kickoffLocal: "14:00",
  venue: "Estadi Olímpic Lluís Companys",
  referee: "Jesús Gil Manzano",
  status: "NS",
  home: {
    slug: "fc-barcelona",
    name: "FC Barcelona",
    shortName: "BAR",
    code: "BAR",
    record: "11G-1E-1P",
  },
  away: {
    slug: "real-madrid",
    name: "Real Madrid",
    shortName: "RMA",
    code: "RMA",
    record: "9G-3E-1P",
  },
  hasForecast: true,
  x12: [0.46, 0.25, 0.29],
  projection: { home: 1.88, away: 1.44, total: 3.32 },
  goalLine: { line: 2.5, pOver: 0.64 },
  confidenceScore: null,
  confidenceLevel: null,
  picks: [],
  preGame: {
    cortexSynthesis:
      "Encuentro de alto ritmo ofensivo con protagonismo por banda derecha en el cuadro azulgrana.",
    tacticalKeys: ["Desborde 1v1 en último tercio", "Transiciones rápidas"],
    lineupStatusLabel: "Once probable disponible",
    lineupsConfirmed60m: false,
    absences: [],
    moneyFlow: null,
  },
  markets: [],
  factors: [],
  headToHead: [],
  updatedAtLabel: "Actualizado hace 5 min",
  spacetime: null,
};

const PUMAS_CORNERS_PICK: CatalogPickItem = {
  id: "pick-pumas-corners-o35",
  gameId: PUMAS_GAME.id,
  league: LIGA_MX,
  leagueLabel: "Liga MX",
  sport: "football",
  matchLabel: "Pumas UNAM vs Monterrey",
  kickoffUtc: PUMAS_GAME.kickoffUtc,
  kickoffLocal: PUMAS_GAME.kickoffLocal,
  gameStatus: "NS",
  family: "corners_team",
  familyLabel: "Córners equipo",
  category: "conteos_arbitro",
  axis: "corners_home",
  selectionKey: "home_over_3.5",
  label: "Pumas UNAM Más de 3.5 córners",
  line: 3.5,
  direction: "over",
  pricing: {
    p: 0.742,
    fairOdds: 1.35,
    fairAmerican: -288,
    marketDecimal: 1.48,
    marketAmerican: -208,
    marketBookLabel: "Bet365",
    marketCapturedAtUtc: CAPTURED_UTC,
    deVigMarketProb: 0.654,
    deVigMethod: "shin",
    overroundPct: 4.6,
    evPct: 9.8,
    edgePts: 6.6,
    noVigEdgePts: 8.8,
    valueLabel: "Valor +9.8 %",
    hasPositiveValue: true,
  },
  evidence: {
    windows: [
      { window: "L5", label: "L5", hits: 5, sample: 5, pushes: 0, ratePct: 100, meanValue: 6.6, tone: "high" },
      { window: "L10", label: "L10", hits: 10, sample: 10, pushes: 0, ratePct: 100, meanValue: 6.9, tone: "high" },
      { window: "home_away", label: "Local", hits: 6, sample: 6, pushes: 0, ratePct: 100, meanValue: 7.4, tone: "high" },
      { window: "h2h", label: "H2H", hits: 4, sample: 5, pushes: 0, ratePct: 80, meanValue: 5.8, tone: "high" },
    ],
    xgSignal: {
      homeXg: 1.54,
      awayXg: 1.32,
      totalXg: 2.86,
      marginXg: 0.22,
      source: "spacetime_v5",
      summary: "Proyección xG 1.54 local vs 1.32 visita (ritmo ofensivo sostenido).",
    },
    refereeSignal: null,
    bullets: [
      { label: "10/10 últimos partidos de Liga MX", ratePct: 100, tone: "high" },
      { label: "6/6 jugando como local en CU", ratePct: 100, tone: "high" },
      { label: "4/5 frente a Monterrey en cruces directos", ratePct: 80, tone: "high" },
    ],
    avgObservedRatePct: 95,
  },
  settlement: "pending",
  engineName: "PitchLab Spacetime v5.1",
  isPrimaryModelPick: true,
  isDerived: false,
  conflictGroup: "independent",
  bookQuotes: [
    {
      book: "bet365",
      bookLabel: "Bet365",
      decimal: 1.48,
      openingDecimal: 1.54,
      movementDirection: "shortening",
      capturedAtUtc: CAPTURED_UTC,
      isBest: true,
    },
    {
      book: "codere",
      bookLabel: "Codere",
      decimal: 1.44,
      openingDecimal: 1.5,
      movementDirection: "shortening",
      capturedAtUtc: CAPTURED_UTC,
    },
  ],
};

const PUMAS_RELATED_CARDS: CatalogPickItem = {
  id: "pick-pumas-cards-u25",
  gameId: PUMAS_GAME.id,
  league: LIGA_MX,
  leagueLabel: "Liga MX",
  sport: "football",
  matchLabel: "Pumas UNAM vs Monterrey",
  kickoffUtc: PUMAS_GAME.kickoffUtc,
  kickoffLocal: PUMAS_GAME.kickoffLocal,
  gameStatus: "NS",
  family: "cards_total",
  familyLabel: "Tarjetas amarillas",
  category: "conteos_arbitro",
  axis: "cards_total",
  selectionKey: "under_2.5",
  label: "Menos de 2.5 tarjetas amarillas",
  line: 2.5,
  direction: "under",
  pricing: {
    p: 0.598,
    fairOdds: 1.67,
    fairAmerican: -149,
    marketDecimal: 1.83,
    marketAmerican: -120,
    marketBookLabel: "Codere",
    marketCapturedAtUtc: CAPTURED_UTC,
    deVigMarketProb: 0.525,
    deVigMethod: "shin",
    overroundPct: 4.8,
    evPct: 9.4,
    edgePts: 5.2,
    noVigEdgePts: 7.3,
    valueLabel: "Valor +9.4 %",
    hasPositiveValue: true,
  },
  evidence: {
    windows: [
      { window: "L5", label: "L5", hits: 4, sample: 5, pushes: 0, ratePct: 80, meanValue: 1.8, tone: "high" },
      { window: "home_away", label: "Local", hits: 5, sample: 6, pushes: 0, ratePct: 83, meanValue: 1.7, tone: "high" },
      { window: "h2h", label: "H2H", hits: 4, sample: 5, pushes: 0, ratePct: 80, meanValue: 2.0, tone: "high" },
    ],
    xgSignal: null,
    refereeSignal: {
      name: "César Ramos",
      matches: 28,
      rawAvgYellow: 4.1,
      shrunkYellowPerGame: 4.2,
      cardsMultiplier: 0.94,
      foulsMultiplier: 0.96,
      rigorTier: "promedio",
      summary: "Árbitro César Ramos promedia 4.2 amarillas por partido (perfil equilibrado).",
    },
    bullets: [
      { label: "5/6 como local en temporada regular", ratePct: 83, tone: "high" },
      { label: "4/5 en los últimos partidos de liga", ratePct: 80, tone: "high" },
    ],
    avgObservedRatePct: 81,
  },
  settlement: "pending",
  engineName: "PitchLab Spacetime v5.1",
  isPrimaryModelPick: false,
  isDerived: false,
  conflictGroup: "independent",
};

const PUMAS_RELATED_CORNERS_55: CatalogPickItem = {
  id: "pick-pumas-corners-o55",
  gameId: PUMAS_GAME.id,
  league: LIGA_MX,
  leagueLabel: "Liga MX",
  sport: "football",
  matchLabel: "Pumas UNAM vs Monterrey",
  kickoffUtc: PUMAS_GAME.kickoffUtc,
  kickoffLocal: PUMAS_GAME.kickoffLocal,
  gameStatus: "NS",
  family: "corners_team",
  familyLabel: "Córners equipo",
  category: "conteos_arbitro",
  axis: "corners_home",
  selectionKey: "home_over_5.5",
  label: "Pumas UNAM Más de 5.5 córners",
  line: 5.5,
  direction: "over",
  pricing: {
    p: 0.562,
    fairOdds: 1.78,
    fairAmerican: -128,
    marketDecimal: 2.02,
    marketAmerican: 102,
    marketBookLabel: "Novibet",
    marketCapturedAtUtc: CAPTURED_UTC,
    deVigMarketProb: 0.478,
    deVigMethod: "proportional",
    overroundPct: 5.1,
    evPct: 13.5,
    edgePts: 6.7,
    noVigEdgePts: 8.4,
    valueLabel: "Valor +13.5 %",
    hasPositiveValue: true,
  },
  evidence: {
    windows: [
      { window: "L10", label: "L10", hits: 8, sample: 10, pushes: 0, ratePct: 80, meanValue: 6.9, tone: "high" },
      { window: "home_away", label: "Local", hits: 5, sample: 6, pushes: 0, ratePct: 83, meanValue: 7.4, tone: "high" },
    ],
    xgSignal: null,
    refereeSignal: null,
    bullets: [
      { label: "8/10 últimos partidos superaron 5.5", ratePct: 80, tone: "high" },
      { label: "5/6 en Estadio Olímpico Universitario", ratePct: 83, tone: "high" },
    ],
    avgObservedRatePct: 82,
  },
  settlement: "pending",
  engineName: "PitchLab Spacetime v5.1",
  isPrimaryModelPick: false,
  isDerived: false,
  conflictGroup: "independent",
};

const PUMAS_RELATED_SOT: CatalogPickItem = {
  id: "pick-pumas-sot-o45",
  gameId: PUMAS_GAME.id,
  league: LIGA_MX,
  leagueLabel: "Liga MX",
  sport: "football",
  matchLabel: "Pumas UNAM vs Monterrey",
  kickoffUtc: PUMAS_GAME.kickoffUtc,
  kickoffLocal: PUMAS_GAME.kickoffLocal,
  gameStatus: "NS",
  family: "shots_on_target",
  familyLabel: "Tiros a puerta",
  category: "conteos_arbitro",
  axis: "sot_total",
  selectionKey: "over_4.5",
  label: "Pumas UNAM Más de 4.5 tiros a puerta",
  line: 4.5,
  direction: "over",
  pricing: {
    p: 0.548,
    fairOdds: 1.82,
    fairAmerican: -121,
    marketDecimal: 1.98,
    marketAmerican: -102,
    marketBookLabel: "Pinnacle",
    marketCapturedAtUtc: CAPTURED_UTC,
    deVigMarketProb: 0.495,
    deVigMethod: "shin",
    overroundPct: 3.1,
    evPct: 8.5,
    edgePts: 4.3,
    noVigEdgePts: 5.3,
    valueLabel: "Valor +8.5 %",
    hasPositiveValue: true,
  },
  evidence: {
    windows: [
      { window: "L5", label: "L5", hits: 4, sample: 5, pushes: 0, ratePct: 80, meanValue: 5.2, tone: "high" },
      { window: "L10", label: "L10", hits: 7, sample: 10, pushes: 0, ratePct: 70, meanValue: 4.9, tone: "high" },
    ],
    xgSignal: null,
    refereeSignal: null,
    bullets: [
      { label: "4/5 últimos partidos con 5+ tiros a puerta", ratePct: 80, tone: "high" },
    ],
    avgObservedRatePct: 75,
  },
  settlement: "pending",
  engineName: "PitchLab Spacetime v5.1",
  isPrimaryModelPick: false,
  isDerived: false,
  conflictGroup: "independent",
};

const PUMAS_CORNERS_BARS_FOR: readonly PickLabMatchBar[] = [
  { id: "pum-1", dateLabel: "25/05", opponentName: "Cruz Azul", opponentShort: "CAZ", opponentSlug: "cruz-azul", leagueLabel: "Liga MX", isHome: true, value: 7, scoreLabel: "2–1", gf: 2, gc: 1 },
  { id: "pum-2", dateLabel: "12/07", opponentName: "Club América", opponentShort: "AME", opponentSlug: "club-america", leagueLabel: "Liga MX", isHome: false, value: 6, scoreLabel: "1–1", gf: 1, gc: 1 },
  { id: "pum-3", dateLabel: "18/07", opponentName: "Pachuca", opponentShort: "PCH", opponentSlug: "pachuca", leagueLabel: "Liga MX", isHome: true, value: 9, scoreLabel: "2–0", gf: 2, gc: 0 },
  { id: "pum-4", dateLabel: "16/08", opponentName: "Querétaro", opponentShort: "QRO", opponentSlug: "queretaro", leagueLabel: "Liga MX", isHome: true, value: 6, scoreLabel: "3–1", gf: 3, gc: 1 },
  { id: "pum-5", dateLabel: "24/08", opponentName: "Necaxa", opponentShort: "NXA", opponentSlug: "necaxa", leagueLabel: "Liga MX", isHome: false, value: 8, scoreLabel: "1–2", gf: 1, gc: 2 },
  { id: "pum-6", dateLabel: "11/09", opponentName: "Club León", opponentShort: "LEO", opponentSlug: "club-leon", leagueLabel: "Liga MX", isHome: true, value: 8, scoreLabel: "2–1", gf: 2, gc: 1 },
  { id: "pum-7", dateLabel: "27/09", opponentName: "Atlético de San Luis", opponentShort: "ASL", opponentSlug: "atletico-san-luis", leagueLabel: "Liga MX", isHome: true, value: 11, scoreLabel: "3–0", gf: 3, gc: 0 },
  { id: "pum-8", dateLabel: "12/10", opponentName: "Cruz Azul", opponentShort: "CAZ", opponentSlug: "cruz-azul", leagueLabel: "Liga MX", isHome: false, value: 4, scoreLabel: "0–2", gf: 0, gc: 2 },
  { id: "pum-9", dateLabel: "25/10", opponentName: "Tigres UANL", opponentShort: "TIG", opponentSlug: "tigres-uanl", leagueLabel: "Liga MX", isHome: true, value: 6, scoreLabel: "1–1", gf: 1, gc: 1 },
  { id: "pum-10", dateLabel: "08/11", opponentName: "Club América", opponentShort: "AME", opponentSlug: "club-america", leagueLabel: "Liga MX", isHome: true, value: 4, scoreLabel: "2–2", gf: 2, gc: 2 },
];

const PUMAS_CORNERS_BARS_AGAINST: readonly PickLabMatchBar[] = [
  { id: "pum-a-1", dateLabel: "25/05", opponentName: "Cruz Azul", opponentShort: "CAZ", opponentSlug: "cruz-azul", leagueLabel: "Liga MX", isHome: true, value: 5, scoreLabel: "2–1", gf: 2, gc: 1 },
  { id: "pum-a-2", dateLabel: "12/07", opponentName: "Club América", opponentShort: "AME", opponentSlug: "club-america", leagueLabel: "Liga MX", isHome: false, value: 7, scoreLabel: "1–1", gf: 1, gc: 1 },
  { id: "pum-a-3", dateLabel: "18/07", opponentName: "Pachuca", opponentShort: "PCH", opponentSlug: "pachuca", leagueLabel: "Liga MX", isHome: true, value: 3, scoreLabel: "2–0", gf: 2, gc: 0 },
  { id: "pum-a-4", dateLabel: "16/08", opponentName: "Querétaro", opponentShort: "QRO", opponentSlug: "queretaro", leagueLabel: "Liga MX", isHome: true, value: 4, scoreLabel: "3–1", gf: 3, gc: 1 },
  { id: "pum-a-5", dateLabel: "24/08", opponentName: "Necaxa", opponentShort: "NXA", opponentSlug: "necaxa", leagueLabel: "Liga MX", isHome: false, value: 6, scoreLabel: "1–2", gf: 1, gc: 2 },
  { id: "pum-a-6", dateLabel: "11/09", opponentName: "Club León", opponentShort: "LEO", opponentSlug: "club-leon", leagueLabel: "Liga MX", isHome: true, value: 2, scoreLabel: "2–1", gf: 2, gc: 1 },
  { id: "pum-a-7", dateLabel: "27/09", opponentName: "Atlético de San Luis", opponentShort: "ASL", opponentSlug: "atletico-san-luis", leagueLabel: "Liga MX", isHome: true, value: 3, scoreLabel: "3–0", gf: 3, gc: 0 },
  { id: "pum-a-8", dateLabel: "12/10", opponentName: "Cruz Azul", opponentShort: "CAZ", opponentSlug: "cruz-azul", leagueLabel: "Liga MX", isHome: false, value: 8, scoreLabel: "0–2", gf: 0, gc: 2 },
  { id: "pum-a-9", dateLabel: "25/10", opponentName: "Tigres UANL", opponentShort: "TIG", opponentSlug: "tigres-uanl", leagueLabel: "Liga MX", isHome: true, value: 5, scoreLabel: "1–1", gf: 1, gc: 1 },
  { id: "pum-a-10", dateLabel: "08/11", opponentName: "Club América", opponentShort: "AME", opponentSlug: "club-america", leagueLabel: "Liga MX", isHome: true, value: 6, scoreLabel: "2–2", gf: 2, gc: 2 },
];

const PUMAS_LAB_PAYLOAD: PickLabResponsePayload = {
  ok: true,
  pick: PUMAS_CORNERS_PICK,
  gameId: PUMAS_GAME.id,
  matchLabel: "Pumas UNAM vs Monterrey",
  league: LIGA_MX,
  leagueLabel: "Liga MX",
  homeTeam: { slug: "pumas-unam", name: "Pumas UNAM", shortName: "PUM" },
  awayTeam: { slug: "monterrey", name: "Monterrey", shortName: "MNT" },
  entityKind: "team",
  entityName: "Pumas UNAM",
  entitySubtitle: "Liga MX · Estadio Olímpico Universitario · 19:00",
  entityPhotoKey: null,
  entityTeamSlug: "pumas-unam",
  metricKey: "corners",
  metricLabel: "Córners",
  defaultLine: 3.5,
  defaultDirection: "over",
  availableLines: [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5, 9.5],
  barsFor: PUMAS_CORNERS_BARS_FOR,
  barsAgainst: PUMAS_CORNERS_BARS_AGAINST,
  recentHistory: [
    { id: "h-1", dateLabel: "08/11", matchLabel: "PUM – AME", scoreLabel: "2–2", gf: 2, gc: 2, result: "D" },
    { id: "h-2", dateLabel: "25/10", matchLabel: "PUM – TIG", scoreLabel: "1–1", gf: 1, gc: 1, result: "D" },
    { id: "h-3", dateLabel: "12/10", matchLabel: "CAZ – PUM", scoreLabel: "2–0", gf: 0, gc: 2, result: "L" },
    { id: "h-4", dateLabel: "27/09", matchLabel: "PUM – ASL", scoreLabel: "3–0", gf: 3, gc: 0, result: "W" },
    { id: "h-5", dateLabel: "11/09", matchLabel: "PUM – LEO", scoreLabel: "2–1", gf: 2, gc: 1, result: "W" },
  ],
  relatedPicks: [PUMAS_RELATED_CARDS, PUMAS_RELATED_CORNERS_55, PUMAS_RELATED_SOT],
};

const YAMAL_SHOTS_PICK: CatalogPickItem = {
  id: "pick-yamal-sot-o15",
  gameId: BARCA_GAME.id,
  league: LA_LIGA,
  leagueLabel: "LaLiga",
  sport: "football",
  matchLabel: "FC Barcelona vs Real Madrid",
  kickoffUtc: BARCA_GAME.kickoffUtc,
  kickoffLocal: BARCA_GAME.kickoffLocal,
  gameStatus: "NS",
  family: "player_props_football",
  familyLabel: "Tiros a puerta (Jugador)",
  category: "player_props",
  axis: "player_prop",
  selectionKey: "lamine_yamal_shots_on_target_over_1.5",
  label: "Lamine Yamal Más de 1.5 tiros a puerta",
  line: 1.5,
  direction: "over",
  pricing: {
    p: 0.564,
    fairOdds: 1.77,
    fairAmerican: -129,
    marketDecimal: 2.05,
    marketAmerican: 105,
    marketBookLabel: "Bet365",
    marketCapturedAtUtc: CAPTURED_UTC,
    deVigMarketProb: 0.471,
    deVigMethod: "shin",
    overroundPct: 4.9,
    evPct: 15.6,
    edgePts: 7.6,
    noVigEdgePts: 9.3,
    valueLabel: "Valor +15.6 %",
    hasPositiveValue: true,
  },
  evidence: {
    windows: [
      { window: "L5", label: "L5", hits: 4, sample: 5, pushes: 0, ratePct: 80, meanValue: 2.2, tone: "high" },
      { window: "L10", label: "L10", hits: 7, sample: 10, pushes: 0, ratePct: 70, meanValue: 1.9, tone: "high" },
      { window: "home_away", label: "Local", hits: 5, sample: 6, pushes: 0, ratePct: 83, meanValue: 2.3, tone: "high" },
    ],
    xgSignal: {
      homeXg: 1.88,
      awayXg: 1.44,
      totalXg: 3.32,
      marginXg: 0.44,
      source: "spacetime_v5",
      summary: "Proyección ofensiva de 1.88 xG para FC Barcelona en casa.",
    },
    refereeSignal: null,
    bullets: [
      { label: "7/10 apariciones ≥ 45 min con 2+ tiros a puerta", ratePct: 70, tone: "high" },
      { label: "5/6 como local en LaLiga y Europa", ratePct: 83, tone: "high" },
    ],
    avgObservedRatePct: 78,
  },
  settlement: "pending",
  engineName: "PitchLab Spacetime v5.1",
  isPrimaryModelPick: true,
  isDerived: false,
  conflictGroup: "independent",
  playerMeta: {
    playerName: "Lamine Yamal",
    playerSlug: "lamine-yamal",
    teamSide: "home",
    teamName: "FC Barcelona",
    position: "FWD",
    statKey: "shots_on_target",
    statLabel: "Tiros a puerta",
    minMinutesGuard: 45,
    qualifyingMatches: 10,
    avgMinutes: 84.5,
    lineupStatus: "probable",
    projectionMean: 1.95,
    projectionSd: 0.92,
    photoKey: null,
    teamSlug: "fc-barcelona",
  },
};

const YAMAL_RELATED_SHOTS: CatalogPickItem = {
  id: "pick-yamal-shots-o35",
  gameId: BARCA_GAME.id,
  league: LA_LIGA,
  leagueLabel: "LaLiga",
  sport: "football",
  matchLabel: "FC Barcelona vs Real Madrid",
  kickoffUtc: BARCA_GAME.kickoffUtc,
  kickoffLocal: BARCA_GAME.kickoffLocal,
  gameStatus: "NS",
  family: "player_props_football",
  familyLabel: "Tiros totales (Jugador)",
  category: "player_props",
  axis: "player_prop",
  selectionKey: "lamine_yamal_shots_over_3.5",
  label: "Lamine Yamal Más de 3.5 tiros",
  line: 3.5,
  direction: "over",
  pricing: {
    p: 0.512,
    fairOdds: 1.95,
    fairAmerican: -105,
    marketDecimal: 2.15,
    marketAmerican: 115,
    marketBookLabel: "Codere",
    marketCapturedAtUtc: CAPTURED_UTC,
    deVigMarketProb: 0.451,
    deVigMethod: "shin",
    overroundPct: 4.5,
    evPct: 10.1,
    edgePts: 4.7,
    noVigEdgePts: 6.1,
    valueLabel: "Valor +10.1 %",
    hasPositiveValue: true,
  },
  evidence: {
    windows: [
      { window: "L5", label: "L5", hits: 3, sample: 5, pushes: 0, ratePct: 60, meanValue: 3.8, tone: "mid" },
      { window: "L10", label: "L10", hits: 6, sample: 10, pushes: 0, ratePct: 60, meanValue: 3.7, tone: "mid" },
    ],
    xgSignal: null,
    refereeSignal: null,
    bullets: [
      { label: "6/10 apariciones ≥ 45 min con 4+ remates", ratePct: 60, tone: "mid" },
    ],
    avgObservedRatePct: 60,
  },
  settlement: "pending",
  engineName: "PitchLab Spacetime v5.1",
  isPrimaryModelPick: false,
  isDerived: false,
  conflictGroup: "independent",
  playerMeta: YAMAL_SHOTS_PICK.playerMeta,
};

const YAMAL_LAB_PAYLOAD: PickLabResponsePayload = {
  ok: true,
  pick: YAMAL_SHOTS_PICK,
  gameId: BARCA_GAME.id,
  matchLabel: "FC Barcelona vs Real Madrid",
  league: LA_LIGA,
  leagueLabel: "LaLiga",
  homeTeam: { slug: "fc-barcelona", name: "FC Barcelona", shortName: "BAR" },
  awayTeam: { slug: "real-madrid", name: "Real Madrid", shortName: "RMA" },
  entityKind: "player",
  entityName: "Lamine Yamal",
  entitySubtitle: "FC Barcelona · FWD · Muestra ≥ 45 min",
  entityPhotoKey: null,
  entityTeamSlug: "fc-barcelona",
  metricKey: "shots_on_target",
  metricLabel: "Tiros a puerta",
  defaultLine: 1.5,
  defaultDirection: "over",
  availableLines: [0.5, 1.5, 2.5, 3.5],
  barsFor: [
    { id: "yam-1", dateLabel: "15/09", opponentName: "Girona", opponentShort: "GIR", opponentSlug: "girona", leagueLabel: "LaLiga", isHome: false, value: 3, minutesPlayed: 90, scoreLabel: "4–1", gf: 4, gc: 1 },
    { id: "yam-2", dateLabel: "22/09", opponentName: "Villarreal", opponentShort: "VIL", opponentSlug: "villarreal", leagueLabel: "LaLiga", isHome: false, value: 2, minutesPlayed: 86, scoreLabel: "5–1", gf: 5, gc: 1 },
    { id: "yam-3", dateLabel: "25/09", opponentName: "Getafe", opponentShort: "GET", opponentSlug: "getafe", leagueLabel: "LaLiga", isHome: true, value: 2, minutesPlayed: 90, scoreLabel: "1–0", gf: 1, gc: 0 },
    { id: "yam-4", dateLabel: "06/10", opponentName: "Alavés", opponentShort: "ALA", opponentSlug: "deportivo-alaves", leagueLabel: "LaLiga", isHome: false, value: 1, minutesPlayed: 67, scoreLabel: "3–0", gf: 3, gc: 0 },
    { id: "yam-5", dateLabel: "20/10", opponentName: "Sevilla", opponentShort: "SEV", opponentSlug: "sevilla", leagueLabel: "LaLiga", isHome: true, value: 1, minutesPlayed: 76, scoreLabel: "5–1", gf: 5, gc: 1 },
    { id: "yam-6", dateLabel: "23/10", opponentName: "Bayern Múnich", opponentShort: "BAY", opponentSlug: "bayern-munich", leagueLabel: "Champions League", isHome: true, value: 2, minutesPlayed: 85, scoreLabel: "4–1", gf: 4, gc: 1 },
    { id: "yam-7", dateLabel: "03/11", opponentName: "Espanyol", opponentShort: "ESP", opponentSlug: "espanyol", leagueLabel: "LaLiga", isHome: true, value: 3, minutesPlayed: 90, scoreLabel: "3–1", gf: 3, gc: 1 },
    { id: "yam-8", dateLabel: "06/11", opponentName: "Estrella Roja", opponentShort: "CZV", opponentSlug: "estrella-roja", leagueLabel: "Champions League", isHome: false, value: 2, minutesPlayed: 90, scoreLabel: "5–2", gf: 5, gc: 2 },
    { id: "yam-9", dateLabel: "10/11", opponentName: "Real Sociedad", opponentShort: "RSO", opponentSlug: "real-sociedad", leagueLabel: "LaLiga", isHome: false, value: 1, minutesPlayed: 79, scoreLabel: "0–1", gf: 0, gc: 1 },
    { id: "yam-10", dateLabel: "17/11", opponentName: "Celta de Vigo", opponentShort: "CEL", opponentSlug: "celta-de-vigo", leagueLabel: "LaLiga", isHome: true, value: 2, minutesPlayed: 90, scoreLabel: "2–1", gf: 2, gc: 1 },
  ],
  barsAgainst: [],
  recentHistory: [
    { id: "bh-1", dateLabel: "17/11", matchLabel: "BAR – CEL", scoreLabel: "2–1", gf: 2, gc: 1, result: "W" },
    { id: "bh-2", dateLabel: "10/11", matchLabel: "RSO – BAR", scoreLabel: "1–0", gf: 0, gc: 1, result: "L" },
    { id: "bh-3", dateLabel: "06/11", matchLabel: "CZV – BAR", scoreLabel: "2–5", gf: 5, gc: 2, result: "W" },
    { id: "bh-4", dateLabel: "03/11", matchLabel: "BAR – ESP", scoreLabel: "3–1", gf: 3, gc: 1, result: "W" },
    { id: "bh-5", dateLabel: "23/10", matchLabel: "BAR – BAY", scoreLabel: "4–1", gf: 4, gc: 1, result: "W" },
  ],
  relatedPicks: [YAMAL_RELATED_SHOTS],
};

const FALLBACK_LAB_PAYLOAD: PickLabResponsePayload = {
  ok: true,
  pick: PUMAS_RELATED_CARDS,
  gameId: PUMAS_GAME.id,
  matchLabel: "Pumas UNAM vs Monterrey",
  league: LIGA_MX,
  leagueLabel: "Liga MX",
  homeTeam: { slug: "pumas-unam", name: "Pumas UNAM", shortName: "PUM" },
  awayTeam: { slug: "monterrey", name: "Monterrey", shortName: "MNT" },
  entityKind: "team",
  entityName: "Pumas UNAM",
  entitySubtitle: "Liga MX · Respaldo honesto sin serie barra a barra",
  entityPhotoKey: null,
  entityTeamSlug: "pumas-unam",
  metricKey: "cards",
  metricLabel: "Tarjetas amarillas",
  defaultLine: 2.5,
  defaultDirection: "under",
  availableLines: [0.5, 1.5, 2.5, 3.5, 4.5],
  barsFor: [],
  barsAgainst: [],
  recentHistory: [],
  relatedPicks: [PUMAS_CORNERS_PICK, PUMAS_RELATED_CORNERS_55],
};

function PickLabStoryHarness({
  initialPayload,
  game,
  caption,
}: {
  readonly initialPayload: PickLabResponsePayload;
  readonly game: PlatformGame;
  readonly caption: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(true);
  const [activePick, setActivePick] = useState<CatalogPickItem>(initialPayload.pick);
  const [statusNote, setStatusNote] = useState<string>("");

  const activePayload: PickLabResponsePayload =
    activePick.id === initialPayload.pick.id
      ? initialPayload
      : {
          ...initialPayload,
          pick: activePick,
          defaultLine: activePick.line ?? initialPayload.defaultLine,
          defaultDirection: activePick.direction === "under" ? "under" : "over",
          relatedPicks: [
            initialPayload.pick,
            ...initialPayload.relatedPicks.filter((p) => p.id !== activePick.id),
          ],
        };

  return (
    <EmblemSurfaceProvider surface="public">
      <div className="pl-stage" style={{ minHeight: "100vh", padding: 24 }}>
        <div
          className="pl-sf-card"
          style={{ maxWidth: 560 }}
        >
          <header className="pl-sf-card-head">
            <h1 className="pl-sf-card-title">{caption}</h1>
          </header>
          <div className="pl-sf-card-body flex flex-col gap-3">
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
              Inspecciona filtros, gráfica interactiva de barras, línea punteada, Arma tu pick,
              Más picks con Expandir estadísticas e Historial reciente.
            </p>
            {statusNote ? (
              <p className="m-0 text-xs font-bold" style={{ color: "var(--pl-brand)" }}>
                {statusNote}
              </p>
            ) : null}
            <div>
              <Button variant="primary" size="default" onClick={() => setOpen(true)}>
                Abrir Bet Lab
              </Button>
            </div>
          </div>
        </div>

        <PickEvidenceLabDrawer
          open={open}
          pick={activePick}
          game={game}
          relatedPicks={activePayload.relatedPicks}
          labDataOverride={activePayload}
          onClose={() => setOpen(false)}
          onSelectRelatedPick={(next) => {
            setActivePick(next);
            setStatusNote(`Pick activo cambiado a: ${next.label}`);
          }}
          onAddToParlay={(selected) => {
            setStatusNote(`Agregado a Parlay: ${selected.label}`);
          }}
          onSealPick={(selected, customSpec?: PickLabCustomSelection) => {
            setStatusNote(
              customSpec
                ? `Sellado personalizado: ${customSpec.label}`
                : `Sellado desde catálogo: ${selected.label}`,
            );
          }}
        />
      </div>
    </EmblemSurfaceProvider>
  );
}

export const FutbolEquipoCorners: Story = {
  globals: { theme: "dark" },
  render: () => (
    <PickLabStoryHarness
      initialPayload={PUMAS_LAB_PAYLOAD}
      game={PUMAS_GAME}
      caption="Bet Lab · Pumas UNAM Córners (Liga MX · Oscuro)"
    />
  ),
};

export const FutbolEquipoCornersClaro: Story = {
  globals: { theme: "light" },
  render: () => (
    <PickLabStoryHarness
      initialPayload={PUMAS_LAB_PAYLOAD}
      game={PUMAS_GAME}
      caption="Bet Lab · Pumas UNAM Córners (Liga MX · Claro)"
    />
  ),
};

export const FutbolJugadorTiros: Story = {
  globals: { theme: "dark" },
  render: () => (
    <PickLabStoryHarness
      initialPayload={YAMAL_LAB_PAYLOAD}
      game={BARCA_GAME}
      caption="Bet Lab · Lamine Yamal Tiros a puerta (LaLiga · Oscuro)"
    />
  ),
};

export const FutbolJugadorTirosClaro: Story = {
  globals: { theme: "light" },
  render: () => (
    <PickLabStoryHarness
      initialPayload={YAMAL_LAB_PAYLOAD}
      game={BARCA_GAME}
      caption="Bet Lab · Lamine Yamal Tiros a puerta (LaLiga · Claro)"
    />
  ),
};

export const SinSerieRespaldo: Story = {
  globals: { theme: "dark" },
  render: () => (
    <PickLabStoryHarness
      initialPayload={FALLBACK_LAB_PAYLOAD}
      game={PUMAS_GAME}
      caption="Bet Lab · Respaldo honesto sin serie barra a barra (Oscuro)"
    />
  ),
};

export const SinSerieRespaldoClaro: Story = {
  globals: { theme: "light" },
  render: () => (
    <PickLabStoryHarness
      initialPayload={FALLBACK_LAB_PAYLOAD}
      game={PUMAS_GAME}
      caption="Bet Lab · Respaldo honesto sin serie barra a barra (Claro)"
    />
  ),
};

const VISITOR_REDACTED_DATASET = redactDatasetForVisitor(STORY_DATASET);

const EMPTY_EVIDENCE_PICK: CatalogPickItem = {
  ...PUMAS_CORNERS_PICK,
  id: "pick-lab-empty-evidence",
  label: "Pumas UNAM Más de 4.5 córners",
  line: 4.5,
  pricing: {
    ...PUMAS_CORNERS_PICK.pricing,
    marketDecimal: null,
    marketAmerican: null,
    marketBookLabel: null,
    marketCapturedAtUtc: null,
    deVigMarketProb: null,
    deVigMethod: "none",
    overroundPct: null,
    evPct: null,
    edgePts: null,
    noVigEdgePts: null,
    valueLabel: null,
    hasPositiveValue: false,
  },
  evidence: {
    windows: [],
    xgSignal: null,
    refereeSignal: null,
    bullets: [],
    avgObservedRatePct: null,
  },
  bookQuotes: [],
};

const EMPTY_EVIDENCE_PAYLOAD: PickLabResponsePayload = {
  ...FALLBACK_LAB_PAYLOAD,
  pick: EMPTY_EVIDENCE_PICK,
  entitySubtitle: "Liga MX · Sin muestra histórica ni picks relacionados",
  defaultLine: 4.5,
  defaultDirection: "over",
  barsFor: [],
  barsAgainst: [],
  recentHistory: [],
  relatedPicks: [],
};

const LOADING_LAB_PICK: CatalogPickItem = {
  ...PUMAS_CORNERS_PICK,
  id: "pick-lab-loading-series",
};

const ERROR_LAB_PICK: CatalogPickItem = {
  ...PUMAS_CORNERS_PICK,
  id: "pick-lab-error-series",
};

const VISITOR_REDACTED_PICK: CatalogPickItem = {
  ...EMPTY_EVIDENCE_PICK,
  id: "pick-lab-visitor-redacted",
  label: "Selección reservada Pase PitchLab Ultra",
  isRedacted: true,
};

const VISITOR_LAB_PAYLOAD: PickLabResponsePayload = {
  ...EMPTY_EVIDENCE_PAYLOAD,
  pick: VISITOR_REDACTED_PICK,
  entitySubtitle: "Liga MX · Acceso limitado visitante Cero-Fuga",
};

function PickLabFetchMock({
  pickId,
  mode,
  children,
}: {
  readonly pickId: string;
  readonly mode: "pending" | "error";
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const [ready, setReady] = useState(false);

  useSafeEffect(() => {
    const originalFetch = window.fetch;
    const targetPath = `/api/picks/lab/${encodeURIComponent(pickId)}`;
    const interceptedFetch: typeof window.fetch = (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes(targetPath)) {
        if (mode === "pending") {
          return new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            if (signal?.aborted) {
              reject(new DOMException("Aborted", "AbortError"));
              return;
            }
            signal?.addEventListener(
              "abort",
              () => {
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          });
        }
        return new Promise<Response>((resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          const timerId = window.setTimeout(() => {
            resolve(
              new Response(
                JSON.stringify({ ok: false, error: "Servicio de laboratorio temporalmente no disponible." }),
                {
                  status: 503,
                  headers: { "content-type": "application/json" },
                },
              ),
            );
          }, 45);
          signal?.addEventListener(
            "abort",
            () => {
              window.clearTimeout(timerId);
              reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
          );
        });
      }
      return originalFetch.call(window, input, init);
    };

    window.fetch = interceptedFetch;
    setReady(true);

    return () => {
      window.fetch = originalFetch;
    };
  }, [mode, pickId]);

  return ready ? <>{children}</> : <></>;
}

function PickLabRemoteHarness({
  pick,
  game,
  caption,
}: {
  readonly pick: CatalogPickItem;
  readonly game: PlatformGame;
  readonly caption: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(true);
  return (
    <EmblemSurfaceProvider surface="app">
      <div className="pl-stage" style={{ minHeight: "100vh", padding: 24 }}>
        <div className="pl-sf-card" style={{ maxWidth: 560 }}>
          <header className="pl-sf-card-head">
            <h1 className="pl-sf-card-title">{caption}</h1>
          </header>
          <div className="pl-sf-card-body">
            <Button variant="primary" size="default" onClick={() => setOpen(true)}>
              Abrir Bet Lab
            </Button>
          </div>
        </div>
        <PickEvidenceLabDrawer
          open={open}
          pick={pick}
          game={game}
          relatedPicks={[]}
          onClose={() => setOpen(false)}
          onAddToParlay={() => undefined}
          onSealPick={() => undefined}
        />
      </div>
    </EmblemSurfaceProvider>
  );
}

function PickLabVisitorHarness({
  caption,
}: {
  readonly caption: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(true);
  return (
    <EmblemSurfaceProvider surface="public">
      <PlatformProvider dataset={VISITOR_REDACTED_DATASET} initialRole="visitor">
        <div className="pl-stage" style={{ minHeight: "100vh", padding: 24 }}>
          <div className="pl-sf-card" style={{ maxWidth: 560 }}>
            <header className="pl-sf-card-head">
              <h1 className="pl-sf-card-title">{caption}</h1>
            </header>
            <div className="pl-sf-card-body">
              <Button variant="primary" size="default" onClick={() => setOpen(true)}>
                Abrir Bet Lab
              </Button>
            </div>
          </div>
          <PickEvidenceLabDrawer
            open={open}
            pick={VISITOR_REDACTED_PICK}
            game={PUMAS_GAME}
            relatedPicks={[]}
            labDataOverride={VISITOR_LAB_PAYLOAD}
            onClose={() => setOpen(false)}
          />
        </div>
      </PlatformProvider>
    </EmblemSurfaceProvider>
  );
}

export const EstadoVacioOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <PickLabStoryHarness
      initialPayload={EMPTY_EVIDENCE_PAYLOAD}
      game={PUMAS_GAME}
      caption="Bet Lab · Estado vacío sin evidencia ni relacionados (Oscuro)"
    />
  ),
};

export const EstadoVacioClaro: Story = {
  globals: { theme: "light" },
  render: () => (
    <PickLabStoryHarness
      initialPayload={EMPTY_EVIDENCE_PAYLOAD}
      game={PUMAS_GAME}
      caption="Bet Lab · Estado vacío sin evidencia ni relacionados (Claro)"
    />
  ),
};

export const CargandoSerieOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <PickLabFetchMock pickId={LOADING_LAB_PICK.id} mode="pending">
      <PickLabRemoteHarness
        pick={LOADING_LAB_PICK}
        game={PUMAS_GAME}
        caption="Bet Lab · Cargando serie histórica (Oscuro)"
      />
    </PickLabFetchMock>
  ),
};

export const CargandoSerieClaro: Story = {
  globals: { theme: "light" },
  render: () => (
    <PickLabFetchMock pickId={LOADING_LAB_PICK.id} mode="pending">
      <PickLabRemoteHarness
        pick={LOADING_LAB_PICK}
        game={PUMAS_GAME}
        caption="Bet Lab · Cargando serie histórica (Claro)"
      />
    </PickLabFetchMock>
  ),
};

export const ErrorHonestoOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <PickLabFetchMock pickId={ERROR_LAB_PICK.id} mode="error">
      <PickLabRemoteHarness
        pick={ERROR_LAB_PICK}
        game={PUMAS_GAME}
        caption="Bet Lab · Error honesto al cargar serie (Oscuro)"
      />
    </PickLabFetchMock>
  ),
};

export const ErrorHonestoClaro: Story = {
  globals: { theme: "light" },
  render: () => (
    <PickLabFetchMock pickId={ERROR_LAB_PICK.id} mode="error">
      <PickLabRemoteHarness
        pick={ERROR_LAB_PICK}
        game={PUMAS_GAME}
        caption="Bet Lab · Error honesto al cargar serie (Claro)"
      />
    </PickLabFetchMock>
  ),
};

export const VisitanteCeroFugaOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <PickLabVisitorHarness caption="Bet Lab · Visitante Cero-Fuga (Oscuro)" />
  ),
};

export const VisitanteCeroFugaClaro: Story = {
  globals: { theme: "light" },
  render: () => (
    <PickLabVisitorHarness caption="Bet Lab · Visitante Cero-Fuga (Claro)" />
  ),
};

export const MovilOscuro: Story = {
  globals: { theme: "dark" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <PickLabStoryHarness
      initialPayload={PUMAS_LAB_PAYLOAD}
      game={PUMAS_GAME}
      caption="Bet Lab · Móvil 375px (Oscuro)"
    />
  ),
};

export const MovilClaro: Story = {
  globals: { theme: "light" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <PickLabStoryHarness
      initialPayload={PUMAS_LAB_PAYLOAD}
      game={PUMAS_GAME}
      caption="Bet Lab · Móvil 375px (Claro)"
    />
  ),
};
