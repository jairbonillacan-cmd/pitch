"use client";

import React, { useMemo, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { LeagueBadge, PBar, ProbSplit, TeamBadge } from "../../sports.js";
import {
  formatOddsValue,
  getSessionWatermark,
  isPreGameIntelUnlocked,
} from "../access-guard.js";
import { MatchTicketCard, MultiPickRow } from "../components/MatchTicketCard.js";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome.js";
import { usePlatform } from "../platform-provider.js";
import type { RiskBand } from "../types.js";

export function JornadaClubView(): React.JSX.Element {
  const {
    dataset,
    favoriteLeagues,
    riskPreference,
    generateAutoParlay,
    navigateTo,
  } = usePlatform();

  const [leagueFilter, setLeagueFilter] = useState<string>("all");

  const upcomingGames = useMemo(
    () => dataset.games.filter((g) => g.status !== "FT"),
    [dataset.games],
  );
  const activePool = upcomingGames.length > 0 ? upcomingGames : dataset.games;

  const filteredGames = useMemo(() => {
    if (leagueFilter === "all") return activePool;
    if (leagueFilter === "favs") {
      const favSet = new Set(favoriteLeagues);
      const favMatches = activePool.filter((g) => favSet.has(g.league));
      return favMatches.length > 0 ? favMatches : activePool;
    }
    return activePool.filter((g) => g.league === leagueFilter);
  }, [activePool, leagueFilter, favoriteLeagues]);

  const spotlight = filteredGames[0] ?? dataset.games[0];

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app">
        {/* Encabezado ejecutivo de Jornada */}
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <span className="pl-pill pl-pill--brand">
              PitchLab Spacetime Suite v2.1 · Jornada Activa
            </span>
            <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
              Centro de Mando · Radiografías y Multi-Picks
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="pl-btn-accent text-xs"
              onClick={() => {
                generateAutoParlay({
                  leagues: favoriteLeagues,
                  risk: riskPreference,
                  legCount: 3,
                  allowSgp: false,
                });
                navigateTo("/app/parlays");
              }}
            >
              ✦ Auto-Armar Parlay ({riskPreference}) →
            </button>
            <a
              href="/app/picks"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/app/picks");
              }}
              className="pl-btn-glass text-xs"
            >
              Ver todos los picks (4–5/juego)
            </a>
          </div>
        </section>

        {/* Filtro rápido de competición */}
        <div
          className="seg-well"
          role="group"
          aria-label="Filtrar jornada por competición"
        >
          <button
            type="button"
            className="seg-btn"
            aria-pressed={leagueFilter === "all"}
            onClick={() => setLeagueFilter("all")}
          >
            Todas ({activePool.length})
          </button>
          <button
            type="button"
            className="seg-btn"
            aria-pressed={leagueFilter === "favs"}
            onClick={() => setLeagueFilter("favs")}
          >
            Mis Ligas
          </button>
          {dataset.leagues.map((lg) => (
            <button
              key={lg.league}
              type="button"
              className="seg-btn"
              aria-pressed={leagueFilter === lg.league}
              onClick={() => setLeagueFilter(lg.league)}
            >
              <LeagueBadge league={lg.league} label={lg.label} size={15} />
              <span>{lg.label}</span>
            </button>
          ))}
        </div>

        {/* Partido Estelar con Radiografía Cortex IA */}
        {spotlight ? (
          <section
            aria-label="Partido estelar de la jornada"
            className="glass-lens glass-ring glass-ring--featured rounded-3xl p-5 sm:p-6 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <LeagueBadge
                  league={spotlight.league}
                  label={spotlight.leagueLabel}
                  size={22}
                />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Estelar · {spotlight.leagueLabel} · {spotlight.round} ·{" "}
                  {spotlight.status === "FT" ? "Finalizado FT" : spotlight.kickoffLocal}
                </span>
              </div>
              <a
                href={`/app/${spotlight.league}/games/${spotlight.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  navigateTo(`/app/${spotlight.league}/games/${spotlight.id}`);
                }}
                className="pl-btn-primary text-xs min-h-8 px-3"
              >
                Abrir Estudio Completo ({spotlight.picks.length} picks) →
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="flex items-center gap-3">
                <TeamBadge
                  league={spotlight.league}
                  slug={spotlight.home.slug}
                  name={spotlight.home.name}
                  size={44}
                />
                <div>
                  <h2 className="m-0 text-xl font-extrabold">{spotlight.home.name}</h2>
                  <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    {spotlight.home.record}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 md:justify-end">
                <div className="md:text-right">
                  <h2 className="m-0 text-xl font-extrabold">{spotlight.away.name}</h2>
                  <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    {spotlight.away.record}
                  </span>
                </div>
                <TeamBadge
                  league={spotlight.league}
                  slug={spotlight.away.slug}
                  name={spotlight.away.name}
                  size={44}
                />
              </div>
            </div>

            <div
              className="rounded-2xl p-4 text-xs space-y-1.5"
              style={{
                background: "var(--pl-surface)",
                border: "1px solid var(--pl-border)",
              }}
            >
              <strong style={{ color: "var(--engine-cortex)" }}>
                ✦ Síntesis Ejecutiva · PitchLab Cortex IA
              </strong>
              <p className="m-0 leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
                {spotlight.preGame.cortexSynthesis}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {spotlight.picks.slice(0, 2).map((pk) => (
                <MultiPickRow
                  key={pk.id}
                  pick={pk}
                  gameStatus={spotlight.status}
                  compact
                />
              ))}
            </div>
          </section>
        ) : null}

        {/* Malla de tarjetas de la jornada */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-lg font-extrabold">
              Cartelera de Partidos ({filteredGames.length})
            </h2>
            <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Pasa el cursor para sincronizar la atmósfera del estadio
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredGames.slice(0, 12).map((g, idx) => (
              <MatchTicketCard key={g.id} game={g} featured={idx === 0} />
            ))}
          </div>
        </section>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function MultiPicksClubView(): React.JSX.Element {
  const { dataset } = usePlatform();
  const [riskFilter, setRiskFilter] = useState<"all" | RiskBand>("all");
  const [leagueFilter, setLeagueFilter] = useState<string>("all");
  const [onlyHighConf, setOnlyHighConf] = useState<boolean>(false);

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
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/picks">
        <section className="space-y-2">
          <span className="pl-pill pl-pill--brand">
            4 a 5 Picks por Partido · Spacetime Suite v2.1
          </span>
          <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
            Explorador Multi-Picks del Día
          </h1>
          <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            Cada encuentro ofrece hasta 5 ángulos calibrados: Pick Principal, Escudo Conservador,
            Línea de Totales, Lectura Táctica y Cuota Alta de Valor. Agrégalos directo a tu Parlay
            o séllalos en tu Bitácora.
          </p>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="seg-well" role="group" aria-label="Filtrar por perfil de riesgo">
            {(
              [
                { id: "all", label: "Todos los perfiles" },
                { id: "conservador", label: "Escudo Conservador" },
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
              className="pl-btn-glass text-xs min-h-8 px-3"
            >
              {onlyHighConf ? "✓ Prob. ≥ 62 %" : "Solo Prob. ≥ 62 %"}
            </button>
          </div>
        </div>

        <div className="space-y-5">
          {visibleGames.slice(0, 10).map(({ game, picks }) => (
            <section
              key={game.id}
              className="glass-card glass-ring rounded-2xl p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <TeamBadge
                    league={game.league}
                    slug={game.home.slug}
                    name={game.home.name}
                    size={26}
                  />
                  <TeamBadge
                    league={game.league}
                    slug={game.away.slug}
                    name={game.away.name}
                    size={26}
                  />
                  <div>
                    <h2 className="m-0 text-base font-extrabold">
                      {game.home.name} vs {game.away.name}
                    </h2>
                    <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      {game.leagueLabel} · {game.round} · {game.kickoffLocal}
                    </span>
                  </div>
                </div>
                <span className="pl-pill num">{picks.length} selecciones</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {picks.map((pk) => (
                  <MultiPickRow key={pk.id} pick={pk} gameStatus={game.status} />
                ))}
              </div>
            </section>
          ))}
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

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath={`/app/${leagueSummary.league}`}>
        <section className="glass-lens glass-ring rounded-3xl p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <LeagueBadge
              league={leagueSummary.league}
              label={leagueSummary.label}
              size={44}
            />
            <div>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--pl-brand)" }}>
                {leagueSummary.season} · {leagueSummary.roundLabel}
              </span>
              <h1 id="panel-league-name" className="m-0 text-2xl sm:text-3xl font-extrabold">
                {leagueSummary.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs num">
            <span className="pl-pill pl-pill--brand">
              {leagueSummary.upcomingCount} por jugar
            </span>
            <span className="pl-pill pl-pill--success">
              {leagueSummary.finishedCount} auditados FT
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
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {upcoming.map((g, idx) => (
                <MatchTicketCard key={g.id} game={g} featured={idx === 0} />
              ))}
            </div>
          </section>
        ) : null}

        {finished.length > 0 ? (
          <section className="space-y-3">
            <h2 className="m-0 text-lg font-extrabold">
              Resultados cerrados FT ({finished.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {finished.map((g) => (
                <MatchTicketCard key={g.id} game={g} />
              ))}
            </div>
          </section>
        ) : null}

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
                <tr className="hairline-b text-xs uppercase" style={{ color: "var(--pl-text-muted)" }}>
                  <th scope="col" className="py-2 pr-3">#</th>
                  <th scope="col" className="py-2 pr-3">Club</th>
                  <th scope="col" className="py-2 px-2 text-right">PJ</th>
                  <th scope="col" className="py-2 px-2 text-right">G</th>
                  <th scope="col" className="py-2 px-2 text-right">E</th>
                  <th scope="col" className="py-2 px-2 text-right">P</th>
                  <th scope="col" className="py-2 px-2 text-right">DG</th>
                  <th scope="col" className="py-2 pl-2 text-right">Pts</th>
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
        ) : null}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function MatchStudioClubView({
  leagueId,
  gameId,
}: {
  leagueId: LeagueId;
  gameId: string;
}): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    oddsFormat,
    watchlistGameIds,
    toggleWatchlistGame,
    setSelectedTipstarPickId,
    navigateTo,
    pushToast,
  } = usePlatform();

  const [activeTab, setActiveTab] = useState<"picks" | "mercados" | "contexto" | "dinero">("picks");

  const game = useMemo(
    () =>
      dataset.games.find((g) => g.id === gameId) ??
      dataset.games.find((g) => g.league === leagueId) ??
      dataset.games[0]!,
    [dataset.games, gameId, leagueId],
  );

  const isNfl = game.sport === "american-football" || game.league === "nfl";
  const isFinished = game.status === "FT" && game.score !== undefined;
  const intelUnlocked = isPreGameIntelUnlocked(game, viewerRole);
  const watermark = getSessionWatermark(viewerRole);
  const watched = watchlistGameIds.includes(game.id);

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath={`/app/${game.league}/games/${game.id}`}>
        <div className="flex items-center justify-between gap-2">
          <a
            href={`/app/${game.league}`}
            onClick={(e) => {
              e.preventDefault();
              navigateTo(`/app/${game.league}`);
            }}
            className="pl-btn-glass text-xs min-h-8 px-3"
          >
            ← Volver a {game.leagueLabel}
          </a>

          <button
            type="button"
            className="pl-btn-glass text-xs min-h-8 px-3"
            onClick={() => toggleWatchlistGame(game.id)}
          >
            {watched ? "🔔 Alerta 60m activa" : "Activar alerta 60m"}
          </button>
        </div>

        {/* Cabecera de Radiografía del Partido */}
        <section
          className="glass-lens glass-ring glass-ring--featured rounded-3xl p-6 space-y-5 relative overflow-hidden"
          data-match-studio={game.id}
        >
          <span className="pl-watermark num" aria-hidden="true">
            {watermark}
          </span>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <LeagueBadge league={game.league} label={game.leagueLabel} size={22} />
              <span id="modal-league" className="text-xs font-bold uppercase tracking-wider">
                {game.leagueLabel} · {game.round} · {game.venue}
              </span>
            </div>
            <span className="pl-pill pl-pill--brand num">
              {isFinished ? "Finalizado FT" : `${game.dayLabel} · ${game.kickoffLocal}`}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            <div className="flex items-center gap-3.5">
              <TeamBadge
                league={game.league}
                slug={game.home.slug}
                name={game.home.name}
                size={48}
              />
              <div>
                <h1 className="m-0 text-xl sm:text-2xl font-extrabold">{game.home.name}</h1>
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
              ) : (
                <strong className="num text-2xl font-extrabold block" style={{ color: "var(--pl-brand)" }}>
                  Proy. {game.projection.home.toFixed(isNfl ? 1 : 2)} –{" "}
                  {game.projection.away.toFixed(isNfl ? 1 : 2)}
                </strong>
              )}
              <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                Total esp. {game.projection.total.toFixed(isNfl ? 1 : 2)} · Confianza{" "}
                {game.confidenceScore}/100
              </span>
            </div>

            <div className="flex items-center gap-3.5 md:justify-end">
              <div className="md:text-right">
                <h2 className="m-0 text-xl sm:text-2xl font-extrabold">{game.away.name}</h2>
                <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  {game.away.record}
                </span>
              </div>
              <TeamBadge
                league={game.league}
                slug={game.away.slug}
                name={game.away.name}
                size={48}
              />
            </div>
          </div>

          <ProbSplit
            probabilities={isNfl ? [game.x12[0], game.x12[2]] : game.x12}
            labels={
              isNfl
                ? [game.home.shortName, game.away.shortName]
                : [game.home.shortName, "Empate", game.away.shortName]
            }
          />

          {/* Síntesis Previa Cortex IA + Alineaciones 60m */}
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{
              background: "var(--pl-surface)",
              border: "1px solid var(--pl-border)",
            }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <strong style={{ color: "var(--engine-cortex)" }}>
                ✦ Radiografía Pre-Partido · PitchLab Cortex IA
              </strong>
              <span className="pl-pill pl-pill--info">
                {game.preGame.lineupStatusLabel}
              </span>
            </div>
            <p className="m-0 text-sm leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
              {game.preGame.cortexSynthesis}
            </p>

            {intelUnlocked && game.preGame.absences.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                {game.preGame.absences.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl p-2.5 text-xs"
                    style={{ background: "var(--pl-surface-elevated)" }}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span>{item.player}</span>
                      <span
                        className={
                          item.status === "Confirmado XI"
                            ? "pl-pill pl-pill--success"
                            : "pl-pill pl-pill--warning"
                        }
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="m-0 mt-1" style={{ color: "var(--pl-text-muted)" }}>
                      {item.impactNote}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        {/* Navegación interna del estudio */}
        <div className="seg-well" role="tablist" aria-label="Secciones de la radiografía">
          {(
            [
              { id: "picks", label: `Multi-Picks (${game.picks.length})` },
              { id: "mercados", label: `Mercados & Geodesic (${game.markets.length})` },
              { id: "contexto", label: "Contexto & H2H" },
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

        {/* Pestaña 1: Los 5 Picks del Partido */}
        {activeTab === "picks" ? (
          <section className="space-y-3" data-picks="">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-lg font-extrabold">
                5 Ángulos Cuantitativos de Este Partido
              </h2>
              {viewerRole === "tipstar" || viewerRole === "admin" ? (
                <span className="text-xs font-semibold" style={{ color: "var(--pl-brand)" }}>
                  Modo Tipstar activo: puedes elegir cualquiera como tu Pick Abierto Semanal
                </span>
              ) : null}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {game.picks.map((pk) => (
                <div key={pk.id} className="space-y-1.5">
                  <MultiPickRow pick={pk} gameStatus={game.status} />
                  {(viewerRole === "tipstar" || viewerRole === "admin") &&
                  game.status !== "FT" ? (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        className="pl-btn-glass text-xs min-h-7 px-2.5"
                        onClick={() => {
                          setSelectedTipstarPickId(pk.id);
                          pushToast(
                            `«${pk.label}» asignado como tu Pick Abierto Semanal en Portal Tipstar.`,
                            "success",
                          );
                        }}
                      >
                        ✦ Usar como mi Pick Abierto Semanal
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Pestaña 2: Tabla completa de Mercados y Momio Justo Geodesic */}
        {activeTab === "mercados" ? (
          <section className="glass-card glass-ring rounded-2xl p-5 space-y-3">
            <h2 className="m-0 text-lg font-extrabold">
              Matriz de Mercados · Momio Justo Sin Vig (Geodesic v1.0)
            </h2>
            {game.markets.length === 0 ? (
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                Activa Pase Total para inspeccionar los ~20 mercados calibrados de este partido.
              </p>
            ) : (
              <div
                className="pl-table-region"
                tabIndex={0}
                role="region"
                aria-label="Matriz completa de mercados y momios justos Geodesic"
              >
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="hairline-b text-xs uppercase" style={{ color: "var(--pl-text-muted)" }}>
                      <th scope="col" className="py-2 pr-3">Grupo</th>
                      <th scope="col" className="py-2 pr-3">Selección</th>
                      <th scope="col" className="py-2 px-3">Probabilidad</th>
                      <th scope="col" className="py-2 px-2 text-right">Justa</th>
                      <th scope="col" className="py-2 px-2 text-right">Casa</th>
                      <th scope="col" className="py-2 pl-2 text-right">Ventaja</th>
                    </tr>
                  </thead>
                  <tbody>
                    {game.markets.map((m, idx) => (
                      <tr key={`${m.market}-${m.selection}-${idx}`} className="hairline-b">
                        <td className="py-2.5 pr-3 text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
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
                        <td className="py-2.5 px-2 text-right num">
                          {formatOddsValue(m.currentDecimal, oddsFormat)}
                        </td>
                        <td
                          className="py-2.5 pl-2 text-right num font-extrabold"
                          style={{
                            color:
                              m.edgePts >= 0 ? "var(--pl-success)" : "var(--pl-text-muted)",
                          }}
                        >
                          {m.edgePts >= 0 ? `+${m.edgePts.toFixed(1)}` : m.edgePts.toFixed(1)} pts
                        </td>
                      </tr>
                    ))}
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
                        <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
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
              <h2 className="m-0 text-lg font-extrabold">Historial directo y descanso</h2>
              {game.restDays ? (
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                  Días de recuperación: <strong>{game.home.shortName}</strong>{" "}
                  {game.restDays.home ?? "–"}d · <strong>{game.away.shortName}</strong>{" "}
                  {game.restDays.away ?? "–"}d
                </p>
              ) : null}
              {game.headToHead.length > 0 ? (
                <ul className="m-0 p-0 list-none space-y-2 text-sm">
                  {game.headToHead.map((h, i) => (
                    <li
                      key={i}
                      className="rounded-xl p-2.5 flex items-center justify-between"
                      style={{ background: "var(--pl-surface)" }}
                    >
                      <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
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
                  Sin enfrentamientos recientes en la ventana actual; los motores ponderan fuerza
                  relativa de liga.
                </p>
              )}
            </div>
          </section>
        ) : null}

        {/* Pestaña 4: ¿Dónde está el dinero? */}
        {activeTab === "dinero" ? (
          <section
            className="glass-card glass-ring rounded-2xl p-5 space-y-4"
            data-market-pulse=""
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="m-0 text-lg font-extrabold">
                  ¿Dónde está el dinero? · Liquidez y Sentimiento vs. Modelo
                </h2>
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Comparativa limpia entre participación de volumen y probabilidad justa de Spacetime Suite
                </p>
              </div>
              <span className="pl-pill pl-pill--info">
                Volumen: {game.preGame.moneyFlow.volumeTier}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 num">
              <div className="rounded-xl p-3.5" style={{ background: "var(--pl-surface)" }}>
                <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Flujo hacia {game.home.shortName}
                </span>
                <strong className="text-xl font-extrabold">
                  {game.preGame.moneyFlow.homeShare} %
                </strong>
                <span className="block text-xs" style={{ color: "var(--pl-brand)" }}>
                  Modelo: {(game.x12[0] * 100).toFixed(1)} %
                </span>
              </div>

              {game.preGame.moneyFlow.drawShare !== undefined ? (
                <div className="rounded-xl p-3.5" style={{ background: "var(--pl-surface)" }}>
                  <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    Flujo hacia Empate
                  </span>
                  <strong className="text-xl font-extrabold">
                    {game.preGame.moneyFlow.drawShare} %
                  </strong>
                  <span className="block text-xs" style={{ color: "var(--pl-brand)" }}>
                    Modelo: {(game.x12[1] * 100).toFixed(1)} %
                  </span>
                </div>
              ) : null}

              <div className="rounded-xl p-3.5" style={{ background: "var(--pl-surface)" }}>
                <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Flujo hacia {game.away.shortName}
                </span>
                <strong className="text-xl font-extrabold">
                  {game.preGame.moneyFlow.awayShare} %
                </strong>
                <span className="block text-xs" style={{ color: "var(--pl-brand)" }}>
                  Modelo: {(game.x12[2] * 100).toFixed(1)} %
                </span>
              </div>
            </div>

            <p className="m-0 text-xs font-semibold" style={{ color: "var(--pl-text-secondary)" }}>
              {game.preGame.moneyFlow.sharpNote}
            </p>
          </section>
        ) : null}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
