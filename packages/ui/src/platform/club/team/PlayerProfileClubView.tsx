"use client";

import React, { useState } from "react";
import { getTeamColors } from "@pitchlab/sports-assets";
import { LeagueBadge, TeamBadge, parseUserOdds } from "../../../sports";
import {
  CrestPedestal,
  LensGlowOrbs,
  MaestroIcon,
} from "../../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../../components/ShellChrome";
import { decimalToAmericanInt, formatOddsValue } from "../../access-guard";
import { evaluatePropLineProbability } from "../../match-picks-engine";
import { usePlatform } from "../../platform-provider";
import type { MatchPick } from "../../types";
import type { PlayerProfileData, TeamPlayerPick, TeamSquadPlayer } from "./types";

export interface PlayerProfileClubViewProps {
  profile: PlayerProfileData;
}

const POSITION_TITLE_ES: Readonly<Record<TeamSquadPlayer["positionGroup"], string>> = {
  GK: "Portero",
  DEF: "Defensa",
  MID: "Mediocampista",
  FWD: "Delantero",
};

interface StatCardTile {
  label: string;
  value: string;
  detail?: string;
}

function buildPlayerStatTiles(player: TeamSquadPlayer): StatCardTile[] {
  const { stats, positionGroup } = player;
  const starts = Math.max(0, stats.appearances - stats.subIns);
  if (positionGroup === "GK") {
    const savePct =
      stats.shotsFaced > 0 ? `${((stats.saves / stats.shotsFaced) * 100).toFixed(1)}%` : "—";
    return [
      {
        label: "Apariciones",
        value: `${stats.appearances}`,
        detail: `${starts} titular · ${stats.subIns} sup.`,
      },
      { label: "Atajadas", value: `${stats.saves}` },
      { label: "Tiros recibidos", value: `${stats.shotsFaced}`, detail: `Eficiencia: ${savePct}` },
      { label: "Goles concedidos", value: `${stats.goalsConceded}` },
      { label: "Faltas com. / suf.", value: `${stats.foulsCommitted} / ${stats.foulsSuffered}` },
      { label: "Tarjetas (TA / TR)", value: `${stats.yellowCards} / ${stats.redCards}` },
    ];
  }

  const accuracyPct =
    stats.shots > 0 ? `${((stats.shotsOnTarget / stats.shots) * 100).toFixed(0)}% al arco` : "Sin remates";
  return [
    {
      label: "Apariciones",
      value: `${stats.appearances}`,
      detail: `${starts} titular · ${stats.subIns} sup.`,
    },
    { label: "Goles", value: `${stats.goals}` },
    { label: "Asistencias", value: `${stats.assists}` },
    { label: "Tiros totales", value: `${stats.shots}`, detail: `${stats.shotsOnTarget} a puerta` },
    { label: "Precisión de tiro", value: accuracyPct },
    {
      label: "Disciplina",
      value: `${stats.yellowCards} TA · ${stats.redCards} TR`,
      detail: `Faltas ${stats.foulsCommitted}/${stats.foulsSuffered} · Off. ${stats.offsides}`,
    },
  ];
}

function PlayerInteractivePickCard({
  pick,
  profile,
  oddsFormat,
  journal,
  onAddParlay,
  onSealJournal,
}: {
  pick: TeamPlayerPick;
  profile: PlayerProfileData;
  oddsFormat: "american" | "decimal";
  journal: ReadonlyArray<{ pickId: string }>;
  onAddParlay: (pick: MatchPick) => boolean;
  onSealJournal: (pick: MatchPick, units: number, userDecimal: number, note?: string) => void;
}): React.JSX.Element {
  const defaultLine = pick.line ?? 0.5;
  const [lineValue, setLineValue] = useState<number>(defaultLine);
  const [customOddsRaw, setCustomOddsRaw] = useState<string>("");
  const [unitsInput, setUnitsInput] = useState<string>("1");
  const [addedToSlip, setAddedToSlip] = useState<boolean>(false);

  const hasModelDistribution = pick.projectionMean != null && pick.projectionSd != null;
  const minLine = 0.5;
  const maxLine = Math.max(defaultLine + 2, 3.5);

  const liveEval = hasModelDistribution
    ? evaluatePropLineProbability(pick.projectionMean!, pick.projectionSd!, lineValue)
    : null;

  const activeProb = liveEval ? liveEval.pOver : (pick.p ?? 0.5);
  const activeFairDec = liveEval ? liveEval.fairOverDecimal : (pick.fairDecimal ?? 2.0);
  const parsedCustom = customOddsRaw.trim() ? parseUserOdds(customOddsRaw) : null;
  const activeBookDec = parsedCustom && parsedCustom > 1.01 ? parsedCustom : activeFairDec;
  const edgePts = (activeProb - 1 / activeBookDec) * 100;

  const constructedPickId = `player-prop:${profile.league}:${profile.team.slug}:${profile.player.slug}:${pick.marketKey}:${lineValue.toFixed(1)}`;
  const inParlay = addedToSlip;
  const alreadySealed = journal.some((j) => j.pickId === constructedPickId);

  const buildMatchPick = (): MatchPick => {
    const fixture = profile.nextFixture;
    const matchLabel = fixture
      ? fixture.isHome
        ? `${fixture.opponent.shortName} @ ${profile.team.shortName}`
        : `${profile.team.shortName} @ ${fixture.opponent.shortName}`
      : `${profile.team.name} · ${profile.leagueLabel}`;
    const gameId =
      fixture?.id ?? `player:${profile.league}:${profile.team.slug}:${profile.player.slug}`;
    const kickoffLocal = fixture?.dateLabel ?? profile.seasonLabel;

    return {
      id: constructedPickId,
      gameId,
      league: profile.league,
      leagueLabel: profile.leagueLabel,
      matchLabel,
      kickoffLocal,
      gameStatus: "NS",
      slotIndex: 99,
      category: "valor",
      categoryLabel: `Jugador · ${pick.marketLabel}`,
      risk: activeProb >= 0.66 ? "conservador" : activeProb >= 0.52 ? "medio" : "arriesgado",
      engineKey: "tachyon",
      engineName: "Tachyon Player Lab",
      marketGroup: "Player Props",
      selectionKey: `over_${lineValue.toFixed(1)}`,
      conflictGroup: "independent",
      label: `${profile.player.name} · Más de ${lineValue.toFixed(1)} ${pick.marketLabel}`,
      rationale:
        pick.rationale ??
        `Proyección individual de ${profile.player.name} en ${profile.team.shortName}.`,
      p: activeProb,
      fairDecimal: activeFairDec,
      fairAmerican: decimalToAmericanInt(activeFairDec),
      marketDecimal: parsedCustom && parsedCustom > 1.01 ? parsedCustom : null,
      marketAmerican:
        parsedCustom && parsedCustom > 1.01 ? decimalToAmericanInt(parsedCustom) : null,
      edgePts: parsedCustom && parsedCustom > 1.01 ? edgePts : 0,
      confidenceScore: Math.round(Math.min(94, Math.max(54, activeProb * 100 + 6))),
      suggestedUnits: 1.0,
    };
  };

  return (
    <article
      className="rounded-2xl p-4 space-y-3"
      style={{
        background: "var(--pl-surface-elevated)",
        border: "1px solid var(--pl-border)",
      }}
      data-player-pick={pick.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <span
            className="text-[11px] font-bold uppercase tracking-wider"
            style={{ color: "var(--pl-brand)" }}
          >
            {pick.marketLabel}
          </span>
          <h3 className="m-0 text-sm sm:text-base font-extrabold">
            {hasModelDistribution
              ? `Más de ${lineValue.toFixed(1)} ${pick.marketLabel.toLowerCase()}`
              : pick.selectionLabel}
          </h3>
        </div>

        <div className="text-right">
          <div className="text-lg font-extrabold num" style={{ color: "var(--pl-text)" }}>
            {formatOddsValue(activeFairDec, oddsFormat)}
          </div>
          <div className="text-[11px] num" style={{ color: "var(--pl-text-muted)" }}>
            Momio justo · Prob. {(activeProb * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {hasModelDistribution ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label
              htmlFor={`line-slider-${pick.id}`}
              style={{ color: "var(--pl-text-muted)" }}
            >
              Ajustar línea evaluada ({lineValue.toFixed(1)})
            </label>
            <span className="num font-semibold" style={{ color: "var(--pl-text)" }}>
              Media proyectada: {pick.projectionMean!.toFixed(2)} ± {pick.projectionSd!.toFixed(2)}
            </span>
          </div>
          <input
            id={`line-slider-${pick.id}`}
            type="range"
            min={minLine}
            max={maxLine}
            step={0.5}
            value={lineValue}
            onChange={(e) => setLineValue(Number(e.target.value))}
            className="w-full accent-[var(--pl-brand)] cursor-pointer"
          />
        </div>
      ) : null}

      {pick.rationale ? (
        <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
          {pick.rationale}
        </p>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
        <div>
          <label
            htmlFor={`odds-input-${pick.id}`}
            className="block text-[11px] mb-1"
            style={{ color: "var(--pl-text-muted)" }}
          >
            Tu momio de casa (opcional, dec. o amer.)
          </label>
          <input
            id={`odds-input-${pick.id}`}
            type="text"
            value={customOddsRaw}
            onChange={(e) => setCustomOddsRaw(e.target.value)}
            placeholder={formatOddsValue(activeFairDec, oddsFormat)}
            className="w-full rounded-lg px-2.5 py-1.5 text-xs num outline-none"
            style={{
              background: "var(--pl-surface-soft)",
              border: "1px solid var(--pl-border)",
              color: "var(--pl-text)",
            }}
          />
        </div>

        <div>
          <label
            htmlFor={`units-input-${pick.id}`}
            className="block text-[11px] mb-1"
            style={{ color: "var(--pl-text-muted)" }}
          >
            Unidades para bitácora {parsedCustom ? `· Edge ${edgePts >= 0 ? "+" : ""}${edgePts.toFixed(1)} pts` : ""}
          </label>
          <input
            id={`units-input-${pick.id}`}
            type="number"
            min={0.25}
            max={10}
            step={0.25}
            value={unitsInput}
            onChange={(e) => setUnitsInput(e.target.value)}
            className="w-full rounded-lg px-2.5 py-1.5 text-xs num outline-none"
            style={{
              background: "var(--pl-surface-soft)",
              border: "1px solid var(--pl-border)",
              color: "var(--pl-text)",
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            const ok = onAddParlay(buildMatchPick());
            if (ok) setAddedToSlip(true);
          }}
          disabled={inParlay}
          className="pl-btn pl-btn--ghost px-3 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-60"
        >
          {inParlay ? "En tu boleto Parlay" : "Agregar al Parlay"}
        </button>

        <button
          type="button"
          onClick={() => {
            const units = Math.max(0.25, Math.min(10, Number(unitsInput) || 1));
            onSealJournal(
              buildMatchPick(),
              units,
              activeBookDec,
              `Jugador · Media ${pick.projectionMean?.toFixed(2) ?? "N/D"}`,
            );
          }}
          disabled={alreadySealed}
          className="pl-btn pl-btn--primary px-3 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-60"
        >
          {alreadySealed ? "Registrado en Bitácora" : "Registrar en Bitácora"}
        </button>
      </div>
    </article>
  );
}

export function PlayerProfileClubView({
  profile,
}: PlayerProfileClubViewProps): React.JSX.Element {
  const {
    viewerRole,
    oddsFormat,
    upgradeHref,
    journal,
    addPickToParlay,
    sealPickToJournal,
    navigateTo,
  } = usePlatform();

  const teamColors = getTeamColors(profile.league, profile.team.slug);
  const primaryColor = teamColors?.[0] ?? "var(--pl-aura-default-home)";
  const secondaryColor = teamColors?.[1] ?? "var(--pl-aura-default-away)";

  const leagueHref = `/app/${profile.league}`;
  const squadHref = `/app/${profile.league}/teams/${profile.team.slug}?tab=plantilla`;
  const teamHref = `/app/${profile.league}/teams/${profile.team.slug}`;
  const isVisitorRestricted = viewerRole === "visitor" || profile.picksLocked;

  const statTiles = buildPlayerStatTiles(profile.player);

  const navigateOnPlainClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigateTo(href);
  };

  return (
    <AtmosphereStage activePath={leagueHref}>
      <ClubWorkspaceShell activePath={leagueHref}>
        <div className="space-y-4">
          {/* Breadcrumb */}
          <nav aria-label="Ruta del jugador" className="flex flex-wrap items-center gap-2 text-xs">
            <a
              href={squadHref}
              onClick={(e) => navigateOnPlainClick(e, squadHref)}
              className="pl-team-link inline-flex items-center gap-1 font-semibold"
              style={{ color: "var(--pl-text-muted)" }}
            >
              <span>← Plantilla de {profile.team.shortName}</span>
            </a>
            <span aria-hidden="true" style={{ color: "var(--pl-text-muted)" }}>
              /
            </span>
            <a
              href={teamHref}
              onClick={(e) => navigateOnPlainClick(e, teamHref)}
              className="pl-team-link font-semibold"
              style={{ color: "var(--pl-text-muted)" }}
            >
              Resumen del club
            </a>
          </nav>

          {/* Hero del jugador */}
          <section
            className="glass-lens glass-ring rounded-3xl p-5 sm:p-6 relative overflow-hidden"
            data-team-hero="player"
          >
            <LensGlowOrbs primaryColor={primaryColor} secondaryColor={secondaryColor} />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="flex items-center gap-4 min-w-0">
                <CrestPedestal size="lg" glowColor={primaryColor}>
                  <TeamBadge
                    league={profile.league}
                    slug={profile.team.slug}
                    name={profile.team.name}
                    size={54}
                  />
                </CrestPedestal>

                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: "var(--pl-brand)" }}>
                      <LeagueBadge league={profile.league} size={15} />
                      <span>{profile.leagueLabel}</span>
                    </span>
                    <span className="pl-pill text-[11px] font-bold">
                      {POSITION_TITLE_ES[profile.player.positionGroup]}
                    </span>
                    {profile.player.jersey ? (
                      <span className="pl-pill num text-[11px] font-bold">
                        Dorsal {profile.player.jersey}
                      </span>
                    ) : null}
                  </div>

                  <h1 className="m-0 text-2xl sm:text-3xl font-black tracking-tight">
                    {profile.player.name}
                  </h1>

                  <p className="m-0 text-xs sm:text-sm" style={{ color: "var(--pl-text-muted)" }}>
                    {profile.team.name} · Temporada {profile.seasonLabel}
                    {profile.coachName ? ` · DT: ${profile.coachName}` : ""}
                  </p>
                </div>
              </div>

              {/* Bio física */}
              <dl className="pl-ctx-stats grid grid-cols-2 sm:grid-cols-4 gap-2 m-0 shrink-0">
                <div className="rounded-xl px-3 py-2 text-center">
                  <dt className="text-[10px] uppercase tracking-wider" style={{ color: "var(--pl-text-muted)" }}>
                    Edad
                  </dt>
                  <dd className="m-0 text-sm font-extrabold num">
                    {profile.player.age != null ? `${profile.player.age} años` : "—"}
                  </dd>
                </div>
                <div className="rounded-xl px-3 py-2 text-center">
                  <dt className="text-[10px] uppercase tracking-wider" style={{ color: "var(--pl-text-muted)" }}>
                    Estatura
                  </dt>
                  <dd className="m-0 text-sm font-extrabold num">
                    {profile.player.heightCm != null ? `${profile.player.heightCm} cm` : "—"}
                  </dd>
                </div>
                <div className="rounded-xl px-3 py-2 text-center">
                  <dt className="text-[10px] uppercase tracking-wider" style={{ color: "var(--pl-text-muted)" }}>
                    Peso
                  </dt>
                  <dd className="m-0 text-sm font-extrabold num">
                    {profile.player.weightKg != null ? `${profile.player.weightKg} kg` : "—"}
                  </dd>
                </div>
                <div className="rounded-xl px-3 py-2 text-center">
                  <dt className="text-[10px] uppercase tracking-wider" style={{ color: "var(--pl-text-muted)" }}>
                    País
                  </dt>
                  <dd className="m-0 text-sm font-extrabold truncate max-w-[110px]">
                    {profile.player.nationality ?? profile.player.nationalityCode ?? "—"}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Próximo compromiso si existe */}
          {profile.nextFixture ? (
            <section className="glass-card glass-ring rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--pl-brand)" }}>
                  Próximo partido aplicable
                </span>
                <p className="m-0 text-sm font-bold">
                  {profile.nextFixture.isHome ? "Local" : "Visita"} vs {profile.nextFixture.opponent.name} ·{" "}
                  <span className="num" style={{ color: "var(--pl-text-muted)" }}>
                    {profile.nextFixture.dateLabel}
                  </span>
                </p>
              </div>
              <a
                href={`/app/partido/${encodeURIComponent(profile.nextFixture.id)}`}
                onClick={(e) =>
                  navigateOnPlainClick(e, `/app/partido/${encodeURIComponent(profile.nextFixture!.id)}`)
                }
                className="pl-btn pl-btn--ghost px-3 py-1.5 text-xs font-semibold no-underline"
              >
                Abrir estudio del partido →
              </a>
            </section>
          ) : null}

          {/* Estadísticas de temporada */}
          <section
            className="glass-card glass-ring rounded-2xl p-5 space-y-3"
            aria-labelledby="player-stats-heading"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="player-stats-heading" className="m-0 text-base sm:text-lg font-extrabold">
                Estadísticas de temporada
              </h2>
              <span className="pl-pill text-xs">Actualizado: {profile.updatedAt}</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {statTiles.map((tile) => (
                <div
                  key={tile.label}
                  className="rounded-xl p-3 space-y-1"
                  style={{
                    background: "var(--pl-surface-elevated)",
                    border: "1px solid var(--pl-border)",
                  }}
                >
                  <div className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                    {tile.label}
                  </div>
                  <div className="text-lg font-black num">{tile.value}</div>
                  {tile.detail ? (
                    <div className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                      {tile.detail}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {/* Picks aplicables al jugador */}
          <section
            className="glass-card glass-ring rounded-2xl p-5 space-y-4"
            aria-labelledby="player-picks-heading"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="player-picks-heading" className="m-0 text-base sm:text-lg font-extrabold">
                  Picks individuales aplicables
                </h2>
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Evaluación de líneas ajustada por rol de titularidad, volumen por aparición y contexto del rival.
                </p>
              </div>
              <span className="pl-pill text-xs font-semibold">Tachyon Player Lab</span>
            </div>

            {isVisitorRestricted ? (
              <div
                className="rounded-2xl p-5 space-y-3"
                style={{
                  background: "var(--pl-surface-soft)",
                  border: "1px solid var(--pl-border)",
                }}
                data-cero-fuga-lock="player-picks"
              >
                <div className="inline-flex items-center gap-2 font-extrabold text-sm">
                  <MaestroIcon name="lock" size={16} style={{ color: "var(--pl-brand)" }} />
                  <span>Proyecciones y líneas reservadas para Pase PitchLab Ultra</span>
                </div>
                <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-muted)" }}>
                  Las líneas sugeridas, probabilidades calibradas, momios justos y registro directo en Bitácora
                  se habilitan con membresía activa.
                </p>
                <a
                  href={upgradeHref}
                  onClick={(e) => navigateOnPlainClick(e, upgradeHref)}
                  className="pl-btn pl-btn--primary inline-flex items-center gap-2 px-4 py-2 text-xs font-bold no-underline"
                >
                  Desbloquear con Pase Ultra
                </a>
              </div>
            ) : profile.player.candidatePicks.length === 0 ? (
              <div
                className="rounded-xl p-4 text-xs"
                style={{
                  background: "var(--pl-surface-soft)",
                  color: "var(--pl-text-muted)",
                }}
              >
                Muestra estadística todavía acotada (&lt; 3 apariciones o volumen debajo del umbral) para habilitar
                líneas individuales confiables en este torneo.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {profile.player.candidatePicks.map((pick) => (
                  <PlayerInteractivePickCard
                    key={pick.id}
                    pick={pick}
                    profile={profile}
                    oddsFormat={oddsFormat}
                    journal={journal}
                    onAddParlay={addPickToParlay}
                    onSealJournal={sealPickToJournal}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Compañeros de plantilla */}
          {profile.teammates.length > 0 ? (
            <section className="glass-card glass-ring rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="m-0 text-sm font-extrabold">
                  Más jugadores de {profile.team.shortName}
                </h2>
                <a
                  href={squadHref}
                  onClick={(e) => navigateOnPlainClick(e, squadHref)}
                  className="pl-team-link text-xs font-semibold"
                  style={{ color: "var(--pl-brand)" }}
                >
                  Ver plantilla completa →
                </a>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {profile.teammates.map((mate) => (
                  <a
                    key={mate.slug}
                    href={mate.href}
                    onClick={(e) => navigateOnPlainClick(e, mate.href)}
                    className="rounded-xl px-3 py-2 flex items-center justify-between gap-2 text-xs no-underline transition-colors"
                    style={{
                      background: "var(--pl-surface-elevated)",
                      border: "1px solid var(--pl-border)",
                      color: "var(--pl-text)",
                    }}
                  >
                    <span className="truncate font-semibold">{mate.shortName}</span>
                    <span className="pl-pill num text-[10px] px-1.5 py-0 shrink-0">
                      {mate.jersey ?? mate.positionGroup}
                    </span>
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
