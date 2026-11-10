"use client";

import React, { useEffect, useMemo, useState } from "react";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { AstryxScope } from "../../astryx.js";
import { BrandLogo, ThemeToggle } from "../../primitives.js";
import { LeagueBadge } from "../../sports.js";
import { usePlatform } from "../platform-provider.js";
import type { OddsFormat } from "../types.js";
import {
  MaestroIcon,
  RoleSwitcherPill,
  type MaestroIconName,
} from "./MaestroPrimitives.js";
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
} from "./PlatformOverlays.js";

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
}): React.JSX.Element {
  const { rawDataset, submitBetaPin, navigateTo } = usePlatform();
  const [collapsed, setCollapsed] = useState<boolean>(false);
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
      { id: "picks", label: "4. Multi-Picks", href: "/app/picks" },
      { id: "studio", label: "5. Estudio 5 Picks", href: firstStudioHref },
      { id: "parlays", label: "6. Parlays SGP", href: "/app/parlays" },
      { id: "props", label: "7. Props Lab", href: "/app/props" },
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
      void submitBetaPin("2026", targetHref);
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
            className="hidden xl:inline-flex items-center gap-1 pl-2 pr-1 text-[11px] font-extrabold uppercase tracking-wider shrink-0"
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

export function AtmosphereStage({
  children,
  activePath,
}: {
  children: React.ReactNode;
  activePath?: string;
}): React.JSX.Element {
  const { auraColors } = usePlatform();

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

      <div className="relative z-10 pb-20">{children}</div>

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
    { href: "/tecnologia", label: "Tecnología & Precisión" },
    { href: "/p/sofia-sem", label: "Pick Gratis Semanal" },
    { href: "/pricing", label: "Pase Total $299" },
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
              <span>Entrar al Club</span>
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
            PitchLab Spacetime Suite v2.1 · Inteligencia cuantitativa deportiva para mayores de 18
            años (+18). Todas las métricas operan en unidades simuladas de análisis (0.5u–5.0u); no
            somos casa de apuestas ni garantizamos ganancias.
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
            Tecnología & Precisión
          </a>
          <a
            href="/pricing"
            onClick={(e) => {
              e.preventDefault();
              navigateTo("/pricing");
            }}
            className="no-underline hover:underline"
          >
            Pase Total & Referidos
          </a>
          <a href="/legal/terminos" className="no-underline hover:underline">
            Términos
          </a>
          <a href="/legal/privacidad" className="no-underline hover:underline">
            Privacidad
          </a>
          <a href="/legal/juego-responsable" className="no-underline hover:underline">
            Juego responsable +18
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

export function ClubWorkspaceShell({
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

  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState<boolean>(false);

  const railGroups: RailNavGroup[] = useMemo(
    () => [
      {
        title: "Spacetime Club",
        items: [
          {
            href: "/app",
            label: "Jornada",
            icon: "calendar",
          },
          {
            href: "/app/picks",
            label: "Multi-Picks hoy",
            icon: "sparkles",
          },
          {
            href: "/app/parlays",
            label: "Armar Parlays",
            icon: "layers",
            badge: `${parlayLegs.length}`,
            badgeBrand: parlayLegs.length > 0,
          },
          {
            href: "/app/social",
            label: "Comunidad VIP",
            icon: "users",
            liveDot: true,
          },
          {
            href: "/app/lab",
            label: "Mi bitácora",
            icon: "ticket",
            badge: `${journal.length}`,
          },
        ],
      },
      {
        title: "Motores & Labs",
        items: [
          {
            href: "/app/tech",
            label: "Tecnología & Precisión",
            icon: "cpu",
          },
          {
            href: "/app/props",
            label: "Player Props Lab",
            icon: "sliders",
          },
          {
            href: "/app/momios",
            label: "Momios & Geodesic",
            icon: "activity",
          },
          {
            href: "/app/historial",
            label: "Resultados cerrados",
            icon: "shield",
          },
        ],
      },
      {
        title: "Crecimiento",
        items: [
          {
            href: "/app/tipstar",
            label: "Portal Tipstar",
            icon: "crown",
            badge: "1/sem",
            badgeBrand: true,
          },
          {
            href: "/app/account",
            label: "Referidos (+15d)",
            icon: "gift",
          },
          {
            href: "/app/admin",
            label: "Admin Founder",
            icon: "chart",
          },
        ],
      },
    ],
    [journal.length, parlayLegs.length],
  );

  const allClubItems = useMemo(
    () => railGroups.flatMap((g) => g.items),
    [railGroups],
  );

  const profileHandle = viewerRole === "tipstar" ? "@sofia_nfl" : "@jair";
  const profileUnits = viewerRole === "tipstar" ? "+18.4u" : "+6.1u";
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
                <span className="sm:hidden">Buscar</span>
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
              aria-label="Abrir centro de alertas 60m (2 sin leer)"
              onClick={() => setAlertsOpen(true)}
            >
              <MaestroIcon name="bell" size={15} />
              <span className="pl-pill pl-pill--brand text-[10px] px-1.5 py-0 num">
                2
              </span>
            </button>

            <div className="hidden md:block">
              <OddsFormatSegment />
            </div>

            <ThemeToggle shape="pill" />

            <a
              href="/app/u/sofia_nfl"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/app/u/sofia_nfl");
              }}
              className="pl-btn-glass min-h-9 px-2.5 hidden sm:inline-flex items-center gap-2 text-xs no-underline"
              aria-label={`Ver perfil verificado ${profileHandle} (${profileUnits})`}
            >
              <span
                className="size-5 rounded-full inline-flex items-center justify-center text-[10px] font-extrabold shrink-0"
                style={{
                  background: profileGrad,
                  color: "var(--pl-on-solid)",
                }}
                aria-hidden="true"
              >
                {profileInitials}
              </span>
              <span className="font-bold truncate max-w-[92px]">{profileHandle}</span>
              <span
                className="font-extrabold num hidden lg:inline"
                style={{ color: "var(--pl-success)" }}
              >
                {profileUnits}
              </span>
            </a>

            <button
              type="button"
              className="pl-btn-glass text-xs min-h-9 px-2.5"
              onClick={() => {
                void logoutSession();
              }}
            >
              Salir
            </button>
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
          <div className="flex items-center justify-between px-2 pb-1">
            <span
              className="rail-hide-collapsed text-[11px] font-extrabold uppercase tracking-wider"
              style={{ color: "var(--pl-brand)" }}
            >
              PitchLab Club
            </span>
            <button
              type="button"
              className="pl-btn-glass px-2 min-h-7 text-xs inline-flex items-center justify-center"
              aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
              onClick={() => setCollapsed((c) => !c)}
            >
              <MaestroIcon name={collapsed ? "chevronRight" : "arrowLeft"} size={14} />
            </button>
          </div>

          {railGroups.map((group, groupIdx) => (
            <div key={group.title} className="space-y-1">
              {groupIdx > 0 ? <div className="ticket-perf my-1.5" /> : null}
              <span
                className="rail-hide-collapsed px-2 pt-1 text-[10px] font-extrabold uppercase tracking-wider block"
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

          <div className="ticket-perf my-1.5" />

          <div className="space-y-1">
            <span
              className="rail-hide-collapsed px-2 pt-1 text-[10px] font-extrabold uppercase tracking-wider block"
              style={{ color: "var(--pl-text-muted)" }}
            >
              7 Ligas
            </span>
            <nav aria-label="7 Ligas" className="space-y-0.5">
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
        </aside>

        <main id="main" className="min-w-0 space-y-6">
          <div className="xl:hidden flex flex-wrap items-center justify-between gap-2">
            <RoleSwitcherPill compact />
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-8 px-3 lg:hidden inline-flex items-center gap-1.5"
              aria-expanded={mobileMoreOpen}
              onClick={() => setMobileMoreOpen(true)}
            >
              <MaestroIcon name="layers" size={14} />
              <span>Todos los módulos</span>
            </button>
          </div>
          {children}
        </main>
      </div>

      {/* Barra inferior móvil con 5 ítems exactos */}
      <nav
        aria-label="Navegación móvil del Club"
        className="mobile-dock glass-pill-bar glass-ring"
      >
        {(
          [
            { href: "/app", label: "Jornada", icon: "calendar" as MaestroIconName },
            { href: "/app/picks", label: "Picks", icon: "sparkles" as MaestroIconName },
            {
              href: "/app/parlays",
              label: parlayLegs.length > 0 ? `Parlays (${parlayLegs.length})` : "Parlays",
              icon: "layers" as MaestroIconName,
            },
            { href: "/app/social", label: "VIP", icon: "users" as MaestroIconName },
            { href: "/app/account", label: "Referidos", icon: "gift" as MaestroIconName },
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
              Todo el Club PitchLab
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
