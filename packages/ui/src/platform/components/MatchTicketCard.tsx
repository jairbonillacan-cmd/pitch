"use client";

import React from "react";
import { getTeamColors } from "@pitchlab/sports-assets";
import { LeagueBadge, ProbSplit, TeamBadge } from "../../sports.js";
import {
  formatEdgePts,
  formatOddsValue,
  getSessionWatermark,
  isPickUnlocked,
  pickReferenceDecimal,
} from "../access-guard.js";
import { usePlatform } from "../platform-provider.js";
import type { MatchPick, PlatformGame } from "../types.js";
import {
  CrestPedestal,
  LensGlowOrbs,
  MaestroIcon,
} from "./MaestroPrimitives.js";

export function MultiPickRow({
  pick,
  gameStatus,
  compact = false,
  userDecimalOverride = null,
}: {
  pick: MatchPick;
  gameStatus: "NS" | "FT" | "LIVE";
  compact?: boolean;
  userDecimalOverride?: number | null;
}): React.JSX.Element {
  const {
    viewerRole,
    oddsFormat,
    parlayLegs,
    journal,
    addPickToParlay,
    openComposer,
    openShareTicket,
    navigateTo,
  } = usePlatform();

  const unlocked = isPickUnlocked(pick, gameStatus, viewerRole);

  if (!unlocked) {
    return (
      <div
        className="rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 hairline-t"
        style={{
          background: "var(--pl-surface)",
        }}
        data-locked-pick=""
      >
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="pl-pill">{pick.categoryLabel}</span>
            <span
              className="inline-flex items-center gap-1 text-xs font-semibold"
              style={{ color: "var(--pl-text-muted)" }}
            >
              <MaestroIcon name="cpu" size={12} />
              <span>{pick.engineName}</span>
            </span>
          </div>
          <div className="locked-redact text-sm font-bold" aria-hidden="true">
            Selección oculta · Línea calibrada Spacetime
          </div>
          <p
            className="m-0 text-xs font-semibold inline-flex items-center gap-1.5"
            style={{ color: "var(--pl-brand)" }}
          >
            <MaestroIcon name="lock" size={12} />
            <span>Exclusivo Pase Total · Cero fuga pre-partido</span>
          </p>
        </div>

        <a
          href="/signup"
          onClick={(e) => {
            e.preventDefault();
            navigateTo("/signup");
          }}
          className="pl-btn-accent text-xs min-h-8 px-3 inline-flex items-center gap-1.5"
        >
          <MaestroIcon name="unlock" size={13} />
          <span>Desbloquear 7d gratis</span>
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

  const inParlay = parlayLegs.some((l) => l.pick.id === pick.id);
  const isSealed = journal.some((j) => j.pickId === pick.id);

  const hasLiveUserOdds =
    typeof userDecimalOverride === "number" &&
    Number.isFinite(userDecimalOverride) &&
    userDecimalOverride > 1;
  const effectiveMarketDecimal = hasLiveUserOdds
    ? userDecimalOverride
    : pick.marketDecimal;
  const effectiveEdgePts = hasLiveUserOdds
    ? (pick.p - 1 / userDecimalOverride) * 100
    : pick.edgePts;

  return (
    <div
      className="rounded-2xl p-3.5 space-y-2.5 relative overflow-hidden"
      style={{
        background: "var(--pl-surface)",
      }}
      data-unlocked-pick={pick.id}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={riskBadgeClass}>{pick.categoryLabel}</span>
          {pick.isDailyOpenPromo ? (
            <span className="pl-pill pl-pill--info inline-flex items-center gap-1">
              <MaestroIcon name="sparkles" size={11} />
              <span>Pick Abierto del Día</span>
            </span>
          ) : null}
          {pick.isTipstarWeeklyOpen ? (
            <span className="pl-pill pl-pill--info inline-flex items-center gap-1">
              <MaestroIcon name="crown" size={11} />
              <span>Pick Semanal @sofia_nfl</span>
            </span>
          ) : null}
          {gameStatus === "FT" && pick.result ? (
            <span
              className={`inline-flex items-center gap-1 ${
                pick.result === "hit"
                  ? "pl-pill pl-pill--success"
                  : "pl-pill pl-pill--danger"
              }`}
            >
              <MaestroIcon name={pick.result === "hit" ? "check" : "x"} size={11} />
              <span>{pick.result === "hit" ? "Acertado" : "Fallado"}</span>
            </span>
          ) : null}
        </div>
        <span
          className="inline-flex items-center gap-1 text-xs font-semibold"
          style={{ color: "var(--pl-text-muted)" }}
        >
          <MaestroIcon name="cpu" size={12} />
          <span>{pick.engineName}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-base font-extrabold">{pick.label}</p>
          {!compact ? (
            <p
              className="m-0 mt-0.5 text-xs leading-relaxed"
              style={{ color: "var(--pl-text-secondary)" }}
            >
              {pick.rationale}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-3.5 shrink-0 num">
          <div className="text-right">
            <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
              Probabilidad
            </span>
            <strong className="text-sm font-extrabold" style={{ color: "var(--pl-brand)" }}>
              {(pick.p * 100).toFixed(1)} %
            </strong>
          </div>
          <div className="text-right">
            <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
              {hasLiveUserOdds ? "Justa / Tu momio" : effectiveMarketDecimal === null ? "Momio justo" : "Justa / Casa"}
            </span>
            <strong className="text-sm font-bold">
              {formatOddsValue(pick.fairDecimal, oddsFormat)}
              {effectiveMarketDecimal === null ? null : (
                <> / {formatOddsValue(effectiveMarketDecimal, oddsFormat)}</>
              )}
            </strong>
          </div>
          <div className="text-right">
            <span className="block text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
              {hasLiveUserOdds ? "Tu ventaja" : "Ventaja"}
            </span>
            <strong
              className="text-sm font-extrabold"
              style={{
                color:
                  effectiveEdgePts === null
                    ? "var(--pl-text-muted)"
                    : effectiveEdgePts >= 0
                      ? "var(--pl-success)"
                      : "var(--pl-warning)",
              }}
            >
              {formatEdgePts(effectiveEdgePts)}
            </strong>
          </div>
        </div>
      </div>

      {gameStatus !== "FT" ? (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 hairline-t">
          <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
            Sugerencia calibrada: <strong>{pick.suggestedUnits.toFixed(2)}u</strong>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-8 px-2.5 inline-flex items-center gap-1"
              onClick={() => addPickToParlay(pick)}
              data-add-parlay={pick.id}
            >
              <MaestroIcon name={inParlay ? "check" : "plus"} size={12} />
              <span>{inParlay ? "En Parlay" : "+ Parlay"}</span>
            </button>
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-8 px-2.5 inline-flex items-center gap-1"
              onClick={() => openComposer(pick)}
            >
              <MaestroIcon name={isSealed ? "check" : "ticket"} size={12} />
              <span>{isSealed ? "Sellado" : "Sellar"}</span>
            </button>
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-8 px-2.5 inline-flex items-center gap-1"
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
                  marketDecimal: effectiveMarketDecimal ?? pick.fairDecimal,
                  units: pick.suggestedUnits,
                  gameStatus,
                  promoCode: pick.isTipstarWeeklyOpen ? "SOFIA5" : undefined,
                })
              }
            >
              <MaestroIcon name="share" size={12} />
              <span>Boleto</span>
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
    parlayLegs,
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

  const homeColors = getTeamColors(game.league, game.home.slug);
  const awayColors = getTeamColors(game.league, game.away.slug);
  const homePrimary = homeColors?.[0] ?? "var(--pl-aura-default-home)";
  const awayPrimary = awayColors?.[0] ?? "var(--pl-aura-default-away)";

  const [ph, pd, pa] = game.x12;
  const splitProbs = isNfl ? [ph, pa] : [ph, pd, pa];
  const splitLabels = isNfl
    ? [game.home.shortName, game.away.shortName]
    : [game.home.shortName, "Empate", game.away.shortName];

  const inParlay = mainPick
    ? parlayLegs.some((l) => l.pick.id === mainPick.id)
    : false;

  const shortEngineLabel = mainPick
    ? mainPick.engineName.replace("PitchLab ", "")
    : isNfl
      ? "Minkowski v3.0"
      : "Tachyon v3.0";

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
      className={`${
        featured ? "glass-lens glass-ring glass-ring--featured" : "glass-card glass-ring"
      } rounded-2xl p-4 flex flex-col justify-between gap-3.5 relative overflow-hidden hover-lift`}
      data-game-card={game.id}
      onMouseEnter={() => setAuraFromGame(game)}
    >
      {featured ? (
        <LensGlowOrbs
          primaryColor={homePrimary}
          secondaryColor={awayPrimary}
          subtle
        />
      ) : null}

      <span className="pl-watermark num" aria-hidden="true">
        {watermark}
      </span>

      <div className="space-y-3 relative z-10">
        {/* Meta de liga, motor y nivel de confianza */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
          <span
            className="inline-flex items-center gap-1.5 font-bold min-w-0 truncate"
            style={{ color: "var(--pl-text-secondary)" }}
          >
            <LeagueBadge league={game.league} label={game.leagueLabel} size={15} />
            <span className="truncate">
              {game.leagueLabel} · {isFinished ? "Finalizado FT" : game.kickoffLocal}
            </span>
          </span>

          <div className="flex items-center gap-1 shrink-0">
            <span className="pl-pill text-[10px] inline-flex items-center gap-1">
              <MaestroIcon name="cpu" size={11} />
              <span>{shortEngineLabel}</span>
            </span>
            {isFinished && mainPick?.result ? (
              <span
                className={`inline-flex items-center gap-1 ${
                  mainPick.result === "hit"
                    ? "pl-pill pl-pill--success"
                    : "pl-pill pl-pill--danger"
                }`}
              >
                <MaestroIcon name={mainPick.result === "hit" ? "check" : "x"} size={11} />
                <span>{mainPick.result === "hit" ? "Ganado" : "Perdido"}</span>
              </span>
            ) : (
              <span className="pl-pill pl-pill--brand num text-[10px]">
                Conf. {game.confidenceScore}
              </span>
            )}
          </div>
        </div>

        {/* Equipos con CrestPedestal y marcador proyectado */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <CrestPedestal size="sm" glowColor={homePrimary}>
                <TeamBadge
                  league={game.league}
                  slug={game.home.slug}
                  name={game.home.name}
                  size={24}
                />
              </CrestPedestal>
              <div className="min-w-0">
                <p className="m-0 text-sm font-bold truncate">{game.home.name}</p>
                <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {game.home.record}
                </span>
              </div>
            </div>
            <strong className="num text-base font-extrabold shrink-0">
              {isFinished ? game.score?.home : `${(ph * 100).toFixed(1)} %`}
            </strong>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <CrestPedestal size="sm" glowColor={awayPrimary}>
                <TeamBadge
                  league={game.league}
                  slug={game.away.slug}
                  name={game.away.name}
                  size={24}
                />
              </CrestPedestal>
              <div className="min-w-0">
                <p className="m-0 text-sm font-bold truncate">{game.away.name}</p>
                <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {game.away.record}
                </span>
              </div>
            </div>
            <strong className="num text-base font-extrabold shrink-0">
              {isFinished ? game.score?.away : `${(pa * 100).toFixed(1)} %`}
            </strong>
          </div>
        </div>

        {/* Pill de marcador proyectado + barra de probabilidad */}
        <div className="space-y-2">
          {!isFinished ? (
            <div className="flex items-center justify-between gap-2 text-xs num">
              {unlockedMain ? (
                <span className="pl-pill pl-pill--info inline-flex items-center gap-1">
                  <MaestroIcon name="sparkles" size={11} />
                  <span>
                    Proy. {game.projection.home.toFixed(isNfl ? 1 : 2)} –{" "}
                    {game.projection.away.toFixed(isNfl ? 1 : 2)}
                  </span>
                </span>
              ) : (
                <span className="pl-pill inline-flex items-center gap-1">
                  <MaestroIcon name="lock" size={11} />
                  <span>Proy. reservada</span>
                </span>
              )}
              <span style={{ color: "var(--pl-text-muted)" }}>
                {game.picks.length} picks calibrados
              </span>
            </div>
          ) : null}

          <ProbSplit probabilities={splitProbs} labels={splitLabels} />
        </div>

        <div className="ticket-perf" />

        {mainPick && unlockedMain ? (
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="min-w-0">
              <span
                className="block font-bold uppercase tracking-wider text-[10px]"
                style={{ color: "var(--pl-brand)" }}
              >
                {mainPick.isDailyOpenPromo
                  ? "Pick Abierto del Día"
                  : mainPick.isTipstarWeeklyOpen
                    ? "Pick Semanal @sofia_nfl"
                    : "Pick Principal"}
              </span>
              <strong className="block text-sm truncate">{mainPick.label}</strong>
            </div>
            <div className="text-right num shrink-0">
              <strong
                className="block text-sm"
                style={{
                  color:
                    mainPick.edgePts !== null && mainPick.edgePts >= 0
                      ? "var(--pl-success)"
                      : "var(--pl-text-muted)",
                }}
              >
                {formatEdgePts(mainPick.edgePts)}
              </strong>
              <span style={{ color: "var(--pl-text-muted)" }}>
                {formatOddsValue(pickReferenceDecimal(mainPick), oddsFormat)}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 text-xs" data-card-locked="">
            <div className="min-w-0">
              <span
                className="inline-flex items-center gap-1.5 font-bold"
                style={{ color: "var(--pl-brand)" }}
              >
                <MaestroIcon name="lock" size={12} />
                <span>5 picks listos en Spacetime Suite</span>
              </span>
              <span className="locked-redact block mt-0.5" aria-hidden="true">
                Pick Principal oculto
              </span>
            </div>
            <span className="pl-pill shrink-0">Pase Total</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-1.5 hairline-t relative z-10">
        <a
          href={studioHref}
          onClick={handleOpenStudio}
          className="pl-btn-glass text-xs min-h-8 px-3 inline-flex items-center gap-1.5"
        >
          <span>Radiografía ({game.picks.length})</span>
          <MaestroIcon name="arrowRight" size={13} />
        </a>

        {!isFinished && mainPick && unlockedMain ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="pl-btn-glass text-xs min-h-8 px-2.5 inline-flex items-center gap-1"
              onClick={() => addPickToParlay(mainPick)}
            >
              <MaestroIcon name={inParlay ? "check" : "plus"} size={12} />
              <span>{inParlay ? "En Parlay" : "+ Parlay"}</span>
            </button>
            <button
              type="button"
              className="pl-btn-primary text-xs min-h-8 px-2.5 inline-flex items-center gap-1"
              onClick={() => openComposer(mainPick)}
            >
              <MaestroIcon name="ticket" size={12} />
              <span>Sellar</span>
            </button>
          </div>
        ) : !isFinished && !unlockedMain ? (
          <a
            href="/signup"
            onClick={(e) => {
              e.preventDefault();
              navigateTo("/signup");
            }}
            className="pl-btn-accent text-xs min-h-8 px-2.5 inline-flex items-center gap-1"
          >
            <MaestroIcon name="unlock" size={12} />
            <span>7d gratis</span>
          </a>
        ) : null}
      </div>
    </article>
  );
}
