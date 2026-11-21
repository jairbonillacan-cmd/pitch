"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  canonicalGameHref,
  canonicalTeamHref,
  isNationalCompetition,
  isSafePublicLabel,
} from "@pitchlab/contracts";
import { LeagueBadge, TeamBadge } from "../../sports";
import { SofascoreTabs, type SofascoreTabItem } from "../../components/ui/primitives";
import {
  useOverlayState,
  usePlatformActions,
  usePlatformCore,
} from "../platform-provider";
import { shortDateLabel } from "../club/home/home-model";
import { TIPSTER_CREATORS } from "../spacetime-catalog";
import { PersonAvatar } from "../club/team/PersonAvatar";
import {
  useAbortableJson,
  useDebouncedValue,
  useSafeEffect,
} from "../hooks";
import { sanitizeInternalHref } from "../navigation-helpers";
import {
  ExampleBadge,
  MaestroIcon,
  type MaestroIconName,
} from "./MaestroPrimitives";
import { TopLayerModalDialog } from "./PlatformOverlays";

type CommandScope = "all" | "teams" | "players" | "referees" | "games" | "leagues";

const COMMAND_SCOPES: readonly SofascoreTabItem[] = [
  { id: "all", label: "Todo" },
  { id: "teams", label: "Equipos" },
  { id: "players", label: "Jugadores" },
  { id: "referees", label: "Árbitros" },
  { id: "games", label: "Partidos" },
  { id: "leagues", label: "Ligas" },
];

function isCommandScope(value: string): value is CommandScope {
  return (
    value === "all" ||
    value === "teams" ||
    value === "players" ||
    value === "referees" ||
    value === "games" ||
    value === "leagues"
  );
}

const CLUB_COMMAND_VIEWS: ReadonlyArray<{
  readonly label: string;
  readonly subtitle: string;
  readonly href: string;
  readonly icon: MaestroIconName;
}> = [
  {
    label: "Jornada y Partidos de Hoy",
    subtitle: "Cartelera en vivo de las competiciones activas",
    href: "/app",
    icon: "calendar",
  },
  {
    label: "Buscar picks",
    subtitle: "Escudo, Principal, Totales, Táctico y Valor",
    href: "/app/picks",
    icon: "sparkles",
  },
  {
    label: "Armar parlay",
    subtitle: "Combinadas de 2 a 6 selecciones sin selecciones opuestas",
    href: "/app/parlays",
    icon: "layers",
  },
  {
    label: "Alertas de mercado",
    subtitle: "Copiloto en español, apertura de líneas, movimiento sharp y EV+",
    href: "/app/alertas",
    icon: "bell",
  },
  {
    label: "Árbitros · Liga MX",
    subtitle: "Ranking arbitral, tarjetas ajustadas y rigor por liga",
    href: "/app/liga-mx/arbitros",
    icon: "whistle",
  },
  {
    label: "Comparar H2H",
    subtitle: "Equipos cara a cara y jugadores lado a lado",
    href: "/app/comparar",
    icon: "sliders",
  },
  {
    label: "Compara tu momio",
    subtitle: "Comparativa de probabilidad estimada vs momio justo",
    href: "/app/momios",
    icon: "sliders",
  },
  {
    label: "Comunidad",
    subtitle: "Boletos compartidos, conversación y tablero de socios",
    href: "/app/social",
    icon: "users",
  },
  {
    label: "Portal Tipster Oficial",
    subtitle: "1 pick abierto semanal y seguimiento de comisiones",
    href: "/app/tipster",
    icon: "crown",
  },
  {
    label: "Resultados",
    subtitle: "Marcadores cerrados y registro público sin ediciones",
    href: "/app/historial",
    icon: "shield",
  },
  {
    label: "Mi récord y vigilancia",
    subtitle: "Unidades, estadísticas, privacidad y alertas de partido",
    href: "/app/lab",
    icon: "chart",
  },
  {
    label: "Tecnología y precisión",
    subtitle: "Cómo estimamos probabilidades y calibramos el momio justo",
    href: "/app/tech",
    icon: "cpu",
  },
  {
    label: "Cuenta y referidos (+7 días)",
    subtitle: "Embajador 5 amigos, unidad base y facturación SAT",
    href: "/app/account",
    icon: "gift",
  },
  {
    label: "Consola Founder Admin",
    subtitle: "Interruptor Mes 1 Sin Tarjeta, códigos y telemetría",
    href: "/app/admin",
    icon: "bolt",
  },
];

interface CommandPlayerHit {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly shortName: string;
  readonly jersey: string | null;
  readonly positionLabel: string;
  readonly teamSlug: string;
  readonly teamName: string;
  readonly league: string;
  readonly leagueLabel: string;
  readonly photoKey: string | null;
  readonly fallbackPhotoKey: string | null;
  readonly href: string;
}

interface CommandRefereeHit {
  readonly slug: string;
  readonly name: string;
  readonly country: string | null;
  readonly league: string;
  readonly leagueLabel: string;
  readonly matches: number;
  readonly ebYellow: number | null;
  readonly tier: "estricto" | "promedio" | "permisivo";
  readonly tierLabel: string;
  readonly href: string;
  readonly hasNextAssignment: boolean;
}

interface PlayersSearchResponse {
  readonly items?: readonly CommandPlayerHit[];
}

interface RefereesSearchResponse {
  readonly items?: readonly CommandRefereeHit[];
}

export interface CommandPaletteModalProps {
  readonly initialQuery?: string;
}

function normSearch(raw: string): string {
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function refereeTierTone(tier: CommandRefereeHit["tier"]): string {
  if (tier === "estricto") return "pl-pill--danger";
  if (tier === "permisivo") return "pl-pill--success";
  return "pl-pill--neutral";
}

export function CommandPaletteModal({
  initialQuery = "",
}: CommandPaletteModalProps = {}): React.JSX.Element | null {
  const { dataset, viewerRole, allowRoleSimulation } = usePlatformCore();
  const { setCmdkOpen, navigateTo } = usePlatformActions();
  const { cmdkOpen } = useOverlayState();
  const [query, setQuery] = useState<string>(initialQuery);
  const [activeScope, setActiveScope] = useState<CommandScope>("all");
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [rendered, setRendered] = useState<boolean>(cmdkOpen);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  useSafeEffect(() => {
    if (!cmdkOpen) return;
    setRendered(true);
    setQuery(initialQuery);
    setActiveScope("all");
    setActiveIndex(0);
    const frame =
      typeof window !== "undefined"
        ? window.requestAnimationFrame(() => inputRef.current?.focus())
        : null;
    return () => {
      if (frame !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [cmdkOpen, initialQuery]);

  const debouncedQuery = useDebouncedValue(query, 150);
  const debouncedTrimmed = debouncedQuery.trim();
  const shouldFetchPlayers =
    cmdkOpen &&
    debouncedTrimmed.length >= 2 &&
    (activeScope === "all" || activeScope === "players");
  const shouldFetchReferees =
    cmdkOpen &&
    (activeScope === "all" || activeScope === "referees") &&
    (debouncedTrimmed.length >= 2 || activeScope === "referees");

  const playersUrl = shouldFetchPlayers
    ? `/api/search/players?q=${encodeURIComponent(debouncedTrimmed)}&limit=6`
    : null;
  const refereesUrl = !shouldFetchReferees
    ? null
    : debouncedTrimmed.length >= 2
      ? `/api/search/referees?q=${encodeURIComponent(debouncedTrimmed)}&limit=6`
      : "/api/search/referees?league=liga-mx&limit=6";

  const playersRemote = useAbortableJson<PlayersSearchResponse>(playersUrl, {
    enabled: shouldFetchPlayers,
  });
  const refereesRemote = useAbortableJson<RefereesSearchResponse>(refereesUrl, {
    enabled: shouldFetchReferees,
  });

  const indexedTeams = useMemo(() => {
    const rawList = (() => {
      if (dataset.teams && dataset.teams.length > 0) return dataset.teams;
      const seen = new Map<
        string,
        {
          id: string;
          league: (typeof dataset.leagues)[number]["league"];
          leagueLabel: string;
          slug: string;
          name: string;
          shortName: string;
          code: string;
          rank: number | null;
          href: string;
        }
      >();
      const leagueLabelMap = new Map(dataset.leagues.map((l) => [l.league, l.label]));
      for (const lg of dataset.leagues) {
        lg.standings.forEach((row, idx) => {
          const slug = row.teamId.includes(".") ? row.teamId.split(".")[1]! : row.teamId;
          const key = `${lg.league}:${slug}`;
          if (!seen.has(key)) {
            seen.set(key, {
              id: row.teamId,
              league: lg.league,
              leagueLabel: lg.label,
              slug,
              name: row.name,
              shortName: row.shortName,
              code: row.code,
              rank: idx + 1,
              href: canonicalTeamHref(lg.league, slug),
            });
          }
        });
      }
      for (const g of dataset.games) {
        for (const side of [g.home, g.away]) {
          const key = `${g.league}:${side.slug}`;
          if (!seen.has(key)) {
            seen.set(key, {
              id: key,
              league: g.league,
              leagueLabel: leagueLabelMap.get(g.league) ?? g.leagueLabel,
              slug: side.slug,
              name: side.name,
              shortName: side.shortName,
              code: side.code,
              rank: null,
              href: canonicalTeamHref(g.league, side.slug),
            });
          }
        }
      }
      return [...seen.values()];
    })();

    const upcomingKeys = new Set<string>();
    for (const g of dataset.games) {
      if (g.status !== "FT") {
        upcomingKeys.add(`${g.league}:${g.home.slug}`);
        upcomingKeys.add(`${g.league}:${g.away.slug}`);
      }
    }
    const deduped = new Map<string, (typeof rawList)[number]>();
    for (const item of rawList) {
      const dedupeKey = isNationalCompetition(item.league)
        ? `national:${item.slug}`
        : `club:${item.league}:${item.slug}`;
      const current = deduped.get(dedupeKey);
      if (!current) {
        deduped.set(dedupeKey, item);
        continue;
      }
      const nextUpcoming = upcomingKeys.has(`${item.league}:${item.slug}`);
      const curUpcoming = upcomingKeys.has(`${current.league}:${current.slug}`);
      if (nextUpcoming && !curUpcoming) {
        deduped.set(dedupeKey, item);
      }
    }
    return [...deduped.values()];
  }, [dataset.teams, dataset.leagues, dataset.games]);

  if (!rendered && !cmdkOpen) return null;

  const q = query.trim().toLowerCase();
  const nq = normSearch(q);

  const matchingPlayers: readonly CommandPlayerHit[] =
    shouldFetchPlayers && !playersRemote.error && Array.isArray(playersRemote.data?.items)
      ? playersRemote.data.items.reduce<CommandPlayerHit[]>((acc, item) => {
          const safeHref = sanitizeInternalHref(item.href);
          if (safeHref) {
            acc.push({ ...item, href: safeHref });
          }
          return acc;
        }, [])
      : [];

  const matchingReferees: readonly CommandRefereeHit[] =
    shouldFetchReferees && !refereesRemote.error && Array.isArray(refereesRemote.data?.items)
      ? refereesRemote.data.items.reduce<CommandRefereeHit[]>((acc, item) => {
          const safeHref = sanitizeInternalHref(item.href);
          if (safeHref && isSafePublicLabel(item.name)) {
            acc.push({ ...item, href: safeHref });
          }
          return acc;
        }, [])
      : [];

  const showGroup = (group: Exclude<CommandScope, "all">): boolean =>
    activeScope === "all" || activeScope === group;

  const matchingTeams = showGroup("teams")
    ? indexedTeams
        .filter((t) => {
          if (!nq) return activeScope === "teams";
          return (
            normSearch(t.name).includes(nq) ||
            normSearch(t.shortName).includes(nq) ||
            normSearch(t.code).includes(nq) ||
            normSearch(t.leagueLabel).includes(nq)
          );
        })
        .slice(0, 8)
    : [];

  const matchingGames = showGroup("games")
    ? dataset.games
        .filter((g) => {
          if (!q) return true;
          return (
            g.home.name.toLowerCase().includes(q) ||
            g.away.name.toLowerCase().includes(q) ||
            g.home.shortName.toLowerCase().includes(q) ||
            g.away.shortName.toLowerCase().includes(q) ||
            g.leagueLabel.toLowerCase().includes(q) ||
            g.league.toLowerCase().includes(q)
          );
        })
        .slice(0, 6)
    : [];

  const matchingLeagues = showGroup("leagues")
    ? dataset.leagues.filter((lg) => {
        if (!q) return true;
        return (
          lg.label.toLowerCase().includes(q) ||
          lg.league.toLowerCase().includes(q) ||
          lg.roundLabel.toLowerCase().includes(q)
        );
      })
    : [];

  const matchingTipsters =
    activeScope === "all"
      ? TIPSTER_CREATORS.filter((c) => {
          if (!q) return true;
          return (
            c.handle.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q) ||
            c.specialty.toLowerCase().includes(q) ||
            c.promoCode.toLowerCase().includes(q)
          );
        })
      : [];

  const canSeeAdmin = viewerRole === "admin" || allowRoleSimulation;
  const quickRoutes =
    activeScope === "all"
      ? CLUB_COMMAND_VIEWS.filter(
          (r) =>
            (r.href !== "/app/admin" || canSeeAdmin) &&
            (!q ||
              r.label.toLowerCase().includes(q) ||
              r.subtitle.toLowerCase().includes(q)),
        )
      : [];

  const orderedTargets: string[] = [
    ...matchingTeams.map((t) => t.href),
    ...matchingPlayers.map((p) => p.href),
    ...matchingReferees.map((r) => r.href),
    ...matchingGames.map((g) => canonicalGameHref(g.league, g)),
    ...matchingLeagues.map((lg) => `/app/${lg.league}`),
    ...matchingTipsters.map((c) => `/app/u/${c.handle}`),
    ...quickRoutes.map((r) => r.href),
  ];

  const isRemoteLoading =
    (shouldFetchPlayers && playersRemote.loading) ||
    (shouldFetchReferees && refereesRemote.loading);
  const hasResults = orderedTargets.length > 0;
  const clampedActive =
    orderedTargets.length > 0
      ? Math.min(Math.max(activeIndex, 0), orderedTargets.length - 1)
      : -1;

  const teamsOffset = 0;
  const playersOffset = teamsOffset + matchingTeams.length;
  const refereesOffset = playersOffset + matchingPlayers.length;
  const gamesOffset = refereesOffset + matchingReferees.length;
  const leaguesOffset = gamesOffset + matchingGames.length;
  const tipstersOffset = leaguesOffset + matchingLeagues.length;
  const routesOffset = tipstersOffset + matchingTipsters.length;

  const selectHref = (href: string) => {
    const safeHref = sanitizeInternalHref(href);
    if (!safeHref) return;
    setCmdkOpen(false);
    navigateTo(safeHref);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (orderedTargets.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = (clampedActive + 1) % orderedTargets.length;
      setActiveIndex(next);
      resultsRef.current
        ?.querySelector<HTMLElement>(`[data-cmd-idx="${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = (clampedActive - 1 + orderedTargets.length) % orderedTargets.length;
      setActiveIndex(next);
      resultsRef.current
        ?.querySelector<HTMLElement>(`[data-cmd-idx="${next}"]`)
        ?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter" && clampedActive >= 0) {
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        event.target !== inputRef.current &&
        event.target.closest("button, a, [role='tab']") !== null
      ) {
        return;
      }
      const target = orderedTargets[clampedActive];
      if (target) {
        event.preventDefault();
        selectHref(target);
      }
    }
  };

  return (
    <TopLayerModalDialog
      open={cmdkOpen}
      onClose={() => setCmdkOpen(false)}
      ariaLabel="Buscar en PitchLab"
      maxWidth="40rem"
      dialogClassName="pl-cmd-dialog"
      keepMounted
    >
      <div className="pl-cmd-shell" onKeyDown={handleKeyDown}>
        <div className="pl-cmd-head">
          <div className="pl-cmd-searchbox">
            <MaestroIcon name="search" size={16} className="pl-cmd-search-icon shrink-0" />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              aria-label="Buscar partido, equipo, jugador, liga o @socio"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              placeholder="Buscar partido, equipo, jugador, liga o @socio..."
              className="pl-cmd-input"
            />
            {query.length > 0 ? (
              <button
                type="button"
                className="pl-cmd-clear !min-w-11 !min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:!min-w-7 [@media(min-width:768px)_and_(pointer:fine)]:!min-h-7 [@media(min-width:768px)_and_(pointer:fine)]:!w-7 [@media(min-width:768px)_and_(pointer:fine)]:!h-7"
                aria-label="Limpiar búsqueda"
                onClick={() => {
                  setQuery("");
                  setActiveIndex(0);
                  inputRef.current?.focus();
                }}
              >
                <MaestroIcon name="x" size={13} />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            className="pl-cmd-close"
            aria-label="Cerrar buscador"
            onClick={() => setCmdkOpen(false)}
          >
            <MaestroIcon name="x" size={14} className="sm:hidden" />
            <span className="hidden sm:inline">Esc</span>
          </button>
        </div>

        <div
          className="px-3.5 py-2 border-b overflow-x-auto"
          style={{ borderColor: "var(--pl-border)" }}
          data-cmd-scope-bar=""
        >
          <SofascoreTabs
            items={COMMAND_SCOPES}
            value={activeScope}
            onChange={(next) => {
              if (isCommandScope(next)) {
                setActiveScope(next);
                setActiveIndex(0);
              }
            }}
            variant="segmented"
            ariaLabel="Filtrar categoría de búsqueda"
          />
        </div>

        <p className="sr-only" aria-live="polite">
          {q.length >= 2 && !isRemoteLoading
            ? `${orderedTargets.length} resultados para ${query}`
            : ""}
        </p>

        <div ref={resultsRef} className="pl-cmd-results">
          {!hasResults && !isRemoteLoading ? (
            <div className="pl-cmd-empty">
              {activeScope === "players" && q.length < 2 ? (
                <>
                  <p className="m-0 text-sm font-semibold" style={{ color: "var(--pl-text)" }}>
                    Escribe al menos 2 caracteres para buscar jugadores.
                  </p>
                  <p className="m-0 mt-1 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Busca por nombre, apellido o equipo en las ligas activas.
                  </p>
                </>
              ) : (
                <>
                  <p className="m-0 text-sm font-semibold" style={{ color: "var(--pl-text)" }}>
                    {q.length > 0
                      ? `Sin coincidencias para «${query}»`
                      : "Sin resultados disponibles en esta categoría"}
                  </p>
                  <p className="m-0 mt-1 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Prueba con MLB, Liga MX, un equipo, un jugador, un árbitro o un @socio.
                  </p>
                </>
              )}
            </div>
          ) : null}

          {matchingTeams.length > 0 ? (
            <section className="pl-cmd-group" aria-label="Equipos y selecciones">
              <div className="pl-cmd-group-head">
                <span>Equipos y selecciones</span>
                <span className="pl-cmd-group-count num">{matchingTeams.length}</span>
              </div>
              <div className="pl-cmd-list">
                {matchingTeams.map((teamItem, i) => {
                  const idx = teamsOffset + i;
                  const active = idx === clampedActive;
                  return (
                    <a
                      key={teamItem.id}
                      href={teamItem.href}
                      data-cmd-idx={idx}
                      data-active={active ? "true" : undefined}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={(e) => {
                        e.preventDefault();
                        selectHref(teamItem.href);
                      }}
                      className={active ? "pl-cmd-row is-active" : "pl-cmd-row"}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <TeamBadge
                          league={teamItem.league}
                          slug={teamItem.slug}
                          name={teamItem.name}
                          size={22}
                        />
                        <span className="truncate font-semibold">{teamItem.name}</span>
                      </span>
                      <span className="pl-cmd-row-meta num">
                        <span>
                          {teamItem.leagueLabel}
                          {teamItem.rank !== null ? ` · #${teamItem.rank}` : ""}
                        </span>
                        <MaestroIcon name="chevronRight" size={13} className="pl-cmd-row-arrow" />
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ) : null}

          {matchingPlayers.length > 0 ? (
            <section className="pl-cmd-group" aria-label="Jugadores" data-cmd-players-group="">
              <div className="pl-cmd-group-head">
                <span>Jugadores</span>
                <span className="pl-cmd-group-count num">{matchingPlayers.length}</span>
              </div>
              <div className="pl-cmd-list">
                {matchingPlayers.map((playerItem, i) => {
                  const idx = playersOffset + i;
                  const active = idx === clampedActive;
                  return (
                    <a
                      key={playerItem.id}
                      href={playerItem.href}
                      data-cmd-idx={idx}
                      data-active={active ? "true" : undefined}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={(e) => {
                        e.preventDefault();
                        selectHref(playerItem.href);
                      }}
                      className={active ? "pl-cmd-row is-active" : "pl-cmd-row"}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <PersonAvatar
                          photoKey={playerItem.photoKey}
                          fallbackPhotoKey={playerItem.fallbackPhotoKey}
                          role="player"
                          size={26}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{playerItem.name}</span>
                          <span
                            className="block truncate text-[11px]"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            {playerItem.teamName} · {playerItem.leagueLabel}
                          </span>
                        </span>
                      </span>
                      <span className="pl-cmd-row-meta num">
                        <span className="pl-pill text-[10px] px-1.5 py-0">
                          {playerItem.positionLabel}
                          {playerItem.jersey ? ` #${playerItem.jersey}` : ""}
                        </span>
                        <MaestroIcon name="chevronRight" size={13} className="pl-cmd-row-arrow" />
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ) : null}

          {matchingReferees.length > 0 ? (
            <section className="pl-cmd-group" aria-label="Árbitros" data-cmd-referees-group="">
              <div className="pl-cmd-group-head">
                <span>Árbitros</span>
                <span className="pl-cmd-group-count num">{matchingReferees.length}</span>
              </div>
              <div className="pl-cmd-list">
                {matchingReferees.map((refItem, i) => {
                  const idx = refereesOffset + i;
                  const active = idx === clampedActive;
                  return (
                    <a
                      key={`${refItem.league}:${refItem.slug}`}
                      href={refItem.href}
                      data-cmd-idx={idx}
                      data-active={active ? "true" : undefined}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={(e) => {
                        e.preventDefault();
                        selectHref(refItem.href);
                      }}
                      className={active ? "pl-cmd-row is-active" : "pl-cmd-row"}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="pl-cmd-icon-well" aria-hidden="true">
                          <MaestroIcon
                            name="whistle"
                            size={14}
                            style={{ color: "var(--pl-brand)" }}
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{refItem.name}</span>
                          <span
                            className="block truncate text-[11px] num"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            {[
                              refItem.leagueLabel,
                              refItem.country,
                              `${refItem.matches} partidos`,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </span>
                      </span>
                      <span className="pl-cmd-row-meta num">
                        <span
                          className={`pl-pill text-[10px] px-1.5 py-0 ${refereeTierTone(refItem.tier)}`}
                        >
                          {refItem.tierLabel}
                          {refItem.ebYellow !== null
                            ? ` · ${refItem.ebYellow.toFixed(2)} amar.`
                            : ""}
                        </span>
                        <MaestroIcon name="chevronRight" size={13} className="pl-cmd-row-arrow" />
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ) : null}

          {matchingGames.length > 0 ? (
            <section className="pl-cmd-group" aria-label="Partidos y Match Studio">
              <div className="pl-cmd-group-head">
                <span>Partidos y Match Studio</span>
                <span className="pl-cmd-group-count num">{matchingGames.length}</span>
              </div>
              <div className="pl-cmd-list">
                {matchingGames.map((g, i) => {
                  const idx = gamesOffset + i;
                  const active = idx === clampedActive;
                  const href = canonicalGameHref(g.league, g);
                  return (
                    <a
                      key={g.id}
                      href={href}
                      data-cmd-idx={idx}
                      data-active={active ? "true" : undefined}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={(e) => {
                        e.preventDefault();
                        selectHref(href);
                      }}
                      className={active ? "pl-cmd-row is-active" : "pl-cmd-row"}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex items-center gap-1 shrink-0">
                          <TeamBadge
                            league={g.league}
                            slug={g.home.slug}
                            name={g.home.name}
                            size={18}
                          />
                          <TeamBadge
                            league={g.league}
                            slug={g.away.slug}
                            name={g.away.name}
                            size={18}
                          />
                        </span>
                        <span className="truncate font-semibold">
                          {g.home.shortName} vs {g.away.shortName}
                        </span>
                      </span>
                      <span className="pl-cmd-row-meta num">
                        <span className="inline-flex items-center gap-1.5">
                          <LeagueBadge league={g.league} label={g.leagueLabel} size={14} />
                          <span>
                            {g.leagueLabel} · {shortDateLabel(g.dayId)} ·{" "}
                            {g.status === "FT" ? "Final" : g.kickoffLocal}
                          </span>
                        </span>
                        <MaestroIcon name="chevronRight" size={13} className="pl-cmd-row-arrow" />
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ) : null}

          {matchingLeagues.length > 0 ? (
            <section className="pl-cmd-group" aria-label="Ligas oficiales">
              <div className="pl-cmd-group-head">
                <span>Ligas oficiales</span>
                <span className="pl-cmd-group-count num">{matchingLeagues.length}</span>
              </div>
              <div className="pl-cmd-league-grid">
                {matchingLeagues.map((lg, i) => {
                  const idx = leaguesOffset + i;
                  const active = idx === clampedActive;
                  const href = `/app/${lg.league}`;
                  return (
                    <a
                      key={lg.league}
                      href={href}
                      data-cmd-idx={idx}
                      data-active={active ? "true" : undefined}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={(e) => {
                        e.preventDefault();
                        selectHref(href);
                      }}
                      className={
                        active ? "pl-cmd-league-tile is-active" : "pl-cmd-league-tile"
                      }
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <LeagueBadge league={lg.league} label={lg.label} size={18} />
                        <span className="truncate font-semibold">{lg.label}</span>
                      </span>
                      <span
                        className="text-[11px] font-medium num shrink-0"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        {lg.totalGames} {lg.totalGames === 1 ? "juego" : "juegos"}
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ) : null}

          {matchingTipsters.length > 0 ? (
            <section className="pl-cmd-group" aria-label="Tipsters verificados">
              <div className="pl-cmd-group-head">
                <span>Tipsters verificados</span>
                <span className="pl-cmd-group-count num">{matchingTipsters.length}</span>
              </div>
              <div className="pl-cmd-list">
                {matchingTipsters.map((creator, i) => {
                  const idx = tipstersOffset + i;
                  const active = idx === clampedActive;
                  const href = `/app/u/${creator.handle}`;
                  return (
                    <a
                      key={creator.handle}
                      href={href}
                      data-cmd-idx={idx}
                      data-active={active ? "true" : undefined}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={(e) => {
                        e.preventDefault();
                        selectHref(href);
                      }}
                      className={active ? "pl-cmd-row is-active" : "pl-cmd-row"}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="avatar-ring inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-extrabold shrink-0"
                          style={{
                            background: creator.avatarGradVar,
                            color: "var(--pl-on-solid)",
                          }}
                        >
                          {creator.avatarInitials}
                        </span>
                        <span className="min-w-0 truncate">
                          <strong className="font-semibold">{creator.name}</strong>{" "}
                          {creator.isExample ? <ExampleBadge /> : null}{" "}
                          <span
                            className="text-xs"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            @{creator.handle} · {creator.specialty}
                          </span>
                        </span>
                      </span>
                      <span className="pl-pill pl-pill--success num shrink-0">
                        {creator.verifiedUnits} · Ventaja {creator.clvAvg}
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ) : null}

          {quickRoutes.length > 0 ? (
            <section className="pl-cmd-group" aria-label="Explorar PitchLab">
              <div className="pl-cmd-group-head">
                <span>Explorar PitchLab</span>
                <span className="pl-cmd-group-count num">{quickRoutes.length}</span>
              </div>
              <div className="pl-cmd-list">
                {quickRoutes.map((item, i) => {
                  const idx = routesOffset + i;
                  const active = idx === clampedActive;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      data-cmd-idx={idx}
                      data-active={active ? "true" : undefined}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={(e) => {
                        e.preventDefault();
                        selectHref(item.href);
                      }}
                      className={active ? "pl-cmd-row is-active" : "pl-cmd-row"}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span className="pl-cmd-icon-well" aria-hidden="true">
                          <MaestroIcon
                            name={item.icon}
                            size={14}
                            style={{ color: "var(--pl-brand)" }}
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-semibold truncate">
                            {item.label}
                          </span>
                          <span
                            className="block text-xs truncate"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            {item.subtitle}
                          </span>
                        </span>
                      </span>
                      <span className="pl-cmd-row-go">
                        <span>Ir</span>
                        <MaestroIcon name="chevronRight" size={13} className="pl-cmd-row-arrow" />
                      </span>
                    </a>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>

        <div className="pl-cmd-foot">
          <div
            className="hidden sm:flex items-center gap-3 text-[11px]"
            style={{ color: "var(--pl-text-muted)" }}
          >
            <span className="inline-flex items-center gap-1.5">
              <kbd className="pl-header-kbd">↑</kbd>
              <kbd className="pl-header-kbd">↓</kbd>
              <span>Navegar</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <kbd className="pl-header-kbd">↵</kbd>
              <span>Abrir</span>
            </span>
          </div>
          <span
            className="text-[11px] font-medium num"
            style={{ color: "var(--pl-text-muted)" }}
          >
            {orderedTargets.length} resultados
          </span>
        </div>
      </div>
    </TopLayerModalDialog>
  );
}
