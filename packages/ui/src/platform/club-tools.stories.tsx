import React, { useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { asLeagueId } from "@pitchlab/contracts";
import { EmblemSurfaceProvider } from "../sports";
import { redactDatasetForVisitor } from "./access-guard";
import { ClubTechView } from "./club/ClubTechView";
import { OddsCompareClubView } from "./club/OddsCompareView";
import { ParlayBuilderClubView } from "./club/ParlayAndQuantViews";
import { PersonalParlayQuickBar } from "./club/PersonalParlayQuickBar";
import { PicksFinderClubView } from "./club/PicksFinderView";
import {
  CalendarSquare,
  ExampleBadge,
  ExampleNotice,
  GlassActionRow,
  MaestroIcon,
  NoticeCard,
  StackedAvatars,
  TipsterBadge,
  TipsterVerifiedBadge,
  UltraTag,
  UserBadges,
  VerifiedBadge,
  VerifiedSeal,
  type MaestroIconName,
} from "./components/MaestroPrimitives";
import {
  CommandPaletteModal,
  ParlayFloatingDock,
  PickComposerModal,
  ShareTicketModal,
  ToastViewport,
} from "./components/PlatformOverlays";
import { useSafeEffect } from "./hooks";
import { buildPlatformDataset } from "./match-picks-engine";
import { PlatformProvider, usePlatform, usePlatformActions } from "./platform-provider";
import { STORY_DATASET } from "./story-fixtures";
import type { MatchPick, OddsFormat, PlatformDataset, PlatformGame } from "./types";

/*
 * Herramientas del club sin story propia hasta ahora: Compara tu momio, Buscador de picks,
 * Parlay rápido, Cómo calculamos, primitivas Maestro y las ventanas flotantes
 * (paleta de búsqueda, registrar pick, compartir boleto, dock del parlay y avisos).
 * Datos de ejemplo de `story-fixtures.ts`.
 */

function Member({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <PlatformProvider dataset={STORY_DATASET} initialRole="member">
      {children}
    </PlatformProvider>
  );
}

const light = { globals: { theme: "light" } };

const meta = {
  title: "PitchLab v4 / Herramientas del club",
  parameters: { layout: "fullscreen" },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/* ---------- Vistas del club ---------- */

export const ComparaTuMomio = {
  render: () => (
    <Member>
      <OddsCompareClubView />
    </Member>
  ),
};
export const ComparaTuMomioClaro = { ...ComparaTuMomio, ...light };

export const BuscadorDePicks = {
  render: () => (
    <Member>
      <PicksFinderClubView />
    </Member>
  ),
};
export const BuscadorDePicksClaro = { ...BuscadorDePicks, ...light };

export const ParlayRapido = {
  render: () => (
    <Member>
      <div style={{ maxWidth: 720, padding: 24 }}>
        <PersonalParlayQuickBar />
      </div>
    </Member>
  ),
};
export const ParlayRapidoClaro = { ...ParlayRapido, ...light };

export const ComoCalculamos = {
  render: () => (
    <Member>
      <ClubTechView />
    </Member>
  ),
};
export const ComoCalculamosClaro = { ...ComoCalculamos, ...light };

/* ---------- Primitivas Maestro ---------- */

const ICONS = [
  "sparkles", "lock", "unlock", "shield", "layers", "bolt", "chart", "users", "gift",
  "share", "bell", "search", "check", "x", "trash", "chevronRight", "chevronLeft", "grid", "arrowRight",
  "arrowLeft", "calendar", "flame", "trophy", "sliders", "eye", "copy", "download",
  "plus", "minus", "sun", "moon", "star", "ticket", "cpu", "activity", "crown",
  "message", "heart", "link", "users-plus", "user", "receipt", "logout",
  "chevronDown", "dots", "flag", "pin", "whistle", "command",
] as const satisfies readonly MaestroIconName[];

function Primitives(): React.JSX.Element {
  return (
    <div style={{ maxWidth: 960, padding: 24 }} className="space-y-8">
      <section className="space-y-3">
        <h2 className="m-0 text-lg font-extrabold">Íconos</h2>
        <ul className="m-0 p-0 list-none grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))" }}>
          {ICONS.map((name) => (
            <li
              key={name}
              className="glass-card glass-ring rounded-xl p-3 flex flex-col items-center gap-2 text-xs"
              style={{ color: "var(--pl-text-secondary)" }}
            >
              <MaestroIcon name={name} size={20} style={{ color: "var(--pl-text)" }} />
              <span>{name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="m-0 text-lg font-extrabold">Insignias</h2>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5">
            Ana López <UserBadges roleLabel="Socio Ultra" verified />
          </span>
          <span className="inline-flex items-center gap-1.5">
            @sofia_nfl <UserBadges roleLabel="Tipster verificado" />
          </span>
          <VerifiedBadge />
          <VerifiedSeal />
          <TipsterBadge />
          <TipsterVerifiedBadge />
          <UltraTag />
          <ExampleBadge />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="m-0 text-lg font-extrabold">Avisos</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <NoticeCard tone="brand" icon="sparkles" badgeText="Nuevo" title="Parlay del día listo">
            Tres selecciones de la jornada con su probabilidad conjunta.
          </NoticeCard>
          <NoticeCard tone="success" icon="check" title="Pick registrado">
            Quedó sellado en tu bitácora antes del partido.
          </NoticeCard>
          <NoticeCard tone="warning" icon="flag" title="Momio sin capturar">
            No hay cuota de casa reciente para este partido.
          </NoticeCard>
          <NoticeCard tone="info" icon="activity" title="Probabilidad ajustada">
            Las selecciones del mismo partido no son independientes.
          </NoticeCard>
        </div>
        <ExampleNotice>Así se marca una vista con contenido de demostración.</ExampleNotice>
      </section>

      <section className="space-y-3">
        <h2 className="m-0 text-lg font-extrabold">Filas y piezas</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <GlassActionRow
            leading={<MaestroIcon name="ticket" size={18} />}
            title="Mi récord"
            subtitle="12 picks cerrados este mes"
            trailingBadge={<span className="pl-pill num">+3.4u</span>}
            onClick={() => undefined}
          />
          <div className="flex items-center gap-4">
            <CalendarSquare monthLabel="nov" dayNumber="14" />
            <StackedAvatars
              items={[
                { initials: "AL", label: "Ana López" },
                { initials: "SR", label: "Sofía Ruiz" },
                { initials: "DM", label: "Diego Mora" },
              ]}
              extraCount={8}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

export const PrimitivasMaestro = { render: () => <Primitives /> };
export const PrimitivasMaestroClaro = { ...PrimitivasMaestro, ...light };

/* ---------- Ventanas flotantes ---------- */

/** Ejecuta una acción del proveedor una sola vez al montar (abre la ventana de la story). */
function OnMount({ run }: { run: (p: ReturnType<typeof usePlatform>) => void }): null {
  const platform = usePlatform();
  const done = useRef(false);
  useSafeEffect(() => {
    if (done.current) return;
    done.current = true;
    run(platform);
  }, [platform, run]);
  return null;
}

const firstOpenPick = () =>
  STORY_DATASET.games.find((g) => g.status !== "FT")?.picks[0] ?? null;

const openPalette = (p: ReturnType<typeof usePlatform>) => p.setCmdkOpen(true);
const openComposer = (p: ReturnType<typeof usePlatform>) => {
  const pick = firstOpenPick();
  if (pick) p.openComposer(pick);
};
const openShare = (p: ReturnType<typeof usePlatform>) =>
  p.openShareTicket({
    kind: "pick",
    title: "Arsenal vs Liverpool",
    subtitle: "@ana_analiza · Premier League",
    leagueLabel: "Premier League",
    pickLabel: "Gana Arsenal",
    probability: 0.52,
    fairDecimal: 1.92,
    marketDecimal: 2.05,
    units: 1,
    gameStatus: "NS",
  });
const openShareMultiParlay = (p: ReturnType<typeof usePlatform>) =>
  p.openShareTicket({
    kind: "parlay",
    title: "Parlay objetivo ~5.0× · NFL",
    subtitle: "4 selecciones, ≥ 52 % cada una; busca cuota justa 3.0–7.0",
    leagueLabel: "NFL",
    pickLabel: "SF gana + KC gana + HOU gana + JAX -7.5",
    probability: 0.161,
    fairDecimal: 6.21,
    marketDecimal: 6.21,
    units: 1,
    gameStatus: "NS",
    revealLegs: true,
    legs: [
      { label: "San Francisco gana", matchLabel: "SF @ DAL · 15:25", p: 0.661, fairDecimal: 1.51 },
      { label: "Kansas City gana", matchLabel: "KC @ ATL · 12:00", p: 0.652, fairDecimal: 1.53 },
      { label: "Houston gana", matchLabel: "HOU @ CLE · 12:00", p: 0.615, fairDecimal: 1.63 },
      { label: "JAX -7.5", matchLabel: "JAX @ TEN · 12:00", p: 0.608, fairDecimal: 1.64 },
    ],
  });
const fillParlay = (p: ReturnType<typeof usePlatform>) => {
  for (const game of STORY_DATASET.games.filter((g) => g.status !== "FT").slice(0, 3)) {
    const pick = game.picks[0];
    if (pick) p.addPickToParlay(pick);
  }
};
const showToasts = (p: ReturnType<typeof usePlatform>) => {
  p.pushToast("Pick registrado en tu bitácora (1u).", "success");
  p.pushToast("Selección no compatible con tu parlay.", "warning");
};

export const PaletaDeBusqueda = {
  render: () => (
    <Member>
      <OnMount run={openPalette} />
      <CommandPaletteModal />
    </Member>
  ),
};
export const PaletaDeBusquedaClaro = { ...PaletaDeBusqueda, ...light };

export const PaletaDeBusquedaFiltrada = {
  render: () => (
    <Member>
      <OnMount run={openPalette} />
      <CommandPaletteModal initialQuery="Monterrey" />
    </Member>
  ),
};
export const PaletaDeBusquedaFiltradaClaro = { ...PaletaDeBusquedaFiltrada, ...light };

export const PaletaDeBusquedaSinResultados = {
  render: () => (
    <Member>
      <OnMount run={openPalette} />
      <CommandPaletteModal initialQuery="ClubInexistenteXYZ" />
    </Member>
  ),
};
export const PaletaDeBusquedaSinResultadosClaro = {
  ...PaletaDeBusquedaSinResultados,
  ...light,
};

export const RegistrarPick = {
  render: () => (
    <Member>
      <OnMount run={openComposer} />
      <PickComposerModal />
    </Member>
  ),
};
export const RegistrarPickClaro = { ...RegistrarPick, ...light };

export const CompartirBoleto = {
  render: () => (
    <Member>
      <OnMount run={openShare} />
      <ShareTicketModal />
    </Member>
  ),
};
export const CompartirBoletoClaro = { ...CompartirBoleto, ...light };

export const CompartirParlayObjetivoOscuro = {
  render: () => (
    <Member>
      <OnMount run={openShareMultiParlay} />
      <ShareTicketModal />
    </Member>
  ),
};
export const CompartirParlayObjetivoClaro = { ...CompartirParlayObjetivoOscuro, ...light };

export const DockDelParlay = {
  render: () => (
    <Member>
      <OnMount run={fillParlay} />
      <div style={{ minHeight: 420 }} />
      <ParlayFloatingDock />
    </Member>
  ),
};
export const DockDelParlayClaro = { ...DockDelParlay, ...light };

export const Avisos = {
  render: () => (
    <Member>
      <OnMount run={showToasts} />
      <ToastViewport />
    </Member>
  ),
};
export const AvisosClaro = { ...Avisos, ...light };

const PARLAY_CAPTURED_UTC = "2026-11-21T17:30:00Z";

function createParlayStoryPick(spec: {
  readonly id: string;
  readonly gameId: string;
  readonly league: string;
  readonly leagueLabel: string;
  readonly matchLabel: string;
  readonly kickoffLocal: string;
  readonly slotIndex: number;
  readonly category: MatchPick["category"];
  readonly categoryLabel: string;
  readonly marketGroup: string;
  readonly selectionKey: string;
  readonly market: string;
  readonly line: number | null;
  readonly conflictGroup: MatchPick["conflictGroup"];
  readonly label: string;
  readonly p: number;
  readonly fairDecimal: number;
  readonly fairAmerican: number;
  readonly marketDecimal: number;
  readonly marketAmerican: number;
  readonly bookLabel: string;
}): MatchPick {
  return {
    id: spec.id,
    gameId: spec.gameId,
    league: asLeagueId(spec.league),
    leagueLabel: spec.leagueLabel,
    matchLabel: spec.matchLabel,
    kickoffLocal: spec.kickoffLocal,
    gameStatus: "NS",
    slotIndex: spec.slotIndex,
    category: spec.category,
    categoryLabel: spec.categoryLabel,
    risk: "medio",
    engineKey: "singularity",
    engineName: "PitchLab Singularity v5.1",
    marketGroup: spec.marketGroup,
    selectionKey: spec.selectionKey,
    market: spec.market,
    line: spec.line,
    conflictGroup: spec.conflictGroup,
    label: spec.label,
    rationale: "Probabilidad calibrada con ventaja verificada frente a cuota de mercado.",
    p: spec.p,
    fairDecimal: spec.fairDecimal,
    fairAmerican: spec.fairAmerican,
    marketDecimal: spec.marketDecimal,
    marketAmerican: spec.marketAmerican,
    marketBookLabel: spec.bookLabel,
    marketCapturedAtUtc: PARLAY_CAPTURED_UTC,
    edgePts: Math.round((spec.p - 1 / spec.marketDecimal) * 1000) / 10,
    confidenceScore: null,
    suggestedUnits: 1.0,
  };
}

const PARLAY_GAME_LMX_HOME = createParlayStoryPick({
  id: "pb-lmx-ame-home",
  gameId: "pb-g-lmx",
  league: "liga-mx",
  leagueLabel: "Liga MX",
  matchLabel: "América vs Tigres",
  kickoffLocal: "21:00",
  slotIndex: 0,
  category: "principal",
  categoryLabel: "Resultado 1X2",
  marketGroup: "Resultado",
  selectionKey: "home",
  market: "1x2",
  line: null,
  conflictGroup: "home_side",
  label: "América gana",
  p: 0.584,
  fairDecimal: 1.71,
  fairAmerican: -141,
  marketDecimal: 1.85,
  marketAmerican: -118,
  bookLabel: "Caliente",
});

const PARLAY_GAME_LMX_OVER = createParlayStoryPick({
  id: "pb-lmx-ame-o25",
  gameId: "pb-g-lmx",
  league: "liga-mx",
  leagueLabel: "Liga MX",
  matchLabel: "América vs Tigres",
  kickoffLocal: "21:00",
  slotIndex: 1,
  category: "totales",
  categoryLabel: "Goles totales",
  marketGroup: "Totales",
  selectionKey: "over_2.5",
  market: "totals",
  line: 2.5,
  conflictGroup: "over_total",
  label: "Más de 2.5 goles",
  p: 0.562,
  fairDecimal: 1.78,
  fairAmerican: -128,
  marketDecimal: 1.9,
  marketAmerican: -111,
  bookLabel: "Bet365",
});

const PARLAY_GAME_EPL_HOME = createParlayStoryPick({
  id: "pb-epl-ars-home",
  gameId: "pb-g-epl",
  league: "premier-league",
  leagueLabel: "Premier League",
  matchLabel: "Arsenal vs Chelsea",
  kickoffLocal: "11:30",
  slotIndex: 0,
  category: "principal",
  categoryLabel: "Resultado 1X2",
  marketGroup: "Resultado",
  selectionKey: "home",
  market: "1x2",
  line: null,
  conflictGroup: "home_side",
  label: "Arsenal gana",
  p: 0.571,
  fairDecimal: 1.75,
  fairAmerican: -133,
  marketDecimal: 1.88,
  marketAmerican: -114,
  bookLabel: "Pinnacle",
});

const PARLAY_GAME_LALIGA_OVER = createParlayStoryPick({
  id: "pb-ll-bar-o25",
  gameId: "pb-g-laliga",
  league: "laliga",
  leagueLabel: "LaLiga",
  matchLabel: "FC Barcelona vs Sevilla",
  kickoffLocal: "14:00",
  slotIndex: 0,
  category: "totales",
  categoryLabel: "Goles totales",
  marketGroup: "Totales",
  selectionKey: "over_2.5",
  market: "totals",
  line: 2.5,
  conflictGroup: "over_total",
  label: "Más de 2.5 goles",
  p: 0.618,
  fairDecimal: 1.62,
  fairAmerican: -161,
  marketDecimal: 1.74,
  marketAmerican: -135,
  bookLabel: "Codere",
});

const PARLAY_GAME_NBA_HOME = createParlayStoryPick({
  id: "pb-nba-bos-home",
  gameId: "pb-g-nba",
  league: "nba",
  leagueLabel: "NBA",
  matchLabel: "Celtics vs Heat",
  kickoffLocal: "19:30",
  slotIndex: 0,
  category: "principal",
  categoryLabel: "Moneyline",
  marketGroup: "Ganador",
  selectionKey: "home",
  market: "moneyline",
  line: null,
  conflictGroup: "home_side",
  label: "Celtics gana",
  p: 0.668,
  fairDecimal: 1.5,
  fairAmerican: -200,
  marketDecimal: 1.58,
  marketAmerican: -172,
  bookLabel: "Pinnacle",
});

const PARLAY_GAME_NBA_OVER = createParlayStoryPick({
  id: "pb-nba-bos-o2225",
  gameId: "pb-g-nba",
  league: "nba",
  leagueLabel: "NBA",
  matchLabel: "Celtics vs Heat",
  kickoffLocal: "19:30",
  slotIndex: 1,
  category: "totales",
  categoryLabel: "Puntos totales",
  marketGroup: "Totales",
  selectionKey: "over_222.5",
  market: "totals",
  line: 222.5,
  conflictGroup: "over_total",
  label: "Más de 222.5 puntos",
  p: 0.558,
  fairDecimal: 1.79,
  fairAmerican: -127,
  marketDecimal: 1.91,
  marketAmerican: -110,
  bookLabel: "Bet365",
});

const PARLAY_GAME_NFL_HOME = createParlayStoryPick({
  id: "pb-nfl-kc-home",
  gameId: "pb-g-nfl",
  league: "nfl",
  leagueLabel: "NFL",
  matchLabel: "Chiefs vs Bills",
  kickoffLocal: "15:25",
  slotIndex: 0,
  category: "principal",
  categoryLabel: "Moneyline",
  marketGroup: "Ganador",
  selectionKey: "home",
  market: "moneyline",
  line: null,
  conflictGroup: "home_side",
  label: "Chiefs gana",
  p: 0.614,
  fairDecimal: 1.63,
  fairAmerican: -159,
  marketDecimal: 1.74,
  marketAmerican: -135,
  bookLabel: "Pinnacle",
});

const PARLAY_GAME_NFL_OVER = createParlayStoryPick({
  id: "pb-nfl-kc-o475",
  gameId: "pb-g-nfl",
  league: "nfl",
  leagueLabel: "NFL",
  matchLabel: "Chiefs vs Bills",
  kickoffLocal: "15:25",
  slotIndex: 1,
  category: "totales",
  categoryLabel: "Puntos totales",
  marketGroup: "Totales",
  selectionKey: "over_47.5",
  market: "totals",
  line: 47.5,
  conflictGroup: "over_total",
  label: "Más de 47.5 puntos",
  p: 0.548,
  fairDecimal: 1.82,
  fairAmerican: -122,
  marketDecimal: 1.93,
  marketAmerican: -108,
  bookLabel: "Caliente",
});

const PARLAY_GAME_MLB_HOME = createParlayStoryPick({
  id: "pb-mlb-lad-home",
  gameId: "pb-g-mlb",
  league: "mlb",
  leagueLabel: "MLB",
  matchLabel: "Dodgers vs Padres",
  kickoffLocal: "20:10",
  slotIndex: 0,
  category: "principal",
  categoryLabel: "Moneyline",
  marketGroup: "Ganador",
  selectionKey: "home",
  market: "moneyline",
  line: null,
  conflictGroup: "home_side",
  label: "Dodgers gana",
  p: 0.592,
  fairDecimal: 1.69,
  fairAmerican: -145,
  marketDecimal: 1.8,
  marketAmerican: -125,
  bookLabel: "Pinnacle",
});

const PARLAY_GAME_NHL_OVER = createParlayStoryPick({
  id: "pb-nhl-edm-o55",
  gameId: "pb-g-nhl",
  league: "nhl",
  leagueLabel: "NHL",
  matchLabel: "Oilers vs Canucks",
  kickoffLocal: "21:00",
  slotIndex: 0,
  category: "totales",
  categoryLabel: "Goles totales",
  marketGroup: "Totales",
  selectionKey: "over_5.5",
  market: "totals",
  line: 5.5,
  conflictGroup: "over_total",
  label: "Más de 5.5 goles",
  p: 0.576,
  fairDecimal: 1.74,
  fairAmerican: -135,
  marketDecimal: 1.86,
  marketAmerican: -116,
  bookLabel: "Bet365",
});

const PARLAY_MULTISPORT_GAMES: PlatformGame[] = [
  {
    id: "pb-g-lmx",
    league: asLeagueId("liga-mx"),
    leagueLabel: "Liga MX",
    sport: "football",
    round: "Jornada 16",
    dayId: "2026-11-22",
    dayLabel: "domingo, 22 de noviembre",
    kickoffUtc: "2026-11-23T03:00:00Z",
    kickoffLocal: "21:00",
    venue: "Estadio Azteca",
    status: "NS",
    home: { slug: "club-america", name: "Club América", shortName: "América", code: "AME", record: "11G-3E-1P" },
    away: { slug: "tigres-uanl", name: "Tigres UANL", shortName: "Tigres", code: "TIG", record: "9G-4E-2P" },
    hasForecast: true,
    x12: [0.584, 0.236, 0.18],
    projection: { home: 1.92, away: 1.14, total: 3.06 },
    goalLine: { line: 2.5, pOver: 0.562 },
    confidenceScore: null,
    confidenceLevel: null,
    picks: [PARLAY_GAME_LMX_HOME, PARLAY_GAME_LMX_OVER],
    preGame: {
      cortexSynthesis: "América mantiene presión alta sostenida en casa.",
      tacticalKeys: ["Balón parado ofensivo"],
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
  },
  {
    id: "pb-g-epl",
    league: asLeagueId("premier-league"),
    leagueLabel: "Premier League",
    sport: "football",
    round: "Jornada 12",
    dayId: "2026-11-22",
    dayLabel: "domingo, 22 de noviembre",
    kickoffUtc: "2026-11-22T17:30:00Z",
    kickoffLocal: "11:30",
    venue: "Emirates Stadium",
    status: "NS",
    home: { slug: "arsenal", name: "Arsenal", shortName: "Arsenal", code: "ARS", record: "8G-3E-1P" },
    away: { slug: "chelsea", name: "Chelsea", shortName: "Chelsea", code: "CHE", record: "6G-3E-3P" },
    hasForecast: true,
    x12: [0.571, 0.239, 0.19],
    projection: { home: 1.84, away: 1.09, total: 2.93 },
    goalLine: { line: 2.5, pOver: 0.55 },
    confidenceScore: null,
    confidenceLevel: null,
    picks: [PARLAY_GAME_EPL_HOME],
    preGame: {
      cortexSynthesis: "Arsenal domina territorialmente en casa.",
      tacticalKeys: ["Control en mediocampo"],
      lineupStatusLabel: "Once probable disponible",
      lineupsConfirmed60m: false,
      absences: [],
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "Actualizado hace 6 min",
    spacetime: null,
  },
  {
    id: "pb-g-laliga",
    league: asLeagueId("laliga"),
    leagueLabel: "LaLiga",
    sport: "football",
    round: "Jornada 14",
    dayId: "2026-11-22",
    dayLabel: "domingo, 22 de noviembre",
    kickoffUtc: "2026-11-22T20:00:00Z",
    kickoffLocal: "14:00",
    venue: "Estadi Olímpic",
    status: "NS",
    home: { slug: "fc-barcelona", name: "FC Barcelona", shortName: "Barcelona", code: "BAR", record: "11G-1E-1P" },
    away: { slug: "sevilla", name: "Sevilla", shortName: "Sevilla", code: "SEV", record: "5G-4E-4P" },
    hasForecast: true,
    x12: [0.66, 0.19, 0.15],
    projection: { home: 2.24, away: 0.96, total: 3.2 },
    goalLine: { line: 2.5, pOver: 0.618 },
    confidenceScore: null,
    confidenceLevel: null,
    picks: [PARLAY_GAME_LALIGA_OVER],
    preGame: {
      cortexSynthesis: "Ritmo ofensivo alto por bandas.",
      tacticalKeys: ["Volumen de remates"],
      lineupStatusLabel: "Once probable disponible",
      lineupsConfirmed60m: false,
      absences: [],
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "Actualizado hace 7 min",
    spacetime: null,
  },
  {
    id: "pb-g-nba",
    league: asLeagueId("nba"),
    leagueLabel: "NBA",
    sport: "basketball",
    round: "Temporada regular",
    dayId: "2026-11-22",
    dayLabel: "domingo, 22 de noviembre",
    kickoffUtc: "2026-11-23T01:30:00Z",
    kickoffLocal: "19:30",
    venue: "TD Garden",
    status: "NS",
    home: { slug: "boston-celtics", name: "Boston Celtics", shortName: "Celtics", code: "BOS", record: "12G-3P" },
    away: { slug: "miami-heat", name: "Miami Heat", shortName: "Heat", code: "MIA", record: "8G-6P" },
    hasForecast: true,
    x12: [0.668, 0, 0.332],
    projection: { home: 116.8, away: 108.4, total: 225.2 },
    goalLine: { line: 222.5, pOver: 0.558 },
    confidenceScore: null,
    confidenceLevel: null,
    picks: [PARLAY_GAME_NBA_HOME, PARLAY_GAME_NBA_OVER],
    preGame: {
      cortexSynthesis: "Boston llega con ventaja clara en eficiencia ofensiva.",
      tacticalKeys: ["Triples desde esquina"],
      lineupStatusLabel: "Reporte de bajas activo",
      lineupsConfirmed60m: false,
      absences: [],
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "Actualizado hace 4 min",
    spacetime: null,
  },
  {
    id: "pb-g-nfl",
    league: asLeagueId("nfl"),
    leagueLabel: "NFL",
    sport: "american-football",
    round: "Semana 11",
    dayId: "2026-11-22",
    dayLabel: "domingo, 22 de noviembre",
    kickoffUtc: "2026-11-22T21:25:00Z",
    kickoffLocal: "15:25",
    venue: "Arrowhead Stadium",
    status: "NS",
    home: { slug: "kansas-city-chiefs", name: "Kansas City Chiefs", shortName: "Chiefs", code: "KC", record: "8G-2P" },
    away: { slug: "buffalo-bills", name: "Buffalo Bills", shortName: "Bills", code: "BUF", record: "7G-3P" },
    hasForecast: true,
    x12: [0.614, 0, 0.386],
    projection: { home: 26.4, away: 22.8, total: 49.2 },
    goalLine: { line: 47.5, pOver: 0.548 },
    confidenceScore: null,
    confidenceLevel: null,
    picks: [PARLAY_GAME_NFL_HOME, PARLAY_GAME_NFL_OVER],
    preGame: {
      cortexSynthesis: "Duelo de ofensivas aéreas con ritmo sostenido.",
      tacticalKeys: ["Eficiencia en tercer down"],
      lineupStatusLabel: "Reporte oficial activo",
      lineupsConfirmed60m: false,
      absences: [],
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "Actualizado hace 8 min",
    spacetime: null,
  },
  {
    id: "pb-g-mlb",
    league: asLeagueId("mlb"),
    leagueLabel: "MLB",
    sport: "baseball",
    round: "Temporada regular",
    dayId: "2026-11-22",
    dayLabel: "domingo, 22 de noviembre",
    kickoffUtc: "2026-11-23T02:10:00Z",
    kickoffLocal: "20:10",
    venue: "Dodger Stadium",
    status: "NS",
    home: { slug: "los-angeles-dodgers", name: "Los Angeles Dodgers", shortName: "Dodgers", code: "LAD", record: "94G-68P" },
    away: { slug: "san-diego-padres", name: "San Diego Padres", shortName: "Padres", code: "SD", record: "88G-74P" },
    hasForecast: true,
    x12: [0.592, 0, 0.408],
    projection: { home: 4.8, away: 3.7, total: 8.5 },
    goalLine: { line: 8.5, pOver: 0.51 },
    confidenceScore: null,
    confidenceLevel: null,
    picks: [PARLAY_GAME_MLB_HOME],
    preGame: {
      cortexSynthesis: "Ventaja de bullpen local en entradas tardías.",
      tacticalKeys: ["Abridor probable confirmado"],
      lineupStatusLabel: "Lineup probable",
      lineupsConfirmed60m: false,
      absences: [],
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "Actualizado hace 9 min",
    spacetime: null,
  },
  {
    id: "pb-g-nhl",
    league: asLeagueId("nhl"),
    leagueLabel: "NHL",
    sport: "ice-hockey",
    round: "Temporada regular",
    dayId: "2026-11-22",
    dayLabel: "domingo, 22 de noviembre",
    kickoffUtc: "2026-11-23T03:00:00Z",
    kickoffLocal: "21:00",
    venue: "Rogers Place",
    status: "NS",
    home: { slug: "edmonton-oilers", name: "Edmonton Oilers", shortName: "Oilers", code: "EDM", record: "14G-6P" },
    away: { slug: "vancouver-canucks", name: "Vancouver Canucks", shortName: "Canucks", code: "VAN", record: "11G-8P" },
    hasForecast: true,
    x12: [0.578, 0, 0.422],
    projection: { home: 3.5, away: 2.8, total: 6.3 },
    goalLine: { line: 5.5, pOver: 0.576 },
    confidenceScore: null,
    confidenceLevel: null,
    picks: [PARLAY_GAME_NHL_OVER],
    preGame: {
      cortexSynthesis: "Alto volumen en power play y transiciones.",
      tacticalKeys: ["Portero titular confirmado"],
      lineupStatusLabel: "Porteros confirmados",
      lineupsConfirmed60m: false,
      absences: [],
      moneyFlow: null,
    },
    markets: [],
    factors: [],
    headToHead: [],
    updatedAtLabel: "Actualizado hace 6 min",
    spacetime: null,
  },
];

const PARLAY_MULTISPORT_DATASET: PlatformDataset = {
  generatedAt: "2026-11-21T18:00:00Z",
  leagues: [
    { league: asLeagueId("liga-mx"), label: "Liga MX", sport: "football", season: "Apertura 2026", roundLabel: "Jornada 16", generatedAt: "2026-11-21T18:00:00Z", totalGames: 1, upcomingCount: 1, finishedCount: 0, standings: [] },
    { league: asLeagueId("premier-league"), label: "Premier League", sport: "football", season: "2026/27", roundLabel: "Jornada 12", generatedAt: "2026-11-21T18:00:00Z", totalGames: 1, upcomingCount: 1, finishedCount: 0, standings: [] },
    { league: asLeagueId("laliga"), label: "LaLiga", sport: "football", season: "2026/27", roundLabel: "Jornada 14", generatedAt: "2026-11-21T18:00:00Z", totalGames: 1, upcomingCount: 1, finishedCount: 0, standings: [] },
    { league: asLeagueId("nba"), label: "NBA", sport: "basketball", season: "2026/27", roundLabel: "Temporada regular", generatedAt: "2026-11-21T18:00:00Z", totalGames: 1, upcomingCount: 1, finishedCount: 0, standings: [] },
    { league: asLeagueId("nfl"), label: "NFL", sport: "american-football", season: "2026", roundLabel: "Semana 11", generatedAt: "2026-11-21T18:00:00Z", totalGames: 1, upcomingCount: 1, finishedCount: 0, standings: [] },
    { league: asLeagueId("mlb"), label: "MLB", sport: "baseball", season: "2026", roundLabel: "Temporada regular", generatedAt: "2026-11-21T18:00:00Z", totalGames: 1, upcomingCount: 1, finishedCount: 0, standings: [] },
    { league: asLeagueId("nhl"), label: "NHL", sport: "ice-hockey", season: "2026/27", roundLabel: "Temporada regular", generatedAt: "2026-11-21T18:00:00Z", totalGames: 1, upcomingCount: 1, finishedCount: 0, standings: [] },
  ],
  games: PARLAY_MULTISPORT_GAMES,
  dailyPromoPickId: "promo-otro-juego",
  tipsterWeeklyPickId: "tipster-otro-juego",
  tipsterWeeklySlug: "sofia-nfl",
  isServerRedactedForVisitor: false,
};

const PARLAY_VISITOR_DATASET = redactDatasetForVisitor(PARLAY_MULTISPORT_DATASET);
const PARLAY_EMPTY_DATASET = buildPlatformDataset([]);

const SIX_LEG_CAP_PICKS: readonly MatchPick[] = [
  PARLAY_GAME_LMX_HOME,
  PARLAY_GAME_EPL_HOME,
  PARLAY_GAME_LALIGA_OVER,
  PARLAY_GAME_NBA_HOME,
  PARLAY_GAME_NFL_HOME,
  PARLAY_GAME_MLB_HOME,
];

const SGP_MULTISPORT_PICKS: readonly MatchPick[] = [
  PARLAY_GAME_LMX_HOME,
  PARLAY_GAME_LMX_OVER,
  PARLAY_GAME_NBA_HOME,
  PARLAY_GAME_NBA_OVER,
  PARLAY_GAME_NFL_HOME,
];

function ParlaySeedRunner({
  picks,
  allowSgp,
  oddsFormat = "decimal",
}: {
  readonly picks: readonly MatchPick[];
  readonly allowSgp: boolean;
  readonly oddsFormat?: OddsFormat;
}): null {
  const { loadParlayPicks, setAllowSgp, setOddsFormat } = usePlatformActions();
  const seededRef = useRef<string | null>(null);
  const seedKey = `${String(allowSgp)}:${oddsFormat}:${picks.map((p) => p.id).join(",")}`;

  useSafeEffect(() => {
    if (seededRef.current === seedKey) return;
    seededRef.current = seedKey;
    setOddsFormat(oddsFormat);
    setAllowSgp(allowSgp);
    if (picks.length > 0) {
      loadParlayPicks(picks, {
        allowSgp,
        label: allowSgp ? "Parlay SGP multi-deporte" : "Parlay 6 piernas tope",
      });
    }
  }, [allowSgp, loadParlayPicks, oddsFormat, picks, seedKey, setAllowSgp, setOddsFormat]);

  return null;
}

function ParlayBuilderStoryShell({
  dataset = PARLAY_MULTISPORT_DATASET,
  role = "member",
  initialPicks = [],
  allowSgp = false,
  mobile = false,
}: {
  readonly dataset?: PlatformDataset;
  readonly role?: "member" | "visitor";
  readonly initialPicks?: readonly MatchPick[];
  readonly allowSgp?: boolean;
  readonly mobile?: boolean;
}): React.JSX.Element {
  const providerKey = `${role}:${String(allowSgp)}:${initialPicks.map((p) => p.id).join(",")}:${dataset.games.length}`;
  return (
    <EmblemSurfaceProvider surface={role === "visitor" ? "public" : "app"}>
      <PlatformProvider key={providerKey} dataset={dataset} initialRole={role}>
        <ParlaySeedRunner picks={initialPicks} allowSgp={allowSgp} />
        {mobile ? (
          <div style={{ maxWidth: 375, width: "100%", margin: "0 auto" }}>
            <ParlayBuilderClubView />
          </div>
        ) : (
          <ParlayBuilderClubView />
        )}
      </PlatformProvider>
    </EmblemSurfaceProvider>
  );
}

export const ParlayBuilderBoletoVacioOscuro: Story = {
  globals: { theme: "dark" },
  render: () => <ParlayBuilderStoryShell />,
};

export const ParlayBuilderBoletoVacioClaro: Story = {
  ...ParlayBuilderBoletoVacioOscuro,
  globals: { theme: "light" },
};

export const ParlayBuilderSeisPiernasTopeOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <ParlayBuilderStoryShell initialPicks={SIX_LEG_CAP_PICKS} allowSgp={false} />
  ),
};

export const ParlayBuilderSeisPiernasTopeClaro: Story = {
  ...ParlayBuilderSeisPiernasTopeOscuro,
  globals: { theme: "light" },
};

export const ParlayBuilderSgpMultiDeporteOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <ParlayBuilderStoryShell initialPicks={SGP_MULTISPORT_PICKS} allowSgp />
  ),
};

export const ParlayBuilderSgpMultiDeporteClaro: Story = {
  ...ParlayBuilderSgpMultiDeporteOscuro,
  globals: { theme: "light" },
};

export const ParlayBuilderVisitanteCeroFugaOscuro: Story = {
  globals: { theme: "dark" },
  render: () => (
    <ParlayBuilderStoryShell dataset={PARLAY_VISITOR_DATASET} role="visitor" />
  ),
};

export const ParlayBuilderVisitanteCeroFugaClaro: Story = {
  ...ParlayBuilderVisitanteCeroFugaOscuro,
  globals: { theme: "light" },
};

export const ParlayBuilderCarteleraVaciaOscuro: Story = {
  globals: { theme: "dark" },
  render: () => <ParlayBuilderStoryShell dataset={PARLAY_EMPTY_DATASET} />,
};

export const ParlayBuilderCarteleraVaciaClaro: Story = {
  ...ParlayBuilderCarteleraVaciaOscuro,
  globals: { theme: "light" },
};

export const ParlayBuilderMovilOscuro: Story = {
  globals: { theme: "dark" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  render: () => (
    <ParlayBuilderStoryShell
      initialPicks={SGP_MULTISPORT_PICKS.slice(0, 3)}
      allowSgp
      mobile
    />
  ),
};

export const ParlayBuilderMovilClaro: Story = {
  ...ParlayBuilderMovilOscuro,
  globals: { theme: "light" },
};
