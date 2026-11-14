/**
 * Modo de cobro en PitchLab (`transfer` por defecto en Beta 1.0, o `stripe` cuando se
 * habilite explícitamente con credenciales y precios válidos). Permite apagar Stripe sin
 * borrar el código futuro de Checkout, webhooks ni Connect.
 */

export type PaymentMode = "transfer" | "stripe";

export interface TransferBankConfig {
  configured: boolean;
  bank: string | null;
  beneficiary: string | null;
  clabe: string | null;
  clabeMasked: string | null;
  instructions: string | null;
}

/** Indica si están presentes todas las credenciales base de Stripe Checkout. */
export function hasStripeConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.STRIPE_SECRET_KEY?.trim() &&
      env.STRIPE_PRICE_MONTHLY?.trim() &&
      env.STRIPE_PRICE_ANNUAL?.trim(),
  );
}

/**
 * Determina el modo de cobro activo en servidor.
 * Solo devuelve `"stripe"` cuando `PITCHLAB_PAYMENTS_MODE=stripe` y además existen
 * las tres variables requeridas de Stripe; en cualquier otro caso devuelve `"transfer"`.
 */
export function paymentMode(env: NodeJS.ProcessEnv = process.env): PaymentMode {
  const configuredMode = env.PITCHLAB_PAYMENTS_MODE?.trim().toLowerCase();
  if (configuredMode === "stripe" && hasStripeConfig(env)) {
    return "stripe";
  }
  return "transfer";
}

export function maskClabe(clabe: string | null): string | null {
  if (!clabe || clabe.length < 4) return null;
  return `•••• ${clabe.slice(-4)}`;
}

/**
 * Lee los datos bancarios para transferencia SPEI desde variables de entorno.
 * Nunca debe enviarse en HTML público sin sesión ni incluirse en código de `@pitchlab/ui`.
 */
export function getTransferBankConfig(
  env: NodeJS.ProcessEnv = process.env,
): TransferBankConfig {
  const bank = env.PITCHLAB_TRANSFER_BANK?.trim() || null;
  const beneficiary = env.PITCHLAB_TRANSFER_BENEFICIARY?.trim() || null;
  const rawClabe = (env.PITCHLAB_TRANSFER_CLABE ?? "").replace(/[\s-]+/g, "").trim();
  const clabe = /^\d{18}$/.test(rawClabe) ? rawClabe : null;
  const instructions = env.PITCHLAB_TRANSFER_INSTRUCTIONS?.trim() || null;

  return {
    configured: Boolean(bank && beneficiary && clabe),
    bank,
    beneficiary,
    clabe,
    clabeMasked: maskClabe(clabe),
    instructions,
  };
}
