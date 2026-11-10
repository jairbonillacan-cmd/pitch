"use client";

import React from "react";
import { ProbSplit, TeamBadge } from "../../sports.js";
import {
  formatOddsValue,
  getSessionWatermark,
  isPickUnlocked,
} from "../access-guard.js";
import { usePlatform } from "../platform-provider.js";
import type { MatchPick, PlatformGame } from "../types.js";

export function MultiPickRow({
  pick,
  gameStatus,
  compact = false,
}: {
  pick: MatchPick;
  gameStatus: "NS" | "FT" | "LIVE";
  compact?: boolean;
}): React.JSX.Element {
  const {
    viewerRole,
    oddsFormat,
    addPickToParlay,
    openComposer,
    openShareTicket,
    navigateTo,
  } = usePlatform();

  const unlocked = isPickUnlocked(pick, gameStatus, viewerRole);

  if (!unlocked) {
    return (
      <div
        className="rounded-xl p-3 flex flex-wrap items-center justify-between gap-3"
        style={{
          background: "var(--pl-surface)",
          border: "1px solid var(--pl-border)",
        }}
        data-locked-pick=""
      >
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="pl-pill">{pick.categoryLabel}</span>
            <span className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
              {pick.engineName}
            </span>
          </div>
          <div className="locked-redact text-sm font-bold" aria-hidden="true">
            Selección oculta · Línea calibrada Spacetime
          </div>
          <p className="m-0 text-xs font-semibold" style={{ color: "var(--pl-brand)" }}>
            🔒 Exclusivo Pase Total · Cero fuga pre-partido
          </p>
        </div>

        <a
          href="/signup"
          onClick={(e) => {
            e.preventDefault();
            navigateTo("/signup");
          }}
          className="pl-btn-accent text-xs min-h-8 px-3"
        >
          Desbloquear 7d gratis
        </a>
      </div>
    );
  }

  const riskBadgeClass =
    pick.risk === "conservador"
      ? "pl-pill pl-pill--success"
      : pick.risk === "arriesgado"
        ? "pl-pill pl-pill--warning"
        : "pl-pill pl-pill--brand";

  return (
    <div
      className="rounded-xl p-3.5 space-y-2.5 relative overflow-hidden"
      style={{
        background: "var(--pl-surface)",
        border: "1px solid var(--pl-border)",
      }}
      data-unlocked-pick={pick.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={riskBadgeClass}>{pick.categoryLabel}</span>
          {pick.isDailyOpenPromo ? (
            <span className="pl-pill pl-pill--info">Pick Abierto del Día</span>
          ) : null}
          {pick.isTipstarWeeklyOpen ? (
            <span className="pl-pill pl-pill--info">Pick Semanal @sofia_nfl</span>
          ) : null}
          {gameStatus === "FT" && pick.result ? (
            <span
              className={
                pick.result === "hit"
                  ? "pl-pill pl-pill--success"
                  : "pl-pill pl-pill--danger"
              }
            >
              {pick.result === "hit" ? "✓ Acertado" : "✕ Fallado"}
            </span>
          ) : null}
        </div>
        <span className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
          {pick.engineName}
        </span>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-base font-extrabold">{pick.label}</p>
          {!compact ? (
            <p className="m-0 mt-0.5 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
              {pick.rationale}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3 shrink-0 num">
          <div className="text-right">
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Probabilidad
            </span>
            <strong className="text-sm font-extrabold" style={{ color: "var(--pl-brand)" }}>
              {(pick.p * 100).toFixed(1)} %
            </strong>
          </div>
          <div className="text-right">
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Justa / Casa
            </span>
            <strong className="text-sm font-bold">
              {formatOddsValue(pick.fairDecimal, oddsFormat)} /{" "}
              {formatOddsValue(pick.marketDecimal, oddsFormat)}
            </strong>
          </div>
          <div className="text-right">
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Ventaja
            </span>
            <strong
              className="text-sm font-extrabold"
              style={{
                color: pick.edgePts >= 0 ? "var(--pl-success)" : "var(--pl-warning)",
              }}
            >
              {pick.edgePts >= 0 ? `+${pick.edgePts.toFixed(1)}` : pick.edgePts.toFixed(1)} pts
            </strong>
          </div>
        </div>
      </div>

      {gameStatus !== "FT" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
            Sugerencia calibrada: <strong>{pick.suggestedUnits.toFixed(2)}u</strong>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-8 px-2.5"
              onClick={() => addPickToParlay(pick)}
              data-add-parlay={pick.id}
            >
              + Parlay
            </button>
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-8 px-2.5"
              onClick={() => openComposer(pick)}
            >
              Sellar
            </button>
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-8 px-2.5"
              aria-label={`Compartir boleto de ${pick.label}`}
              onClick={() =>
                openShareTicket({
                  kind: pick.isTipstarWeeklyOpen ? "tipstar" : "pick",
                  title: pick.matchLabel,
                  subtitle: `${pick.leagueLabel} · ${pick.kickoffLocal}`,
                  leagueLabel: pick.leagueLabel,
                  pickLabel: pick.label,
                  probability: pick.p,
                  fairDecimal: pick.fairDecimal,
                  marketDecimal: pick.marketDecimal,
                  units: pick.suggestedUnits,
                  gameStatus,
                  promoCode: pick.isTipstarWeeklyOpen ? "SOFIA5" : undefined,
                })
              }
            >
              Boleto
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function MatchTicketCard({
  game,
  featured = false,
  onSelectGame,
}: {
  game: PlatformGame;
  featured?: boolean;
  onSelectGame?: (game: PlatformGame) => void;
}): React.JSX.Element {
  const {
    viewerRole,
    oddsFormat,
    setAuraFromGame,
    addPickToParlay,
    openComposer,
    navigateTo,
  } = usePlatform();

  const isNfl = game.sport === "american-football" || game.league === "nfl";
  const isFinished = game.status === "FT" && game.score !== undefined;
  const mainPick = game.picks[0];
  const unlockedMain = mainPick
    ? isPickUnlocked(mainPick, game.status, viewerRole)
    : false;
  const watermark = getSessionWatermark(viewerRole);
  const studioHref = `/app/${game.league}/games/${game.id}`;

  const [ph, pd, pa] = game.x12;
  const splitProbs = isNfl ? [ph, pa] : [ph, pd, pa];
  const splitLabels = isNfl
    ? [game.home.shortName, game.away.shortName]
    : [game.home.shortName, "Empate", game.away.shortName];

  const handleOpenStudio = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    setAuraFromGame(game);
    if (onSelectGame) {
      onSelectGame(game);
      return;
    }
    navigateTo(studioHref);
  };

  return (
    <article
      className={`glass-card glass-ring ${featured ? "glass-ring--featured" : ""} rounded-2xl p-4 flex flex-col justify-between gap-3 relative overflow-hidden hover-lift`}
      data-game-card={game.id}
      onMouseEnter={() => setAuraFromGame(game)}
    >
      <span className="pl-watermark num" aria-hidden="true">
        {watermark}
      </span>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-bold" style={{ color: "var(--pl-text-secondary)" }}>
            {game.leagueLabel} · {isFinished ? "Finalizado FT" : game.kickoffLocal}
          </span>
          {isFinished && mainPick?.result ? (
            <span
              className={
                mainPick.result === "hit"
                  ? "pl-pill pl-pill--success"
                  : "pl-pill pl-pill--danger"
              }
            >
              {mainPick.result === "hit" ? "Ganado" : "Perdido"}
            </span>
          ) : (
            <span className="pl-pill pl-pill--brand num">
              {game.picks.length} picks · Conf. {game.confidenceScore}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamBadge
                league={game.league}
                slug={game.home.slug}
                name={game.home.name}
                size={28}
              />
              <div className="min-w-0">
                <p className="m-0 text-sm font-bold truncate">{game.home.name}</p>
                <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {game.home.record}
                </span>
              </div>
            </div>
            <strong className="num text-base font-extrabold">
              {isFinished ? game.score?.home : `${(ph * 100).toFixed(1)} %`}
            </strong>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamBadge
                league={game.league}
                slug={game.away.slug}
                name={game.away.name}
                size={28}
              />
              <div className="min-w-0">
                <p className="m-0 text-sm font-bold truncate">{game.away.name}</p>
                <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {game.away.record}
                </span>
              </div>
            </div>
            <strong className="num text-base font-extrabold">
              {isFinished ? game.score?.away : `${(pa * 100).toFixed(1)} %`}
            </strong>
          </div>
        </div>

        <ProbSplit probabilities={splitProbs} labels={splitLabels} />

        <div className="ticket-perf" />

        {mainPick && unlockedMain ? (
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <span className="block font-bold uppercase tracking-wider" style={{ color: "var(--pl-brand)" }}>
                {mainPick.isDailyOpenPromo
                  ? "Pick Abierto del Día"
                  : mainPick.isTipstarWeeklyOpen
                    ? "Pick Semanal @sofia_nfl"
                    : "Pick Principal"}
              </span>
              <strong className="block text-sm truncate">{mainPick.label}</strong>
            </div>
            <div className="text-right num shrink-0">
              <strong className="block text-sm" style={{ color: "var(--pl-success)" }}>
                +{Math.max(0.8, mainPick.edgePts).toFixed(1)} pts
              </strong>
              <span style={{ color: "var(--pl-text-muted)" }}>
                {formatOddsValue(mainPick.marketDecimal, oddsFormat)}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 text-xs" data-card-locked="">
            <div>
              <span className="block font-bold" style={{ color: "var(--pl-brand)" }}>
                🔒 5 picks listos en Spacetime Suite
              </span>
              <span className="locked-redact block" aria-hidden="true">
                Pick Principal oculto
              </span>
            </div>
            <span className="pl-pill">Pase Total</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1 relative z-10">
        <a
          href={studioHref}
          onClick={handleOpenStudio}
          className="pl-btn-glass text-xs min-h-8 px-3"
        >
          Radiografía ({game.picks.length}) →
        </a>

        {!isFinished && mainPick && unlockedMain ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-8 px-2.5"
              onClick={() => addPickToParlay(mainPick)}
            >
              + Parlay
            </button>
            <button
              type="button"
              className="pl-btn-primary text-xs min-h-8 px-2.5"
              onClick={() => openComposer(mainPick)}
            >
              Sellar
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
