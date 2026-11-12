import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.BETTER_AUTH_URL ?? "https://pitchlab.mx").replace(/\/$/, "");
  const publicPaths = [
    "",
    "/como-funciona",
    "/parlays",
    "/resultados",
    "/motores",
    "/precio",
    "/comunidad",
    "/legal/privacidad",
    "/legal/terminos",
    "/legal/juego-responsable",
    "/legal/creditos",
  ];

  return publicPaths.map((path) => ({
    url: `${baseUrl}${path || "/"}`,
    changeFrequency: path.startsWith("/legal/") ? "monthly" : "daily",
    priority: path === "" ? 1 : path.startsWith("/legal/") ? 0.3 : 0.8,
  }));
}
