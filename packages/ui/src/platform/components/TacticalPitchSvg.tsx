"use client";

import React, { useId, useMemo, useState } from "react";
import type { ConfirmedLineupPlayer, VerifiedMatchLineups } from "../types";

export interface TacticalPitchSvgProps {
  homeName: string;
  awayName: string;
  lineups: VerifiedMatchLineups;
  /** `"confirmed"` para XI oficial 60 min antes, `"estimated"` para once proyectado. */
  mode?: "confirmed" | "estimated";
}

/**
 * Convierte una cadena de formación (p. ej. `"4-2-3-1"`, `"4-3-3"`, `"3-4-2-1"`)
 * en líneas desde portero hasta delanteros `[1, ...outfield]`.
 */
export function parseFormationRows(formation?: string | null, totalPlayers = 11): number[] {
  const clean = (formation ?? "").trim();
  const parts = clean
    .split(/[^0-9]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0 && n <= 6);

  if (parts.length >= 2) {
    const sum = parts.reduce((acc, n) => acc + n, 0);
    if (sum === 10) return [1, ...parts];
    if (sum === 11 && parts[0] === 1) return parts;
  }

  if (totalPlayers <= 1) return [Math.max(1, totalPlayers)];
  if (totalPlayers === 11) return [1, 4, 3, 3];
  const rest = totalPlayers - 1;
  const def = Math.max(1, Math.round(rest * 0.4));
  const mid = Math.max(1, Math.round(rest * 0.35));
  const fwd = Math.max(1, rest - def - mid);
  return [1, def, mid, fwd];
}

export interface PitchNode {
  player: ConfirmedLineupPlayer;
  shortLabel: string;
  /** Coordenada normalizada 0..100 a lo ancho del campo. */
  xPct: number;
  /** Coordenada normalizada 0..100 desde la línea de fondo propia hacia mediocampo. */
  yPct: number;
}

function shortSurname(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return (parts[0] ?? "").slice(0, 12);
  const last = parts[parts.length - 1]!;
  return last.length <= 3 && parts.length >= 2
    ? `${parts[parts.length - 2]} ${last}`.slice(0, 13)
    : last.slice(0, 12);
}

/** Distribuye un XI en coordenadas limpias `(xPct, yPct)` dentro de su mitad de cancha. */
export function layoutTeamOnHalfPitch(
  starters: readonly ConfirmedLineupPlayer[],
  formation?: string | null,
): PitchNode[] {
  const players = starters.slice(0, 11);
  if (players.length === 0) return [];
  const rows = parseFormationRows(formation, players.length);
  const nodes: PitchNode[] = [];
  let cursor = 0;

  const rowCount = rows.length;
  for (let r = 0; r < rowCount && cursor < players.length; r += 1) {
    const remainingPlayers = players.length - cursor;
    const isLast = r === rowCount - 1;
    const countInRow = isLast ? remainingPlayers : Math.min(rows[r]!, remainingPlayers);
    const yPct = rowCount === 1 ? 50 : 12 + (r / Math.max(1, rowCount - 1)) * 74;

    for (let i = 0; i < countInRow && cursor < players.length; i += 1) {
      const player = players[cursor]!;
      cursor += 1;
      const xPct = countInRow === 1 ? 50 : ((i + 0.5) / countInRow) * 86 + 7;
      nodes.push({
        player,
        shortLabel: shortSurname(player.name),
        xPct: Math.round(xPct * 10) / 10,
        yPct: Math.round(yPct * 10) / 10,
      });
    }
  }
  return nodes;
}

function SingleHalfPitch({
  teamName,
  formation,
  nodes,
  tone,
}: {
  teamName: string;
  formation?: string;
  nodes: readonly PitchNode[];
  tone: "home" | "away";
}): React.JSX.Element {
  return (
    <div className={`pl-pitch-half is-${tone}`} data-pitch-side={tone}>
      <div className="pl-pitch-half-head">
        <strong className="truncate">{teamName}</strong>
        {formation ? <span className="pl-pitch-formation num">{formation}</span> : null}
      </div>
      <div className="pl-pitch-canvas" role="img" aria-label={`Formación de ${teamName}${formation ? ` (${formation})` : ""}: ${nodes.map((n) => n.player.name).join(", ")}`}>
        <svg viewBox="0 0 320 260" className="pl-pitch-svg" aria-hidden="true">
          <rect x="6" y="6" width="308" height="248" rx="10" className="pl-pitch-grass" />
          <line x1="6" y1="254" x2="314" y2="254" className="pl-pitch-line" />
          <path d="M 118 254 A 42 42 0 0 1 202 254" className="pl-pitch-line" />
          <rect x="68" y="6" width="184" height="58" className="pl-pitch-line" />
          <rect x="116" y="6" width="88" height="24" className="pl-pitch-line" />
          <path d="M 130 64 A 34 34 0 0 0 190 64" className="pl-pitch-line" />
        </svg>
        <ol className="pl-pitch-nodes" role="list">
          {nodes.map((node, idx) => (
            <li
              key={`${tone}-${node.player.name}-${idx}`}
              className="pl-pitch-node"
              style={{ left: `${node.xPct}%`, top: `${node.yPct}%` }}
            >
              <span className={`pl-pitch-dot is-${tone} num`}>
                {node.player.number ?? idx + 1}
              </span>
              <span className="pl-pitch-name">{node.shortLabel}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/**
 * Cancha táctica responsiva con `@container` (`size-aware-styling`):
 * - Contenedores angostos (< 560 px / móvil): alterna Local / Visita para conservar lectura nítida.
 * - Contenedores amplios (≥ 560 px / escritorio): muestra ambos XI lado a lado en espejo.
 */
export function TacticalPitchSvg({
  homeName,
  awayName,
  lineups,
  mode = "confirmed",
}: TacticalPitchSvgProps): React.JSX.Element {
  const [mobileSide, setMobileSide] = useState<"home" | "away">("home");
  const groupId = useId();

  const homeNodes = useMemo(
    () => layoutTeamOnHalfPitch(lineups.homeStarters, lineups.homeFormation),
    [lineups.homeStarters, lineups.homeFormation],
  );
  const awayNodes = useMemo(
    () => layoutTeamOnHalfPitch(lineups.awayStarters, lineups.awayFormation),
    [lineups.awayStarters, lineups.awayFormation],
  );

  return (
    <div
      className="pl-pitch-wrap"
      data-tactical-pitch=""
      data-pitch-mode={mode}
      data-mobile-side={mobileSide}
    >
      <div className="pl-pitch-mobile-tabs" role="tablist" aria-labelledby={groupId}>
        <span id={groupId} className="sr-only">
          Elegir equipo en cancha táctica
        </span>
        <button
          type="button"
          role="tab"
          aria-selected={mobileSide === "home"}
          className={`pl-pitch-tab ${mobileSide === "home" ? "is-active" : ""}`.trim()}
          onClick={() => setMobileSide("home")}
        >
          {homeName}
          {lineups.homeFormation ? ` · ${lineups.homeFormation}` : ""}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileSide === "away"}
          className={`pl-pitch-tab ${mobileSide === "away" ? "is-active" : ""}`.trim()}
          onClick={() => setMobileSide("away")}
        >
          {awayName}
          {lineups.awayFormation ? ` · ${lineups.awayFormation}` : ""}
        </button>
      </div>

      <div className="pl-pitch-board">
        <div className={`pl-pitch-pane ${mobileSide === "home" ? "is-mobile-visible" : ""}`.trim()}>
          <SingleHalfPitch
            teamName={homeName}
            formation={lineups.homeFormation}
            nodes={homeNodes}
            tone="home"
          />
        </div>
        <div className={`pl-pitch-pane ${mobileSide === "away" ? "is-mobile-visible" : ""}`.trim()}>
          <SingleHalfPitch
            teamName={awayName}
            formation={lineups.awayFormation}
            nodes={awayNodes}
            tone="away"
          />
        </div>
      </div>
    </div>
  );
}
