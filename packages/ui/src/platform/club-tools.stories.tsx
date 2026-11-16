import React, { useEffect, useRef } from "react";
import { ClubTechView } from "./club/ClubTechView";
import { OddsCompareClubView } from "./club/OddsCompareView";
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
import { PlatformProvider, usePlatform } from "./platform-provider";
import { STORY_DATASET } from "./story-fixtures";

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

export default {
  title: "PitchLab v4 / Herramientas del club",
  parameters: { layout: "fullscreen" },
};

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
  "chevronDown", "dots", "flag", "pin",
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
  useEffect(() => {
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
