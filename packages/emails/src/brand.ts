import { STAGE_DARK_TOKENS as T } from "@pitchlab/tokens";

/**
 * Marca de los correos: el mismo escenario oscuro de la landing (negro puro, violeta claro, verde).
 * Los clientes de correo no entienden variables CSS, así que los tokens de `@pitchlab/tokens`
 * se resuelven aquí a valores literales.
 */
export const COLORS = {
  page: T["--pl-stage-bg"],
  card: T["--pl-stage-subtle"],
  well: T["--pl-surface"],
  border: T["--pl-border"],
  borderStrong: T["--pl-border-strong"],
  rule: T["--pl-row-rule"],
  text: T["--pl-text"],
  textSecondary: T["--pl-text-secondary"],
  textMuted: T["--pl-text-muted"],
  brand: T["--pl-brand"],
  accent: T["--pl-accent"],
  success: T["--pl-success"],
  warning: T["--pl-warning"],
  danger: T["--pl-danger"],
  info: T["--pl-info"],
  glow: T["--pl-glow"],
  buttonBg: T["--pl-btn-primary-bg"],
  buttonFg: T["--pl-btn-primary-fg"],
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
  // Para la vista previa local (archivo en disco) o un CDN distinto.
  if (process.env.EMAIL_LOGO_URL) return process.env.EMAIL_LOGO_URL;
  return `${siteUrl()}/brand/email/pitchlab-horizontal.png`;
}

/** Fuente de la marca para Apple Mail e iOS; el resto cae a la tipografía del sistema. */
export function fontUrl(): string {
  return `${siteUrl()}/fonts/InterVariable.woff2`;
}

export const LEGAL_LINE =
  "Información para decidir, no una garantía. PitchLab no acepta apuestas. Solo mayores de 18.";
