import type { MetadataRoute } from "next";
import { BRAND_TOKENS } from "@pitchlab/tokens";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "PitchLab",
    short_name: "PitchLab",
    description:
      "Probabilidad estimada antes del partido, momio justo, armador de parlays y bitácora sellada.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    lang: "es-MX",
    background_color: BRAND_TOKENS["--background-primary"],
    theme_color: BRAND_TOKENS["--background-primary"],
    categories: ["sports", "utilities"],
    shortcuts: [
      { name: "Partidos de hoy", short_name: "Hoy", url: "/app" },
      { name: "Armar parlay", short_name: "Parlays", url: "/app/parlays" },
      { name: "Buscar picks", short_name: "Picks", url: "/app/picks" },
      { name: "Mi récord", short_name: "Récord", url: "/app/lab" },
    ],
    icons: [
      {
        src: "/brand/app-icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/app-icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/app-icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
