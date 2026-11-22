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
import { AtomicFormStrip } from "../../atomic/AtomicFormStrip";
import { ContextualBackButton } from "../../components/ContextualBackButton";
import { CrestPedestal, MaestroIcon } from "../../components/MaestroPrimitives";
import { SportEventIcon } from "../../components/SportEventIcons";
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

function summarizeGoalScorers(
  incidents: readonly LiveIncident[],
  side: "home" | "away",
): Array<{ text: string; kind: LiveIncident["kind"] }> {
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
      return {
        text: [who, min ? `${min}${tag}` : tag.trim()].filter(Boolean).join(" "),
        kind: i.kind,
      };
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
  return <SportEventIcon kind={kind} size={15} />;
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
      style={{ viewTransitionName: "pl-match-hero" }}
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
            className="pl-btn-glass pl-match-share-btn text-xs min-w-11 min-h-11 justify-center [@media(min-width:768px)_and_(pointer:fine)]:min-w-0 [@media(min-width:768px)_and_(pointer:fine)]:min-h-9 px-3 [@media(min-width:768px)_and_(pointer:fine)]:px-2.5 inline-flex items-center gap-1.5"
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
              <span className="pl-match-hero-sub">Aún sin pronóstico publicado</span>
            </>
          ) : intelUnlocked ? (
            <>
              <strong className="pl-match-hero-score num">
                {game.kickoffLocal}
              </strong>
              <span className="pl-match-hero-sub">Inicio</span>
              <span
                className="pl-pill pl-pill--wrap text-[11px] inline-flex items-center justify-center gap-1 mt-1 max-w-full num"
                data-match-hero-expected=""
              >
                <span>
                  {unit.plural === "puntos" ? "Puntos" : "Goles"} esperados:{" "}
                  {game.projection.home.toFixed(unit.decimals)} –{" "}
                  {game.projection.away.toFixed(unit.decimals)} · Total{" "}
                  {game.projection.total.toFixed(unit.decimals)}
                </span>
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
              <span key={`h-${idx}`} className="pl-match-hero-scorer pl-match-hero-scorer--home">
                <span>{entry.text}</span>
                <SportEventIcon kind={entry.kind} size={13} />
              </span>
            ))}
          </div>
          <span className="pl-match-hero-scorers-dot" aria-hidden="true">
            •
          </span>
          <div className="pl-match-hero-scorers-side pl-match-hero-scorers-side--away">
            {awayGoalsList.map((entry, idx) => (
              <span key={`a-${idx}`} className="pl-match-hero-scorer pl-match-hero-scorer--away">
                <SportEventIcon kind={entry.kind} size={13} />
                <span>{entry.text}</span>
              </span>
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
            Este partido aún no tiene pronóstico publicado.
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
  const isFinished = game.status === "FT" && game.score !== undefined;
  const flow = game.preGame.moneyFlow;
  void markets;
  void oddsFormat;
  void intelUnlocked;
  void mainEngineName;
  void cortexSummaryText;

  const hasMomentumCurve = Boolean(liveDetail && liveDetail.momentum.length > 0);
  const liveActive = Boolean(liveDetail && isLivePhaseActive(liveDetail.entry.phase));
  const liveMinute = liveActive && liveDetail
    ? (Number.parseInt(liveDetail.entry.clock?.replace(/[^0-9]/g, "") ?? "", 10) ||
        liveDetail.momentum[liveDetail.momentum.length - 1]?.minute ||
        null)
    : null;
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
            homeCrest={
              <TeamBadge
                league={game.league}
                slug={game.home.slug}
                name={game.home.name}
                logoUrl={game.home.logoUrl}
                size={18}
                decorative
              />
            }
            awayCrest={
              <TeamBadge
                league={game.league}
                slug={game.away.slug}
                name={game.away.name}
                logoUrl={game.away.logoUrl}
                size={18}
                decorative
              />
            }
            liveMinute={liveMinute}
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
              className="pl-pill text-[11px] cursor-pointer num min-w-11 min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-w-0 [@media(min-width:768px)_and_(pointer:fine)]:min-h-7 px-3 [@media(min-width:768px)_and_(pointer:fine)]:px-2.5"
              aria-pressed={showSubsInRail}
              onClick={() => setShowSubsInRail((prev) => !prev)}
            >
              {showSubsInRail
                ? "Ocultar cambios"
                : `${totalSubs} ${totalSubs === 1 ? "cambio" : "cambios"}`}
            </button>
          ) : null}
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

      <section className="pl-match-rail-card" aria-labelledby="rail-context-heading">
        <div className="pl-match-rail-head">
          <h2 id="rail-context-heading" className="pl-match-rail-title inline-flex items-center gap-1.5">
            <MaestroIcon name="activity" size={14} style={{ color: "var(--pl-brand)" }} />
            <span>Forma y pulso</span>
          </h2>
          <span className="pl-pill text-[11px] num">
            {flow ? `${flow.homeShare} % / ${flow.awayShare} %` : game.updatedAtLabel}
          </span>
        </div>

        {liveDetail?.broadcastsMx && liveDetail.broadcastsMx.length > 0 ? (
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
            <strong>TV México:</strong> {liveDetail.broadcastsMx.join(" · ")}
          </p>
        ) : null}

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
                    decorative
                  />
                  <span className="text-xs font-semibold truncate">{game.home.shortName}</span>
                </span>
                <AtomicFormStrip
                  form={homeForm}
                  sport={game.sport}
                  teamName={game.home.shortName}
                  size="sm"
                />
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
                    decorative
                  />
                  <span className="text-xs font-semibold truncate">{game.away.shortName}</span>
                </span>
                <AtomicFormStrip
                  form={awayForm}
                  sport={game.sport}
                  teamName={game.away.shortName}
                  size="sm"
                />
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
            onClick={() => onSelectTab("ia")}
          >
            <span>Análisis IA</span>
            <MaestroIcon name="arrowRight" size={12} />
          </button>
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
