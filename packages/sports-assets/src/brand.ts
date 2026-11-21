const MASCOT_ALIASES: Record<string, string> = {
  tactico: "radar",
  futbol: "soccer",
  americano: "american-football",
  "futbol-americano": "american-football",
  celebrando: "liga-mx",
};

export function getMascotPath(edition: string): string {
  const resolved = MASCOT_ALIASES[edition] ?? edition;
  return `/brand/mascot/r1/${resolved}.webp`;
}

export function getLogoPath(
  variant: "horizontal" | "compact" | "isologo" | "isotype" | "stacked" | "wordmark",
  theme: "dark" | "light" = "dark",
): string {
  return `/brand/logos/r1/pitchlab-${variant}-${theme}.svg`;
}

export function getFaviconPath(): string {
  return "/brand/app-icons/favicon.svg";
}
