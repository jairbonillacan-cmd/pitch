"use client";

import React, { useMemo, useState } from "react";
import type { LiveIncident, LiveSide } from "@pitchlab/contracts";
import { AtomicLineupPitch, type AtomicLineupPlayer } from "../../atomic/AtomicLineupPitch";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { sanitizeInternalHref } from "../../navigation-helpers";
import { useOptionalPlatformActions } from "../../platform-provider";
import type {
  MatchEnrichedLineups,
  MatchLineupPlayerDetail,
  MatchLineupSide,
} from "../../types";
import { PersonAvatar } from "../team/PersonAvatar";

export type LineupPitchViewMode = "rendimiento" | "edad" | "estatura" | "nacionalidad";

export interface MatchLineupsPanelProps {
  readonly lineups: MatchEnrichedLineups | null | undefined;
  readonly incidents?: readonly LiveIncident[];
  readonly playerRatings?: Readonly<Record<string, number>>;
  readonly compact?: boolean;
  readonly onNavigate?: (href: string) => void;
  readonly onPrefetch?: (href: string) => void;
}

function parseIntegerOrNull(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

export function buildLineupMetricChip(
  player: MatchLineupPlayerDetail,
  mode: LineupPitchViewMode,
): string | null {
  if (mode === "edad") {
    return player.age !== null ? `${player.age} a` : null;
  }
  if (mode === "estatura") {
    return player.heightCm !== null ? `${player.heightCm} cm` : null;
  }
  if (mode === "nacionalidad") {
    return player.nationalityCode ?? player.nationality ?? null;
  }
  if (player.positionLabel) {
    return player.positionLabel;
  }
  return null;
}

function toAtomicStarters(
  players: readonly MatchLineupPlayerDetail[],
  mode: LineupPitchViewMode,
): readonly AtomicLineupPlayer[] {
  return players.map((p) => ({
    id: p.id,
    name: p.shortName || p.name,
    number: parseIntegerOrNull(p.jersey),
    position: p.positionLabel,
    rating: p.rating,
    playerHref: p.playerHref,
    photoKey: p.photoKey,
    fallbackPhotoKey: p.fallbackPhotoKey,
    metricChip: buildLineupMetricChip(p, mode),
  }));
}

function availabilityLabelEs(av: MatchLineupPlayerDetail["availability"]): string {
  if (av === "injured") return "Lesión";
  if (av === "doubtful") return "Duda";
  if (av === "suspended") return "Suspendido";
  return "Disponible";
}

export function MatchLineupsPanel({
  lineups,
  incidents,
  playerRatings,
  compact = false,
  onNavigate,
  onPrefetch,
}: MatchLineupsPanelProps): React.JSX.Element {
  const actions = useOptionalPlatformActions();
  const [viewMode, setViewMode] = useState<LineupPitchViewMode>("rendimiento");
  const [selection, setSelection] = useState<{
    readonly player: MatchLineupPlayerDetail;
    readonly side: LiveSide;
  } | null>(null);
  const [dismissedDefault, setDismissedDefault] = useState(false);

  const navigateSafe = (href: string): void => {
    if (onNavigate) {
      onNavigate(href);
      return;
    }
    actions?.navigateTo(href);
  };

  const prefetchSafe = (href: string): void => {
    if (onPrefetch) {
      onPrefetch(href);
      return;
    }
    actions?.prefetchRoute(href);
  };

  const detailById = useMemo(() => {
    const map = new Map<string, { readonly player: MatchLineupPlayerDetail; readonly side: LiveSide }>();
    if (!lineups) return map;
    const registerSide = (side: LiveSide, group: MatchLineupSide): void => {
      for (const p of [...group.starters, ...group.substitutes, ...group.unavailable]) {
        map.set(`${side}:${p.id}`, { player: p, side });
        map.set(`${side}:${p.shortName || p.name}`, { player: p, side });
      }
    };
    registerSide("home", lineups.home);
    registerSide("away", lineups.away);
    return map;
  }, [lineups]);

  if (!lineups) {
    return (
      <section className="glass-card glass-ring rounded-2xl p-5 text-sm" data-lineups-empty="">
        <p className="m-0" style={{ color: "var(--pl-text-muted)" }}>
          Aún no hay alineaciones o plantillas publicadas para este encuentro.
        </p>
      </section>
    );
  }

  const defaultCandidate: { readonly player: MatchLineupPlayerDetail; readonly side: LiveSide } | null =
    lineups.home.starters[0]
      ? { player: lineups.home.starters[0], side: "home" }
      : lineups.away.starters[0]
        ? { player: lineups.away.starters[0], side: "away" }
        : null;

  const activeSelection = selection ?? (dismissedDefault ? null : defaultCandidate);

  const homeAtomicStarters = toAtomicStarters(lineups.home.starters, viewMode);
  const awayAtomicStarters = toAtomicStarters(lineups.away.starters, viewMode);

  const handlePitchSelect = (player: AtomicLineupPlayer, side: LiveSide): void => {
    const key = player.id ? `${side}:${player.id}` : `${side}:${player.name}`;
    const resolved = detailById.get(key);
    if (resolved) {
      setDismissedDefault(false);
      setSelection(resolved);
    }
  };

  const selectDirect = (player: MatchLineupPlayerDetail, side: LiveSide): void => {
    setDismissedDefault(false);
    setSelection({ player, side });
  };

  const renderRosterGroup = (
    title: string,
    players: readonly MatchLineupPlayerDetail[],
    side: LiveSide,
    kind: "subs" | "unavailable",
  ) => (
    <div className="pl-mdp-sub-card">
      <h4 className="m-0 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--pl-text-muted)" }}>
        {title}
      </h4>
      {players.length === 0 ? (
        <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
          Sin registros
        </p>
      ) : (
        <ul className="pl-mdp-sub-list">
          {players.map((p) => {
            const isSel = activeSelection?.player.id === p.id && activeSelection?.side === side;
            return (
              <li key={`${kind}-${side}-${p.id}`}>
                <button
                  type="button"
                  className={`pl-mdp-sub-btn ${isSel ? "is-selected" : ""}`.trim()}
                  aria-pressed={isSel}
                  data-lineup-player={p.slug}
                  onClick={() => selectDirect(p, side)}
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <PersonAvatar
                      photoKey={p.photoKey}
                      fallbackPhotoKey={p.fallbackPhotoKey}
                      role="player"
                      size={24}
                    />
                    <span className="truncate font-semibold">
                      {p.jersey ? `#${p.jersey} ` : ""}
                      {p.shortName || p.name}
                    </span>
                  </span>
                  <span className="text-xs shrink-0" style={{ color: "var(--pl-text-muted)" }}>
                    {kind === "unavailable" ? availabilityLabelEs(p.availability) : p.positionLabel}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const selectedHref = activeSelection ? sanitizeInternalHref(activeSelection.player.playerHref) : null;
  const selectedTeamName = activeSelection
    ? activeSelection.side === "home"
      ? lineups.home.teamName
      : lineups.away.teamName
    : null;

  return (
    <section className="space-y-3.5" data-match-lineups-panel="">
      <div className="pl-mdp-lineup-banner">
        <div className="pl-mdp-lineup-status" data-lineup-banner="">
          <MaestroIcon name="shield" size={15} />
          <span>{lineups.bannerLabel}</span>
        </div>

        <div className="pl-mdp-switcher" role="group" aria-label="Vista sobre la cancha">
          {(
            [
              { id: "rendimiento", label: "Rendimiento" },
              { id: "edad", label: "Edad" },
              { id: "estatura", label: "Estatura" },
              { id: "nacionalidad", label: "Nacionalidad" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`pl-mdp-switcher-btn ${viewMode === opt.id ? "is-active" : ""}`.trim()}
              aria-pressed={viewMode === opt.id}
              data-lineup-view={opt.id}
              onClick={() => setViewMode(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`pl-mdp-lineups-layout${compact ? " is-compact" : ""}`}>
        <div className="space-y-3 min-w-0">
          <AtomicLineupPitch
            homeName={lineups.home.teamName}
            awayName={lineups.away.teamName}
            homeFormation={lineups.home.formation}
            awayFormation={lineups.away.formation}
            homeStarters={homeAtomicStarters}
            awayStarters={awayAtomicStarters}
            status={lineups.status}
            homeCoach={lineups.home.coachName}
            awayCoach={lineups.away.coachName}
            incidents={incidents}
            playerRatings={playerRatings}
            selectedPlayerId={activeSelection?.player.id ?? null}
            preferSelectButton
            onSelectPlayer={handlePitchSelect}
          />

          <div className="pl-mdp-coaches-row">
            {(
              [
                { side: "home", info: lineups.home },
                { side: "away", info: lineups.away },
              ] as const
            ).map(({ side, info }) => (
              <div key={side} className="pl-mdp-coach-card">
                <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--pl-text-muted)" }}>
                  Dirección técnica · {info.teamName}
                </span>
                <div className="flex items-center gap-2.5">
                  <PersonAvatar photoKey={info.coachPhotoKey} role="coach" size={32} />
                  <div className="min-w-0">
                    <strong className="block text-sm truncate" style={{ color: "var(--pl-text)" }}>
                      {info.coachName ?? "Por confirmar"}
                    </strong>
                    <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      Esquema {info.formation}
                      {info.coachNationality ? ` · ${info.coachNationality}` : ""}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="pl-mdp-subs-grid">
            {renderRosterGroup(
              `Suplentes · ${lineups.home.teamName}`,
              lineups.home.substitutes,
              "home",
              "subs",
            )}
            {renderRosterGroup(
              `Suplentes · ${lineups.away.teamName}`,
              lineups.away.substitutes,
              "away",
              "subs",
            )}
          </div>

          {lineups.home.unavailable.length > 0 || lineups.away.unavailable.length > 0 ? (
            <div className="pl-mdp-subs-grid">
              {renderRosterGroup(
                `No disponibles · ${lineups.home.teamName}`,
                lineups.home.unavailable,
                "home",
                "unavailable",
              )}
              {renderRosterGroup(
                `No disponibles · ${lineups.away.teamName}`,
                lineups.away.unavailable,
                "away",
                "unavailable",
              )}
            </div>
          ) : null}
        </div>

        <aside className="pl-mdp-lineup-drawer" aria-label="Ficha rápida de jugador" data-lineup-drawer="">
          {activeSelection ? (
            <>
              <div className="pl-mdp-lineup-drawer-head">
                <div className="pl-mdp-lineup-drawer-id">
                  <PersonAvatar
                    photoKey={activeSelection.player.photoKey}
                    fallbackPhotoKey={activeSelection.player.fallbackPhotoKey}
                    role="player"
                    size={46}
                  />
                  <div className="min-w-0">
                    <strong className="block text-sm truncate" style={{ color: "var(--pl-text)" }}>
                      {activeSelection.player.name}
                    </strong>
                    <span className="block text-xs truncate" style={{ color: "var(--pl-text-muted)" }}>
                      {selectedTeamName} · {activeSelection.player.positionLabel}
                      {activeSelection.player.jersey ? ` · #${activeSelection.player.jersey}` : ""}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="pl-home-md-action-btn"
                  aria-label="Cerrar ficha de jugador"
                  onClick={() => {
                    setSelection(null);
                    setDismissedDefault(true);
                  }}
                >
                  <MaestroIcon name="x" size={14} />
                </button>
              </div>

              <div className="pl-mdp-lineup-kv-grid num">
                <div className="pl-mdp-lineup-kv">
                  <span>Edad</span>
                  <strong>
                    {activeSelection.player.age !== null
                      ? `${activeSelection.player.age} años`
                      : "Sin dato"}
                  </strong>
                </div>
                <div className="pl-mdp-lineup-kv">
                  <span>Estatura</span>
                  <strong>
                    {activeSelection.player.heightCm !== null
                      ? `${activeSelection.player.heightCm} cm`
                      : "Sin dato"}
                  </strong>
                </div>
                <div className="pl-mdp-lineup-kv">
                  <span>Nacionalidad</span>
                  <strong>{activeSelection.player.nationality ?? "Sin dato"}</strong>
                </div>
                <div className="pl-mdp-lineup-kv">
                  <span>Estado</span>
                  <strong>{availabilityLabelEs(activeSelection.player.availability)}</strong>
                </div>
              </div>

              <div className="pl-mdp-lineup-kv">
                <span>Temporada actual</span>
                <strong className="num">{activeSelection.player.statsSummary}</strong>
              </div>

              {activeSelection.player.recentMatches.length > 0 ? (
                <div className="space-y-1.5">
                  <h4 className="m-0 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--pl-text-muted)" }}>
                    Últimos partidos
                  </h4>
                  <ul className="pl-mdp-lineup-recent">
                    {activeSelection.player.recentMatches.map((rm, idx) => (
                      <li key={`${activeSelection.player.id}-rm-${idx}`} className="pl-mdp-lineup-recent-item">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="truncate" style={{ color: "var(--pl-text)" }}>
                            vs {rm.opponent}
                          </strong>
                          <span className="num shrink-0" style={{ color: "var(--pl-text-muted)" }}>
                            {rm.score ?? rm.dateIso.slice(0, 10)}
                          </span>
                        </div>
                        {rm.statsSummary ? (
                          <span className="num" style={{ color: "var(--pl-text-secondary)" }}>
                            {rm.statsSummary}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {selectedHref ? (
                <a
                  href={selectedHref}
                  onPointerEnter={() => prefetchSafe(selectedHref)}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    navigateSafe(selectedHref);
                  }}
                  className="pl-btn-accent text-xs min-h-10 px-3.5 inline-flex items-center justify-center gap-1.5 no-underline"
                  data-lineup-player-link=""
                >
                  <span>Ver jugador</span>
                  <MaestroIcon name="arrowRight" size={13} />
                </a>
              ) : null}
            </>
          ) : (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Selecciona cualquier jugador en el campo o la banca para ver su rendimiento real y su enlace completo.
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
