import React, { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { asLeagueId } from "@pitchlab/contracts";
import { SofascoreCard } from "../../../components/ui/primitives";
import { EmblemSurfaceProvider } from "../../../sports";
import { useSafeEffect } from "../../hooks";
import { PlatformProvider, usePlatformActions } from "../../platform-provider";
import type {
  BookQuoteItem,
  MatchPick,
  OddsFormat,
  PlatformDataset,
  PlatformGame,
} from "../../types";
import { BetBuilderDrawer, BetBuilderQuickButton } from "./BetBuilderDrawer";

const meta = {
  title: "Platform v4 / Picks / BetBuilderDrawer",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const CAPTURED_UTC = "2026-11-19T18:40:00Z";
const LEAGUE_MX = asLeagueId("liga-mx");
const GAME_ID = "lmx-bb-ame-tig";

const QUOTES_HOME_WIN: readonly BookQuoteItem[] = [
  {
    book: "caliente_mx",
    bookLabel: "Caliente",
    decimal: 1.88,
    openingDecimal: 2.04,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
    isBest: true,
  },
  {
    book: "codere",
    bookLabel: "Codere",
    decimal: 1.85,
    openingDecimal: 1.98,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
  },
  {
    book: "bet365",
    bookLabel: "Bet365",
    decimal: 1.83,
    openingDecimal: 1.95,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
  },
];

const QUOTES_OVER_25: readonly BookQuoteItem[] = [
  {
    book: "bet365",
    bookLabel: "Bet365",
    decimal: 1.91,
    openingDecimal: 1.98,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
    isBest: true,
  },
  {
    book: "codere",
    bookLabel: "Codere",
    decimal: 1.88,
    openingDecimal: 1.95,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
  },
  {
    book: "caliente_mx",
    bookLabel: "Caliente",
    decimal: 1.87,
    openingDecimal: 1.94,
    movementDirection: "shortening",
    capturedAtUtc: CAPTURED_UTC,
  },
];

const QUOTES_BTTS_YES: readonly BookQuoteItem[] = [
  {
    book: "codere",
    bookLabel: "Codere",
    decimal: 1.84,
    openingDecimal: 1.78,
    movementDirection: "drifting",
    capturedAtUtc: CAPTURED_UTC,
    isBest: true,
  },
  {
    book: "novibet",
    bookLabel: "Novibet",
    decimal: 1.81,
    openingDecimal: 1.76,
    movementDirection: "drifting",
    capturedAtUtc: CAPTURED_UTC,
  },
];

const PICK_HOME_WIN: MatchPick = {
  id: "pick-bb-ame-win",
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
  rationale:
    "América acumula 4 triunfos en 5 partidos y mantiene superioridad en goles esperados como local.",
  p: 0.584,
  fairDecimal: 1.71,
  fairAmerican: -140,
  marketDecimal: 1.88,
  marketAmerican: -114,
  marketBookLabel: "Caliente",
  marketCapturedAtUtc: CAPTURED_UTC,
  bookQuotes: QUOTES_HOME_WIN,
  edgePts: 5.2,
  confidenceScore: null,
  suggestedUnits: 1.25,
};

const PICK_OVER_25: MatchPick = {
  id: "pick-bb-ame-o25",
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
  rationale:
    "Proyección conjunta de 3.06 xG y 3 de los últimos 4 cruces directos superaron los 2.5 goles.",
  p: 0.575,
  fairDecimal: 1.74,
  fairAmerican: -135,
  marketDecimal: 1.91,
  marketAmerican: -110,
  marketBookLabel: "Bet365",
  marketCapturedAtUtc: CAPTURED_UTC,
  bookQuotes: QUOTES_OVER_25,
  edgePts: 5.1,
  confidenceScore: null,
  suggestedUnits: 1.0,
};

const PICK_BTTS_YES: MatchPick = {
  id: "pick-bb-ame-btts",
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
  rationale: "Ambos equipos marcaron en los 4 enfrentamientos directos más recientes.",
  p: 0.592,
  fairDecimal: 1.69,
  fairAmerican: -145,
  marketDecimal: 1.84,
  marketAmerican: -119,
  marketBookLabel: "Codere",
  marketCapturedAtUtc: CAPTURED_UTC,
  bookQuotes: QUOTES_BTTS_YES,
  edgePts: 4.9,
  confidenceScore: null,
  suggestedUnits: 1.0,
};

const PICK_UNDER_15: MatchPick = {
  id: "pick-bb-ame-u15",
  gameId: GAME_ID,
  league: LEAGUE_MX,
  leagueLabel: "Liga MX",
  matchLabel: "América vs Tigres",
  kickoffLocal: "21:00",
  gameStatus: "NS",
  slotIndex: 3,
  category: "tactico",
  categoryLabel: "Goles totales",
  risk: "arriesgado",
  engineKey: "tachyon",
  engineName: "PitchLab Tachyon v3.0",
  marketGroup: "Goles totales",
  selectionKey: "under_1.5",
  market: "totals",
  line: 1.5,
  conflictGroup: "under_total",
  label: "Menos de 1.5 goles",
  rationale: "Escenario de marcador cerrado con baja producción ofensiva.",
  p: 0.24,
  fairDecimal: 4.17,
  fairAmerican: 317,
  marketDecimal: 3.95,
  marketAmerican: 295,
  marketBookLabel: "Caliente",
  marketCapturedAtUtc: CAPTURED_UTC,
  edgePts: -1.3,
  confidenceScore: null,
  suggestedUnits: 0.5,
};

const PICK_HOME_DC: MatchPick = {
  id: "pick-bb-ame-1x",
  gameId: GAME_ID,
  league: LEAGUE_MX,
  leagueLabel: "Liga MX",
  matchLabel: "América vs Tigres",
  kickoffLocal: "21:00",
  gameStatus: "NS",
  slotIndex: 4,
  category: "conservador",
  categoryLabel: "Doble oportunidad",
  risk: "conservador",
  engineKey: "singularity",
  engineName: "PitchLab Singularity v3.0",
  marketGroup: "Doble oportunidad",
  selectionKey: "1x",
  market: "double_chance",
  conflictGroup: "home_side",
  label: "América o empate",
  rationale: "Cobertura conservadora apoyada en invicto reciente como local.",
  p: 0.82,
  fairDecimal: 1.22,
  fairAmerican: -455,
  marketDecimal: 1.26,
  marketAmerican: -385,
  marketBookLabel: "Codere",
  marketCapturedAtUtc: CAPTURED_UTC,
  edgePts: 2.6,
  confidenceScore: null,
  suggestedUnits: 1.5,
};

const PICK_CORNERS_OVER: MatchPick = {
  id: "pick-bb-ame-cor",
  gameId: GAME_ID,
  league: LEAGUE_MX,
  leagueLabel: "Liga MX",
  matchLabel: "América vs Tigres",
  kickoffLocal: "21:00",
  gameStatus: "NS",
  slotIndex: 5,
  category: "tactico",
  categoryLabel: "Tiros de esquina",
  risk: "medio",
  engineKey: "geodesic",
  engineName: "PitchLab Geodesic v2.0",
  marketGroup: "Tiros de esquina",
  selectionKey: "over_9.5",
  market: "corners_total",
  line: 9.5,
  conflictGroup: "independent",
  label: "Más de 9.5 córners",
  rationale: "Media proyectada de 10.4 tiros de esquina combinados entre ambos equipos.",
  p: 0.59,
  fairDecimal: 1.69,
  fairAmerican: -144,
  marketDecimal: 1.85,
  marketAmerican: -118,
  marketBookLabel: "Bet365",
  marketCapturedAtUtc: CAPTURED_UTC,
  edgePts: 4.9,
  confidenceScore: null,
  suggestedUnits: 1.0,
};

const STORY_GAME: PlatformGame = {
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
  picks: [PICK_HOME_WIN, PICK_OVER_25, PICK_BTTS_YES],
  parlayCandidates: [PICK_HOME_DC, PICK_CORNERS_OVER, PICK_UNDER_15],
  preGame: {
    cortexSynthesis:
      "América parte con ventaja en casa y proyección ofensiva alta ante Tigres.",
    tacticalKeys: ["Presión en bloque medio-alto", "Alto volumen de centros al área"],
    lineupStatusLabel: "Once probable disponible",
    lineupsConfirmed60m: false,
    absences: [],
    moneyFlow: null,
  },
  markets: [],
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
    corners: {
      home: 5.8,
      away: 4.6,
      total: 10.4,
      line: 9.5,
      pOver: 0.59,
      sample: { home: 15, away: 15 },
    },
    fouls: {
      home: 11.4,
      away: 12.1,
      total: 23.5,
      line: 22.5,
      pOver: 0.56,
      sample: { home: 15, away: 15 },
    },
    yellow: {
      home: 2.3,
      away: 2.7,
      total: 5.0,
      line: 4.5,
      pOver: 0.61,
      sample: { home: 15, away: 15 },
    },
  },
  updatedAtLabel: "Actualizado hace 6 min",
  spacetime: null,
};

const STORY_DATASET: PlatformDataset = {
  generatedAt: CAPTURED_UTC,
  leagues: [
    {
      league: LEAGUE_MX,
      label: "Liga MX",
      sport: "football",
      season: "Apertura 2026",
      roundLabel: "Jornada 16",
      generatedAt: CAPTURED_UTC,
      totalGames: 1,
      upcomingCount: 1,
      finishedCount: 0,
      standings: [],
    },
  ],
  games: [STORY_GAME],
  dailyPromoPickId: "promo-otro-partido",
  tipsterWeeklyPickId: "tipster-otro-partido",
  tipsterWeeklySlug: "sofia-nfl",
  isServerRedactedForVisitor: false,
};

function DrawerHarness({
  focalPick,
  initialLegs,
  initialAllowSgp,
  initialOddsFormat = "decimal",
  caption,
}: {
  readonly focalPick: MatchPick;
  readonly initialLegs: readonly MatchPick[];
  readonly initialAllowSgp: boolean;
  readonly initialOddsFormat?: OddsFormat;
  readonly caption: string;
}): React.JSX.Element {
  const { loadParlayPicks, setAllowSgp, setOddsFormat } = usePlatformActions();
  const [open, setOpen] = useState(true);
  const seedKey = `${focalPick.id}:${String(initialAllowSgp)}:${initialOddsFormat}:${initialLegs.map((l) => l.id).join(",")}`;
  const lastSeedRef = useRef<string | null>(null);

  useSafeEffect(() => {
    if (lastSeedRef.current === seedKey) return;
    lastSeedRef.current = seedKey;
    setOddsFormat(initialOddsFormat);
    setAllowSgp(initialAllowSgp);
    if (initialLegs.length > 0) {
      loadParlayPicks(initialLegs, {
        allowSgp: initialAllowSgp,
        label: "Boleto SGP",
      });
    }
  }, [
    initialAllowSgp,
    initialLegs,
    initialOddsFormat,
    loadParlayPicks,
    seedKey,
    setAllowSgp,
    setOddsFormat,
  ]);

  return (
    <div className="pl-stage" style={{ minHeight: "100vh", padding: 24 }}>
      <div style={{ maxWidth: 520 }}>
        <SofascoreCard title={caption} meta="Bet Builder · Editorial Kit">
          <div className="flex flex-col gap-3">
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Si cierras el cajón lateral, vuelve a abrirlo con el botón rápido de Bet Builder.
            </p>
            <div>
              <BetBuilderQuickButton pick={focalPick} onInspect={() => setOpen(true)} />
            </div>
          </div>
        </SofascoreCard>
      </div>

      <BetBuilderDrawer
        open={open}
        pick={focalPick}
        game={STORY_GAME}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

function DrawerStoryShell(props: {
  readonly focalPick: MatchPick;
  readonly initialLegs: readonly MatchPick[];
  readonly initialAllowSgp: boolean;
  readonly initialOddsFormat?: OddsFormat;
  readonly caption: string;
}): React.JSX.Element {
  const providerKey = `${props.focalPick.id}:${String(props.initialAllowSgp)}:${props.initialOddsFormat ?? "decimal"}`;
  return (
    <EmblemSurfaceProvider surface="app">
      <PlatformProvider key={providerKey} dataset={STORY_DATASET} initialRole="member">
        <DrawerHarness {...props} />
      </PlatformProvider>
    </EmblemSurfaceProvider>
  );
}

export const BoletaSgpCompatibleOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <DrawerStoryShell
      focalPick={PICK_HOME_WIN}
      initialLegs={[PICK_HOME_WIN, PICK_OVER_25]}
      initialAllowSgp
      initialOddsFormat="decimal"
      caption="Boleta SGP abierta · 2 piernas compatibles con momio justo y EV+"
    />
  ),
};

export const BoletaSgpCompatibleClaro: Story = {
  globals: { theme: "light" },
  render: BoletaSgpCompatibleOscuro.render,
};

export const CasoConflictoLogicoOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <DrawerStoryShell
      focalPick={PICK_UNDER_15}
      initialLegs={[PICK_BTTS_YES]}
      initialAllowSgp
      initialOddsFormat="decimal"
      caption="Conflicto lógico SGP · Ambos anotan: Sí vs Menos de 1.5 goles"
    />
  ),
};

export const CasoConflictoLogicoClaro: Story = {
  globals: { theme: "light" },
  render: CasoConflictoLogicoOscuro.render,
};

export const SgpDesactivadoAvisoAmericanoOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <DrawerStoryShell
      focalPick={PICK_OVER_25}
      initialLegs={[PICK_HOME_WIN]}
      initialAllowSgp={false}
      initialOddsFormat="american"
      caption="Aviso de mismo partido con SGP desactivado · Momio americano y EV+"
    />
  ),
};

export const SgpDesactivadoAvisoAmericanoClaro: Story = {
  globals: { theme: "light" },
  render: SgpDesactivadoAvisoAmericanoOscuro.render,
};
