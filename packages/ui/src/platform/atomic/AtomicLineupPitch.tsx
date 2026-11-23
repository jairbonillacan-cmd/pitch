"use client";

import React, { useId, useMemo, useState } from "react";
import type { LiveIncident, LiveSide } from "@pitchlab/contracts";
import { PersonAvatar } from "../club/team/PersonAvatar";
import { SportEventIcon, type SportEventIconKind } from "../components/SportEventIcons";
import { sanitizeInternalHref } from "../navigation-helpers";

export interface AtomicLineupPlayer {
  readonly id?: string;
  readonly name: string;
  readonly number?: number | null;
  readonly position?: string | null;
  readonly rating?: number | null;
  readonly isCaptain?: boolean;
  readonly events?: readonly SportEventIconKind[];
  readonly playerHref?: string | null;
  readonly photoKey?: string | null;
  readonly fallbackPhotoKey?: string | null;
  readonly metricChip?: string | null;
}

export interface AtomicLineupPitchProps {
  readonly homeName: string;
  readonly awayName: string;
  readonly homeFormation?: string | null;
  readonly awayFormation?: string | null;
  readonly homeStarters: readonly AtomicLineupPlayer[];
  readonly awayStarters: readonly AtomicLineupPlayer[];
  readonly status: "confirmed" | "probable";
  readonly homeCoach?: string | null;
  readonly awayCoach?: string | null;
  readonly incidents?: readonly LiveIncident[];
  readonly playerRatings?: Readonly<Record<string, number>>;
  readonly selectedPlayerId?: string | null;
  readonly preferSelectButton?: boolean;
  readonly onSelectPlayer?: (player: AtomicLineupPlayer, side: LiveSide) => void;
  readonly className?: string;
}

interface PositionedLineupNode {
  readonly player: AtomicLineupPlayer;
  readonly shortLabel: string;
  readonly xPct: number;
  readonly yPct: number;
  readonly rating: number | null;
  readonly events: readonly SportEventIconKind[];
}

export function parseLineupFormationRows(
  formation?: string | null,
  totalPlayers = 11,
): number[] {
  const clean = (formation ?? "").trim();
  const parts = clean
    .split(/[^0-9]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => Number.parseInt(segment, 10))
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

function shortSurname(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return (parts[0] ?? "").slice(0, 11);
  const last = parts[parts.length - 1]!;
  return last.length <= 3 && parts.length >= 2
    ? `${parts[parts.length - 2]} ${last}`.slice(0, 12)
    : last.slice(0, 11);
}

function normalizeNameKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function matchPlayerEvents(
  playerName: string,
  side: LiveSide,
  incidents: readonly LiveIncident[] | undefined,
): SportEventIconKind[] {
  if (!incidents || incidents.length === 0) return [];
  const key = normalizeNameKey(playerName);
  const surname = key.split(/\s+/).pop() ?? key;
  const found: SportEventIconKind[] = [];

  for (const inc of incidents) {
    if (inc.side !== side || inc.kind === "period" || inc.kind === "var") continue;
    const candidate = inc.kind === "sub" ? inc.secondary : inc.player;
    if (!candidate) continue;
    const candKey = normalizeNameKey(candidate);
    if (
      candKey === key ||
      (surname.length >= 4 && (candKey.endsWith(surname) || key.endsWith(candKey)))
    ) {
      found.push(inc.kind);
    }
  }
  return found.slice(0, 3);
}

function ratingTier(rating: number): "elite" | "good" | "mid" | "low" {
  if (rating >= 8.0) return "elite";
  if (rating >= 7.0) return "good";
  if (rating >= 6.2) return "mid";
  return "low";
}

function layoutLineupNodes(
  starters: readonly AtomicLineupPlayer[],
  formation: string | null | undefined,
  side: LiveSide,
  incidents?: readonly LiveIncident[],
  playerRatings?: Readonly<Record<string, number>>,
): PositionedLineupNode[] {
  const players = starters.slice(0, 11);
  if (players.length === 0) return [];
  const rows = parseLineupFormationRows(formation, players.length);
  const nodes: PositionedLineupNode[] = [];
  let cursor = 0;

  for (let r = 0; r < rows.length && cursor < players.length; r += 1) {
    const remaining = players.length - cursor;
    const isLast = r === rows.length - 1;
    const countInRow = isLast ? remaining : Math.min(rows[r]!, remaining);
    const yPct = rows.length === 1 ? 50 : 14 + (r / Math.max(1, rows.length - 1)) * 71;

    for (let i = 0; i < countInRow && cursor < players.length; i += 1) {
      const player = players[cursor]!;
      cursor += 1;
      const xPct = countInRow === 1 ? 50 : ((i + 0.5) / countInRow) * 78 + 11;

      const explicitEvents = player.events ? [...player.events] : [];
      const derivedEvents =
        explicitEvents.length > 0 ? [] : matchPlayerEvents(player.name, side, incidents);
      const events = [...explicitEvents, ...derivedEvents].slice(0, 3);

      const resolvedRating =
        player.rating != null && Number.isFinite(player.rating)
          ? player.rating
          : playerRatings?.[player.name] ?? playerRatings?.[normalizeNameKey(player.name)] ?? null;

      nodes.push({
        player,
        shortLabel: shortSurname(player.name),
        xPct: Math.round(xPct * 10) / 10,
        yPct: Math.round(yPct * 10) / 10,
        rating: resolvedRating,
        events,
      });
    }
  }
  return nodes;
}

function HalfLineupPane({
  teamName,
  formation,
  coach,
  nodes,
  side,
  selectedPlayerId,
  preferSelectButton = false,
  onSelectPlayer,
}: {
  readonly teamName: string;
  readonly formation?: string | null;
  readonly coach?: string | null;
  readonly nodes: readonly PositionedLineupNode[];
  readonly side: LiveSide;
  readonly selectedPlayerId?: string | null;
  readonly preferSelectButton?: boolean;
  readonly onSelectPlayer?: (player: AtomicLineupPlayer, side: LiveSide) => void;
}): React.JSX.Element {
  const hasInteractiveNodes =
    Boolean(onSelectPlayer) || nodes.some((n) => sanitizeInternalHref(n.player.playerHref) !== null);

  return (
    <div className={`pl-atom-lineup-half is-${side}`} data-lineup-side={side}>
      <div className="pl-atom-lineup-half-head">
        <div className="pl-atom-lineup-team">
          <span className={`pl-atom-team-dot is-${side}`} aria-hidden="true" />
          <strong className="truncate">{teamName}</strong>
        </div>
        {formation ? <span className="pl-atom-formation num">{formation}</span> : null}
      </div>

      <div
        className="pl-atom-lineup-canvas"
        role={hasInteractiveNodes ? "group" : "img"}
        aria-label={`Alineación de ${teamName}${formation ? ` (${formation})` : ""}: ${nodes.map((n) => `${n.player.number ?? ""} ${n.player.name}`.trim()).join(", ")}`}
      >
        <svg viewBox="0 0 320 272" className="pl-atom-pitch-svg" aria-hidden="true">
          <rect x="8" y="8" width="304" height="256" rx="10" className="pl-atom-pitch-grass" />
          <line x1="8" y1="264" x2="312" y2="264" className="pl-atom-pitch-line" />
          <path d="M 118 264 A 42 42 0 0 1 202 264" className="pl-atom-pitch-line" />
          <rect x="70" y="8" width="180" height="58" className="pl-atom-pitch-line" />
          <rect x="116" y="8" width="88" height="22" className="pl-atom-pitch-line" />
          <path d="M 130 66 A 32 32 0 0 0 190 66" className="pl-atom-pitch-line" />
        </svg>

        <ol className="pl-atom-pitch-nodes" role="list">
          {nodes.map((node, idx) => {
            const safeHref = sanitizeInternalHref(node.player.playerHref);
            const jerseyNumber = node.player.number ?? idx + 1;
            const nodeAriaLabel = `${node.player.name}, dorsal ${jerseyNumber}${node.rating !== null ? `, nota ${node.rating.toFixed(1)}` : ""}`;
            const isSelected =
              selectedPlayerId != null &&
              (node.player.id === selectedPlayerId || node.player.name === selectedPlayerId);
            const hasPortrait = Boolean(node.player.photoKey || node.player.fallbackPhotoKey);
            const nodeContent = (
              <>
                <span className="pl-atom-lineup-anchor">
                  {hasPortrait ? (
                    <span className="pl-atom-node-avatar">
                      <PersonAvatar
                        photoKey={node.player.photoKey}
                        fallbackPhotoKey={node.player.fallbackPhotoKey}
                        role="player"
                        size={26}
                      />
                    </span>
                  ) : (
                    <span className={`pl-atom-jersey is-${side} num`}>{jerseyNumber}</span>
                  )}

                  {node.rating !== null ? (
                    <span
                      className={`pl-atom-rating is-${ratingTier(node.rating)} num`}
                      aria-label={`Nota ${node.rating.toFixed(1)}`}
                    >
                      {node.rating.toFixed(1)}
                    </span>
                  ) : null}

                  {node.events.length > 0 ? (
                    <span className="pl-atom-node-events" aria-hidden="true">
                      {node.events.map((evKind, evIdx) => (
                        <span key={`${evKind}-${evIdx}`} className="pl-atom-node-evt">
                          <SportEventIcon kind={evKind} size={11} />
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>

                <span className="pl-atom-player-tag">
                  {node.player.isCaptain ? (
                    <abbr title="Capitán" className="pl-atom-cap">
                      C
                    </abbr>
                  ) : null}
                  <span>{node.shortLabel}</span>
                </span>
                {node.player.metricChip ? (
                  <span className="pl-atom-node-metric num">{node.player.metricChip}</span>
                ) : null}
              </>
            );

            return (
              <li
                key={`${side}-${node.player.name}-${idx}`}
                className="pl-atom-lineup-node"
                style={{ left: `${node.xPct}%`, top: `${node.yPct}%` }}
              >
                {safeHref ? (
                  <a
                    href={safeHref}
                    className={`pl-atom-node-trigger ${isSelected ? "is-selected" : ""}`.trim()}
                    aria-label={nodeAriaLabel}
                    aria-current={isSelected ? "true" : undefined}
                    onClick={
                      onSelectPlayer
                        ? (e) => {
                            if (
                              preferSelectButton &&
                              !e.metaKey &&
                              !e.ctrlKey &&
                              !e.shiftKey &&
                              !e.altKey &&
                              e.button === 0
                            ) {
                              e.preventDefault();
                            }
                            onSelectPlayer(node.player, side);
                          }
                        : undefined
                    }
                  >
                    {nodeContent}
                  </a>
                ) : onSelectPlayer ? (
                  <button
                    type="button"
                    className={`pl-atom-node-trigger ${isSelected ? "is-selected" : ""}`.trim()}
                    aria-label={nodeAriaLabel}
                    aria-pressed={isSelected}
                    onClick={() => onSelectPlayer(node.player, side)}
                  >
                    {nodeContent}
                  </button>
                ) : (
                  nodeContent
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {coach ? (
        <p className="pl-atom-coach">
          <span>DT</span>
          <strong>{coach}</strong>
        </p>
      ) : null}
    </div>
  );
}

export function AtomicLineupPitch({
  homeName,
  awayName,
  homeFormation,
  awayFormation,
  homeStarters,
  awayStarters,
  status,
  homeCoach,
  awayCoach,
  incidents,
  playerRatings,
  selectedPlayerId,
  preferSelectButton = false,
  onSelectPlayer,
  className = "",
}: AtomicLineupPitchProps): React.JSX.Element | null {
  const [mobileSide, setMobileSide] = useState<LiveSide>("home");
  const uid = useId().replace(/:/g, "");

  const homeNodes = useMemo(
    () => layoutLineupNodes(homeStarters, homeFormation, "home", incidents, playerRatings),
    [homeStarters, homeFormation, incidents, playerRatings],
  );
  const awayNodes = useMemo(
    () => layoutLineupNodes(awayStarters, awayFormation, "away", incidents, playerRatings),
    [awayStarters, awayFormation, incidents, playerRatings],
  );

  if (homeNodes.length === 0 && awayNodes.length === 0) return null;

  return (
    <section
      className={`pl-atom-lineup pl-atom-card ${className}`.trim()}
      aria-labelledby={`${uid}-title`}
      data-atomic-lineup=""
      data-lineup-status={status}
      data-mobile-side={mobileSide}
    >
      <header className="pl-atom-lineup-head">
        <h3 id={`${uid}-title`} className="pl-atom-title">
          Alineaciones en cancha
        </h3>
        <span className={`pl-atom-status-pill is-${status}`}>
          {status === "confirmed" ? "XI confirmado" : "XI probable"}
        </span>
      </header>

      <div className="pl-atom-lineup-mobile-tabs" role="group" aria-label="Elegir equipo en cancha">
        <button
          type="button"
          aria-pressed={mobileSide === "home"}
          className={`pl-atom-seg-btn${mobileSide === "home" ? " is-active is-home" : ""}`}
          onClick={() => setMobileSide("home")}
        >
          <span className="truncate">{homeName}</span>
          {homeFormation ? <span className="num">{homeFormation}</span> : null}
        </button>
        <button
          type="button"
          aria-pressed={mobileSide === "away"}
          className={`pl-atom-seg-btn${mobileSide === "away" ? " is-active is-away" : ""}`}
          onClick={() => setMobileSide("away")}
        >
          <span className="truncate">{awayName}</span>
          {awayFormation ? <span className="num">{awayFormation}</span> : null}
        </button>
      </div>

      <div className="pl-atom-lineup-board">
        <div className={`pl-atom-lineup-pane${mobileSide === "home" ? " is-mobile-visible" : ""}`}>
          <HalfLineupPane
            teamName={homeName}
            formation={homeFormation}
            coach={homeCoach}
            nodes={homeNodes}
            side="home"
            selectedPlayerId={selectedPlayerId}
            preferSelectButton={preferSelectButton}
            onSelectPlayer={onSelectPlayer}
          />
        </div>
        <div className={`pl-atom-lineup-pane${mobileSide === "away" ? " is-mobile-visible" : ""}`}>
          <HalfLineupPane
            teamName={awayName}
            formation={awayFormation}
            coach={awayCoach}
            nodes={awayNodes}
            side="away"
            selectedPlayerId={selectedPlayerId}
            preferSelectButton={preferSelectButton}
            onSelectPlayer={onSelectPlayer}
          />
        </div>
      </div>
    </section>
  );
}
