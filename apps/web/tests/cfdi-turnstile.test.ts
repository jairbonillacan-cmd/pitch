import { describe, expect, it } from "vitest";
import {
  buildPaseTotalInvoice,
  cleanLegalName,
  isValidRfc,
  stampInvoice,
  validateCfdiProfile,
} from "../src/server/billing/cfdi";
import { verifyTurnstile } from "../src/server/turnstile";

describe("CFDI 4.0", () => {
  it("valida RFC de personas físicas y morales", () => {
    expect(isValidRfc("XAXX010101000")).toBe(true);
    expect(isValidRfc("ABC 010203 AB1")).toBe(true);
    expect(isValidRfc("XAXX011301000")).toBe(false);
    expect(isValidRfc("123")).toBe(false);
  });

  it("quita el régimen societario de la razón social", () => {
    expect(cleanLegalName("Pitch Lab, S.A. de C.V.")).toBe("PITCH LAB");
    expect(cleanLegalName("Datos Mx SAPI de CV")).toBe("DATOS MX");
    expect(cleanLegalName("Juan Pérez López")).toBe("JUAN PÉREZ LÓPEZ");
  });

  it("revisa régimen contra tipo de persona", () => {
    const base = { rfc: "XAXX010101000", legalName: "Juan Pérez", taxZipCode: "06600", billingEmail: "J@Example.com" };
    expect(validateCfdiProfile({ ...base, satTaxSystem: "612" })).toMatchObject({ ok: true, value: { billingEmail: "j@example.com" } });
    expect(validateCfdiProfile({ ...base, satTaxSystem: "601" })).toMatchObject({ ok: false });
    expect(validateCfdiProfile({ ...base, satTaxSystem: "612", taxZipCode: "666" })).toMatchObject({ ok: false });
  });

  it("arma la factura y la timbra con Facturapi", async () => {
    const body = buildPaseTotalInvoice({
      customer: { rfc: "ABC010203AB1", legalName: "ABC Datos SA de CV", taxZipCode: "06600", satTaxSystem: "601", billingEmail: "f@example.com" },
      totalCentavos: 29900,
      planLabel: "Mensual",
      stripeInvoiceId: "in_1",
    });
    expect(body.customer.legal_name).toBe("ABC DATOS");
    expect(body.items[0]!.product.price).toBe(299);
    const calls: string[] = [];
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push(`${url} ${String((init?.headers as Record<string, string>).authorization)}`);
      return new Response(JSON.stringify({ id: "inv_1", uuid: "11111111-2222-3333-4444-555555555555" }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await stampInvoice("sk_test", body, fakeFetch)).toEqual({ facturapiInvoiceId: "inv_1", satUuid: "11111111-2222-3333-4444-555555555555" });
    expect(calls[0]).toBe("https://www.facturapi.io/v2/invoices Bearer sk_test");
  });
});

describe("Turnstile", () => {
  const ok = (json: unknown) =>
    (async () => new Response(JSON.stringify(json), { status: 200 })) as unknown as typeof fetch;

  it("sin clave o sin token, no deja pasar", async () => {
    expect(await verifyTurnstile("t", { secret: "" })).toMatchObject({ ok: false });
    expect(await verifyTurnstile(null, { secret: "s" })).toEqual({ ok: false, reason: "falta_token" });
  });

  it("acepta la respuesta válida y revisa la acción", async () => {
    expect(await verifyTurnstile("t", { secret: "s", fetchImpl: ok({ success: true, action: "signup" }), expectedAction: "signup" })).toMatchObject({ ok: true });
    expect(await verifyTurnstile("t", { secret: "s", fetchImpl: ok({ success: true, action: "login" }), expectedAction: "signup" })).toEqual({ ok: false, reason: "accion_distinta" });
    expect(await verifyTurnstile("t", { secret: "s", fetchImpl: ok({ success: false, "error-codes": ["invalid-input-response"] }) })).toEqual({ ok: false, reason: "invalid-input-response" });
  });
});
