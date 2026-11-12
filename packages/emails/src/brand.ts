import { BRAND_TOKENS } from "@pitchlab/tokens";

/**
 * Marca de los correos. Los colores salen de `@pitchlab/tokens` (tema oscuro): los clientes de
 * correo no entienden variables CSS, así que se resuelven aquí a valores literales.
 */
export const COLORS = {
  page: BRAND_TOKENS["--background-primary"],
  card: BRAND_TOKENS["--surface-default"],
  cardSoft: BRAND_TOKENS["--background-secondary"],
  border: BRAND_TOKENS["--border-default"],
  text: BRAND_TOKENS["--text-primary"],
  textSecondary: BRAND_TOKENS["--text-secondary"],
  textMuted: BRAND_TOKENS["--text-muted"],
  primary: BRAND_TOKENS["--brand-primary"],
  onPrimary: BRAND_TOKENS["--background-primary"],
  accent: BRAND_TOKENS["--brand-accent"],
  success: BRAND_TOKENS["--success"],
  warning: BRAND_TOKENS["--warning"],
  danger: BRAND_TOKENS["--danger"],
  info: BRAND_TOKENS["--info"],
} as const;

export const FONT_STACK =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Dominio público. Los enlaces y el logo de los correos siempre son absolutos. */
export function siteUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "https://pitchlab.mx").replace(/\/$/, "");
}

export function supportEmail(): string {
  return process.env.PITCHLAB_SUPPORT_EMAIL ?? "soporte@pitchlab.mx";
}

/** PNG generado por `pnpm --filter @pitchlab/emails logos` (Gmail y Outlook no muestran SVG). */
export function logoUrl(): string {
  return `${siteUrl()}/brand/email/pitchlab-horizontal.png`;
}

export const LEGAL_LINE =
  "Información para decidir, no una garantía. PitchLab no acepta apuestas. Solo mayores de 18.";
