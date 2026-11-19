"use client";

import React, { useMemo } from "react";
import type { LiveMatchDetail, LiveScoreboardEntry } from "@pitchlab/contracts";
import { computeLivePickProgress, type LivePickProgressItem } from "../live/live-pick-progress";
import { liveMatchStore, useLiveScoreboard } from "../live/live-store";
import type { JournalEntry, PlatformGame } from "../types";

export interface LivePicksTrackerStripProps {
  readonly journal: readonly JournalEntry[];
  readonly games: readonly PlatformGame[];
  readonly onNavigate?: (href: string) => void;
  /** Sobrescritura opcional para Storybook y pruebas deterministas sin red. */
  readonly overrideScoreboard?: readonly LiveScoreboardEntry[];
  readonly overrideDetailsByGameId?: Readonly<Record<string, LiveMatchDetail>>;
}

export function LivePicksTrackerStrip({
  journal,
  games,
  onNavigate,
  overrideScoreboard,
  overrideDetailsByGameId,
}: LivePicksTrackerStripProps): React.JSX.Element | null {
  const pendingEntries = useMemo(
    () => journal.filter((e) => e.status === "pending"),
    [journal],
  );

  const liveBoard = useLiveScoreboard(pendingEntries.length > 0 && !overrideScoreboard);

  const items = useMemo<LivePickProgressItem[]>(() => {
    if (pendingEntries.length === 0) return [];
    const boardEntries = overrideScoreboard ?? liveBoard.data?.entries ?? [];
    const boardByGame = new Map(boardEntries.map((b) => [b.gameId, b]));
    const gameById = new Map(games.map((g) => [g.id, g]));

    const out: LivePickProgressItem[] = [];
    for (const entry of pendingEntries) {
      const game = gameById.get(entry.gameId);
      const sb = boardByGame.get(entry.gameId);
      const detail =
        overrideDetailsByGameId?.[entry.gameId] ??
        (sb ? liveMatchStore(entry.gameId).getSnapshot().data : null);
      const progress = computeLivePickProgress({
        entry,
        game,
        scoreboardEntry: sb,
        detail,
      });
      if (progress) out.push(progress);
    }
    return out;
  }, [games, liveBoard.data?.entries, overrideDetailsByGameId, overrideScoreboard, pendingEntries]);

  if (items.length === 0) return null;

  return (
    <section
      className="pl-live-picks-strip glass-card glass-ring rounded-2xl p-3.5 space-y-2.5"
      aria-label="Tus picks abiertos en vivo"
      data-live-picks-tracker=""
    >
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <span className="live-dot" aria-hidden="true" />
          <strong className="text-xs font-extrabold uppercase tracking-wider">
            Tus picks en juego ({items.length})
          </strong>
        </div>
        <span className="text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
          En tiempo real
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {items.map((item) => {
          const content = (
            <>
              <div className="flex items-center justify-between gap-2 text-xs">
                <strong className="font-bold truncate">{item.pickLabel}</strong>
                <span className="pl-pill pl-pill--live num text-[11px] shrink-0">
                  {item.scoreLabel} · {item.clockLabel}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px] num">
                <span className="truncate" style={{ color: "var(--pl-text-muted)" }}>
                  {item.matchLabel}
                  {item.progressRatioLabel ? ` · ${item.progressRatioLabel}` : ""}
                </span>
                <span
                  className={`font-semibold shrink-0 inline-flex items-center gap-1 ${item.lineReached ? "pl-live-pick-met" : ""}`.trim()}
                  style={{
                    color:
                      item.tone === "success"
                        ? "var(--pl-success)"
                        : item.tone === "warning"
                          ? "var(--pl-warning)"
                          : "var(--pl-brand)",
                  }}
                >
                  {item.lineReached ? <span aria-hidden="true">✓</span> : null}
                  <span>{item.statusText}</span>
                </span>
              </div>
              {item.currentValue !== null && item.targetValue !== null ? (
                <progress
                  className={`pl-live-progress pl-live-progress--${item.tone}`}
                  value={item.currentValue}
                  max={item.targetValue}
                  aria-label={`${item.pickLabel}: ${item.progressRatioLabel ? `${item.progressRatioLabel}, ` : ""}${item.statusText}`}
                />
              ) : null}
            </>
          );

          return item.href ? (
            <a
              key={item.entryId}
              href={item.href}
              className="pl-live-pick-tile"
              onClick={(e) => {
                if (!onNavigate) return;
                if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                onNavigate(item.href!);
              }}
            >
              {content}
            </a>
          ) : (
            <div key={item.entryId} className="pl-live-pick-tile">
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
