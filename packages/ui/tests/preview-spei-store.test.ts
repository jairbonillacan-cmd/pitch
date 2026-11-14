import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  approvePreviewTransfer,
  createOrUpdatePreviewTransfer,
  lookupPreviewCoupon,
  readPreviewSpeiState,
  redeemPreviewCoupon,
  rejectPreviewTransfer,
} from "../src/platform/preview-spei-store";

/*
 * Flujo SPEI de vista previa (sin base de datos): el socio reporta su transferencia,
 * el fundador la aprueba y se emite un cupón personal de un solo uso que el socio canjea.
 * El E2E ya no puede abrir la Consola con el PIN beta (solo admin), así que la parte
 * del fundador se cubre aquí.
 */

function installFakeWindow(): void {
  const store = new Map<string, string>();
  const sessionStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  (globalThis as unknown as { window: unknown }).window = {
    sessionStorage,
    dispatchEvent: () => true,
  };
}

beforeEach(() => {
  installFakeWindow();
});

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

const report = () =>
  createOrUpdatePreviewTransfer({
    planInterval: "monthly",
    amountCentavosMxn: 29_900,
    originBank: "BBVA México",
    receiptReference: "SPEI-E2E-7788",
  });

describe("preview-spei-store", () => {
  it("el reporte queda pendiente de revisión con la referencia del socio", () => {
    const req = report();
    expect(req.status).toBe("pending_review");
    expect(req.originBank).toBe("BBVA México");
    expect(req.referenceCode).toBe(readPreviewSpeiState().speiReferenceCode);
  });

  it("aprobar emite un cupón personal de un uso, 30 días, con vigencia para canjear", () => {
    const req = report();
    const result = approvePreviewTransfer(req.id);
    expect(result).not.toBeNull();
    const { request, coupon } = result!;
    expect(request.status).toBe("approved");
    expect(request.awaitingCouponRedemption).toBe(true);
    expect(coupon.code).toMatch(
      /^PL-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/,
    );
    expect(coupon.days).toBe(30);
    expect(coupon.maxRedemptions).toBe(1);
    expect(coupon.isPersonal).toBe(true);
    expect(Date.parse(coupon.expiresAtIso)).toBeGreaterThan(Date.now());
    // Aprobar dos veces devuelve el mismo cupón, no emite otro.
    expect(approvePreviewTransfer(req.id)?.coupon.code).toBe(coupon.code);
    expect(readPreviewSpeiState().coupons).toHaveLength(1);
  });

  it("el cupón se canjea una sola vez y activa la suscripción", () => {
    const { coupon } = approvePreviewTransfer(report().id)!;
    expect(lookupPreviewCoupon(coupon.code)).toMatchObject({ found: true, valid: true });

    const first = redeemPreviewCoupon(coupon.code.toLowerCase());
    expect(first).toMatchObject({ ok: true, days: 30, transferActivated: true });
    const state = readPreviewSpeiState();
    expect(state.activeInterval).toBe("monthly");
    expect(state.requests[0]!.awaitingCouponRedemption).toBe(false);

    expect(redeemPreviewCoupon(coupon.code)).toMatchObject({ ok: false, reason: "ya_canjeado" });
    expect(lookupPreviewCoupon(coupon.code)).toMatchObject({ valid: false, reason: "ya_canjeado" });
  });

  it("una transferencia rechazada ya no se puede aprobar", () => {
    const req = report();
    rejectPreviewTransfer(req.id, "El monto no coincide");
    expect(approvePreviewTransfer(req.id)).toBeNull();
    expect(readPreviewSpeiState().coupons).toHaveLength(0);
  });
});
