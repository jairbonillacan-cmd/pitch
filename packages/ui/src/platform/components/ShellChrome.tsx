"use client";

import React, { useState } from "react";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { AstryxScope } from "../../astryx.js";
import { Icon } from "../../icons.js";
import { BrandLogo, ThemeToggle } from "../../primitives.js";
import { LeagueBadge } from "../../sports.js";
import { usePlatform } from "../platform-provider.js";
import type { OddsFormat } from "../types.js";
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

export function AtmosphereStage({
  children,
}: {
  children: React.ReactNode;
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

      <div className="relative z-10">{children}</div>

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
              className="pl-btn-primary text-xs min-h-9 px-3.5"
            >
              Entrar al Club →
            </a>
          ) : (
            <>
              <button
                type="button"
                className="pl-btn-glass text-xs min-h-9 px-3 hidden sm:inline-flex"
                onClick={() => openBetaPin("/app")}
              >
                PIN Socio
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
                className="pl-btn-primary text-xs min-h-9 px-3.5"
              >
                Prueba gratis
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
    setAlertsOpen,
    setCmdkOpen,
    logoutSession,
    navigateTo,
  } = usePlatform();

  const [collapsed, setCollapsed] = useState<boolean>(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState<boolean>(false);

  const clubModules = [
    { href: "/app", label: "Jornada de Hoy", badge: `${dataset.games.filter((g) => g.status !== "FT").length}` },
    { href: "/app/picks", label: "Multi-Picks (4–5)", badge: "VIP" },
    {
      href: "/app/parlays",
      label: "Armador de Parlays",
      badge: parlayLegs.length > 0 ? `${parlayLegs.length}` : "SGP",
    },
    { href: "/app/momios", label: "Momios & Geodesic" },
    { href: "/app/props", label: "Player Props Lab" },
    { href: "/app/social", label: "Comunidad VIP" },
    { href: "/app/tipstar", label: "Portal Tipstar" },
    { href: "/app/tech", label: "Spacetime Suite v2.1" },
    { href: "/app/historial", label: "Resultados FT" },
    { href: "/app/lab", label: "Mi Bitácora" },
    { href: "/app/account", label: "Cuenta & Referidos" },
    { href: "/app/admin", label: "Admin Founder" },
  ];

  return (
    <>
      <header className="panel-header sticky top-0 z-30 glass-nav-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <a
              href="/app"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/app");
              }}
              className="inline-flex items-center gap-2 no-underline"
              aria-label="PitchLab Club Inicio"
            >
              <BrandLogo variant="horizontal" width={124} height={24} alt="" />
            </a>
            <span className="pl-pill pl-pill--brand hidden md:inline-flex">
              {viewerRole === "tipstar"
                ? "Tipstar Oficial"
                : viewerRole === "admin"
                  ? "Founder Admin"
                  : viewerRole === "visitor"
                    ? "Vista Visitante"
                    : "Pase Total Activo"}
            </span>
          </div>

          {/* Tira rápida de ligas en cabecera */}
          <div
            className="hidden xl:flex items-center gap-1 overflow-x-auto max-w-xl"
            role="navigation"
            aria-label="Ligas rápidas"
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
                  className="league-tab seg-btn text-xs"
                  data-active={isCurrent ? "true" : undefined}
                >
                  <LeagueBadge league={lg.league} label={lg.label} size={16} />
                  <span>{lg.label}</span>
                </a>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-9 px-3"
              aria-label="Buscar"
              onClick={() => setCmdkOpen(true)}
            >
              <Icon name="search" className="icon size-4" />
              <span className="hidden sm:inline">Buscar</span>
              <kbd className="hidden md:inline text-xs opacity-70 num">⌘K</kbd>
            </button>

            <div className="hidden md:block">
              <OddsFormatSegment />
            </div>

            <button
              type="button"
              className="pl-btn-glass px-2.5 min-h-9"
              aria-label="Abrir centro de alertas 60m"
              onClick={() => setAlertsOpen(true)}
            >
              🔔
            </button>

            <ThemeToggle shape="pill" />

            <button
              type="button"
              className="pl-btn-glass text-xs min-h-9 px-3"
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
              className="rail-hide-collapsed text-xs font-bold uppercase tracking-wider"
              style={{ color: "var(--pl-text-muted)" }}
            >
              Club PitchLab
            </span>
            <button
              type="button"
              className="pl-btn-glass px-2 min-h-7 text-xs"
              aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? "»" : "«"}
            </button>
          </div>

          <nav aria-label="Módulos principales" className="space-y-0.5">
            {clubModules.map((mod) => {
              const active = activePath === mod.href;
              return (
                <a
                  key={mod.href}
                  href={mod.href}
                  aria-current={active ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateTo(mod.href);
                  }}
                  className="rail-item justify-between"
                >
                  <span className="truncate">{collapsed ? mod.label.slice(0, 2) : mod.label}</span>
                  {mod.badge && !collapsed ? (
                    <span className="pl-pill num">{mod.badge}</span>
                  ) : null}
                </a>
              );
            })}
          </nav>

          <div className="ticket-perf my-1" />

          <div className="space-y-1">
            <span
              className="rail-hide-collapsed px-2 text-xs font-bold uppercase tracking-wider block"
              style={{ color: "var(--pl-text-muted)" }}
            >
              7 Ligas Activas
            </span>
            {dataset.leagues.map((lg) => {
              const href = `/app/${lg.league}`;
              const active = activePath === href || activePath.startsWith(`${href}/`);
              return (
                <a
                  key={lg.league}
                  href={href}
                  data-league={lg.league}
                  aria-current={active ? "page" : undefined}
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
                  <span className="rail-hide-collapsed text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                    {lg.upcomingCount || lg.totalGames}
                  </span>
                </a>
              );
            })}
          </div>
        </aside>

        <main id="main" className="min-w-0 space-y-6">
          {children}
        </main>
      </div>

      {/* Barra inferior móvil */}
      <nav
        aria-label="Navegación móvil del Club"
        className="mobile-dock glass-pill-bar glass-ring"
      >
        {[
          { href: "/app", label: "Jornada" },
          { href: "/app/picks", label: "Picks" },
          { href: "/app/parlays", label: `Parlay${parlayLegs.length ? ` (${parlayLegs.length})` : ""}` },
          { href: "/app/social", label: "VIP" },
        ].map((item) => {
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
              className="seg-btn justify-center text-xs px-1"
              data-active={active ? "true" : undefined}
            >
              {item.label}
            </a>
          );
        })}
        <button
          type="button"
          className="seg-btn justify-center text-xs px-1"
          aria-expanded={mobileMoreOpen}
          onClick={() => setMobileMoreOpen(true)}
        >
          Más
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
              Todo el Club PitchLab
            </h2>
            <button
              type="button"
              autoFocus
              className="pl-btn-glass px-2.5"
              aria-label="Cerrar menú móvil"
              onClick={() => setMobileMoreOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {clubModules.map((m) => (
              <a
                key={m.href}
                href={m.href}
                onClick={(e) => {
                  e.preventDefault();
                  setMobileMoreOpen(false);
                  navigateTo(m.href);
                }}
                className="pl-btn-glass text-xs justify-start"
              >
                {m.label}
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
                className="pl-btn-glass text-xs justify-start"
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
