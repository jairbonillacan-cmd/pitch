"use client";

import React, { useState } from "react";
import {
  canonicalTeamHref,
  isLivePhaseActive,
  sportHasDraw,
  sportScoringUnit,
  type LiveIncident,
  type LiveMatchDetail,
  type PlatformSport,
} from "@pitchlab/contracts";
import { LeagueBadge, ProbSplit, TeamBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import { ConfidenceChip } from "../../components/ConfidenceChip";
import { ContextualBackButton } from "../../components/ContextualBackButton";
import { CrestPedestal, MaestroIcon } from "../../components/MaestroPrimitives";
import { shareMatchStoryCard } from "../../components/share-story-card";
import { FollowControl, LivePhaseBadge } from "../../live/LiveMatchCenter";
import { MomentumChart } from "../../live/live-charts";
import {
  usePlatformActions,
  usePlatformCore,
} from "../../platform-provider";
import type {
  MatchTabKey,
  OddsFormat,
  PlatformGame,
  PlatformMarketRow,
} from "../../types";
import { parseForm } from "./MatchContextPanel";

const SPORT_CRUMB_LABEL: Record<PlatformSport, string> = {
  football: "Fútbol",
  "american-football": "Fútbol americano",
  basketball: "Basquetbol",
  "ice-hockey": "Hockey",
  baseball: "Béisbol",
};

function resolveSelectionOdds(
  markets: readonly PlatformMarketRow[],
  selection: "home" | "draw" | "away",
  prob: number,
): { decimal: number; isCapturedQuote: boolean } {
  const row = markets.find((m) => m.market === "h2h" && m.selection === selection);
  if (row?.currentDecimal && row.currentDecimal > 1) {
    return { decimal: row.currentDecimal, isCapturedQuote: true };
  }
  const safeP = Math.max(0.01, Math.min(0.99, prob));
  return { decimal: row?.fairDecimal ?? 1 / safeP, isCapturedQuote: false };
}

function summarizeGoalScorers(
  incidents: readonly LiveIncident[],
  side: "home" | "away",
): string[] {
  return incidents
    .filter(
      (i) =>
        (i.kind === "goal" || i.kind === "own_goal" || i.kind === "penalty_goal") &&
        i.side === side,
    )
    .map((i) => {
      const min = i.minute !== null ? `${i.minute}${i.addedTime ? `+${i.addedTime}` : ""}'` : "";
      const tag = i.kind === "own_goal" ? " (a.g.)" : i.kind === "penalty_goal" ? " (p.)" : "";
      const who = i.player ?? "Gol";
      return [who, min ? `${min}${tag}` : tag.trim()].filter(Boolean).join(" ");
    });
}

function formatIncidentMinute(inc: LiveIncident): string {
  if (inc.minute === null) return "";
  return `${inc.minute}${inc.addedTime ? `+${inc.addedTime}` : ""}'`;
}

function incidentPrimaryText(inc: LiveIncident): { primary: string; secondary: string | null } {
  switch (inc.kind) {
    case "goal":
      return { primary: inc.player ?? "Gol", secondary: inc.secondary ?? null };
    case "own_goal":
      return { primary: inc.player ? `${inc.player} (a.g.)` : "Autogol", secondary: null };
    case "penalty_goal":
      return { primary: inc.player ? `${inc.player} (p.)` : "Gol de penal", secondary: inc.secondary ?? null };
    case "penalty_missed":
      return { primary: inc.player ?? "Penal fallado", secondary: inc.note ?? "Penal fallado" };
    case "yellow":
      return { primary: inc.player ?? "Amarilla", secondary: "Falta" };
    case "second_yellow":
      return { primary: inc.player ?? "2.ª amarilla", secondary: "Expulsión" };
    case "red":
      return { primary: inc.player ?? "Roja directa", secondary: "Expulsión" };
    case "sub":
      return { primary: inc.player ?? "Cambio", secondary: inc.secondary ?? null };
    case "var":
      return { primary: inc.note ?? "Revisión VAR", secondary: inc.player ?? null };
    case "period":
      return { primary: inc.note ?? "Fin del periodo", secondary: null };
  }
}

function renderIncidentGlyph(kind: LiveIncident["kind"]): React.JSX.Element {
  if (kind === "yellow") {
    return <span className="pl-rail-card-mark pl-rail-card-mark--yellow" aria-hidden="true" />;
  }
  if (kind === "red" || kind === "second_yellow") {
    return <span className="pl-rail-card-mark pl-rail-card-mark--red" aria-hidden="true" />;
  }
  if (kind === "var") {
    return <span className="pl-rail-var-badge" aria-hidden="true">VAR</span>;
  }
  if (kind === "sub") {
    return <span className="pl-rail-sub-mark" aria-hidden="true">⇄</span>;
  }
  if (kind === "penalty_missed") {
    return <span className="pl-rail-miss-mark" aria-hidden="true">✕</span>;
  }
  return <span className="pl-rail-ball-mark" aria-hidden="true" />;
}

interface PeriodGroup {
  key: string;
  label: string;
  events: LiveIncident[];
}

function buildPeriodGroups(detail: LiveMatchDetail): PeriodGroup[] {
  const relevant = detail.incidents.filter((i) => i.kind !== "period" && i.side !== null);
  const firstHalf: LiveIncident[] = [];
  const secondHalf: LiveIncident[] = [];
  const extraHalf: LiveIncident[] = [];

  for (const inc of relevant) {
    const m = inc.minute ?? 0;
    if (m > 90) extraHalf.push(inc);
    else if (m > 45) secondHalf.push(inc);
    else firstHalf.push(inc);
  }

  const groups: PeriodGroup[] = [];
  const ht = detail.entry.htScore;
  const full = detail.entry.score;
  const htLabel = ht ? `${ht.home} – ${ht.away}` : null;

  if (extraHalf.length > 0) {
    groups.push({
      key: "et",
      label: full ? `Tiempo extra · ${full.home} – ${full.away}` : "Tiempo extra",
      events: [...extraHalf].reverse(),
    });
  }
  if (secondHalf.length > 0) {
    const secondPeriodScore =
      full && ht ? `${Math.max(0, full.home - ht.home)} – ${Math.max(0, full.away - ht.away)}` : full ? `${full.home} – ${full.away}` : null;
    groups.push({
      key: "2h",
      label: secondPeriodScore ? `2.º tiempo · ${secondPeriodScore}` : "2.º tiempo",
      events: [...secondHalf].reverse(),
    });
  }
  if (firstHalf.length > 0) {
    groups.push({
      key: "1h",
      label: htLabel ? `1.º tiempo · ${htLabel}` : "1.º tiempo",
      events: [...firstHalf].reverse(),
    });
  }
  return groups;
}

function deriveKnockoutFirstLeg(game: PlatformGame): {
  homeGoals: number;
  awayGoals: number;
  aggHome: number;
  aggAway: number;
} | null {
  if (!/(ida|vuelta|cuartos|semifinal|final|octavos|playoff)/i.test(game.round)) return null;
  const first = game.headToHead[0];
  if (!first) return null;
  const currentMs = Date.parse(game.kickoffUtc);
  const prevMs = Date.parse(first.date);
  if (!Number.isFinite(currentMs) || !Number.isFinite(prevMs)) return null;
  if (Math.abs(currentMs - prevMs) > 21 * 24 * 3_600_000) return null;

  const homeKey = game.home.shortName.toLowerCase();
  const prevHomeLower = first.home.toLowerCase();
  const currentHomeWasPrevHome =
    prevHomeLower.includes(homeKey) || homeKey.includes(prevHomeLower);
  const legHomeForCurrent = currentHomeWasPrevHome ? first.homeGoals : first.awayGoals;
  const legAwayForCurrent = currentHomeWasPrevHome ? first.awayGoals : first.homeGoals;
  const curHome = game.score?.home ?? 0;
  const curAway = game.score?.away ?? 0;
  return {
    homeGoals: first.homeGoals,
    awayGoals: first.awayGoals,
    aggHome: legHomeForCurrent + curHome,
    aggAway: legAwayForCurrent + curAway,
  };
}

export function MatchBreadcrumb({
  game,
  onNavigate,
}: {
  readonly game: PlatformGame;
  readonly onNavigate: (href: string) => void;
}): React.JSX.Element {
  const { prefetchRoute } = usePlatformActions();
  const leagueHref = `/app/${game.league}`;
  const go = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onNavigate(href);
  };
  return (
    <nav aria-label="Ruta del partido" className="pl-match-crumb">
      <ContextualBackButton fallbackHref={leagueHref} />
      <ol className="pl-match-crumb-list">
        <li>
          <a
            href="/app"
            onPointerEnter={() => prefetchRoute("/app")}
            onTouchStart={() => prefetchRoute("/app")}
            onClick={go("/app")}
            className="pl-match-crumb-link"
          >
            <MaestroIcon name="arrowLeft" size={13} />
            <span>Inicio</span>
          </a>
        </li>
        <li aria-hidden="true" className="pl-match-crumb-sep">
          /
        </li>
        <li className="pl-match-crumb-sport">{SPORT_CRUMB_LABEL[game.sport]}</li>
        <li aria-hidden="true" className="pl-match-crumb-sep">
          /
        </li>
        <li>
          <a
            href={leagueHref}
            onPointerEnter={() => prefetchRoute(leagueHref)}
            onTouchStart={() => prefetchRoute(leagueHref)}
            onClick={go(leagueHref)}
            className="pl-match-crumb-link pl-match-crumb-link--league"
          >
            <LeagueBadge
              league={game.league}
              label={game.leagueLabel}
              logoUrl={game.leagueLogoUrl}
              size={15}
            />
            <span>{game.leagueLabel}</span>
          </a>
        </li>
        {game.round ? (
          <>
            <li aria-hidden="true" className="pl-match-crumb-sep hidden sm:inline">
              /
            </li>
            <li className="pl-match-crumb-round hidden sm:inline">{game.round}</li>
          </>
        ) : null}
        <li aria-hidden="true" className="pl-match-crumb-sep hidden md:inline">
          /
        </li>
        <li aria-current="page" className="pl-match-crumb-current hidden md:inline truncate">
          {game.home.shortName} vs {game.away.shortName}
        </li>
      </ol>
    </nav>
  );
}

export function MatchHeroScoreboard({
  game,
  homePrimary,
  awayPrimary,
  intelUnlocked,
  liveDetail,
  onNavigate,
}: {
  readonly game: PlatformGame;
  readonly homePrimary: string;
  readonly awayPrimary: string;
  readonly intelUnlocked: boolean;
  readonly liveDetail: LiveMatchDetail | null;
  readonly onNavigate: (href: string) => void;
}): React.JSX.Element {
  const { oddsFormat } = usePlatformCore();
  const { pushToast, prefetchRoute } = usePlatformActions();
  const hasDraw = sportHasDraw(game.sport);
  const unit = sportScoringUnit(game.sport);
  const isFinished = game.status === "FT" && game.score !== undefined;
  const hasForecast = game.hasForecast !== false && Boolean(game.x12 && game.projection);
  const overtimeFactor = game.factors.find((f) => /tiempo extra/i.test(f.label));

  const liveEntry = liveDetail?.entry ?? null;
  const liveActive = Boolean(liveEntry && isLivePhaseActive(liveEntry.phase));
  const resolvedScore =
    liveEntry?.score ?? (isFinished && game.score ? game.score : null);
  const homeGoalsList = liveDetail ? summarizeGoalScorers(liveDetail.incidents, "home") : [];
  const awayGoalsList = liveDetail ? summarizeGoalScorers(liveDetail.incidents, "away") : [];

  const stadium = game.spacetime?.stadium;
  const resolvedVenue = stadium?.name ?? game.venue;
  const elevationLabel =
    stadium?.elevationM && Math.round(stadium.elevationM) > 0
      ? `${Math.round(stadium.elevationM).toLocaleString("es-MX")} m`
      : null;
  const resolvedReferee =
    liveEntry?.referee ||
    game.referee ||
    (isFinished ? "Árbitro no reportado" : "Árbitro por confirmar");

  const goTeam = (slug: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onNavigate(canonicalTeamHref(game.league, slug));
  };

  return (
    <section
      className="pl-match-hero"
      data-match-studio={game.id}
      aria-label={`${game.home.name} contra ${game.away.name}`}
    >
      <div className="pl-match-hero-top">
        <a
          href={`/app/${game.league}`}
          onClick={(e) => {
            e.preventDefault();
            onNavigate(`/app/${game.league}`);
          }}
          className="pl-match-hero-league"
        >
          <LeagueBadge
            league={game.league}
            label={game.leagueLabel}
            logoUrl={game.leagueLogoUrl}
            size={20}
          />
          <span id="modal-league">
            {[game.leagueLabel, game.round].filter(Boolean).join(" · ")}
          </span>
        </a>

        <div className="pl-match-hero-actions">
          <button
            type="button"
            className="pl-btn-glass text-xs min-h-9 px-2.5 inline-flex items-center gap-1.5"
            aria-label="Compartir tarjeta 9:16 del partido"
            data-share-match-story=""
            onClick={() => {
              void shareMatchStoryCard({ game, oddsFormat }).then((mode) => {
                pushToast(
                  mode === "shared" ? "Tarjeta 9:16 compartida" : "Tarjeta 9:16 descargada (PNG)",
                  "success",
                );
              }).catch(() => {
                pushToast("No se pudo generar la tarjeta PNG", "warning");
              });
            }}
          >
            <MaestroIcon name="share" size={13} />
            <span className="hidden sm:inline">9:16</span>
          </button>
          {isFinished ? null : <ConfidenceChip game={game} size="lg" />}
          {isFinished ? (
            <span className="pl-pill pl-pill--brand num text-xs">Finalizado · FT</span>
          ) : (
            <FollowControl gameId={game.id} />
          )}
        </div>
      </div>

      <div className="pl-match-hero-board">
        <div className="pl-match-hero-team pl-match-hero-team--home">
          <div className="pl-match-hero-team-text">
            <h1 className="pl-match-hero-name">
              <a
                href={canonicalTeamHref(game.league, game.home.slug)}
                onPointerEnter={() => prefetchRoute(canonicalTeamHref(game.league, game.home.slug))}
                onTouchStart={() => prefetchRoute(canonicalTeamHref(game.league, game.home.slug))}
                onClick={goTeam(game.home.slug)}
                className="pl-team-link"
                title={`Ver perfil de ${game.home.name}`}
              >
                {game.home.name}
              </a>
            </h1>
            <span className="pl-match-hero-record">
              {game.neutralSite ? "Sede neutral" : "Local"} · {game.home.record}
            </span>
          </div>
          <CrestPedestal size="lg" glowColor={homePrimary}>
            <TeamBadge
              league={game.league}
              slug={game.home.slug}
              name={game.home.name}
              logoUrl={game.home.logoUrl}
              size={52}
            />
          </CrestPedestal>
        </div>

        <div className="pl-match-hero-center">
          {liveActive && liveEntry ? (
            <LivePhaseBadge entry={liveEntry} kickoffLocal={game.kickoffLocal} />
          ) : isFinished ? (
            <span className="pl-match-hero-eyebrow">Marcador final</span>
          ) : (
            <span className="pl-match-hero-eyebrow">
              {game.dayLabel} · {game.kickoffLocal}
            </span>
          )}

          {resolvedScore && (isFinished || liveActive || liveEntry?.phase === "final") ? (
            <>
              <strong className="pl-match-hero-score num">
                {resolvedScore.home} <span aria-hidden="true">–</span> {resolvedScore.away}
              </strong>
              {liveEntry?.htScore ? (
                <span className="pl-match-hero-sub num">
                  MT {liveEntry.htScore.home} – {liveEntry.htScore.away}
                </span>
              ) : isFinished && hasForecast && game.projection ? (
                <span className="pl-match-hero-sub num">
                  {unit.plural === "puntos" ? "Puntos" : "Goles"} esperados:{" "}
                  {game.projection.total.toFixed(unit.decimals)}
                </span>
              ) : isFinished && !hasForecast ? (
                <span className="pl-match-hero-sub">Sin pronóstico previo publicado</span>
              ) : null}
            </>
          ) : !hasForecast || !game.projection ? (
            <>
              <strong
                className="pl-match-hero-score pl-match-hero-score--pending"
                style={{ color: "var(--pl-text-secondary)" }}
              >
                Sin pronóstico
              </strong>
              <span className="pl-match-hero-sub">Sin pronóstico ni confianza publicados</span>
            </>
          ) : intelUnlocked ? (
            <>
              <strong className="pl-match-hero-score pl-match-hero-score--proj num">
                Proy. {game.projection.home.toFixed(unit.decimals)} –{" "}
                {game.projection.away.toFixed(unit.decimals)}
              </strong>
              <span className="pl-match-hero-sub num">
                {unit.plural === "puntos" ? "Puntos" : "Goles"} esperados:{" "}
                {game.projection.total.toFixed(unit.decimals)}
              </span>
            </>
          ) : (
            <>
              <span className="pl-pill inline-flex items-center gap-1.5">
                <MaestroIcon name="lock" size={12} />
                <span>Marcador proyectado Pase PitchLab Ultra</span>
              </span>
              <span className="pl-match-hero-sub">Disponible con Pase PitchLab Ultra</span>
            </>
          )}

          {overtimeFactor && hasForecast ? (
            <span
              className="pl-pill pl-pill--wrap text-[11px] inline-flex items-center justify-center gap-1 mt-1 max-w-full"
              data-overtime-pill=""
              title={overtimeFactor.sub ?? undefined}
            >
              <span>
                {overtimeFactor.label}: {overtimeFactor.value}
                {overtimeFactor.sub ? ` · ${overtimeFactor.sub}` : ""}
              </span>
            </span>
          ) : null}
        </div>

        <div className="pl-match-hero-team pl-match-hero-team--away">
          <CrestPedestal size="lg" glowColor={awayPrimary}>
            <TeamBadge
              league={game.league}
              slug={game.away.slug}
              name={game.away.name}
              logoUrl={game.away.logoUrl}
              size={52}
            />
          </CrestPedestal>
          <div className="pl-match-hero-team-text">
            <h2 className="pl-match-hero-name">
              <a
                href={canonicalTeamHref(game.league, game.away.slug)}
                onPointerEnter={() => prefetchRoute(canonicalTeamHref(game.league, game.away.slug))}
                onTouchStart={() => prefetchRoute(canonicalTeamHref(game.league, game.away.slug))}
                onClick={goTeam(game.away.slug)}
                className="pl-team-link"
                title={`Ver perfil de ${game.away.name}`}
              >
                {game.away.name}
              </a>
            </h2>
            <span className="pl-match-hero-record">
              {game.neutralSite ? "Sede neutral" : "Visita"} · {game.away.record}
            </span>
          </div>
        </div>
      </div>

      {homeGoalsList.length > 0 || awayGoalsList.length > 0 ? (
        <div className="pl-match-hero-scorers num" aria-label="Anotadores del partido">
          <div className="pl-match-hero-scorers-side pl-match-hero-scorers-side--home">
            {homeGoalsList.map((entry, idx) => (
              <span key={`h-${idx}`}>{entry}</span>
            ))}
          </div>
          <span className="pl-match-hero-scorers-dot" aria-hidden="true">
            •
          </span>
          <div className="pl-match-hero-scorers-side pl-match-hero-scorers-side--away">
            {awayGoalsList.map((entry, idx) => (
              <span key={`a-${idx}`}>{entry}</span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="pl-match-hero-prob">
        {hasForecast && game.x12 ? (
          <ProbSplit
            probabilities={hasDraw ? game.x12 : [game.x12[0], game.x12[2]]}
            labels={
              hasDraw
                ? [game.home.shortName, "Empate", game.away.shortName]
                : [game.home.shortName, game.away.shortName]
            }
            showLabels
          />
        ) : (
          <div
            className="rounded-xl px-4 py-2.5 text-xs"
            style={{
              background: "var(--pl-surface-elevated)",
              color: "var(--pl-text-muted)",
            }}
            data-empty-forecast=""
          >
            Este snapshot aún no incluye pronóstico ni confianza publicados para este partido.
          </div>
        )}
      </div>

      <footer className="pl-match-hero-meta" aria-label="Datos del encuentro">
        <span className="pl-match-hero-meta-item">
          <MaestroIcon name="calendar" size={14} />
          <span className="num">
            {game.dayLabel} · {game.kickoffLocal}
          </span>
        </span>
        <span className="pl-match-hero-meta-item">
          <LeagueBadge
            league={game.league}
            label={game.leagueLabel}
            logoUrl={game.leagueLogoUrl}
            size={15}
          />
          <span>{game.leagueLabel}</span>
        </span>
        {resolvedVenue ? (
          <span className="pl-match-hero-meta-item">
            <MaestroIcon name="pin" size={14} />
            <span>
              {resolvedVenue}
              {elevationLabel ? ` · ${elevationLabel}` : ""}
            </span>
          </span>
        ) : null}
        <span className="pl-match-hero-meta-item" data-match-referee="">
          <MaestroIcon name="whistle" size={14} />
          <span>{resolvedReferee}</span>
        </span>
      </footer>
    </section>
  );
}

export function MatchLeftRail({
  game,
  markets,
  oddsFormat,
  intelUnlocked,
  liveDetail,
  mainEngineName,
  cortexSummaryText,
  onSelectTab,
}: {
  readonly game: PlatformGame;
  readonly markets: readonly PlatformMarketRow[];
  readonly oddsFormat: OddsFormat;
  readonly intelUnlocked: boolean;
  readonly liveDetail: LiveMatchDetail | null;
  readonly mainEngineName: string;
  readonly cortexSummaryText: string;
  readonly onSelectTab: (tab: MatchTabKey) => void;
}): React.JSX.Element {
  const [showSubsInRail, setShowSubsInRail] = useState(false);
  const hasDraw = sportHasDraw(game.sport);
  const isFinished = game.status === "FT" && game.score !== undefined;
  const hasForecast = game.hasForecast !== false && Boolean(game.x12 && game.projection);
  const canReadIntel = intelUnlocked || isFinished;
  const flow = game.preGame.moneyFlow;

  const outcomeTiles = (() => {
    if (!hasForecast || !game.x12) return [];
    const list: Array<{
      code: string;
      label: string;
      prob: number;
      decimal: number;
      isCapturedQuote: boolean;
    }> = [
      {
        code: hasDraw ? "1" : game.home.code,
        label: game.home.shortName,
        prob: game.x12[0],
        ...resolveSelectionOdds(markets, "home", game.x12[0]),
      },
      ...(hasDraw
        ? [
            {
              code: "X",
              label: "Empate",
              prob: game.x12[1],
              ...resolveSelectionOdds(markets, "draw", game.x12[1]),
            },
          ]
        : []),
      {
        code: hasDraw ? "2" : game.away.code,
        label: game.away.shortName,
        prob: game.x12[2],
        ...resolveSelectionOdds(markets, "away", game.x12[2]),
      },
    ];
    return list;
  })();

  const maxProb = outcomeTiles.reduce((m, t) => Math.max(m, t.prob), 0);
  const hasMomentumCurve = Boolean(liveDetail && liveDetail.momentum.length > 0);
  const liveGoals = liveDetail
    ? liveDetail.incidents.filter(
        (i) => i.kind === "goal" || i.kind === "own_goal" || i.kind === "penalty_goal",
      )
    : [];
  const periodGroups = liveDetail ? buildPeriodGroups(liveDetail) : [];
  const totalSubs = liveDetail
    ? liveDetail.incidents.filter((i) => i.kind === "sub").length
    : 0;
  const firstLeg = deriveKnockoutFirstLeg(game);

  const homeFactor = game.factors.find((f) => /local/i.test(f.label));
  const awayFactor = game.factors.find((f) => /visit/i.test(f.label));
  const homeForm = homeFactor ? parseForm(homeFactor.value) : [];
  const awayForm = awayFactor ? parseForm(awayFactor.value) : [];

  return (
    <aside className="pl-match-rail" aria-label="Panel rápido del partido">
      {/* 1. Hasta arriba: Momento del partido */}
      <section
        className="pl-match-rail-card"
        aria-labelledby="rail-momentum-heading"
        data-rail-momentum=""
        data-rail-empty={!hasMomentumCurve ? "true" : undefined}
      >
        <div className="pl-match-rail-head">
          <h2 id="rail-momentum-heading" className="pl-match-rail-title">
            Momento del partido
          </h2>
          {liveDetail ? (
            <LivePhaseBadge entry={liveDetail.entry} kickoffLocal={game.kickoffLocal} short />
          ) : (
            <span className="pl-pill text-[11px] num">
              {isFinished ? "Final · FT" : `Por jugar · ${game.kickoffLocal}`}
            </span>
          )}
        </div>
        {hasMomentumCurve && liveDetail ? (
          <MomentumChart
            momentum={liveDetail.momentum}
            goals={liveGoals}
            homeLabel={game.home.shortName}
            awayLabel={game.away.shortName}
          />
        ) : (
          <div className="pl-rail-empty-box">
            <span>
              {isFinished
                ? "Este encuentro no reporta curva minuto a minuto en la ventana actual."
                : "La curva de empuje minuto a minuto aparece aquí en cuanto ruede el balón."}
            </span>
          </div>
        )}
      </section>

      {/* 2. Eventos por periodo (1.º tiempo, 2.º tiempo, goles/tarjetas) y cruce de eliminatoria */}
      <section
        className="pl-match-rail-card"
        aria-labelledby="rail-events-heading"
        data-rail-events=""
        data-rail-empty={periodGroups.length === 0 && !firstLeg ? "true" : undefined}
      >
        <div className="pl-match-rail-head">
          <h2 id="rail-events-heading" className="pl-match-rail-title">
            Eventos por tiempo
          </h2>
          {totalSubs > 0 ? (
            <button
              type="button"
              className="pl-pill text-[11px] cursor-pointer"
              aria-pressed={showSubsInRail}
              onClick={() => setShowSubsInRail((prev) => !prev)}
            >
              {showSubsInRail ? "Ocultar cambios" : `${totalSubs} cambios`}
            </button>
          ) : (
            <span className="pl-pill text-[11px]">Minuto a minuto</span>
          )}
        </div>

        {firstLeg ? (
          <div className="pl-rail-leg">
            <div className="pl-rail-leg-col">
              <span className="pl-rail-leg-title">Ida</span>
              <div className="pl-rail-leg-score num">
                <TeamBadge
                  league={game.league}
                  slug={game.away.slug}
                  name={game.away.shortName}
                  logoUrl={game.away.logoUrl}
                  size={18}
                />
                <strong>
                  {firstLeg.homeGoals} – {firstLeg.awayGoals}
                </strong>
                <TeamBadge
                  league={game.league}
                  slug={game.home.slug}
                  name={game.home.shortName}
                  logoUrl={game.home.logoUrl}
                  size={18}
                />
              </div>
            </div>
            <div className="pl-rail-leg-col">
              <span className="pl-rail-leg-title">Agregado</span>
              <div className="pl-rail-leg-score num">
                <TeamBadge
                  league={game.league}
                  slug={game.home.slug}
                  name={game.home.shortName}
                  logoUrl={game.home.logoUrl}
                  size={18}
                />
                <strong>
                  {firstLeg.aggHome} – {firstLeg.aggAway}
                </strong>
                <TeamBadge
                  league={game.league}
                  slug={game.away.slug}
                  name={game.away.shortName}
                  logoUrl={game.away.logoUrl}
                  size={18}
                />
              </div>
            </div>
          </div>
        ) : null}

        {periodGroups.length > 0 ? (
          <div className="pl-rail-periods">
            {periodGroups.map((group) => {
              const visibleEvents = showSubsInRail
                ? group.events
                : group.events.filter((e) => e.kind !== "sub");
              if (visibleEvents.length === 0) return null;
              return (
                <div key={group.key} className="pl-rail-period">
                  <div className="pl-rail-period-head num">
                    <span>{group.label}</span>
                  </div>
                  <ol className="pl-rail-events" aria-label={group.label}>
                    {visibleEvents.map((ev, idx) => {
                      const text = incidentPrimaryText(ev);
                      const min = formatIncidentMinute(ev);
                      const isGoal =
                        ev.kind === "goal" ||
                        ev.kind === "own_goal" ||
                        ev.kind === "penalty_goal";
                      const scoreChip =
                        isGoal && ev.score ? `${ev.score.home} – ${ev.score.away}` : null;
                      return (
                        <li
                          key={`${ev.order}-${idx}`}
                          className={`pl-rail-event ${ev.side === "away" ? "is-away" : "is-home"}${isGoal ? " is-goal" : ""}`}
                        >
                          <span className="pl-rail-event-min num">{min}</span>
                          {renderIncidentGlyph(ev.kind)}
                          {scoreChip ? (
                            <span className="pl-rail-event-score num">{scoreChip}</span>
                          ) : null}
                          <span className="pl-rail-event-text">
                            <strong>{text.primary}</strong>
                            {text.secondary ? <small>{text.secondary}</small> : null}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="pl-rail-empty-box">
            <span>
              {isFinished
                ? "No se registraron incidencias por tiempo en el feed en vivo."
                : "Aquí aparecen goles, tarjetas y marcador por tiempo en cuanto inicie el juego."}
            </span>
          </div>
        )}
      </section>

      {/* 3. Picks y Cortex IA */}
      <section className="pl-match-rail-card" aria-labelledby="rail-cortex-heading" data-rail-picks="">
        <div className="pl-match-rail-head">
          <h2 id="rail-cortex-heading" className="pl-match-rail-title inline-flex items-center gap-1.5">
            <MaestroIcon name="sparkles" size={14} style={{ color: "var(--pl-brand)" }} />
            <span>Picks y Cortex IA</span>
          </h2>
          <span className="pl-pill pl-pill--brand text-[11px]">{mainEngineName}</span>
        </div>

        <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
          {!hasForecast && cortexSummaryText.trim().length === 0
            ? "Sin lectura publicada para este encuentro."
            : !canReadIntel
              ? "Consulta los picks seleccionados, la proyección exacta de Cortex IA y claves tácticas con Pase PitchLab Ultra."
              : cortexSummaryText}
        </p>

        {!hasForecast ? (
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Aún no hay picks publicados para este encuentro.
          </p>
        ) : !canReadIntel ? (
          <div className="pl-match-rail-locked">
            <MaestroIcon name="lock" size={14} />
            <span>Picks y probabilidades reservadas para Pase PitchLab Ultra.</span>
          </div>
        ) : game.picks.length > 0 ? (
          <div className="pl-match-rail-picks-list">
            {game.picks.slice(0, 3).map((pk) => (
              <div key={pk.id} className="pl-match-rail-pick">
                <div className="pl-match-rail-pick-meta">
                  <span className="pl-match-rail-pick-cat">{pk.categoryLabel}</span>
                  <span className="pl-match-rail-pick-label">{pk.label}</span>
                </div>
                <span className="pl-match-rail-pick-val num">
                  {(pk.p * 100).toFixed(1)} % · {formatOddsValue(pk.fairDecimal, oddsFormat)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Aún no hay picks publicados para este encuentro.
          </p>
        )}

        <button
          type="button"
          className="pl-match-rail-link"
          onClick={() => onSelectTab("ia")}
        >
          <span>Abrir Análisis IA completo</span>
          <MaestroIcon name="arrowRight" size={13} />
        </button>
      </section>

      {/* 4. Tiempo reglamentario / Ganador (1 · X · 2) */}
      <section className="pl-match-rail-card" aria-labelledby="rail-odds-heading">
        <div className="pl-match-rail-head">
          <h2 id="rail-odds-heading" className="pl-match-rail-title">
            {hasDraw ? "Tiempo reglamentario" : "Ganador del partido"}
          </h2>
          <span className="pl-pill text-[11px]">{game.updatedAtLabel}</span>
        </div>

        {!hasForecast || outcomeTiles.length === 0 ? (
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Aún no hay línea ni probabilidades publicadas para este encuentro.
          </p>
        ) : !canReadIntel ? (
          <div className="pl-match-rail-locked">
            <MaestroIcon name="lock" size={14} />
            <span>Cuotas justas y probabilidades de mercado reservadas para Pase PitchLab Ultra.</span>
          </div>
        ) : (
          <>
            <div
              className="pl-match-rail-odds"
              data-cols={outcomeTiles.length}
            >
              {outcomeTiles.map((tile) => {
                const isFav = tile.prob === maxProb && maxProb > 0;
                return (
                  <div
                    key={tile.code}
                    className={`pl-match-rail-odd${isFav ? " is-fav" : ""}`}
                    title={tile.label}
                  >
                    <div className="pl-match-rail-odd-top">
                      <span className="pl-match-rail-odd-code">{tile.code}</span>
                      <span className="pl-match-rail-odd-prob num">
                        {(tile.prob * 100).toFixed(1)} %
                      </span>
                    </div>
                    <strong className="pl-match-rail-odd-val num">
                      {formatOddsValue(tile.decimal, oddsFormat)}
                    </strong>
                    <span className="pl-match-rail-odd-kind">
                      {tile.isCapturedQuote ? "Cuota casa" : "Cuota justa"}
                    </span>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              className="pl-match-rail-link"
              onClick={() => onSelectTab("dinero")}
            >
              <span>Comparar cuotas en ¿Dónde está el dinero?</span>
              <MaestroIcon name="arrowRight" size={13} />
            </button>
          </>
        )}
      </section>

      {/* 5. Forma reciente, pulso y accesos rápidos */}
      <section className="pl-match-rail-card" aria-labelledby="rail-context-heading">
        <div className="pl-match-rail-head">
          <h2 id="rail-context-heading" className="pl-match-rail-title inline-flex items-center gap-1.5">
            <MaestroIcon name="activity" size={14} style={{ color: "var(--pl-brand)" }} />
            <span>Forma y pulso</span>
          </h2>
          <span className="pl-pill text-[11px] num">
            {flow ? `${flow.homeShare} % / ${flow.awayShare} %` : "Snapshot"}
          </span>
        </div>

        {homeForm.length > 0 || awayForm.length > 0 ? (
          <div className="pl-match-rail-forms">
            {homeForm.length > 0 ? (
              <div className="pl-match-rail-form-row">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <TeamBadge
                    league={game.league}
                    slug={game.home.slug}
                    name={game.home.shortName}
                    logoUrl={game.home.logoUrl}
                    size={18}
                  />
                  <span className="text-xs font-semibold truncate">{game.home.shortName}</span>
                </span>
                <span className="pl-form" aria-label={`Forma ${game.home.shortName}`}>
                  {homeForm.map((r, i) => (
                    <span key={i} className={`pl-form-dot is-${r}`}>
                      {r}
                    </span>
                  ))}
                </span>
              </div>
            ) : null}
            {awayForm.length > 0 ? (
              <div className="pl-match-rail-form-row">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <TeamBadge
                    league={game.league}
                    slug={game.away.slug}
                    name={game.away.shortName}
                    logoUrl={game.away.logoUrl}
                    size={18}
                  />
                  <span className="text-xs font-semibold truncate">{game.away.shortName}</span>
                </span>
                <span className="pl-form" aria-label={`Forma ${game.away.shortName}`}>
                  {awayForm.map((r, i) => (
                    <span key={i} className={`pl-form-dot is-${r}`}>
                      {r}
                    </span>
                  ))}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
            {flow
              ? flow.sharpNote
              : "Revisa descanso, historial directo, sede y tabla en la pestaña de Contexto."}
          </p>
        )}

        <div className="pl-match-rail-actions">
          <button
            type="button"
            className="pl-match-rail-link"
            onClick={() => onSelectTab("numeros")}
          >
            <span>Números y simulador</span>
            <MaestroIcon name="arrowRight" size={12} />
          </button>
          <button
            type="button"
            className="pl-match-rail-link"
            onClick={() => onSelectTab("contexto")}
          >
            <span>Contexto y H2H</span>
            <MaestroIcon name="arrowRight" size={12} />
          </button>
        </div>
      </section>
    </aside>
  );
}
