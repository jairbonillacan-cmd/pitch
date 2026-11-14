const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "tempmail.com",
  "10minutemail.com",
  "guerrillamail.com",
  "guerrillamailblock.com",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
  "throwawaymail.com",
  "getnada.com",
  "temp-mail.org",
  "dispostable.com",
  "maildrop.cc",
  "fakeinbox.com",
]);

/**
 * Normalización anti-abuso $0 MXN (Q8 / Q15):
 * - Elimina alias `+tag` y puntos en cuentas Gmail / Googlemail para impedir multicuentas.
 */
export function normalizeTrialEmail(rawEmail: string): string {
  const clean = rawEmail.trim().toLowerCase();
  const atIdx = clean.indexOf("@");
  if (atIdx <= 0) return clean;
  let local = clean.slice(0, atIdx);
  let domain = clean.slice(atIdx + 1);
  if (domain === "googlemail.com") {
    domain = "gmail.com";
  }
  const plusIdx = local.indexOf("+");
  if (plusIdx >= 0) {
    local = local.slice(0, plusIdx);
  }
  if (domain === "gmail.com") {
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

export function isDisposableEmailDomain(rawEmail: string): boolean {
  const clean = rawEmail.trim().toLowerCase();
  const atIdx = clean.indexOf("@");
  if (atIdx <= 0) return false;
  const domain = clean.slice(atIdx + 1);
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  for (const blocked of DISPOSABLE_DOMAINS) {
    if (domain.endsWith(`.${blocked}`)) return true;
  }
  return false;
}
