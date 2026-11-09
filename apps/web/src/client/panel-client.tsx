"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import type { MatchAnalysis } from "@pitchlab/contracts";
import { getMascotPath } from "@pitchlab/sports-assets";
import {
  BrandLogo,
  ThemeToggle,
  LeagueBadge,
  Freshness,
  MatchCard,
  AnalysisDialog,
  EmptyState,
  ErrorState,
} from "@pitchlab/ui";
import type { SnapshotEnvelope } from "../server/snapshots.js";

export function PanelClient({
  league,
  envelope,
  leagueAvailability,
  initialGameId,
}: {
  league: "liga-mx" | "premier-league" | "laliga" | "nfl";
  envelope: SnapshotEnvelope;
  leagueAvailability: Record<"liga-mx" | "premier-league" | "laliga" | "nfl", boolean>;
  initialGameId?: string;
}): React.JSX.Element {
  const router = useRouter();
  const snapshot = envelope.data;
  const games = snapshot?.games ?? [];
  const seenGamesRef = useRef<Set<string>>(new Set());

  const [activeDay, setActiveDay] = useState<string>("all");
  const [skipTrace, setSkipTrace] = useState<boolean>(Boolean(initialGameId));
  const [selectedMatch, setSelectedMatch] = useState<MatchAnalysis | null>(
    () => {
      if (!initialGameId) return null;
      return games.find((g) => g.id === initialGameId) ?? null;
    },
  );

  useEffect(() => {
    setActiveDay("all");
  }, [league]);

  useEffect(() => {
    if (initialGameId) {
      const found = games.find((g) => g.id === initialGameId) ?? null;
      setSkipTrace(true);
      setSelectedMatch(found);
    }
  }, [initialGameId, games]);

  const handleSelectMatch = useCallback(
    (match: MatchAnalysis) => {
      const key = `${league}:${match.id}`;
      const alreadySeen = seenGamesRef.current.has(key);
      seenGamesRef.current.add(key);
      setSkipTrace(alreadySeen);
      setSelectedMatch(match);
      if (typeof window !== "undefined") {
        window.history.pushState(
          null,
          "",
          `/app/${league}/games/${encodeURIComponent(match.id)}`,
        );
      }
    },
    [league],
  );

  const handleCloseModal = useCallback(() => {
    setSelectedMatch(null);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `/app/${league}`);
    }
  }, [league]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/beta/logout", { method: "POST" });
    } catch (err) {
      void err;
    }
    router.push("/");
  }, [router]);

  const filteredGames = useMemo(
    () =>
      activeDay === "all"
        ? games
        : games.filter((g) => g.day === activeDay),
    [games, activeDay],
  );

  const dayGroups = useMemo(() => {
    const groups = new Map<string, MatchAnalysis[]>();
    for (const g of filteredGames) {
      const list = groups.get(g.day) ?? [];
      list.push(g);
      groups.set(g.day, list);
    }
    return Array.from(groups.entries());
  }, [filteredGames]);

  const days = snapshot?.days ?? [
    {
      id: "all",
      label: league === "nfl" ? "Toda la semana" : "Toda la jornada",
    },
  ];

  const leagueMascot = league;

  return (
    <>
      <a className="skip" href="#games">
        Saltar a los partidos
      </a>

      <header className="app-header panel-header">
        <div className="wrap">
          <a className="logo" href="/" aria-label="PitchLab · Inicio">
            <BrandLogo variant="horizontal" width={148} height={29} />
          </a>
          <div className="right">
            <a className="btn btn-ghost method" href="/#como">
              Cómo funciona
            </a>
            <ThemeToggle />
            <button
              className="btn btn-ghost"
              type="button"
              data-logout=""
              onClick={handleLogout}
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <nav className="lswitch" aria-label="Ligas">
        <div className="wrap" id="lswitch">
          <button
            className="lchip league-tab"
            type="button"
            data-league="liga-mx"
            disabled={!leagueAvailability["liga-mx"]}
            aria-current={league === "liga-mx" ? "page" : undefined}
            onClick={() => router.push("/app/liga-mx")}
          >
            <LeagueBadge league="liga-mx" size={26} />
            Liga MX
            {!leagueAvailability["liga-mx"] ? (
              <span className="tag">Pronto</span>
            ) : null}
          </button>

          <button
            className="lchip league-tab"
            type="button"
            data-league="premier-league"
            aria-current={league === "premier-league" ? "page" : undefined}
            onClick={() => router.push("/app/premier-league")}
          >
            <LeagueBadge league="premier-league" size={26} />
            Premier
          </button>

          <button
            className="lchip league-tab"
            type="button"
            data-league="laliga"
            disabled={!leagueAvailability["laliga"]}
            aria-current={league === "laliga" ? "page" : undefined}
            onClick={() => router.push("/app/laliga")}
          >
            <LeagueBadge league="laliga" size={26} />
            LaLiga
            {!leagueAvailability["laliga"] ? <span className="tag">Pronto</span> : null}
          </button>

          <button
            className="lchip league-tab"
            type="button"
            data-league="nfl"
            aria-current={league === "nfl" ? "page" : undefined}
            onClick={() => router.push("/app/nfl")}
          >
            <LeagueBadge league="nfl" size={26} />
            NFL
          </button>

          <button
            className="lchip league-tab"
            type="button"
            data-league="nhl"
            disabled
          >
            <LeagueBadge league="nhl" size={26} />
            NHL
            <span className="tag">Pronto</span>
          </button>

          <button
            className="lchip league-tab"
            type="button"
            data-league="mlb"
            disabled
          >
            <LeagueBadge league="mlb" size={26} />
            MLB
            <span className="tag">Pronto</span>
          </button>
        </div>
      </nav>

      <main id="main">
        <section className="lhead">
          <div className="wrap" id="lhead">
            <LeagueBadge league={league} size={56} />
            <div>
              <h1 className="h1" id="panel-league-name">
                {snapshot?.leagueLabel ??
                  (league === "nfl"
                    ? "NFL"
                    : league === "liga-mx"
                      ? "Liga MX"
                      : league === "laliga"
                        ? "LaLiga"
                        : "Premier League")}
              </h1>
              <div className="meta">
                <span className="secondary" id="panel-league-round">
                  {snapshot?.season ?? "2026"} ·{" "}
                  {snapshot?.roundLabel ?? "Jornada"}
                </span>
                {snapshot?.generatedAt ? (
                  <Freshness generatedAt={snapshot.generatedAt} />
                ) : null}
                <span className="tag tag-model">
                  <span className="dot" />
                  Beta cerrada
                </span>
              </div>
            </div>
            <div className="pic mascot" aria-hidden="true">
              <img
                src={getMascotPath(leagueMascot)}
                alt=""
                width={170}
                height={170}
              />
            </div>
          </div>
        </section>

        <nav className="days" aria-label="Filtrar por día">
          <div className="wrap" id="day-chips">
            {days.map((d) => {
              const count =
                d.id === "all"
                  ? games.length
                  : games.filter((g) => g.day === d.id).length;
              return (
                <button
                  key={d.id}
                  type="button"
                  className="chip day-chip"
                  data-day={d.id}
                  aria-pressed={activeDay === d.id}
                  onClick={() => setActiveDay(d.id)}
                >
                  {d.label} <span className="count">{count}</span>
                </button>
              );
            })}
          </div>
        </nav>

        <div className="wrap" id="games" tabIndex={-1}>
          {envelope.state === "error" ? (
            <ErrorState
              message={
                envelope.error?.message ??
                "No pudimos cargar los datos de la jornada."
              }
              code={envelope.error?.code ?? "UPSTREAM"}
              onRetry={() => router.refresh()}
            />
          ) : dayGroups.length === 0 ? (
            <EmptyState
              message={
                games.length === 0
                  ? "Esta liga estará disponible pronto con datos verificados."
                  : "No hay partidos este día."
              }
              actionLabel={
                games.length === 0
                  ? "Ir a Premier League"
                  : "Ver toda la jornada"
              }
              onAction={() => {
                if (games.length === 0) {
                  router.push("/app/premier-league");
                } else {
                  setActiveDay("all");
                }
              }}
            />
          ) : (
            dayGroups.map(([dayId, list]) => (
              <section
                className="day"
                key={dayId}
                aria-labelledby={`d-${dayId}`}
              >
                <h2 id={`d-${dayId}`}>{list[0]?.dayLabel ?? dayId}</h2>
                <ul className="cards">
                  {list.map((match) => (
                    <li key={match.id}>
                      <MatchCard
                        match={match}
                        onSelect={handleSelectMatch}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </main>

      <AnalysisDialog
        match={selectedMatch}
        open={selectedMatch !== null}
        onClose={handleCloseModal}
        skipTrace={skipTrace}
      />
    </>
  );
}
