"use client";

/**
 * EN-VIVO-1 · Match Center: marcador del día, ficha en vivo y «Siguiendo».
 *
 * Los componentes de presentación (`LiveMatchPanelView`, `LiveScoreboardView`) reciben los datos
 * por props para Storybook y pruebas; los contenedores (`LiveMatchPanel`, `LiveScoreboardStrip`)
 * los leen del sondeo compartido (`live-store.ts`).
 */
import React from "react";
import {
  LIVE_PHASE_LABEL_ES,
  isLivePhaseActive,
  type LiveIncident,
  type LiveMatchDetail,
  type LiveScoreboard,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import { LeagueBadge, TeamBadge } from "../../sports";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { DEFAULT_FOLLOW_ALERTS, usePlatform, type FollowAlerts } from "../platform-provider";
import type { PlatformGame } from "../types";
import { LiveStatBars, MomentumChart, XgRaceChart } from "./live-charts";
import { useLiveMatch, useLiveScoreboard } from "./live-store";

// ---------- Piezas ----------

export function LivePhaseBadge({
  entry,
  kickoffLocal,
  short = false,
}: {
  entry: LiveScoreboardEntry;
  kickoffLocal?: string;
  /** Rótulo corto para filas angostas («MT» en vez de «Medio tiempo»). */
  short?: boolean;
}): React.JSX.Element {
  const active = isLivePhaseActive(entry.phase);
  const text =
    entry.phase === "live" && entry.clock
      ? `${entry.clock}'`
      : entry.phase === "scheduled" && kickoffLocal
        ? kickoffLocal
        : short && entry.phase === "halftime"
          ? "MT"
          : LIVE_PHASE_LABEL_ES[entry.phase];
  return (
    <span className={`pl-live-phase pl-live-phase--${entry.phase}`}>
      {active ? <span className="pl-live-pulse" aria-hidden="true" /> : null}
      <span className="num">{text}</span>
      {entry.phase === "live" ? <span className="sr-only"> · en vivo</span> : null}
      {short && entry.phase === "halftime" ? <span className="sr-only"> · medio tiempo</span> : null}
    </span>
  );
}

const INCIDENT_ICON: Record<LiveIncident["kind"], string> = {
  goal: "",
  own_goal: "",
  penalty_goal: "",
  penalty_missed: "✕",
  yellow: "",
  second_yellow: "",
  red: "",
  sub: "⇄",
  var: "VAR",
  period: "",
};

function incidentText(i: LiveIncident): { title: string; detail: string | null } {
  switch (i.kind) {
    case "goal":
      return { title: i.player ? `Gol de ${i.player}` : "Gol", detail: i.secondary ? `Asistencia: ${i.secondary}` : null };
    case "own_goal":
      return { title: i.player ? `Autogol de ${i.player}` : "Autogol", detail: null };
    case "penalty_goal":
      return { title: i.player ? `Gol de penal de ${i.player}` : "Gol de penal", detail: null };
    case "penalty_missed":
      return { title: i.note ?? "Penal fallado", detail: i.player };
    case "yellow":
      return { title: "Amarilla", detail: i.player };
    case "second_yellow":
      return { title: "Segunda amarilla y expulsión", detail: i.player };
    case "red":
      return { title: "Roja directa", detail: i.player };
    case "sub":
      return { title: i.player ? `Entra ${i.player}` : "Cambio", detail: i.secondary ? `Sale ${i.secondary}` : null };
    case "var":
      return { title: i.note ?? "Revisión del VAR", detail: i.player };
    case "period":
      return { title: i.note ?? "Fin del periodo", detail: null };
  }
}

/** Línea de tiempo: lo más reciente arriba. */
export function LiveTimeline({
  incidents,
  homeLabel,
  awayLabel,
}: {
  incidents: readonly LiveIncident[];
  homeLabel: string;
  awayLabel: string;
}): React.JSX.Element {
  const rows = [...incidents].reverse();
  if (rows.length === 0) {
    return <p className="pl-live-empty">Aquí aparecen goles, tarjetas y cambios en cuanto ocurran.</p>;
  }
  return (
    <ol className="pl-live-timeline" aria-label="Minuto a minuto">
      {rows.map((i, idx) => {
        const t = incidentText(i);
        const minute = i.minute === null ? "" : `${i.minute}${i.addedTime ? `+${i.addedTime}` : ""}'`;
        const isGoal = i.kind === "goal" || i.kind === "own_goal" || i.kind === "penalty_goal";
        return (
          <li
            key={`${i.order}-${idx}`}
            className={`pl-live-event pl-live-event--${i.kind}${i.side ? ` is-${i.side}` : ""}${isGoal ? " is-goal" : ""}`}
          >
            <span className="pl-live-event-min num">{minute}</span>
            <span className={`pl-live-event-icon pl-live-event-icon--${i.kind}`} aria-hidden="true">
              {INCIDENT_ICON[i.kind]}
            </span>
            <span className="pl-live-event-body">
              <strong>{t.title}</strong>
              {t.detail || i.side ? (
                <span>
                  {[t.detail, i.side ? (i.side === "home" ? homeLabel : awayLabel) : null].filter(Boolean).join(" · ")}
                </span>
              ) : null}
            </span>
            {isGoal && i.score ? (
              <span className="pl-live-event-score num">
                {i.score.home}–{i.score.away}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

/** «Siguiendo»: seguir el partido y elegir qué avisos llegan a la campana. */
export function FollowControl({ gameId, compact = false }: { gameId: string; compact?: boolean }): React.JSX.Element {
  const { watchlistGameIds, toggleWatchlistGame, followAlerts, setFollowAlerts } = usePlatform();
  const following = watchlistGameIds.includes(gameId);
  const alerts = followAlerts[gameId] ?? DEFAULT_FOLLOW_ALERTS;
  const toggleAlert = (key: keyof FollowAlerts) => setFollowAlerts(gameId, { ...alerts, [key]: !alerts[key] });
  return (
    <div className="pl-live-follow">
      <button
        type="button"
        className={`pl-live-follow-btn${following ? " is-on" : ""}`}
        aria-pressed={following}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleWatchlistGame(gameId);
        }}
      >
        <MaestroIcon name={following ? "check" : "bell"} size={14} />
        <span className={compact ? "sr-only" : undefined}>{following ? "Siguiendo" : "Seguir"}</span>
      </button>
      {following && !compact ? (
        <fieldset className="pl-live-alerts">
          <legend className="sr-only">Avisos de este partido</legend>
          {(
            [
              ["kickoff", "Inicio"],
              ["goals", "Goles"],
              ["final", "Final"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="pl-live-chip">
              <input type="checkbox" checked={alerts[key]} onChange={() => toggleAlert(key)} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
    </div>
  );
}

// ---------- Ficha en vivo ----------

export interface LiveMatchPanelViewProps {
  game: Pick<PlatformGame, "id" | "league" | "home" | "away" | "kickoffLocal">;
  detail: LiveMatchDetail | null;
  loading?: boolean;
  error?: boolean;
  /** Oculta el control «Siguiendo» (Storybook sin proveedor). */
  showFollow?: boolean;
}

export function LiveMatchPanelView({ game, detail, loading, error, showFollow = true }: LiveMatchPanelViewProps): React.JSX.Element | null {
  const home = game.home.shortName;
  const away = game.away.shortName;
  if (!detail) {
    if (!loading) return null;
    return (
      <section className="pl-live-panel glass-card glass-ring" aria-busy="true" aria-label="Partido en vivo">
        <div className="pl-live-skeleton" />
      </section>
    );
  }
  const { entry } = detail;
  if (entry.phase === "scheduled" && detail.incidents.length === 0) return null;
  const goals = detail.incidents.filter((i) => i.kind === "goal" || i.kind === "own_goal" || i.kind === "penalty_goal");
  const live = isLivePhaseActive(entry.phase);

  return (
    <section className="pl-live-panel glass-card glass-ring" aria-labelledby={`live-${game.id}`}>
      <header className="pl-live-panel-head">
        <div className="pl-live-panel-title">
          <h2 id={`live-${game.id}`}>{live ? "En vivo" : entry.phase === "final" ? "Así fue el partido" : "Partido"}</h2>
          <LivePhaseBadge entry={entry} kickoffLocal={game.kickoffLocal} />
        </div>
        {showFollow && !(entry.phase === "final") ? <FollowControl gameId={game.id} /> : null}
      </header>

      <div className="pl-live-score" aria-live={live ? "polite" : "off"} aria-atomic="true">
        <span className="pl-live-score-team">
          <TeamBadge
            league={game.league}
            slug={game.home.slug}
            name={game.home.name}
            logoUrl={game.home.logoUrl}
            size={28}
          />
          <span>{home}</span>
        </span>
        <strong className="pl-live-score-value num">
          {entry.score ? `${entry.score.home} – ${entry.score.away}` : "–"}
          <span className="sr-only">
            {entry.score ? `${home} ${entry.score.home}, ${away} ${entry.score.away}` : ""}
          </span>
        </strong>
        <span className="pl-live-score-team pl-live-score-team--away">
          <span>{away}</span>
          <TeamBadge
            league={game.league}
            slug={game.away.slug}
            name={game.away.name}
            logoUrl={game.away.logoUrl}
            size={28}
          />
        </span>
        {entry.htScore && entry.phase !== "live" ? (
          <span className="pl-live-ht num">
            Medio tiempo {entry.htScore.home}–{entry.htScore.away}
          </span>
        ) : null}
      </div>

      {detail.notice || error ? (
        <p className="pl-live-notice" role="status">
          {detail.notice ?? "No pudimos actualizar; reintentamos en un minuto."}
        </p>
      ) : null}

      <div className="pl-live-grid-layout">
        <div className="pl-live-col">
          <MomentumChart momentum={detail.momentum} goals={goals} homeLabel={home} awayLabel={away} />
          <XgRaceChart points={detail.xgTimeline} homeLabel={home} awayLabel={away} estimated={detail.xgEstimated} />
          {detail.stats ? <LiveStatBars stats={detail.stats} homeLabel={home} awayLabel={away} /> : null}
        </div>
        <div className="pl-live-col">
          <h3 className="pl-live-subtitle">Minuto a minuto</h3>
          <LiveTimeline incidents={detail.incidents} homeLabel={home} awayLabel={away} />
        </div>
      </div>

      <footer className="pl-live-foot">
        <span>{detail.attribution}</span>
        {detail.sourceFetchedAt ? (
          <time dateTime={detail.sourceFetchedAt}>
            Actualizado{" "}
            {new Date(detail.sourceFetchedAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </time>
        ) : null}
      </footer>
    </section>
  );
}

/** Contenedor de la ficha: se conecta al sondeo solo cerca del inicio, en juego o ya jugado. */
export function LiveMatchPanel({ game }: { game: PlatformGame }): React.JSX.Element | null {
  const supported = game.sport !== "american-football" && game.league !== "nfl";
  const snap = useLiveMatch(game.id, supported);
  if (!supported) return null;
  // En la ficha, «Siguiendo» ya está en la barra superior: aquí no se repite.
  return <LiveMatchPanelView game={game} detail={snap.data} loading={snap.loading} error={snap.error} showFollow={false} />;
}

// ---------- Marcador del día ----------

export interface LiveScoreboardViewProps {
  board: LiveScoreboard | null;
  games: readonly PlatformGame[];
  onOpen?: (game: PlatformGame) => void;
  showFollow?: boolean;
}

export function LiveScoreboardView({ board, games, onOpen, showFollow = true }: LiveScoreboardViewProps): React.JSX.Element | null {
  if (!board) return null;
  const byId = new Map(games.map((g) => [g.id, g]));
  const rows = board.entries
    .map((e) => ({ e, g: byId.get(e.gameId) }))
    .filter((r): r is { e: LiveScoreboardEntry; g: PlatformGame } => Boolean(r.g));
  if (rows.length === 0) return null;
  const order = (e: LiveScoreboardEntry) => (isLivePhaseActive(e.phase) ? 0 : e.phase === "scheduled" ? 1 : 2);
  rows.sort((a, b) => order(a.e) - order(b.e) || a.e.kickoffUtc.localeCompare(b.e.kickoffUtc));
  const liveCount = rows.filter((r) => isLivePhaseActive(r.e.phase)).length;

  return (
    <section className="pl-live-board glass-card glass-ring" aria-labelledby="pl-live-board-title">
      <header className="pl-live-board-head">
        <h2 id="pl-live-board-title">
          {liveCount > 0 ? (
            <>
              <span className="pl-live-pulse" aria-hidden="true" /> En vivo · {liveCount}
            </>
          ) : (
            "Marcador de hoy"
          )}
        </h2>
        {board.notice ? <span className="pl-live-board-notice">{board.notice}</span> : null}
      </header>
      <ul className="pl-live-board-list">
        {rows.map(({ e, g }) => (
          <li key={g.id} className={`pl-live-row${isLivePhaseActive(e.phase) ? " is-live" : ""}`}>
            <a
              className="pl-live-row-link"
              href={`/app/${g.league}/games/${g.id}`}
              onClick={(ev) => {
                if (!onOpen || ev.metaKey || ev.ctrlKey) return;
                ev.preventDefault();
                onOpen(g);
              }}
            >
              <span className="pl-live-row-teams">
                {(["home", "away"] as const).map((side) => {
                  const t = g[side];
                  const goals = e.score?.[side];
                  const other = e.score?.[side === "home" ? "away" : "home"];
                  const lead = goals !== undefined && other !== undefined && goals > other;
                  return (
                    <span key={side} className={`pl-live-row-line${lead ? " is-lead" : ""}`}>
                      <TeamBadge league={g.league} slug={t.slug} name={t.name} logoUrl={t.logoUrl} size={20} />
                      <span className="pl-live-row-name">{t.shortName}</span>
                      <span className="pl-live-row-goals num">{goals ?? ""}</span>
                    </span>
                  );
                })}
              </span>
              <span className="pl-live-row-meta">
                <LivePhaseBadge entry={e} kickoffLocal={g.kickoffLocal} short />
                <LeagueBadge league={g.league} logoUrl={g.leagueLogoUrl} size={14} />
              </span>
            </a>
            {showFollow && e.phase !== "final" ? <FollowControl gameId={g.id} compact /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LiveScoreboardStrip(): React.JSX.Element | null {
  const { dataset, navigateTo } = usePlatform();
  const snap = useLiveScoreboard(true);
  return (
    <LiveScoreboardView
      board={snap.data}
      games={dataset.games}
      onOpen={(g) => navigateTo(`/app/${g.league}/games/${g.id}`)}
    />
  );
}
