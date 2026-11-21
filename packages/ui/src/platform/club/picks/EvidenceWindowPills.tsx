"use client";

import React from "react";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import type { PickEvidenceBullet } from "../../match-evidence";
import type {
  MatchIntelligenceV5View,
  MatchPick,
  PlatformGame,
} from "../../types";

export type EvidenceWindowKey =
  | "l5"
  | "l10"
  | "l20"
  | "home_away"
  | "h2h"
  | "xg"
  | "ref"
  | "custom";
export type EvidenceWindowPillKey = EvidenceWindowKey;
export type EvidenceWindowTone = "high" | "mid" | "low" | "info" | "neutral";

export interface EvidenceWindowItem {
  readonly key: EvidenceWindowKey;
  readonly label: string;
  readonly value: string;
  readonly ratePct?: number | null;
  readonly tone: EvidenceWindowTone;
  readonly detail?: string;
}

function toneForPct(pct: number): EvidenceWindowTone {
  if (pct >= 70) return "high";
  if (pct >= 45) return "mid";
  return "low";
}

function norm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parseFormList(raw: string | undefined): Array<"G" | "E" | "P"> {
  if (!raw) return [];
  const head = raw.split("·")[0] ?? raw;
  return head
    .toUpperCase()
    .replace(/[^GEPWLD]/g, "")
    .split("")
    .slice(0, 5)
    .map((ch) => (ch === "W" || ch === "G" ? "G" : ch === "D" || ch === "E" ? "E" : "P"));
}

function parseSeasonRecord(
  raw: string | undefined,
): { won: number; drawn: number; lost: number; played: number } | null {
  if (!raw) return null;
  const gMatch = /(\d+)\s*[GW]/i.exec(raw);
  const eMatch = /(\d+)\s*[ED]/i.exec(raw);
  const pMatch = /(\d+)\s*[PL]/i.exec(raw);
  if (!gMatch?.[1] || !pMatch?.[1]) return null;
  const won = parseStrictFiniteNumber(gMatch[1]);
  const drawn = eMatch?.[1] ? parseStrictFiniteNumber(eMatch[1]) : 0;
  const lost = parseStrictFiniteNumber(pMatch[1]);
  if (won === null || drawn === null || lost === null) return null;
  const played = won + drawn + lost;
  if (!Number.isFinite(played) || played < 10) return null;
  return { won, drawn, lost, played };
}

function extractLine(
  pick: Pick<MatchPick, "line" | "label" | "selectionKey">,
): number | null {
  if (typeof pick.line === "number" && Number.isFinite(pick.line)) return pick.line;
  const match = /(\d+(?:\.\d+)?)/.exec(`${pick.label} ${pick.selectionKey}`);
  if (!match?.[1]) return null;
  return parseStrictFiniteNumber(match[1]);
}

export function extractEvidenceWindows(params: {
  readonly game: PlatformGame;
  readonly pick: Pick<MatchPick, "label" | "selectionKey" | "market" | "marketGroup" | "line">;
  readonly bullets?: readonly PickEvidenceBullet[];
  readonly v5?: MatchIntelligenceV5View | null;
}): EvidenceWindowItem[] {
  const { game, pick, bullets, v5 } = params;
  const out: EvidenceWindowItem[] = [];
  const labelNorm = norm(pick.label);
  const selNorm = norm(pick.selectionKey);
  const hay = norm(`${pick.market ?? ""} ${pick.marketGroup} ${pick.label}`);
  const homeNorm = norm(game.home.shortName || game.home.name);
  const awayNorm = norm(game.away.shortName || game.away.name);

  const isDoubleChance =
    labelNorm.includes("o empate") || selNorm.includes("1x") || selNorm.includes("x2");
  const picksHome =
    (selNorm.includes("home") || labelNorm.includes(homeNorm)) && !labelNorm.includes(awayNorm);
  const picksAway =
    (selNorm.includes("away") || labelNorm.includes(awayNorm)) && !labelNorm.includes(homeNorm);
  const isResultMarket =
    !hay.includes("corner") &&
    !hay.includes("tarjeta") &&
    !hay.includes("falta") &&
    !hay.includes("ambos") &&
    !hay.includes("btts") &&
    !hay.includes("mas de") &&
    !hay.includes("menos de") &&
    !hay.includes("total");

  const formBullet = bullets?.find(
    (b) => norm(b.label).includes("racha reciente") && b.ratePct !== null,
  );
  if (formBullet && formBullet.ratePct !== null) {
    out.push({
      key: "l5",
      label: "L5",
      value: `${formBullet.ratePct} %`,
      ratePct: formBullet.ratePct,
      tone: toneForPct(formBullet.ratePct),
      detail: formBullet.label,
    });
  } else if (isResultMarket && (picksHome || picksAway)) {
    const factor = game.factors.find((f) =>
      picksHome ? /local/i.test(f.label) : /visit/i.test(f.label),
    );
    const list = parseFormList(factor?.value);
    if (list.length >= 3) {
      const hits = list.filter((r) => (isDoubleChance ? r === "G" || r === "E" : r === "G")).length;
      const pct = Math.round((hits / list.length) * 100);
      out.push({
        key: "l5",
        label: `L${list.length}`,
        value: `${pct} %`,
        ratePct: pct,
        tone: toneForPct(pct),
        detail: `${hits}/${list.length} últimos partidos de ${picksHome ? game.home.shortName : game.away.shortName}`,
      });
    }
  }

  if (isResultMarket && (picksHome || picksAway)) {
    const rec = parseSeasonRecord(picksHome ? game.home.record : game.away.record);
    if (rec) {
      const hits = isDoubleChance ? rec.won + rec.drawn : rec.won;
      const pct = Math.round((hits / rec.played) * 100);
      const winKey = rec.played >= 20 ? "l20" : "l10";
      const winLabel = rec.played >= 20 ? "L20" : "L10";
      out.push({
        key: winKey,
        label: winLabel,
        value: `${pct} %`,
        ratePct: pct,
        tone: toneForPct(pct),
        detail: `${hits}/${rec.played} en temporada (${picksHome ? game.home.shortName : game.away.shortName})`,
      });
    }
  }

  const h2hBullet = bullets?.find((b) => norm(b.label).includes("h2h") && b.ratePct !== null);
  if (h2hBullet && h2hBullet.ratePct !== null) {
    out.push({
      key: "h2h",
      label: "H2H",
      value: `${h2hBullet.ratePct} %`,
      ratePct: h2hBullet.ratePct,
      tone: toneForPct(h2hBullet.ratePct),
      detail: h2hBullet.label,
    });
  } else if (game.headToHead.length >= 2) {
    const recent = game.headToHead.slice(0, 5);
    let hits = 0;
    let evaluated = 0;
    const isGoals =
      hay.includes("total") ||
      hay.includes("goles") ||
      hay.includes("puntos") ||
      hay.includes("mas de") ||
      hay.includes("menos de");
    const isBtts = hay.includes("ambos") || hay.includes("btts");
    const line = isGoals ? extractLine(pick) : null;

    for (const row of recent) {
      const total = row.homeGoals + row.awayGoals;
      if (isGoals && line !== null) {
        evaluated += 1;
        const isOver = labelNorm.includes("mas de") || selNorm.includes("over");
        const isUnder = labelNorm.includes("menos de") || selNorm.includes("under");
        if ((isOver && total > line) || (isUnder && total < line)) hits += 1;
      } else if (isBtts) {
        evaluated += 1;
        const both = row.homeGoals > 0 && row.awayGoals > 0;
        const isNo = /\bno\b/.test(labelNorm) || /\bno\b/.test(selNorm);
        if (isNo ? !both : both) hits += 1;
      } else if (isResultMarket && (picksHome || picksAway)) {
        const hName = norm(row.home);
        const currentHomeWasRowHome = hName.includes(homeNorm) || homeNorm.includes(hName);
        const homeWon = row.homeGoals > row.awayGoals;
        const awayWon = row.awayGoals > row.homeGoals;
        const drew = row.homeGoals === row.awayGoals;
        evaluated += 1;
        if (picksHome) {
          const won = currentHomeWasRowHome ? homeWon : awayWon;
          if (isDoubleChance ? won || drew : won) hits += 1;
        } else {
          const won = currentHomeWasRowHome ? awayWon : homeWon;
          if (isDoubleChance ? won || drew : won) hits += 1;
        }
      }
    }

    if (evaluated >= 2) {
      const pct = Math.round((hits / evaluated) * 100);
      out.push({
        key: "h2h",
        label: "H2H",
        value: `${pct} %`,
        ratePct: pct,
        tone: toneForPct(pct),
        detail: `${hits}/${evaluated} en últimos cruces directos`,
      });
    }
  }

  if (game.projection && Number.isFinite(game.projection.total)) {
    const isFootball = game.sport === "football";
    out.push({
      key: "xg",
      label: isFootball ? "xG" : "Proy.",
      value: isFootball
        ? game.projection.total.toFixed(2)
        : game.projection.total.toFixed(1),
      tone: "info",
      detail: `${game.home.shortName} ${game.projection.home.toFixed(isFootball ? 2 : 1)} · ${game.away.shortName} ${game.projection.away.toFixed(isFootball ? 2 : 1)}`,
    });
  }

  const ref = v5?.microCounts?.refereeProfile;
  if (
    ref &&
    (hay.includes("tarjeta") || hay.includes("amarilla") || hay.includes("falta") || hay.includes("card"))
  ) {
    const tone: EvidenceWindowTone =
      ref.cardsMultiplier >= 1.12 ? "high" : ref.cardsMultiplier <= 0.88 ? "low" : "neutral";
    out.push({
      key: "ref",
      label: "Árb.",
      value: `×${ref.cardsMultiplier.toFixed(2)}`,
      tone,
      detail: `Árbitro ${ref.name} (${ref.games} PJ)`,
    });
  }

  return out;
}

export interface EvidenceWindowPillsProps {
  readonly windows: readonly EvidenceWindowItem[];
  readonly size?: "sm" | "md";
  readonly ariaLabel?: string;
}

export function EvidenceWindowPills({
  windows,
  size = "md",
  ariaLabel = "Ventanas de evidencia real",
}: EvidenceWindowPillsProps): React.JSX.Element | null {
  if (windows.length === 0) return null;

  return (
    <div
      className={`pl-ev-win-strip ${size === "sm" ? "is-sm" : ""}`.trim()}
      role="list"
      aria-label={ariaLabel}
      data-evidence-windows=""
    >
      {windows.map((w) => (
        <span
          key={`${w.key}-${w.label}`}
          role="listitem"
          className={`pl-ev-win-pill is-${w.tone} num`}
          data-evidence-window={w.key}
          title={w.detail ?? `${w.label}: ${w.value}`}
        >
          <span className="pl-ev-win-key">{w.label}</span>
          <strong className="pl-ev-win-val">{w.value}</strong>
        </span>
      ))}
    </div>
  );
}
