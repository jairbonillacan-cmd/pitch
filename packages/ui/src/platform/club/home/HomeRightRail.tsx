"use client";

import React, { useMemo } from "react";
import {
  canonicalGameHref,
  formatOddsCaptureEs,
  type LeagueId,
} from "@pitchlab/contracts";
import { LeagueBadge, PBar, TeamBadge } from "../../../sports";
import { formatOddsValue } from "../../access-guard";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { setActiveSharedTransition } from "../../navigation-helpers";
import {
  useIsPickInParlay,
  useJournalEntries,
  usePlatformActions,
  usePlatformCore,
} from "../../platform-provider";
import { profileRecord } from "../../profile-stats";
import type { MatchPick, PlatformGame } from "../../types";
import { dayNumber, shortDateLabel, shortWeekday } from "./home-model";
import { formatGameKickoffTime } from "./home-view-helpers";
import { HomeParlayHubCard } from "./HomeParlayHubCard";

const TopPickRailItem = React.memo(function TopPickRailItem({
  rank,
  game,
  pick,
}: {
  readonly rank: number;
  readonly game: PlatformGame;
  readonly pick: MatchPick;
}): React.JSX.Element {
  const { oddsFormat, userTimezone } = usePlatformCore();
  const { addPickToParlay, removePickFromParlay, navigateTo, prefetchRoute } = usePlatformActions();
  const inParlay = useIsPickInParlay(pick.id);
  const time = formatGameKickoffTime(game, userTimezone);
  const studioHref = canonicalGameHref(game.league, game);

  return (
    <article className="pl-rail-top-pick">
      <div className="flex items-center justify-between gap-2 text-xs min-w-0">
        <a
          href={studioHref}
          onPointerEnter={() => prefetchRoute(studioHref)}
          onTouchStart={() => prefetchRoute(studioHref)}
          onClick={(e) => {
            e.preventDefault();
            setActiveSharedTransition(e.currentTarget.closest("article"), "pl-match-hero");
            navigateTo(studioHref);
          }}
          className="inline-flex items-center gap-1.5 min-w-0 no-underline"
          style={{ color: "var(--pl-text-secondary)" }}
        >
          <span className="pl-rail-rank num">#{rank}</span>
          <TeamBadge
            league={game.league}
            slug={game.home.slug}
            name={game.home.name}
            logoUrl={game.home.logoUrl}
            size={18}
          />
          <span className="font-semibold truncate">{game.home.shortName}</span>
          <span style={{ color: "var(--pl-text-muted)" }}>vs</span>
          <TeamBadge
            league={game.league}
            slug={game.away.slug}
            name={game.away.name}
            logoUrl={game.away.logoUrl}
            size={18}
          />
          <span className="font-semibold truncate">{game.away.shortName}</span>
        </a>
        <span className="num text-[11px] shrink-0" style={{ color: "var(--pl-text-muted)" }}>
          {shortDateLabel(game.dayId)} · {time}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <strong className="text-sm leading-snug min-w-0">{pick.label}</strong>
        <strong className="num text-lg font-extrabold shrink-0" style={{ color: "var(--pl-success)" }}>
          {(pick.p * 100).toFixed(1)} %
        </strong>
      </div>

      <PBar p={pick.p} lead />

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
          Momio justo{" "}
          <strong style={{ color: "var(--pl-text)" }}>
            {formatOddsValue(pick.fairDecimal, oddsFormat)}
          </strong>
        </span>
        <button
          type="button"
          className={`pl-home-parlay-btn is-sm ${inParlay ? "is-on" : ""}`.trim()}
          aria-pressed={inParlay}
          aria-label={`${inParlay ? "Quitar del parlay" : "Agregar al parlay"}: ${pick.label}`}
          onClick={() => (inParlay ? removePickFromParlay(pick.id) : addPickToParlay(pick))}
        >
          <MaestroIcon name={inParlay ? "check" : "plus"} size={13} />
          <span>{inParlay ? "En parlay" : "+ Parlay"}</span>
        </button>
      </div>
    </article>
  );
});

function TopPicksRail({
  items,
}: {
  readonly items: ReadonlyArray<{ game: PlatformGame; pick: MatchPick }>;
}): React.JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby="home-top-picks-title"
      className="pl-home-rail-card glass-card glass-ring"
      data-top-picks-rail=""
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <h2 id="home-top-picks-title" className="m-0 text-base font-extrabold">
            Picks con mayor probabilidad
          </h2>
          <span className="pl-pill pl-pill--success num">Top {items.length}</span>
        </div>
        <span className="text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
          Las selecciones principales más sólidas del modelo hoy.
        </span>
      </div>
      <div className="flex flex-col gap-2.5">
        {items.map(({ game, pick }, idx) => (
          <TopPickRailItem key={pick.id} rank={idx + 1} game={game} pick={pick} />
        ))}
      </div>
    </section>
  );
}

function ValueRail({
  items,
}: {
  readonly items: ReadonlyArray<{ game: PlatformGame; pick: MatchPick }>;
}): React.JSX.Element | null {
  const { oddsFormat } = usePlatformCore();
  const { navigateTo, prefetchRoute } = usePlatformActions();
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="home-value-title" className="pl-home-rail-card glass-card glass-ring">
      <div className="flex flex-col gap-1">
        <h2 id="home-value-title" className="m-0 text-base font-extrabold">
          Donde la casa paga más
        </h2>
        <span className="text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
          Momio real de casa por encima del momio justo del modelo.
        </span>
      </div>
      {items.slice(0, 4).map(({ game, pick }) => {
        const href = canonicalGameHref(game.league, game);
        return (
          <a
            key={pick.id}
            href={href}
            onPointerEnter={() => prefetchRoute(href)}
            onTouchStart={() => prefetchRoute(href)}
            onClick={(e) => {
              e.preventDefault();
              navigateTo(href);
            }}
            className="pl-home-value no-underline"
            style={{ color: "inherit" }}
          >
            <div className="flex items-center gap-3">
              <LeagueBadge
                league={game.league}
                label={game.leagueLabel}
                logoUrl={game.leagueLogoUrl}
                size={20}
              />
              <span className="min-w-0 flex-1 flex flex-col">
                <strong className="text-sm">{pick.label}</strong>
                <span className="text-xs truncate" style={{ color: "var(--pl-text-muted)" }}>
                  {game.home.shortName} vs {game.away.shortName} · {shortWeekday(game.dayId)}{" "}
                  {dayNumber(game.dayId)} · {game.kickoffLocal}
                </span>
              </span>
              <span className="flex flex-col items-end num">
                <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  justo {formatOddsValue(pick.fairDecimal, oddsFormat)}
                </span>
                <strong className="text-[15px]">
                  casa {formatOddsValue(pick.marketDecimal ?? pick.fairDecimal, oddsFormat)}
                </strong>
                {pick.marketCapturedAtUtc ? (
                  <time
                    dateTime={pick.marketCapturedAtUtc}
                    className="text-[11px] leading-tight"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    {formatOddsCaptureEs(pick.marketCapturedAtUtc)}
                  </time>
                ) : null}
              </span>
            </div>
            <PBar p={pick.p} />
          </a>
        );
      })}
    </section>
  );
}

function LabRail(): React.JSX.Element {
  const journal = useJournalEntries();
  const { navigateTo, prefetchRoute } = usePlatformActions();
  const rec = useMemo(() => profileRecord(journal), [journal]);
  return (
    <section aria-labelledby="home-lab-title" className="pl-home-rail-card glass-card glass-ring">
      <div className="flex items-center justify-between gap-2">
        <h2 id="home-lab-title" className="m-0 text-base font-extrabold">
          Mi récord
        </h2>
        <a
          href="/app/lab"
          onPointerEnter={() => prefetchRoute("/app/lab")}
          onTouchStart={() => prefetchRoute("/app/lab")}
          onClick={(e) => {
            e.preventDefault();
            navigateTo("/app/lab");
          }}
          className="text-sm font-bold min-h-11 [@media(min-width:768px)_and_(pointer:fine)]:min-h-8 inline-flex items-center px-1"
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
        <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
          Sella un pick antes del partido y aquí verás su resultado y si le ganaste al cierre.
        </p>
      ) : null}
    </section>
  );
}

export interface HomeRightRailProps {
  readonly visibleGames: readonly PlatformGame[];
  readonly allGames: readonly PlatformGame[];
  readonly selectedDay: string;
  readonly today: string;
  readonly isPastDay: boolean;
  readonly activeLeague: LeagueId | null;
  readonly topPicks: ReadonlyArray<{ game: PlatformGame; pick: MatchPick }>;
  readonly valuePicks: ReadonlyArray<{ game: PlatformGame; pick: MatchPick }>;
}

/** Columna lateral editorial de Inicio: Centro de Parlays, Picks probables, Valor y Mi récord. */
export function HomeRightRail({
  visibleGames,
  allGames,
  selectedDay,
  today,
  isPastDay,
  activeLeague,
  topPicks,
  valuePicks,
}: HomeRightRailProps): React.JSX.Element {
  return (
    <aside aria-label="Centro de parlays, picks con mayor probabilidad y récord" className="pl-home-rail">
      <HomeParlayHubCard
        visibleGames={visibleGames}
        allGames={allGames}
        selectedDay={selectedDay}
        today={today}
        isPastDay={isPastDay}
        activeLeague={activeLeague}
      />
      <TopPicksRail items={topPicks} />
      <ValueRail items={valuePicks} />
      <LabRail />
    </aside>
  );
}
