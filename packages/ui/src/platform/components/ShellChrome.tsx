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
import { formatUnits, profileRecord } from "../profile-stats";
import { ownHandleFor, useAuraColors, usePlatform } from "../platform-provider";
import type { OddsFormat } from "../types";
import {
  MaestroIcon,
  RoleSwitcherPill,
  UltraTag,
  VerifiedBadge,
  type MaestroIconName,
} from "./MaestroPrimitives";
import {
  BetaPinModal,
  CommandPaletteModal,
  ParlayFloatingDock,
  PickComposerModal,
  RoleSimulatorBar,
  ShareTicketModal,
  ToastViewport,
  TopLayerModalDialog,
} from "./PlatformOverlays";
import { NotificationBell } from "./NotificationInbox";

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

/** Tema actual del documento (`html[data-theme]`), al día si otro control lo cambia. */
function useDocumentTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setTheme(root.dataset.theme === "light" ? "light" : "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

/** Mismo cambio que ThemeToggle: sin transiciones durante el cambio y guardado en `pl-theme`. */
function applyTheme(next: "dark" | "light"): void {
  const root = document.documentElement;
  if ((root.dataset.theme === "light" ? "light" : "dark") === next) return;
  root.dataset.themeSwitching = "true";
  root.dataset.theme = next;
  void root.offsetHeight;
  delete root.dataset.themeSwitching;
  try {
    window.localStorage.setItem("pl-theme", next);
  } catch (err) {
    void err;
  }
}

/** Control segmentado del menú de cuenta (Momio y Tema). ←/→ mueven la selección. */
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

  const effectivePath = activePath ?? clientPath;
  if (!allowRoleSimulation || !isClubAppRoute(effectivePath)) return null;

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
  const [clientPath, setClientPath] = useState<string>(activePath ?? "");

  useEffect(() => {
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
          <ParlayFloatingDock />
          <PickComposerModal />
          <ShareTicketModal />
          <CommandPaletteModal />
          <RoleSimulatorBar activePath={activePath} />
        </>
      ) : null}
      <BetaPinModal />
      <ToastViewport />
    </div>
  );
}

export function PublicHeaderV4({
  activePath = "/",
}: {
  activePath?: string;
}): React.JSX.Element {
  const { navigateTo, viewerRole } = usePlatform();

  const navItems = [
    { href: "/como-funciona", label: "Cómo funciona" },
    { href: "/motores", label: "Motores" },
    { href: "/resultados", label: "Resultados" },
    { href: "/parlays", label: "Parlays" },
    { href: "/comunidad", label: "Comunidad" },
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
          <BrandLogo variant="horizontal" width={120} height={24} alt="PitchLab" />
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Información para decidir, no una garantía. PitchLab no acepta apuestas. Solo mayores de
            18.
          </p>
        </div>

        <nav aria-label="Pie" className="flex flex-wrap items-center gap-4 text-xs font-semibold">
          <a
            href="/como-funciona"
            onClick={(e) => {
              e.preventDefault();
              navigateTo("/como-funciona");
            }}
            className="no-underline hover:underline"
          >
            Cómo funciona
          </a>
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
          <a
            href="/comunidad#tipstars"
            onClick={(e) => {
              e.preventDefault();
              navigateTo("/comunidad#tipstars");
            }}
            className="no-underline hover:underline"
          >
            ¿Eres tipstar?
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

/** Evento que avisa a la vista de Cuenta qué pestaña abrir (el menú del perfil la elige). */
export const ACCOUNT_TAB_EVENT = "pl-account-tab";

interface ProfileMenuItem {
  href: string;
  label: string;
  icon: MaestroIconName;
  accountTab?: "referrals" | "plan" | "prefs" | "cfdi";
  /** Dato a la derecha de la fila (récord, abiertos). */
  trail?: React.ReactNode;
}
interface ProfileMenuGroup {
  label: string;
  items: ProfileMenuItem[];
}

const CLUB_FOOTER_LINKS = [
  { href: "/como-funciona", label: "Cómo funciona" },
  { href: "/motores", label: "Motores" },
  { href: "/precio", label: "Precio" },
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
    setCmdkOpen,
    logoutSession,
    navigateTo,
    oddsFormat,
    setOddsFormat,
    viewerIdentity,
  } = usePlatform();
  // Con cuenta, el usuario real; con el PIN de la beta, el de ejemplo según el rol.
  const ownHandle = ownHandleFor(viewerIdentity, viewerRole);

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
  const ownRecord = useMemo(() => profileRecord(journal), [journal]);
  const profileMenuGroups = useMemo(() => {
    if (viewerRole === "visitor") {
      return [
        {
          label: "Ayuda",
          items: [
            { href: "/app/tech", label: "Cómo calculamos", icon: "cpu" },
            { href: "/legal/juego-responsable", label: "Juego responsable", icon: "shield" },
          ],
        },
      ] satisfies ProfileMenuGroup[];
    }
    const handle = ownHandle;
    // El récord va junto a la fila que lleva a él. El tipstar simulado es un perfil de ejemplo.
    const showRecord = viewerRole !== "tipstar" && ownRecord.settled > 0;
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
          { href: "/app/lab", label: "Mi bitácora", icon: "ticket", trail: journalTrail },
        ],
      },
      {
        label: "Tu cuenta",
        items: [
          { href: "/app/account?tab=plan", label: "Mi plan Ultra", icon: "crown", accountTab: "plan" },
          { href: "/app/account?tab=referrals", label: "Invitar amigos", icon: "gift", accountTab: "referrals" },
          { href: "/app/account?tab=prefs", label: "Preferencias", icon: "sliders", accountTab: "prefs" },
          { href: "/app/account?tab=cfdi", label: "Facturación", icon: "receipt", accountTab: "cfdi" },
        ],
      },
    ];
    const roleItems: ProfileMenuItem[] = [];
    if (viewerRole === "tipstar" || viewerRole === "admin") {
      roleItems.push({ href: "/app/tipstar", label: "Portal tipstar", icon: "star" });
    }
    if (viewerRole === "admin") {
      roleItems.push({ href: "/app/admin", label: "Consola", icon: "chart" });
    }
    if (roleItems.length > 0) groups.push({ label: "Herramientas", items: roleItems });
    groups.push({
      label: "Ayuda",
      items: [
        { href: "/app/tech", label: "Cómo calculamos", icon: "cpu" },
        { href: "/legal/juego-responsable", label: "Juego responsable", icon: "shield" },
      ],
    });
    return groups;
  }, [viewerRole, ownRecord, journal.length, ownHandle]);

  const docTheme = useDocumentTheme();
  // Teclado: flechas, Inicio y Fin recorren los enlaces del menú.
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

  // Navegación: 4 destinos principales, las ligas y un grupo «Más» para lo secundario.
  // El portal de tipstars y la consola solo aparecen para quien los usa.
  const railGroups: RailNavGroup[] = useMemo(() => {
    // Cuenta, «Cómo calculamos», Portal tipstar y Consola viven en el menú del perfil.
    const explore: RailNavItem[] = [
      { href: "/app/picks", label: "Picks del día", icon: "sparkles" },
      { href: "/app/momios", label: "Momios y ventaja", icon: "activity" },
      { href: "/app/props", label: "Props de jugadores", icon: "sliders" },
      { href: "/app/historial", label: "Resultados", icon: "shield" },
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
  const roleLabel = viewerRole === "tipstar" ? "Tipstar verificado" : viewerRole === "admin" ? "Admin" : "Socio";
  const profileSubline = viewerIdentity
    ? `${viewerIdentity.displayName} · ${roleLabel}`
    : viewerRole === "tipstar"
      ? "Sofía Méndez · Tipstar verificado"
      : roleLabel;
  const profileInitials = viewerIdentity?.initials ?? (viewerRole === "tipstar" ? "SM" : "SP");
  const profileGrad =
    viewerRole === "tipstar" ? "var(--avatar-grad-1)" : "var(--avatar-grad-2)";

  return (
    <>
      <header className="panel-header sticky top-0 z-30 glass-nav-surface">
        <div className="max-w-[1440px] lg:max-w-none mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-2.5">
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
            <NotificationBell />

            {/* Chip de perfil: abre el menú de la cuenta (popover en escritorio, hoja en móvil). */}
            <button
              ref={profileTriggerRef}
              type="button"
              popoverTarget={profileMenuId}
              className="pl-btn-glass pl-profile-chip"
              aria-haspopup="dialog"
              aria-expanded={profileMenuOpen}
              aria-label={viewerRole === "visitor" ? "Menú, entrar o crear cuenta" : `Menú de ${profileHandle}`}
              data-profile-menu-trigger=""
              onClick={() => {
                // Antes de abrir: colocar el panel bajo el chip, alineado a su borde derecho.
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
                <span className="pl-profile-chip-label">Entrar</span>
              ) : (
                <>
                  <span
                    className="pl-acct-avatar size-7 text-[10px]"
                    style={{ background: profileGrad }}
                    aria-hidden="true"
                  >
                    {profileInitials}
                  </span>
                  <span className="hidden sm:inline font-bold truncate max-w-[92px]">{profileHandle}</span>
                  <UltraTag className="hidden lg:inline-flex" />
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
            >
              <span className="pl-profile-menu-grab" aria-hidden="true" />
              {viewerRole === "visitor" ? (
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
                    {profileInitials}
                  </span>
                  <div className="min-w-0">
                    <div className="pl-profile-menu-name">
                      <span className="truncate">{profileHandle}</span>
                      {viewerRole === "tipstar" ? <VerifiedBadge size={15} /> : null}
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
                  <span className="pl-profile-menu-version">Beta</span>
                </div>
              ) : null}
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

          {/* Solo esta capa se desplaza si no cabe; el marco y su borde quedan fijos. */}
          <div className="rail-scroll">
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

          </div>
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
    { href: "/app/social", label: "Comunidad", icon: "users" },
    {
      href: "/app/lab",
      label: "Mi bitácora",
      shortLabel: "Bitácora",
      icon: "ticket",
      badge: journalCount > 0 ? `${journalCount}` : undefined,
    },
  ];
}
