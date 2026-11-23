"use client";

import React from "react";
import { canonicalPlayerHref, type LeagueId } from "@pitchlab/contracts";
import { TeamBadge } from "../../../sports";
import { useOptionalPlatformActions } from "../../platform-provider";
import type { MatchInjuryItem } from "../../types";
import { PersonAvatar } from "../team/PersonAvatar";

export interface MatchInjuriesPanelProps {
  readonly injuries: readonly MatchInjuryItem[];
  readonly league: LeagueId | string;
  readonly homeName: string;
  readonly homeSlug: string;
  readonly homeLogoUrl?: string | null;
  readonly awayName: string;
  readonly awaySlug: string;
  readonly awayLogoUrl?: string | null;
  readonly onNavigate?: (href: string) => void;
  readonly onPrefetch?: (href: string) => void;
}

function resolveBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s.includes("duda") || s.includes("quest")) return "is-doubt";
  if (s.includes("baja") || s.includes("out") || s.includes("suspend")) return "is-out";
  return "";
}

export function MatchInjuriesPanel({
  injuries,
  league,
  homeName,
  homeSlug,
  homeLogoUrl,
  awayName,
  awaySlug,
  awayLogoUrl,
  onNavigate,
  onPrefetch,
}: MatchInjuriesPanelProps): React.JSX.Element {
  const actions = useOptionalPlatformActions();

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

  if (injuries.length === 0) {
    return (
      <section className="glass-card glass-ring rounded-2xl p-5 text-sm" data-injuries-empty="">
        <p className="m-0" style={{ color: "var(--pl-text-muted)" }}>
          No hay jugadores lesionados ni suspendidos reportados para este partido.
        </p>
      </section>
    );
  }

  const sides: ReadonlyArray<{
    readonly side: "home" | "away";
    readonly teamName: string;
    readonly teamSlug: string;
    readonly logoUrl?: string | null;
    readonly items: readonly MatchInjuryItem[];
  }> = [
    {
      side: "home",
      teamName: homeName,
      teamSlug: homeSlug,
      logoUrl: homeLogoUrl,
      items: injuries.filter((i) => i.teamSide === "home"),
    },
    {
      side: "away",
      teamName: awayName,
      teamSlug: awaySlug,
      logoUrl: awayLogoUrl,
      items: injuries.filter((i) => i.teamSide === "away"),
    },
  ];

  return (
    <div className="pl-mdp-injuries-grid" data-match-injuries-panel="">
      {sides.map((group) => (
        <section
          key={group.side}
          className="pl-mdp-injury-group"
          data-injuries-side={group.side}
        >
          <div className="pl-mdp-injury-group-head">
            <div className="pl-mdp-injury-team">
              <TeamBadge
                league={league}
                slug={group.teamSlug}
                name={group.teamName}
                logoUrl={group.logoUrl ?? undefined}
                size={24}
              />
              <span>{group.teamName}</span>
            </div>
            <span className="pl-pill text-xs num">{group.items.length}</span>
          </div>

          {group.items.length === 0 ? (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Sin bajas ni dudas reportadas.
            </p>
          ) : (
            <ul className="pl-mdp-injury-list">
              {group.items.map((item, idx) => {
                const playerHref = item.playerSlug
                  ? canonicalPlayerHref(league, group.teamSlug, item.playerSlug)
                  : null;
                return (
                  <li key={`${group.side}-${item.player}-${idx}`} className="pl-mdp-injury-row">
                    <div className="pl-mdp-injury-player">
                      <PersonAvatar
                        photoKey={item.photoKey}
                        fallbackPhotoKey={item.fallbackPhotoKey}
                        role="player"
                        size={36}
                      />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {playerHref ? (
                            <a
                              href={playerHref}
                              onPointerEnter={() => prefetchSafe(playerHref)}
                              onClick={(e) => {
                                if (
                                  e.metaKey ||
                                  e.ctrlKey ||
                                  e.shiftKey ||
                                  e.altKey ||
                                  e.button !== 0
                                ) {
                                  return;
                                }
                                e.preventDefault();
                                navigateSafe(playerHref);
                              }}
                              className="text-sm font-bold pl-team-link no-underline truncate"
                            >
                              {item.player}
                            </a>
                          ) : (
                            <strong className="text-sm truncate" style={{ color: "var(--pl-text)" }}>
                              {item.player}
                            </strong>
                          )}
                          {item.position ? (
                            <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                              {item.position}
                            </span>
                          ) : null}
                        </div>
                        <span className="block text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                          {item.detail ?? item.injuryCategory ?? "Motivo médico no especificado"}
                        </span>
                      </div>
                    </div>

                    <div className="pl-mdp-injury-meta">
                      <span className={`pl-mdp-injury-badge ${resolveBadgeClass(item.status)}`.trim()}>
                        {item.status}
                      </span>
                      {item.expectedReturn ? (
                        <span className="text-[11px] num" style={{ color: "var(--pl-text-muted)" }}>
                          Regreso est. {item.expectedReturn.slice(0, 10)}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
