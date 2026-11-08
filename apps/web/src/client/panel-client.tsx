"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type {
  LeagueId,
  MatchAnalysis,
} from "@pitchlab/contracts";
import { getLeagueEmblemPath } from "@pitchlab/sports-assets";
import {
  BrandLogo,
  ThemeToggle,
  PublicFooter,
  Icon,
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
  league: "liga-mx" | "premier-league" | "nfl";
  envelope: SnapshotEnvelope;
  leagueAvailability: Record<"liga-mx" | "premier-league" | "nfl", boolean>;
  initialGameId?: string;
}): React.JSX.Element {
  const router = useRouter();
  const snapshot = envelope.data;
  const games = snapshot?.games ?? [];

  const [activeDay, setActiveDay] = useState<string>("all");
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
      setSelectedMatch(found);
    }
  }, [initialGameId, games]);

  const handleSelectMatch = useCallback(
    (match: MatchAnalysis) => {
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

  const filteredGames =
    activeDay === "all"
      ? games
      : games.filter((g) => g.day === activeDay);

  const days = snapshot?.days ?? [{ id: "all", label: "Todos" }];

  return (
    <>
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>

      <header className="panel-header">
        <div className="panel-header-inner">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-4)",
              flexWrap: "wrap",
            }}
          >
            <a className="brand-mark" href="/" aria-label="PitchLab — Inicio">
              <BrandLogo variant="horizontal" width={133} height={26} />
            </a>

            <div
              className="league-tabs"
              role="tablist"
              aria-label="Ligas disponibles"
            >
              {leagueAvailability["liga-mx"] ? (
                <button
                  className="league-tab"
                  role="tab"
                  type="button"
                  aria-selected={league === "liga-mx"}
                  data-league="liga-mx"
                  onClick={() => router.push("/app/liga-mx")}
                >
                  <img
                    src={getLeagueEmblemPath("liga-mx")}
                    alt=""
                    width={18}
                    height={18}
                  />
                  <span>Liga MX</span>
                </button>
              ) : (
                <button
                  className="league-tab"
                  role="tab"
                  type="button"
                  aria-selected="false"
                  disabled
                  title="Disponible próximamente"
                >
                  <img
                    src={getLeagueEmblemPath("liga-mx")}
                    alt=""
                    width={18}
                    height={18}
                  />
                  <span>Liga MX</span>
                  <span className="soon-pill">Pronto</span>
                </button>
              )}

              <button
                className="league-tab"
                role="tab"
                type="button"
                aria-selected={league === "premier-league"}
                data-league="premier-league"
                onClick={() => router.push("/app/premier-league")}
              >
                <img
                  src={getLeagueEmblemPath("premier-league")}
                  alt=""
                  width={18}
                  height={18}
                />
                <span>Premier League</span>
              </button>

              <button
                className="league-tab"
                role="tab"
                type="button"
                aria-selected={league === "nfl"}
                data-league="nfl"
                onClick={() => router.push("/app/nfl")}
              >
                <img
                  src={getLeagueEmblemPath("nfl")}
                  alt=""
                  width={18}
                  height={18}
                />
                <span>NFL</span>
              </button>

              <button
                className="league-tab"
                role="tab"
                type="button"
                aria-selected="false"
                disabled
                title="Disponible en la siguiente ola"
              >
                <Icon name="hockey" />
                <span>NHL</span>
                <span className="soon-pill">Pronto</span>
              </button>

              <button
                className="league-tab"
                role="tab"
                type="button"
                aria-selected="false"
                disabled
                title="Disponible en la siguiente ola"
              >
                <Icon name="baseball" />
                <span>MLB</span>
                <span className="soon-pill">Pronto</span>
              </button>
            </div>
          </div>

          <div className="nav-actions">
            <span className="tag tag-ok hide-sm">
              <span className="dot" />
              Beta activa
            </span>
            <ThemeToggle />
            <button
              className="btn btn-ghost"
              type="button"
              onClick={handleLogout}
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="panel-main">
        <div className="panel-bar">
          <div className="panel-title">
            <span className="crest" aria-hidden="true">
              <img
                id="panel-league-emblem"
                src={getLeagueEmblemPath(league as LeagueId)}
                alt=""
                width={32}
                height={32}
              />
            </span>
            <div>
              <h1 id="panel-league-name">
                {snapshot?.leagueLabel ?? "Premier League"}
              </h1>
              <div className="panel-sub">
                <span id="panel-league-round">
                  {snapshot?.roundLabel ?? "Jornada"} ·{" "}
                  {snapshot?.season ?? "Temporada 2026"}
                </span>
                <span>·</span>
                {snapshot?.generatedAt ? (
                  <Freshness generatedAt={snapshot.generatedAt} />
                ) : null}
              </div>
            </div>
          </div>

          <div
            className="day-chips"
            id="day-chips"
            role="group"
            aria-label="Filtrar por día"
          >
            {days.map((d) => (
              <button
                key={d.id}
                type="button"
                className="day-chip"
                data-day={d.id}
                aria-pressed={activeDay === d.id}
                onClick={() => setActiveDay(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {envelope.state === "error" ? (
          <ErrorState
            message={
              envelope.error?.message ??
              "No pudimos cargar los datos de la jornada."
            }
            code={envelope.error?.code ?? "UPSTREAM"}
            onRetry={() => router.refresh()}
          />
        ) : filteredGames.length === 0 ? (
          <EmptyState
            message={
              games.length === 0
                ? "Esta liga estará disponible pronto con datos verificados."
                : "No hay partidos programados para este día en la jornada actual."
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
          <section
            className="match-grid"
            id="match-grid"
            aria-live="polite"
            aria-label="Partidos de la jornada"
          >
            {filteredGames.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onSelect={handleSelectMatch}
              />
            ))}
          </section>
        )}
      </main>

      <AnalysisDialog
        match={selectedMatch}
        open={selectedMatch !== null}
        onClose={handleCloseModal}
      />

      <PublicFooter />
    </>
  );
}
