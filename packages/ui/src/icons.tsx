"use client";

import React from "react";
import { buildPackIconSources, usePackIconBase } from "./pack-icon-theme";

export type IconName =
  | "games"
  | "info"
  | "close"
  | "trend"
  | "panel"
  | "home"
  | "search"
  | "user"
  | "bookmark"
  | "more"
  | "chevron"
  | "soccer"
  | "football"
  | "basketball"
  | "hockey"
  | "baseball"
  | "model"
  | "probability"
  | "sources"
  | "compare"
  | "competition"
  | "simulation"
  | "radar"
  | "target"
  | "shield"
  | "lock"
  | "arrow"
  | "check"
  | "sun"
  | "moon"
  | "backspace"
  | "alert-market"
  | "alert-warning"
  | "bankroll-wallet"
  | "bracket-playoff"
  | "compare-h2h"
  | "expand-fullscreen"
  | "info-circle"
  | "live-pulse"
  | "player-props"
  | "push-void"
  | "refresh-sync"
  | "target-picks"
  | "verified-seal";

export const ICON_PACK_PATHS: Readonly<Record<IconName, string>> = {
  games: "interfaz/calendar",
  info: "interfaz/info-circle",
  close: "interfaz/x",
  trend: "interfaz/chart",
  panel: "interfaz/grid",
  home: "interfaz/calendar",
  search: "interfaz/search",
  user: "interfaz/user",
  bookmark: "interfaz/bookmark",
  more: "interfaz/dots",
  chevron: "interfaz/chevron-right",
  soccer: "deportes/football",
  football: "deportes/american-football",
  basketball: "deportes/basketball",
  hockey: "deportes/hockey",
  baseball: "deportes/baseball",
  model: "interfaz/cpu",
  probability: "mercados/expected-value",
  sources: "interfaz/receipt",
  compare: "interfaz/compare-h2h",
  competition: "interfaz/trophy",
  simulation: "interfaz/cpu",
  radar: "mercados/xg-radar",
  target: "interfaz/target-picks",
  shield: "interfaz/shield",
  lock: "interfaz/lock",
  arrow: "interfaz/arrow-right",
  check: "interfaz/check",
  sun: "interfaz/sun",
  moon: "interfaz/moon",
  backspace: "interfaz/arrow-left",
  "alert-market": "interfaz/alert-market",
  "alert-warning": "interfaz/alert-warning",
  "bankroll-wallet": "interfaz/bankroll-wallet",
  "bracket-playoff": "interfaz/bracket-playoff",
  "compare-h2h": "interfaz/compare-h2h",
  "expand-fullscreen": "interfaz/expand-fullscreen",
  "info-circle": "interfaz/info-circle",
  "live-pulse": "interfaz/live-pulse",
  "player-props": "interfaz/player-props",
  "push-void": "interfaz/push-void",
  "refresh-sync": "interfaz/refresh-sync",
  "target-picks": "interfaz/target-picks",
  "verified-seal": "interfaz/verified-seal",
};

export function Icon({
  name,
  size = 18,
  className = "icon",
  label,
}: {
  readonly name: IconName;
  readonly size?: number;
  readonly className?: string;
  readonly label?: string;
}): React.JSX.Element {
  const asset = ICON_PACK_PATHS[name];
  const iconBase = usePackIconBase();
  const sources = buildPackIconSources(iconBase, asset);
  const accessibleLabel = label?.trim() ?? "";
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
      className={`pl-maestro-icon inline-block shrink-0 ${className} ${name}`}
    />
  );
}
