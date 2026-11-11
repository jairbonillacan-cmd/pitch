"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { AstryxScope } from "../../astryx";
import { BrandLogo, ThemeToggle } from "../../primitives";
import { LeagueBadge } from "../../sports";
import { journalRecord } from "../access-guard";
import { useAuraColors, usePlatform } from "../platform-provider";
import type { OddsFormat } from "../types";
import {
  MaestroIcon,
  RoleSwitcherPill,
  UltraTag,
  type MaestroIconName,
} from "./MaestroPrimitives";
import {
  AlertsDrawer,
  BetaPinModal,
  CommandPaletteModal,
  ParlayFloatingDock,
  PickComposerModal,
  RoleSimulatorBar,
  ShareTicketModal,
  ToastViewport,
  TopLayerModalDialog,
  valueAlertsFrom,
} from "./PlatformOverlays";

const RAIL_STORAGE_KEY = "pl-rail-collapsed";
/** Sobrevive al cambio de página (cada vista monta su propio shell) sin parpadeo. */
let railCollapsedMemory: boolean | null = null;

const LEAGUES_STORAGE_KEY = "pl-rail-leagues-open";
let leaguesOpenMemory: boolean | null = null;

/** Lista de ligas desplegable; empieza plegada para que el resto del riel respire. */
function usePersistentLeaguesOpen(): [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(leaguesOpenMemory ?? false);

  useEffect(() => {
    if (leaguesOpenMemory !== null) return;
    try {
      leaguesOpenMemory = window.localStorage.getItem(LEAGUES_STORAGE_KEY) === "1";
      setOpen(leaguesOpenMemory);
    } catch (err) {
      void err;
    }
  }, []);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      leaguesOpenMemory = next;
      try {
        window.localStorage.setItem(LEAGUES_STORAGE_KEY, next ? "1" : "0");
      } catch (err) {
        void err;
      }
      return next;
    });
  };

  return [open, toggle];
}

function usePersistentRailCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(railCollapsedMemory ?? false);

  useEffect(() => {
    if (railCollapsedMemory !== null) return;
    try {
      railCollapsedMemory = window.localStorage.getItem(RAIL_STORAGE_KEY) === "1";
      setCollapsed(railCollapsedMemory);
    } catch (err) {
      void err;
    }
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      railCollapsedMemory = next;
      try {
        window.localStorage.setItem(RAIL_STORAGE_KEY, next ? "1" : "0");
      } catch (err) {
        void err;
      }
      return next;
    });
  };

  return [collapsed, toggle];
}

export function OddsFormatSegment(): React.JSX.Element {
  const { oddsFormat, setOddsFormat } = usePlatform();
  return (
    <AstryxScope>
      <SegmentedControl
        label="Formato de momio"
        value={oddsFormat}
        onChange={(val) => setOddsFormat(val as OddsFormat)}
      >
        <SegmentedControlItem value="american" label="Momio" />
        <SegmentedControlItem value="decimal" label="Decimal" />
      </SegmentedControl>
    </AstryxScope>
  );
}

function FloatingQuickJumpBar({
  activePath,
}: {
  activePath?: string;
}): React.JSX.Element | null {
  const { rawDataset, openBetaPin, navigateTo, allowRoleSimulation } = usePlatform();
  const [collapsed, setCollapsed] = useState<boolean>(true);
  const [clientPath, setClientPath] = useState<string>(activePath ?? "");

  useEffect(() => {
    if (activePath) {
      setClientPath(activePath);
      return;
    }
    try {
      setClientPath(window.location.pathname);
    } catch (err) {
      void err;
    }
  }, [activePath]);

  const firstStudioHref = useMemo(() => {
    const firstUpcoming =
      rawDataset.games.find((g) => g.status !== "FT") ?? rawDataset.games[0];
    return firstUpcoming
      ? `/app/${firstUpcoming.league}/games/${firstUpcoming.id}`
      : "/app";
  }, [rawDataset.games]);

  const items = useMemo(
    () => [
      { id: "landing", label: "1. Landing", href: "/" },
      { id: "signup", label: "2. Acceso $0", href: "/signup" },
      { id: "jornada", label: "3. Jornada", href: "/app" },
      { id: "picks", label: "4. Picks del día", href: "/app/picks" },
      { id: "studio", label: "5. Estudio de Partido", href: firstStudioHref },
      { id: "parlays", label: "6. Parlays", href: "/app/parlays" },
      { id: "props", label: "7. Props", href: "/app/props" },
      { id: "social", label: "8. Comunidad VIP", href: "/app/social" },
      { id: "tipstar", label: "9. Portal Tipstar", href: "/app/tipstar" },
      { id: "referrals", label: "10. Referidos", href: "/app/account" },
      { id: "admin", label: "11. Admin", href: "/app/admin" },
    ],
    [firstStudioHref],
  );

  const handleJump = (targetHref: string) => {
    setClientPath(targetHref);
    if (targetHref.startsWith("/app") && rawDataset.isServerRedactedForVisitor) {
      openBetaPin(targetHref);
      return;
    }
    navigateTo(targetHref);
  };

  const isItemActive = (href: string, id: string) => {
    if (!clientPath) return false;
    if (id === "studio") {
      return clientPath.includes("/games/");
    }
    return clientPath === href;
  };

  if (!allowRoleSimulation) return null;

  return (
    <aside
      aria-label="Salto rápido de 11 vistas PitchLab"
      data-quick-jump-bar=""
      className="pl-quick-jump-bar glass-ring lg:max-w-[calc(100vw-16rem)]"
    >
      {collapsed ? (
        <button
          type="button"
          className="seg-btn text-xs min-h-7 px-3 inline-flex items-center gap-1.5 font-bold"
          aria-expanded={false}
          aria-label="Expandir barra rápida de 11 vistas"
          onClick={() => setCollapsed(false)}
        >
          <MaestroIcon name="sparkles" size={13} style={{ color: "var(--pl-brand)" }} />
          <span>11 Vistas Maestro</span>
          <MaestroIcon name="chevronRight" size={13} />
        </button>
      ) : (
        <>
          <span
            className="hidden xl:inline-flex items-center gap-1 pl-2 pr-1 text-[11px] font-extrabold shrink-0"
            style={{ color: "var(--pl-brand)" }}
          >
            <MaestroIcon name="sparkles" size={13} />
            <span>Maestro</span>
          </span>

          {items.map((item) => {
            const active = isItemActive(item.href, item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleJump(item.href)}
                data-active={active ? "true" : undefined}
                aria-current={active ? "page" : undefined}
                className="seg-btn text-[11px] min-h-7 px-2.5 shrink-0 whitespace-nowrap"
              >
                {item.label}
              </button>
            );
          })}

          <button
            type="button"
            className="pl-btn-glass rounded-full px-2 min-h-7 text-xs shrink-0"
            aria-expanded={true}
            aria-label="Colapsar barra rápida de 11 vistas"
            onClick={() => setCollapsed(true)}
          >
            <MaestroIcon name="x" size={13} />
          </button>
        </>
      )}
    </aside>
  );
}

/*
 * El layout del club monta el escenario y el shell (encabezado + barra lateral) una sola vez.
 * Las vistas los siguen declarando; si ya hay uno montado más arriba, solo devuelven su
 * contenido. Así cambiar de página no vuelve a montar ni el encabezado ni la barra lateral.
 */
const StageMountedContext = createContext(false);
const ShellMountedContext = createContext(false);

export function AtmosphereStage(props: {
  children: React.ReactNode;
  activePath?: string;
}): React.JSX.Element {
  if (useContext(StageMountedContext)) return <>{props.children}</>;
  return (
    <StageMountedContext.Provider value>
      <AtmosphereStageImpl {...props} />
    </StageMountedContext.Provider>
  );
}

export function ClubWorkspaceShell(props: {
  activePath: string;
  children: React.ReactNode;
}): React.JSX.Element {
  if (useContext(ShellMountedContext)) return <>{props.children}</>;
  return (
    <ShellMountedContext.Provider value>
      <ClubWorkspaceShellImpl {...props} />
    </ShellMountedContext.Provider>
  );
}

/** Escenario + shell para el layout de /app (se montan una vez por sesión de navegación). */
export function ClubLayoutShell({
  activePath,
  children,
}: {
  activePath: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <AtmosphereStage activePath={activePath}>
      <ClubWorkspaceShell activePath={activePath}>{children}</ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

function AtmosphereStageImpl({
  children,
  activePath,
}: {
  children: React.ReactNode;
  activePath?: string;
}): React.JSX.Element {
  const auraColors = useAuraColors();

  return (
    <div
      className="pl-stage"
      style={
        {
          "--home-color": auraColors[0],
          "--away-color": auraColors[1],
        } as React.CSSProperties
      }
    >
      <a className="skip-link" href="#main">
        Saltar al contenido principal
      </a>

      <div className="pl-atmo" aria-hidden="true">
        <div className="pl-atmo-canvas">
          <div className="pl-aura pl-aura--home" />
          <div className="pl-aura pl-aura--away" />
        </div>
        <div className="pl-atmo-scrim" />
      </div>

      <div className="relative z-10 pb-20 lg:pb-4">{children}</div>

      <FloatingQuickJumpBar activePath={activePath} />
      <ParlayFloatingDock />
      <PickComposerModal />
      <ShareTicketModal />
      <AlertsDrawer />
      <CommandPaletteModal />
      <BetaPinModal />
      <RoleSimulatorBar />
      <ToastViewport />
    </div>
  );
}

export function PublicHeaderV4({
  activePath = "/",
}: {
  activePath?: string;
}): React.JSX.Element {
  const { navigateTo, openBetaPin, viewerRole } = usePlatform();

  const navItems = [
    { href: "/", label: "Inicio" },
    { href: "/tecnologia", label: "Cómo funciona" },
    { href: "/p/sofia-sem", label: "Pick gratis" },
    { href: "/pricing", label: "Precios" },
  ];

  return (
    <header className="sticky top-0 z-30 glass-nav-surface">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-6">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigateTo("/");
            }}
            className="inline-flex items-center gap-2 no-underline"
            aria-label="PitchLab Inicio"
          >
            <BrandLogo variant="horizontal" width={128} height={25} alt="" />
          </a>

          <nav aria-label="Navegación principal" className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => {
              const active = activePath === item.href;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo(item.href);
                  }}
                  className="seg-btn"
                  data-active={active ? "true" : undefined}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <OddsFormatSegment />
          </div>
          <ThemeToggle shape="pill" />

          {viewerRole !== "visitor" ? (
            <a
              href="/app"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/app");
              }}
              className="pl-btn-primary text-xs min-h-9 px-3.5 inline-flex items-center gap-1.5"
            >
              <span>Entrar</span>
              <MaestroIcon name="arrowRight" size={14} />
            </a>
          ) : (
            <>
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-9 px-3 hidden sm:inline-flex items-center gap-1.5"
                onClick={() => openBetaPin("/app")}
              >
                <MaestroIcon name="lock" size={13} />
                <span>PIN Socio</span>
              </button>
              <a
                href="/login"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/login");
                }}
                className="pl-btn-glass text-xs min-h-9 px-3"
              >
                Entrar
              </a>
              <a
                href="/signup"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/signup");
                }}
                className="pl-btn-primary text-xs min-h-9 px-3.5 inline-flex items-center gap-1.5"
              >
                <span>Prueba gratis</span>
                <MaestroIcon name="arrowRight" size={13} />
              </a>
            </>
          )}
        </div>
      </div>

      {/* Sub-barra móvil compacta */}
      <nav
        aria-label="Secciones públicas móvil"
        className="lg:hidden flex items-center gap-1 px-4 pb-2.5 overflow-x-auto"
      >
        {navItems.map((item) => {
          const active = activePath === item.href;
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigateTo(item.href);
              }}
              className="seg-btn text-xs"
              data-active={active ? "true" : undefined}
            >
              {item.label}
            </a>
          );
        })}
      </nav>
    </header>
  );
}

export const PublicGlassHeader = PublicHeaderV4;

export function PublicFooterV4(): React.JSX.Element {
  const { navigateTo } = usePlatform();

  return (
    <footer className="relative z-10 mt-16 hairline-t py-10 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <BrandLogo variant="horizontal" width={120} height={24} alt="" />
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Probabilidades deportivas para mayores de 18 años. PitchLab no es una casa de apuestas
            y no garantiza ganancias.
          </p>
        </div>

        <nav aria-label="Enlaces legales" className="flex flex-wrap items-center gap-4 text-xs font-semibold">
          <a
            href="/tecnologia"
            onClick={(e) => {
              e.preventDefault();
              navigateTo("/tecnologia");
            }}
            className="no-underline hover:underline"
          >
            Cómo funciona
          </a>
          <a
            href="/pricing"
            onClick={(e) => {
              e.preventDefault();
              navigateTo("/pricing");
            }}
            className="no-underline hover:underline"
          >
            Precios
          </a>
          <a href="/legal/terminos" className="no-underline hover:underline">
            Términos
          </a>
          <a href="/legal/privacidad" className="no-underline hover:underline">
            Privacidad
          </a>
          <a href="/legal/juego-responsable" className="no-underline hover:underline">
            Juego responsable
          </a>
          <a href="/legal/creditos" className="no-underline hover:underline">
            Créditos de datos
          </a>
        </nav>
      </div>
    </footer>
  );
}

interface RailNavItem {
  href: string;
  label: string;
  icon: MaestroIconName;
  badge?: string;
  badgeBrand?: boolean;
  liveDot?: boolean;
}

interface RailNavGroup {
  title: string;
  items: RailNavItem[];
}

const CLUB_FOOTER_LINKS = [
  { href: "/tecnologia", label: "Cómo funciona" },
  { href: "/pricing", label: "Precios" },
  { href: "/legal/terminos", label: "Términos" },
  { href: "/legal/privacidad", label: "Privacidad" },
  { href: "/legal/juego-responsable", label: "Juego responsable" },
  { href: "/legal/creditos", label: "Créditos de datos" },
] as const;

/** Pie compacto del club: cierra la página sin dejar un hueco vacío al final. */
function ClubFooter(): React.JSX.Element {
  const { navigateTo } = usePlatform();
  return (
    <footer className="pl-club-footer">
      <span>
        © {new Date().getFullYear()} PitchLab · Para mayores de 18 años. No somos casa de apuestas.
      </span>
      <nav aria-label="Enlaces del pie">
        {CLUB_FOOTER_LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            onClick={(e) => {
              e.preventDefault();
              navigateTo(l.href);
            }}
          >
            {l.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}

function ClubWorkspaceShellImpl({
  activePath,
  children,
}: {
  activePath: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    parlayLegs,
    journal,
    setAlertsOpen,
    setCmdkOpen,
    logoutSession,
    navigateTo,
  } = usePlatform();

  const [collapsed, toggleCollapsed] = usePersistentRailCollapsed();
  const [leaguesOpen, toggleLeagues] = usePersistentLeaguesOpen();
  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  // id único por instancia: durante la carga conviven dos encabezados.
  const profileMenuId = `pl-profile-menu${useId().replace(/:/g, "")}`;
  const [profileMenuOpen, setProfileMenuOpen] = useState<boolean>(false);
  useEffect(() => {
    const menu = profileMenuRef.current;
    if (!menu) return;
    const onToggle = (e: Event) => setProfileMenuOpen((e as ToggleEvent).newState === "open");
    menu.addEventListener("toggle", onToggle);
    return () => menu.removeEventListener("toggle", onToggle);
  }, []);
  const closeProfileMenu = () => {
    try {
      profileMenuRef.current?.hidePopover();
    } catch (err) {
      void err;
    }
  };
  const [mobileMoreOpen, setMobileMoreOpen] = useState<boolean>(false);
  const valueAlertCount = useMemo(() => valueAlertsFrom(dataset.games).length, [dataset.games]);

  // Navegación: 4 destinos principales, las ligas y un grupo «Más» para lo secundario.
  // El portal de tipstars y la consola solo aparecen para quien los usa.
  const railGroups: RailNavGroup[] = useMemo(() => {
    const more: RailNavItem[] = [
      { href: "/app/picks", label: "Picks del día", icon: "sparkles" },
      { href: "/app/momios", label: "Momios y ventaja", icon: "activity" },
      { href: "/app/historial", label: "Resultados", icon: "shield" },
      { href: "/app/social", label: "Comunidad", icon: "users" },
      { href: "/app/props", label: "Props de jugadores", icon: "sliders" },
      { href: "/app/tech", label: "Cómo calculamos", icon: "cpu" },
    ];
    if (viewerRole === "tipstar" || viewerRole === "admin") {
      more.push({ href: "/app/tipstar", label: "Portal tipstar", icon: "crown" });
    }
    if (viewerRole === "admin") {
      more.push({ href: "/app/admin", label: "Consola", icon: "chart" });
    }
    return [
      { title: "Club", items: primaryNavItems(parlayLegs.length, journal.length) },
      { title: "Más", items: more },
    ];
  }, [journal.length, parlayLegs.length, viewerRole]);

  const allClubItems = useMemo(
    () => railGroups.flatMap((g) => g.items),
    [railGroups],
  );

  const profileHandle = viewerRole === "tipstar" ? "@sofia_nfl" : "@jair";
  // Tipstar: perfil de ejemplo. Socio: récord real de su Bitácora.
  const myRecord = journalRecord(journal);
  const profileUnits =
    viewerRole === "tipstar"
      ? "Ejemplo"
      : myRecord.settled > 0
        ? `${myRecord.netUnits >= 0 ? "+" : ""}${myRecord.netUnits.toFixed(1)}u`
        : "0 picks";
  const profileInitials = viewerRole === "tipstar" ? "SM" : "JR";
  const profileGrad =
    viewerRole === "tipstar" ? "var(--avatar-grad-1)" : "var(--avatar-grad-2)";

  return (
    <>
      <header className="panel-header sticky top-0 z-30 glass-nav-surface">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2.5">
          {/* Izquierda: Logo a / + Buscador inline + Selector de Rol */}
          <div className="flex items-center gap-3 min-w-0">
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/");
              }}
              className="inline-flex items-center gap-2 no-underline shrink-0"
              aria-label="PitchLab Inicio"
            >
              <BrandLogo variant="horizontal" width={120} height={24} alt="" />
            </a>

            <button
              type="button"
              className="pl-btn-glass text-xs min-h-9 px-3 inline-flex items-center justify-between gap-3 md:min-w-[230px] lg:min-w-[265px]"
              aria-label="Buscar"
              onClick={() => setCmdkOpen(true)}
            >
              <span className="inline-flex items-center gap-2 truncate" style={{ color: "var(--pl-text-secondary)" }}>
                <MaestroIcon name="search" size={14} />
                <span className="hidden sm:inline truncate">
                  Buscar partido, liga o @socio...
                </span>
              </span>
              <kbd
                className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold num shrink-0"
                style={{
                  background: "var(--pl-surface-elevated)",
                  border: "1px solid var(--pl-border)",
                  color: "var(--pl-text-muted)",
                }}
              >
                ⌘K
              </kbd>
            </button>

            <div className="hidden xl:block shrink-0">
              <RoleSwitcherPill compact />
            </div>
          </div>

          {/* Derecha: Campana (2), Momio/Decimal, Tema, Chip Perfil @jair/@sofia_nfl, Salir */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="pl-btn-glass px-2.5 min-h-9 relative inline-flex items-center gap-1.5"
              aria-label={`Abrir alertas de valor (${valueAlertCount})`}
              onClick={() => setAlertsOpen(true)}
            >
              <MaestroIcon name="bell" size={15} />
              {valueAlertCount > 0 ? (
                <span className="pl-pill pl-pill--brand text-[10px] px-1.5 py-0 num">
                  {valueAlertCount}
                </span>
              ) : null}
            </button>

            {/* Chip de perfil: abre el menú con perfil, cuenta, momios, tema y salir. */}
            <button
              ref={profileTriggerRef}
              type="button"
              popoverTarget={profileMenuId}
              className="pl-btn-glass min-h-9 px-2 sm:px-2.5 inline-flex items-center gap-2 text-xs"
              aria-haspopup="dialog"
              aria-expanded={profileMenuOpen}
              aria-label={`Menú de ${profileHandle}`}
              data-profile-menu-trigger=""
              onClick={() => {
                // Antes de abrir: colocar el panel bajo el chip, alineado a su borde derecho.
                const rect = profileTriggerRef.current?.getBoundingClientRect();
                const menu = profileMenuRef.current;
                if (rect && menu) {
                  menu.style.top = `${rect.bottom + 8}px`;
                  menu.style.right = `${Math.max(8, document.documentElement.clientWidth - rect.right)}px`;
                }
              }}
            >
              <span
                className="size-6 rounded-full inline-flex items-center justify-center text-[10px] font-extrabold shrink-0"
                style={{ background: profileGrad, color: "var(--pl-on-solid)" }}
                aria-hidden="true"
              >
                {profileInitials}
              </span>
              <span className="hidden sm:inline font-bold truncate max-w-[92px]">{profileHandle}</span>
              {viewerRole !== "visitor" ? <UltraTag className="hidden lg:inline-flex" /> : null}
            </button>

            <div
              id={profileMenuId}
              ref={profileMenuRef}
              popover="auto"
              className="pl-profile-menu"
              role="dialog"
              aria-label="Menú de tu cuenta"
            >
              <div className="pl-profile-menu-head">
                <span
                  className="size-10 rounded-full inline-flex items-center justify-center text-xs font-extrabold shrink-0"
                  style={{ background: profileGrad, color: "var(--pl-on-solid)" }}
                  aria-hidden="true"
                >
                  {profileInitials}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <strong className="text-sm truncate">{profileHandle}</strong>
                    {viewerRole !== "visitor" ? <UltraTag /> : null}
                  </div>
                  <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                    {profileUnits}
                  </span>
                </div>
              </div>

              <nav className="pl-profile-menu-group" aria-label="Tu cuenta">
                <a
                  href={`/app/u/${profileHandle.replace(/^@/, "")}`}
                  onClick={(e) => {
                    e.preventDefault();
                    closeProfileMenu();
                    navigateTo(`/app/u/${profileHandle.replace(/^@/, "")}`);
                  }}
                >
                  <MaestroIcon name="users" size={15} />
                  <span>Ver mi perfil</span>
                </a>
                <a
                  href="/app/account"
                  onClick={(e) => {
                    e.preventDefault();
                    closeProfileMenu();
                    navigateTo("/app/account");
                  }}
                >
                  <MaestroIcon name="gift" size={15} />
                  <span>Mi cuenta e invitaciones</span>
                </a>
              </nav>

              <div className="pl-profile-menu-group">
                <div className="pl-profile-menu-row">
                  <span>Formato de momio</span>
                  <OddsFormatSegment />
                </div>
                <div className="pl-profile-menu-row">
                  <span>Tema claro u oscuro</span>
                  <ThemeToggle shape="pill" />
                </div>
              </div>

              <div className="pl-profile-menu-group">
                <button
                  type="button"
                  className="pl-profile-menu-logout"
                  onClick={() => {
                    closeProfileMenu();
                    void logoutSession();
                  }}
                >
                  <MaestroIcon name="arrowRight" size={15} />
                  <span>Salir</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tira móvil/tablet de ligas rápidas */}
        <nav
          aria-label="Ligas rápidas móvil"
          className="lg:hidden flex items-center gap-1 px-4 pb-2.5 overflow-x-auto"
        >
          {dataset.leagues.map((lg) => {
            const href = `/app/${lg.league}`;
            const isCurrent = activePath === href || activePath.startsWith(`${href}/`);
            return (
              <a
                key={lg.league}
                href={href}
                data-league={lg.league}
                aria-current={isCurrent ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo(href);
                }}
                className="league-tab seg-btn text-xs shrink-0"
                data-active={isCurrent ? "true" : undefined}
              >
                <LeagueBadge league={lg.league} label={lg.label} size={15} />
                <span>{lg.label}</span>
              </a>
            );
          })}
        </nav>
      </header>

      <div className="app-frame" data-collapsed={collapsed ? "true" : "false"}>
        <aside className="app-rail glass-ring" aria-label="Menú del Club PitchLab">
          <div className="rail-top">
            <span
              className="rail-hide-collapsed text-xs font-semibold"
              style={{ color: "var(--pl-text-muted)" }}
            >
              Club
            </span>
            <button
              type="button"
              className="rail-toggle"
              aria-label={collapsed ? "Expandir barra lateral" : "Plegar barra lateral"}
              aria-expanded={!collapsed}
              onClick={toggleCollapsed}
            >
              <MaestroIcon name="chevronRight" size={14} />
            </button>
          </div>

          {[railGroups[0]!].map((group) => (
            <div key={group.title} className="space-y-1">
              <nav aria-label={group.title} className="space-y-0.5">
                {group.items.map((item) => {
                  const active = activePath === item.href;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo(item.href);
                      }}
                      className="rail-item justify-between"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <MaestroIcon
                          name={item.icon}
                          size={15}
                          style={{
                            color: active ? "var(--pl-brand)" : "var(--pl-text-secondary)",
                          }}
                        />
                        <span className="rail-hide-collapsed truncate">{item.label}</span>
                      </span>

                      {!collapsed && item.liveDot ? (
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ background: "var(--pl-success)" }}
                          aria-label="Actividad en vivo"
                        />
                      ) : null}

                      {!collapsed && item.badge ? (
                        <span
                          className={`pl-pill num text-[10px] ${item.badgeBrand ? "pl-pill--brand" : ""}`}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </a>
                  );
                })}
              </nav>
            </div>
          ))}

          <div className="ticket-perf my-1.5" />

          <div className="space-y-0.5">
            <button
              type="button"
              className="rail-item rail-group-toggle justify-between"
              aria-expanded={leaguesOpen}
              aria-controls="rail-leagues"
              title={collapsed ? "Ligas" : undefined}
              onClick={toggleLeagues}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <MaestroIcon name="trophy" size={15} style={{ color: "var(--pl-text-secondary)" }} />
                <span className="rail-hide-collapsed truncate">Ligas</span>
              </span>
              <MaestroIcon name="chevronRight" size={13} className="rail-hide-collapsed rail-group-chevron" />
            </button>
            <div
              id="rail-leagues"
              className="rail-collapsible"
              data-open={leaguesOpen ? "true" : "false"}
              inert={!leaguesOpen}
            >
            <nav aria-label="Ligas" className="rail-collapsible-inner space-y-0.5">
              {dataset.leagues.map((lg) => {
                const href = `/app/${lg.league}`;
                const active = activePath === href || activePath.startsWith(`${href}/`);
                return (
                  <a
                    key={lg.league}
                    href={href}
                    data-league={lg.league}
                    aria-current={active ? "page" : undefined}
                    title={collapsed ? lg.label : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateTo(href);
                    }}
                    className="league-tab rail-item justify-between"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <LeagueBadge league={lg.league} label={lg.label} size={18} />
                      <span className="rail-hide-collapsed truncate">{lg.label}</span>
                    </span>
                    <span
                      className="rail-hide-collapsed text-xs num font-semibold"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      {lg.upcomingCount || lg.totalGames}
                    </span>
                  </a>
                );
              })}
            </nav>
            </div>
          </div>
          <div className="ticket-perf my-1.5" />

          {[railGroups[1]!].map((group) => (
            <div key={group.title} className="space-y-1">
              <span
                className="rail-hide-collapsed rail-heading"
                style={{ color: "var(--pl-text-muted)" }}
              >
                {group.title}
              </span>
              <nav aria-label={group.title} className="space-y-0.5">
                {group.items.map((item) => {
                  const active = activePath === item.href;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      title={collapsed ? item.label : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo(item.href);
                      }}
                      className="rail-item justify-between"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <MaestroIcon
                          name={item.icon}
                          size={15}
                          style={{
                            color: active ? "var(--pl-brand)" : "var(--pl-text-secondary)",
                          }}
                        />
                        <span className="rail-hide-collapsed truncate">{item.label}</span>
                      </span>

                      {!collapsed && item.liveDot ? (
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ background: "var(--pl-success)" }}
                          aria-label="Actividad en vivo"
                        />
                      ) : null}

                      {!collapsed && item.badge ? (
                        <span
                          className={`pl-pill num text-[10px] ${item.badgeBrand ? "pl-pill--brand" : ""}`}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </a>
                  );
                })}
              </nav>
            </div>
          ))}

        </aside>

        <main id="main" className="min-w-0 space-y-6">
          <div className="xl:hidden flex flex-wrap items-center justify-between gap-2">
            <RoleSwitcherPill compact />
          </div>
          <div key={activePath} className="pl-page-enter space-y-6">
            {children}
          </div>
          <ClubFooter />
        </main>
      </div>

      {/* Barra inferior móvil: los 4 destinos principales y «Más» */}
      <nav
        aria-label="Navegación móvil del Club"
        className="mobile-dock glass-pill-bar glass-ring"
      >
        {(
          [
            ...primaryNavItems(parlayLegs.length, journal.length).map((i) => ({
              href: i.href,
              label: i.shortLabel ?? i.label,
              icon: i.icon,
            })),
          ] as const
        ).map((item) => {
          const active = activePath === item.href;
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigateTo(item.href);
              }}
              className="seg-btn flex-col justify-center gap-0.5 text-[11px] px-1 py-1"
              data-active={active ? "true" : undefined}
            >
              <MaestroIcon name={item.icon} size={15} />
              <span className="truncate max-w-full">{item.label}</span>
            </a>
          );
        })}
        <button
          type="button"
          aria-expanded={mobileMoreOpen}
          onClick={() => setMobileMoreOpen(true)}
          className="seg-btn flex-col justify-center gap-0.5 text-[11px] px-1 py-1"
        >
          <MaestroIcon name="layers" size={15} />
          <span>Más</span>
        </button>
      </nav>

      <TopLayerModalDialog
        open={mobileMoreOpen}
        onClose={() => setMobileMoreOpen(false)}
        ariaLabelledBy="mobile-more-dialog-title"
        maxWidth="24rem"
      >
        <div className="glass-lens glass-ring w-full rounded-2xl p-5 space-y-4 max-h-[82vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <h2 id="mobile-more-dialog-title" className="m-0 text-base font-bold">
              Más del Club
            </h2>
            <button
              type="button"
              autoFocus
              className="pl-btn-glass px-2.5 min-h-8 inline-flex items-center justify-center"
              aria-label="Cerrar menú móvil"
              onClick={() => setMobileMoreOpen(false)}
            >
              <MaestroIcon name="x" size={14} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {allClubItems.map((m) => (
              <a
                key={m.href}
                href={m.href}
                onClick={(e) => {
                  e.preventDefault();
                  setMobileMoreOpen(false);
                  navigateTo(m.href);
                }}
                className="pl-btn-glass text-xs justify-start gap-2"
              >
                <MaestroIcon name={m.icon} size={14} />
                <span className="truncate">{m.label}</span>
              </a>
            ))}
          </div>

          <div className="ticket-perf" />

          <div className="grid grid-cols-2 gap-2">
            {dataset.leagues.map((lg) => (
              <a
                key={lg.league}
                href={`/app/${lg.league}`}
                onClick={(e) => {
                  e.preventDefault();
                  setMobileMoreOpen(false);
                  navigateTo(`/app/${lg.league}`);
                }}
                className="pl-btn-glass text-xs justify-start gap-2"
              >
                <LeagueBadge league={lg.league} label={lg.label} size={16} />
                <span className="truncate">{lg.label}</span>
              </a>
            ))}
          </div>

          <div className="pt-2 flex items-center justify-between text-xs">
            <a href="/legal/juego-responsable" className="underline">
              Ayuda y juego responsable +18
            </a>
            <OddsFormatSegment />
          </div>
        </div>
      </TopLayerModalDialog>
    </>
  );
}

interface PrimaryNavItem extends RailNavItem {
  shortLabel?: string;
}

/** Los 4 destinos principales, iguales en el riel y en el dock móvil. */
function primaryNavItems(parlayCount: number, journalCount: number): PrimaryNavItem[] {
  return [
    { href: "/app", label: "Hoy", icon: "calendar" },
    {
      href: "/app/parlays",
      label: "Armar parlay",
      shortLabel: parlayCount > 0 ? `Parlay (${parlayCount})` : "Parlay",
      icon: "layers",
      badge: parlayCount > 0 ? `${parlayCount}` : undefined,
      badgeBrand: parlayCount > 0,
    },
    {
      href: "/app/lab",
      label: "Mi bitácora",
      shortLabel: "Bitácora",
      icon: "ticket",
      badge: journalCount > 0 ? `${journalCount}` : undefined,
    },
    { href: "/app/account", label: "Cuenta", icon: "gift" },
  ];
}
