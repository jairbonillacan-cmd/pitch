"use client";

import React from "react";
import type { LiveIncident } from "@pitchlab/contracts";
import { buildPackIconSources, usePackIconBase } from "../../pack-icon-theme";

export type SportEventPackAssetName =
  | "goal"
  | "own-goal"
  | "penalty-goal"
  | "penalty-missed"
  | "assist"
  | "yellow-card"
  | "second-yellow"
  | "red-card"
  | "substitution"
  | "bench-sub"
  | "injury"
  | "var-review"
  | "woodwork"
  | "save-goalkeeper"
  | "kickoff-period"
  | "halftime"
  | "extra-time"
  | "match-final"
  | "match-postponed"
  | "match-cancelled"
  | "penalty-shootout";

export const SPORT_EVENT_PACK_ASSETS: readonly SportEventPackAssetName[] = Object.freeze([
  "goal",
  "own-goal",
  "penalty-goal",
  "penalty-missed",
  "assist",
  "yellow-card",
  "second-yellow",
  "red-card",
  "substitution",
  "bench-sub",
  "injury",
  "var-review",
  "woodwork",
  "save-goalkeeper",
  "kickoff-period",
  "halftime",
  "extra-time",
  "match-final",
  "match-postponed",
  "match-cancelled",
  "penalty-shootout",
]);

export type SportEventIconKind =
  | LiveIncident["kind"]
  | SportEventPackAssetName
  | "whistle";

export interface SportEventIconProps {
  readonly kind: SportEventIconKind;
  readonly size?: number;
  readonly className?: string;
  readonly label?: string;
}

const SPORT_EVENT_ASSET_MAP: Readonly<Record<SportEventIconKind, string>> = {
  goal: "eventos/goal",
  own_goal: "eventos/own-goal",
  "own-goal": "eventos/own-goal",
  penalty_goal: "eventos/penalty-goal",
  "penalty-goal": "eventos/penalty-goal",
  penalty_missed: "eventos/penalty-missed",
  "penalty-missed": "eventos/penalty-missed",
  assist: "eventos/assist",
  yellow: "eventos/yellow-card",
  "yellow-card": "eventos/yellow-card",
  second_yellow: "eventos/second-yellow",
  "second-yellow": "eventos/second-yellow",
  red: "eventos/red-card",
  "red-card": "eventos/red-card",
  sub: "eventos/substitution",
  substitution: "eventos/substitution",
  "bench-sub": "eventos/bench-sub",
  injury: "eventos/injury",
  var: "eventos/var-review",
  "var-review": "eventos/var-review",
  woodwork: "eventos/woodwork",
  "save-goalkeeper": "eventos/save-goalkeeper",
  period: "eventos/kickoff-period",
  "kickoff-period": "eventos/kickoff-period",
  halftime: "eventos/halftime",
  "extra-time": "eventos/extra-time",
  "match-final": "eventos/match-final",
  "match-postponed": "eventos/match-postponed",
  "match-cancelled": "eventos/match-cancelled",
  "penalty-shootout": "eventos/penalty-shootout",
  whistle: "interfaz/whistle",
};

export function resolveSportEventAssetPath(kind: SportEventIconKind): string {
  return SPORT_EVENT_ASSET_MAP[kind];
}

export function SportEventIcon({
  kind,
  size = 15,
  className,
  label,
}: SportEventIconProps): React.JSX.Element {
  const iconBase = usePackIconBase();
  const sources = buildPackIconSources(iconBase, SPORT_EVENT_ASSET_MAP[kind]);
  const accessibleLabel = label?.trim() ?? "";
  const cls = [
    "pl-sport-evt-ico",
    `pl-sport-evt-ico--${kind}`,
    "pl-maestro-icon",
    "inline-block",
    "shrink-0",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <img
      src={sources.src}
      srcSet={sources.srcSet}
      width={size}
      height={size}
      alt={accessibleLabel}
      aria-hidden={accessibleLabel ? undefined : true}
      decoding="async"
      draggable={false}
      className={cls}
    />
  );
}
