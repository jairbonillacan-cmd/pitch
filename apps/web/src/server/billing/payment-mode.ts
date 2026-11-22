export type PaymentMode = "transfer" | "stripe";

export interface TransferBankConfig {
  configured: boolean;
  bank: string | null;
  beneficiary: string | null;
  clabe: string | null;
  clabeMasked: string | null;
  instructions: string | null;
}

export function hasStripeConfig(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.STRIPE_SECRET_KEY?.trim() &&
      env.STRIPE_PRICE_MONTHLY?.trim() &&
      env.STRIPE_PRICE_ANNUAL?.trim(),
  );
}

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
