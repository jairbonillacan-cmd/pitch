"use client";

import React, { useMemo, useState } from "react";
import type { LeagueId } from "@pitchlab/contracts";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import type { TeamProfileData, TeamSquadPlayer } from "./types";

export interface TeamSquadSectionProps {
  league: LeagueId;
  teamSlug: string;
  teamName: string;
  seasonLabel: string;
  squad: NonNullable<TeamProfileData["squad"]>;
  isVisitorRestricted: boolean;
  upgradeHref: string;
  onNavigate: (href: string) => void;
}

type PositionFilter = "ALL" | "GK" | "DEF" | "MID" | "FWD";

const POSITION_FILTER_OPTIONS: ReadonlyArray<{ id: PositionFilter; label: string }> = [
  { id: "ALL", label: "Todos" },
  { id: "GK", label: "POR" },
  { id: "DEF", label: "DEF" },
  { id: "MID", label: "MED" },
  { id: "FWD", label: "DEL" },
];

const POSITION_BADGE_ES: Readonly<Record<TeamSquadPlayer["positionGroup"], string>> = {
  GK: "POR",
  DEF: "DEF",
  MID: "MED",
  FWD: "DEL",
};

function normalizeQuery(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function TeamSquadSection({
  league,
  teamSlug,
  teamName,
  seasonLabel,
  squad,
  isVisitorRestricted,
  upgradeHref,
  onNavigate,
}: TeamSquadSectionProps): React.JSX.Element {
  const [posFilter, setPosFilter] = useState<PositionFilter>("ALL");
  const [searchText, setSearchText] = useState<string>("");

  const normalizedQuery = useMemo(() => normalizeQuery(searchText), [searchText]);

  const filteredPlayers = useMemo(() => {
    return squad.players.filter((player) => {
      if (posFilter !== "ALL" && player.positionGroup !== posFilter) return false;
      if (!normalizedQuery) return true;
      const hay = normalizeQuery(
        `${player.name} ${player.shortName} ${player.jersey ?? ""} ${player.nationality ?? ""}`,
      );
      return hay.includes(normalizedQuery);
    });
  }, [squad.players, posFilter, normalizedQuery]);

  const positionCounts = useMemo(() => {
    const counts: Record<PositionFilter, number> = {
      ALL: squad.players.length,
      GK: 0,
      DEF: 0,
      MID: 0,
      FWD: 0,
    };
    for (const p of squad.players) {
      counts[p.positionGroup] += 1;
    }
    return counts;
  }, [squad.players]);

  const navigateOnPlainClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onNavigate(href);
  };

  return (
    <section
      className="glass-card glass-ring rounded-2xl p-5 space-y-4"
      aria-labelledby="team-squad-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 id="team-squad-heading" className="m-0 text-base sm:text-lg font-extrabold">
            Plantilla de {teamName} · {seasonLabel}
          </h2>
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Rendimiento acumulado de temporada, perfil físico y picks sugeridos por jugador.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {squad.coachName ? (
            <span className="pl-pill text-xs font-semibold">
              DT: {squad.coachName}
            </span>
          ) : null}
          <span className="pl-pill num text-xs">
            {squad.players.length} jugadores
          </span>
        </div>
      </div>

      {/* Filtros de posición y búsqueda */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="seg-well" role="group" aria-label="Filtrar por demarcación">
          {POSITION_FILTER_OPTIONS.map((opt) => {
            const active = posFilter === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => setPosFilter(opt.id)}
                className="seg-btn"
              >
                <span>{opt.label}</span>
                <span className="pl-pill num text-[10px] px-1.5 py-0">
                  {positionCounts[opt.id]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <label htmlFor="squad-player-search" className="sr-only">
            Buscar jugador en plantilla
          </label>
          <input
            id="squad-player-search"
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Buscar jugador, dorsal o país…"
            className="w-full rounded-xl px-3 py-2 text-xs outline-none transition-colors"
            style={{
              background: "var(--pl-glass-input)",
              border: "1px solid var(--pl-border)",
              color: "var(--pl-text)",
            }}
          />
        </div>
      </div>

      {filteredPlayers.length === 0 ? (
        <div
          className="rounded-xl p-4 text-xs text-center"
          style={{
            background: "var(--pl-surface-soft)",
            color: "var(--pl-text-muted)",
          }}
        >
          No hay jugadores que coincidan con el filtro aplicado.
        </div>
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-labelledby="team-squad-heading"
          className="pl-squad-table-wrap"
        >
          <table className="pl-squad-table">
            <thead>
              <tr>
                <th scope="col">Jugador</th>
                <th scope="col">Pos.</th>
                <th scope="col">Edad</th>
                <th scope="col">Bio</th>
                <th scope="col">PJ</th>
                <th scope="col">G / A</th>
                <th scope="col">Tiros (TaP)</th>
                <th scope="col">Ataj.</th>
                <th scope="col">Pick aplicable</th>
              </tr>
            </thead>
            <tbody>
              {filteredPlayers.map((player) => {
                const href = `/app/${league}/teams/${teamSlug}/players/${player.slug}`;
                const topPick = player.candidatePicks[0] ?? null;
                const locked = isVisitorRestricted || Boolean(topPick?.locked);
                const bioParts: string[] = [];
                if (player.heightCm) bioParts.push(`${player.heightCm} cm`);
                if (player.nationalityCode) bioParts.push(player.nationalityCode);
                else if (player.nationality) bioParts.push(player.nationality);

                return (
                  <tr key={player.id}>
                    <th scope="row">
                      <a
                        href={href}
                        onClick={(e) => navigateOnPlainClick(e, href)}
                        className="pl-team-link inline-flex items-center gap-2 font-semibold"
                      >
                        <span
                          className="pl-pill num text-[11px] px-1.5 py-0 shrink-0"
                          aria-label={player.jersey ? `Dorsal ${player.jersey}` : "Sin dorsal"}
                        >
                          {player.jersey ? `${player.jersey}` : "—"}
                        </span>
                        <span>{player.name}</span>
                      </a>
                    </th>
                    <td data-label="Posición">
                      <span className="pl-pill text-[11px] font-bold">
                        {POSITION_BADGE_ES[player.positionGroup]}
                      </span>
                    </td>
                    <td data-label="Edad" className="num">
                      {player.age != null ? `${player.age}` : "—"}
                    </td>
                    <td data-label="Bio" className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      {bioParts.length > 0 ? bioParts.join(" · ") : "—"}
                    </td>
                    <td data-label="PJ" className="num font-semibold">
                      {player.stats.appearances}
                      {player.stats.subIns > 0 ? (
                        <span
                          className="text-[11px] font-normal ml-1"
                          style={{ color: "var(--pl-text-muted)" }}
                        >
                          ({player.stats.subIns} sup.)
                        </span>
                      ) : null}
                    </td>
                    <td data-label="G / A" className="num font-semibold">
                      {player.stats.goals} / {player.stats.assists}
                    </td>
                    <td data-label="Tiros (TaP)" className="num">
                      {player.stats.shots} ({player.stats.shotsOnTarget})
                    </td>
                    <td data-label="Atajadas" className="num">
                      {player.positionGroup === "GK" ? player.stats.saves : "—"}
                    </td>
                    <td data-label="Pick aplicable">
                      {!topPick ? (
                        <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                          Muestra insuficiente
                        </span>
                      ) : locked ? (
                        <a
                          href={upgradeHref}
                          onClick={(e) => navigateOnPlainClick(e, upgradeHref)}
                          className="pl-pill text-[11px] font-semibold inline-flex items-center gap-1 no-underline"
                          style={{ color: "var(--pl-brand)" }}
                        >
                          <MaestroIcon name="lock" size={12} />
                          <span>Pase Ultra</span>
                        </a>
                      ) : (
                        <a
                          href={href}
                          onClick={(e) => navigateOnPlainClick(e, href)}
                          className="pl-pill text-[11px] font-semibold inline-flex items-center gap-1.5 no-underline"
                          style={{ color: "var(--pl-text)" }}
                        >
                          <span>{topPick.selectionLabel}</span>
                          {topPick.fairDecimal != null ? (
                            <span className="num" style={{ color: "var(--pl-brand)" }}>
                              {topPick.fairDecimal.toFixed(2)}
                            </span>
                          ) : null}
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
