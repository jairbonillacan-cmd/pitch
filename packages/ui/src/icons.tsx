"use client";

import React from "react";
import { usePackIconBase } from "./pack-icon-theme";

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
  | "hockey"
  | "baseball"
  | "model"
  | "probability"
  | "sources"
  | "compare"
  | "competition"
  | "simulation"
  | "radar"
  | "shield"
  | "lock"
  | "arrow"
  | "check"
  | "sun"
  | "moon"
  | "backspace";

const ICON_PACK_PATHS: Readonly<Record<IconName, string>> = {
  games: "interfaz/calendar",
  info: "interfaz/sparkles",
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
  hockey: "deportes/hockey",
  baseball: "deportes/baseball",
  model: "interfaz/cpu",
  probability: "interfaz/chart",
  sources: "interfaz/receipt",
  compare: "interfaz/activity",
  competition: "interfaz/trophy",
  simulation: "interfaz/cpu",
  radar: "interfaz/eye",
  shield: "interfaz/shield",
  lock: "interfaz/lock",
  arrow: "interfaz/arrow-right",
  check: "interfaz/check",
  sun: "interfaz/sun",
  moon: "interfaz/moon",
  backspace: "interfaz/arrow-left",
};

export function Icon({
  name,
  className = "icon",
  label,
}: {
  name: IconName;
  className?: string;
  label?: string;
}): React.JSX.Element {
  const asset = ICON_PACK_PATHS[name];
  const iconBase = usePackIconBase();
  return (
    <img
      src={`${iconBase}/32/${asset}.webp`}
      srcSet={`${iconBase}/32/${asset}.webp 1x, ${iconBase}/64/${asset}.webp 2x`}
      width={18}
      height={18}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      decoding="async"
      draggable={false}
      className={`pl-maestro-icon inline-block shrink-0 ${className} ${name}`}
    />
  );
}
