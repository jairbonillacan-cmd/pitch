"use client";

import React, { useId, useMemo, useState } from "react";
import type { LiveSide } from "@pitchlab/contracts";

export interface AtomicAveragePositionPlayer {
  readonly id?: string;
  readonly name: string;
  readonly shortName?: string;
  readonly number?: number | null;
  readonly side: LiveSide;
  /** Coordenada 0..100 desde la portería propia (0) hasta la portería rival (100). */
  readonly x: number;
  /** Coordenada 0..100 a lo ancho del campo (0 banda izquierda, 100 banda derecha). */
  readonly y: number;
  /** Volumen de toques para escalar sutilmente el radio del nodo. */
  readonly touches?: number | null;
  readonly position?: string | null;
  readonly rating?: number | null;
}

export interface ResolvedAveragePositionNode {
  readonly player: AtomicAveragePositionPlayer;
  readonly shortLabel: string;
  /** Coordenada relajada horizontal (0..100) en la cancha vertical. */
  readonly leftPct: number;
  /** Coordenada relajada vertical (0..100, menor = más cerca del arco rival). */
  readonly topPct: number;
  /** Escala sutil por toques en [0.90, 1.18]. */
  readonly sizeScale: number;
}

export interface AtomicAveragePositionsPitchProps {
  readonly players: readonly AtomicAveragePositionPlayer[];
  readonly homeLabel: string;
  readonly awayLabel: string;
  readonly homeFormation?: string | null;
  readonly awayFormation?: string | null;
  readonly defaultSide?: LiveSide;
  readonly title?: string;
  readonly showTable?: boolean;
  readonly className?: string;
}

function abbreviatePlayerName(name: string, explicit?: string): string {
  if (explicit && explicit.trim()) return explicit.trim().slice(0, 11);
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0]!.slice(0, 11);
  const last = parts[parts.length - 1]!;
  if (last.length <= 3 && parts.length >= 2) {
    return `${parts[parts.length - 2]} ${last}`.slice(0, 12);
  }
  return last.slice(0, 11);
}

/**
 * Aplica separación determinista suave a posiciones medias (0..100) para evitar
 * solapamientos de dorsales y etiquetas en pantallas móviles de 375 px.
 */
export function resolveAveragePositionCollisions(
  players: readonly AtomicAveragePositionPlayer[],
  minDist = 12,
): ResolvedAveragePositionNode[] {
  if (players.length === 0) return [];

  const touchValues = players
    .map((p) => p.touches)
    .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
  const minTouches = touchValues.length > 0 ? Math.min(...touchValues) : 0;
  const maxTouches = touchValues.length > 0 ? Math.max(...touchValues) : 0;
  const spanTouches = Math.max(1, maxTouches - minTouches);

  const pts = players.map((player) => {
    const rawX = Number.isFinite(player.x) ? Math.max(0, Math.min(100, player.x)) : 50;
    const rawY = Number.isFinite(player.y) ? Math.max(0, Math.min(100, player.y)) : 50;
    // Cancha vertical: arco rival arriba (top menor), arco propio abajo (top mayor)
    const left = Math.max(11, Math.min(89, 10 + (rawY / 100) * 80));
    const top = Math.max(11, Math.min(89, 90 - (rawX / 100) * 80));
    const t =
      player.touches != null && Number.isFinite(player.touches) && maxTouches > minTouches
        ? (player.touches - minTouches) / spanTouches
        : 0.4;
    const sizeScale = Math.round((0.9 + t * 0.26) * 100) / 100;
    return { player, left, top, sizeScale };
  });

  // 10 iteraciones deterministas de repulsión elíptica (más margen vertical para las etiquetas)
  const minX = minDist;
  const minY = minDist * 1.12;
  for (let iter = 0; iter < 10; iter += 1) {
    let moved = false;
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        const a = pts[i]!;
        const b = pts[j]!;
        const dx = b.left - a.left;
        const dy = b.top - a.top;
        const nx = dx / minX;
        const ny = dy / minY;
        const dist = Math.hypot(nx, ny);
        if (dist < 1) {
          moved = true;
          const safeDist = dist > 0.001 ? dist : 0.001;
          const ux = dist > 0.001 ? nx / safeDist : i % 2 === 0 ? 1 : -1;
          const uy = dist > 0.001 ? ny / safeDist : 0.35;
          const push = (1 - dist) * 0.52;
          a.left = Math.max(10, Math.min(90, a.left - ux * minX * push));
          a.top = Math.max(10, Math.min(90, a.top - uy * minY * push));
          b.left = Math.max(10, Math.min(90, b.left + ux * minX * push));
          b.top = Math.max(10, Math.min(90, b.top + uy * minY * push));
        }
      }
    }
    if (!moved) break;
  }

  return pts.map((p) => ({
    player: p.player,
    shortLabel: abbreviatePlayerName(p.player.name, p.player.shortName),
    leftPct: Math.round(p.left * 10) / 10,
    topPct: Math.round(p.top * 10) / 10,
    sizeScale: p.sizeScale,
  }));
}

/**
 * Cancha SVG de posiciones medias (0..100):
 * - Nodos de dorsal + abreviatura del jugador escalados sutilmente por volumen de toques.
 * - Toggle Local / Visita para lectura nítida sin solapamientos en 375 px y 1440 px.
 * - Línea de altura media del bloque y tabla accesible `<details>`.
 */
export function AtomicAveragePositionsPitch({
  players,
  homeLabel,
  awayLabel,
  homeFormation,
  awayFormation,
  defaultSide = "home",
  title = "Posiciones medias",
  showTable = true,
  className = "",
}: AtomicAveragePositionsPitchProps): React.JSX.Element | null {
  const uid = useId().replace(/:/g, "");
  const homePlayers = useMemo(() => players.filter((p) => p.side === "home"), [players]);
  const awayPlayers = useMemo(() => players.filter((p) => p.side === "away"), [players]);

  const initialSide: LiveSide =
    defaultSide === "away" && awayPlayers.length > 0
      ? "away"
      : homePlayers.length > 0
        ? "home"
        : "away";
  const [activeSide, setActiveSide] = useState<LiveSide>(initialSide);

  const effectiveSide: LiveSide =
    activeSide === "home" && homePlayers.length === 0 && awayPlayers.length > 0
      ? "away"
      : activeSide === "away" && awayPlayers.length === 0 && homePlayers.length > 0
        ? "home"
        : activeSide;

  const activePlayers = effectiveSide === "home" ? homePlayers : awayPlayers;
  const activeTeamName = effectiveSide === "home" ? homeLabel : awayLabel;
  const activeFormation = effectiveSide === "home" ? homeFormation : awayFormation;

  const nodes = useMemo(
    () => resolveAveragePositionCollisions(activePlayers),
    [activePlayers],
  );

  // Altura media del bloque de campo (excluyendo portero si x < 22)
  const avgBlockHeight = useMemo(() => {
    const outfield = activePlayers.filter((p) => p.x >= 20);
    const pool = outfield.length >= 4 ? outfield : activePlayers;
    if (pool.length === 0) return null;
    const sum = pool.reduce((acc, p) => acc + Math.max(0, Math.min(100, p.x)), 0);
    return Math.round(sum / pool.length);
  }, [activePlayers]);

  if (players.length === 0) return null;

  const blockLineY = avgBlockHeight !== null ? Math.round((366 - (avgBlockHeight / 100) * 352) * 10) / 10 : null;

  return (
    <figure
      className={`pl-atom-avgpos pl-atom-card ${className}`.trim()}
      aria-labelledby={`${uid}-title`}
      data-atomic-avgpos=""
      data-side={effectiveSide}
    >
      <figcaption className="pl-atom-avgpos-head">
        <div className="pl-atom-avgpos-meta">
          <span id={`${uid}-title`} className="pl-atom-title">
            {title}
          </span>
          {avgBlockHeight !== null ? (
            <span className="pl-atom-sub num">
              Bloque medio {avgBlockHeight} %
              {activeFormation ? ` · ${activeFormation}` : ""}
            </span>
          ) : activeFormation ? (
            <span className="pl-atom-sub num">{activeFormation}</span>
          ) : null}
        </div>

        <div className="pl-atom-seg-group" role="group" aria-label="Cambiar equipo en posiciones medias">
          <button
            type="button"
            aria-pressed={effectiveSide === "home"}
            disabled={homePlayers.length === 0}
            className={`pl-atom-seg-btn${effectiveSide === "home" ? " is-active is-home" : ""}`}
            onClick={() => setActiveSide("home")}
          >
            <span className="pl-atom-team-dot is-home" aria-hidden="true" />
            <span>{homeLabel}</span>
          </button>
          <button
            type="button"
            aria-pressed={effectiveSide === "away"}
            disabled={awayPlayers.length === 0}
            className={`pl-atom-seg-btn${effectiveSide === "away" ? " is-active is-away" : ""}`}
            onClick={() => setActiveSide("away")}
          >
            <span className="pl-atom-team-dot is-away" aria-hidden="true" />
            <span>{awayLabel}</span>
          </button>
        </div>
      </figcaption>

      <div
        className="pl-atom-avgpos-canvas"
        role="img"
        aria-label={`Posiciones medias de ${activeTeamName}: ${nodes.map((n) => `${n.player.number ?? ""} ${n.player.name}`.trim()).join(", ")}`}
      >
        <svg viewBox="0 0 320 380" className="pl-atom-pitch-svg" aria-hidden="true">
          <rect x="10" y="10" width="300" height="360" rx="10" className="pl-atom-pitch-grass" />
          {/* Mediocampo */}
          <line x1="10" y1="190" x2="310" y2="190" className="pl-atom-pitch-line" />
          <circle cx="160" cy="190" r="34" className="pl-atom-pitch-line" />
          <circle cx="160" cy="190" r="2.2" className="pl-atom-pitch-spot" />

          {/* Área superior (ataque ↑) */}
          <rect x="74" y="10" width="172" height="58" className="pl-atom-pitch-line" />
          <rect x="118" y="10" width="84" height="22" className="pl-atom-pitch-line" />
          <path d="M 130 68 A 32 32 0 0 0 190 68" className="pl-atom-pitch-line" />

          {/* Área inferior (portería propia) */}
          <rect x="74" y="312" width="172" height="58" className="pl-atom-pitch-line" />
          <rect x="118" y="348" width="84" height="22" className="pl-atom-pitch-line" />
          <path d="M 130 312 A 32 32 0 0 1 190 312" className="pl-atom-pitch-line" />

          {/* Línea de altura media del bloque */}
          {blockLineY !== null ? (
            <line
              x1="14"
              y1={blockLineY}
              x2="306"
              y2={blockLineY}
              className={`pl-atom-avgpos-block is-${effectiveSide}`}
            />
          ) : null}

          <text x="160" y="25" textAnchor="middle" className="pl-atom-pitch-hint">
            Ataque ↑
          </text>
        </svg>

        <ol className="pl-atom-pitch-nodes" role="list">
          {nodes.map((node, idx) => (
            <li
              key={node.player.id ?? `${effectiveSide}-${node.player.name}-${idx}`}
              className="pl-atom-avgpos-node"
              style={
                {
                  left: `${node.leftPct}%`,
                  top: `${node.topPct}%`,
                  "--node-scale": node.sizeScale,
                } as React.CSSProperties
              }
            >
              <span className={`pl-atom-jersey is-${effectiveSide} num`}>
                {node.player.number ?? idx + 1}
              </span>
              <span className="pl-atom-player-tag">{node.shortLabel}</span>
            </li>
          ))}
        </ol>
      </div>

      {showTable ? (
        <details className="pl-atom-disclosure">
          <summary className="num">
            Ver posiciones medias como tabla ({activePlayers.length})
          </summary>
          <div
            className="pl-atom-table-wrap"
            role="region"
            tabIndex={0}
            aria-labelledby={`${uid}-table-cap`}
          >
            <table className="pl-atom-table">
              <caption id={`${uid}-table-cap`} className="sr-only">
                Posiciones medias de {activeTeamName}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="num">#</th>
                  <th scope="col">Jugador</th>
                  <th scope="col">Pos</th>
                  <th scope="col" className="num">Altura</th>
                  <th scope="col" className="num">Toques</th>
                </tr>
              </thead>
              <tbody>
                {[...activePlayers]
                  .sort((a, b) => b.x - a.x)
                  .map((p, idx) => (
                    <tr key={p.id ?? `tbl-${p.name}-${idx}`}>
                      <td className="num" data-label="#">{p.number ?? "—"}</td>
                      <th scope="row">{p.name}</th>
                      <td data-label="Pos">{p.position ?? "—"}</td>
                      <td className="num" data-label="Altura">{Math.round(p.x)} %</td>
                      <td className="num" data-label="Toques">
                        {p.touches != null ? Math.round(p.touches) : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </figure>
  );
}
