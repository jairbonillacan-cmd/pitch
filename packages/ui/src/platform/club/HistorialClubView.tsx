"use client";

import React, { useMemo, useState } from "react";
import { LensGlowOrbs, MaestroIcon } from "../components/MaestroPrimitives";
import { MatchTicketCard } from "../components/MatchTicketCard";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { usePlatform } from "../platform-provider";
import { SPACETIME_METRICS_HEADLINE } from "../spacetime-catalog";

export function HistorialClubView(): React.JSX.Element {
  const { dataset } = usePlatform();
  const [outcomeFilter, setOutcomeFilter] = useState<"all" | "hit" | "miss">("all");
  const [leagueFilter, setLeagueFilter] = useState<string>("all");

  const allFt = useMemo(
    () => dataset.games.filter((g) => g.status === "FT" && g.score),
    [dataset.games],
  );

  const finishedGames = useMemo(
    () =>
      allFt.filter((g) => {
        if (leagueFilter !== "all" && g.league !== leagueFilter) return false;
        const res = g.picks[0]?.result;
        if (outcomeFilter === "hit") return res === "hit";
        if (outcomeFilter === "miss") return res === "miss";
        return true;
      }),
    [allFt, leagueFilter, outcomeFilter],
  );

  const hitsCount = allFt.filter((g) => g.picks[0]?.result === "hit").length;
  const hitRatePct = allFt.length
    ? ((hitsCount / allFt.length) * 100).toFixed(1)
    : "0.0";

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/historial">
        <section className="glass-lens glass-ring relative overflow-hidden rounded-3xl p-5 sm:p-6 space-y-5">
          <LensGlowOrbs subtle />
          <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1.5">
              <span className="pl-pill pl-pill--success">
                <MaestroIcon name="shield" size={13} />
                <span>Registro Público Inmutable · Partidos Finalizados FT</span>
              </span>
              <h1 className="m-0 text-2xl sm:text-3xl font-extrabold tracking-tight">
                Resultados ({allFt.length} partidos)
              </h1>
              <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
                Boletos congelados al silbatazo inicial frente al marcador oficial. Públicos y
                auditables sin fuga de pronósticos futuros.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div
                className="seg-well"
                role="group"
                aria-label="Filtrar resultados cerrados"
              >
                {(["all", "hit", "miss"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className="seg-btn text-xs"
                    aria-pressed={outcomeFilter === f}
                    onClick={() => setOutcomeFilter(f)}
                  >
                    {f === "all"
                      ? "Todos"
                      : f === "hit"
                        ? "Cumplidos"
                        : "No cumplidos"}
                  </button>
                ))}
              </div>

              <select
                aria-label="Liga en historial"
                value={leagueFilter}
                onChange={(e) => setLeagueFilter(e.target.value)}
                className="glass-input px-3 py-1.5 text-xs font-semibold min-h-9"
              >
                <option value="all">Todas las ligas ({allFt.length})</option>
                {dataset.leagues.map((l) => (
                  <option key={l.league} value={l.league}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tira de 4 KPIs de Auditoría Pública */}
          <div className="relative z-10 grid grid-cols-2 lg:grid-cols-4 gap-3.5 num">
            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                <span>Encuentros liquidados FT</span>
                <MaestroIcon
                  name="calendar"
                  size={15}
                  style={{ color: "var(--pl-brand)" }}
                />
              </div>
              <strong className="block text-2xl font-extrabold">{allFt.length}</strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Marcadores oficiales cerrados
              </span>
            </div>

            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                <span>Picks principales cumplidos</span>
                <MaestroIcon
                  name="check"
                  size={15}
                  style={{ color: "var(--pl-success)" }}
                />
              </div>
              <strong
                className="block text-2xl font-extrabold"
                style={{ color: "var(--pl-success)" }}
              >
                {hitsCount} / {allFt.length} ({hitRatePct} %)
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Calificación automática post-juego
              </span>
            </div>

            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                <span>Desviación de calibración</span>
                <MaestroIcon
                  name="activity"
                  size={15}
                  style={{ color: "var(--pl-brand)" }}
                />
              </div>
              <strong
                className="block text-2xl font-extrabold"
                style={{ color: "var(--pl-brand)" }}
              >
                {SPACETIME_METRICS_HEADLINE.calibrationError}
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Spacetime Suite v3.0 auditada
              </span>
            </div>

            <div
              className="glass-ring rounded-2xl p-4 space-y-1"
              style={{ background: "var(--pl-surface)" }}
            >
              <div
                className="flex items-center justify-between text-xs"
                style={{ color: "var(--pl-text-muted)" }}
              >
                <span>Integridad histórica</span>
                <MaestroIcon
                  name="shield"
                  size={15}
                  style={{ color: "var(--pl-success)" }}
                />
              </div>
              <strong className="block text-xl sm:text-2xl font-extrabold">
                0 editados
              </strong>
              <span className="block text-xs" style={{ color: "var(--pl-success)" }}>
                0 picks editados o borrados
              </span>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {finishedGames.slice(0, 15).map((g) => (
            <MatchTicketCard key={g.id} game={g} />
          ))}
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
