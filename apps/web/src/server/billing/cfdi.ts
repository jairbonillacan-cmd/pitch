/**
 * CFDI 4.0 vía Facturapi (VISION_REESTRUCTURA_CLAUDE_GROWTH.md §4.2.H).
 * Validación local de datos fiscales + construcción de la factura. El envío a Facturapi
 * requiere FACTURAPI_KEY (la carga el fundador).
 */

export const SAT_TAX_SYSTEMS = ["601", "605", "612", "616", "626"] as const;
export type SatTaxSystem = (typeof SAT_TAX_SYSTEMS)[number];

export const SAT_CFDI_USES = ["G03", "S01"] as const;
export type SatCfdiUse = (typeof SAT_CFDI_USES)[number];

/** RFC: 12 caracteres personas morales, 13 físicas (formato SAT con homoclave). */
const RFC_RE = /^([A-ZÑ&]{3,4})(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([A-Z\d]{2})([A\d])$/;

export function normalizeRfc(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

function isValidRfcDate(yy: number, mm: number, dd: number): boolean {
  // Se usa 2000 + yy para admitir 29/feb en años bisiestos múltiplos de 4 (incluido 00 -> 2000).
  const fullYear = 2000 + yy;
  const candidate = new Date(Date.UTC(fullYear, mm - 1, dd));
  return (
    candidate.getUTCFullYear() === fullYear &&
    candidate.getUTCMonth() === mm - 1 &&
    candidate.getUTCDate() === dd
  );
}

export function isValidRfc(raw: string): boolean {
  const rfc = normalizeRfc(raw);
  if (rfc.length !== 12 && rfc.length !== 13) return false;
  const match = RFC_RE.exec(rfc);
  if (!match) return false;
  return isValidRfcDate(Number(match[2]), Number(match[3]), Number(match[4]));
}

/** El CFDI 4.0 exige la razón social sin régimen societario («SA DE CV», «SAPI DE CV», …). */
const CORPORATE_SUFFIX_RE =
  /[\s,]+(S\.?\s?A\.?\s?P\.?\s?I\.?|S\.?\s?A\.?|S\.?\s?DE\s?R\.?\s?L\.?|S\.?\s?C\.?|A\.?\s?C\.?)(\s+DE\s+C\.?\s?V\.?)?\.?$/i;

export function cleanLegalName(raw: string): string {
  let name = raw.trim().toUpperCase().replace(/\s+/g, " ");
  for (let i = 0; i < 2; i += 1) name = name.replace(CORPORATE_SUFFIX_RE, "").trim();
  return name;
}

export interface CfdiProfileInput {
  rfc: string;
  legalName: string;
  taxZipCode: string;
  satTaxSystem: string;
  cfdiUse?: string;
  billingEmail: string;
}

export function validateCfdiProfile(input: CfdiProfileInput): { ok: true; value: CfdiProfileInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const rfc = normalizeRfc(input.rfc);
  if (!isValidRfc(rfc)) errors.push("RFC inválido");
  const legalName = cleanLegalName(input.legalName);
  if (legalName.length < 2) errors.push("Razón social vacía");
  if (!/^\d{5}$/.test(input.taxZipCode.trim())) errors.push("Código postal fiscal de 5 dígitos");
  if (!SAT_TAX_SYSTEMS.includes(input.satTaxSystem as SatTaxSystem)) errors.push("Régimen fiscal no admitido");
  if (rfc.length === 13 && input.satTaxSystem === "601") errors.push("El régimen 601 es de personas morales");
  if (rfc.length === 12 && ["605", "612", "626"].includes(input.satTaxSystem)) errors.push("Ese régimen es de personas físicas");
  const resolvedUse = input.cfdiUse?.trim().toUpperCase() || (input.satTaxSystem === "616" ? "S01" : "G03");
  if (!SAT_CFDI_USES.includes(resolvedUse as SatCfdiUse)) errors.push("Uso de CFDI no admitido");
  if (input.satTaxSystem === "616" && resolvedUse !== "S01") {
    errors.push("El régimen 616 exige uso de CFDI S01");
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.billingEmail.trim())) errors.push("Correo de facturación inválido");
  return errors.length
    ? { ok: false, errors }
    : {
        ok: true,
        value: {
          ...input,
          rfc,
          legalName,
          taxZipCode: input.taxZipCode.trim(),
          cfdiUse: resolvedUse,
          billingEmail: input.billingEmail.trim().toLowerCase(),
        },
      };
}

/** Cuerpo de factura de Facturapi para una mensualidad de Pase PitchLab Ultra (IVA 16 % incluido). */
export function buildPaseTotalInvoice(input: {
  customer: CfdiProfileInput;
  totalCentavos: number;
  planLabel: string;
  stripeInvoiceId: string;
}) {
  if (!Number.isInteger(input.totalCentavos) || input.totalCentavos <= 0) {
    throw new Error("Monto de factura inválido en centavos");
  }
  const rawUse = input.customer.cfdiUse?.trim().toUpperCase();
  const cfdiUse: SatCfdiUse =
    input.customer.satTaxSystem === "616"
      ? "S01"
      : rawUse && SAT_CFDI_USES.includes(rawUse as SatCfdiUse)
        ? (rawUse as SatCfdiUse)
        : "G03";

  return {
    customer: {
      legal_name: cleanLegalName(input.customer.legalName),
      tax_id: normalizeRfc(input.customer.rfc),
      tax_system: input.customer.satTaxSystem,
      email: input.customer.billingEmail,
      address: { zip: input.customer.taxZipCode },
    },
    use: cfdiUse,
    payment_form: "04",
    items: [
      {
        quantity: 1,
        product: {
          description: `Pase PitchLab Ultra · ${input.planLabel}`,
          product_key: "81112106",
          price: input.totalCentavos / 100,
          tax_included: true,
          taxes: [{ type: "IVA", rate: 0.16 }],
        },
      },
    ],
    external_id: input.stripeInvoiceId,
  };
}

/** Envía la factura a Facturapi y devuelve su id y folio fiscal (UUID del SAT). */
export async function stampInvoice(
  apiKey: string,
  body: ReturnType<typeof buildPaseTotalInvoice>,
  fetchImpl: typeof fetch = fetch,
): Promise<{ facturapiInvoiceId: string; satUuid: string }> {
  const res = await fetchImpl("https://www.facturapi.io/v2/invoices", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as { code?: unknown; type?: unknown } | null;
    const rawCode =
      typeof errBody?.code === "string"
        ? errBody.code
        : typeof errBody?.type === "string"
          ? errBody.type
          : "";
    const safeCode = /^[a-zA-Z0-9_.-]{1,48}$/.test(rawCode) ? ` (${rawCode})` : "";
    throw new Error(`Facturapi rechazó el timbrado con estado ${res.status}${safeCode}`);
  }
  const json = (await res.json()) as { id?: string; uuid?: string };
  if (!json.id || !json.uuid) throw new Error("Facturapi no devolvió id y uuid");
  return { facturapiInvoiceId: json.id, satUuid: json.uuid };
}
