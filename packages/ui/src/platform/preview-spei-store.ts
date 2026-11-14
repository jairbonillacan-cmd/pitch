/**
 * Almacén efímero en `sessionStorage` exclusivamente para modo vista previa (`!accountsEnabled`).
 * Permite recorrer de punta a punta el flujo `/precio` -> `/app/admin` -> `/canjear` cuando la app
 * corre sin base de datos (PIN de preview / e2e), sin tocar rutas de producción con cuentas reales.
 */

export interface PreviewSpeiRequest {
  id: string;
  planInterval: "monthly" | "annual";
  amountCentavosMxn: number;
  reportedAmountCentavosMxn: number | null;
  amountMismatch: boolean;
  referralDiscountApplied: boolean;
  referenceCode: string;
  originBank: string | null;
  receiptReference: string | null;
  payerName: string | null;
  transferDate: string | null;
  userNote: string | null;
  adminNotes: string | null;
  status: "pending_review" | "approved" | "rejected" | "canceled";
  rejectionReason: string | null;
  reviewedAtIso: string | null;
  issuedCouponCode: string | null;
  couponExpiresAtIso: string | null;
  couponRedeemedAtIso: string | null;
  awaitingCouponRedemption: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface PreviewSpeiCoupon {
  id: string;
  code: string;
  days: number;
  maxRedemptions: number;
  redeemedCount: number;
  expiresAtIso: string;
  active: boolean;
  note: string | null;
  transferRequestId: string;
  isTransferCoupon: boolean;
  isPersonal: boolean;
  createdAtIso: string;
}

export interface PreviewSpeiState {
  speiReferenceCode: string;
  requests: PreviewSpeiRequest[];
  coupons: PreviewSpeiCoupon[];
  redeemedDemoCodes: string[];
  activeUntilIso: string | null;
  activeInterval: "monthly" | "annual" | null;
}

const STORAGE_KEY = "pl_preview_spei_v1";
export const PREVIEW_SPEI_EVENT = "pitchlab:preview-spei-updated";
const DAY_MS = 86_400_000;
const SAFE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomSafeChars(len: number): string {
  let out = "";
  for (let i = 0; i < len; i += 1) {
    out += SAFE_ALPHABET[Math.floor(Math.random() * SAFE_ALPHABET.length)] ?? "K";
  }
  return out;
}

function defaultState(): PreviewSpeiState {
  return {
    speiReferenceCode: "PL-SOCIOMX-8K4P",
    requests: [],
    coupons: [],
    redeemedDemoCodes: [],
    activeUntilIso: null,
    activeInterval: null,
  };
}

export function readPreviewSpeiState(): PreviewSpeiState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw) as Partial<PreviewSpeiState> | null;
    if (!parsed || typeof parsed !== "object") return defaultState();
    return {
      speiReferenceCode:
        typeof parsed.speiReferenceCode === "string" && parsed.speiReferenceCode.startsWith("PL-")
          ? parsed.speiReferenceCode
          : "PL-SOCIOMX-8K4P",
      requests: Array.isArray(parsed.requests) ? parsed.requests : [],
      coupons: Array.isArray(parsed.coupons) ? parsed.coupons : [],
      redeemedDemoCodes: Array.isArray(parsed.redeemedDemoCodes) ? parsed.redeemedDemoCodes : [],
      activeUntilIso: typeof parsed.activeUntilIso === "string" ? parsed.activeUntilIso : null,
      activeInterval:
        parsed.activeInterval === "annual" || parsed.activeInterval === "monthly"
          ? parsed.activeInterval
          : null,
    };
  } catch (err) {
    void err;
    return defaultState();
  }
}

function writePreviewSpeiState(next: PreviewSpeiState): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(PREVIEW_SPEI_EVENT));
  } catch (err) {
    void err;
  }
}

export function createOrUpdatePreviewTransfer(input: {
  planInterval: "monthly" | "annual";
  amountCentavosMxn: number;
  originBank?: string | null;
  reportedAmountCentavosMxn?: number | null;
  receiptReference?: string | null;
  payerName?: string | null;
  transferDate?: string | null;
  userNote?: string | null;
}): PreviewSpeiRequest {
  const state = readPreviewSpeiState();
  const nowIso = new Date().toISOString();
  const existingIdx = state.requests.findIndex((r) => r.status === "pending_review");
  const reported =
    input.reportedAmountCentavosMxn !== undefined ? input.reportedAmountCentavosMxn : null;

  if (existingIdx >= 0) {
    const current = state.requests[existingIdx]!;
    const nextReported = reported !== null ? reported : current.reportedAmountCentavosMxn;
    const updated: PreviewSpeiRequest = {
      ...current,
      originBank: input.originBank !== undefined ? input.originBank : current.originBank,
      reportedAmountCentavosMxn: nextReported,
      amountMismatch: nextReported !== null && nextReported !== current.amountCentavosMxn,
      receiptReference:
        input.receiptReference !== undefined ? input.receiptReference : current.receiptReference,
      payerName: input.payerName !== undefined ? input.payerName : current.payerName,
      transferDate: input.transferDate !== undefined ? input.transferDate : current.transferDate,
      userNote: input.userNote !== undefined ? input.userNote : current.userNote,
      updatedAtIso: nowIso,
    };
    const nextRequests = state.requests.slice();
    nextRequests[existingIdx] = updated;
    writePreviewSpeiState({ ...state, requests: nextRequests });
    return updated;
  }

  const created: PreviewSpeiRequest = {
    id: `prev-req-${Date.now().toString(36)}`,
    planInterval: input.planInterval,
    amountCentavosMxn: input.amountCentavosMxn,
    reportedAmountCentavosMxn: reported,
    amountMismatch: reported !== null && reported !== input.amountCentavosMxn,
    referralDiscountApplied: false,
    referenceCode: state.speiReferenceCode,
    originBank: input.originBank ?? null,
    receiptReference: input.receiptReference ?? null,
    payerName: input.payerName ?? null,
    transferDate: input.transferDate ?? null,
    userNote: input.userNote ?? null,
    adminNotes: null,
    status: "pending_review",
    rejectionReason: null,
    reviewedAtIso: null,
    issuedCouponCode: null,
    couponExpiresAtIso: null,
    couponRedeemedAtIso: null,
    awaitingCouponRedemption: false,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  writePreviewSpeiState({
    ...state,
    requests: [created, ...state.requests],
  });
  return created;
}

export function cancelPreviewTransfer(id: string): void {
  const state = readPreviewSpeiState();
  const nowIso = new Date().toISOString();
  const nextRequests = state.requests.map((r) =>
    r.id === id && r.status === "pending_review"
      ? { ...r, status: "canceled" as const, updatedAtIso: nowIso }
      : r,
  );
  writePreviewSpeiState({ ...state, requests: nextRequests });
}

export function approvePreviewTransfer(
  id: string,
  adminNotes?: string | null,
): { request: PreviewSpeiRequest; coupon: PreviewSpeiCoupon } | null {
  const state = readPreviewSpeiState();
  const target = state.requests.find((r) => r.id === id);
  if (!target) return null;
  if (target.status === "approved" && target.issuedCouponCode) {
    const existingCoupon = state.coupons.find((c) => c.code === target.issuedCouponCode);
    if (existingCoupon) return { request: target, coupon: existingCoupon };
  }
  if (target.status !== "pending_review") return null;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresAtIso = new Date(nowMs + 30 * DAY_MS).toISOString();
  const days = target.planInterval === "annual" ? 365 : 30;
  const code = `PL-${randomSafeChars(4)}-${randomSafeChars(4)}`;

  const coupon: PreviewSpeiCoupon = {
    id: `prev-cpn-${nowMs.toString(36)}`,
    code,
    days,
    maxRedemptions: 1,
    redeemedCount: 0,
    expiresAtIso,
    active: true,
    note: `Pago SPEI ${target.referenceCode} (${target.planInterval})`,
    transferRequestId: target.id,
    isTransferCoupon: true,
    isPersonal: true,
    createdAtIso: nowIso,
  };

  const updated: PreviewSpeiRequest = {
    ...target,
    status: "approved",
    adminNotes: adminNotes ?? target.adminNotes,
    reviewedAtIso: nowIso,
    issuedCouponCode: code,
    couponExpiresAtIso: expiresAtIso,
    couponRedeemedAtIso: null,
    awaitingCouponRedemption: true,
    updatedAtIso: nowIso,
  };

  writePreviewSpeiState({
    ...state,
    requests: state.requests.map((r) => (r.id === id ? updated : r)),
    coupons: [coupon, ...state.coupons],
  });

  return { request: updated, coupon };
}

export function rejectPreviewTransfer(
  id: string,
  reason: string,
  adminNotes?: string | null,
): PreviewSpeiRequest | null {
  const state = readPreviewSpeiState();
  const target = state.requests.find((r) => r.id === id);
  if (!target || target.status !== "pending_review") return null;
  const nowIso = new Date().toISOString();
  const updated: PreviewSpeiRequest = {
    ...target,
    status: "rejected",
    rejectionReason: reason,
    adminNotes: adminNotes ?? target.adminNotes,
    reviewedAtIso: nowIso,
    updatedAtIso: nowIso,
  };
  writePreviewSpeiState({
    ...state,
    requests: state.requests.map((r) => (r.id === id ? updated : r)),
  });
  return updated;
}

export function lookupPreviewCoupon(rawCode: string): {
  found: boolean;
  valid: boolean;
  reason?: "no_existe" | "inactivo" | "vencido" | "agotado" | "ya_canjeado";
  error?: string;
  coupon?: {
    code: string;
    days: number;
    maxRedemptions: number | null;
    expiresAtIso: string | null;
    isTransferCoupon: boolean;
    isPersonal: boolean;
  };
} {
  const code = rawCode.toUpperCase().replace(/\s+/g, "").slice(0, 32);
  const state = readPreviewSpeiState();
  const match = state.coupons.find((c) => c.code === code);
  if (!match) {
    if (code.startsWith("PL-SPEI-") || code.startsWith("INVALID")) {
      return {
        found: true,
        valid: false,
        reason: "no_existe",
        error:
          "No encontramos ese código. Revisa que esté bien escrito (sin espacios ni caracteres extra).",
      };
    }
    return { found: false, valid: true };
  }

  const summary = {
    code: match.code,
    days: match.days,
    maxRedemptions: match.maxRedemptions,
    expiresAtIso: match.expiresAtIso,
    isTransferCoupon: match.isTransferCoupon,
    isPersonal: match.isPersonal,
  };

  if (!match.active) {
    return {
      found: true,
      valid: false,
      reason: "inactivo",
      error: "Este cupón fue desactivado por el equipo de PitchLab.",
      coupon: summary,
    };
  }
  if (match.redeemedCount >= match.maxRedemptions) {
    return {
      found: true,
      valid: false,
      reason: "ya_canjeado",
      error: "Ya canjeaste este cupón en tu cuenta.",
      coupon: summary,
    };
  }
  if (Date.parse(match.expiresAtIso) <= Date.now()) {
    return {
      found: true,
      valid: false,
      reason: "vencido",
      error: "La vigencia de este cupón ya terminó.",
      coupon: summary,
    };
  }

  return { found: true, valid: true, coupon: summary };
}

export function redeemPreviewCoupon(rawCode: string):
  | {
      ok: true;
      code: string;
      days: number;
      transferActivated: boolean;
      newAccessUntilIso: string;
    }
  | {
      ok: false;
      reason: "no_existe" | "inactivo" | "vencido" | "agotado" | "ya_canjeado";
      error: string;
    } {
  const code = rawCode.toUpperCase().replace(/\s+/g, "").slice(0, 32);
  const state = readPreviewSpeiState();
  const match = state.coupons.find((c) => c.code === code);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  if (match) {
    if (!match.active) {
      return {
        ok: false,
        reason: "inactivo",
        error: "Este cupón fue desactivado por el equipo de PitchLab.",
      };
    }
    if (match.redeemedCount >= match.maxRedemptions) {
      return {
        ok: false,
        reason: "ya_canjeado",
        error: "Ya canjeaste este cupón en tu cuenta.",
      };
    }
    if (Date.parse(match.expiresAtIso) <= nowMs) {
      return {
        ok: false,
        reason: "vencido",
        error: "La vigencia de este cupón ya terminó.",
      };
    }

    const baseMs =
      state.activeUntilIso && Date.parse(state.activeUntilIso) > nowMs
        ? Date.parse(state.activeUntilIso)
        : nowMs;
    const newAccessUntilIso = new Date(baseMs + match.days * DAY_MS).toISOString();

    const nextCoupons = state.coupons.map((c) =>
      c.id === match.id ? { ...c, redeemedCount: c.redeemedCount + 1 } : c,
    );
    const nextRequests = state.requests.map((r) =>
      r.id === match.transferRequestId
        ? {
            ...r,
            couponRedeemedAtIso: nowIso,
            awaitingCouponRedemption: false,
            updatedAtIso: nowIso,
          }
        : r,
    );

    writePreviewSpeiState({
      ...state,
      coupons: nextCoupons,
      requests: nextRequests,
      activeUntilIso: newAccessUntilIso,
      activeInterval: match.days >= 365 ? "annual" : "monthly",
    });

    return {
      ok: true,
      code: match.code,
      days: match.days,
      transferActivated: true,
      newAccessUntilIso,
    };
  }

  if (code.startsWith("PL-SPEI-") || code.startsWith("INVALID")) {
    return {
      ok: false,
      reason: "no_existe",
      error:
        "No encontramos ese código. Revisa que esté bien escrito (sin espacios ni caracteres extra).",
    };
  }

  const demoDays = 15;
  const newAccessUntilIso = new Date(nowMs + demoDays * DAY_MS).toISOString();
  writePreviewSpeiState({
    ...state,
    redeemedDemoCodes: state.redeemedDemoCodes.includes(code)
      ? state.redeemedDemoCodes
      : [...state.redeemedDemoCodes, code],
  });
  return {
    ok: true,
    code,
    days: demoDays,
    transferActivated: false,
    newAccessUntilIso,
  };
}
