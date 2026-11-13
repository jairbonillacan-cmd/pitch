"use client";

import React, { useCallback, useMemo, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { LeagueBadge, PBar } from "../../../sports";
import { formatOddsValue, isPickUnlocked } from "../../access-guard";
import { AtmosphereStage, ClubWorkspaceShell } from "../../components/ShellChrome";
import { HomeMatchCard } from "../../components/HomeMatchCard";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import {
  useIsPickInParlay,
  useJournalEntries,
  usePlatform,
  usePlatformActions,
  usePlatformCore,
} from "../../platform-provider";
import { profileRecord } from "../../profile-stats";
import type { MatchPick, PlatformGame, RiskBand } from "../../types";
import {
  ALL,
  SPORTS,
  UPCOMING,
  buildDayOptions,
  buildSections,
  dayNumber,
  filterGames,
  gamesForSelection,
  leaguesIn,
  longDayLabel,
  shortWeekday,
  sportOf,
  todayId,
  topPrincipalPicks,
  valuePicks,
  type DaySelection,
  type LeagueFilter,
  type SportFilter,
  type SportId,
} from "./home-model";

const RISKS: ReadonlyArray<{ id: RiskBand; label: string; hint: string }> = [
  { id: "conservador", label: "Conservador", hint: "Las selecciones más probables, con menos momio." },
  { id: "medio", label: "Medio", hint: "Equilibrio entre probabilidad y momio." },
  { id: "arriesgado", label: "Arriesgado", hint: "Más momio a cambio de menos probabilidad." },
];

function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function SportIcon({ sport }: { sport: SportFilter }): React.JSX.Element {
  if (sport === "nfl") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <ellipse cx="12" cy="12" rx="9.5" ry="6" transform="rotate(-35 12 12)" />
        <path d="m9.5 14.5 5-5M10.5 11.5l2 2M12 10l2 2" />
      </svg>
    );
  }
  if (sport === "futbol") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="m12 7 4 3-1.5 4.5h-5L8 10z" />
        <path d="M12 7V3M16 10l3.5-1.5M14.5 14.5l2 3.5M9.5 14.5l-2 3.5M8 10 4.5 8.5" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </svg>
  );
}

function leagueLabelOf(games: readonly PlatformGame[], league: LeagueId): string {
  return games.find((g) => g.league === league)?.leagueLabel ?? league;
}

/** Barra de días: «Próximos 7 días», cada día con partidos y los resultados pasados. */
function DayStrip({
  games,
  today,
  selected,
  onSelect,
}: {
  games: readonly PlatformGame[];
  today: string;
  selected: DaySelection;
  onSelect: (d: DaySelection) => void;
}): React.JSX.Element {
  const options = useMemo(() => buildDayOptions(games, today), [games, today]);
  return (
    <nav aria-label="Elegir día" className="pl-home-days">
      {options.map((o) => {
        const on = o.key === selected;
        const top = o.isUpcoming ? "Próximos" : o.isToday ? "Hoy" : shortWeekday(o.key);
        const main = o.isUpcoming ? "7 días" : String(dayNumber(o.key));
        const sub = o.isPast ? "Resultados" : countLabel(o.count, "partido", "partidos");
        return (
          <button
            key={o.key}
            type="button"
            className={`pl-home-day ${on ? "is-on" : ""} ${o.isPast ? "is-past" : ""}`.trim()}
            aria-pressed={on}
            aria-label={o.isUpcoming ? `Próximos 7 días, ${sub}` : `${longDayLabel(o.key)}, ${sub}`}
            onClick={() => onSelect(o.key)}
          >
            <span className={`pl-home-day-top ${o.isToday || o.isUpcoming ? "is-accent" : ""}`.trim()}>{top}</span>
            <span className="pl-home-day-main num">{main}</span>
            <span className="pl-home-day-sub">
              {o.leagues.slice(0, 4).map((l) => (
                <LeagueBadge key={l} league={l} label={leagueLabelOf(games, l)} size={14} />
              ))}
              <span>{sub}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/** Deporte y liga: tarjetas con ícono y escudos. Solo aparecen las ligas del deporte elegido. */
function SportLeaguePicker({
  dayGames,
  sport,
  league,
  onSport,
  onLeague,
}: {
  dayGames: readonly PlatformGame[];
  sport: SportFilter;
  league: LeagueFilter;
  onSport: (s: SportFilter) => void;
  onLeague: (l: LeagueFilter) => void;
}): React.JSX.Element {
  const sportOptions: Array<{ id: SportFilter; label: string; games: PlatformGame[] }> = [
    { id: ALL, label: "Todos los deportes", games: [...dayGames] },
    ...SPORTS.map((s) => ({ id: s.id as SportFilter, label: s.label, games: dayGames.filter((g) => sportOf(g) === s.id) })),
  ];
  const sportGames = sport === ALL ? dayGames : dayGames.filter((g) => sportOf(g) === sport);
  const leagues = leaguesIn(sportGames);
  return (
    <section aria-label="Elegir deporte y liga" className="flex flex-col gap-3.5">
      <div role="group" aria-label="Elegir deporte" className="pl-home-sports">
        {sportOptions.map((s) => {
          const lgs = leaguesIn(s.games);
          const on = sport === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className={`pl-home-sport ${on ? "is-on" : ""}`.trim()}
              aria-pressed={on}
              onClick={() => onSport(s.id)}
            >
              <span className="pl-home-sport-icon">
                <SportIcon sport={s.id} />
              </span>
              <span className="min-w-0 flex-1 flex flex-col gap-0.5 text-left">
                <strong className="text-base font-extrabold">{s.label}</strong>
                <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                  {countLabel(s.games.length, "partido", "partidos")} · {countLabel(lgs.length, "liga", "ligas")}
                </span>
              </span>
              <span className="pl-home-logostack" aria-hidden="true">
                {lgs.slice(0, 4).map((l) => (
                  <LeagueBadge key={l} league={l} label={leagueLabelOf(dayGames, l)} size={22} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {leagues.length > 0 ? (
        <div role="group" aria-label="Elegir liga" className="pl-home-leagues">
          {[ALL, ...leagues].map((l) => {
            const on = league === l;
            const n = l === ALL ? sportGames.length : sportGames.filter((g) => g.league === l).length;
            return (
              <button
                key={l}
                type="button"
                className={`pl-home-league ${on ? "is-on" : ""}`.trim()}
                aria-pressed={on}
                onClick={() => onLeague(l)}
              >
                <span className="pl-home-league-logo">
                  {l === ALL ? <SportIcon sport={ALL} /> : <LeagueBadge league={l} label={leagueLabelOf(dayGames, l)} size={34} />}
                </span>
                <span className="text-[13px] font-bold whitespace-nowrap">{l === ALL ? "Todas" : leagueLabelOf(dayGames, l)}</span>
                <span className="text-[11px] num" style={{ color: "var(--pl-text-muted)" }}>
                  {countLabel(n, "partido", "partidos")}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function TopPickCard({ game, pick }: { game: PlatformGame; pick: MatchPick }): React.JSX.Element {
  const { oddsFormat } = usePlatformCore();
  const { addPickToParlay, removePickFromParlay } = usePlatformActions();
  const inParlay = useIsPickInParlay(pick.id);
  return (
    <article className="pl-home-top glass-card glass-ring">
      <span className="flex items-center gap-2 text-xs min-w-0" style={{ color: "var(--pl-text-muted)" }}>
        <LeagueBadge league={game.league} label={game.leagueLabel} size={18} />
        <span className="truncate">
          {game.leagueLabel} · {shortWeekday(game.dayId)} {dayNumber(game.dayId)} · {game.kickoffLocal}
        </span>
      </span>
      <span className="text-[13px] truncate" style={{ color: "var(--pl-text-secondary)" }}>
        {game.home.shortName} vs {game.away.shortName}
      </span>
      <div className="flex items-end justify-between gap-2">
        <strong className="text-base leading-snug min-w-0">{pick.label}</strong>
        <strong className="num text-2xl shrink-0">{(pick.p * 100).toFixed(1)} %</strong>
      </div>
      <PBar p={pick.p} lead />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
          Momio justo <strong style={{ color: "var(--pl-text)" }}>{formatOddsValue(pick.fairDecimal, oddsFormat)}</strong>
        </span>
        <button
          type="button"
          className={`pl-home-parlay-btn ${inParlay ? "is-on" : ""}`.trim()}
          aria-pressed={inParlay}
          aria-label={`${inParlay ? "Quitar del parlay" : "Agregar al parlay"}: ${pick.label}`}
          onClick={() => (inParlay ? removePickFromParlay(pick.id) : addPickToParlay(pick))}
        >
          <MaestroIcon name={inParlay ? "check" : "plus"} size={14} />
          <span>{inParlay ? "En parlay" : "Parlay"}</span>
        </button>
      </div>
    </article>
  );
}

/** Tu parlay siempre a la vista: selecciones, probabilidad combinada, momio justo y armado automático. */
function ParlayRail({ games }: { games: readonly PlatformGame[] }): React.JSX.Element {
  const { parlaySummary, removePickFromParlay, clearParlay, generateAutoParlay, navigateTo, oddsFormat, riskPreference } =
    usePlatform();
  const [risk, setRisk] = useState<RiskBand>(riskPreference);
  const legs = parlaySummary.legs;
  const riskHint = RISKS.find((r) => r.id === risk)?.hint ?? "";
  return (
    <section aria-labelledby="home-parlay-title" className="pl-home-rail-card is-parlay glass-card glass-ring">
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-parlay-title" className="m-0 text-lg font-extrabold">Tu parlay</h2>
        <span className="pl-pill pl-pill--brand num">{countLabel(legs.length, "selección", "selecciones")}</span>
      </div>
      {legs.length === 0 ? (
        <p className="m-0 text-sm leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
          Toca <strong style={{ color: "var(--pl-text)" }}>Parlay</strong> en cualquier partido o ármalo en automático.
          Una selección por partido, sin contradicciones.
        </p>
      ) : (
        <>
          <ul className="m-0 p-0 list-none flex flex-col gap-2">
            {legs.map(({ pick }) => (
              <li key={pick.id} className="pl-home-leg">
                <LeagueBadge league={pick.league} label={pick.leagueLabel} size={20} />
                <span className="min-w-0 flex-1 flex flex-col">
                  <strong className="text-sm truncate">{pick.label}</strong>
                  <span className="text-xs truncate" style={{ color: "var(--pl-text-muted)" }}>{pick.matchLabel}</span>
                </span>
                <span className="num text-[13px] font-bold">{(pick.p * 100).toFixed(1)} %</span>
                <button
                  type="button"
                  className="pl-home-icon-btn"
                  aria-label={`Quitar ${pick.label}`}
                  onClick={() => removePickFromParlay(pick.id)}
                >
                  <MaestroIcon name="x" size={14} />
                </button>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="pl-home-stat">
              <span>Probabilidad combinada</span>
              <strong className="num">{(parlaySummary.combinedProbability * 100).toFixed(1)} %</strong>
            </div>
            <div className="pl-home-stat">
              <span>Momio justo</span>
              <strong className="num">{formatOddsValue(parlaySummary.fairDecimal, oddsFormat)}</strong>
            </div>
          </div>
          <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
            Si tu casa paga más que <strong className="num" style={{ color: "var(--pl-text)" }}>{formatOddsValue(parlaySummary.fairDecimal, oddsFormat)}</strong>,
            la cuota está por encima de lo que estima el modelo.
          </p>
        </>
      )}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-bold" style={{ color: "var(--pl-text-muted)" }}>Armar en automático</span>
        <div className="seg-well" role="group" aria-label="Perfil del parlay automático">
          {RISKS.map((r) => (
            <button key={r.id} type="button" className="seg-btn flex-1" aria-pressed={risk === r.id} onClick={() => setRisk(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
          {riskHint} Usa los partidos abiertos de los días, el deporte y la liga que estás viendo.
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="pl-btn-primary text-sm min-h-11 px-4 flex-1 inline-flex items-center justify-center gap-1.5"
          onClick={() => generateAutoParlay({ leagues: [], risk, legCount: 3, allowSgp: false, games })}
        >
          <MaestroIcon name="layers" size={14} />
          <span>Armar 3 selecciones</span>
        </button>
        {legs.length > 0 ? (
          <button type="button" className="pl-btn-glass text-sm min-h-11 px-4" onClick={clearParlay}>
            Vaciar
          </button>
        ) : null}
      </div>
      {legs.length > 0 ? (
        <a
          href="/app/parlays"
          onClick={(e) => {
            e.preventDefault();
            navigateTo("/app/parlays");
          }}
          className="pl-btn-glass text-sm min-h-11 px-4 inline-flex items-center justify-center gap-1.5"
        >
          <span>Abrir en el armador</span>
          <MaestroIcon name="arrowRight" size={13} />
        </a>
      ) : null}
    </section>
  );
}

function ValueRail({ items }: { items: ReadonlyArray<{ game: PlatformGame; pick: MatchPick }> }): React.JSX.Element | null {
  const { oddsFormat } = usePlatformCore();
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="home-value-title" className="pl-home-rail-card glass-card glass-ring">
      <div className="flex flex-col gap-1">
        <h2 id="home-value-title" className="m-0 text-base font-extrabold">Donde la casa paga más</h2>
        <span className="text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
          Momio real de casa por encima del momio justo del modelo.
        </span>
      </div>
      {items.slice(0, 4).map(({ game, pick }) => (
        <div key={pick.id} className="pl-home-value">
          <div className="flex items-center gap-3">
            <LeagueBadge league={game.league} label={game.leagueLabel} size={20} />
            <span className="min-w-0 flex-1 flex flex-col">
              <strong className="text-sm">{pick.label}</strong>
              <span className="text-xs truncate" style={{ color: "var(--pl-text-muted)" }}>
                {game.home.shortName} vs {game.away.shortName} · {shortWeekday(game.dayId)} {dayNumber(game.dayId)} · {game.kickoffLocal}
              </span>
            </span>
            <span className="flex flex-col items-end num">
              <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>justo {formatOddsValue(pick.fairDecimal, oddsFormat)}</span>
              <strong className="text-[15px]">casa {formatOddsValue(pick.marketDecimal ?? pick.fairDecimal, oddsFormat)}</strong>
            </span>
          </div>
          <PBar p={pick.p} />
        </div>
      ))}
    </section>
  );
}

function LabRail(): React.JSX.Element {
  const journal = useJournalEntries();
  const { navigateTo } = usePlatformActions();
  const rec = useMemo(() => profileRecord(journal), [journal]);
  return (
    <section aria-labelledby="home-lab-title" className="pl-home-rail-card glass-card glass-ring">
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-lab-title" className="m-0 text-base font-extrabold">Mi bitácora</h2>
        <a
          href="/app/lab"
          onClick={(e) => {
            e.preventDefault();
            navigateTo("/app/lab");
          }}
          className="text-sm font-bold"
        >
          Abrir
        </a>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="pl-home-stat">
          <span>Abiertos</span>
          <strong className="num">{rec.open}</strong>
        </div>
        <div className="pl-home-stat">
          <span>Saldo</span>
          <strong className="num">
            {rec.netUnits > 0 ? "+" : ""}
            {rec.netUnits.toFixed(1)}u
          </strong>
        </div>
        <div className="pl-home-stat">
          <span>Cumplidos</span>
          <strong className="num">{rec.settled > 0 ? `${rec.won} de ${rec.settled}` : "—"}</strong>
        </div>
      </div>
      {journal.length === 0 ? (
        <p className="m-0 text-sm leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
          Sella un pick antes del partido y aquí verás su resultado y si le ganaste al cierre.
        </p>
      ) : null}
    </section>
  );
}

/**
 * Inicio del Club: días → deporte → liga, tarjetas de partido agrupadas por deporte, liga y
 * día, y a la derecha tu parlay, el valor contra la casa y tu bitácora.
 */
export function HomeClubView(): React.JSX.Element {
  const { dataset, viewerRole, userTimezone } = usePlatformCore();
  const games = dataset.games;
  const today = useMemo(() => todayId(userTimezone || "America/Mexico_City"), [userTimezone]);
  const [chosenDay, setDay] = useState<DaySelection>(UPCOMING);
  const [sport, setSport] = useState<SportFilter>(ALL);
  const [league, setLeague] = useState<LeagueFilter>(ALL);

  // Sin partidos en los próximos días (snapshot viejo), abre en el último día con datos.
  const day = useMemo<DaySelection>(() => {
    if (chosenDay !== UPCOMING || gamesForSelection(games, UPCOMING, today).length > 0) return chosenDay;
    const last = games.reduce<string>((acc, g) => (g.dayId > acc ? g.dayId : acc), "");
    return last || UPCOMING;
  }, [chosenDay, games, today]);
  const dayGames = useMemo(() => gamesForSelection(games, day, today), [games, day, today]);
  const visible = useMemo(() => filterGames(dayGames, sport, league), [dayGames, sport, league]);
  const sections = useMemo(() => buildSections(visible), [visible]);
  const isUnlocked = useCallback(
    (pick: MatchPick, game: PlatformGame) => isPickUnlocked(pick, game.status, viewerRole),
    [viewerRole],
  );
  const top = useMemo(() => topPrincipalPicks(visible, 3, isUnlocked), [visible, isUnlocked]);
  const value = useMemo(() => valuePicks(visible, isUnlocked), [visible, isUnlocked]);

  const isUpcoming = day === UPCOMING;
  const isPast = !isUpcoming && day < today;
  const title = isUpcoming
    ? "Próximos 7 días"
    : isPast
      ? `Resultados del ${longDayLabel(day).toLowerCase()}`
      : day === today
        ? `Hoy, ${longDayLabel(day).toLowerCase()}`
        : longDayLabel(day);
  const nLeagues = leaguesIn(dayGames).length;
  const subtitle = isPast
    ? `${countLabel(dayGames.length, "partido terminado", "partidos terminados")} con el pick principal que publicó el modelo`
    : `${countLabel(dayGames.length, "partido", "partidos")} · ${countLabel(nLeagues, "liga", "ligas")} · picks con probabilidad y momio justo`;

  const pickDay = (d: DaySelection) => {
    setDay(d);
    setLeague(ALL);
  };
  const pickSport = (s: SportFilter) => {
    setSport(s);
    setLeague(ALL);
  };

  return (
    <AtmosphereStage activePath="/app">
      <ClubWorkspaceShell activePath="/app">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5 min-w-0">
            <span className="text-[13px] font-bold" style={{ color: "var(--pl-brand)" }}>
              Hoy es {longDayLabel(today).toLowerCase()}
            </span>
            <h1 className="m-0 text-3xl sm:text-4xl font-extrabold tracking-tight">{title}</h1>
            <span className="text-sm" style={{ color: "var(--pl-text-muted)" }}>{subtitle}</span>
          </div>
        </section>

        <DayStrip games={games} today={today} selected={day} onSelect={pickDay} />
        <SportLeaguePicker dayGames={dayGames} sport={sport} league={league} onSport={pickSport} onLeague={setLeague} />

        <div className="pl-home-layout">
          <div className="pl-home-main">
            {top.length > 0 ? (
              <section aria-labelledby="home-top-title" className="flex flex-col gap-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="home-top-title" className="m-0 text-xl font-extrabold">Picks con mayor probabilidad</h2>
                  <span className="text-[13px]" style={{ color: "var(--pl-text-muted)" }}>
                    El pick principal de cada partido, ordenado de mayor a menor
                  </span>
                </div>
                <div className="pl-home-top-grid">
                  {top.map(({ game, pick }) => (
                    <TopPickCard key={pick.id} game={game} pick={pick} />
                  ))}
                </div>
              </section>
            ) : null}

            {sections.map((section) => (
              <section key={section.sport} aria-label={section.label} className="flex flex-col gap-5">
                <div className="pl-home-sport-head">
                  <span className="pl-home-sport-icon is-on">
                    <SportIcon sport={section.sport as SportId} />
                  </span>
                  <div className="flex flex-col gap-0.5">
                    <h2 className="m-0 text-2xl font-extrabold tracking-tight">{section.label}</h2>
                    <span className="text-[13px] num" style={{ color: "var(--pl-text-muted)" }}>
                      {countLabel(section.count, "partido", "partidos")} · {countLabel(section.leagues.length, "liga", "ligas")}
                    </span>
                  </div>
                </div>
                {section.leagues.map((group) => (
                  <div key={group.league} className="flex flex-col gap-3">
                    <div className="flex items-center gap-2.5">
                      <LeagueBadge league={group.league} label={group.label} size={28} />
                      <h3 className="m-0 text-lg font-extrabold">{group.label}</h3>
                      <span className="text-[13px] num" style={{ color: "var(--pl-text-muted)" }}>
                        {group.round} · {countLabel(group.count, "partido", "partidos")}
                      </span>
                    </div>
                    {group.days.map((d) => (
                      <div key={d.dayId} className="flex flex-col gap-2.5">
                        {isUpcoming ? (
                          <span className="pl-home-day-head">
                            {longDayLabel(d.dayId)}
                            {d.dayId === today ? " · hoy" : ""}
                          </span>
                        ) : null}
                        <div className="pl-home-grid">
                          {d.games.map((g) => (
                            <div key={g.id} className="pl-cv-card">
                              <HomeMatchCard game={g} />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            ))}

            {sections.length === 0 ? (
              <div className="glass-card glass-ring rounded-2xl p-7 text-center text-sm" style={{ color: "var(--pl-text-muted)" }}>
                No hay partidos con este filtro. Prueba otro día o «Todas».
              </div>
            ) : null}
          </div>

          <aside aria-label="Tu parlay, valor y bitácora" className="pl-home-rail">
            <ParlayRail games={visible} />
            <ValueRail items={value} />
            <LabRail />
          </aside>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
