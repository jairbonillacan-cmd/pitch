/**
 * CFDI 4.0 vía Facturapi (VISION_REESTRUCTURA_CLAUDE_GROWTH.md §4.2.H).
 * Validación local de datos fiscales + construcción de la factura. El envío a Facturapi
 * requiere FACTURAPI_KEY (la carga el fundador).
 */

export const SAT_TAX_SYSTEMS = ["601", "605", "612", "616", "626"] as const;
export type SatTaxSystem = (typeof SAT_TAX_SYSTEMS)[number];

/** RFC: 12 caracteres personas morales, 13 físicas (formato SAT con homoclave). */
const RFC_RE = /^([A-ZÑ&]{3,4})(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([A-Z\d]{2})([A\d])$/;

export function normalizeRfc(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function isValidRfc(raw: string): boolean {
  const rfc = normalizeRfc(raw);
  return (rfc.length === 12 || rfc.length === 13) && RFC_RE.test(rfc);
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
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.billingEmail.trim())) errors.push("Correo de facturación inválido");
  return errors.length
    ? { ok: false, errors }
    : { ok: true, value: { ...input, rfc, legalName, taxZipCode: input.taxZipCode.trim(), billingEmail: input.billingEmail.trim().toLowerCase() } };
}

/** Cuerpo de factura de Facturapi para una mensualidad de Pase Total (IVA 16 % incluido). */
export function buildPaseTotalInvoice(input: {
  customer: CfdiProfileInput;
  totalCentavos: number;
  planLabel: string;
  stripeInvoiceId: string;
}) {
  return {
    customer: {
      legal_name: cleanLegalName(input.customer.legalName),
      tax_id: normalizeRfc(input.customer.rfc),
      tax_system: input.customer.satTaxSystem,
      email: input.customer.billingEmail,
      address: { zip: input.customer.taxZipCode },
    },
    use: "G03",
    payment_form: "04",
    items: [
      {
        quantity: 1,
        product: {
          description: `Pase Total PitchLab · ${input.planLabel}`,
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
  if (!res.ok) throw new Error(`Facturapi respondió ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { id?: string; uuid?: string };
  if (!json.id || !json.uuid) throw new Error("Facturapi no devolvió id y uuid");
  return { facturapiInvoiceId: json.id, satUuid: json.uuid };
}
