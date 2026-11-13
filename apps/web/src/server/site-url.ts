/**
 * Origen canónico del sitio público (sin barra final). Lo comparten `sitemap.ts`, `robots.ts`,
 * el blog (canónicas, JSON-LD y RSS) y `metadataBase`.
 */
export function getSiteUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "https://pitchlab.mx").replace(/\/$/, "");
}
