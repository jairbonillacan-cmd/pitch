"use client";

import React, { useEffect, useRef, useState } from "react";
import { AppShell } from "@astryxdesign/core/AppShell";
import { BottomSheet } from "@astryxdesign/core/BottomSheet";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Tooltip } from "@astryxdesign/core/Tooltip";
import { InternationalizationProvider } from "@astryxdesign/core/i18n";
import { Button, Chip, Popover, SearchField } from "@heroui/react";
import { AstryxScope } from "../astryx.js";
import { Icon, type IconName } from "../icons.js";
import { BrandLogo, Mascot, ThemeToggle } from "../primitives.js";
import { LeagueBadge } from "../sports.js";
import type { HomeLeague, HomeSearchMatch } from "./data.js";

export const HOME_LEGAL = "Información para decidir, no una garantía. PitchLab no acepta apuestas. Solo mayores de 18.";

const sports = [
  { id: "liga-mx", label: "Liga MX" },
  { id: "nfl", label: "NFL" },
  { id: "premier-league", label: "Premier League" },
  { id: "laliga", label: "LaLiga" },
  { id: "bundesliga", label: "Bundesliga" },
];

interface NavItem {
  label: string;
  icon: IconName;
  href?: string;
  league?: string;
}

const start: NavItem = { label: "Inicio", icon: "home", href: "/app" };
const research: NavItem[] = [
  { label: "Jugadores", icon: "user" },
  { label: "Equipos", icon: "shield" },
  { label: "Prop Lab", icon: "model" },
];
const odds: NavItem = { label: "Cuotas", icon: "trend", href: "#movimientos" };
const leaderboards: NavItem = { label: "Leaderboards", icon: "competition" };
const lab: NavItem = { label: "Mi Lab", icon: "sources", href: "#mis-picks" };
const watchlists: NavItem = { label: "Watchlists", icon: "bookmark" };
const help: NavItem = { label: "Ayuda y juego responsable", icon: "info", href: "/legal/juego-responsable" };
const trialDays = 5;
const messages = { "es-MX": { "@astryx.appShell.skipToContent": "Saltar al contenido" } };

function NavRow({ item, onNavigate, rail = false }: {
  item: NavItem;
  onNavigate?: () => void;
  rail?: boolean;
}) {
  const contents = (
    <>
      {item.league ? <LeagueBadge league={item.league} size={20} /> : <Icon name={item.icon} />}
      <span className="ph-nav-label">{item.label}</span>
      {!item.href && <small className="ph-nav-status">Próximamente</small>}
    </>
  );
  const row = item.href ? (
    <a className="ph-nav-row" href={item.href} aria-label={item.label} aria-current={item.href === "/app" ? "page" : undefined} onClick={onNavigate}>
      {contents}
    </a>
  ) : (
    <button type="button" className="ph-nav-row" aria-disabled="true" aria-label={`${item.label} · Próximamente`}>{contents}</button>
  );
  return rail ? (
    <Tooltip content={item.href ? item.label : `${item.label} · Próximamente`} placement="end" hasHoverIndication={false}>{row}</Tooltip>
  ) : row;
}

function Sidebar({ leagues }: { leagues: HomeLeague[] }) {
  const groups = [
    { title: "Deportes", items: sports.map<NavItem>(({ id, label }) => ({
      label,
      icon: "games",
      league: id,
      href: leagues.some((league) => league.id === id) ? `/app/${id}` : undefined,
    })) },
    { title: "Investigar", items: research },
    { title: "Mercados", items: [odds] },
    { title: "Comunidad", items: [leaderboards] },
    { title: "Personal", items: [lab, watchlists] },
  ];
  return (
    <nav className="ph-sidebar" aria-label="Navegación principal">
      <NavRow item={start} rail />
      {groups.map(({ title, items }) => (
        <div key={title} className="ph-nav-group" role="group" aria-label={title}>
          <p aria-hidden="true">{title}</p>
          {items.map((item) => <NavRow key={item.label} item={item} rail />)}
        </div>
      ))}
      <div className="ph-trial">
        <div className="ph-trial-heading"><strong>Prueba Pro</strong><small>Ejemplo</small></div>
        <p>Te quedan <b className="num">{trialDays} días</b>.</p>
        <progress value={7 - trialDays} max={7} aria-label="Días transcurridos de la prueba de ejemplo" />
        <a href="/#planes" className="ph-text-link">Ver planes <Icon name="arrow" /></a>
      </div>
    </nav>
  );
}

function normalize(text: string) {
  return text.toLocaleLowerCase("es-MX").normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function MatchSearch({ matches, mobile = false, inputRef }: {
  matches: HomeSearchMatch[];
  mobile?: boolean;
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const [value, setValue] = useState("");
  const [hasFocus, setHasFocus] = useState(false);
  const query = normalize(value.trim());
  const terms = query.split(/\s+/);
  const show = query.length > 0 && (hasFocus || mobile);
  const results = show ? matches.filter((match) => {
    const searchable = normalize(`${match.matchup} ${match.leagueLabel}`);
    return terms.every((term) => searchable.includes(term));
  }).slice(0, 6) : [];
  return (
    <div className="ph-search"
      onFocus={() => setHasFocus(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setHasFocus(false);
      }}
    >
      <SearchField
        fullWidth
        aria-label="Buscar equipo, jugador o partido"
        value={value}
        onChange={setValue}
        onSubmit={() => {
          if (results[0]) window.location.assign(results[0].href);
        }}
      >
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input
            ref={inputRef}
            autoFocus={mobile}
            data-autofocus={mobile ? "" : undefined}
            placeholder="Buscar equipo, jugador o partido"
            aria-keyshortcuts="Control+k Meta+k"
          />
          {!mobile && !value && <kbd aria-hidden="true">⌘ K</kbd>}
          <SearchField.ClearButton aria-label="Limpiar búsqueda" />
        </SearchField.Group>
      </SearchField>
      {show ? (
        <div className="ph-search-results">
          <p role="status">{results.length ? `${results.length} partidos encontrados` : "Sin partidos para esta búsqueda"}</p>
          <ul>
            {results.map((match) => (
              <li key={match.id}>
                <a href={match.href}>
                  <LeagueBadge league={match.league} size={22} />
                  <span className="ph-stack"><strong>{match.matchup}</strong><small>{match.leagueLabel} · {match.date} · {match.time}</small></span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : mobile && <p className="ph-muted">Busca equipos y partidos publicados en la beta.</p>}
    </div>
  );
}

function AccountDetails() {
  const [logout, setLogout] = useState<"ready" | "pending" | "error">("ready");
  async function signOut() {
    setLogout("pending");
    try {
      const response = await fetch("/api/beta/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout");
      window.location.assign("/");
    } catch {
      setLogout("error");
    }
  }
  return (
    <div className="ph-account-details">
      <p>Acceso a la beta privada</p>
      <a href="/#planes" className="ph-text-link">Ver planes <Icon name="arrow" /></a>
      <Button variant="secondary" isDisabled={logout === "pending"} onPress={signOut}>Salir de la beta</Button>
      {logout === "error" && <p role="alert">No se pudo cerrar la sesión. Intenta de nuevo.</p>}
    </div>
  );
}

function ActiveLeague({ leagues, active, onChange }: {
  leagues: HomeLeague[];
  active?: HomeLeague;
  onChange: (id: string) => void;
}) {
  if (!active) return null;
  return (
    <Popover>
      <Button variant="secondary" className="ph-league-trigger" aria-label={`Liga activa: ${active.label}`}>
        <LeagueBadge league={active.id} size={20} />
        <span>{active.label}</span><Icon name="chevron" />
      </Button>
      <Popover.Content placement="bottom end">
        <Popover.Dialog className="ph-league-popover" aria-label="Cambiar liga activa">
          <Popover.Heading>Liga activa</Popover.Heading>
          <SegmentedControl label="Liga activa" size="lg" value={active.id} onChange={onChange}>
            {leagues.map((league) => <SegmentedControlItem key={league.id} value={league.id} label={league.label} />)}
          </SegmentedControl>
          <a href={`/app/${active.id}`} className="ph-text-link">Ver jornada <Icon name="arrow" /></a>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

export function HomeShell({ leagues, searchMatches, children }: {
  leagues: HomeLeague[];
  searchMatches: HomeSearchMatch[];
  children: React.ReactNode;
}) {
  const [sheet, setSheet] = useState<"more" | "search" | "research" | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<string>();
  const available = sports.filter(({ id }) => leagues.some((league) => league.id === id));
  const active = available.find(({ id }) => id === selectedLeague) ?? available[0] ?? leagues[0];
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLButtonElement>(null);
  const close = () => setSheet(null);

  useEffect(() => {
    function searchShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey)) return;
      if (sheet && sheet !== "search") return;
      event.preventDefault();
      if (window.matchMedia("(width < 768px)").matches) setSheet("search");
      else inputRef.current?.focus();
    }
    document.addEventListener("keydown", searchShortcut);
    return () => document.removeEventListener("keydown", searchShortcut);
  }, [sheet]);

  const header = (
    <div className="ph-header">
      <a href="/app" aria-label="PitchLab · Inicio" className="ph-logo">
        <span className="ph-logo-full"><BrandLogo width={148} height={29} /></span>
        <span className="ph-logo-rail"><BrandLogo variant="isotype" width={26} height={26} /></span>
        <span className="ph-logo-mobile"><BrandLogo variant="compact" width={124} height={29} /></span>
      </a>
      <div className="ph-header-controls">
        <div className="ph-desktop-search"><MatchSearch matches={searchMatches} inputRef={inputRef} /></div>
        <div className="ph-header-league"><ActiveLeague leagues={available.length ? available : leagues} active={active} onChange={setSelectedLeague} /></div>
        <Button ref={mobileSearchRef} isIconOnly variant="ghost" className="ph-mobile-search" aria-label="Buscar" aria-haspopup="dialog" onPress={() => setSheet("search")}>
          <Icon name="search" />
        </Button>
        <ThemeToggle />
        <Popover>
          <Button variant="secondary" isIconOnly className="ph-avatar" aria-label="Cuenta">
            <Icon name="user" />
          </Button>
          <Popover.Content placement="bottom end">
            <Popover.Dialog className="ph-account-popover" aria-label="Cuenta">
              <Popover.Heading>Cuenta</Popover.Heading>
              <AccountDetails />
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      </div>
    </div>
  );

  return (
    <AstryxScope>
      <InternationalizationProvider locale="es-MX" overrides={messages}>
      <AppShell height="auto" variant="section" mobileNav={false} className="ph-shell" topNav={header} sideNav={<Sidebar leagues={leagues} />}>
        {children}
        <nav className="ph-mobile-nav" aria-label="Navegación móvil">
          <a href="/app" aria-current="page"><Icon name="home" />Inicio</a>
          <a href={active ? `/app/${active.id}` : "#proximos"}><Icon name="games" />Partidos</a>
          <button type="button" aria-haspopup="dialog" onClick={() => setSheet("research")}><Icon name="search" />Investigar</button>
          <a href="#mis-picks"><Icon name="sources" />Mi Lab</a>
          <button type="button" aria-haspopup="dialog" onClick={() => setSheet("more")}><Icon name="more" />Más</button>
        </nav>
        <BottomSheet label="Buscar" height="tall" isOpen={sheet === "search"} onOpenChange={(open) => !open && close()} finalFocusRef={mobileSearchRef}>
          <div className="ph-sheet">
            <SheetHeading title="Buscar" close={close} />
            {sheet === "search" && <MatchSearch matches={searchMatches} mobile />}
          </div>
        </BottomSheet>
        <BottomSheet label="Investigar" height="hug" isOpen={sheet === "research"} onOpenChange={(open) => !open && close()}>
          <div className="ph-sheet">
            <SheetHeading title="Investigar" close={close} />
            <div className="ph-sheet-group">{research.map((item) => <NavRow key={item.label} item={item} />)}</div>
          </div>
        </BottomSheet>
        <BottomSheet label="Más" height="hug" isOpen={sheet === "more"} onOpenChange={(open) => !open && close()}>
          <div className="ph-sheet">
            <SheetHeading title="Más" close={close} />
            <div className="ph-sheet-group">
              {[odds, leaderboards, watchlists].map((item) => <NavRow key={item.label} item={item} onNavigate={close} />)}
            </div>
            <div className="ph-sheet-group">
              <details className="ph-sheet-account">
                <summary className="ph-nav-row">
                  <Icon name="user" /><span>Cuenta y plan</span>
                  <Chip size="sm" variant="soft">Prueba Pro · {trialDays} días · Ejemplo</Chip>
                </summary>
                <AccountDetails />
              </details>
              <NavRow item={help} />
            </div>
            <div className="ph-sheet-legal">
              <Mascot edition="soccer" size={52} />
              <p>{HOME_LEGAL}</p>
            </div>
          </div>
        </BottomSheet>
      </AppShell>
      </InternationalizationProvider>
    </AstryxScope>
  );
}

function SheetHeading({ title, close }: { title: string; close: () => void }) {
  return (
    <div className="ph-sheet-heading">
      <h2>{title}</h2>
      <Button isIconOnly variant="secondary" aria-label="Cerrar" onPress={close}><Icon name="close" /></Button>
    </div>
  );
}
