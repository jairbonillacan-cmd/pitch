"use client";

import React, { useCallback, useEffect, useId, useState } from "react";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { TopLayerModalDialog } from "../components/PlatformOverlays";
import { usePlatform } from "../platform-provider";
import {
  approvePreviewTransfer,
  PREVIEW_SPEI_EVENT,
  readPreviewSpeiState,
  rejectPreviewTransfer,
} from "../preview-spei-store";
import { sanitizeCsvCell } from "./account/account-helpers";
import { TabPanel, UnderlineTabs, type TabDef } from "./community-ui";

export type AdminOpsTabKey = "transfers" | "members" | "coupons" | "payouts" | "inbox" | "audit";

const ADMIN_OPS_TABS: readonly TabDef<AdminOpsTabKey>[] = [
  { key: "transfers", label: "Transferencias SPEI", shortLabel: "SPEI" },
  { key: "members", label: "Socios y acceso", shortLabel: "Socios" },
  { key: "coupons", label: "Cupones", shortLabel: "Cupones" },
  { key: "payouts", label: "Liquidaciones tipsters", shortLabel: "Tipsters" },
  { key: "inbox", label: "Bandeja y soporte", shortLabel: "Bandeja" },
  { key: "audit", label: "Auditoría", shortLabel: "Auditoría" },
];

export interface AdminInboxRow {
  id: string;
  kind: "feedback" | "support" | "deletion";
  actorUserId: string | null;
  actorEmail: string;
  handle: string | null;
  displayName: string | null;
  subject: string | null;
  category: string | null;
  message: string;
  createdAtIso: string;
  resolved: boolean;
  resolvedAtIso: string | null;
  resolvedByEmail: string | null;
  resolutionNote: string | null;
}

export interface AdminAuditRow {
  id: string;
  action: string;
  actorEmail: string;
  targetKey: string;
  payloadJson: Record<string, unknown> | null;
  createdAtIso: string;
}

const INBOX_KIND_META: Record<AdminInboxRow["kind"], { label: string; pill: string }> = {
  feedback: { label: "Feedback", pill: "pl-pill--brand" },
  support: { label: "Soporte", pill: "pl-pill--warning" },
  deletion: { label: "Solicitud de baja", pill: "pl-pill--danger" },
};

const QUICK_COUPON_DAYS = [7, 15, 30, 90, 365] as const;

export interface AdminTransferRow {
  id: string;
  userId: string;
  userEmail: string;
  userHandle: string | null;
  userDisplayName: string | null;
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
  issuedCouponCode?: string | null;
  couponExpiresAtIso?: string | null;
  couponRedeemedAtIso?: string | null;
  awaitingCouponRedemption?: boolean;
  createdAtIso: string;
}

export interface AdminMemberGrantItem {
  id: string;
  sourceKind: string;
  daysGranted: number;
  startsAtIso: string;
  endsAtIso: string;
  revokedAtIso: string | null;
  revokeReason: string | null;
  note: string | null;
}

export interface AdminMemberItem {
  id: string;
  email: string;
  handle: string | null;
  displayName: string | null;
  isAmbassador: boolean;
  accessUntilIso: string | null;
  activeSourceKind: string | null;
  grants: AdminMemberGrantItem[];
}

export interface AdminCouponItem {
  id: string;
  code: string;
  days: number;
  maxRedemptions: number | null;
  redeemedCount: number;
  expiresAtIso: string | null;
  active: boolean;
  note: string | null;
  transferRequestId?: string | null;
  restrictedToUserId?: string | null;
  createdAtIso: string;
}

export interface AdminCouponRedemptionItem {
  id: string;
  userId: string;
  email: string;
  handle: string | null;
  displayName: string | null;
  createdAtIso: string;
}

export interface AdminTipsterSummaryItem {
  tipsterUserId: string;
  handle: string;
  displayName: string;
  email: string;
  pendingClearanceCentavos: number;
  payableCentavos: number;
  paidOutCentavos: number;
  payableCount: number;
}

export interface AdminTipsterLedgerItem {
  id: string;
  tipsterUserId: string;
  tipsterHandle: string;
  tipsterName: string;
  tipsterEmail: string;
  stripeInvoiceId: string;
  commissionCentavosMxn: number;
  commissionBps: number;
  status: string;
  clearsAtIso: string;
  stripeTransferId: string | null;
  payoutNote: string | null;
  paidOutAtIso: string | null;
  createdAtIso: string;
}

export interface AdminPaymentsStoryOverride {
  accountsEnabled?: boolean;
  initialTab?: AdminOpsTabKey;
  transfers?: AdminTransferRow[];
  members?: AdminMemberItem[];
  coupons?: AdminCouponItem[];
  payouts?: {
    totalsByTipster: AdminTipsterSummaryItem[];
    ledger: AdminTipsterLedgerItem[];
  };
}

const DATE_FMT = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Mexico_City",
});

function formatDateMx(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return DATE_FMT.format(new Date(ms)).replace(/\./g, "");
}

function formatMxn(centavos: number): string {
  const pesos = centavos / 100;
  return `$${pesos.toLocaleString("es-MX", {
    minimumFractionDigits: centavos % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} MXN`;
}

const SOURCE_LABELS: Record<string, string> = {
  trial: "Prueba gratis",
  transfer_payment: "Transferencia SPEI",
  coupon: "Cupón",
  referral_bonus: "Referido (+7d)",
  ambassador_bonus: "Embajador (+30d)",
  admin_grant: "Cortesía manual",
  tipster_free: "Tipster oficial",
  subscription: "Suscripción Stripe",
};

const TRANSFER_STATUS_LABELS: Record<
  AdminTransferRow["status"],
  { label: string; pill: string }
> = {
  pending_review: { label: "Pendiente", pill: "pl-pill--warning" },
  approved: { label: "Aprobada", pill: "pl-pill--success" },
  rejected: { label: "Rechazada", pill: "pl-pill--danger" },
  canceled: { label: "Cancelada", pill: "" },
};

type AdminDialogState =
  | { kind: "approve"; row: AdminTransferRow }
  | { kind: "reject"; row: AdminTransferRow }
  | { kind: "grant"; member: AdminMemberItem }
  | { kind: "revoke"; member: AdminMemberItem; grant: AdminMemberGrantItem }
  | { kind: "redemptions"; coupon: AdminCouponItem }
  | { kind: "markPaid"; row: AdminTipsterLedgerItem }
  | null;

export function AdminPaymentsCouponsSection({
  storyOverride,
}: {
  storyOverride?: AdminPaymentsStoryOverride;
} = {}): React.JSX.Element {
  const {
    accountsEnabled: ctxAccountsEnabled,
    hasAccountSessionAuth,
    paymentMode,
    pushToast,
  } = usePlatform();
  const accountsEnabled = storyOverride?.accountsEnabled ?? ctxAccountsEnabled;
  const isStoryMock = Boolean(storyOverride);
  const canFetchAdmin = Boolean(
    !isStoryMock &&
      (storyOverride?.accountsEnabled !== undefined
        ? storyOverride.accountsEnabled
        : hasAccountSessionAuth),
  );

  const [activeTab, setActiveTab] = useState<AdminOpsTabKey>(
    storyOverride?.initialTab ?? "transfers",
  );
  const idPrefix = useId();
  const dialogTitleId = useId();

  // --- Transfers ---
  const [transferFilter, setTransferFilter] = useState<"pending_review" | "all" | "approved" | "rejected">(
    "pending_review",
  );
  const [transferQuery, setTransferQuery] = useState("");
  const [transfers, setTransfers] = useState<AdminTransferRow[]>(storyOverride?.transfers ?? []);
  const [transfersLoading, setTransfersLoading] = useState(false);
  const [transfersError, setTransfersError] = useState<string | null>(null);

  // --- Members ---
  const [memberQuery, setMemberQuery] = useState("");
  const [members, setMembers] = useState<AdminMemberItem[]>(storyOverride?.members ?? []);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);

  // --- Coupons ---
  const [coupons, setCoupons] = useState<AdminCouponItem[]>(storyOverride?.coupons ?? []);
  const [couponsLoading, setCouponsLoading] = useState(false);
  const [couponsError, setCouponsError] = useState<string | null>(null);
  const [newCouponCode, setNewCouponCode] = useState("");
  const [newCouponDays, setNewCouponDays] = useState("30");
  const [newCouponMaxUses, setNewCouponMaxUses] = useState("1");
  const [newCouponExpires, setNewCouponExpires] = useState("");
  const [newCouponNote, setNewCouponNote] = useState("");
  const [batchCount, setBatchCount] = useState("10");
  const [batchDays, setBatchDays] = useState("30");
  const [batchPrefix, setBatchPrefix] = useState("");
  const [batchExpires, setBatchExpires] = useState("");
  const [batchNote, setBatchNote] = useState("");
  const [generatedBatch, setGeneratedBatch] = useState<AdminCouponItem[]>([]);
  const [redemptions, setRedemptions] = useState<AdminCouponRedemptionItem[]>([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);

  // --- Inbox (Feedback, Soporte, Bajas) ---
  const [inboxItems, setInboxItems] = useState<AdminInboxRow[]>([]);
  const [inboxFilter, setInboxFilter] = useState<"pending" | "all" | "feedback" | "support" | "deletion">("pending");
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);

  // --- Security Audit ---
  const [auditEntries, setAuditEntries] = useState<AdminAuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  // --- Tipster payouts ---
  const [tipsterTotals, setTipsterTotals] = useState<AdminTipsterSummaryItem[]>(
    storyOverride?.payouts?.totalsByTipster ?? [],
  );
  const [tipsterLedger, setTipsterLedger] = useState<AdminTipsterLedgerItem[]>(
    storyOverride?.payouts?.ledger ?? [],
  );
  const [payoutsLoading, setPayoutsLoading] = useState(false);
  const [payoutsError, setPayoutsError] = useState<string | null>(null);

  // --- Modal state ---
  const [dialog, setDialog] = useState<AdminDialogState>(null);
  const [busyAction, setBusyAction] = useState(false);
  const [dialogNote, setDialogNote] = useState("");
  const [dialogReason, setDialogReason] = useState("");
  const [grantDays, setGrantDays] = useState("15");
  const [payoutRef, setPayoutRef] = useState("");

  const isPreviewMode = !canFetchAdmin && !isStoryMock && !accountsEnabled;

  const syncPreviewAdminData = useCallback(() => {
    if (!isPreviewMode) return;
    const st = readPreviewSpeiState();
    const mappedTransfers: AdminTransferRow[] = st.requests
      .filter((r) => (transferFilter === "all" ? true : r.status === transferFilter))
      .filter((r) => {
        const q = transferQuery.trim().toLowerCase();
        if (!q) return true;
        return (
          r.referenceCode.toLowerCase().includes(q) ||
          (r.issuedCouponCode ?? "").toLowerCase().includes(q) ||
          "socio@pitchlab.mx".includes(q) ||
          "socio_mx".includes(q)
        );
      })
      .map((r) => ({
        id: r.id,
        userId: "preview-user",
        userEmail: "socio@pitchlab.mx",
        userHandle: "socio_mx",
        userDisplayName: "Socio Vista Previa",
        planInterval: r.planInterval,
        amountCentavosMxn: r.amountCentavosMxn,
        reportedAmountCentavosMxn: r.reportedAmountCentavosMxn,
        amountMismatch: r.amountMismatch,
        referralDiscountApplied: r.referralDiscountApplied,
        referenceCode: r.referenceCode,
        originBank: r.originBank,
        receiptReference: r.receiptReference,
        payerName: r.payerName,
        transferDate: r.transferDate,
        userNote: r.userNote,
        adminNotes: r.adminNotes,
        status: r.status,
        rejectionReason: r.rejectionReason,
        reviewedAtIso: r.reviewedAtIso,
        issuedCouponCode: r.issuedCouponCode,
        couponExpiresAtIso: r.couponExpiresAtIso,
        couponRedeemedAtIso: r.couponRedeemedAtIso,
        awaitingCouponRedemption: r.awaitingCouponRedemption,
        createdAtIso: r.createdAtIso,
      }));
    setTransfers(mappedTransfers);
    setCoupons(
      st.coupons.map((c) => ({
        id: c.id,
        code: c.code,
        days: c.days,
        maxRedemptions: c.maxRedemptions,
        redeemedCount: c.redeemedCount,
        expiresAtIso: c.expiresAtIso,
        active: c.active,
        note: c.note,
        transferRequestId: c.transferRequestId,
        createdAtIso: c.createdAtIso,
      })),
    );
  }, [isPreviewMode, transferFilter, transferQuery]);

  useEffect(() => {
    if (!isPreviewMode) return;
    syncPreviewAdminData();
    window.addEventListener(PREVIEW_SPEI_EVENT, syncPreviewAdminData);
    return () => window.removeEventListener(PREVIEW_SPEI_EVENT, syncPreviewAdminData);
  }, [isPreviewMode, syncPreviewAdminData]);

  const loadTransfers = useCallback(async () => {
    if (isPreviewMode) {
      syncPreviewAdminData();
      return;
    }
    if (!canFetchAdmin) return;
    setTransfersLoading(true);
    setTransfersError(null);
    try {
      const qs = new URLSearchParams({ status: transferFilter });
      if (transferQuery.trim()) qs.set("q", transferQuery.trim());
      const res = await fetch(`/api/admin/transfers?${qs.toString()}`, {
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => null)) as {
        requests?: AdminTransferRow[];
        error?: string;
      } | null;
      if (!res.ok) {
        setTransfersError(json?.error ?? "No se pudieron cargar las transferencias.");
        return;
      }
      setTransfers(json?.requests ?? []);
    } catch (err) {
      void err;
      setTransfersError("Sin conexión al consultar transferencias.");
    } finally {
      setTransfersLoading(false);
    }
  }, [canFetchAdmin, transferFilter, transferQuery]);

  const loadMembers = useCallback(
    async (qOverride?: string) => {
      if (!canFetchAdmin) return;
      setMembersLoading(true);
      setMembersError(null);
      try {
        const q = (qOverride ?? memberQuery).trim();
        const res = await fetch(`/api/admin/members?q=${encodeURIComponent(q)}`, {
          credentials: "same-origin",
        });
        const json = (await res.json().catch(() => null)) as {
          members?: AdminMemberItem[];
          error?: string;
        } | null;
        if (!res.ok) {
          setMembersError(json?.error ?? "No se pudieron buscar los socios.");
          return;
        }
        setMembers(json?.members ?? []);
      } catch (err) {
        void err;
        setMembersError("Sin conexión al consultar socios.");
      } finally {
        setMembersLoading(false);
      }
    },
    [canFetchAdmin, memberQuery],
  );

  const loadCoupons = useCallback(async () => {
    if (!canFetchAdmin) return;
    setCouponsLoading(true);
    setCouponsError(null);
    try {
      const res = await fetch("/api/admin/coupons", { credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as {
        coupons?: AdminCouponItem[];
        error?: string;
      } | null;
      if (!res.ok) {
        setCouponsError(json?.error ?? "No se pudieron cargar los cupones.");
        return;
      }
      setCoupons(json?.coupons ?? []);
    } catch (err) {
      void err;
      setCouponsError("Sin conexión al consultar cupones.");
    } finally {
      setCouponsLoading(false);
    }
  }, [canFetchAdmin]);

  const loadPayouts = useCallback(async () => {
    if (!canFetchAdmin) return;
    setPayoutsLoading(true);
    setPayoutsError(null);
    try {
      const res = await fetch("/api/admin/tipster-payouts", { credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as {
        totalsByTipster?: AdminTipsterSummaryItem[];
        ledger?: AdminTipsterLedgerItem[];
        error?: string;
      } | null;
      if (!res.ok) {
        setPayoutsError(json?.error ?? "No se pudieron cargar las liquidaciones.");
        return;
      }
      setTipsterTotals(json?.totalsByTipster ?? []);
      setTipsterLedger(json?.ledger ?? []);
    } catch (err) {
      void err;
      setPayoutsError("Sin conexión al consultar liquidaciones.");
    } finally {
      setPayoutsLoading(false);
    }
  }, [canFetchAdmin]);

  const loadInbox = useCallback(async () => {
    if (!canFetchAdmin) return;
    setInboxLoading(true);
    setInboxError(null);
    try {
      const res = await fetch("/api/admin/inbox", { credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as {
        items?: AdminInboxRow[];
        error?: string;
      } | null;
      if (!res.ok) {
        setInboxError(json?.error ?? "No se pudo cargar la bandeja.");
        return;
      }
      setInboxItems(json?.items ?? []);
    } catch (err) {
      void err;
      setInboxError("Sin conexión al consultar la bandeja.");
    } finally {
      setInboxLoading(false);
    }
  }, [canFetchAdmin]);

  const loadAudit = useCallback(async () => {
    if (!canFetchAdmin) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const res = await fetch("/api/admin/audit", { credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as {
        entries?: AdminAuditRow[];
        error?: string;
      } | null;
      if (!res.ok) {
        setAuditError(json?.error ?? "No se pudo cargar la auditoría.");
        return;
      }
      setAuditEntries(json?.entries ?? []);
    } catch (err) {
      void err;
      setAuditError("Sin conexión al consultar la auditoría.");
    } finally {
      setAuditLoading(false);
    }
  }, [canFetchAdmin]);

  useEffect(() => {
    if (activeTab === "transfers") void loadTransfers();
    else if (activeTab === "members") void loadMembers();
    else if (activeTab === "coupons") void loadCoupons();
    else if (activeTab === "payouts") void loadPayouts();
    else if (activeTab === "inbox") void loadInbox();
    else if (activeTab === "audit") void loadAudit();
  }, [activeTab, loadAudit, loadCoupons, loadInbox, loadMembers, loadPayouts, loadTransfers]);

  const openRedemptionsModal = useCallback(
    async (coupon: AdminCouponItem) => {
      setDialog({ kind: "redemptions", coupon });
      setRedemptions([]);
      if (!canFetchAdmin) return;
      setRedemptionsLoading(true);
      try {
        const res = await fetch(`/api/admin/coupons/${coupon.id}/redemptions`, {
          credentials: "same-origin",
        });
        const json = (await res.json().catch(() => null)) as {
          redemptions?: AdminCouponRedemptionItem[];
        } | null;
        if (res.ok) setRedemptions(json?.redemptions ?? []);
      } catch (err) {
        void err;
      } finally {
        setRedemptionsLoading(false);
      }
    },
    [canFetchAdmin],
  );

  const handleConfirmApprove = async () => {
    if (dialog?.kind !== "approve") return;
    if (isPreviewMode) {
      const approved = approvePreviewTransfer(dialog.row.id, dialogNote.trim() || null);
      if (approved) {
        pushToast(
          `Pago ${approved.request.referenceCode} confirmado · Cupón ${approved.coupon.code} enviado desde noreply@pitchlab.mx.`,
          "success",
        );
      }
      setDialog(null);
      setDialogNote("");
      syncPreviewAdminData();
      return;
    }
    if (!canFetchAdmin) {
      pushToast(
        `Confirmación simulada (${dialog.row.referenceCode}) · Cupón enviado desde noreply@pitchlab.mx.`,
        "success",
      );
      setDialog(null);
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch(`/api/admin/transfers/${dialog.row.id}/approve`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adminNotes: dialogNote.trim() || null }),
      });
      const json = (await res.json().catch(() => null)) as {
        coupon?: { code: string; days: number; expiresAtIso: string | null };
        error?: string;
      } | null;
      if (!res.ok) {
        pushToast(json?.error ?? "No se pudo confirmar la transferencia.", "danger");
        return;
      }
      const couponText = json?.coupon?.code ? ` · Cupón ${json.coupon.code}` : "";
      pushToast(
        `Pago ${dialog.row.referenceCode} confirmado${couponText} enviado desde noreply@pitchlab.mx.`,
        "success",
      );
      setDialog(null);
      setDialogNote("");
      await loadTransfers();
      await loadCoupons();
    } catch (err) {
      void err;
      pushToast("Error de conexión al confirmar el pago.", "danger");
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dialog?.kind !== "reject") return;
    if (dialogReason.trim().length < 3) {
      pushToast("Escribe el motivo del rechazo (mínimo 3 caracteres).", "warning");
      return;
    }
    if (isPreviewMode) {
      rejectPreviewTransfer(dialog.row.id, dialogReason.trim(), dialogNote.trim() || null);
      pushToast(`Solicitud ${dialog.row.referenceCode} rechazada.`, "default");
      setDialog(null);
      setDialogReason("");
      setDialogNote("");
      syncPreviewAdminData();
      return;
    }
    if (!canFetchAdmin) {
      pushToast(`Rechazo simulado (${dialog.row.referenceCode}).`, "default");
      setDialog(null);
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch(`/api/admin/transfers/${dialog.row.id}/reject`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: dialogReason.trim(),
          adminNotes: dialogNote.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        pushToast(json?.error ?? "No se pudo rechazar la solicitud.", "danger");
        return;
      }
      pushToast(`Solicitud ${dialog.row.referenceCode} rechazada y socio notificado.`, "default");
      setDialog(null);
      setDialogReason("");
      setDialogNote("");
      await loadTransfers();
    } catch (err) {
      void err;
      pushToast("Error de conexión al rechazar.", "danger");
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dialog?.kind !== "grant") return;
    const daysNum = Number(grantDays);
    if (!Number.isInteger(daysNum) || daysNum < 1 || daysNum > 365) {
      pushToast("Indica entre 1 y 365 días.", "warning");
      return;
    }
    if (dialogReason.trim().length < 3) {
      pushToast("Escribe el motivo de la concesión.", "warning");
      return;
    }
    if (!canFetchAdmin) {
      pushToast(`Simulado: +${daysNum} días para ${dialog.member.email}.`, "success");
      setDialog(null);
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch("/api/admin/access/grant", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUserId: dialog.member.id,
          days: daysNum,
          reason: dialogReason.trim(),
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        pushToast(json?.error ?? "No se pudieron otorgar los días.", "danger");
        return;
      }
      pushToast(`+${daysNum} días otorgados a ${dialog.member.email}.`, "success");
      setDialog(null);
      setDialogReason("");
      await loadMembers();
    } catch (err) {
      void err;
      pushToast("Error de conexión al otorgar días.", "danger");
    } finally {
      setBusyAction(false);
    }
  };

  const handleConfirmRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dialog?.kind !== "revoke") return;
    if (dialogReason.trim().length < 3) {
      pushToast("Escribe el motivo de la revocación.", "warning");
      return;
    }
    if (!canFetchAdmin) {
      pushToast("Revocación simulada.", "default");
      setDialog(null);
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch("/api/admin/access/revoke", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grantId: dialog.grant.id,
          reason: dialogReason.trim(),
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        pushToast(json?.error ?? "No se pudo revocar la concesión.", "danger");
        return;
      }
      pushToast("Concesión revocada y vigencia recalculada.", "success");
      setDialog(null);
      setDialogReason("");
      await loadMembers();
    } catch (err) {
      void err;
      pushToast("Error de conexión al revocar.", "danger");
    } finally {
      setBusyAction(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const days = Number(newCouponDays);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      pushToast("Indica entre 1 y 365 días para el cupón.", "warning");
      return;
    }
    if (!canFetchAdmin) {
      pushToast("Cupón simulado en modo demostración.", "success");
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: newCouponCode.trim() || null,
          days,
          maxRedemptions: newCouponMaxUses.trim() ? Number(newCouponMaxUses) : null,
          expiresAtIso: newCouponExpires.trim() || null,
          note: newCouponNote.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        coupon?: AdminCouponItem;
        error?: string;
      } | null;
      if (!res.ok) {
        pushToast(json?.error ?? "No se pudo crear el cupón.", "danger");
        return;
      }
      pushToast(`Cupón ${json?.coupon?.code ?? ""} creado.`, "success");
      setNewCouponCode("");
      setNewCouponMaxUses("1");
      setNewCouponExpires("");
      setNewCouponNote("");
      await loadCoupons();
    } catch (err) {
      void err;
      pushToast("Error de conexión al crear el cupón.", "danger");
    } finally {
      setBusyAction(false);
    }
  };

  const handleGenerateBatchCoupons = async (e: React.FormEvent) => {
    e.preventDefault();
    const count = Number(batchCount);
    const days = Number(batchDays);
    if (!Number.isInteger(count) || count < 1 || count > 50) {
      pushToast("Indica entre 1 y 50 códigos por lote.", "warning");
      return;
    }
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      pushToast("Indica entre 1 y 365 días de acceso.", "warning");
      return;
    }
    if (!canFetchAdmin) {
      const sample: AdminCouponItem[] = Array.from({ length: Math.min(count, 5) }, (_, idx) => ({
        id: `demo-batch-${idx}`,
        code: `${batchPrefix.trim().toUpperCase() || "PL"}-DEMO${idx + 1}K9`,
        days,
        maxRedemptions: 1,
        redeemedCount: 0,
        expiresAtIso: batchExpires ? `${batchExpires}T23:59:59.000Z` : null,
        active: true,
        note: batchNote.trim() || "Lote vista previa",
        createdAtIso: new Date().toISOString(),
      }));
      setGeneratedBatch(sample);
      pushToast(`Vista previa: ${sample.length} códigos de 1 uso (+${days}d).`, "success");
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch("/api/admin/coupons/batch", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          count,
          days,
          prefix: batchPrefix.trim() || null,
          expiresAtIso: batchExpires.trim() || null,
          note: batchNote.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        coupons?: AdminCouponItem[];
        error?: string;
      } | null;
      if (!res.ok) {
        pushToast(json?.error ?? "No se pudo generar el lote de cupones.", "danger");
        return;
      }
      const created = json?.coupons ?? [];
      setGeneratedBatch(created);
      pushToast(`Se generaron ${created.length} cupones de 1 uso (+${days} días).`, "success");
      await loadCoupons();
    } catch (err) {
      void err;
      pushToast("Error de conexión al generar el lote.", "danger");
    } finally {
      setBusyAction(false);
    }
  };

  const handleCopyBatchCodes = async () => {
    if (generatedBatch.length === 0) return;
    const text = generatedBatch.map((c) => c.code).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      pushToast(`${generatedBatch.length} códigos copiados al portapapeles.`, "success");
    } catch (err) {
      void err;
      pushToast("No se pudo copiar automáticamente.", "warning");
    }
  };

  const handleDownloadBatchCsv = () => {
    if (generatedBatch.length === 0) return;
    const header = "codigo,dias,usos_maximos,expira,nota,enlace_canje";
    const origin = typeof window !== "undefined" ? window.location.origin : "https://pitchlab.mx";
    const rows = generatedBatch.map((c) =>
      [
        c.code,
        String(c.days),
        String(c.maxRedemptions ?? 1),
        c.expiresAtIso ?? "",
        c.note ?? "",
        `${origin}/canjear?code=${encodeURIComponent(c.code)}`,
      ]
        .map(sanitizeCsvCell)
        .join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pitchlab-cupones-${generatedBatch.length}x${batchDays}d.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleResolveInboxItem = async (itemId: string) => {
    if (!canFetchAdmin) {
      setInboxItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, resolved: true, resolvedAtIso: new Date().toISOString() } : it)),
      );
      pushToast("Marcado como atendido (vista previa).", "success");
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch("/api/admin/inbox", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      if (!res.ok) {
        pushToast("No se pudo actualizar el elemento.", "danger");
        return;
      }
      pushToast("Mensaje marcado como atendido.", "success");
      await loadInbox();
    } catch (err) {
      void err;
      pushToast("Error de conexión al actualizar la bandeja.", "danger");
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleCoupon = async (coupon: AdminCouponItem) => {
    if (!canFetchAdmin) {
      setCoupons((prev) =>
        prev.map((c) => (c.id === coupon.id ? { ...c, active: !c.active } : c)),
      );
      return;
    }
    try {
      const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !coupon.active }),
      });
      if (!res.ok) {
        pushToast("No se pudo cambiar el estado del cupón.", "danger");
        return;
      }
      await loadCoupons();
    } catch (err) {
      void err;
      pushToast("Error de conexión.", "danger");
    }
  };

  const handleConfirmMarkPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dialog?.kind !== "markPaid") return;
    if (payoutRef.trim().length < 3) {
      pushToast("Escribe la referencia SPEI de liquidación.", "warning");
      return;
    }
    if (!canFetchAdmin) {
      pushToast(`Pago manual simulado (${payoutRef.trim()}).`, "success");
      setDialog(null);
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch(`/api/admin/tipster-payouts/${dialog.row.id}/mark-paid`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reference: payoutRef.trim(),
          note: dialogNote.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        pushToast(json?.error ?? "No se pudo registrar el pago manual.", "danger");
        return;
      }
      pushToast("Comisión marcada como pagada y recibo enviado al tipster.", "success");
      setDialog(null);
      setPayoutRef("");
      setDialogNote("");
      await loadPayouts();
    } catch (err) {
      void err;
      pushToast("Error de conexión al liquidar.", "danger");
    } finally {
      setBusyAction(false);
    }
  };

  const copyCouponLink = async (code: string) => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://pitchlab.mx";
    const link = `${origin}/canjear?codigo=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(link);
      pushToast(`Enlace copiado: ${link}`, "success");
    } catch (err) {
      void err;
      pushToast(link, "default");
    }
  };

  const pendingTransfersCount = transfers.filter((t) => t.status === "pending_review").length;

  return (
    <section
      className="glass-card glass-ring rounded-2xl p-5 space-y-4"
      aria-labelledby="pl-admin-ops-h"
      data-admin-payments-section=""
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="pl-admin-ops-h" className="m-0 text-lg font-extrabold">
            Cobros SPEI, socios, cupones y liquidaciones
          </h2>
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            Confirma pagos SPEI para enviar cupones personales desde noreply@pitchlab.mx, ajusta vigencias con auditoría y liquida comisiones de tipsters.
          </p>
        </div>

        {pendingTransfersCount > 0 ? (
          <span className="pl-pill pl-pill--warning num">
            <MaestroIcon name="receipt" size={13} />
            <span>
              {pendingTransfersCount} {pendingTransfersCount === 1 ? "SPEI pendiente" : "SPEI pendientes"}
            </span>
          </span>
        ) : null}
      </div>

      <UnderlineTabs
        tabs={ADMIN_OPS_TABS}
        active={activeTab}
        onChange={setActiveTab}
        label="Operación comercial Beta 1.0"
        idPrefix={idPrefix}
      />

      {/* Tab 1: Transferencias SPEI */}
      <TabPanel idPrefix={idPrefix} tabKey="transfers" active={activeTab}>
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar transferencias">
              {(
                [
                  { key: "pending_review", label: "Pendientes" },
                  { key: "all", label: "Todas" },
                  { key: "approved", label: "Aprobadas" },
                  { key: "rejected", label: "Rechazadas" },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={transferFilter === f.key}
                  onClick={() => setTransferFilter(f.key)}
                  className={
                    transferFilter === f.key
                      ? "pl-btn-primary min-h-9 px-3 text-xs"
                      : "pl-btn-glass glass-ring min-h-9 px-3 text-xs"
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="search"
                value={transferQuery}
                onChange={(e) => setTransferQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void loadTransfers();
                }}
                placeholder="Referencia PL-..., correo o @usuario"
                aria-label="Buscar transferencias SPEI"
                className="glass-input min-h-[40px] px-3 text-xs flex-1 sm:w-64"
              />
              <button
                type="button"
                onClick={() => void loadTransfers()}
                className="pl-btn-glass glass-ring min-h-[40px] px-3 text-xs shrink-0"
              >
                <MaestroIcon name="search" size={14} />
                <span>Buscar</span>
              </button>
            </div>
          </div>

          {transfersLoading ? (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Cargando transferencias…
            </p>
          ) : transfersError ? (
            <p className="m-0 text-xs font-semibold" style={{ color: "var(--pl-danger)" }} role="alert">
              {transfersError}
            </p>
          ) : transfers.length === 0 ? (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              No hay solicitudes SPEI con ese filtro.
            </p>
          ) : (
            <div className="space-y-2.5">
              {transfers.map((row) => {
                const st = TRANSFER_STATUS_LABELS[row.status];
                return (
                  <div
                    key={row.id}
                    className="glass-ring rounded-xl p-3.5 space-y-2.5"
                    style={{ background: "var(--pl-surface)" }}
                    data-admin-transfer-row={row.referenceCode}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-0.5 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-sm font-extrabold num" style={{ color: "var(--pl-brand)" }}>
                            {row.referenceCode}
                          </strong>
                          <span className={`pl-pill ${st.pill}`}>{st.label}</span>
                          {row.amountMismatch ? (
                            <span className="pl-pill pl-pill--warning" data-amount-mismatch="">
                              Monto distinto reportado
                            </span>
                          ) : null}
                          {row.referralDiscountApplied ? (
                            <span className="pl-pill pl-pill--info">-30 % referido</span>
                          ) : null}
                        </div>
                        <div style={{ color: "var(--pl-text-secondary)" }}>
                          <strong>{row.userHandle ? `@${row.userHandle}` : row.userDisplayName ?? "Socio"}</strong>{" "}
                          · {row.userEmail} ·{" "}
                          <span className="num">
                            {row.planInterval === "annual" ? "Anual (365d)" : "Mensual (30d)"}
                          </span>
                        </div>
                      </div>

                      <div className="text-right num">
                        <strong className="block text-sm font-extrabold">
                          {formatMxn(row.amountCentavosMxn)}
                        </strong>
                        {row.reportedAmountCentavosMxn !== null ? (
                          <span
                            className="text-xs"
                            style={{
                              color: row.amountMismatch
                                ? "var(--pl-warning)"
                                : "var(--pl-text-muted)",
                            }}
                          >
                            Reportado: {formatMxn(row.reportedAmountCentavosMxn)}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div
                      className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs pt-1 hairline-t"
                      style={{ color: "var(--pl-text-muted)" }}
                    >
                      <span>Banco: {row.originBank ?? "Sin reportar"}</span>
                      <span className="num">Rastreo: {row.receiptReference ?? "Sin reportar"}</span>
                      <span>Titular: {row.payerName ?? "—"}</span>
                      <span className="num">
                        Fecha SPEI: {row.transferDate ?? formatDateMx(row.createdAtIso)}
                      </span>
                    </div>

                    {row.userNote ? (
                      <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
                        Nota del socio: “{row.userNote}”
                      </p>
                    ) : null}

                    {row.rejectionReason ? (
                      <p className="m-0 text-xs font-semibold" style={{ color: "var(--pl-danger)" }}>
                        Motivo de rechazo: {row.rejectionReason}
                      </p>
                    ) : null}

                    {row.status === "approved" && row.issuedCouponCode ? (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 pt-2 hairline-t text-xs"
                        data-admin-coupon-summary={row.referenceCode}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span style={{ color: "var(--pl-text-muted)" }}>Cupón emitido (1 uso):</span>
                          <strong
                            className="font-extrabold tracking-wider num"
                            style={{ color: "var(--pl-brand)" }}
                            data-admin-issued-coupon={row.issuedCouponCode}
                          >
                            {row.issuedCouponCode}
                          </strong>
                          <span
                            className={
                              row.couponRedeemedAtIso
                                ? "pl-pill pl-pill--success"
                                : "pl-pill pl-pill--info"
                            }
                          >
                            {row.couponRedeemedAtIso
                              ? `Canjeado el ${formatDateMx(row.couponRedeemedAtIso)}`
                              : `Pendiente de canje · vence ${formatDateMx(row.couponExpiresAtIso)}`}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void copyCouponLink(row.issuedCouponCode!)}
                          className="pl-btn-glass glass-ring min-h-9 px-3 text-xs"
                          data-admin-copy-issued={row.issuedCouponCode}
                        >
                          <MaestroIcon name="copy" size={13} />
                          <span>Copiar liga /canjear</span>
                        </button>
                      </div>
                    ) : null}

                    {row.status === "pending_review" ? (
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setDialogReason("");
                            setDialogNote("");
                            setDialog({ kind: "reject", row });
                          }}
                          className="pl-btn-glass glass-ring min-h-[40px] px-3.5 text-xs"
                          data-admin-reject={row.referenceCode}
                        >
                          <MaestroIcon name="x" size={14} />
                          <span>Rechazar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDialogNote("");
                            setDialog({ kind: "approve", row });
                          }}
                          className="pl-btn-primary min-h-[40px] px-4 text-xs"
                          data-admin-approve={row.referenceCode}
                        >
                          <MaestroIcon name="check" size={14} />
                          <span>Confirmar pago y enviar cupón</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </TabPanel>

      {/* Tab 2: Socios y acceso */}
      <TabPanel idPrefix={idPrefix} tabKey="members" active={activeTab}>
        <div className="space-y-3 pt-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void loadMembers();
            }}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              type="search"
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder="Buscar por correo o @usuario (ej. @lupita_mx)"
              aria-label="Buscar socios por correo o @usuario"
              className="glass-input min-h-[44px] px-3 text-sm flex-1 min-w-[220px]"
            />
            <button type="submit" className="pl-btn-primary min-h-[44px] px-4 text-xs">
              <MaestroIcon name="search" size={14} />
              <span>Buscar socios</span>
            </button>
          </form>

          {membersLoading ? (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Buscando socios…
            </p>
          ) : membersError ? (
            <p className="m-0 text-xs font-semibold" style={{ color: "var(--pl-danger)" }} role="alert">
              {membersError}
            </p>
          ) : members.length === 0 ? (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              No hay socios que coincidan con la búsqueda.
            </p>
          ) : (
            <div className="space-y-2.5">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="glass-ring rounded-xl p-3.5 space-y-2.5"
                  style={{ background: "var(--pl-surface)" }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm font-extrabold">
                          {m.handle ? `@${m.handle}` : m.displayName ?? "Sin @usuario"}
                        </strong>
                        <span className={m.accessUntilIso ? "pl-pill pl-pill--success" : "pl-pill pl-pill--warning"}>
                          {m.accessUntilIso
                            ? `Activo hasta ${formatDateMx(m.accessUntilIso)}`
                            : "Sin pase vigente"}
                        </span>
                      </div>
                      <span style={{ color: "var(--pl-text-muted)" }}>{m.email}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setGrantDays("15");
                        setDialogReason("");
                        setDialog({ kind: "grant", member: m });
                      }}
                      className="pl-btn-primary min-h-[40px] px-3.5 text-xs"
                    >
                      <MaestroIcon name="plus" size={14} />
                      <span>Dar días</span>
                    </button>
                  </div>

                  {m.grants.length > 0 ? (
                    <ul className="m-0 p-0 list-none space-y-1.5 pt-2 hairline-t text-xs">
                      {m.grants.slice(0, 5).map((g) => (
                        <li
                          key={g.id}
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <span style={{ color: g.revokedAtIso ? "var(--pl-text-muted)" : "var(--pl-text-secondary)" }}>
                            <strong>{SOURCE_LABELS[g.sourceKind] ?? g.sourceKind}</strong> ·{" "}
                            <span className="num">+{g.daysGranted}d</span> (vence{" "}
                            <span className="num">{formatDateMx(g.endsAtIso)}</span>)
                            {g.note ? ` · ${g.note}` : ""}
                            {g.revokedAtIso
                              ? ` · REVOCADA (${g.revokeReason ?? "sin motivo"})`
                              : ""}
                          </span>
                          {!g.revokedAtIso ? (
                            <button
                              type="button"
                              onClick={() => {
                                setDialogReason("");
                                setDialog({ kind: "revoke", member: m, grant: g });
                              }}
                              className="pl-btn-glass glass-ring min-h-8 px-2.5 text-xs"
                            >
                              Revocar
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </TabPanel>

      {/* Tab 3: Cupones */}
      <TabPanel idPrefix={idPrefix} tabKey="coupons" active={activeTab}>
        <div className="space-y-4 pt-2">
          <form
            onSubmit={handleCreateCoupon}
            noValidate
            className="glass-ring rounded-xl p-4 space-y-3"
            style={{ background: "var(--pl-surface)" }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm font-extrabold">Crear nuevo cupón de acceso</strong>
              <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Si dejas el código vacío, se genera sin 0/O ni 1/I.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
              <input
                type="text"
                maxLength={32}
                placeholder="Código (opcional, ej. NAVIDAD15)"
                aria-label="Código personalizado de cupón"
                value={newCouponCode}
                onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                className="glass-input min-h-[44px] px-3 text-sm uppercase font-extrabold num"
              />
              <input
                type="number"
                min={1}
                max={365}
                placeholder="Días (1-365)"
                aria-label="Días del cupón"
                value={newCouponDays}
                onChange={(e) => setNewCouponDays(e.target.value)}
                className="glass-input min-h-[44px] px-3 text-sm num"
              />
              <input
                type="number"
                min={1}
                placeholder="Cupo máx. (vacío = ∞)"
                aria-label="Cupo máximo de canjes"
                value={newCouponMaxUses}
                onChange={(e) => setNewCouponMaxUses(e.target.value)}
                className="glass-input min-h-[44px] px-3 text-sm num"
              />
              <input
                type="date"
                aria-label="Fecha límite del cupón"
                value={newCouponExpires}
                onChange={(e) => setNewCouponExpires(e.target.value)}
                className="glass-input min-h-[44px] px-3 text-sm num"
              />
              <input
                type="text"
                maxLength={200}
                placeholder="Nota interna"
                aria-label="Nota interna del cupón"
                value={newCouponNote}
                onChange={(e) => setNewCouponNote(e.target.value)}
                className="glass-input min-h-[44px] px-3 text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold" style={{ color: "var(--pl-text-muted)" }}>
                  Duración rápida:
                </span>
                {QUICK_COUPON_DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setNewCouponDays(String(d))}
                    className={`pl-pill text-xs num ${newCouponDays === String(d) ? "pl-pill--brand" : ""}`.trim()}
                  >
                    {d}d
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={busyAction}
                className="pl-btn-primary min-h-[44px] px-4 text-xs"
                data-admin-create-coupon=""
              >
                <MaestroIcon name="ticket" size={14} />
                <span>{busyAction ? "Creando…" : "Crear cupón"}</span>
              </button>
            </div>
          </form>

          {/* Generador en lote de códigos de un solo uso */}
          <form
            onSubmit={handleGenerateBatchCoupons}
            noValidate
            className="glass-ring rounded-xl p-4 space-y-3"
            style={{ background: "var(--pl-surface)" }}
            data-admin-coupon-batch=""
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong className="text-sm font-extrabold">Generar lote de códigos de un solo uso</strong>
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Crea hasta 50 códigos únicos (1 uso cada uno) eligiendo los días exactos de pase, con seguimiento de quién canjeó cada código.
                </p>
              </div>
              <span className="pl-pill pl-pill--brand text-xs">1 uso · auditable</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
              <input
                type="number"
                min={1}
                max={50}
                placeholder="Cantidad (1-50)"
                aria-label="Cantidad de códigos de un solo uso"
                value={batchCount}
                onChange={(e) => setBatchCount(e.target.value)}
                className="glass-input min-h-[44px] px-3 text-sm num"
              />
              <input
                type="number"
                min={1}
                max={365}
                placeholder="Días (1-365)"
                aria-label="Días de pase del lote"
                value={batchDays}
                onChange={(e) => setBatchDays(e.target.value)}
                className="glass-input min-h-[44px] px-3 text-sm num"
              />
              <input
                type="text"
                maxLength={10}
                placeholder="Prefijo (ej. VIP, PROMO)"
                aria-label="Prefijo opcional del lote"
                value={batchPrefix}
                onChange={(e) => setBatchPrefix(e.target.value.toUpperCase())}
                className="glass-input min-h-[44px] px-3 text-sm uppercase font-bold num"
              />
              <input
                type="date"
                aria-label="Fecha límite del lote"
                value={batchExpires}
                onChange={(e) => setBatchExpires(e.target.value)}
                className="glass-input min-h-[44px] px-3 text-sm num"
              />
              <input
                type="text"
                maxLength={200}
                placeholder="Campaña o nota interna"
                aria-label="Nota del lote de cupones"
                value={batchNote}
                onChange={(e) => setBatchNote(e.target.value)}
                className="glass-input min-h-[44px] px-3 text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {QUICK_COUPON_DAYS.map((d) => (
                  <button
                    key={`batch-${d}`}
                    type="button"
                    onClick={() => setBatchDays(String(d))}
                    className={`pl-pill text-xs num ${batchDays === String(d) ? "pl-pill--brand" : ""}`.trim()}
                  >
                    +{d}d
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={busyAction}
                className="pl-btn-primary min-h-[44px] px-4 text-xs"
                data-admin-generate-batch=""
              >
                <MaestroIcon name="layers" size={14} />
                <span>{busyAction ? "Generando…" : `Generar ${batchCount || 1} códigos`}</span>
              </button>
            </div>

            {generatedBatch.length > 0 ? (
              <div className="glass-ring rounded-xl p-3 space-y-2.5" style={{ background: "var(--pl-surface-elevated)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-xs font-extrabold num" style={{ color: "var(--pl-success)" }}>
                    {generatedBatch.length} códigos listos (+{generatedBatch[0]?.days ?? batchDays} días · 1 uso)
                  </strong>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleCopyBatchCodes()}
                      className="pl-btn-glass glass-ring min-h-9 px-3 text-xs"
                    >
                      <MaestroIcon name="copy" size={13} />
                      <span>Copiar lista</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadBatchCsv}
                      className="pl-btn-glass glass-ring min-h-9 px-3 text-xs"
                    >
                      <MaestroIcon name="download" size={13} />
                      <span>Exportar CSV</span>
                    </button>
                  </div>
                </div>
                <pre
                  className="m-0 max-h-40 overflow-y-auto rounded-lg p-2.5 text-xs font-mono num"
                  style={{ background: "var(--pl-bg-subtle)", color: "var(--pl-text)" }}
                >
                  {generatedBatch.map((c) => c.code).join("\n")}
                </pre>
              </div>
            ) : null}
          </form>

          {couponsLoading ? (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Cargando cupones…
            </p>
          ) : couponsError ? (
            <p className="m-0 text-xs font-semibold" style={{ color: "var(--pl-danger)" }} role="alert">
              {couponsError}
            </p>
          ) : coupons.length === 0 ? (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Aún no hay cupones creados.
            </p>
          ) : (
            <div className="pl-table-region" tabIndex={0} role="region" aria-label="Tabla de cupones de acceso">
              <table className="w-full text-left border-collapse text-xs num">
                <caption className="sr-only">Cupones de acceso temporal</caption>
                <thead>
                  <tr className="hairline-b" style={{ color: "var(--pl-text-muted)" }}>
                    <th scope="col" className="py-2 pr-3">Código</th>
                    <th scope="col" className="py-2 px-2">Días</th>
                    <th scope="col" className="py-2 px-2">Usos</th>
                    <th scope="col" className="py-2 px-2">Expira</th>
                    <th scope="col" className="py-2 px-2">Estado</th>
                    <th scope="col" className="py-2 pl-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((c) => (
                    <tr key={c.id} className="hairline-b row-hover">
                      <th scope="row" className="py-2.5 pr-3 font-extrabold" style={{ color: "var(--pl-brand)" }}>
                        <span>{c.code}</span>
                        {c.transferRequestId ? (
                          <span className="ml-2 pl-pill pl-pill--info">SPEI · 1 uso</span>
                        ) : null}
                      </th>
                      <td className="py-2.5 px-2">+{c.days}d</td>
                      <td className="py-2.5 px-2">
                        {c.redeemedCount} / {c.maxRedemptions ?? "∞"}
                      </td>
                      <td className="py-2.5 px-2">{formatDateMx(c.expiresAtIso)}</td>
                      <td className="py-2.5 px-2">
                        <span className={c.active ? "pl-pill pl-pill--success" : "pl-pill pl-pill--danger"}>
                          {c.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="py-2.5 pl-2">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => void copyCouponLink(c.code)}
                            className="pl-btn-glass glass-ring min-h-8 px-2.5 text-xs"
                          >
                            Copiar liga
                          </button>
                          <button
                            type="button"
                            onClick={() => void openRedemptionsModal(c)}
                            className="pl-btn-glass glass-ring min-h-8 px-2.5 text-xs"
                          >
                            Ver canjes ({c.redeemedCount})
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleToggleCoupon(c)}
                            className="pl-btn-glass glass-ring min-h-8 px-2.5 text-xs"
                          >
                            {c.active ? "Desactivar" : "Activar"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </TabPanel>

      {/* Tab 4: Liquidaciones manuales a tipsters */}
      <TabPanel idPrefix={idPrefix} tabKey="payouts" active={activeTab}>
        <div className="space-y-3 pt-2">
          {paymentMode === "transfer" ? (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
              Modo transferencia manual activo: las comisiones del 25 % sobre ventas netas (sin IVA) maduran a los 14 días y se liquidan por SPEI fuera de línea; registra aquí tu folio para emitir su recibo.
            </p>
          ) : null}

          {payoutsLoading ? (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Cargando libro de comisiones…
            </p>
          ) : payoutsError ? (
            <p className="m-0 text-xs font-semibold" style={{ color: "var(--pl-danger)" }} role="alert">
              {payoutsError}
            </p>
          ) : tipsterLedger.length === 0 ? (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Aún no hay comisiones generadas por pagos de referidos de tipsters.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 num">
                {tipsterTotals.map((t) => (
                  <div
                    key={t.tipsterUserId}
                    className="glass-ring rounded-xl p-3 space-y-1 text-xs"
                    style={{ background: "var(--pl-surface)" }}
                  >
                    <strong className="block text-sm font-extrabold">
                      {t.displayName} (@{t.handle})
                    </strong>
                    <div className="flex justify-between">
                      <span style={{ color: "var(--pl-text-muted)" }}>En espera (14d):</span>
                      <span>{formatMxn(t.pendingClearanceCentavos)}</span>
                    </div>
                    <div className="flex justify-between font-bold" style={{ color: "var(--pl-brand)" }}>
                      <span>Listo por pagar:</span>
                      <span>{formatMxn(t.payableCentavos)}</span>
                    </div>
                    <div className="flex justify-between" style={{ color: "var(--pl-success)" }}>
                      <span>Liquidado:</span>
                      <span>{formatMxn(t.paidOutCentavos)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pl-table-region" tabIndex={0} role="region" aria-label="Comisiones de tipsters">
                <table className="w-full text-left border-collapse text-xs num">
                  <caption className="sr-only">Detalle de comisiones de tipsters</caption>
                  <thead>
                    <tr className="hairline-b" style={{ color: "var(--pl-text-muted)" }}>
                      <th scope="col" className="py-2 pr-3">Tipster</th>
                      <th scope="col" className="py-2 px-2">Origen</th>
                      <th scope="col" className="py-2 px-2">Comisión</th>
                      <th scope="col" className="py-2 px-2">Libera</th>
                      <th scope="col" className="py-2 px-2">Estado</th>
                      <th scope="col" className="py-2 pl-2 text-right">Liquidación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tipsterLedger.map((r) => (
                      <tr key={r.id} className="hairline-b row-hover">
                        <th scope="row" className="py-2 pr-3 font-bold">
                          @{r.tipsterHandle}
                        </th>
                        <td className="py-2 px-2">{r.stripeInvoiceId}</td>
                        <td className="py-2 px-2 font-extrabold">{formatMxn(r.commissionCentavosMxn)}</td>
                        <td className="py-2 px-2">{formatDateMx(r.clearsAtIso)}</td>
                        <td className="py-2 px-2">
                          <span
                            className={
                              r.status === "paid_out"
                                ? "pl-pill pl-pill--success"
                                : r.status === "payable"
                                  ? "pl-pill pl-pill--brand"
                                  : "pl-pill pl-pill--warning"
                            }
                          >
                            {r.status === "paid_out"
                              ? "Pagada"
                              : r.status === "payable"
                                ? "Lista para pagar"
                                : "En ventana 14d"}
                          </span>
                        </td>
                        <td className="py-2 pl-2 text-right">
                          {r.status === "paid_out" ? (
                            <span style={{ color: "var(--pl-text-muted)" }}>
                              {r.payoutNote ?? formatDateMx(r.paidOutAtIso)}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setPayoutRef("");
                                setDialogNote("");
                                setDialog({ kind: "markPaid", row: r });
                              }}
                              className="pl-btn-primary min-h-8 px-3 text-xs"
                            >
                              Marcar pagado
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </TabPanel>

      {/* Tab 5: Bandeja (Feedback, Soporte y Bajas) */}
      <TabPanel idPrefix={idPrefix} tabKey="inbox" active={activeTab}>
        <div className="space-y-3 pt-2" data-admin-inbox-panel="">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar bandeja">
              {(
                [
                  ["pending", "Pendientes"],
                  ["all", "Todos"],
                  ["feedback", "Feedback"],
                  ["support", "Soporte"],
                  ["deletion", "Bajas"],
                ] as const
              ).map(([key, lbl]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setInboxFilter(key)}
                  className={`pl-pill text-xs ${inboxFilter === key ? "pl-pill--brand" : ""}`.trim()}
                >
                  {lbl}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void loadInbox()}
              className="pl-btn-glass glass-ring min-h-9 px-3 text-xs"
            >
              Actualizar
            </button>
          </div>

          {inboxLoading ? (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Cargando bandeja…
            </p>
          ) : inboxError ? (
            <p className="m-0 text-xs font-semibold" style={{ color: "var(--pl-danger)" }} role="alert">
              {inboxError}
            </p>
          ) : (() => {
            const visible = inboxItems.filter((it) => {
              if (inboxFilter === "pending") return !it.resolved;
              if (inboxFilter === "all") return true;
              return it.kind === inboxFilter;
            });
            if (visible.length === 0) {
              return (
                <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                  Sin mensajes en esta vista. Los envíos desde Preferencias → Feedback, Soporte y Eliminar cuenta aparecen aquí.
                </p>
              );
            }
            return (
              <div className="space-y-2.5">
                {visible.map((item) => {
                  const meta = INBOX_KIND_META[item.kind];
                  return (
                    <article
                      key={item.id}
                      className="glass-ring rounded-xl p-3.5 space-y-2"
                      style={{ background: "var(--pl-surface)" }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`pl-pill text-[11px] ${meta.pill}`}>{meta.label}</span>
                            {item.category ? <span className="pl-pill text-[11px]">{item.category}</span> : null}
                            {item.resolved ? (
                              <span className="pl-pill pl-pill--success text-[11px]">Atendido</span>
                            ) : (
                              <span className="pl-pill pl-pill--warning text-[11px]">Pendiente</span>
                            )}
                          </div>
                          <strong className="block text-sm font-bold">
                            {item.subject || (item.kind === "deletion" ? "Solicitud formal de eliminación de cuenta" : "Mensaje de socio")}
                          </strong>
                          <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                            {item.handle ? `@${item.handle} · ` : ""}
                            {item.actorEmail} · {formatDateMx(item.createdAtIso)}
                          </span>
                        </div>
                        {!item.resolved ? (
                          <button
                            type="button"
                            disabled={busyAction}
                            onClick={() => void handleResolveInboxItem(item.id)}
                            className="pl-btn-primary min-h-9 px-3 text-xs shrink-0"
                          >
                            Marcar atendido
                          </button>
                        ) : null}
                      </div>
                      <p className="m-0 text-xs leading-relaxed whitespace-pre-wrap" style={{ color: "var(--pl-text-secondary)" }}>
                        {item.message}
                      </p>
                    </article>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </TabPanel>

      {/* Tab 6: Auditoría de seguridad */}
      <TabPanel idPrefix={idPrefix} tabKey="audit" active={activeTab}>
        <div className="space-y-3 pt-2" data-admin-audit-panel="">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Bitácora inmutable de accesos administrativos, emisión de cupones, concesiones, moderación y solicitudes de privacidad.
            </p>
            <button
              type="button"
              onClick={() => void loadAudit()}
              className="pl-btn-glass glass-ring min-h-9 px-3 text-xs"
            >
              Actualizar
            </button>
          </div>

          {auditLoading ? (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Cargando auditoría…
            </p>
          ) : auditError ? (
            <p className="m-0 text-xs font-semibold" style={{ color: "var(--pl-danger)" }} role="alert">
              {auditError}
            </p>
          ) : auditEntries.length === 0 ? (
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Sin registros recientes en la auditoría.
            </p>
          ) : (
            <div className="pl-table-region" tabIndex={0} role="region" aria-label="Registro de auditoría administrativa">
              <table className="w-full text-left border-collapse text-xs num">
                <caption className="sr-only">Auditoría de seguridad y operación</caption>
                <thead>
                  <tr className="hairline-b" style={{ color: "var(--pl-text-muted)" }}>
                    <th scope="col" className="py-2 pr-3">Acción</th>
                    <th scope="col" className="py-2 px-2">Actor</th>
                    <th scope="col" className="py-2 px-2">Objetivo</th>
                    <th scope="col" className="py-2 pl-2 text-right">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEntries.map((entry) => (
                    <tr key={entry.id} className="hairline-b row-hover">
                      <th scope="row" className="py-2.5 pr-3 font-bold">
                        <span className="pl-pill text-[11px]">{entry.action}</span>
                      </th>
                      <td className="py-2.5 px-2">{entry.actorEmail}</td>
                      <td className="py-2.5 px-2 font-mono text-[11px]" style={{ color: "var(--pl-text-muted)" }}>
                        {entry.targetKey.slice(0, 36)}
                      </td>
                      <td className="py-2.5 pl-2 text-right">{formatDateMx(entry.createdAtIso)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </TabPanel>

      {/* Modales nativos de confirmación */}
      <TopLayerModalDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        ariaLabelledBy={dialogTitleId}
        maxWidth="30rem"
      >
        {dialog?.kind === "approve" ? (
          <div className="p-5 space-y-3">
            <h3 id={dialogTitleId} className="m-0 text-base font-extrabold">
              Confirmar pago {dialog.row.referenceCode} y enviar cupón
            </h3>
            <p className="m-0 text-xs leading-relaxed" style={{ color: "var(--pl-text-secondary)" }}>
              Se generará un cupón personal de <strong>un solo uso</strong> con vigencia de <strong>30 días</strong> por{" "}
              <strong>{dialog.row.planInterval === "annual" ? "365 días (anual)" : "30 días (mensual)"}</strong> ({formatMxn(dialog.row.amountCentavosMxn)}) y se enviará a{" "}
              <strong>{dialog.row.userEmail}</strong> desde <strong className="num">noreply@pitchlab.mx</strong> para que lo canjee en <strong className="num">/canjear</strong>.
            </p>
            <input
              type="text"
              maxLength={240}
              placeholder="Nota interna opcional (ej. Banco Santander folio 9812)"
              value={dialogNote}
              onChange={(e) => setDialogNote(e.target.value)}
              className="glass-input w-full min-h-[44px] px-3 text-sm"
            />
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="pl-btn-glass glass-ring min-h-[44px] px-4 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busyAction}
                onClick={() => void handleConfirmApprove()}
                className="pl-btn-primary min-h-[44px] px-4 text-xs"
                data-admin-confirm-approve=""
              >
                {busyAction ? "Confirmando…" : "Confirmar y enviar cupón"}
              </button>
            </div>
          </div>
        ) : null}

        {dialog?.kind === "reject" ? (
          <form onSubmit={handleConfirmReject} className="p-5 space-y-3">
            <h3 id={dialogTitleId} className="m-0 text-base font-extrabold">
              Rechazar transferencia {dialog.row.referenceCode}
            </h3>
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
              El socio recibirá un correo con este motivo para poder corregir o intentar de nuevo.
            </p>
            <input
              type="text"
              required
              minLength={3}
              maxLength={280}
              autoFocus
              placeholder="Motivo visible al socio (ej. Monto incompleto o no localizado)"
              value={dialogReason}
              onChange={(e) => setDialogReason(e.target.value)}
              className="glass-input w-full min-h-[44px] px-3 text-sm"
            />
            <input
              type="text"
              maxLength={240}
              placeholder="Nota interna opcional"
              value={dialogNote}
              onChange={(e) => setDialogNote(e.target.value)}
              className="glass-input w-full min-h-[44px] px-3 text-sm"
            />
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="pl-btn-glass glass-ring min-h-[44px] px-4 text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="pl-btn-primary min-h-[44px] px-4 text-xs"
              >
                {busyAction ? "Rechazando…" : "Rechazar solicitud"}
              </button>
            </div>
          </form>
        ) : null}

        {dialog?.kind === "grant" ? (
          <form onSubmit={handleConfirmGrant} className="p-5 space-y-3">
            <h3 id={dialogTitleId} className="m-0 text-base font-extrabold">
              Dar días a {dialog.member.handle ? `@${dialog.member.handle}` : dialog.member.email}
            </h3>
            <label className="block space-y-1 text-xs">
              <span style={{ color: "var(--pl-text-secondary)" }}>Días (1 a 365)</span>
              <input
                type="number"
                min={1}
                max={365}
                required
                value={grantDays}
                onChange={(e) => setGrantDays(e.target.value)}
                className="glass-input w-full min-h-[44px] px-3 text-sm num"
              />
            </label>
            <label className="block space-y-1 text-xs">
              <span style={{ color: "var(--pl-text-secondary)" }}>Motivo (obligatorio, queda en auditoría)</span>
              <input
                type="text"
                required
                minLength={3}
                maxLength={280}
                placeholder="Ej. Compensación soporte o cortesía Beta 1.0"
                value={dialogReason}
                onChange={(e) => setDialogReason(e.target.value)}
                className="glass-input w-full min-h-[44px] px-3 text-sm"
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="pl-btn-glass glass-ring min-h-[44px] px-4 text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="pl-btn-primary min-h-[44px] px-4 text-xs"
              >
                {busyAction ? "Guardando…" : "Otorgar días"}
              </button>
            </div>
          </form>
        ) : null}

        {dialog?.kind === "revoke" ? (
          <form onSubmit={handleConfirmRevoke} className="p-5 space-y-3">
            <h3 id={dialogTitleId} className="m-0 text-base font-extrabold">
              Revocar concesión (+{dialog.grant.daysGranted} días)
            </h3>
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
              Se retirarán los días de esta concesión ({SOURCE_LABELS[dialog.grant.sourceKind] ?? dialog.grant.sourceKind}) y se recalcularán las fechas de acceso de {dialog.member.email}.
            </p>
            <input
              type="text"
              required
              minLength={3}
              maxLength={280}
              autoFocus
              placeholder="Motivo de revocación"
              value={dialogReason}
              onChange={(e) => setDialogReason(e.target.value)}
              className="glass-input w-full min-h-[44px] px-3 text-sm"
            />
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="pl-btn-glass glass-ring min-h-[44px] px-4 text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="pl-btn-primary min-h-[44px] px-4 text-xs"
              >
                {busyAction ? "Revocando…" : "Revocar concesión"}
              </button>
            </div>
          </form>
        ) : null}

        {dialog?.kind === "redemptions" ? (
          <div className="p-5 space-y-3">
            <h3 id={dialogTitleId} className="m-0 text-base font-extrabold">
              Canjes del cupón {dialog.coupon.code}
            </h3>
            {redemptionsLoading ? (
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Cargando historial…
              </p>
            ) : redemptions.length === 0 ? (
              <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Ningún socio ha canjeado este código todavía.
              </p>
            ) : (
              <ul className="m-0 p-0 list-none space-y-1.5 text-xs max-h-64 overflow-y-auto">
                {redemptions.map((item) => (
                  <li key={item.id} className="flex justify-between gap-2 hairline-b py-1.5">
                    <span>
                      <strong>{item.handle ? `@${item.handle}` : item.displayName ?? "Socio"}</strong> ·{" "}
                      {item.email}
                    </span>
                    <span className="num" style={{ color: "var(--pl-text-muted)" }}>
                      {formatDateMx(item.createdAtIso)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="pl-btn-glass glass-ring min-h-[44px] px-4 text-xs"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : null}

        {dialog?.kind === "markPaid" ? (
          <form onSubmit={handleConfirmMarkPaid} className="p-5 space-y-3">
            <h3 id={dialogTitleId} className="m-0 text-base font-extrabold">
              Liquidar comisión a @{dialog.row.tipsterHandle}
            </h3>
            <p className="m-0 text-xs num" style={{ color: "var(--pl-text-secondary)" }}>
              Monto neto de comisión: <strong>{formatMxn(dialog.row.commissionCentavosMxn)}</strong>. Al confirmar se enviará el comprobante al correo del tipster.
            </p>
            <input
              type="text"
              required
              minLength={3}
              maxLength={80}
              autoFocus
              placeholder="Referencia o clave de rastreo SPEI"
              value={payoutRef}
              onChange={(e) => setPayoutRef(e.target.value)}
              className="glass-input w-full min-h-[44px] px-3 text-sm num"
            />
            <input
              type="text"
              maxLength={200}
              placeholder="Nota opcional"
              value={dialogNote}
              onChange={(e) => setDialogNote(e.target.value)}
              className="glass-input w-full min-h-[44px] px-3 text-sm"
            />
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="pl-btn-glass glass-ring min-h-[44px] px-4 text-xs"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={busyAction}
                className="pl-btn-primary min-h-[44px] px-4 text-xs"
              >
                {busyAction ? "Guardando…" : "Confirmar pago"}
              </button>
            </div>
          </form>
        ) : null}
      </TopLayerModalDialog>
    </section>
  );
}
