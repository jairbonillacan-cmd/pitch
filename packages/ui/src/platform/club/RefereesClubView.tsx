"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { isSafePublicLabel } from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreFilterBar,
  SofascoreKpiStrip,
  SofascoreTable,
  SofascoreTabs,
  type SofascoreKpiItem,
  type SofascoreTabItem,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";
import { LeagueBadge } from "../../sports";
import { useOptionalPlatformActions } from "../platform-provider";
import { runWithViewTransition } from "../navigation-helpers";
import { MaestroIcon } from "../components/MaestroPrimitives";

export type RefereeProfileTier = "estricto" | "promedio" | "permisivo";

export interface RefereeLastMatchSummaryData {
  readonly matchSlug: string;
  readonly league: string;
  readonly leagueLabel: string;
  readonly dateIso: string;
  readonly dateLabel: string;
  readonly round: string | null;
  readonly homeTeam: string;
  readonly awayTeam: string;
  readonly homeSlug: string;
  readonly awaySlug: string;
  readonly score: { readonly home: number; readonly away: number } | null;
  readonly status: "NS" | "LIVE" | "FT";
  readonly href: string;
}

export interface RefereeNextAssignmentData {
  readonly matchSlug: string;
  readonly league: string;
  readonly leagueLabel: string;
  readonly kickoffUtc: string;
  readonly dateLabel: string;
  readonly round: string | null;
  readonly venue: string | null;
  readonly homeTeam: string;
  readonly homeSlug: string;
  readonly awayTeam: string;
  readonly awaySlug: string;
  readonly status: "NS" | "LIVE";
  readonly href: string;
}

export interface LeagueRefereeRankingItemData {
  readonly slug: string;
  readonly name: string;
  readonly country: string | null;
  readonly league: string;
  readonly leagueLabel: string;
  readonly href: string;
  readonly matches: number;
  readonly sampleGamesObserved: number;
  readonly avgYellow: number | null;
  readonly ebYellow: number | null;
  readonly avgRed: number | null;
  readonly ebRed: number | null;
  readonly avgPenalties: number | null;
  readonly ebPenalties: number | null;
  readonly avgFouls: number | null;
  readonly avgGoals: number | null;
  readonly leagueMeanYellow: number;
  readonly leagueMeanRed: number;
  readonly leagueMeanPenalties: number;
  readonly tier: RefereeProfileTier;
  readonly tierLabel: string;
  readonly rigorPercentile: number;
  readonly rank: number;
  readonly totalInLeague: number;
  readonly lastMatch: RefereeLastMatchSummaryData | null;
  readonly nextAssignment: RefereeNextAssignmentData | null;
}

export interface LeagueRefereeRankingData {
  readonly league: string;
  readonly leagueLabel: string;
  readonly season: string;
  readonly updatedAt: string;
  readonly kappa: number;
  readonly leagueMeanYellow: number;
  readonly leagueMeanRed: number;
  readonly leagueMeanPenalties: number;
  readonly totalReferees: number;
  readonly referees: readonly LeagueRefereeRankingItemData[];
}

export interface RefereeCompetitionBreakdownData {
  readonly league: string;
  readonly leagueLabel: string;
  readonly matchesObserved: number;
  readonly sampleMatches: number;
  readonly avgYellow: number | null;
  readonly ebYellow: number | null;
  readonly avgRed: number | null;
  readonly ebRed: number | null;
  readonly avgPenalties: number | null;
  readonly ebPenalties: number | null;
  readonly avgFouls: number | null;
  readonly avgGoals: number | null;
  readonly tier: RefereeProfileTier;
  readonly tierLabel: string;
  readonly rankInLeague: number | null;
  readonly totalInLeague: number;
}

export interface RefereeBookablePlayerData {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly shortName: string;
  readonly teamSlug: string;
  readonly teamName: string;
  readonly side: "home" | "away";
  readonly positionGroup: "GK" | "DEF" | "MID" | "FWD";
  readonly positionLabel: string;
  readonly appearances: number;
  readonly yellowCards: number;
  readonly redCards: number;
  readonly foulsCommitted: number;
  readonly yellowsPerMatch: number;
  readonly foulsPerMatch: number;
  readonly disciplineScore: number;
  readonly href: string;
}

export interface RefereeProfileData {
  readonly slug: string;
  readonly name: string;
  readonly country: string | null;
  readonly primaryLeague: string;
  readonly primaryLeagueLabel: string;
  readonly href: string;
  readonly kappa: number;
  readonly matches: number;
  readonly observedMatches: number;
  readonly avgYellow: number | null;
  readonly ebYellow: number | null;
  readonly avgRed: number | null;
  readonly ebRed: number | null;
  readonly avgPenalties: number | null;
  readonly ebPenalties: number | null;
  readonly avgFouls: number | null;
  readonly avgGoals: number | null;
  readonly leagueMeanYellow: number;
  readonly leagueMeanRed: number;
  readonly leagueMeanPenalties: number;
  readonly tier: RefereeProfileTier;
  readonly tierLabel: string;
  readonly rigorPercentile: number;
  readonly rankInPrimaryLeague: number | null;
  readonly totalInPrimaryLeague: number;
  readonly recentMatches: readonly RefereeLastMatchSummaryData[];
  readonly competitionBreakdown: readonly RefereeCompetitionBreakdownData[];
  readonly nextAssignment: RefereeNextAssignmentData | null;
  readonly bookablePlayers: readonly RefereeBookablePlayerData[];
}

export interface RefereeLeagueLinkOption {
  readonly id: string;
  readonly label: string;
  readonly href: string;
}

export interface RefereesDirectoryClubViewProps {
  readonly ranking: LeagueRefereeRankingData;
  readonly availableLeagues?: readonly RefereeLeagueLinkOption[];
  readonly onNavigate?: (href: string) => void;
  readonly className?: string;
}

export interface RefereeProfileClubViewProps {
  readonly profile: RefereeProfileData;
  readonly onNavigate?: (href: string) => void;
  readonly className?: string;
}

export interface RefereesClubViewProps {
  readonly league?: string;
  readonly title?: string;
  readonly ranking?: LeagueRefereeRankingData | null;
  readonly profile?: RefereeProfileData | null;
  readonly availableLeagues?: readonly RefereeLeagueLinkOption[];
  readonly onNavigate?: (href: string) => void;
  readonly className?: string;
}

type TierFilterKey = "all" | RefereeProfileTier;
type RefereeSortKey = "ebYellow" | "ebRed" | "ebPenalties" | "avgFouls" | "matches" | "name";

const PAGE_SIZE = 25;
const MAX_RECENT_MATCHES_DISPLAY = 20;

function safeText(raw: string | null | undefined, fallback: string): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed || !isSafePublicLabel(trimmed)) return fallback;
  return trimmed;
}

function formatRate(value: number | null, digits = 2): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value.toFixed(digits);
}

function formatSignedDelta(value: number | null, baseline: number): string | null {
  if (value === null || !Number.isFinite(value) || !Number.isFinite(baseline)) return null;
  const diff = value - baseline;
  if (Math.abs(diff) < 0.005) return "en media";
  return `${diff > 0 ? "+" : ""}${diff.toFixed(2)} vs liga`;
}

function tierToneClass(tier: RefereeProfileTier): string {
  if (tier === "estricto") return "is-strict";
  if (tier === "permisivo") return "is-lenient";
  return "is-average";
}

function RefereeBackLink({
  fallbackHref,
  label,
  onNavigate,
}: {
  readonly fallbackHref: string;
  readonly label: string;
  readonly onNavigate: (href: string) => void;
}): React.JSX.Element {
  const handleBack = () => {
    if (typeof window !== "undefined") {
      const sameOrigin =
        Boolean(document.referrer) && document.referrer.startsWith(window.location.origin);
      if (window.history.length > 1 && (sameOrigin || window.history.state !== null)) {
        runWithViewTransition(() => {
          window.history.back();
        });
        return;
      }
    }
    onNavigate(fallbackHref);
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className="pl-back-btn pl-rf-back-btn"
      data-contextual-back=""
    >
      <MaestroIcon name="arrowLeft" size={14} />
      <span>{label}</span>
    </button>
  );
}

function RigorThermometerBar({
  tier,
  tierLabel,
  rigorPercentile,
  leagueMeanYellow,
  ebYellow,
}: {
  readonly tier: RefereeProfileTier;
  readonly tierLabel: string;
  readonly rigorPercentile: number;
  readonly leagueMeanYellow: number;
  readonly ebYellow: number | null;
}): React.JSX.Element {
  const clamped = Math.max(4, Math.min(96, Math.round(rigorPercentile)));
  const tone = tierToneClass(tier);
  const ariaLabel = `Rigurosidad ${tierLabel}: percentil ${clamped} de 100${
    ebYellow !== null
      ? `, ${ebYellow.toFixed(2)} amarillas ajustadas por partido frente a media de liga ${leagueMeanYellow.toFixed(2)}`
      : ""
  }`;

  return (
    <div className="pl-rf-thermo" role="img" aria-label={ariaLabel}>
      <span className="pl-rf-thermo-track" aria-hidden="true">
        <span
          className={`pl-rf-thermo-marker ${tone}`}
          style={{ insetInlineStart: `${clamped}%` }}
        />
      </span>
      <span className="pl-rf-thermo-ends num" aria-hidden="true">
        <span>Permisivo</span>
        <span>Media {leagueMeanYellow.toFixed(2)}</span>
        <span>Estricto</span>
      </span>
    </div>
  );
}

export function RefereesDirectoryClubView({
  ranking,
  availableLeagues = [],
  onNavigate,
  className,
}: RefereesDirectoryClubViewProps): React.JSX.Element {
  const platformActions = useOptionalPlatformActions();
  const [tierFilter, setTierFilter] = useState<TierFilterKey>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortKey, setSortKey] = useState<RefereeSortKey>("ebYellow");
  const [onlyNextAssigned, setOnlyNextAssigned] = useState<boolean>(false);
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const sortSelectId = useId();
  const leagueSelectId = useId();

  const navigateSafe = useCallback(
    (href: string) => {
      if (onNavigate) {
        onNavigate(href);
        return;
      }
      if (platformActions) {
        platformActions.navigateTo(href);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.assign(href);
      }
    },
    [onNavigate, platformActions],
  );

  const tierCounts = useMemo(() => {
    let strict = 0;
    let avg = 0;
    let lenient = 0;
    for (const ref of ranking.referees) {
      if (ref.tier === "estricto") strict += 1;
      else if (ref.tier === "permisivo") lenient += 1;
      else avg += 1;
    }
    return { strict, avg, lenient };
  }, [ranking.referees]);

  const tierTabs: readonly SofascoreTabItem[] = useMemo(
    () => [
      { id: "all", label: "Todos", count: ranking.referees.length },
      { id: "estricto", label: "Estrictos", count: tierCounts.strict },
      { id: "promedio", label: "Promedio", count: tierCounts.avg },
      { id: "permisivo", label: "Permisivos", count: tierCounts.lenient },
    ],
    [ranking.referees.length, tierCounts],
  );

  const kpiItems: readonly SofascoreKpiItem[] = useMemo(
    () => [
      {
        id: "total",
        label: "Árbitros",
        value: String(ranking.totalReferees),
        delta: `κ = ${ranking.kappa}`,
        tone: "brand",
      },
      {
        id: "yellow",
        label: "Media amarillas / p",
        value: ranking.leagueMeanYellow.toFixed(2),
        tone: "default",
      },
      {
        id: "red",
        label: "Media rojas / p",
        value: ranking.leagueMeanRed.toFixed(2),
        tone: "default",
      },
      {
        id: "penalties",
        label: "Media penales / p",
        value: ranking.leagueMeanPenalties.toFixed(2),
        tone: "default",
      },
    ],
    [ranking],
  );

  const filteredReferees = useMemo(() => {
    const needle = searchQuery
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

    const filtered = ranking.referees.filter((item) => {
      if (tierFilter !== "all" && item.tier !== tierFilter) return false;
      if (onlyNextAssigned && item.nextAssignment === null) return false;
      if (!needle) return true;
      const haystack = `${item.name} ${item.country ?? ""}`
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return haystack.includes(needle);
    });

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortKey === "name") {
        return a.name.localeCompare(b.name, "es-MX");
      }
      if (sortKey === "matches") {
        return b.matches - a.matches || a.rank - b.rank;
      }
      const valA = a[sortKey] ?? -1;
      const valB = b[sortKey] ?? -1;
      if (valB !== valA) return valB - valA;
      return a.rank - b.rank;
    });
    return sorted;
  }, [ranking.referees, tierFilter, onlyNextAssigned, searchQuery, sortKey]);

  const visibleRows = useMemo(
    () => filteredReferees.slice(0, visibleCount),
    [filteredReferees, visibleCount],
  );

  const columns: readonly SofascoreTableColumn<LeagueRefereeRankingItemData>[] = useMemo(
    () => [
      {
        key: "rank",
        header: "#",
        numeric: true,
        render: (row) => <span className="pl-rf-rank num">{row.rank}</span>,
      },
      {
        key: "name",
        header: "Árbitro",
        sticky: true,
        render: (row) => {
          const cleanName = safeText(row.name, "Árbitro");
          const cleanCountry = row.country ? safeText(row.country, "") : "";
          return (
            <div className="pl-rf-name-cell">
              <a
                href={row.href}
                className="pl-rf-name-link"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  navigateSafe(row.href);
                }}
              >
                {cleanName}
              </a>
              <span className="pl-rf-name-sub">
                {cleanCountry || safeText(row.leagueLabel, row.league)}
                {row.nextAssignment ? " · Próximo asignado" : ""}
              </span>
            </div>
          );
        },
      },
      {
        key: "tier",
        header: "Rigor",
        render: (row) => (
          <div className="pl-rf-tier-cell">
            <span className={`pl-rf-tier-pill ${tierToneClass(row.tier)}`}>
              {safeText(row.tierLabel, "Promedio")}
            </span>
            <span className="pl-rf-pct num">P{row.rigorPercentile}</span>
          </div>
        ),
      },
      {
        key: "matches",
        header: "Partidos",
        numeric: true,
        render: (row) => <span className="num">{row.matches}</span>,
      },
      {
        key: "ebYellow",
        header: "Amar. EB",
        numeric: true,
        render: (row) => (
          <div className="pl-rf-metric-cell num">
            <strong>{formatRate(row.ebYellow, 2)}</strong>
            {row.avgYellow !== null ? <small>crudo {row.avgYellow.toFixed(2)}</small> : null}
          </div>
        ),
      },
      {
        key: "ebRed",
        header: "Rojas EB",
        numeric: true,
        render: (row) => <span className="num">{formatRate(row.ebRed, 2)}</span>,
      },
      {
        key: "ebPenalties",
        header: "Penales EB",
        numeric: true,
        render: (row) => <span className="num">{formatRate(row.ebPenalties, 2)}</span>,
      },
      {
        key: "avgFouls",
        header: "Faltas / p",
        numeric: true,
        render: (row) => <span className="num">{formatRate(row.avgFouls, 1)}</span>,
      },
      {
        key: "activity",
        header: "Asignación",
        render: (row) => {
          const nextAssign = row.nextAssignment;
          if (nextAssign) {
            const matchText = `${safeText(nextAssign.homeTeam, "Local")} vs ${safeText(
              nextAssign.awayTeam,
              "Visita",
            )}`;
            return (
              <a
                href={nextAssign.href}
                className="pl-rf-match-link"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  navigateSafe(nextAssign.href);
                }}
              >
                <span className="pl-rf-next-dot" aria-hidden="true" />
                <span className="pl-rf-match-copy">
                  <strong>{matchText}</strong>
                  <small className="num">{nextAssign.dateLabel}</small>
                </span>
              </a>
            );
          }
          const lastMatch = row.lastMatch;
          if (lastMatch) {
            const matchText = `${safeText(lastMatch.homeTeam, "Local")} vs ${safeText(
              lastMatch.awayTeam,
              "Visita",
            )}`;
            return (
              <a
                href={lastMatch.href}
                className="pl-rf-match-link is-past"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  navigateSafe(lastMatch.href);
                }}
              >
                <span className="pl-rf-match-copy">
                  <span>{matchText}</span>
                  <small className="num">
                    {lastMatch.score
                      ? `${lastMatch.score.home}–${lastMatch.score.away}`
                      : lastMatch.dateLabel}
                  </small>
                </span>
              </a>
            );
          }
          return <span className="pl-rf-muted">—</span>;
        },
      },
    ],
    [navigateSafe],
  );

  const safeLeagueLabel = safeText(ranking.leagueLabel, ranking.league);

  return (
    <div
      className={["pl-rf-root", className].filter(Boolean).join(" ")}
      data-referees-directory={ranking.league}
    >
      <div className="pl-rf-topbar">
        <RefereeBackLink
          fallbackHref={`/app/${encodeURIComponent(ranking.league)}`}
          label={safeLeagueLabel}
          onNavigate={navigateSafe}
        />

        {availableLeagues.length > 1 ? (
          <div className="pl-rf-league-switcher">
            <label htmlFor={leagueSelectId} className="sr-only">
              Cambiar liga del directorio arbitral
            </label>
            <select
              id={leagueSelectId}
              value={ranking.league}
              onChange={(event) => {
                const target = availableLeagues.find((lg) => lg.id === event.target.value);
                if (target) navigateSafe(target.href);
              }}
              className="pl-al-select pl-rf-league-select"
            >
              {availableLeagues.map((lg) => (
                <option key={lg.id} value={lg.id}>
                  {safeText(lg.label, lg.id)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <header className="pl-rf-hero">
        <div className="pl-rf-hero-title-row">
          <LeagueBadge league={ranking.league} label={safeLeagueLabel} size={32} />
          <div className="pl-rf-hero-copy">
            <h1 className="pl-rf-title">Árbitros · {safeLeagueLabel}</h1>
            <p className="pl-rf-subtitle num">
              Temporada {safeText(ranking.season, "2026")} · Tasas suavizadas Empirical Bayes (κ ={" "}
              {ranking.kappa}) frente a la media de la liga.
            </p>
          </div>
        </div>
      </header>

      <SofascoreKpiStrip items={kpiItems} />

      <section className="pl-rf-table-section" aria-label="Ranking arbitral de la liga">
        <SofascoreTabs
          items={tierTabs}
          value={tierFilter}
          onChange={(next) => {
            if (
              next === "all" ||
              next === "estricto" ||
              next === "promedio" ||
              next === "permisivo"
            ) {
              setTierFilter(next);
              setVisibleCount(PAGE_SIZE);
            }
          }}
          variant="segmented"
          ariaLabel="Filtrar árbitros por perfil de rigor"
        />

        <SofascoreFilterBar
          searchValue={searchQuery}
          onSearchChange={(next) => {
            setSearchQuery(next);
            setVisibleCount(PAGE_SIZE);
          }}
          searchPlaceholder="Buscar árbitro por nombre o país…"
          resultCount={filteredReferees.length}
        >
          <label htmlFor={sortSelectId} className="sr-only">
            Ordenar ranking arbitral
          </label>
          <select
            id={sortSelectId}
            value={sortKey}
            onChange={(event) => {
              const next = event.target.value;
              if (
                next === "ebYellow" ||
                next === "ebRed" ||
                next === "ebPenalties" ||
                next === "avgFouls" ||
                next === "matches" ||
                next === "name"
              ) {
                setSortKey(next);
              }
            }}
            className="pl-al-select pl-al-filter-select"
          >
            <option value="ebYellow">Ordenar: Amarillas EB</option>
            <option value="ebRed">Ordenar: Rojas EB</option>
            <option value="ebPenalties">Ordenar: Penales EB</option>
            <option value="avgFouls">Ordenar: Faltas / p</option>
            <option value="matches">Ordenar: Partidos</option>
            <option value="name">Ordenar: Nombre A–Z</option>
          </select>

          <button
            type="button"
            className={`pl-rf-toggle-chip ${onlyNextAssigned ? "is-active" : ""}`}
            aria-pressed={onlyNextAssigned}
            onClick={() => {
              setOnlyNextAssigned((prev) => !prev);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            Con próximo partido
          </button>
        </SofascoreFilterBar>

        <SofascoreTable
          caption={`Ranking de árbitros de ${safeLeagueLabel}`}
          columns={columns}
          rows={visibleRows}
          rowKey={(row) => `${row.league}:${row.slug}`}
          onRowClick={(row) => navigateSafe(row.href)}
          emptyState={
            <SofascoreEmptyState
              title="Sin árbitros que coincidan"
              description="Ajusta el filtro de rigor o limpia el término de búsqueda."
              actionLabel="Restablecer filtros"
              onAction={() => {
                setSearchQuery("");
                setTierFilter("all");
                setOnlyNextAssigned(false);
              }}
            />
          }
        />

        {filteredReferees.length > visibleCount ? (
          <div className="pl-al-pagination">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
            >
              Mostrar más ({filteredReferees.length - visibleCount} restantes)
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export function RefereeProfileClubView({
  profile,
  onNavigate,
  className,
}: RefereeProfileClubViewProps): React.JSX.Element {
  const platformActions = useOptionalPlatformActions();

  const navigateSafe = useCallback(
    (href: string) => {
      if (onNavigate) {
        onNavigate(href);
        return;
      }
      if (platformActions) {
        platformActions.navigateTo(href);
        return;
      }
      if (typeof window !== "undefined") {
        window.location.assign(href);
      }
    },
    [onNavigate, platformActions],
  );

  const safeName = safeText(profile.name, "Árbitro");
  const safeLeagueLabel = safeText(profile.primaryLeagueLabel, profile.primaryLeague);
  const safeCountry = profile.country ? safeText(profile.country, "") : "";
  const directoryHref = `/app/${encodeURIComponent(profile.primaryLeague)}/arbitros`;

  const kpiItems: readonly SofascoreKpiItem[] = useMemo(
    () => [
      {
        id: "eb-yellow",
        label: `Amarillas EB (κ=${profile.kappa})`,
        value: formatRate(profile.ebYellow, 2),
        delta: formatSignedDelta(profile.ebYellow, profile.leagueMeanYellow),
        tone:
          profile.tier === "estricto"
            ? "negative"
            : profile.tier === "permisivo"
              ? "positive"
              : "default",
      },
      {
        id: "eb-red",
        label: "Rojas EB / p",
        value: formatRate(profile.ebRed, 2),
        delta: formatSignedDelta(profile.ebRed, profile.leagueMeanRed),
        tone: "default",
      },
      {
        id: "eb-pen",
        label: "Penales EB / p",
        value: formatRate(profile.ebPenalties, 2),
        delta: formatSignedDelta(profile.ebPenalties, profile.leagueMeanPenalties),
        tone: "default",
      },
      {
        id: "fouls",
        label: "Faltas / partido",
        value: formatRate(profile.avgFouls, 1),
        tone: "default",
      },
      {
        id: "matches",
        label: "Partidos muestra",
        value: String(profile.matches),
        delta:
          profile.rankInPrimaryLeague !== null
            ? `#${profile.rankInPrimaryLeague} de ${profile.totalInPrimaryLeague}`
            : null,
        tone: "brand",
      },
    ],
    [profile],
  );

  const boundedRecentMatches = useMemo(
    () => profile.recentMatches.slice(0, MAX_RECENT_MATCHES_DISPLAY),
    [profile.recentMatches],
  );

  const bookableColumns: readonly SofascoreTableColumn<RefereeBookablePlayerData>[] = useMemo(
    () => [
      {
        key: "player",
        header: "Jugador",
        sticky: true,
        render: (row) => (
          <div className="pl-rf-name-cell">
            <a
              href={row.href}
              className="pl-rf-name-link"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                navigateSafe(row.href);
              }}
            >
              {safeText(row.name, row.shortName)}
            </a>
            <span className="pl-rf-name-sub">
              {safeText(row.teamName, row.teamSlug)} · {safeText(row.positionLabel, row.positionGroup)}
            </span>
          </div>
        ),
      },
      {
        key: "side",
        header: "Lado",
        render: (row) => (
          <span className={`pl-rf-side-pill is-${row.side}`}>
            {row.side === "home" ? "Local" : "Visita"}
          </span>
        ),
      },
      {
        key: "appearances",
        header: "PJ",
        numeric: true,
        render: (row) => <span className="num">{row.appearances}</span>,
      },
      {
        key: "yellows",
        header: "Amarillas",
        numeric: true,
        render: (row) => <strong className="num">{row.yellowCards}</strong>,
      },
      {
        key: "yellowsPerMatch",
        header: "Amar. / p",
        numeric: true,
        render: (row) => <span className="num">{row.yellowsPerMatch.toFixed(2)}</span>,
      },
      {
        key: "foulsPerMatch",
        header: "Faltas / p",
        numeric: true,
        render: (row) => <span className="num">{row.foulsPerMatch.toFixed(2)}</span>,
      },
      {
        key: "reds",
        header: "Rojas",
        numeric: true,
        render: (row) => <span className="num">{row.redCards}</span>,
      },
    ],
    [navigateSafe],
  );

  const recentMatchColumns: readonly SofascoreTableColumn<RefereeLastMatchSummaryData>[] = useMemo(
    () => [
      {
        key: "date",
        header: "Fecha",
        render: (row) => (
          <div className="pl-rf-date-cell num">
            <span>{safeText(row.dateLabel, row.dateIso.slice(0, 10))}</span>
            {row.round ? <small>{safeText(row.round, "")}</small> : null}
          </div>
        ),
      },
      {
        key: "match",
        header: "Partido",
        sticky: true,
        render: (row) => (
          <a
            href={row.href}
            className="pl-rf-name-link"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              navigateSafe(row.href);
            }}
          >
            {safeText(row.homeTeam, row.homeSlug)} vs {safeText(row.awayTeam, row.awaySlug)}
          </a>
        ),
      },
      {
        key: "league",
        header: "Competición",
        render: (row) => (
          <span className="pl-rf-comp-cell">
            <LeagueBadge league={row.league} label={safeText(row.leagueLabel, row.league)} size={16} />
            <span>{safeText(row.leagueLabel, row.league)}</span>
          </span>
        ),
      },
      {
        key: "score",
        header: "Marcador",
        numeric: true,
        render: (row) => (
          <strong className="num">
            {row.score ? `${row.score.home}–${row.score.away}` : row.status}
          </strong>
        ),
      },
    ],
    [navigateSafe],
  );

  const compColumns: readonly SofascoreTableColumn<RefereeCompetitionBreakdownData>[] = useMemo(
    () => [
      {
        key: "league",
        header: "Competición",
        sticky: true,
        render: (row) => {
          const href = `/app/${encodeURIComponent(row.league)}/arbitros`;
          return (
            <a
              href={href}
              className="pl-rf-comp-cell pl-rf-name-link"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                navigateSafe(href);
              }}
            >
              <LeagueBadge league={row.league} label={safeText(row.leagueLabel, row.league)} size={18} />
              <span>{safeText(row.leagueLabel, row.league)}</span>
            </a>
          );
        },
      },
      {
        key: "tier",
        header: "Rigor",
        render: (row) => (
          <span className={`pl-rf-tier-pill ${tierToneClass(row.tier)}`}>
            {safeText(row.tierLabel, "Promedio")}
          </span>
        ),
      },
      {
        key: "matches",
        header: "Partidos",
        numeric: true,
        render: (row) => <span className="num">{row.sampleMatches}</span>,
      },
      {
        key: "ebYellow",
        header: "Amar. EB",
        numeric: true,
        render: (row) => <strong className="num">{formatRate(row.ebYellow, 2)}</strong>,
      },
      {
        key: "ebRed",
        header: "Rojas EB",
        numeric: true,
        render: (row) => <span className="num">{formatRate(row.ebRed, 2)}</span>,
      },
      {
        key: "ebPenalties",
        header: "Penales EB",
        numeric: true,
        render: (row) => <span className="num">{formatRate(row.ebPenalties, 2)}</span>,
      },
      {
        key: "rank",
        header: "Posición",
        numeric: true,
        render: (row) => (
          <span className="num">
            {row.rankInLeague !== null ? `#${row.rankInLeague} / ${row.totalInLeague}` : "—"}
          </span>
        ),
      },
    ],
    [navigateSafe],
  );

  const nextAssignment = profile.nextAssignment;

  return (
    <div
      className={["pl-rf-root", className].filter(Boolean).join(" ")}
      data-referee-profile={profile.slug}
    >
      <div className="pl-rf-topbar">
        <RefereeBackLink
          fallbackHref={directoryHref}
          label={`Árbitros · ${safeLeagueLabel}`}
          onNavigate={navigateSafe}
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigateSafe(directoryHref)}
        >
          Ver ranking completo
        </Button>
      </div>

      <SofascoreCard>
        <div className="pl-rf-profile-hero">
          <div className="pl-rf-profile-head">
            <div className="pl-rf-profile-id">
              <span className="pl-rf-whistle-badge" aria-hidden="true">
                <MaestroIcon name="whistle" size={20} />
              </span>
              <div className="pl-rf-hero-copy">
                <h1 className="pl-rf-title">{safeName}</h1>
                <p className="pl-rf-subtitle">
                  {[
                    safeCountry || null,
                    safeLeagueLabel,
                    profile.rankInPrimaryLeague !== null
                      ? `N.º ${profile.rankInPrimaryLeague} de ${profile.totalInPrimaryLeague}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
            </div>
            <span className={`pl-rf-tier-pill is-lg ${tierToneClass(profile.tier)}`}>
              {safeText(profile.tierLabel, "Promedio")} · P{profile.rigorPercentile}
            </span>
          </div>

          <RigorThermometerBar
            tier={profile.tier}
            tierLabel={safeText(profile.tierLabel, "Promedio")}
            rigorPercentile={profile.rigorPercentile}
            leagueMeanYellow={profile.leagueMeanYellow}
            ebYellow={profile.ebYellow}
          />
        </div>
      </SofascoreCard>

      <SofascoreKpiStrip items={kpiItems} />

      {nextAssignment ? (
        <SofascoreCard
          title="Próximo partido asignado"
          meta={
            <span className={`pl-rf-status-pill is-${nextAssignment.status.toLowerCase()}`}>
              {nextAssignment.status === "LIVE" ? "En vivo" : nextAssignment.dateLabel}
            </span>
          }
        >
          <div className="pl-rf-next-card">
            <div className="pl-rf-next-copy">
              <strong className="pl-rf-next-match">
                {safeText(nextAssignment.homeTeam, nextAssignment.homeSlug)} vs{" "}
                {safeText(nextAssignment.awayTeam, nextAssignment.awaySlug)}
              </strong>
              <span className="pl-rf-name-sub">
                {[
                  safeText(nextAssignment.leagueLabel, nextAssignment.league),
                  nextAssignment.round ? safeText(nextAssignment.round, "") : null,
                  nextAssignment.venue ? safeText(nextAssignment.venue, "") : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigateSafe(nextAssignment.href)}
            >
              Abrir ficha del partido
            </Button>
          </div>
        </SofascoreCard>
      ) : null}

      {profile.bookablePlayers.length > 0 ? (
        <SofascoreCard
          title="Jugadores propensos a tarjeta en el próximo partido"
          meta={<span className="num">{profile.bookablePlayers.length} jugadores</span>}
        >
          <SofascoreTable
            caption={`Jugadores con mayor incidencia de tarjetas y faltas para el próximo partido de ${safeName}`}
            columns={bookableColumns}
            rows={profile.bookablePlayers}
            rowKey={(row) => row.id}
            density="compact"
            onRowClick={(row) => navigateSafe(row.href)}
          />
        </SofascoreCard>
      ) : null}

      <SofascoreCard
        title="Partidos recientes dirigidos"
        meta={<span className="num">{boundedRecentMatches.length} encuentros</span>}
      >
        <SofascoreTable
          caption={`Últimos ${boundedRecentMatches.length} partidos dirigidos por ${safeName}`}
          columns={recentMatchColumns}
          rows={boundedRecentMatches}
          rowKey={(row) => `${row.league}:${row.matchSlug}:${row.dateIso}`}
          density="compact"
          onRowClick={(row) => navigateSafe(row.href)}
          emptyState={
            <SofascoreEmptyState
              title="Sin partidos recientes registrados"
              description="Aún no hay encuentros recientes registrados en la temporada actual para este árbitro."
            />
          }
        />
      </SofascoreCard>

      {profile.competitionBreakdown.length > 1 ? (
        <SofascoreCard
          title="Desglose por competición"
          meta={<span className="num">{profile.competitionBreakdown.length} torneos</span>}
        >
          <SofascoreTable
            caption={`Estadísticas de ${safeName} por competición`}
            columns={compColumns}
            rows={profile.competitionBreakdown}
            rowKey={(row) => row.league}
            density="compact"
          />
        </SofascoreCard>
      ) : null}
    </div>
  );
}

export function RefereesClubView({
  title = "Árbitros",
  ranking,
  profile,
  availableLeagues,
  onNavigate,
  className,
}: RefereesClubViewProps = {}): React.JSX.Element {
  if (profile) {
    return (
      <RefereeProfileClubView
        profile={profile}
        onNavigate={onNavigate}
        className={className}
      />
    );
  }
  if (ranking) {
    return (
      <RefereesDirectoryClubView
        ranking={ranking}
        availableLeagues={availableLeagues}
        onNavigate={onNavigate}
        className={className}
      />
    );
  }
  return (
    <SofascoreCard title={title} className={className}>
      <SofascoreEmptyState
        title="Selecciona una liga de fútbol"
        description="Consulta promedios ajustados de tarjetas, faltas, penales y rigor arbitral por competición."
      />
    </SofascoreCard>
  );
}
