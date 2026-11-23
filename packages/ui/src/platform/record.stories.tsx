import React, { useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { PublicMemberProfile } from "@pitchlab/contracts";
import { EmblemSurfaceProvider } from "../sports";
import { redactDatasetForVisitor } from "./access-guard";
import { AnalystProfileClubView } from "./club/AnalystProfileClubView";
import { BitacoraClubView, type BitacoraClubViewProps } from "./club/BitacoraClubView";
import { HistorialClubView } from "./club/HistorialClubView";
import {
  RecordPicksTab,
  type LiveTrackedPickSnapshot,
} from "./club/record/RecordPicksTab";
import { useSafeEffect } from "./hooks";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider } from "./platform-provider";
import {
  DEFAULT_RECORD_PRIVACY,
  computeRecordStats,
  normalizeRecordPrivacy,
  publicRecordView,
  type RecordEntry,
} from "./record-stats";
import { STORY_DATASET } from "./story-fixtures";
import type { JournalEntry } from "./types";

const meta = {
  title: "PitchLab v4 / Mi récord",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

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

const VISITOR_RECORD_DATASET = redactDatasetForVisitor(STORY_DATASET);

const SEALED_THREE_LEG_JOURNAL: JournalEntry[] = [
  {
    id: "story-parlay-3legs",
    pickId: "parlay:lmx-ame+epl-o25+nba-bos",
    gameId: "lmx-ame-tig",
    leagueLabel: "Combinada Multi-Liga",
    matchLabel: "3 selecciones",
    pickLabel: "América gana + Más de 2.5 goles + Celtics gana",
    origin: "Parlay Combinado",
    units: 1.5,
    userDecimal: 4.82,
    fairDecimal: 4.35,
    closingDecimal: 4.5,
    clvPct: 3.8,
    status: "won",
    pickKind: "parlay",
    parlayLegs: [
      {
        pickId: "lmx-ame-1x2",
        gameId: "lmx-ame-tig",
        leagueLabel: "Liga MX",
        matchLabel: "América vs Tigres",
        pickLabel: "América gana",
        market: "1x2",
        selection: "home",
        line: null,
        p: 0.584,
        fairDecimal: 1.71,
      },
      {
        pickId: "epl-ars-o25",
        gameId: "epl-ars-liv",
        leagueLabel: "Premier League",
        matchLabel: "Arsenal vs Liverpool",
        pickLabel: "Más de 2.5 goles",
        market: "totals",
        selection: "over",
        line: 2.5,
        p: 0.612,
        fairDecimal: 1.63,
      },
      {
        pickId: "nba-bos-ml",
        gameId: "nba-bos-mia",
        leagueLabel: "NBA",
        matchLabel: "Celtics vs Heat",
        pickLabel: "Celtics gana",
        market: "nba_moneyline",
        selection: "home",
        line: null,
        p: 0.682,
        fairDecimal: 1.47,
      },
    ],
    parlayLegResults: [
      {
        gameId: "lmx-ame-tig",
        pickId: "lmx-ame-1x2",
        status: "won",
        homeScore: 2,
        awayScore: 1,
        closingDecimal: 1.76,
        clvPct: 2.9,
        settledAt: "2026-11-20T05:00:00Z",
      },
      {
        gameId: "epl-ars-liv",
        pickId: "epl-ars-o25",
        status: "won",
        homeScore: 2,
        awayScore: 2,
        closingDecimal: 1.68,
        clvPct: 3.1,
        settledAt: "2026-11-20T18:30:00Z",
      },
      {
        gameId: "nba-bos-mia",
        pickId: "nba-bos-ml",
        status: "won",
        homeScore: 118,
        awayScore: 106,
        closingDecimal: 1.51,
        clvPct: 2.4,
        settledAt: "2026-11-21T03:00:00Z",
      },
    ],
    sealedAt: "19 nov, 16:40",
    sealedAtIso: "2026-11-19T22:40:00Z",
    settledAtIso: "2026-11-21T03:00:00Z",
    note: "Sellado 4 horas antes de la apertura de línea en Caliente.",
  },
  {
    id: "story-single-won-edge",
    pickId: "p-single-won",
    gameId: "lmx-caz-mty",
    leagueLabel: "Liga MX",
    matchLabel: "Cruz Azul vs Monterrey",
    pickLabel: "Cruz Azul gana",
    origin: "Spacetime Suite",
    units: 1.25,
    userDecimal: 1.88,
    fairDecimal: 1.74,
    closingDecimal: 1.78,
    clvPct: 2.7,
    status: "won",
    pickKind: "single",
    sealedAt: "18 nov, 14:20",
    sealedAtIso: "2026-11-18T20:20:00Z",
    settledAtIso: "2026-11-19T05:00:00Z",
  },
  {
    id: "story-single-lost-edge",
    pickId: "p-single-lost",
    gameId: "nfl-kc-buf",
    leagueLabel: "NFL",
    matchLabel: "Chiefs vs Bills",
    pickLabel: "Chiefs -3.5 puntos",
    origin: "Spacetime Suite",
    units: 1,
    userDecimal: 1.95,
    fairDecimal: 1.87,
    closingDecimal: 1.91,
    clvPct: 1.1,
    status: "lost",
    pickKind: "single",
    sealedAt: "17 nov, 11:10",
    sealedAtIso: "2026-11-17T17:10:00Z",
    settledAtIso: "2026-11-18T00:15:00Z",
  },
  {
    id: "story-single-push-edge",
    pickId: "p-single-push",
    gameId: "epl-ars-liv",
    leagueLabel: "Premier League",
    matchLabel: "Arsenal vs Liverpool",
    pickLabel: "Más de 2.0 goles (Línea asiática)",
    origin: "Spacetime Suite",
    units: 1,
    userDecimal: 1.84,
    fairDecimal: 1.78,
    status: "void",
    pickKind: "single",
    sealedAt: "16 nov, 15:05",
    sealedAtIso: "2026-11-16T21:05:00Z",
    settledAtIso: "2026-11-16T23:30:00Z",
  },
  {
    id: "story-single-pending-edge",
    pickId: "p-single-pending",
    gameId: "lmx-ame-tig",
    leagueLabel: "Liga MX",
    matchLabel: "América vs Tigres",
    pickLabel: "Más de 9.5 córners",
    origin: "Spacetime Suite",
    units: 1,
    userDecimal: 1.9,
    fairDecimal: 1.77,
    status: "pending",
    pickKind: "single",
    sealedAt: "21 nov, 11:30",
    sealedAtIso: "2026-11-21T17:30:00Z",
  },
];

const SINGLES_ONLY_JOURNAL: JournalEntry[] = SEALED_THREE_LEG_JOURNAL.filter(
  (entry) => entry.pickKind !== "parlay",
);

function RecordDomAutoClick({
  selector,
  children,
}: {
  readonly selector: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useSafeEffect(() => {
    const root = hostRef.current;
    if (!root) return undefined;
    const timerId = window.setTimeout(() => {
      const target = root.querySelector<HTMLButtonElement>(selector);
      target?.click();
    }, 35);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [selector]);

  return <div ref={hostRef}>{children}</div>;
}

export const ParlaySelladoTresPiernasOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <EmblemSurfaceProvider surface="app">
      <PlatformProvider dataset={STORY_DATASET} initialRole="member">
        <div className="p-6 max-w-5xl mx-auto">
          <RecordDomAutoClick selector='[data-parlay-legs-toggle="story-parlay-3legs"]'>
            <RecordPicksTab
              journal={SEALED_THREE_LEG_JOURNAL}
              oddsFormat="decimal"
              watchedGames={[]}
              suggestedUpcoming={[]}
              onToggleWatchlist={() => undefined}
              onNavigateHome={() => undefined}
              onOpenWinningEntry={() => undefined}
              onOpenShareTicket={() => undefined}
              overrideLiveTrackedPicks={[]}
            />
          </RecordDomAutoClick>
        </div>
      </PlatformProvider>
    </EmblemSurfaceProvider>
  ),
};

export const ParlaySelladoTresPiernasClaro: Story = {
  ...ParlaySelladoTresPiernasOscuro,
  globals: { theme: "light" },
};

export const EstadoVacioPicksOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <EmblemSurfaceProvider surface="app">
      <PlatformProvider dataset={STORY_DATASET} initialRole="member">
        <div className="p-6 max-w-5xl mx-auto">
          <RecordPicksTab
            journal={[]}
            oddsFormat="decimal"
            watchedGames={[]}
            suggestedUpcoming={STORY_DATASET.games.slice(0, 2)}
            onToggleWatchlist={() => undefined}
            onNavigateHome={() => undefined}
            onOpenWinningEntry={() => undefined}
            onOpenShareTicket={() => undefined}
            overrideLiveTrackedPicks={[]}
          />
        </div>
      </PlatformProvider>
    </EmblemSurfaceProvider>
  ),
};

export const EstadoVacioPicksClaro: Story = {
  ...EstadoVacioPicksOscuro,
  globals: { theme: "light" },
};

export const FiltroParlaysVacioOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <EmblemSurfaceProvider surface="app">
      <PlatformProvider dataset={STORY_DATASET} initialRole="member">
        <div className="p-6 max-w-5xl mx-auto">
          <RecordDomAutoClick selector='[data-kind-filter="parlay"]'>
            <RecordPicksTab
              journal={SINGLES_ONLY_JOURNAL}
              oddsFormat="decimal"
              watchedGames={[]}
              suggestedUpcoming={[]}
              onToggleWatchlist={() => undefined}
              onNavigateHome={() => undefined}
              onOpenWinningEntry={() => undefined}
              onOpenShareTicket={() => undefined}
              overrideLiveTrackedPicks={[]}
            />
          </RecordDomAutoClick>
        </div>
      </PlatformProvider>
    </EmblemSurfaceProvider>
  ),
};

export const FiltroParlaysVacioClaro: Story = {
  ...FiltroParlaysVacioOscuro,
  globals: { theme: "light" },
};

export const VisitanteCeroFugaOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <EmblemSurfaceProvider surface="public">
      <PlatformProvider dataset={VISITOR_RECORD_DATASET} initialRole="visitor">
        <BitacoraClubView initialTab="picks" />
      </PlatformProvider>
    </EmblemSurfaceProvider>
  ),
};

export const VisitanteCeroFugaClaro: Story = {
  ...VisitanteCeroFugaOscuro,
  globals: { theme: "light" },
};

export const MovilParlayYFiltrosOscuro: Story = {
  globals: { theme: "dark" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <EmblemSurfaceProvider surface="app">
      <PlatformProvider dataset={STORY_DATASET} initialRole="member">
        <div style={{ maxWidth: 375, width: "100%", margin: "0 auto", padding: 12 }}>
          <RecordPicksTab
            journal={SEALED_THREE_LEG_JOURNAL}
            oddsFormat="decimal"
            watchedGames={[]}
            suggestedUpcoming={[]}
            onToggleWatchlist={() => undefined}
            onNavigateHome={() => undefined}
            onOpenWinningEntry={() => undefined}
            onOpenShareTicket={() => undefined}
            overrideLiveTrackedPicks={[]}
          />
        </div>
      </PlatformProvider>
    </EmblemSurfaceProvider>
  ),
};

export const MovilParlayYFiltrosClaro: Story = {
  ...MovilParlayYFiltrosOscuro,
  globals: { theme: "light" },
};
