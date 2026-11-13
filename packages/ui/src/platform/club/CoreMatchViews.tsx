"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { getTeamColors } from "@pitchlab/sports-assets";
import {
  LeagueBadge,
  PBar,
  ProbSplit,
  TeamBadge,
  parseUserOdds,
} from "../../sports";
import {
  decimalToAmericanInt,
  formatEdgePts,
  formatOddsValue,
  getSessionWatermark,
  isPreGameIntelUnlocked,
} from "../access-guard";
import {
  CrestPedestal,
  LensGlowOrbs,
  MaestroIcon,
  ExampleBadge,
  NoticeCard,
  StackedAvatars,
  UserBadges,
} from "../components/MaestroPrimitives";
import {
  MatchTicketCard,
  MultiPickRow,
} from "../components/MatchTicketCard";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome";
import {
  usePlatform,
} from "../platform-provider";
import type {
  MatchPick,
  PlatformGame,
  PlatformGameDetail,
  PlatformMarketRow,
  RiskBand,
} from "../types";

function matchesMarketCategory(
  row: PlatformMarketRow,
  filter: "all" | "resultado" | "totales" | "btts_handicap" | "doble",
): boolean {
  if (filter === "all") return true;
  const g = row.group.toLowerCase();
  const m = row.market.toLowerCase();
  const l = row.label.toLowerCase();

  if (filter === "resultado") {
    return (
      g.includes("resultado") ||
      g.includes("ganador") ||
      g.includes("1x2") ||
      m === "h2h" ||
      m.includes("moneyline") ||
      m === "1x2"
    );
  }
  if (filter === "totales") {
    return (
      g.includes("total") ||
      g.includes("goles") ||
      g.includes("puntos") ||
      g.includes("equipo") ||
      m.includes("total") ||
      m.includes("ou") ||
      l.includes("más de") ||
      l.includes("menos de")
    );
  }
  if (filter === "btts_handicap") {
    return (
      g.includes("ambos") ||
      g.includes("hándicap") ||
      g.includes("handicap") ||
      g.includes("spread") ||
      g.includes("línea") ||
      m.includes("btts") ||
      m.includes("spread") ||
      m.includes("handicap") ||
      l.includes("ambos anotan")
    );
  }
  return (
    g.includes("doble") ||
    g.includes("empate") ||
    m.includes("double") ||
    m.includes("dnb") ||
    l.includes("o empate") ||
    l.includes("sin empate")
  );
}

const GRID_PAGE = 12;

/**
 * Rejilla de partidos que dibuja 12 y agrega 12 más al acercarse al final.
 * Cada tarjeta usa content-visibility para no pintarse fuera de pantalla.
 */
function ProgressiveGameGrid({
  games,
  featureFirst = false,
  resetKey,
}: {
  games: readonly PlatformGame[];
  featureFirst?: boolean;
  resetKey?: string;
}): React.JSX.Element {
  const [count, setCount] = useState<number>(GRID_PAGE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCount(GRID_PAGE);
  }, [resetKey]);

  const hasMore = count < games.length;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setCount((c) => Math.min(c + GRID_PAGE, games.length));
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, games.length]);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {games.slice(0, count).map((g, idx) => (
          <div key={g.id} className="pl-cv-card">
            <MatchTicketCard game={g} featured={featureFirst && idx === 0} />
          </div>
        ))}
      </div>
      {hasMore ? (
        <div ref={sentinelRef} className="flex justify-center py-2">
          <button
            type="button"
            className="pl-btn-glass text-xs"
            onClick={() => setCount((c) => Math.min(c + GRID_PAGE, games.length))}
          >
            Ver más partidos ({games.length - count})
          </button>
        </div>
      ) : null}
    </>
  );
}

/** El Inicio del Club vive en `home/HomeClubView`; se conserva el nombre anterior.
 */
export { HomeClubView as JornadaClubView } from "./home/HomeClubView";

export function MultiPicksClubView(): React.JSX.Element {
  const { dataset, navigateTo } = usePlatform();
  const [riskFilter, setRiskFilter] = useState<"all" | RiskBand>("all");
  const [leagueFilter, setLeagueFilter] = useState<string>("all");
  const [onlyHighConf, setOnlyHighConf] = useState<boolean>(false);
  const [userOddsRaw, setUserOddsRaw] = useState<string>("");

  const parsedUserDec = useMemo(
    () => (userOddsRaw.trim() ? parseUserOdds(userOddsRaw) : null),
    [userOddsRaw],
  );

  const upcomingGames = useMemo(() => {
    const up = dataset.games.filter((g) => g.status !== "FT");
    return up.length > 0 ? up : dataset.games;
  }, [dataset.games]);

  const visibleGames = useMemo(() => {
    return upcomingGames
      .filter((g) => leagueFilter === "all" || g.league === leagueFilter)
      .map((g) => ({
        game: g,
        picks: g.picks.filter(
          (p) =>
            (riskFilter === "all" || p.risk === riskFilter) &&
            (!onlyHighConf || p.p >= 0.62),
        ),
      }))
      .filter((entry) => entry.picks.length > 0);
  }, [upcomingGames, leagueFilter, riskFilter, onlyHighConf]);

  return (
    <AtmosphereStage activePath="/app/picks">
      <ClubWorkspaceShell activePath="/app/picks">
        <section className="space-y-2">
          <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
            Picks del día
          </h1>
          <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            Hasta 5 picks por partido, del perfil conservador al de mayor valor. Escribe el momio de
            tu casa para ver si tiene ventaja.
          </p>
        </section>

        {/* Barra Geodesic v2.0 "Probar tu momio" en vivo */}
        <section
          aria-label="Probar tu momio"
          className="glass-lens glass-ring rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3"
        >
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="picks-live-odds-input"
              className="text-xs font-extrabold inline-flex items-center gap-1.5"
            >
              <MaestroIcon
                name="activity"
                size={14}
                style={{ color: "var(--pl-brand)" }}
              />
              <span>Tu momio:</span>
            </label>
            <input
              id="picks-live-odds-input"
              type="text"
              value={userOddsRaw}
              onChange={(e) => setUserOddsRaw(e.target.value)}
              placeholder="Ej. -110 o 1.95"
              className="glass-input px-3 py-1.5 text-xs font-bold num w-36"
            />
            <div className="flex items-center gap-1">
              {["-110", "+105", "1.95"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setUserOddsRaw(preset)}
                  className="pl-btn-glass text-[11px] min-h-7 px-2 num"
                >
                  {preset}
                </button>
              ))}
              {userOddsRaw ? (
                <button
                  type="button"
                  onClick={() => setUserOddsRaw("")}
                  className="pl-btn-glass text-[11px] min-h-7 px-2 inline-flex items-center gap-1"
                >
                  <MaestroIcon name="x" size={11} />
                  <span>Limpiar</span>
                </button>
              ) : null}
            </div>
          </div>

          <div className="text-xs num">
            {parsedUserDec ? (
              <span className="pl-pill pl-pill--success inline-flex items-center gap-1.5">
                <MaestroIcon name="check" size={12} />
                <span>
                  Decimal {parsedUserDec.toFixed(2)} · Implícita{" "}
                  {((1 / parsedUserDec) * 100).toFixed(1)} % activa
                </span>
              </span>
            ) : userOddsRaw.trim() ? (
              <span className="pl-pill pl-pill--warning">
                Ingresa formato americano (-110, +125) o decimal (1.95)
              </span>
            ) : (
              <span style={{ color: "var(--pl-text-muted)" }}>
                Escribe tu cuota para recalcular ventaja EV en todos los picks desbloqueados
              </span>
            )}
          </div>
        </section>

        {/* Controles de perfil, liga y probabilidad */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="seg-well" role="group" aria-label="Filtrar por perfil de riesgo">
            {(
              [
                { id: "all", label: "Todos los perfiles" },
                { id: "conservador", label: "Conservador" },
                { id: "medio", label: "Balanceado Medio" },
                { id: "arriesgado", label: "Cuota Alta · Valor" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="seg-btn"
                aria-pressed={riskFilter === opt.id}
                onClick={() => setRiskFilter(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Filtrar por liga"
              value={leagueFilter}
              onChange={(e) => setLeagueFilter(e.target.value)}
              className="glass-input px-3 py-1.5 text-xs font-semibold"
            >
              <option value="all">Todas las ligas</option>
              {dataset.leagues.map((l) => (
                <option key={l.league} value={l.league}>
                  {l.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              aria-pressed={onlyHighConf}
              onClick={() => setOnlyHighConf((v) => !v)}
              className="pl-btn-glass text-xs min-h-8 px-3 inline-flex items-center gap-1.5"
            >
              {onlyHighConf ? <MaestroIcon name="check" size={12} /> : null}
              <span>Prob. ≥ 62 %</span>
            </button>
          </div>
        </div>

        <div className="space-y-5">
          {visibleGames.slice(0, 10).map(({ game, picks }) => {
            const homeColor =
              getTeamColors(game.league, game.home.slug)?.[0] ??
              "var(--pl-aura-default-home)";
            const awayColor =
              getTeamColors(game.league, game.away.slug)?.[0] ??
              "var(--pl-aura-default-away)";

            return (
              <section
                key={game.id}
                className="glass-card glass-ring rounded-2xl p-5 space-y-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CrestPedestal size="sm" glowColor={homeColor}>
                      <TeamBadge
                        league={game.league}
                        slug={game.home.slug}
                        name={game.home.name}
                        size={22}
                      />
                    </CrestPedestal>
                    <CrestPedestal size="sm" glowColor={awayColor}>
                      <TeamBadge
                        league={game.league}
                        slug={game.away.slug}
                        name={game.away.name}
                        size={22}
                      />
                    </CrestPedestal>
                    <div className="min-w-0">
                      <h2 className="m-0 text-base font-extrabold truncate">
                        {game.home.name} vs {game.away.name}
                      </h2>
                      <span
                        className="text-xs block truncate"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        {game.leagueLabel} · {game.round} · {game.kickoffLocal}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="pl-pill num">{picks.length} selecciones</span>
                    <a
                      href={`/app/${game.league}/games/${game.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        navigateTo(`/app/${game.league}/games/${game.id}`);
                      }}
                      className="pl-btn-glass text-xs min-h-8 px-3 inline-flex items-center gap-1"
                    >
                      <span>Estudio</span>
                      <MaestroIcon name="arrowRight" size={12} />
                    </a>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {picks.map((pk) => (
                    <MultiPickRow
                      key={pk.id}
                      pick={pk}
                      gameStatus={game.status}
                      userDecimalOverride={parsedUserDec}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function LeagueHubClubView({
  leagueId,
}: {
  leagueId: LeagueId;
}): React.JSX.Element {
  const { dataset } = usePlatform();
  const [dayFilter, setDayFilter] = useState<string>("all");

  const leagueSummary =
    dataset.leagues.find((l) => l.league === leagueId) ?? dataset.leagues[0]!;
  const leagueGames = useMemo(
    () => dataset.games.filter((g) => g.league === leagueSummary.league),
    [dataset.games, leagueSummary.league],
  );

  const dayOptions = useMemo(() => {
    const map = new Map<string, string>();
    map.set("all", "Toda la jornada");
    for (const g of leagueGames) {
      if (!map.has(g.dayId)) {
        map.set(g.dayId, g.dayLabel);
      }
    }
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [leagueGames]);

  const filteredGames = useMemo(
    () =>
      dayFilter === "all"
        ? leagueGames
        : leagueGames.filter((g) => g.dayId === dayFilter),
    [leagueGames, dayFilter],
  );

  const upcoming = filteredGames.filter((g) => g.status !== "FT");
  const finished = filteredGames.filter((g) => g.status === "FT");

  const hubPath = `/app/${leagueSummary.league}`;

  return (
    <AtmosphereStage activePath={hubPath}>
      <ClubWorkspaceShell activePath={hubPath}>
        <section className="glass-lens glass-ring glass-ring--featured rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4 relative overflow-hidden">
          <LensGlowOrbs subtle />

          <div className="flex items-center gap-4 relative z-10">
            <CrestPedestal size="lg">
              <LeagueBadge
                league={leagueSummary.league}
                label={leagueSummary.label}
                size={40}
              />
            </CrestPedestal>
            <div>
              <span
                className="text-xs font-bold"
                style={{ color: "var(--pl-brand)" }}
              >
                {leagueSummary.season} · {leagueSummary.roundLabel}
              </span>
              <h1 id="panel-league-name" className="m-0 text-2xl sm:text-3xl font-extrabold">
                {leagueSummary.label}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs num relative z-10">
            <span className="pl-pill pl-pill--brand inline-flex items-center gap-1">
              <MaestroIcon name="calendar" size={12} />
              <span>{leagueSummary.upcomingCount} por jugar</span>
            </span>
            <span className="pl-pill pl-pill--success inline-flex items-center gap-1">
              <MaestroIcon name="check" size={12} />
              <span>{leagueSummary.finishedCount} auditados FT</span>
            </span>
          </div>
        </section>

        {/* Chips de filtro por día */}
        <div
          id="day-chips"
          className="seg-well"
          role="group"
          aria-label="Filtrar partidos por día"
        >
          {dayOptions.map((d) => (
            <button
              key={d.id}
              type="button"
              className="day-chip seg-btn"
              aria-pressed={dayFilter === d.id}
              onClick={() => setDayFilter(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>

        {upcoming.length > 0 ? (
          <section className="space-y-3">
            <h2 className="m-0 text-lg font-extrabold">
              Próximos encuentros ({upcoming.length})
            </h2>
            <ProgressiveGameGrid games={upcoming} featureFirst />
          </section>
        ) : null}

        {finished.length > 0 ? (
          <section className="space-y-3">
            <h2 className="m-0 text-lg font-extrabold">
              Resultados cerrados FT ({finished.length})
            </h2>
            <ProgressiveGameGrid games={finished} />
          </section>
        ) : (
          <section className="glass-card glass-ring rounded-2xl p-4 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Aún no hay marcadores cerrados (FT) registrados en este corte de la jornada.
          </section>
        )}

        {/* Tabla de posiciones real del snapshot */}
        {leagueSummary.standings.length > 0 ? (
          <section className="standings-block pl-deferred-section glass-card glass-ring rounded-2xl p-5 space-y-3">
            <h2 className="m-0 text-lg font-extrabold">
              Tabla de Posiciones · {leagueSummary.label}
            </h2>
            <div
              className="pl-table-region"
              tabIndex={0}
              role="region"
              aria-label={`Tabla de posiciones de ${leagueSummary.label}`}
            >
              <table className="standings w-full text-left border-collapse text-sm">
                <thead>
                  <tr
                    className="hairline-b text-xs"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    <th scope="col" className="py-2 pr-3">
                      Pos.
                    </th>
                    <th scope="col" className="py-2 pr-3">
                      Club
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      PJ
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      G
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      E
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      P
                    </th>
                    <th scope="col" className="py-2 px-2 text-right">
                      DG
                    </th>
                    <th scope="col" className="py-2 pl-2 text-right">
                      Pts
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {leagueSummary.standings.map((row, idx) => {
                    const slug = row.teamId.includes(".")
                      ? row.teamId.split(".")[1]!
                      : row.teamId;
                    const dg = row.goalsFor - row.goalsAgainst;
                    return (
                      <tr key={row.teamId} className="hairline-b">
                        <td className="py-2.5 pr-3 num font-bold">{idx + 1}</td>
                        <td className="py-2.5 pr-3">
                          <div className="flex items-center gap-2 font-semibold">
                            <TeamBadge
                              league={leagueSummary.league}
                              slug={slug}
                              name={row.name}
                              size={20}
                            />
                            <span>{row.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right num">{row.played}</td>
                        <td className="py-2.5 px-2 text-right num">{row.won}</td>
                        <td className="py-2.5 px-2 text-right num">{row.drawn}</td>
                        <td className="py-2.5 px-2 text-right num">{row.lost}</td>
                        <td className="py-2.5 px-2 text-right num">
                          {dg > 0 ? `+${dg}` : dg}
                        </td>
                        <td className="py-2.5 pl-2 text-right num font-extrabold">
                          {row.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="standings-block glass-card glass-ring rounded-2xl p-5 space-y-1.5">
            <h2 className="m-0 text-lg font-extrabold">
              Tabla de Posiciones · {leagueSummary.label}
            </h2>
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              La clasificación actualizada aún no está disponible en el corte vigente de esta
              competición.
            </p>
          </section>
        )}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function MatchStudioClubView({
  leagueId,
  gameId,
  cortexSynthesisOverride,
  detail,
}: {
  leagueId: LeagueId;
  gameId: string;
  /** Resumen de Cortex IA redactado en servidor (LLM validado); si falta, se usa la plantilla. */
  cortexSynthesisOverride?: string | null;
  /** Mercados, enfrentamientos y factores de este partido (el dataset del layout llega sin ellos). */
  detail?: PlatformGameDetail | null;
}): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    oddsFormat,
    watchlistGameIds,
    toggleWatchlistGame,
    setSelectedTipsterPickId,
    socialPosts,
    publishSocialPost,
    openComposer,
    navigateTo,
    pushToast,
  } = usePlatform();

  const [activeTab, setActiveTab] = useState<
    "picks" | "mercados" | "contexto" | "dinero"
  >("picks");
  const [marketGroupFilter, setMarketGroupFilter] = useState<
    "all" | "resultado" | "totales" | "btts_handicap" | "doble"
  >("all");
  const [marketUserOddsRaw, setMarketUserOddsRaw] = useState<string>("");
  const [debateBody, setDebateBody] = useState<string>("");
  const [debateError, setDebateError] = useState<string>("");

  const game = useMemo(() => {
    const base =
      dataset.games.find((g) => g.id === gameId) ??
      dataset.games.find((g) => g.league === leagueId) ??
      dataset.games[0]!;
    return detail && base.id === gameId ? { ...base, ...detail } : base;
  }, [dataset.games, gameId, leagueId, detail]);

  const isNfl = game.sport === "american-football" || game.league === "nfl";
  const flow = game.preGame.moneyFlow;
  const isFinished = game.status === "FT" && game.score !== undefined;
  const intelUnlocked = isPreGameIntelUnlocked(game, viewerRole);
  const watermark = getSessionWatermark(viewerRole);
  const watched = watchlistGameIds.includes(game.id);

  const homePrimary =
    getTeamColors(game.league, game.home.slug)?.[0] ??
    "var(--pl-aura-default-home)";
  const awayPrimary =
    getTeamColors(game.league, game.away.slug)?.[0] ??
    "var(--pl-aura-default-away)";

  const studioPath = `/app/${game.league}/games/${game.id}`;
  const mainEngineName =
    game.picks[0]?.engineName ??
    (isNfl ? "PitchLab Minkowski v3.0" : "PitchLab Tachyon v3.0");

  const parsedMarketUserDec = useMemo(
    () => (marketUserOddsRaw.trim() ? parseUserOdds(marketUserOddsRaw) : null),
    [marketUserOddsRaw],
  );

  const filteredMarkets = useMemo(
    () => game.markets.filter((m) => matchesMarketCategory(m, marketGroupFilter)),
    [game.markets, marketGroupFilter],
  );

  const matchLabelShort = `${game.home.shortName} vs ${game.away.shortName}`;

  const matchDebateItems = useMemo(() => {
    return socialPosts
      .filter(
        (p) =>
          p.gameId === game.id ||
          p.matchLabel.toLowerCase().includes(game.home.shortName.toLowerCase()) ||
          p.matchLabel.toLowerCase().includes(game.away.shortName.toLowerCase()),
      )
      .map((p) => ({
        id: p.id,
        handle: `@${p.authorHandle}`,
        roleBadge: p.roleBadge,
        record: `${p.verifiedRecord} · ${p.clvBadge}`,
        createdAt: p.createdAt,
        body: p.body,
        isExample: Boolean(p.isExample),
      }));
  }, [game.away.shortName, game.home.shortName, game.id, socialPosts]);

  const handlePublishDebate = (e: React.FormEvent) => {
    e.preventDefault();
    setDebateError("");
    const res = publishSocialPost({
      leagueLabel: game.leagueLabel,
      matchLabel: matchLabelShort,
      pickBadge: game.picks[0]?.categoryLabel ?? "Lectura Socio",
      originType: "Spacetime Suite",
      body: debateBody,
    });
    if (!res.ok) {
      setDebateError(res.error ?? "No se pudo publicar tu comentario.");
      return;
    }
    setDebateBody("");
  };

  const handleSealMarketRow = (m: PlatformMarketRow, idx: number) => {
    const existingPick = game.picks.find((p) => p.label === m.label);
    if (existingPick) {
      openComposer(existingPick);
      return;
    }
    const effectiveBookDec =
      parsedMarketUserDec && parsedMarketUserDec > 1
        ? parsedMarketUserDec
        : m.currentDecimal;
    const edgeForSeal =
      effectiveBookDec === null ? null : Math.round((m.p - 1 / effectiveBookDec) * 1000) / 10;
    const syntheticPick: MatchPick = {
      id: `${game.id}-mkt-${idx}`,
      gameId: game.id,
      league: game.league,
      leagueLabel: game.leagueLabel,
      matchLabel: `${game.home.name} vs ${game.away.name}`,
      kickoffLocal: game.kickoffLocal,
      gameStatus: game.status,
      slotIndex: idx + 10,
      category: "valor",
      categoryLabel: m.group,
      risk: m.p >= 0.68 ? "conservador" : m.p >= 0.52 ? "medio" : "arriesgado",
      engineKey: "geodesic",
      engineName: "PitchLab Geodesic v2.0",
      marketGroup: m.group,
      selectionKey: m.selection,
      conflictGroup: "independent",
      label: m.label,
      rationale: `Línea directa de la matriz de mercados (${(m.p * 100).toFixed(1)} % de probabilidad real).`,
      p: m.p,
      fairDecimal: m.fairDecimal,
      fairAmerican: m.fairAmerican,
      marketDecimal: effectiveBookDec,
      marketAmerican: effectiveBookDec === null ? null : decimalToAmericanInt(effectiveBookDec),
      edgePts: edgeForSeal,
      confidenceScore: game.confidenceScore,
      suggestedUnits: 1.0,
    };
    openComposer(syntheticPick);
  };

  return (
    <AtmosphereStage activePath={studioPath}>
      <ClubWorkspaceShell activePath={studioPath}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <a
            href={`/app/${game.league}`}
            onClick={(e) => {
              e.preventDefault();
              navigateTo(`/app/${game.league}`);
            }}
            className="pl-btn-glass text-xs min-h-8 px-3 inline-flex items-center gap-1.5"
          >
            <MaestroIcon name="arrowLeft" size={13} />
            <span>Volver a {game.leagueLabel}</span>
          </a>

          <button
            type="button"
            className="pl-btn-glass text-xs min-h-8 px-3 inline-flex items-center gap-1.5"
            onClick={() => toggleWatchlistGame(game.id)}
          >
            <MaestroIcon
              name="bell"
              size={13}
              style={{ color: watched ? "var(--pl-brand)" : undefined }}
            />
            <span>{watched ? "En vigilancia" : "Vigilar partido"}</span>
          </button>
        </div>

        {/* Cabecera Estelar de Radiografía del Partido */}
        <section
          className="glass-lens glass-ring glass-ring--featured rounded-3xl p-6 space-y-5 relative overflow-hidden"
          data-match-studio={game.id}
        >
          <LensGlowOrbs primaryColor={homePrimary} secondaryColor={awayPrimary} />

          <span className="pl-watermark num" aria-hidden="true">
            {watermark}
          </span>

          <div className="flex flex-wrap items-center justify-between gap-2 relative z-10">
            <div className="flex items-center gap-2">
              <LeagueBadge league={game.league} label={game.leagueLabel} size={22} />
              <span
                id="modal-league"
                className="text-xs font-semibold"
              >
                {game.leagueLabel} · {game.round} · {game.venue}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="pl-pill pl-pill--success num text-xs">
                Confianza {game.confidenceScore}/100
              </span>
              <span className="pl-pill pl-pill--brand num text-xs">
                {isFinished
                  ? "Finalizado FT"
                  : `${game.dayLabel} · ${game.kickoffLocal}`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center relative z-10">
            <div className="flex items-center gap-3.5 min-w-0">
              <CrestPedestal size="lg" glowColor={homePrimary}>
                <TeamBadge
                  league={game.league}
                  slug={game.home.slug}
                  name={game.home.name}
                  size={44}
                />
              </CrestPedestal>
              <div className="min-w-0">
                <h1 className="m-0 text-xl sm:text-2xl font-extrabold truncate">
                  {game.home.name}
                </h1>
                <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {game.home.record}
                </span>
              </div>
            </div>

            <div className="text-center space-y-1">
              {isFinished ? (
                <strong className="num text-3xl font-extrabold block">
                  {game.score?.home} – {game.score?.away}
                </strong>
              ) : intelUnlocked ? (
                <strong
                  className="num text-2xl font-extrabold block"
                  style={{ color: "var(--pl-brand)" }}
                >
                  Proy. {game.projection.home.toFixed(isNfl ? 1 : 2)} –{" "}
                  {game.projection.away.toFixed(isNfl ? 1 : 2)}
                </strong>
              ) : (
                <span className="pl-pill inline-flex items-center gap-1.5">
                  <MaestroIcon name="lock" size={12} />
                  <span>Marcador proyectado Pase PitchLab Ultra</span>
                </span>
              )}
              <span
                className="text-xs num block"
                style={{ color: "var(--pl-text-muted)" }}
              >
                {intelUnlocked || isFinished
                  ? `${isNfl ? "Puntos" : "Goles"} esperados: ${game.projection.total.toFixed(isNfl ? 1 : 2)}`
                  : "Disponible con Pase PitchLab Ultra"}
              </span>
            </div>

            <div className="flex items-center gap-3.5 md:justify-end min-w-0">
              <div className="md:text-right min-w-0">
                <h2 className="m-0 text-xl sm:text-2xl font-extrabold truncate">
                  {game.away.name}
                </h2>
                <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {game.away.record}
                </span>
              </div>
              <CrestPedestal size="lg" glowColor={awayPrimary}>
                <TeamBadge
                  league={game.league}
                  slug={game.away.slug}
                  name={game.away.name}
                  size={44}
                />
              </CrestPedestal>
            </div>
          </div>

          <div className="relative z-10">
            <ProbSplit
              probabilities={isNfl ? [game.x12[0], game.x12[2]] : game.x12}
              labels={
                isNfl
                  ? [game.home.shortName, game.away.shortName]
                  : [game.home.shortName, "Empate", game.away.shortName]
              }
              showLabels
            />
          </div>
        </section>

        {/* Fila Pre-Partido de 3 Columnas: Cortex IA · Alineaciones 60m · ¿Dónde está el dinero? */}
        <section
          aria-label="Inteligencia pre-partido en 3 ejes"
          className="grid grid-cols-1 lg:grid-cols-3 gap-4"
        >
          {/* 1) Síntesis Ejecutiva · Cortex IA */}
          <div className="glass-card glass-ring rounded-2xl p-4 space-y-2.5 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span
                  className="inline-flex items-center gap-1.5 text-xs font-extrabold"
                  style={{ color: "var(--engine-cortex)" }}
                >
                  <MaestroIcon name="cpu" size={14} />
                  <span>Antes del partido · Cortex IA</span>
                </span>
              </div>
              <p
                className="m-0 text-xs leading-relaxed"
                style={{ color: "var(--pl-text-secondary)" }}
              >
                {cortexSynthesisOverride ?? game.preGame.cortexSynthesis}
              </p>
            </div>

            {intelUnlocked && game.preGame.tacticalKeys.length > 0 ? (
              <div className="pt-2 hairline-t flex flex-wrap gap-1.5">
                {game.preGame.tacticalKeys.slice(0, 2).map((k, idx) => (
                  <span key={idx} className="pl-pill text-[11px]">
                    {k}
                  </span>
                ))}
              </div>
            ) : null}
          </div>

          {/* 2) Alineaciones y Bajas 60m */}
          <div className="glass-card glass-ring rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="m-0 text-sm font-extrabold">Alineaciones y bajas</h2>
              <span className="pl-pill pl-pill--info text-[10px]">
                {game.preGame.lineupStatusLabel}
              </span>
            </div>

            {intelUnlocked && game.preGame.absences.length > 0 ? (
              <div className="space-y-2">
                {game.preGame.absences.slice(0, 3).map((item, idx) => {
                  const pillTone =
                    item.status === "Confirmado XI"
                      ? "pl-pill pl-pill--success"
                      : item.status === "Baja"
                        ? "pl-pill pl-pill--danger"
                        : "pl-pill pl-pill--warning";
                  return (
                    <div
                      key={idx}
                      className="rounded-xl p-2.5 text-xs"
                      style={{ background: "var(--pl-surface)" }}
                    >
                      <div className="flex items-center justify-between gap-2 font-bold">
                        <span className="truncate">{item.player}</span>
                        <span className={`${pillTone} text-[10px] shrink-0`}>
                          {item.status}
                        </span>
                      </div>
                      <p
                        className="m-0 mt-0.5 text-[11px]"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        {item.impactNote}
                      </p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Bajas reportadas y estado de alineaciones disponibles con Pase PitchLab Ultra.
              </p>
            )}
          </div>

          {/* 3) ¿Dónde está el dinero? Quick Summary */}
          {!flow ? (
            <div className="glass-card glass-ring rounded-2xl p-4 space-y-2.5" data-no-market="">
              <h2 className="m-0 text-sm font-extrabold">¿Dónde está el dinero?</h2>
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Este partido todavía no tiene momios verificados. Mostramos solo la probabilidad del modelo.
              </p>
            </div>
          ) : (
          <div className="glass-card glass-ring rounded-2xl p-4 space-y-2.5 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="m-0 text-sm font-extrabold">¿Dónde está el dinero?</h2>
                <span className="pl-pill pl-pill--brand text-[10px] num">
                  {game.spacetime?.market?.bookLabel ?? "Mercado"}
                </span>
              </div>

              <div className="space-y-1.5 text-xs num">
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--pl-text-muted)" }}>
                    {game.home.shortName}: dinero / modelo
                  </span>
                  <strong>
                    {flow.homeShare} % / {(game.x12[0] * 100).toFixed(0)} %
                  </strong>
                </div>
                <PBar
                  p={flow.homeShare / 100}
                  lead={flow.homeShare >= 50}
                />

                <div className="flex items-center justify-between pt-1">
                  <span style={{ color: "var(--pl-text-muted)" }}>
                    {game.away.shortName}: dinero / modelo
                  </span>
                  <strong>
                    {flow.awayShare} % / {(game.x12[2] * 100).toFixed(0)} %
                  </strong>
                </div>
                <PBar
                  p={flow.awayShare / 100}
                  lead={flow.awayShare > 50}
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 hairline-t text-xs">
              <span
                className="truncate"
                style={{ color: "var(--pl-text-secondary)" }}
              >
                {flow.sharpNote}
              </span>
              <button
                type="button"
                className="pl-btn-glass text-[11px] min-h-7 px-2.5 shrink-0"
                onClick={() => setActiveTab("dinero")}
              >
                Detalle
              </button>
            </div>
          </div>
          )}
        </section>

        {/* Navegación interna del estudio */}
        <div className="seg-well" role="tablist" aria-label="Secciones del partido">
          {(
            [
              { id: "picks", label: `Picks (${game.picks.length})` },
              { id: "mercados", label: `Mercados (${game.markets.length})` },
              { id: "contexto", label: "Contexto" },
              { id: "dinero", label: "¿Dónde está el dinero?" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              data-section-tab={t.id}
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className="seg-btn"
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Pestaña 1: 2 Columnas Asimétricas (7: 5 Picks · 5: Debate de Suscriptores) */}
        {activeTab === "picks" ? (
          <section
            className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start"
            data-picks=""
          >
            <div className="lg:col-span-7 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-lg font-extrabold">
                  Picks de este partido
                </h2>
                {viewerRole === "tipster" || viewerRole === "admin" ? (
                  <span
                    className="text-xs font-semibold inline-flex items-center gap-1"
                    style={{ color: "var(--pl-brand)" }}
                  >
                    <MaestroIcon name="crown" size={13} />
                    <span>Elige cualquiera como tu Pick abierto semanal</span>
                  </span>
                ) : null}
              </div>

              <div className="space-y-3">
                {game.picks.map((pk) => (
                  <div key={pk.id} className="space-y-1.5">
                    <MultiPickRow pick={pk} gameStatus={game.status} />
                    {(viewerRole === "tipster" || viewerRole === "admin") &&
                    game.status !== "FT" ? (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="pl-btn-glass text-xs min-h-7 px-2.5 inline-flex items-center gap-1"
                          onClick={() => {
                            setSelectedTipsterPickId(pk.id);
                            pushToast(
                              `«${pk.label}» asignado como tu Pick abierto semanal en Portal Tipster.`,
                              "success",
                            );
                          }}
                        >
                          <MaestroIcon name="crown" size={12} />
                          <span>Usar como mi Pick abierto semanal</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {/* Hilo en vivo: Debate de Suscriptores del Partido */}
            <aside
              aria-label="Debate de suscriptores del partido"
              className="lg:col-span-5 glass-lens glass-ring rounded-3xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="m-0 text-lg font-extrabold">Opiniones de socios</h2>
                </div>
                {matchDebateItems.length > 0 ? (
                  <StackedAvatars
                    items={matchDebateItems.slice(0, 3).map((item, idx) => ({
                      initials: item.handle.replace(/^@/, "").slice(0, 2).toUpperCase(),
                      gradVar: `var(--avatar-grad-${(idx % 3) + 1})`,
                      label: item.handle,
                    }))}
                    extraCount={Math.max(0, matchDebateItems.length - 3)}
                  />
                ) : (
                  <span className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
                    0 publicaciones
                  </span>
                )}
              </div>

              {matchDebateItems.length > 0 ? (
                <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                  {matchDebateItems.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-2xl p-3 space-y-1.5 text-xs"
                      style={{ background: "var(--pl-surface)" }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5">
                          <strong className="font-extrabold">{item.handle}</strong>
                          <UserBadges roleLabel={item.roleBadge} />
                          {item.isExample ? <ExampleBadge /> : null}
                        </div>
                        <span
                          className="text-[11px] num font-bold"
                          style={{ color: "var(--pl-success)" }}
                        >
                          {item.record}
                        </span>
                      </div>
                      <p
                        className="m-0 leading-relaxed"
                        style={{ color: "var(--pl-text-secondary)" }}
                      >
                        {item.body}
                      </p>
                      <span
                        className="block text-[10px]"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        {item.createdAt}
                      </span>
                    </article>
                  ))}
                </div>
              ) : (
                <p
                  className="m-0 rounded-2xl p-3.5 text-xs leading-relaxed"
                  style={{ background: "var(--pl-surface)", color: "var(--pl-text-muted)" }}
                >
                  Aún no hay opiniones publicadas para este partido. Sé el primero en compartir tu
                  lectura.
                </p>
              )}

              <form onSubmit={handlePublishDebate} className="space-y-2 pt-2 hairline-t">
                <label
                  htmlFor="studio-debate-input"
                  className="text-xs font-bold block"
                >
                  Tu opinión sobre {matchLabelShort}
                </label>
                <textarea
                  id="studio-debate-input"
                  rows={2}
                  value={debateBody}
                  onChange={(e) => setDebateBody(e.target.value)}
                  placeholder="¿Qué ves en este partido?"
                  className="glass-input w-full p-2.5 text-xs resize-none"
                />
                {debateError ? (
                  <p
                    role="alert"
                    className="m-0 text-xs font-semibold"
                    style={{ color: "var(--pl-danger)" }}
                  >
                    {debateError}
                  </p>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <span />
                  <button
                    type="submit"
                    className="pl-btn-primary text-xs min-h-8 px-3 inline-flex items-center gap-1.5"
                  >
                    <MaestroIcon name="users" size={12} />
                    <span>Publicar opinión</span>
                  </button>
                </div>
              </form>
            </aside>
          </section>
        ) : null}

        {/* Pestaña 2: Matriz de Mercados + Filtros + Calculadora Momio + Sellar */}
        {activeTab === "mercados" ? (
          <section className="glass-card glass-ring rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="m-0 text-lg font-extrabold">
                  Mercados del partido
                </h2>
                <p
                  className="m-0 text-xs mt-0.5"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Probabilidad y momio justo de cada mercado. Escribe el momio de tu casa para ver si tiene ventaja.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label
                  htmlFor="studio-market-odds-input"
                  className="text-xs font-bold"
                >
                  Probar momio:
                </label>
                <input
                  id="studio-market-odds-input"
                  type="text"
                  value={marketUserOddsRaw}
                  onChange={(e) => setMarketUserOddsRaw(e.target.value)}
                  placeholder="Ej. -110 o 2.05"
                  className="glass-input px-3 py-1.5 text-xs font-bold num w-36"
                />
                {marketUserOddsRaw ? (
                  <button
                    type="button"
                    className="pl-btn-glass text-xs min-h-8 px-2.5"
                    onClick={() => setMarketUserOddsRaw("")}
                  >
                    Limpiar
                  </button>
                ) : null}
              </div>
            </div>

            {/* Píldoras de filtro por grupo de mercado */}
            <div
              className="seg-well"
              role="group"
              aria-label="Filtrar matriz por grupo de mercado"
            >
              {(
                [
                  { id: "all", label: "Todos" },
                  { id: "resultado", label: "Resultado" },
                  { id: "totales", label: "Totales" },
                  { id: "btts_handicap", label: "Ambos Anotan / Hándicap" },
                  { id: "doble", label: "Doble Oportunidad" },
                ] as const
              ).map((grp) => (
                <button
                  key={grp.id}
                  type="button"
                  className="seg-btn text-xs"
                  aria-pressed={marketGroupFilter === grp.id}
                  onClick={() => setMarketGroupFilter(grp.id)}
                >
                  {grp.label}
                </button>
              ))}
            </div>

            {game.markets.length === 0 ? (
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                Los mercados de este partido están disponibles con Pase PitchLab Ultra.
              </p>
            ) : filteredMarkets.length === 0 ? (
              <div
                className="rounded-2xl p-4 flex flex-wrap items-center justify-between gap-2 text-xs"
                style={{ background: "var(--pl-surface)" }}
              >
                <span style={{ color: "var(--pl-text-secondary)" }}>
                  No hay líneas en este grupo para {game.leagueLabel}.
                </span>
                <button
                  type="button"
                  className="pl-btn-glass text-xs min-h-8 px-3"
                  onClick={() => setMarketGroupFilter("all")}
                >
                  Ver todos los mercados
                </button>
              </div>
            ) : (
              <div
                className="pl-table-region"
                tabIndex={0}
                role="region"
                aria-label="Mercados y momios justos"
              >
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr
                      className="hairline-b text-xs"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      <th scope="col" className="py-2 pr-3">
                        Grupo
                      </th>
                      <th scope="col" className="py-2 pr-3">
                        Selección
                      </th>
                      <th scope="col" className="py-2 px-3">
                        Probabilidad
                      </th>
                      <th scope="col" className="py-2 px-2 text-right">
                        Justa
                      </th>
                      <th scope="col" className="py-2 px-2 text-right">
                        {parsedMarketUserDec ? "Tu Momio" : "Casa"}
                      </th>
                      <th scope="col" className="py-2 px-2 text-right">
                        Ventaja
                      </th>
                      <th scope="col" className="py-2 pl-2 text-right">
                        Acción
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMarkets.map((m, idx) => {
                      const activeBookDec =
                        parsedMarketUserDec && parsedMarketUserDec > 1
                          ? parsedMarketUserDec
                          : m.currentDecimal;
                      const activeEdgePts =
                        parsedMarketUserDec && parsedMarketUserDec > 1
                          ? (m.p - 1 / parsedMarketUserDec) * 100
                          : m.edgePts;

                      return (
                        <tr
                          key={`${m.market}-${m.selection}-${idx}`}
                          className="hairline-b"
                        >
                          <td
                            className="py-2.5 pr-3 text-xs font-semibold"
                            style={{ color: "var(--pl-text-muted)" }}
                          >
                            {m.group}
                          </td>
                          <td className="py-2.5 pr-3 font-bold">{m.label}</td>
                          <td className="py-2.5 px-3 w-44">
                            <div className="space-y-1">
                              <span className="text-xs num font-bold">
                                {(m.p * 100).toFixed(1)} %
                              </span>
                              <PBar p={m.p} lead={m.p >= 0.55} />
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-right num font-semibold">
                            {formatOddsValue(m.fairDecimal, oddsFormat)}
                          </td>
                          <td className="py-2.5 px-2 text-right num font-bold">
                            {activeBookDec === null ? "—" : formatOddsValue(activeBookDec, oddsFormat)}
                          </td>
                          <td
                            className="py-2.5 px-2 text-right num font-extrabold"
                            style={{
                              color:
                                activeEdgePts !== null && activeEdgePts >= 0
                                  ? "var(--pl-success)"
                                  : "var(--pl-text-muted)",
                            }}
                          >
                            {formatEdgePts(activeEdgePts)}
                          </td>
                          <td className="py-2.5 pl-2 text-right">
                            <button
                              type="button"
                              className="pl-btn-glass text-xs min-h-7 px-2.5 inline-flex items-center gap-1"
                              onClick={() => handleSealMarketRow(m, idx)}
                            >
                              <MaestroIcon name="plus" size={11} />
                              <span>Sellar</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {/* Pestaña 3: Contexto del partido y cruces directos */}
        {activeTab === "contexto" ? (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="glass-card glass-ring rounded-2xl p-5 space-y-3">
              <h2 className="m-0 text-lg font-extrabold">Contexto del partido</h2>
              <div className="space-y-2">
                {game.factors.map((f, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl p-3 flex items-center justify-between gap-3"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <div>
                      <strong className="block text-sm">{f.label}</strong>
                      {f.sub ? (
                        <span
                          className="text-xs"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          {f.sub}
                        </span>
                      ) : null}
                    </div>
                    <strong className="num text-sm font-extrabold">{f.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-card glass-ring rounded-2xl p-5 space-y-3">
              <h2 className="m-0 text-lg font-extrabold">
                Historial directo y descanso
              </h2>
              {game.restDays ? (
                <div
                  className="rounded-xl p-3 flex items-center justify-between text-xs num"
                  style={{ background: "var(--pl-surface)" }}
                >
                  <span style={{ color: "var(--pl-text-secondary)" }}>
                    Días de recuperación previos
                  </span>
                  <strong>
                    {game.home.shortName}: {game.restDays.home ?? "–"}d ·{" "}
                    {game.away.shortName}: {game.restDays.away ?? "–"}d
                  </strong>
                </div>
              ) : null}
              {game.headToHead.length > 0 ? (
                <ul className="m-0 p-0 list-none space-y-2 text-sm">
                  {game.headToHead.map((h, i) => (
                    <li
                      key={i}
                      className="rounded-xl p-2.5 flex items-center justify-between"
                      style={{ background: "var(--pl-surface)" }}
                    >
                      <span
                        className="text-xs"
                        style={{ color: "var(--pl-text-muted)" }}
                      >
                        {h.date}
                      </span>
                      <span className="font-semibold num">
                        {h.home} {h.homeGoals}–{h.awayGoals} {h.away}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  No hay enfrentamientos recientes entre estos equipos.
                </p>
              )}
            </div>
          </section>
        ) : null}

        {/* Pestaña 4: ¿Dónde está el dinero? */}
        {activeTab === "dinero" && !flow ? (
          <section className="glass-card glass-ring rounded-2xl p-5 space-y-2" data-market-pulse="">
            <h2 className="m-0 text-lg font-extrabold">¿Dónde está el dinero?</h2>
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Sin momios verificados para este partido. Cuando la casa publique líneas, aquí verás el reparto del mercado frente al modelo.
            </p>
          </section>
        ) : null}
        {activeTab === "dinero" && flow ? (
          <section
            className="glass-card glass-ring rounded-2xl p-5 space-y-4"
            data-market-pulse=""
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="m-0 text-lg font-extrabold">
                  ¿Dónde está el dinero?
                </h2>
                <p
                  className="m-0 text-xs"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Hacia dónde se mueve el dinero de las apuestas, comparado con la probabilidad del modelo.
                </p>
              </div>
              <span className="pl-pill pl-pill--info">
                {game.spacetime?.market?.bookLabel ?? "Mercado"}
                {Number.isFinite(Date.parse(game.spacetime?.market?.asOfUtc ?? dataset.generatedAt))
                  ? ` · Corte ${new Date(
                      game.spacetime?.market?.asOfUtc ?? dataset.generatedAt,
                    ).toLocaleDateString("es-MX", {
                      timeZone: "America/Mexico_City",
                      day: "2-digit",
                      month: "short",
                    })}`
                  : ""}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 num">
              <div
                className="rounded-xl p-3.5 space-y-2"
                style={{ background: "var(--pl-surface)" }}
              >
                <span
                  className="block text-xs"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Flujo hacia {game.home.shortName}
                </span>
                <strong className="text-xl font-extrabold block">
                  {flow.homeShare} %
                </strong>
                <PBar
                  p={flow.homeShare / 100}
                  lead={flow.homeShare >= 50}
                />
                <span
                  className="block text-xs font-semibold"
                  style={{ color: "var(--pl-brand)" }}
                >
                  Modelo: {(game.x12[0] * 100).toFixed(1)} %
                </span>
              </div>

              {flow.drawShare !== undefined ? (
                <div
                  className="rounded-xl p-3.5 space-y-2"
                  style={{ background: "var(--pl-surface)" }}
                >
                  <span
                    className="block text-xs"
                    style={{ color: "var(--pl-text-muted)" }}
                  >
                    Flujo hacia Empate
                  </span>
                  <strong className="text-xl font-extrabold block">
                    {flow.drawShare} %
                  </strong>
                  <PBar p={flow.drawShare / 100} />
                  <span
                    className="block text-xs font-semibold"
                    style={{ color: "var(--pl-brand)" }}
                  >
                    Modelo: {(game.x12[1] * 100).toFixed(1)} %
                  </span>
                </div>
              ) : null}

              <div
                className="rounded-xl p-3.5 space-y-2"
                style={{ background: "var(--pl-surface)" }}
              >
                <span
                  className="block text-xs"
                  style={{ color: "var(--pl-text-muted)" }}
                >
                  Flujo hacia {game.away.shortName}
                </span>
                <strong className="text-xl font-extrabold block">
                  {flow.awayShare} %
                </strong>
                <PBar
                  p={flow.awayShare / 100}
                  lead={flow.awayShare > 50}
                />
                <span
                  className="block text-xs font-semibold"
                  style={{ color: "var(--pl-brand)" }}
                >
                  Modelo: {(game.x12[2] * 100).toFixed(1)} %
                </span>
              </div>
            </div>

            <NoticeCard
              tone="info"
              icon="activity"
              badgeText="Lectura"
              title="Qué significa"
            >
              {flow.sharpNote}
            </NoticeCard>
          </section>
        ) : null}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
