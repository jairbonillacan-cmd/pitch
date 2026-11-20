"use client";

/**
 * EN-VIVO-1 · Match Center: marcador del día, ficha en vivo y «Siguiendo».
 *
 * Los componentes de presentación (`LiveMatchPanelView`, `LiveScoreboardView`) reciben los datos
 * por props para Storybook y pruebas; los contenedores (`LiveMatchPanel`, `LiveScoreboardStrip`)
 * los leen del sondeo compartido (`live-store.ts`).
 */
import React, { useEffect } from "react";
import {
  canonicalGameHref,
  LIVE_PHASE_LABEL_ES,
  isLivePhaseActive,
  type LiveIncident,
  type LiveMatchDetail,
  type LiveScoreboard,
  type LiveScoreboardEntry,
} from "@pitchlab/contracts";
import { LeagueBadge, TeamBadge } from "../../sports";
import { MaestroIcon } from "../components/MaestroPrimitives";
import {
  DEFAULT_FOLLOW_ALERTS,
  type FollowAlerts,
  useFollowAlerts,
  useOptionalPlatformCore,
  usePlatformActions,
  usePlatformCore,
  useWatchlistGameIds,
} from "../platform-provider";
import type { PlatformGame } from "../types";
import { LiveStatBars, MomentumChart, XgRaceChart } from "./live-charts";
import { LiveWinProbBar } from "./LiveWinProbBar";
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
  const { toggleWatchlistGame, setFollowAlerts } = usePlatformActions();
  const watchlistGameIds = useWatchlistGameIds();
  const followAlerts = useFollowAlerts();
  const following = watchlistGameIds.includes(gameId);
  const [closingAlerts, setClosingAlerts] = React.useState(false);
  const [pulseSeq, setPulseSeq] = React.useState(0);
  const prevFollowingRef = React.useRef(following);

  React.useEffect(() => {
    if (prevFollowingRef.current && !following && !compact) {
      setClosingAlerts(true);
      const t = window.setTimeout(() => setClosingAlerts(false), 230);
      prevFollowingRef.current = following;
      return () => window.clearTimeout(t);
    }
    if (following) {
      setClosingAlerts(false);
    }
    prevFollowingRef.current = following;
    return undefined;
  }, [following, compact]);

  const alerts = followAlerts[gameId] ?? DEFAULT_FOLLOW_ALERTS;
  const toggleAlert = (key: keyof FollowAlerts) => setFollowAlerts(gameId, { ...alerts, [key]: !alerts[key] });
  const showAlerts = !compact && (following || closingAlerts);

  return (
    <div className="pl-live-follow">
      <button
        type="button"
        className={`pl-live-follow-btn${following ? " is-on" : ""}${pulseSeq > 0 ? " is-pulsing" : ""}`}
        data-pulse-seq={pulseSeq > 0 ? pulseSeq : undefined}
        aria-pressed={following}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPulseSeq((n) => n + 1);
          toggleWatchlistGame(gameId);
        }}
        onAnimationEnd={() => setPulseSeq(0)}
      >
        <span key={following ? "on" : "off"} className="pl-live-follow-ico">
          <MaestroIcon name={following ? "check" : "bell"} size={14} />
        </span>
        <span className={compact ? "sr-only" : undefined}>{following ? "Siguiendo" : "Seguir"}</span>
      </button>
      {showAlerts ? (
        <div
          className="pl-live-alerts-shell"
          data-closing={!following && closingAlerts ? "" : undefined}
          aria-hidden={!following || undefined}
        >
          <div className="pl-live-alerts-inner">
            <fieldset className="pl-live-alerts">
              <legend className="sr-only">Avisos de este partido</legend>
              {(
                [
                  ["kickoff", "Inicio"],
                  ["goals", "Goles"],
                  ["final", "Final"],
                ] as const
              ).map(([key, label], idx) => (
                <label
                  key={key}
                  className="pl-live-chip"
                  style={{ "--chip-idx": idx } as React.CSSProperties}
                >
                  <input type="checkbox" checked={alerts[key]} onChange={() => toggleAlert(key)} />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
          </div>
        </div>
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
  /** Oculta la gráfica de momentum cuando ya vive en la columna lateral de la ficha. */
  hideMomentum?: boolean;
  /** Oculta el marcador duplicado cuando el hero principal ya lo muestra arriba. */
  hideScoreboard?: boolean;
  /** Oculta la línea de tiempo duplicada cuando ya vive por tiempos en el riel lateral. */
  hideTimeline?: boolean;
}

type LiveRightTabKey = "timeline" | "commentary" | "players";

function LiveDetailRightColumn({
  detail,
  home,
  away,
}: {
  detail: LiveMatchDetail;
  home: string;
  away: string;
}): React.JSX.Element {
  const commentary = detail.commentary ?? [];
  const players = detail.playerStats ?? [];
  const hasCommentary = commentary.length > 0;
  const hasPlayers = players.length > 0;
  const uid = React.useId().replace(/:/g, "");

  const tabs: Array<{ key: LiveRightTabKey; label: string }> = [
    { key: "timeline", label: "Minuto a minuto" },
    ...(hasCommentary ? [{ key: "commentary" as const, label: "Narración" }] : []),
    ...(hasPlayers ? [{ key: "players" as const, label: "Jugadores" }] : []),
  ];
  const [activeTab, setActiveTab] = React.useState<LiveRightTabKey>("timeline");
  const currentTab: LiveRightTabKey = tabs.some((t) => t.key === activeTab) ? activeTab : "timeline";

  if (!hasCommentary && !hasPlayers) {
    return (
      <div className="pl-live-col">
        <h3 className="pl-live-subtitle">Minuto a minuto</h3>
        <LiveTimeline incidents={detail.incidents} homeLabel={home} awayLabel={away} />
      </div>
    );
  }

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const idx = tabs.findIndex((t) => t.key === currentTab);
    if (idx < 0) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setActiveTab(tabs[(idx + 1) % tabs.length]!.key);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setActiveTab(tabs[(idx - 1 + tabs.length) % tabs.length]!.key);
    }
  };

  return (
    <div className="pl-live-col">
      <div
        role="tablist"
        aria-label="Detalle del partido en vivo"
        className="pl-live-tabs"
        onKeyDown={handleTabKeyDown}
      >
        {tabs.map((t) => {
          const selected = currentTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              id={`${uid}-tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`${uid}-panel-${t.key}`}
              tabIndex={selected ? 0 : -1}
              className="pl-live-tab"
              onClick={() => setActiveTab(t.key)}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`${uid}-panel-timeline`}
        aria-labelledby={`${uid}-tab-timeline`}
        hidden={currentTab !== "timeline"}
        className="pl-live-tabpanel"
      >
        <LiveTimeline incidents={detail.incidents} homeLabel={home} awayLabel={away} />
      </div>

      {hasCommentary ? (
        <div
          role="tabpanel"
          id={`${uid}-panel-commentary`}
          aria-labelledby={`${uid}-tab-commentary`}
          hidden={currentTab !== "commentary"}
          className="pl-live-tabpanel"
        >
          <ol className="pl-live-commentary">
            {[...commentary].reverse().map((item) => (
              <li key={item.id} className={item.isImportant ? "is-important" : undefined}>
                <span className="pl-live-event-min num">
                  {item.minute != null
                    ? `${item.minute}${item.addedTime ? `+${item.addedTime}` : ""}'`
                    : "·"}
                </span>
                <span>{item.text}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {hasPlayers ? (
        <div
          role="tabpanel"
          id={`${uid}-panel-players`}
          aria-labelledby={`${uid}-tab-players`}
          hidden={currentTab !== "players"}
          className="pl-live-tabpanel"
        >
          <div
            className="pl-live-players-region"
            role="region"
            tabIndex={0}
            aria-label="Actuaciones individuales del partido"
          >
            <table className="pl-live-players-table">
              <thead>
                <tr>
                  <th scope="col">Jugador</th>
                  <th scope="col" className="num">Nota</th>
                  <th scope="col" className="num">Min</th>
                  <th scope="col" className="num">G / A</th>
                  <th scope="col" className="num">Tiros</th>
                  <th scope="col" className="num">xG</th>
                </tr>
              </thead>
              <tbody>
                {players.slice(0, 18).map((p, idx) => (
                  <tr key={`${p.side}-${p.player}-${idx}`}>
                    <td>
                      <strong>{p.player}</strong>{" "}
                      <small style={{ color: "var(--pl-text-muted)" }}>
                        {p.side === "home" ? home : away}
                        {p.position ? ` · ${p.position}` : ""}
                      </small>
                    </td>
                    <td className="num" data-label="Nota">
                      {p.rating != null ? p.rating.toFixed(1) : "—"}
                    </td>
                    <td className="num" data-label="Min">
                      {p.minutes != null ? `${Math.round(p.minutes)}'` : "—"}
                    </td>
                    <td className="num" data-label="G / A">
                      {p.goals ?? 0} / {p.assists ?? 0}
                    </td>
                    <td className="num" data-label="Tiros">
                      {p.shots ?? 0}
                      {p.shotsOnTarget ? ` (${p.shotsOnTarget})` : ""}
                    </td>
                    <td className="num" data-label="xG">
                      {p.xg != null ? p.xg.toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LiveMatchPanelView({
  game,
  detail,
  loading,
  error,
  showFollow = true,
  hideMomentum = false,
  hideScoreboard = false,
  hideTimeline = false,
}: LiveMatchPanelViewProps): React.JSX.Element | null {
  const platformCore = useOptionalPlatformCore();
  const oddsFormat = platformCore?.oddsFormat ?? "american";
  const home = game.home.shortName;
  const away = game.away.shortName;
  const live = Boolean(detail && isLivePhaseActive(detail.entry.phase));

  // Screen Wake Lock opcional: mantiene la pantalla encendida solo mientras el partido en vivo
  // esté activo y visible, liberando el bloqueo al cambiar de pestaña/app o desmontar (ADR-053).
  useEffect(() => {
    if (!live || typeof navigator === "undefined" || typeof document === "undefined") return;
    const nav = navigator as Navigator & {
      wakeLock?: {
        request: (type: "screen") => Promise<{ release: () => Promise<void> }>;
      };
    };
    if (!nav.wakeLock || typeof nav.wakeLock.request !== "function") return;
    let active = true;
    let sentinel: { release: () => Promise<void> } | null = null;

    const acquire = async () => {
      if (!active || document.visibilityState !== "visible") return;
      try {
        sentinel = await nav.wakeLock!.request("screen");
        if (!active && sentinel) {
          void sentinel.release().catch(() => undefined);
          sentinel = null;
        }
      } catch (err) {
        void err;
      }
    };

    const release = () => {
      if (!sentinel) return;
      const current = sentinel;
      sentinel = null;
      void current.release().catch(() => undefined);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void acquire();
      } else {
        release();
      }
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, [live]);

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

  return (
    <section className="pl-live-panel glass-card glass-ring" aria-labelledby={`live-${game.id}`}>
      <header className="pl-live-panel-head">
        <div className="pl-live-panel-title">
          <h2 id={`live-${game.id}`}>{live ? "En vivo" : entry.phase === "final" ? "Así fue el partido" : "Partido"}</h2>
          <LivePhaseBadge entry={entry} kickoffLocal={game.kickoffLocal} />
        </div>
        {showFollow && !(entry.phase === "final") ? <FollowControl gameId={game.id} /> : null}
      </header>

      {hideScoreboard ? null : (
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
      )}

      {live && detail.inPlayWinProb ? (
        <LiveWinProbBar
          homeLabel={home}
          awayLabel={away}
          inPlay={detail.inPlayWinProb}
          oddsFormat={oddsFormat}
        />
      ) : null}

      {detail.notice || error ? (
        <p className="pl-live-notice" role="status">
          {detail.notice ?? "No pudimos actualizar; reintentamos en un minuto."}
        </p>
      ) : null}

      <div className={`pl-live-grid-layout${hideTimeline ? " pl-live-grid-layout--single" : ""}`}>
        <div className="pl-live-col">
          {hideMomentum ? null : (
            <MomentumChart momentum={detail.momentum} goals={goals} homeLabel={home} awayLabel={away} />
          )}
          <XgRaceChart points={detail.xgTimeline} homeLabel={home} awayLabel={away} estimated={detail.xgEstimated} />
          {detail.stats ? <LiveStatBars stats={detail.stats} homeLabel={home} awayLabel={away} /> : null}
        </div>
        {hideTimeline ? null : (
          <LiveDetailRightColumn detail={detail} home={home} away={away} />
        )}
      </div>

      {detail.broadcastsMx && detail.broadcastsMx.length > 0 ? (
        <div className="pl-live-broadcasts" aria-label="Canales de televisión en México">
          <span className="pl-pill">TV México: {detail.broadcastsMx.join(" · ")}</span>
        </div>
      ) : null}

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
export function LiveMatchPanel({
  game,
  hideMomentum = false,
  hideScoreboard = false,
}: {
  game: PlatformGame;
  hideMomentum?: boolean;
  hideScoreboard?: boolean;
}): React.JSX.Element | null {
  const supported = game.sport !== "american-football" && game.league !== "nfl";
  const snap = useLiveMatch(game.id, supported);
  if (!supported) return null;
  // En la ficha, «Siguiendo» ya está en la barra superior: aquí no se repite.
  return (
    <LiveMatchPanelView
      game={game}
      detail={snap.data}
      loading={snap.loading}
      error={snap.error}
      showFollow={false}
      hideMomentum={hideMomentum}
      hideScoreboard={hideScoreboard}
    />
  );
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
              href={canonicalGameHref(g.league, g)}
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
  const { dataset } = usePlatformCore();
  const { navigateTo } = usePlatformActions();
  const snap = useLiveScoreboard(true);
  return (
    <LiveScoreboardView
      board={snap.data}
      games={dataset.games}
      onOpen={(g) => navigateTo(canonicalGameHref(g.league, g))}
    />
  );
}
