import React from "react";
import type { Meta } from "@storybook/react-vite";
import type { PublicMemberProfile } from "@pitchlab/contracts";
import { AnalystProfileClubView } from "./club/AnalystProfileClubView";
import { BitacoraClubView, type BitacoraClubViewProps } from "./club/BitacoraClubView";
import { HistorialClubView } from "./club/HistorialClubView";
import {
  RecordPicksTab,
  type LiveTrackedPickSnapshot,
} from "./club/record/RecordPicksTab";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";
import {
  DEFAULT_RECORD_PRIVACY,
  computeRecordStats,
  normalizeRecordPrivacy,
  publicRecordView,
  type RecordEntry,
} from "./record-stats";
import type { JournalEntry } from "./types";

const meta = {
  title: "PitchLab v4 / Mi récord",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;

const dataset = buildPlatformDataset([]);

const SAMPLE_ENTRIES: RecordEntry[] = [
  {
    status: "won",
    units: 1.5,
    userDecimal: 2.05,
    fairDecimal: 1.9,
    clvPct: 3.2,
    leagueLabel: "Liga MX",
    pickLabel: "América gana",
    origin: "Spacetime Suite",
    sealedAtIso: "2026-10-12T18:00:00Z",
    settledAtIso: "2026-10-12T22:00:00Z",
  },
  {
    status: "lost",
    units: 1,
    userDecimal: 1.92,
    fairDecimal: 1.85,
    clvPct: 1.4,
    leagueLabel: "NFL",
    pickLabel: "KC -3.5",
    origin: "Spacetime Suite",
    sealedAtIso: "2026-10-20T17:00:00Z",
    settledAtIso: "2026-10-20T21:00:00Z",
  },
  {
    status: "won",
    units: 2,
    userDecimal: 2.6,
    fairDecimal: 2.4,
    clvPct: 4.1,
    leagueLabel: "Premier League",
    pickLabel: "Arsenal gana + Más de 2.5 goles",
    origin: "Parlay Combinado",
    sealedAtIso: "2026-11-04T15:00:00Z",
    settledAtIso: "2026-11-04T19:00:00Z",
  },
];

const member: PublicMemberProfile = {
  displayName: "Ana López",
  handle: "ana_analiza",
  bio: "Registro todos mis picks antes del arranque.",
  avatarUrl: null,
  xUsername: null,
  joinedAt: "2026-09-10T12:00:00Z",
  isTipster: false,
};

const sharedStats = computeRecordStats(SAMPLE_ENTRIES, 20);
const sharedPrivacy = normalizeRecordPrivacy({
  ...DEFAULT_RECORD_PRIVACY,
  bank: { enabled: true, fields: { netUnits: true, curve: true } },
});
const sharedPayload = {
  hidden: false as const,
  settled: sharedStats.settled,
  view: publicRecordView(sharedStats, SAMPLE_ENTRIES, sharedPrivacy),
};

function RecordStory(props: BitacoraClubViewProps): React.JSX.Element {
  return (
    <PlatformProvider dataset={dataset} initialRole="member">
      <BitacoraClubView {...props} />
    </PlatformProvider>
  );
}

export const PicksOscuro = {
  globals: { theme: "dark" },
  render: () => <RecordStory initialTab="picks" />,
};

export const PicksClaro = {
  globals: { theme: "light" },
  render: () => <RecordStory initialTab="picks" />,
};

export const BancaYEstadisticasOscuro = {
  globals: { theme: "dark" },
  render: () => (
    <RecordStory
      initialTab="banca"
      storyPrefs={{ bankrollStartMxn: 5000, unitMxn: 250, showMxnBalance: true }}
    />
  ),
};

export const BancaYEstadisticasClaro = {
  globals: { theme: "light" },
  render: () => (
    <RecordStory
      initialTab="banca"
      storyPrefs={{ bankrollStartMxn: 5000, unitMxn: 250, showMxnBalance: true }}
    />
  ),
};

export const PrivacidadConVistaPreviaOscuro = {
  globals: { theme: "dark" },
  render: () => <RecordStory initialTab="privacidad" />,
};

export const PrivacidadConVistaPreviaClaro = {
  globals: { theme: "light" },
  render: () => <RecordStory initialTab="privacidad" />,
};

export const HistorialResultadosOscuro = {
  globals: { theme: "dark" },
  render: () => (
    <PlatformProvider dataset={dataset} initialRole="member">
      <HistorialClubView />
    </PlatformProvider>
  ),
};

export const HistorialResultadosClaro = {
  globals: { theme: "light" },
  render: () => (
    <PlatformProvider dataset={dataset} initialRole="member">
      <HistorialClubView />
    </PlatformProvider>
  ),
};

export const RecordPublicoCompartidoOscuro = {
  globals: { theme: "dark" },
  render: () => (
    <PlatformProvider dataset={dataset} initialRole="member">
      <AnalystProfileClubView
        handle={member.handle}
        memberProfile={member}
        publicRecord={sharedPayload}
      />
    </PlatformProvider>
  ),
};

export const RecordPublicoCompartidoClaro = {
  globals: { theme: "light" },
  render: () => (
    <PlatformProvider dataset={dataset} initialRole="member">
      <AnalystProfileClubView
        handle={member.handle}
        memberProfile={member}
        publicRecord={sharedPayload}
      />
    </PlatformProvider>
  ),
};

export const RecordPublicoPrivadoOscuro = {
  globals: { theme: "dark" },
  render: () => (
    <PlatformProvider dataset={dataset} initialRole="member">
      <AnalystProfileClubView
        handle={member.handle}
        memberProfile={member}
        publicRecord={{ hidden: true }}
      />
    </PlatformProvider>
  ),
};

export const RecordPublicoPrivadoClaro = {
  globals: { theme: "light" },
  render: () => (
    <PlatformProvider dataset={dataset} initialRole="member">
      <AnalystProfileClubView
        handle={member.handle}
        memberProfile={member}
        publicRecord={{ hidden: true }}
      />
    </PlatformProvider>
  ),
};

const PARLAY_SAMPLE_JOURNAL: JournalEntry[] = [
  {
    id: "story-single-1",
    pickId: "p-1",
    gameId: "g-1",
    leagueLabel: "Liga MX",
    matchLabel: "América vs Cruz Azul",
    pickLabel: "América gana",
    origin: "Spacetime Suite",
    units: 1.5,
    userDecimal: 2.05,
    fairDecimal: 1.9,
    clvPct: 3.2,
    status: "won",
    pickKind: "single",
    sealedAt: "20 nov, 12:00",
  },
  {
    id: "story-live-1",
    pickId: "p-live-1",
    gameId: "g-live-1",
    leagueLabel: "Premier League",
    matchLabel: "Liverpool vs Manchester City",
    pickLabel: "Más de 2.5 goles",
    origin: "Spacetime Suite",
    units: 1.25,
    userDecimal: 1.94,
    fairDecimal: 1.82,
    clvPct: 2.9,
    status: "pending",
    pickKind: "single",
    sealedAt: "21 nov, 13:30",
  },
  {
    id: "story-parlay-1",
    pickId: "parlay:p-1+p-2+p-3",
    gameId: "g-1",
    leagueLabel: "Combinada Multi-Liga",
    matchLabel: "3 selecciones",
    pickLabel: "América gana + Más de 2.5 goles + Arsenal o Empate",
    origin: "Parlay Combinado",
    units: 1,
    userDecimal: 4.5,
    fairDecimal: 4.1,
    clvPct: 2.1,
    status: "pending",
    pickKind: "parlay",
    parlayLegs: [
      {
        pickId: "p-1",
        gameId: "g-1",
        leagueLabel: "Liga MX",
        matchLabel: "América vs Cruz Azul",
        pickLabel: "América gana",
        market: "1x2",
        selection: "home",
        line: null,
        p: 0.56,
        fairDecimal: 1.79,
      },
      {
        pickId: "p-2",
        gameId: "g-2",
        leagueLabel: "Premier League",
        matchLabel: "Arsenal vs Chelsea",
        pickLabel: "Más de 2.5 goles",
        market: "totals",
        selection: "over",
        line: 2.5,
        p: 0.61,
        fairDecimal: 1.64,
      },
      {
        pickId: "p-3",
        gameId: "g-3",
        leagueLabel: "LaLiga",
        matchLabel: "Real Madrid vs Sevilla",
        pickLabel: "Real Madrid o Empate",
        market: "double_chance",
        selection: "1X",
        line: null,
        p: 0.78,
        fairDecimal: 1.28,
      },
    ],
    parlayLegResults: [
      {
        gameId: "g-1",
        pickId: "p-1",
        status: "won",
        homeScore: 2,
        awayScore: 1,
        settledAt: "2026-11-20T21:00:00Z",
      },
    ],
    sealedAt: "20 nov, 12:15",
  },
];

const LIVE_TRACKED_FIXTURES: readonly LiveTrackedPickSnapshot[] = [
  {
    id: "story-live-1",
    pickId: "p-live-1",
    gameId: "g-live-1",
    pickKind: "single",
    phase: "live",
    matchLabel: "Liverpool 2–0 Manchester City",
    pickLabel: "Más de 2.5 goles",
    href: "/app/premier-league",
    clockLabel: "64'",
    actualValue: 2,
    targetLine: 2.5,
    unitLabel: "goles",
    direction: "over",
    projectedFinal: 2.85,
    asianState: null,
    starterAlert: null,
    starterAlertDetail: null,
    legs: [],
  },
  {
    id: "story-live-ah",
    pickId: "p-live-ah",
    gameId: "g-live-2",
    pickKind: "single",
    phase: "live",
    matchLabel: "Monterrey 1–1 Tigres",
    pickLabel: "Monterrey -0.25 Hándicap Asiático",
    href: "/app/liga-mx",
    clockLabel: "72'",
    actualValue: 0,
    targetLine: -0.25,
    unitLabel: "dif.",
    direction: "handicap",
    projectedFinal: 0.2,
    asianState: "lost_half",
    starterAlert: "titular_en_banca",
    starterAlertDetail: "Germán Berterame figura en la banca del XI confirmado.",
    legs: [],
  },
];

export const ParlaysPiernaPorPiernaOscuro = {
  globals: { theme: "dark" },
  render: () => (
    <PlatformProvider dataset={dataset} initialRole="member">
      <div className="p-6 max-w-5xl mx-auto">
        <RecordPicksTab
          journal={PARLAY_SAMPLE_JOURNAL}
          oddsFormat="decimal"
          watchedGames={[]}
          suggestedUpcoming={[]}
          onToggleWatchlist={() => undefined}
          onNavigateHome={() => undefined}
          onOpenWinningEntry={() => undefined}
          onOpenShareTicket={() => undefined}
          overrideLiveTrackedPicks={LIVE_TRACKED_FIXTURES}
        />
      </div>
    </PlatformProvider>
  ),
};

export const ParlaysPiernaPorPiernaClaro = {
  ...ParlaysPiernaPorPiernaOscuro,
  globals: { theme: "light" },
};
