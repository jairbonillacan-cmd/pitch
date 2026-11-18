"use client";

import React, { useState } from "react";
import { getTeamColors } from "@pitchlab/sports-assets";
import { LeagueBadge, TeamBadge, parseUserOdds } from "../../../sports";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../../components/ShellChrome";
import { decimalToAmericanInt, formatOddsValue } from "../../access-guard";
import { evaluatePropLineProbability } from "../../match-picks-engine";
import { usePlatform } from "../../platform-provider";
import {
  resolveThemedPackSrcSet,
  resolveThemedPackUrl,
  usePackIconBase,
} from "../../../pack-icon-theme";
import { resolveCircularCountryFlag } from "../../country-flags";
import type { MatchPick } from "../../types";
import { PersonAvatar } from "./PersonAvatar";
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

function buildPlayerStatTiles(
  player: TeamSquadPlayer,
  sport: PlayerProfileData["sport"],
): StatCardTile[] {
  const { stats, positionGroup } = player;
  if (sport !== "football" && stats.appearances === 0) {
    const statusText =
      player.availability === "injured"
        ? "Lesionado"
        : player.availability === "doubtful"
          ? "En duda"
          : player.availability === "suspended"
            ? "Suspendido"
            : "Activo";
    return [
      { label: "Dorsal", value: player.jersey ? `#${player.jersey}` : "—" },
      { label: "Demarcación", value: player.positionLabel || POSITION_TITLE_ES[positionGroup] },
      { label: "Estatura", value: player.heightCm != null ? `${player.heightCm} cm` : "—" },
      { label: "Peso", value: player.weightKg != null ? `${player.weightKg} kg` : "—" },
      { label: "Edad", value: player.age != null ? `${player.age} años` : "—" },
      { label: "Estado en nómina", value: statusText, detail: player.injuryDetail ?? undefined },
    ];
  }
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
        border: "1px solid var(--pl-row-rule)",
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

const PREFERRED_FOOT_ES: Readonly<Record<"R" | "L" | "B", string>> = {
  R: "Derecho",
  L: "Izquierdo",
  B: "Ambidiestro",
};

const MONTHS_ES_LONG = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

function formatBirthDateLongEs(iso?: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const monthIdx = Number(m[2]) - 1;
  const monthName = MONTHS_ES_LONG[monthIdx];
  if (!monthName) return null;
  return `${Number(m[3])} de ${monthName} de ${m[1]}`;
}

function formatCompactSlashDate(iso?: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  return `${Number(m[3])}/${Number(m[2])}/${m[1].slice(2)}`;
}

function BioGlyph({
  kind,
}: {
  kind: "cake" | "position" | "height" | "weight" | "foot" | "jersey";
}): React.JSX.Element {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
    className: "pl-player-bio-icon",
  };
  switch (kind) {
    case "cake":
      return (
        <svg {...common}>
          <path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" />
          <path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" />
          <path d="M2 21h20" />
          <path d="M12 11V7" />
          <path d="M12 4.5c.8 0 1.3-.6 1.3-1.3 0-.8-.8-1.5-1.3-2-.5.5-1.3 1.2-1.3 2 0 .7.5 1.3 1.3 1.3Z" />
        </svg>
      );
    case "position":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      );
    case "height":
      return (
        <svg {...common}>
          <circle cx="9" cy="5.5" r="2" />
          <path d="M9 10v10M6.5 13.5 9 10l2.5 3.5" />
          <path d="M17 4v16M15 6l2-2 2 2M15 18l2 2 2-2" />
        </svg>
      );
    case "weight":
      return (
        <svg {...common}>
          <path d="M6.5 8h11l1.5 12H5L6.5 8Z" />
          <path d="M9 8a3 3 0 0 1 6 0" />
        </svg>
      );
    case "foot":
      return (
        <svg {...common}>
          <path d="M5 18h14a2 2 0 0 0 2-2v-1c0-1.4-1-2.5-2.4-2.7l-3.4-.5-2.6-4.2A1.5 1.5 0 0 0 11.3 7H8a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2Z" />
          <path d="M8 18v2M12 18v2M16 18v2" />
        </svg>
      );
    case "jersey":
      return (
        <svg {...common}>
          <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23Z" />
        </svg>
      );
  }
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
  const iconBase = usePackIconBase();
  void getTeamColors;

  const leagueHref = `/app/${profile.league}`;
  const squadHref = `/app/${profile.league}/teams/${profile.team.slug}?tab=plantilla`;
  const teamHref = `/app/${profile.league}/teams/${profile.team.slug}`;
  const isVisitorRestricted = viewerRole === "visitor" || profile.picksLocked;

  const statTiles = buildPlayerStatTiles(profile.player, profile.sport);
  const birthDateLong = formatBirthDateLongEs(profile.player.birthDate);
  const birthAndAgeLabel =
    birthDateLong && profile.player.age != null
      ? `${birthDateLong} (${profile.player.age})`
      : birthDateLong
        ? birthDateLong
        : profile.player.age != null
          ? `${profile.player.age} años`
          : null;
  const footLabel = profile.player.preferredFoot
    ? PREFERRED_FOOT_ES[profile.player.preferredFoot]
    : null;
  const positionDisplay =
    profile.sport === "football"
      ? POSITION_TITLE_ES[profile.player.positionGroup]
      : profile.player.positionLabel || POSITION_TITLE_ES[profile.player.positionGroup];
  const activeCoach =
    profile.coach ?? (profile.coachName ? { name: profile.coachName } : null);
  const countryFlag = resolveCircularCountryFlag(
    profile.player.nationality,
    profile.player.nationalityCode,
  );
  const countryLabel = profile.player.nationality ?? profile.player.nationalityCode ?? null;

  const lastMatch = profile.lastMatch ?? null;
  const lastMatchSides = lastMatch
    ? (() => {
        const home = lastMatch.isHome
          ? {
              slug: profile.team.slug,
              name: profile.team.name,
              shortName: profile.team.shortName || profile.team.name,
              score: lastMatch.teamScore,
            }
          : {
              slug: lastMatch.opponent.slug,
              name: lastMatch.opponent.name,
              shortName: lastMatch.opponent.shortName || lastMatch.opponent.name,
              score: lastMatch.opponentScore,
            };
        const away = lastMatch.isHome
          ? {
              slug: lastMatch.opponent.slug,
              name: lastMatch.opponent.name,
              shortName: lastMatch.opponent.shortName || lastMatch.opponent.name,
              score: lastMatch.opponentScore,
            }
          : {
              slug: profile.team.slug,
              name: profile.team.name,
              shortName: profile.team.shortName || profile.team.name,
              score: lastMatch.teamScore,
            };
        return {
          home,
          away,
          homeWon: home.score > away.score,
          awayWon: away.score > home.score,
          whenTop: formatCompactSlashDate(lastMatch.date) ?? lastMatch.dateLabel,
          whenSub: lastMatch.resultNote ? "TE" : "FT",
        };
      })()
    : null;

  const nextUpcoming = profile.nextFixture ?? null;
  const nextMatchSides = nextUpcoming
    ? (() => {
        const canShowWinProb =
          !isVisitorRestricted &&
          !nextUpcoming.isRedacted &&
          nextUpcoming.hasForecast &&
          nextUpcoming.winProbability !== null;
        const teamWinPct = canShowWinProb
          ? `${Math.round(nextUpcoming.winProbability! * 100)}%`
          : null;
        const home = nextUpcoming.isHome
          ? {
              slug: profile.team.slug,
              name: profile.team.name,
              shortName: profile.team.shortName || profile.team.name,
              probLabel: teamWinPct,
            }
          : {
              slug: nextUpcoming.opponent.slug,
              name: nextUpcoming.opponent.name,
              shortName: nextUpcoming.opponent.shortName || nextUpcoming.opponent.name,
              probLabel: null,
            };
        const away = nextUpcoming.isHome
          ? {
              slug: nextUpcoming.opponent.slug,
              name: nextUpcoming.opponent.name,
              shortName: nextUpcoming.opponent.shortName || nextUpcoming.opponent.name,
              probLabel: null,
            }
          : {
              slug: profile.team.slug,
              name: profile.team.name,
              shortName: profile.team.shortName || profile.team.name,
              probLabel: teamWinPct,
            };
        return { home, away };
      })()
    : null;

  const hasHeroMatches = Boolean(lastMatchSides || nextMatchSides);

  const navigateOnPlainClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    navigateTo(href);
  };

  return (
    <AtmosphereStage activePath={leagueHref}>
      <ClubWorkspaceShell activePath={leagueHref}>
        {/* Ruta superior del jugador */}
        <nav aria-label="Ruta del jugador" className="pl-team-crumb">
          <ol className="pl-team-crumb-list">
            <li>
              <a
                href={leagueHref}
                onClick={(e) => navigateOnPlainClick(e, leagueHref)}
                className="pl-team-crumb-link"
              >
                {profile.leagueLabel}
              </a>
            </li>
            <li aria-hidden="true" className="pl-team-crumb-sep">
              ▸
            </li>
            <li>
              <a
                href={teamHref}
                onClick={(e) => navigateOnPlainClick(e, teamHref)}
                className="pl-team-crumb-link"
              >
                {profile.team.name}
              </a>
            </li>
            <li aria-hidden="true" className="pl-team-crumb-sep">
              ▸
            </li>
            <li>
              <a
                href={squadHref}
                onClick={(e) => navigateOnPlainClick(e, squadHref)}
                className="pl-team-crumb-link"
              >
                Plantilla
              </a>
            </li>
            <li aria-hidden="true" className="pl-team-crumb-sep hidden sm:inline">
              ▸
            </li>
            <li aria-current="page" className="pl-team-crumb-current hidden sm:inline truncate">
              {profile.player.name}
            </li>
          </ol>
        </nav>

        <div className="space-y-4">
          {/* Hero editorial del jugador: retrato limpio + club + partido anterior/siguiente + tira bio inferior */}
          <section
            className="pl-player-hero glass-card glass-ring rounded-3xl p-5 sm:p-6"
            data-team-hero="player"
          >
            <div className={`pl-player-hero-top ${hasHeroMatches ? "has-matches" : ""}`.trim()}>
              <div className="pl-player-hero-identity">
                <PersonAvatar
                  photoKey={profile.player.photoKey}
                  fallbackPhotoKey={profile.player.fallbackPhotoKey}
                  role="player"
                  size={84}
                  priority
                  className="pl-player-hero-avatar"
                />

                <div className="pl-player-hero-copy">
                  <h1 className="pl-player-hero-title">
                    {profile.player.name}
                  </h1>

                  <div className="pl-player-hero-club">
                    <a
                      href={teamHref}
                      onClick={(e) => navigateOnPlainClick(e, teamHref)}
                      className="pl-player-hero-club-link"
                    >
                      <TeamBadge
                        league={profile.league}
                        slug={profile.team.slug}
                        name={profile.team.name}
                        size={28}
                      />
                      <span className="pl-player-hero-club-copy">
                        <strong>{profile.team.name}</strong>
                        <small>
                          {profile.leagueLabel} · {profile.seasonLabel}
                          {activeCoach
                            ? ` · ${profile.sport === "football" ? "DT" : "Entrenador"}: ${activeCoach.name}`
                            : ""}
                        </small>
                      </span>
                    </a>
                  </div>

                  {profile.player.availability && profile.player.availability !== "available" ? (
                    <div className="pl-sq-injury">
                      <strong className="pl-sq-injury-status">
                        {profile.player.availability === "suspended"
                          ? "Suspendido"
                          : profile.player.availability === "doubtful"
                            ? "En duda"
                            : "Lesionado"}
                      </strong>
                      {profile.player.injuryDetail ? (
                        <span className="pl-sq-injury-detail">· {profile.player.injuryDetail}</span>
                      ) : null}
                      {profile.player.expectedReturn ? (
                        <span className="pl-sq-injury-detail num">
                          (regreso est. {profile.player.expectedReturn})
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              {hasHeroMatches ? (
                <div className="pl-team-hero-matches">
                  <div className="pl-team-mini-col">
                    <span className="pl-team-mini-heading">Partido anterior</span>
                    {lastMatch && lastMatchSides ? (
                      lastMatch.gameHref ? (
                        <a
                          href={lastMatch.gameHref}
                          onClick={(e) => navigateOnPlainClick(e, lastMatch.gameHref!)}
                          className="pl-team-mini-card is-link"
                          aria-label={`Partido anterior: ${lastMatchSides.home.shortName} ${lastMatchSides.home.score} - ${lastMatchSides.away.score} ${lastMatchSides.away.shortName}`}
                        >
                          <div className="pl-team-mini-head">
                            <LeagueBadge league={profile.league} label={profile.leagueLabel} size={15} />
                            <span className="truncate">{profile.leagueLabel}</span>
                          </div>
                          <div className="pl-team-mini-body">
                            <div className="pl-team-mini-when num">
                              <span>{lastMatchSides.whenTop}</span>
                              <strong>{lastMatchSides.whenSub}</strong>
                            </div>
                            <div className="pl-team-mini-teams">
                              <div className="pl-team-mini-team">
                                <TeamBadge
                                  league={profile.league}
                                  slug={lastMatchSides.home.slug}
                                  name={lastMatchSides.home.name}
                                  size={18}
                                />
                                <span className={`truncate ${lastMatchSides.homeWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.home.shortName}
                                </span>
                                <strong className={`num ${lastMatchSides.homeWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.home.score}
                                </strong>
                              </div>
                              <div className="pl-team-mini-team">
                                <TeamBadge
                                  league={profile.league}
                                  slug={lastMatchSides.away.slug}
                                  name={lastMatchSides.away.name}
                                  size={18}
                                />
                                <span className={`truncate ${lastMatchSides.awayWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.away.shortName}
                                </span>
                                <strong className={`num ${lastMatchSides.awayWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.away.score}
                                </strong>
                              </div>
                            </div>
                          </div>
                        </a>
                      ) : (
                        <div className="pl-team-mini-card">
                          <div className="pl-team-mini-head">
                            <LeagueBadge league={profile.league} label={profile.leagueLabel} size={15} />
                            <span className="truncate">{profile.leagueLabel}</span>
                          </div>
                          <div className="pl-team-mini-body">
                            <div className="pl-team-mini-when num">
                              <span>{lastMatchSides.whenTop}</span>
                              <strong>{lastMatchSides.whenSub}</strong>
                            </div>
                            <div className="pl-team-mini-teams">
                              <div className="pl-team-mini-team">
                                <TeamBadge
                                  league={profile.league}
                                  slug={lastMatchSides.home.slug}
                                  name={lastMatchSides.home.name}
                                  size={18}
                                />
                                <span className={`truncate ${lastMatchSides.homeWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.home.shortName}
                                </span>
                                <strong className={`num ${lastMatchSides.homeWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.home.score}
                                </strong>
                              </div>
                              <div className="pl-team-mini-team">
                                <TeamBadge
                                  league={profile.league}
                                  slug={lastMatchSides.away.slug}
                                  name={lastMatchSides.away.name}
                                  size={18}
                                />
                                <span className={`truncate ${lastMatchSides.awayWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.away.shortName}
                                </span>
                                <strong className={`num ${lastMatchSides.awayWon ? "is-strong" : "is-dim"}`}>
                                  {lastMatchSides.away.score}
                                </strong>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="pl-team-mini-card is-empty">
                        <span>Sin resultado reciente</span>
                      </div>
                    )}
                  </div>

                  <div className="pl-team-mini-col">
                    <span className="pl-team-mini-heading">Partido siguiente</span>
                    {nextUpcoming && nextMatchSides ? (
                      <a
                        href={nextUpcoming.gameHref}
                        onClick={(e) => navigateOnPlainClick(e, nextUpcoming.gameHref)}
                        className="pl-team-mini-card is-link"
                        aria-label={`Partido siguiente: ${nextMatchSides.home.shortName} contra ${nextMatchSides.away.shortName}, ${nextUpcoming.dateLabel} ${nextUpcoming.kickoffLocal}`}
                      >
                        <div className="pl-team-mini-head">
                          <LeagueBadge league={profile.league} label={profile.leagueLabel} size={15} />
                          <span className="truncate">{profile.leagueLabel}</span>
                        </div>
                        <div className="pl-team-mini-body">
                          <div className="pl-team-mini-when num">
                            <span>{nextUpcoming.dateLabel}</span>
                            <strong>{nextUpcoming.kickoffLocal}</strong>
                          </div>
                          <div className="pl-team-mini-teams">
                            <div className="pl-team-mini-team">
                              <TeamBadge
                                league={profile.league}
                                slug={nextMatchSides.home.slug}
                                name={nextMatchSides.home.name}
                                size={18}
                              />
                              <span className="truncate is-strong">
                                {nextMatchSides.home.shortName}
                              </span>
                              {nextMatchSides.home.probLabel ? (
                                <span className="pl-team-mini-prob num">{nextMatchSides.home.probLabel}</span>
                              ) : null}
                            </div>
                            <div className="pl-team-mini-team">
                              <TeamBadge
                                league={profile.league}
                                slug={nextMatchSides.away.slug}
                                name={nextMatchSides.away.name}
                                size={18}
                              />
                              <span className="truncate is-strong">
                                {nextMatchSides.away.shortName}
                              </span>
                              {nextMatchSides.away.probLabel ? (
                                <span className="pl-team-mini-prob num">{nextMatchSides.away.probLabel}</span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </a>
                    ) : (
                      <div className="pl-team-mini-card is-empty">
                        <span>Sin próximo partido</span>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Tira bio horizontal limpia (país, fecha + edad, posición, estatura, peso, pie hábil y dorsal) */}
            <ul className="pl-player-bio-strip" aria-label="Datos biográficos del jugador">
              {countryLabel ? (
                <li className="pl-player-bio-item">
                  {countryFlag ? (
                    <img
                      src={resolveThemedPackUrl(countryFlag.src, iconBase)}
                      srcSet={resolveThemedPackSrcSet(countryFlag.srcSet, iconBase)}
                      alt=""
                      aria-hidden="true"
                      width={17}
                      height={17}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="pl-team-country-flag shrink-0"
                      style={{ width: 17, height: 17 }}
                    />
                  ) : (
                    <MaestroIcon name="globe" size={15} className="pl-player-bio-icon" />
                  )}
                  <span>{countryLabel}</span>
                </li>
              ) : null}

              {birthAndAgeLabel ? (
                <li className="pl-player-bio-item num">
                  <BioGlyph kind="cake" />
                  <span>{birthAndAgeLabel}</span>
                </li>
              ) : null}

              {positionDisplay ? (
                <li className="pl-player-bio-item">
                  <BioGlyph kind="position" />
                  <span>{positionDisplay}</span>
                </li>
              ) : null}

              {profile.player.heightCm != null ? (
                <li className="pl-player-bio-item num">
                  <BioGlyph kind="height" />
                  <span>{profile.player.heightCm} cm</span>
                </li>
              ) : null}

              {profile.player.weightKg != null ? (
                <li className="pl-player-bio-item num">
                  <BioGlyph kind="weight" />
                  <span>{profile.player.weightKg} kg</span>
                </li>
              ) : null}

              {footLabel ? (
                <li className="pl-player-bio-item">
                  <BioGlyph kind="foot" />
                  <span>{footLabel}</span>
                </li>
              ) : null}

              {profile.player.jersey ? (
                <li className="pl-player-bio-item num">
                  <BioGlyph kind="jersey" />
                  <span>Número {profile.player.jersey}</span>
                </li>
              ) : null}
            </ul>
          </section>

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
                    border: "1px solid var(--pl-row-rule)",
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
                      border: "1px solid var(--pl-row-rule)",
                      color: "var(--pl-text)",
                    }}
                  >
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <PersonAvatar
                        photoKey={mate.photoKey}
                        fallbackPhotoKey={mate.fallbackPhotoKey}
                        role="player"
                        size={26}
                      />
                      <span className="truncate font-semibold">{mate.shortName}</span>
                    </span>
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
