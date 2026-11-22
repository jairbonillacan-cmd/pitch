"use client";

import React, {
  Suspense,
  createContext,
  lazy,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  canonicalGameHref,
  competitionPrestigeScore,
  isLeagueActiveInWindow,
  isNationalCompetition,
  type LeagueId,
} from "@pitchlab/contracts";
import { LIGHT_THEME_TOKENS, STAGE_DARK_TOKENS } from "@pitchlab/tokens";
import { usePackIconBase } from "../../pack-icon-theme";
import { BrandLogo, ThemeToggle } from "../../primitives";
import { EmblemSurfaceProvider, LeagueBadge } from "../../sports";
import { useSafeEffect } from "../hooks";
import { ProgressiveImage } from "./ProgressiveImage";
import { encodeForensicTag, getSessionWatermark } from "../access-guard";
import { formatUnits, profileRecord } from "../profile-stats";
import {
  ownHandleFor,
  useAuraColors,
  useJournalEntries,
  useOptionalHomeNavFilter,
  useOverlayState,
  useParlayState,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import {
  ALL,
  buildHomeSportLeagues,
  gamesForSelection,
  leagueRank,
  matchesSportFilter,
  resolveHomeDay,
  todayId,
  type DaySelection,
  type LeagueFilter,
  type SportFilter,
} from "../club/home/home-model";
import { HomeLeagueStrip, HomeSportStrip } from "../club/home/HomeSportStrip";
import type { OddsFormat, ViewerRole } from "../types";
import {
  MaestroIcon,
  UltraTag,
  VerifiedBadge,
  type MaestroIconName,
} from "./MaestroPrimitives";
import {
  ParlayFloatingDock,
  RoleSimulatorBar,
  ToastViewport,
  TopLayerModalDialog,
} from "./PlatformOverlays";
import { NotificationBell } from "./NotificationInbox";
import { NetworkAndSwBanners } from "./NetworkAndSwBanners";
import { useSheetSwipeDismiss } from "./use-sheet-swipe-dismiss";

const LazyLeagueCategorySheet = lazy(() =>
  import("./LeagueCategorySheet").then((m) => ({ default: m.LeagueCategorySheet })),
);
const LazyMobileParlaySheet = lazy(() =>
  import("./MobileParlaySheet").then((m) => ({ default: m.MobileParlaySheet })),
);
const LazyPickComposerModal = lazy(() =>
  import("./PlatformOverlays").then((m) => ({ default: m.PickComposerModal })),
);
const LazyShareTicketModal = lazy(() =>
  import("./PlatformOverlays").then((m) => ({ default: m.ShareTicketModal })),
);
const LazyCommandPaletteModal = lazy(() =>
  import("./CommandPaletteModal").then((m) => ({ default: m.CommandPaletteModal })),
);
const LazyBetaPinModal = lazy(() =>
  import("./PlatformOverlays").then((m) => ({ default: m.BetaPinModal })),
);

function LazyAppOverlays({ inClubApp }: { inClubApp: boolean }): React.JSX.Element {
  const { composerPick, shareTicket, cmdkOpen, betaPinOpen } = useOverlayState();
  return (
    <Suspense fallback={null}>
      {inClubApp && composerPick ? <LazyPickComposerModal /> : null}
      {inClubApp && shareTicket ? <LazyShareTicketModal /> : null}
      {inClubApp && cmdkOpen ? <LazyCommandPaletteModal /> : null}
      {betaPinOpen ? <LazyBetaPinModal /> : null}
    </Suspense>
  );
}

const ODDS_FORMAT_OPTIONS: ReadonlyArray<{ value: OddsFormat; label: string }> = [
  { value: "american", label: "Momio" },
  { value: "decimal", label: "Decimal" },
];

export function OddsFormatSegment(): React.JSX.Element {
  const { oddsFormat } = usePlatformCore();
  const { setOddsFormat } = usePlatformActions();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = (idx + step + ODDS_FORMAT_OPTIONS.length) % ODDS_FORMAT_OPTIONS.length;
    setOddsFormat(ODDS_FORMAT_OPTIONS[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <div className="seg-well" role="radiogroup" aria-label="Formato de momio">
      {ODDS_FORMAT_OPTIONS.map((o, idx) => {
        const on = oddsFormat === o.value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[idx] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            data-active={on}
            tabIndex={on ? 0 : -1}
            className="seg-btn text-xs"
            onClick={() => setOddsFormat(o.value)}
            onKeyDown={(e) => onKeyDown(e, idx)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function useDocumentTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useSafeEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.dataset.theme === "light" ? "light" : "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

function applyTheme(next: "dark" | "light"): void {
  const root = document.documentElement;
  if ((root.dataset.theme === "light" ? "light" : "dark") === next) return;
  root.dataset.themeSwitching = "true";
  root.dataset.theme = next;
  root.style.colorScheme = next;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (meta) {
    meta.content =
      next === "light"
        ? LIGHT_THEME_TOKENS["--background-elevated"]
        : STAGE_DARK_TOKENS["--pl-glass-nav"];
  }
  void root.offsetHeight;
  delete root.dataset.themeSwitching;
  try {
    window.localStorage.setItem("pl-theme", next);
  } catch (err) {
    void err;
  }
}

export type VisualStyle = "solid" | "glass";

export function useDocumentStyle(): VisualStyle {
  return "solid";
}

export function applyVisualStyle(_next?: VisualStyle): void {
  void _next;
  if (typeof document === "undefined") return;
  document.documentElement.dataset.style = "solid";
  try {
    window.localStorage.setItem("pl-style", "solid");
  } catch (err) {
    void err;
  }
}

function MenuSegment({
  labelledBy,
  value,
  onChange,
  options,
  dataAttr,
}: {
  labelledBy: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string; hint?: string; icon?: MaestroIconName }>;
  dataAttr?: string;
}): React.JSX.Element {
  return (
    <div
      className="pl-menu-seg"
      role="group"
      aria-labelledby={labelledBy}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const i = options.findIndex((o) => o.value === value);
        const next = options[(i + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length]!;
        onChange(next.value);
        const btn = e.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`);
        btn?.focus();
      }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          data-value={o.value}
          aria-pressed={value === o.value}
          {...(dataAttr ? { [dataAttr]: o.value } : {})}
          onClick={() => onChange(o.value)}
        >
          {o.icon ? <MaestroIcon name={o.icon} size={14} /> : null}
          <span>{o.label}</span>
          {o.hint ? <small className="num">{o.hint}</small> : null}
        </button>
      ))}
    </div>
  );
}

function isClubAppRoute(path: string | undefined): boolean {
  return Boolean(path && (path === "/app" || path.startsWith("/app/")));
}

function FloatingQuickJumpBar({
  activePath,
}: {
  activePath?: string;
}): React.JSX.Element | null {
  const { rawDataset, allowRoleSimulation } = usePlatformCore();
  const { openBetaPin, navigateTo } = usePlatformActions();
  const [collapsed, setCollapsed] = useState<boolean>(true);
  const [clientPath, setClientPath] = useState<string>(activePath ?? "");

  useSafeEffect(() => {
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
      ? canonicalGameHref(firstUpcoming.league, firstUpcoming)
      : "/app";
  }, [rawDataset.games]);

  const items = useMemo(
    () => [
      { id: "landing", label: "1. Landing", href: "/" },
      { id: "signup", label: "2. Acceso $0", href: "/signup" },
      { id: "jornada", label: "3. Jornada", href: "/app" },
      { id: "picks", label: "4. Buscar picks", href: "/app/picks" },
      { id: "studio", label: "5. Estudio de Partido", href: firstStudioHref },
      { id: "parlays", label: "6. Parlays", href: "/app/parlays" },
      { id: "social", label: "7. Comunidad VIP", href: "/app/social" },
      { id: "tipster", label: "8. Portal Tipster", href: "/app/tipster" },
      { id: "referrals", label: "9. Referidos", href: "/app/account" },
      { id: "admin", label: "10. Admin", href: "/app/admin" },
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
      return clientPath.includes("/g/") || clientPath.includes("/games/");
    }
    return clientPath === href;
  };

  const effectivePath = activePath ?? clientPath;
  if (!allowRoleSimulation || !isClubAppRoute(effectivePath)) return null;

  return (
    <aside
      aria-label="Salto rápido de 11 vistas PitchLab"
      data-quick-jump-bar=""
      className="pl-quick-jump-bar glass-ring hidden lg:inline-flex lg:max-w-[calc(100vw-16rem)]"
    >
      {collapsed ? (
        <button
          type="button"
          className="seg-btn text-xs min-h-7 px-3 inline-flex items-center gap-1.5 font-bold"
          aria-expanded={false}
          aria-label="11 Vistas Maestro · expandir barra rápida"
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
            aria-label="11 Vistas Maestro · colapsar barra rápida"
            onClick={() => setCollapsed(true)}
          >
            <MaestroIcon name="x" size={13} />
          </button>
        </>
      )}
    </aside>
  );
}

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

export interface ClubWorkspaceShellProps {
  activePath: string;
  children: React.ReactNode;
  initialHomeDay?: DaySelection;
  initialHomeToday?: string;
  initialHomeSport?: SportFilter;
  initialHomeLeague?: LeagueFilter;
}

export function ClubWorkspaceShell(props: ClubWorkspaceShellProps): React.JSX.Element {
  if (useContext(ShellMountedContext)) return <>{props.children}</>;
  return (
    <ShellMountedContext.Provider value>
      <ClubWorkspaceShellImpl {...props} />
    </ShellMountedContext.Provider>
  );
}

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
  const [clientPath, setClientPath] = useState<string>(activePath ?? "");

  useSafeEffect(() => {
    if (activePath !== undefined) {
      setClientPath(activePath);
      return;
    }
    try {
      setClientPath(window.location.pathname);
    } catch (err) {
      void err;
    }
  }, [activePath]);

  const inClubApp = isClubAppRoute(activePath ?? clientPath);

  return (
    <EmblemSurfaceProvider surface={inClubApp ? "app" : "public"}>
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

        {inClubApp ? (
          <>
            <FloatingQuickJumpBar activePath={activePath} />
            {activePath !== "/app/parlays" ? <ParlayFloatingDock /> : null}
            <RoleSimulatorBar activePath={activePath} />
          </>
        ) : null}
        <LazyAppOverlays inClubApp={inClubApp} />
        <NetworkAndSwBanners />
        <ToastViewport />
      </div>
    </EmblemSurfaceProvider>
  );
}

export function PublicHeaderV4({
  activePath = "/",
}: {
  activePath?: string;
}): React.JSX.Element {
  const { viewerRole } = usePlatformCore();
  const { navigateTo } = usePlatformActions();

  const navItems = [
    { href: "/motores", label: "Motores" },
    { href: "/resultados", label: "Resultados" },
    { href: "/precio", label: "Precio" },
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
            aria-label="PitchLab, inicio"
          >
            <BrandLogo variant="horizontal" width={128} height={25} alt="PitchLab" />
          </a>

          <nav aria-label="Principal" className="hidden lg:flex items-center gap-1">
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
          <ThemeToggle shape="pill" />

          {viewerRole !== "visitor" ? (
            <a
              href="/app"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/app");
              }}
              className="pl-btn-primary text-xs min-h-11 px-4 inline-flex items-center gap-1.5"
            >
              <span>Ir a la app</span>
              <MaestroIcon name="arrowRight" size={14} />
            </a>
          ) : (
            <>
              <a
                href="/login"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/login");
                }}
                className="pl-btn-glass text-xs min-h-11 px-3.5"
              >
                Entrar
              </a>
              <a
                href="/signup"
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo("/signup");
                }}
                className="pl-btn-primary text-xs min-h-11 px-4 inline-flex items-center gap-1.5"
              >
                <span>Probar 7 días</span>
              </a>
            </>
          )}
        </div>
      </div>

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
  const { navigateTo } = usePlatformActions();

  return (
    <footer className="relative z-10 mt-16 hairline-t py-10 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2 max-w-xl">
          <BrandLogo variant="horizontal" width={120} height={24} alt="PitchLab" lazy />
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Información para decidir, no una garantía. PitchLab no acepta apuestas. Solo mayores de
            18.
          </p>
        </div>

        <nav aria-label="Pie" className="flex flex-wrap items-center gap-4 text-xs font-semibold">
          <a
            href="/motores"
            onClick={(e) => {
              e.preventDefault();
              navigateTo("/motores");
            }}
            className="no-underline hover:underline"
          >
            Motores
          </a>
          <a
            href="/resultados"
            onClick={(e) => {
              e.preventDefault();
              navigateTo("/resultados");
            }}
            className="no-underline hover:underline"
          >
            Resultados
          </a>
          <a
            href="/precio"
            onClick={(e) => {
              e.preventDefault();
              navigateTo("/precio");
            }}
            className="no-underline hover:underline"
          >
            Precio
          </a>
          <a href="/legal/terminos" className="no-underline hover:underline">
            Términos
          </a>
          <a href="/legal/privacidad" className="no-underline hover:underline">
            Aviso de privacidad
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

type InterfazPackIconSlug =
  | "target-picks"
  | "player-props"
  | "compare-h2h"
  | "alert-market"
  | "verified-seal";

function ShellNavIcon({
  icon,
  packSlug,
  size,
  className,
}: {
  icon: MaestroIconName;
  packSlug?: InterfazPackIconSlug;
  size: number;
  className?: string;
}): React.JSX.Element {
  const iconBase = usePackIconBase();
  if (!packSlug) {
    return <MaestroIcon name={icon} size={size} className={className} />;
  }
  return (
    <img
      src={`${iconBase}/32/interfaz/${packSlug}.webp`}
      srcSet={`${iconBase}/32/interfaz/${packSlug}.webp 1x, ${iconBase}/64/interfaz/${packSlug}.webp 2x`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      decoding="async"
      draggable={false}
      className={["pl-maestro-icon inline-block shrink-0", className].filter(Boolean).join(" ")}
    />
  );
}

interface RailNavItem {
  href: string;
  label: string;
  navLabel?: string;
  shortLabel?: string;
  icon: MaestroIconName;
  packIconSlug?: InterfazPackIconSlug;
  badge?: string;
  badgeBrand?: boolean;
  liveDot?: boolean;
}

interface RailNavGroup {
  title: string;
  items: RailNavItem[];
}

export const ACCOUNT_TAB_EVENT = "pl-account-tab";

interface ProfileMenuItem {
  href: string;
  label: string;
  icon: MaestroIconName;
  accountTab?: "referrals" | "plan" | "prefs" | "cfdi";
  trail?: React.ReactNode;
}
interface ProfileMenuGroup {
  label: string;
  items: ProfileMenuItem[];
}

const CLUB_FOOTER_LINKS = [
  { href: "/motores", label: "Motores" },
  { href: "/resultados", label: "Resultados" },
  { href: "/precio", label: "Precio" },
  { href: "/legal/terminos", label: "Términos" },
  { href: "/legal/privacidad", label: "Privacidad" },
  { href: "/legal/juego-responsable", label: "Juego responsable" },
  { href: "/legal/creditos", label: "Créditos de datos" },
] as const;

function ClubFooter(): React.JSX.Element {
  const { navigateTo } = usePlatformActions();
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

function ClubWatermarkLayer({ label, handle }: { label: string; handle: string | null }): null {
  useSafeEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const selection = window.getSelection()?.toString() ?? "";
      if (selection.trim().length < 12 || !e.clipboardData) return;
      const anchor = window.getSelection()?.anchorNode;
      const el = anchor instanceof Element ? anchor : anchor?.parentElement;
      if (!el?.closest("#main") || el.closest("input, textarea, [contenteditable='true']")) return;
      const credit = handle ? `\n\n— Visto en PitchLab por ${handle}` : "\n\n— Visto en PitchLab";
      e.clipboardData.setData("text/plain", `${selection}${credit}${encodeForensicTag(label)}`);
      e.preventDefault();
    };
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, [label, handle]);

  return null;
}

function ClubWorkspaceShellImpl({
  activePath,
  children,
  initialHomeDay,
  initialHomeToday,
  initialHomeSport = ALL,
  initialHomeLeague = ALL,
}: ClubWorkspaceShellProps): React.JSX.Element {
  const { dataset, viewerRole, allowRoleSimulation, oddsFormat, favoriteLeagues, viewerIdentity, hasAccountSession, upgradeHref, userTimezone } = usePlatformCore();
  const { setViewerRole, setCmdkOpen, logoutSession, navigateTo, prefetchRoute, requestFullShell, setOddsFormat } = usePlatformActions();
  const { parlayLegs } = useParlayState();
  const journal = useJournalEntries();
  const homeNav = useOptionalHomeNavFilter();
  const normalizedPath = (activePath.split(/[?#]/, 1)[0] ?? "/").replace(/\/+$/, "") || "/";
  const isHomeRoute = normalizedPath === "/app";
  const isDetailRoute =
    normalizedPath.includes("/g/") ||
    normalizedPath.includes("/games/") ||
    normalizedPath.includes("/t/") ||
    normalizedPath.includes("/team/") ||
    normalizedPath.includes("/p/") ||
    normalizedPath.includes("/player/") ||
    normalizedPath.includes("/r/") ||
    normalizedPath.startsWith("/app/u/");
  const shellContext: "home" | "detail" | "section" = isHomeRoute
    ? "home"
    : isDetailRoute
      ? "detail"
      : "section";
  const homeToday = homeNav?.todayOverride ?? initialHomeToday ?? todayId(userTimezone || "America/Mexico_City");
  const homeChosenDay = homeNav?.chosenDay ?? initialHomeDay ?? null;
  const homeActiveDay = isHomeRoute
    ? resolveHomeDay(dataset.games, homeChosenDay, homeToday)
    : "";
  const homeSport: SportFilter = homeNav?.hasExplicitSport ? homeNav.sport : initialHomeSport;
  const homeLeague: LeagueFilter =
    homeNav && (homeNav.hasExplicitSport || homeNav.league !== ALL)
      ? homeNav.league
      : initialHomeLeague;
  const homeDayGames = useMemo(
    () => (isHomeRoute ? gamesForSelection(dataset.games, homeActiveDay, homeToday) : []),
    [isHomeRoute, dataset.games, homeActiveDay, homeToday],
  );
  const homeSportGames = useMemo(
    () =>
      homeSport === ALL
        ? homeDayGames
        : homeDayGames.filter((g) => matchesSportFilter(g, homeSport)),
    [homeDayGames, homeSport],
  );
  const homeSportLeagues = useMemo(
    () =>
      isHomeRoute
        ? buildHomeSportLeagues(dataset.leagues, dataset.games, homeDayGames, homeSport, homeToday)
        : [],
    [isHomeRoute, dataset.leagues, dataset.games, homeDayGames, homeSport, homeToday],
  );
  const hasLeaguesOpen = Boolean(
    isHomeRoute && homeNav && homeSport !== ALL && homeSportLeagues.length > 1,
  );
  const activeLeagueSnapshot = useMemo(
    () =>
      hasLeaguesOpen
        ? {
            sport: homeSport,
            leagues: homeSportLeagues,
            count: homeSportGames.length,
            league: homeLeague,
          }
        : null,
    [hasLeaguesOpen, homeSport, homeSportLeagues, homeSportGames.length, homeLeague],
  );
  const [lastLeaguesSnapshot, setLastLeaguesSnapshot] = useState(activeLeagueSnapshot);

  useSafeEffect(() => {
    if (activeLeagueSnapshot) {
      setLastLeaguesSnapshot(activeLeagueSnapshot);
      return;
    }
    const id = window.setTimeout(() => setLastLeaguesSnapshot(null), 300);
    return () => window.clearTimeout(id);
  }, [activeLeagueSnapshot]);

  const displayedLeagues = activeLeagueSnapshot ?? lastLeaguesSnapshot;
  const ownHandle = ownHandleFor(viewerIdentity, viewerRole);

  const navContainerRef = useRef<HTMLElement>(null);
  const navToggleRef = useRef<HTMLButtonElement>(null);
  const headerNavPanelId = `pl-header-nav-panel${useId().replace(/:/g, "")}`;
  const [navExpanded, setNavExpanded] = useState<boolean>(false);

  const closeHeaderNav = () => setNavExpanded(false);

  useSafeEffect(() => {
    setNavExpanded(false);
  }, [activePath]);

  useSafeEffect(() => {
    if (!navExpanded) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const focusInside = Boolean(
        navContainerRef.current && navContainerRef.current.contains(document.activeElement),
      );
      closeHeaderNav();
      if (focusInside) navToggleRef.current?.focus();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!navContainerRef.current?.contains(e.target as Node)) {
        closeHeaderNav();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [navExpanded]);

  const handleNavTriggerClick = () => setNavExpanded((prev) => !prev);
  const [isApplePlatform, setIsApplePlatform] = useState(false);
  useSafeEffect(() => {
    const plat = typeof navigator !== "undefined" ? `${navigator.platform} ${navigator.userAgent}` : "";
    setIsApplePlatform(/Mac|iPhone|iPad|iPod/i.test(plat));
  }, []);

  const profileTriggerRef = useRef<HTMLButtonElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuId = `pl-profile-menu${useId().replace(/:/g, "")}`;
  const [profileMenuOpen, setProfileMenuOpen] = useState<boolean>(false);
  useSafeEffect(() => {
    const menu = profileMenuRef.current;
    if (!menu) return;
    const onToggle = (e: Event) => setProfileMenuOpen((e as ToggleEvent).newState === "open");
    menu.addEventListener("toggle", onToggle);
    return () => menu.removeEventListener("toggle", onToggle);
  }, []);
  const ownRecord = useMemo(() => profileRecord(journal), [journal]);
  const profileMenuGroups = useMemo(() => {
    if (viewerRole === "visitor") {
      return [
        {
          label: "Ayuda",
          items: [
            { href: "/app/tech", label: "Cómo calculamos", icon: "cpu" },
            { href: "/legal/juego-responsable", label: "Juego responsable", icon: "responsible-play" },
          ],
        },
      ] satisfies ProfileMenuGroup[];
    }
    const handle = ownHandle;
    const showRecord = viewerRole !== "tipster" && ownRecord.settled > 0;
    const profileTrail = showRecord ? (
      <span className="pl-profile-menu-rec num" title="Saldo y cumplidos">
        <span className={ownRecord.netUnits >= 0 ? "pl-tone-pos" : "pl-tone-neg"}>
          {formatUnits(ownRecord.netUnits)}
        </span>
        <small>
          {ownRecord.won} de {ownRecord.settled}
        </small>
      </span>
    ) : undefined;
    const journalTrail =
      ownRecord.open > 0 ? (
        <span className="pl-profile-menu-count num" title="Picks abiertos">
          <i aria-hidden="true" />
          {ownRecord.open} {ownRecord.open === 1 ? "abierto" : "abiertos"}
        </span>
      ) : journal.length === 0 ? (
        <span className="pl-profile-menu-hint">Registra tu primer pick</span>
      ) : undefined;
    const groups: ProfileMenuGroup[] = [
      {
        label: "Tus picks",
        items: [
          { href: `/app/u/${handle}`, label: "Ver mi perfil", icon: "user", trail: profileTrail },
          { href: "/app/lab", label: "Mi récord", icon: "ticket", trail: journalTrail },
        ],
      },
      {
        label: "Tu cuenta",
        items: [
          { href: "/app/account?tab=plan", label: "Mi plan Ultra", icon: "crown", accountTab: "plan" },
          { href: "/app/account?tab=prefs", label: "Preferencias", icon: "settings", accountTab: "prefs" },
        ],
      },
    ];
    const roleItems: ProfileMenuItem[] = [];
    if (viewerRole === "tipster" || viewerRole === "admin") {
      roleItems.push({ href: "/app/tipster", label: "Portal tipster", icon: "star" });
    }
    if (viewerRole === "admin") {
      roleItems.push({ href: "/app/admin", label: "Consola", icon: "chart" });
    }
    if (roleItems.length > 0) groups.push({ label: "Herramientas", items: roleItems });
    groups.push({
      label: "Ayuda",
      items: [
        { href: "/app/tech", label: "Cómo calculamos", icon: "cpu" },
        { href: "/legal/juego-responsable", label: "Juego responsable", icon: "responsible-play" },
      ],
    });
    return groups;
  }, [viewerRole, ownRecord, journal.length, ownHandle]);

  const docTheme = useDocumentTheme();
  const onProfileMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const items = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>(
        ".pl-profile-menu-group a, .pl-profile-menu-logout, .pl-profile-menu-cta",
      ),
    );
    if (items.length === 0) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? items.length - 1
          : i < 0
            ? 0
            : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  const closeProfileMenu = () => {
    try {
      profileMenuRef.current?.hidePopover();
    } catch (err) {
      void err;
    }
  };
  const [mobileMoreOpen, setMobileMoreOpen] = useState<boolean>(false);
  const [leagueHubSheetOpen, setLeagueHubSheetOpen] = useState<boolean>(false);
  const moreSheetScrollRef = useRef<HTMLDivElement>(null);
  const profileSheetSwipe = useSheetSwipeDismiss({
    onDismiss: closeProfileMenu,
    disabled: !profileMenuOpen,
    scrollContainerRef: profileMenuRef,
  });
  const moreSheetSwipe = useSheetSwipeDismiss({
    onDismiss: () => setMobileMoreOpen(false),
    disabled: !mobileMoreOpen,
    scrollContainerRef: moreSheetScrollRef,
  });

  const railGroups: RailNavGroup[] = useMemo(() => {
    const explore: RailNavItem[] = [
      {
        href: "/app/picks",
        label: "Buscar picks",
        shortLabel: "Buscar picks",
        icon: "search",
        packIconSlug: "target-picks",
      },
      {
        href: "/app/props",
        label: "Tendencias de jugadores",
        shortLabel: "Player Props",
        icon: "users",
        packIconSlug: "player-props",
      },
      { href: "/app/momios", label: "Compara tu momio", shortLabel: "Momios", icon: "activity" },
      {
        href: "/app/comparar",
        label: "Comparar H2H",
        shortLabel: "Comparar H2H",
        icon: "layers",
        packIconSlug: "compare-h2h",
      },
      {
        href: "/app/alertas",
        label: "Alertas de mercado",
        shortLabel: "Alertas",
        icon: "bell",
        packIconSlug: "alert-market",
      },
      {
        href: "/app/historial",
        label: "Resultados",
        shortLabel: "Resultados",
        icon: "shield",
        packIconSlug: "verified-seal",
      },
    ];
    return [
      { title: "Club", items: primaryNavItems(parlayLegs.length, journal.length) },
      { title: "Explorar", items: explore },
    ];
  }, [journal.length, parlayLegs.length]);

  const allClubItems = useMemo(
    () => railGroups.flatMap((g) => g.items),
    [railGroups],
  );

  const profileHandle = `@${ownHandle}`;
  const profileAvatarUrl = viewerIdentity?.avatarUrl ?? null;
  const [brokenAvatarUrl, setBrokenAvatarUrl] = useState<string | null>(null);
  const showProfileAvatarImg = Boolean(profileAvatarUrl && brokenAvatarUrl !== profileAvatarUrl);
  const roleLabel = viewerRole === "tipster" ? "Tipster verificado" : viewerRole === "admin" ? "Admin" : "Socio";
  const profileSubline = viewerIdentity
    ? `${viewerIdentity.displayName} · ${roleLabel}`
    : viewerRole === "tipster"
      ? "Sofía Méndez · Tipster verificado"
      : roleLabel;
  const profileInitials = viewerIdentity?.initials ?? (viewerRole === "tipster" ? "SM" : "SP");
  const profileGrad =
    viewerRole === "tipster" ? "var(--avatar-grad-1)" : "var(--avatar-grad-2)";

  const todayGamesByLeague = useMemo(() => {
    const refDay = homeActiveDay || homeToday;
    const map = new Map<LeagueId, number>();
    for (const g of dataset.games) {
      if (g.dayId === refDay) {
        map.set(g.league, (map.get(g.league) ?? 0) + 1);
      }
    }
    return map;
  }, [dataset.games, homeActiveDay, homeToday]);

  const activeDatasetLeagues = useMemo(() => {
    const inWindow = dataset.leagues.filter(
      (lg) =>
        isLeagueActiveInWindow(dataset.games, lg.league, homeToday, 30) ||
        activePath === `/app/${lg.league}` ||
        activePath.startsWith(`/app/${lg.league}/`),
    );
    const list =
      inWindow.length > 0
        ? inWindow
        : dataset.leagues.filter((lg) => lg.upcomingCount > 0 || lg.totalGames > 0).slice(0, 12);
    return [...list].sort((a, b) => {
      const aToday = todayGamesByLeague.get(a.league) ?? 0;
      const bToday = todayGamesByLeague.get(b.league) ?? 0;
      if ((aToday > 0) !== (bToday > 0)) return bToday > 0 ? 1 : -1;
      if (aToday !== bToday) return bToday - aToday;
      const aUp = a.upcomingCount > 0 ? 1 : 0;
      const bUp = b.upcomingCount > 0 ? 1 : 0;
      if (aUp !== bUp) return bUp - aUp;
      const aFav = favoriteLeagues.includes(a.league) ? 1 : 0;
      const bFav = favoriteLeagues.includes(b.league) ? 1 : 0;
      if (aFav !== bFav) return bFav - aFav;
      const prestigeDiff = competitionPrestigeScore(b.league) - competitionPrestigeScore(a.league);
      if (prestigeDiff !== 0) return prestigeDiff;
      const rankDiff = leagueRank(a.league) - leagueRank(b.league);
      if (rankDiff !== 0) return rankDiff;
      return b.upcomingCount - a.upcomingCount;
    });
  }, [activePath, dataset.leagues, dataset.games, favoriteLeagues, homeToday, todayGamesByLeague]);
  const clubLeagues = useMemo(
    () => activeDatasetLeagues.filter((lg) => !isNationalCompetition(lg.league)),
    [activeDatasetLeagues],
  );
  const nationalLeagues = useMemo(
    () => activeDatasetLeagues.filter((lg) => isNationalCompetition(lg.league)),
    [activeDatasetLeagues],
  );
  const activeLeaguePage = useMemo(
    () =>
      dataset.leagues.some((lg) => {
        const href = `/app/${lg.league}`;
        return activePath === href || activePath.startsWith(`${href}/`);
      }),
    [activePath, dataset.leagues],
  );

  const navExploreHints: Record<string, string> = {
    "/app/picks": "Filtros por cuota, deporte y probabilidad",
    "/app/props": "Rachas U5/U10/U20 contra línea deslizable",
    "/app/momios": "Calcula tu ventaja real frente a tu casa",
    "/app/comparar": "Cara a cara entre clubes y jugadores",
    "/app/alertas": "Copiloto NL, apertura de líneas, steam y EV+",
    "/app/historial": "Balance verificado, calibración y marcadores finales",
  };

  return (
    <>
      {viewerRole === "visitor" ? null : (
        <ClubWatermarkLayer
          label={getSessionWatermark(viewerRole, viewerIdentity)}
          handle={viewerIdentity ? `@${viewerIdentity.handle}` : null}
        />
      )}
      <header
        className="panel-header sticky top-0 z-40 glass-nav-surface"
        data-shell-context={shellContext}
      >
        <div className="pl-header-top">
        <div className="pl-header-grid max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-7 h-14 sm:h-16">
          <div className="pl-header-bar flex items-center justify-between gap-2 xl:gap-3 h-full min-w-0">
            <div className="pl-header-left flex items-center gap-2 xl:gap-3 min-w-0 flex-1 h-full">
              <a
                href="/app"
                onClick={(e) => {
                  e.preventDefault();
                  closeHeaderNav();
                  homeNav?.resetFilters();
                  navigateTo("/app");
                }}
                className="pl-header-logo inline-flex items-center gap-2 no-underline shrink-0 min-h-11 sm:min-h-9"
                aria-label="PitchLab Inicio"
              >
                <BrandLogo variant="horizontal" width={120} height={24} alt="" />
              </a>

              <nav
                ref={navContainerRef}
                aria-label="Menú de PitchLab"
                data-expanded={navExpanded ? "true" : "false"}
                className="hidden lg:flex h-full items-center pl-header-nav shrink-0"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                    closeHeaderNav();
                  }
                }}
              >
                <div className="pl-header-nav-bar">
                  {railGroups[0]!.items.map((item) => {
                    const active = activePath === item.href;
                    const visibleLabel = item.navLabel ?? item.label;
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        title={item.label}
                        data-nav-group="primary"
                        onPointerEnter={() => prefetchRoute(item.href)}
                        onTouchStart={() => prefetchRoute(item.href)}
                        onClick={(e) => {
                          e.preventDefault();
                          closeHeaderNav();
                          navigateTo(item.href);
                        }}
                        className="pl-header-nav-icon"
                      >
                        <span className="pl-header-nav-glyph">
                          <MaestroIcon name={item.icon} size={16} />
                          {item.badge ? (
                            <span
                              className={`pl-header-nav-badge num ${item.badgeBrand ? "pl-header-nav-badge--brand" : ""}`}
                              aria-hidden="true"
                            >
                              {item.badge}
                            </span>
                          ) : null}
                        </span>
                        <span className="pl-header-nav-label-wrap">
                          <span className="pl-header-nav-label">{visibleLabel}</span>
                        </span>
                      </a>
                    );
                  })}

                  <span className="pl-header-nav-sep" aria-hidden="true" />

                  <button
                    type="button"
                    aria-label="Ligas y selecciones"
                    data-nav-group="primary"
                    data-active={activeLeaguePage ? "true" : undefined}
                    className="pl-header-nav-icon pl-header-nav-ligas"
                    onClick={handleNavTriggerClick}
                  >
                    <span className="pl-header-nav-glyph">
                      <MaestroIcon name="trophy" size={16} />
                    </span>
                    <span className="pl-header-nav-label-wrap" aria-hidden="true">
                      <span className="pl-header-nav-label">Ligas</span>
                    </span>
                  </button>

                  <span className="pl-header-nav-sep" aria-hidden="true" />

                  {railGroups[1]!.items.map((item) => {
                    const active = activePath === item.href;
                    const visibleLabel = item.shortLabel ?? item.label;
                    const accessibleLabel = item.label.toLowerCase().includes(visibleLabel.toLowerCase())
                      ? item.label
                      : `${visibleLabel} · ${item.label}`;
                    return (
                      <a
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        aria-label={accessibleLabel}
                        title={item.label !== visibleLabel ? item.label : undefined}
                        data-nav-group="explore"
                        onPointerEnter={() => prefetchRoute(item.href)}
                        onTouchStart={() => prefetchRoute(item.href)}
                        onClick={(e) => {
                          e.preventDefault();
                          closeHeaderNav();
                          navigateTo(item.href);
                        }}
                        className="pl-header-nav-icon"
                      >
                        <span className="pl-header-nav-glyph">
                          <ShellNavIcon icon={item.icon} packSlug={item.packIconSlug} size={16} />
                        </span>
                        <span className="pl-header-nav-label-wrap" aria-hidden="true">
                          <span className="pl-header-nav-label">{visibleLabel}</span>
                        </span>
                      </a>
                    );
                  })}

                  <span className="pl-header-nav-sep" aria-hidden="true" />

                  <button
                    ref={navToggleRef}
                    type="button"
                    className="pl-header-nav-toggle rail-group-toggle"
                    aria-expanded={navExpanded}
                    aria-controls={headerNavPanelId}
                    aria-label={navExpanded ? "Cerrar menú expandido" : "Expandir menú"}
                    title={navExpanded ? "Cerrar menú" : "Expandir menú"}
                    onClick={handleNavTriggerClick}
                  >
                    <MaestroIcon name="chevronDown" size={14} className="pl-header-nav-chevron" />
                  </button>
                </div>

                <div
                  id={headerNavPanelId}
                  aria-hidden={!navExpanded || undefined}
                  inert={!navExpanded ? true : undefined}
                  data-open={navExpanded ? "true" : "false"}
                  className="pl-header-nav-overlay"
                >
                  <div className="pl-header-nav-overlay-inner">
                    <section aria-labelledby="pl-nav-col-club" className="pl-header-overlay-col">
                      <div className="pl-header-overlay-head">
                        <h2 id="pl-nav-col-club" className="pl-header-overlay-title">
                          Principal
                        </h2>
                      </div>
                      <div className="space-y-1">
                        {railGroups[0]!.items.map((item) => {
                          const active = activePath === item.href;
                          return (
                            <a
                              key={item.href}
                              href={item.href}
                              aria-current={active ? "page" : undefined}
                              onPointerEnter={() => prefetchRoute(item.href)}
                              onTouchStart={() => prefetchRoute(item.href)}
                              onClick={(e) => {
                                e.preventDefault();
                                closeHeaderNav();
                                navigateTo(item.href);
                              }}
                              className="pl-header-overlay-link"
                            >
                              <span className="flex items-center gap-2.5 min-w-0">
                                <MaestroIcon name={item.icon} size={15} className="pl-header-overlay-icon shrink-0" />
                                <span className="truncate">{item.label}</span>
                              </span>
                              {item.badge ? (
                                <span
                                  className={`pl-pill num text-[11px] shrink-0 ${item.badgeBrand ? "pl-pill--brand" : ""}`}
                                >
                                  {item.badge}
                                </span>
                              ) : null}
                            </a>
                          );
                        })}
                      </div>
                    </section>

                    <section aria-labelledby="pl-nav-col-leagues" className="pl-header-overlay-col">
                      <div className="pl-header-overlay-head">
                        <h2 id="pl-nav-col-leagues" className="pl-header-overlay-title">
                          Ligas activas
                        </h2>
                        <span className="pl-pill num text-[11px]">{activeDatasetLeagues.length}</span>
                      </div>
                      <div className="pl-header-overlay-leagues">
                        {clubLeagues.slice(0, 12).map((lg) => {
                          const href = `/app/${lg.league}`;
                          const active = activePath === href || activePath.startsWith(`${href}/`);
                          return (
                            <a
                              key={lg.league}
                              href={href}
                              data-league={lg.league}
                              data-active={active ? "true" : undefined}
                              aria-current={active ? "page" : undefined}
                              onPointerEnter={() => prefetchRoute(href)}
                              onTouchStart={() => prefetchRoute(href)}
                              onClick={(e) => {
                                e.preventDefault();
                                closeHeaderNav();
                                navigateTo(href);
                              }}
                              className="league-tab pl-header-overlay-link"
                            >
                              <span className="flex items-center gap-2 min-w-0 flex-1">
                                <LeagueBadge
                                  league={lg.league}
                                  label={lg.label}
                                  logoUrl={lg.logoUrl}
                                  size={18}
                                  decorative
                                  lowPriority
                                />
                                <span className="truncate">{lg.label}</span>
                              </span>
                              <span className="pl-header-overlay-count num">
                                {lg.upcomingCount || lg.totalGames}
                              </span>
                            </a>
                          );
                        })}
                      </div>
                      {clubLeagues.length > 12 ? (
                        <button
                          type="button"
                          className="pl-btn-glass text-xs min-h-9 px-3 mt-2 w-full justify-center"
                          onClick={() => {
                            closeHeaderNav();
                            setLeagueHubSheetOpen(true);
                          }}
                        >
                          Explorar todas las ligas por región ({activeDatasetLeagues.length})
                        </button>
                      ) : null}

                      {nationalLeagues.length > 0 ? (
                        <div className="pt-2.5 mt-2.5 border-t" style={{ borderColor: "var(--pl-row-rule)" }}>
                          <span className="pl-header-overlay-subheading">Selecciones</span>
                          <div className="pl-header-overlay-leagues mt-1.5">
                            {nationalLeagues.map((lg) => {
                              const href = `/app/${lg.league}`;
                              const active = activePath === href || activePath.startsWith(`${href}/`);
                              return (
                                <a
                                  key={lg.league}
                                  href={href}
                                  data-league={lg.league}
                                  data-active={active ? "true" : undefined}
                                  aria-current={active ? "page" : undefined}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    closeHeaderNav();
                                    navigateTo(href);
                                  }}
                                  className="league-tab pl-header-overlay-link"
                                >
                                  <span className="flex items-center gap-2 min-w-0 flex-1">
                                    <LeagueBadge
                                      league={lg.league}
                                      label={lg.label}
                                      logoUrl={lg.logoUrl}
                                      size={18}
                                      decorative
                                      lowPriority
                                    />
                                    <span className="truncate">{lg.label}</span>
                                  </span>
                                  <span className="pl-header-overlay-count num">
                                    {lg.upcomingCount || lg.totalGames}
                                  </span>
                                </a>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                    </section>

                    <section aria-labelledby="pl-nav-col-explore" className="pl-header-overlay-col">
                      <div className="pl-header-overlay-head">
                        <h2 id="pl-nav-col-explore" className="pl-header-overlay-title">
                          Explorar
                        </h2>
                        <button
                          type="button"
                          onClick={closeHeaderNav}
                          className="pl-header-overlay-close"
                          aria-label="Cerrar barra de navegación (Esc)"
                        >
                          <MaestroIcon name="x" size={13} />
                          <span>Esc</span>
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {railGroups[1]!.items.map((item) => {
                          const active = activePath === item.href;
                          const hint = navExploreHints[item.href];
                          return (
                            <a
                              key={item.href}
                              href={item.href}
                              aria-current={active ? "page" : undefined}
                              onPointerEnter={() => prefetchRoute(item.href)}
                              onTouchStart={() => prefetchRoute(item.href)}
                              onClick={(e) => {
                                e.preventDefault();
                                closeHeaderNav();
                                navigateTo(item.href);
                              }}
                              className="pl-header-overlay-link pl-header-overlay-link--explore"
                            >
                              <ShellNavIcon
                                icon={item.icon}
                                packSlug={item.packIconSlug}
                                size={15}
                                className="pl-header-overlay-icon shrink-0 mt-0.5"
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate leading-snug">{item.label}</span>
                                {hint ? (
                                  <span className="pl-header-overlay-hint block truncate">{hint}</span>
                                ) : null}
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    </section>
                  </div>
                </div>
              </nav>

              <button
                type="button"
                className="pl-btn-glass pl-header-search text-[13px] min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-10 px-2.5 sm:px-3 inline-flex items-center justify-between gap-2 min-w-0"
                aria-keyshortcuts={isApplePlatform ? "Meta+K" : "Control+K"}
                onClick={() => {
                  requestFullShell();
                  setCmdkOpen(true);
                }}
              >
                <span className="sr-only">Buscar partido, liga o @socio</span>
                <span className="inline-flex items-center gap-1.5 sm:gap-2 min-w-0 sm:flex-1 overflow-hidden" style={{ color: "var(--pl-text-secondary)" }} aria-hidden="true">
                  <MaestroIcon name="search" size={16} className="shrink-0" />
                  <span className="hidden sm:inline truncate">
                    Buscar partido, liga o @socio
                  </span>
                  <span className="pl-header-search-short sm:hidden font-semibold whitespace-nowrap">Buscar</span>
                </span>
                <span className="pl-header-kbd-group items-center shrink-0" aria-hidden="true">
                  <kbd className="pl-header-kbd" aria-hidden="true">
                    {isApplePlatform ? <MaestroIcon name="command" size={11} /> : "Ctrl"}
                  </kbd>
                  <kbd className="pl-header-kbd pl-header-kbd--key" aria-hidden="true">K</kbd>
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2 shrink-0">
            <NotificationBell />

            <button
              ref={profileTriggerRef}
              type="button"
              popoverTarget={profileMenuId}
              className="pl-btn-glass pl-profile-chip"
              aria-haspopup="dialog"
              aria-expanded={profileMenuOpen}
              data-profile-menu-trigger=""
              onClick={() => {
                const rect = profileTriggerRef.current?.getBoundingClientRect();
                const menu = profileMenuRef.current;
                if (rect && menu) {
                  menu.style.setProperty("--menu-top", `${rect.bottom + 8}px`);
                  menu.style.setProperty(
                    "--menu-right",
                    `${Math.max(8, document.documentElement.clientWidth - rect.right)}px`,
                  );
                }
              }}
            >
              {viewerRole === "visitor" ? (
                <>
                  <span className="sr-only">Menú de cuenta, </span>
                  <span className="pl-profile-chip-label">Entrar</span>
                </>
              ) : (
                <>
                  <span className="sr-only">{`Menú de ${profileHandle}`}</span>
                  <span
                    className="pl-acct-avatar size-7 text-[10px]"
                    style={{ background: profileGrad }}
                    aria-hidden="true"
                  >
                    {showProfileAvatarImg ? (
                      <ProgressiveImage
                        src={profileAvatarUrl!}
                        alt=""
                        width={28}
                        height={28}
                        decoding="async"
                        className="pl-avatar-img"
                        onError={() => setBrokenAvatarUrl(profileAvatarUrl)}
                      />
                    ) : (
                      profileInitials
                    )}
                  </span>
                  <span className="hidden sm:inline font-bold truncate max-w-[92px]" aria-hidden="true">{profileHandle}</span>
                  <span className="hidden lg:inline-flex" aria-hidden="true">
                    <UltraTag />
                  </span>
                </>
              )}
              <MaestroIcon name="chevronDown" size={14} className="pl-profile-chip-chevron" />
            </button>

            <div
              id={profileMenuId}
              ref={profileMenuRef}
              popover="auto"
              className="pl-profile-menu"
              role="dialog"
              aria-label="Menú de tu cuenta"
              onKeyDown={onProfileMenuKeyDown}
              style={profileSheetSwipe.sheetStyle}
            >
              <div className="pl-profile-menu-sheet-top" {...profileSheetSwipe.handleProps}>
                <span className="pl-profile-menu-grab" aria-hidden="true" />
                <button
                  type="button"
                  className="pl-profile-menu-close"
                  aria-label="Cerrar menú de tu cuenta"
                  onClick={closeProfileMenu}
                >
                  <MaestroIcon name="x" size={16} />
                </button>
              </div>
              {viewerRole === "visitor" && hasAccountSession && viewerIdentity ? (
                <div className="pl-profile-menu-head pl-profile-menu-head--visitor">
                  <div className="flex items-center gap-3">
                    <span
                      className="pl-acct-avatar size-10 text-xs"
                      style={{ background: profileGrad }}
                      aria-hidden="true"
                    >
                      {viewerIdentity.initials}
                    </span>
                    <div className="min-w-0">
                      <strong className="pl-profile-menu-name">
                        {viewerIdentity.displayName}
                      </strong>
                      <span className="pl-profile-menu-sub">
                        {viewerIdentity.handle ? `@${viewerIdentity.handle} · ` : ""}
                        Prueba finalizada · SIN PASE
                      </span>
                    </div>
                  </div>
                  <div className="pl-profile-menu-ctas">
                    <a
                      href={upgradeHref}
                      className="pl-profile-menu-cta pl-profile-menu-cta--primary"
                      onClick={(e) => {
                        e.preventDefault();
                        closeProfileMenu();
                        navigateTo(upgradeHref);
                      }}
                    >
                      Activar Pase Ultra
                    </a>
                    <a
                      href="/app/account"
                      className="pl-profile-menu-cta"
                      onClick={(e) => {
                        e.preventDefault();
                        closeProfileMenu();
                        navigateTo("/app/account");
                      }}
                    >
                      Mi cuenta
                    </a>
                  </div>
                </div>
              ) : viewerRole === "visitor" ? (
                <div className="pl-profile-menu-head pl-profile-menu-head--visitor">
                  <div className="flex items-center gap-3">
                    <span className="pl-acct-avatar pl-acct-avatar--empty size-10" aria-hidden="true">
                      <MaestroIcon name="sparkles" size={18} />
                    </span>
                    <div className="min-w-0">
                      <strong className="pl-profile-menu-name">Estás de visita</strong>
                      <span className="pl-profile-menu-sub">Crea tu cuenta para registrar picks y seguir socios.</span>
                    </div>
                  </div>
                  <div className="pl-profile-menu-ctas">
                    <a
                      href="/signup"
                      className="pl-profile-menu-cta pl-profile-menu-cta--primary"
                      onClick={(e) => {
                        e.preventDefault();
                        closeProfileMenu();
                        navigateTo("/signup");
                      }}
                    >
                      Hazte socio
                    </a>
                    <a
                      href="/login"
                      className="pl-profile-menu-cta"
                      onClick={(e) => {
                        e.preventDefault();
                        closeProfileMenu();
                        navigateTo("/login");
                      }}
                    >
                      Entrar
                    </a>
                  </div>
                </div>
              ) : (
                <div className="pl-profile-menu-head">
                  <span
                    className="pl-acct-avatar size-10 text-xs"
                    style={{ background: profileGrad }}
                    aria-hidden="true"
                  >
                    {showProfileAvatarImg ? (
                      <ProgressiveImage
                        src={profileAvatarUrl!}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        fetchPriority="low"
                        decoding="async"
                        className="pl-avatar-img"
                        onError={() => setBrokenAvatarUrl(profileAvatarUrl)}
                      />
                    ) : (
                      profileInitials
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="pl-profile-menu-name">
                      <span className="truncate">{profileHandle}</span>
                      {viewerRole === "tipster" ? <VerifiedBadge size={15} /> : null}
                      <UltraTag />
                    </div>
                    <span className="pl-profile-menu-sub">{profileSubline}</span>
                  </div>
                </div>
              )}

              {profileMenuGroups.map((group) => (
                <nav key={group.label} className="pl-profile-menu-group" aria-label={group.label}>
                  {group.items.map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      aria-current={activePath === item.href ? "page" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        closeProfileMenu();
                        if (item.accountTab) {
                          window.dispatchEvent(
                            new CustomEvent(ACCOUNT_TAB_EVENT, { detail: item.accountTab }),
                          );
                        }
                        navigateTo(item.href);
                      }}
                    >
                      <MaestroIcon name={item.icon} size={17} />
                      <span>{item.label}</span>
                      {item.trail ?? null}
                    </a>
                  ))}
                </nav>
              ))}

              <div className="pl-profile-menu-group pl-profile-menu-settings">
                <div className="pl-profile-menu-setting">
                  <span id={`${profileMenuId}-odds`}>Momio</span>
                  <MenuSegment
                    labelledBy={`${profileMenuId}-odds`}
                    value={oddsFormat}
                    onChange={(v) => setOddsFormat(v as OddsFormat)}
                    options={[
                      { value: "american", label: "Americano", hint: "−150" },
                      { value: "decimal", label: "Decimal", hint: "1.67" },
                    ]}
                  />
                </div>
                <div className="pl-profile-menu-setting">
                  <span id={`${profileMenuId}-theme`}>Tema</span>
                  <MenuSegment
                    labelledBy={`${profileMenuId}-theme`}
                    value={docTheme}
                    onChange={(v) => applyTheme(v as "dark" | "light")}
                    dataAttr="data-theme-option"
                    options={[
                      { value: "dark", label: "Oscuro", icon: "moon" },
                      { value: "light", label: "Claro", icon: "sun" },
                    ]}
                  />
                </div>
                {allowRoleSimulation ? (
                  <div className="pl-profile-menu-setting pl-profile-menu-setting--mobile-only">
                    <span id={`${profileMenuId}-role`}>Rol</span>
                    <MenuSegment
                      labelledBy={`${profileMenuId}-role`}
                      value={viewerRole}
                      onChange={(v) => setViewerRole(v as ViewerRole)}
                      options={[
                        { value: "visitor", label: "Visita" },
                        { value: "subscriber", label: "Socio" },
                        { value: "tipster", label: "Tipster" },
                        { value: "admin", label: "Admin" },
                      ]}
                    />
                  </div>
                ) : null}
              </div>

              {viewerRole !== "visitor" ? (
                <div className="pl-profile-menu-group pl-profile-menu-foot">
                  <button
                    type="button"
                    className="pl-profile-menu-logout"
                    onClick={() => {
                      closeProfileMenu();
                      void logoutSession();
                    }}
                  >
                    <MaestroIcon name="logout" size={17} />
                    <span>Salir</span>
                  </button>
                  <span className="pl-profile-menu-version num">v0.0.1-alpha</span>
                </div>
              ) : (
                <div className="pl-profile-menu-group pl-profile-menu-foot pl-profile-menu-foot--visitor">
                  <span className="pl-profile-menu-version num">v0.0.1-alpha</span>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
        </div>

        {isHomeRoute && homeNav ? (
          <div className="pl-header-sportband">
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-7">
              <HomeSportStrip
                dayGames={homeDayGames}
                sport={homeSport}
                onSelectSport={homeNav.pickSport}
                variant="header"
                scrollToTopOnSelect
              />
            </div>
          </div>
        ) : null}

        {homeNav ? (
          <div
            className="pl-header-leagueband"
            data-open={hasLeaguesOpen ? "true" : "false"}
            aria-hidden={!hasLeaguesOpen || undefined}
            inert={!hasLeaguesOpen ? true : undefined}
          >
            <div className="pl-header-leagueband-inner">
              {displayedLeagues ? (
                <div
                  key={displayedLeagues.sport}
                  className="pl-header-leagueband-content max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-7"
                >
                  <HomeLeagueStrip
                    leagues={displayedLeagues.leagues}
                    sportDayGamesCount={displayedLeagues.count}
                    league={displayedLeagues.league}
                    onSelectLeague={homeNav.setLeague}
                    favoriteLeagues={favoriteLeagues}
                  />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      <div className="app-frame" data-shell-context={shellContext}>
        <main id="main" className="min-w-0 space-y-6">
          <div key={activePath} className="pl-page-enter space-y-6">
            {children}
          </div>
          <ClubFooter />
        </main>
      </div>

      <nav
        aria-label="Navegación móvil"
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
              onPointerEnter={() => prefetchRoute(item.href)}
              onTouchStart={() => prefetchRoute(item.href)}
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
          data-mobile-more-trigger=""
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
        maxWidth="28rem"
        dialogClassName="pl-more-sheet-dialog"
      >
        <div
          ref={moreSheetScrollRef}
          className="pl-more-sheet-inner glass-lens glass-ring w-full space-y-4 overflow-y-auto"
          style={moreSheetSwipe.sheetStyle}
        >
          <div className="pl-sheet-drag-zone space-y-3" {...moreSheetSwipe.handleProps}>
            <div className="pl-bottom-sheet-handle sm:hidden" aria-hidden="true" />
            <div className="flex items-center justify-between">
              <h2 id="mobile-more-dialog-title" className="m-0 text-base font-bold">
                Explorar
              </h2>
              <button
                type="button"
                autoFocus
                className="pl-btn-glass px-2.5 min-h-11 min-w-11 inline-flex items-center justify-center"
                aria-label="Cerrar menú móvil"
                onClick={() => setMobileMoreOpen(false)}
              >
                <MaestroIcon name="x" size={16} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {allClubItems.map((m) => (
              <a
                key={m.href}
                href={m.href}
                aria-current={activePath === m.href ? "page" : undefined}
                onPointerEnter={() => prefetchRoute(m.href)}
                onTouchStart={() => prefetchRoute(m.href)}
                onClick={(e) => {
                  e.preventDefault();
                  setMobileMoreOpen(false);
                  navigateTo(m.href);
                }}
                className="pl-btn-glass min-h-11 text-xs justify-start gap-2"
              >
                <ShellNavIcon icon={m.icon} packSlug={m.packIconSlug} size={14} />
                <span className="truncate">{m.shortLabel ?? m.label}</span>
              </a>
            ))}
          </div>

          <div className="ticket-perf" />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="pl-header-overlay-subheading block">Ligas activas</span>
              {clubLeagues.length > 10 ? (
                <button
                  type="button"
                  className="pl-more-leagues-all-btn num"
                  onClick={() => {
                    setMobileMoreOpen(false);
                    setLeagueHubSheetOpen(true);
                  }}
                >
                  Ver todas ({activeDatasetLeagues.length})
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {clubLeagues.slice(0, 10).map((lg) => {
                const href = `/app/${lg.league}`;
                const active = activePath === href || activePath.startsWith(`${href}/`);
                return (
                  <a
                    key={lg.league}
                    href={href}
                    data-league={lg.league}
                    data-active={active ? "true" : undefined}
                    aria-current={active ? "page" : undefined}
                    onClick={(e) => {
                      e.preventDefault();
                      setMobileMoreOpen(false);
                      navigateTo(href);
                    }}
                    className="league-tab pl-btn-glass min-h-11 text-xs justify-start gap-2"
                  >
                    <LeagueBadge league={lg.league} label={lg.label} logoUrl={lg.logoUrl} size={16} decorative />
                    <span className="truncate">{lg.label}</span>
                  </a>
                );
              })}
            </div>
          </div>

          {nationalLeagues.length > 0 ? (
            <div className="space-y-2 pt-1">
              <span className="pl-header-overlay-subheading block">Selecciones</span>
              <div className="grid grid-cols-2 gap-2">
                {nationalLeagues.map((lg) => {
                  const href = `/app/${lg.league}`;
                  const active = activePath === href || activePath.startsWith(`${href}/`);
                  return (
                    <a
                      key={lg.league}
                      href={href}
                      data-league={lg.league}
                      data-active={active ? "true" : undefined}
                      aria-current={active ? "page" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        setMobileMoreOpen(false);
                        navigateTo(href);
                      }}
                      className="league-tab pl-btn-glass min-h-11 text-xs justify-start gap-2"
                    >
                      <LeagueBadge league={lg.league} label={lg.label} logoUrl={lg.logoUrl} size={16} decorative />
                      <span className="truncate">{lg.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="pt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <a href="/legal/juego-responsable" className="underline min-h-11 inline-flex items-center">
              Ayuda y juego responsable +18
            </a>
            <OddsFormatSegment />
          </div>
        </div>
      </TopLayerModalDialog>

      {leagueHubSheetOpen ? (
        <Suspense fallback={null}>
          <LazyLeagueCategorySheet
            open={leagueHubSheetOpen}
            onClose={() => setLeagueHubSheetOpen(false)}
            title="Todas las competiciones"
            selectedLeague="all"
            includeAllOption={false}
            allowShowInactive
            onSelect={(next) => {
              if (next !== "all") navigateTo(`/app/${next}`);
            }}
            leagues={dataset.leagues.map((lg) => ({
              league: lg.league,
              label: lg.label,
              logoUrl: lg.logoUrl,
              activeCount: lg.upcomingCount || lg.totalGames,
              dayCount: todayGamesByLeague.get(lg.league) ?? 0,
              isFavorite: favoriteLeagues.includes(lg.league),
              isActive: isLeagueActiveInWindow(dataset.games, lg.league, homeToday, 30),
            }))}
          />
        </Suspense>
      ) : null}
      {activePath !== "/app/parlays" && parlayLegs.length > 0 ? (
        <Suspense fallback={null}>
          <LazyMobileParlaySheet />
        </Suspense>
      ) : null}
    </>
  );
}

interface PrimaryNavItem extends RailNavItem {
  shortLabel?: string;
}

function primaryNavItems(parlayCount: number, journalCount: number): PrimaryNavItem[] {
  return [
    { href: "/app", label: "Hoy", navLabel: "Hoy", icon: "calendar" },
    {
      href: "/app/parlays",
      label: "Armar parlay",
      navLabel: "Parlays",
      shortLabel: parlayCount > 0 ? `Parlay (${parlayCount})` : "Parlay",
      icon: "layers",
      badge: parlayCount > 0 ? `${parlayCount}` : undefined,
      badgeBrand: parlayCount > 0,
    },
    { href: "/app/social", label: "Comunidad", navLabel: "Comunidad", icon: "users" },
    {
      href: "/app/lab",
      label: "Mi récord",
      navLabel: "Mi récord",
      shortLabel: "Récord",
      icon: "ticket",
      badge: journalCount > 0 ? `${journalCount}` : undefined,
    },
  ];
}
