"use client";

import React, { useCallback, useId, useMemo, useState } from "react";
import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  Button,
  SofascoreCard,
  SofascoreEmptyState,
  SofascoreFilterBar,
  SofascoreTable,
  SofascoreTabs,
  type SofascoreTabItem,
  type SofascoreTableColumn,
} from "../../components/ui/primitives";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { ConfirmActionDialog, TopLayerModalDialog } from "../components/PlatformOverlays";
import { useAbortableJson, useSafeEffect } from "../hooks";
import { usePlatformActions, usePlatformCore } from "../platform-provider";
import {
  approvePreviewTransfer,
  PREVIEW_SPEI_EVENT,
  readPreviewSpeiState,
  rejectPreviewTransfer,
} from "../preview-spei-store";
import { sanitizeCsvCell } from "./account/account-helpers";

export type AdminOpsTabKey = "transfers" | "members" | "coupons" | "payouts" | "inbox" | "audit";

const ALL_ADMIN_OPS_TABS: readonly { key: AdminOpsTabKey; label: string }[] = [
  { key: "transfers", label: "Transferencias SPEI" },
  { key: "members", label: "Socios y acceso" },
  { key: "coupons", label: "Cupones" },
  { key: "payouts", label: "Liquidaciones tipsters" },
  { key: "inbox", label: "Bandeja y soporte" },
  { key: "audit", label: "Auditoría" },
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

const INBOX_KIND_META: Record<
  AdminInboxRow["kind"],
  { label: string; tone: "brand" | "warning" | "danger" }
> = {
  feedback: { label: "Feedback", tone: "brand" },
  support: { label: "Soporte", tone: "warning" },
  deletion: { label: "Solicitud de baja", tone: "danger" },
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
  inbox?: AdminInboxRow[];
  audit?: AdminAuditRow[];
}

interface TransfersApiResponse {
  requests?: AdminTransferRow[];
}

interface MembersApiResponse {
  members?: AdminMemberItem[];
}

interface CouponsApiResponse {
  coupons?: AdminCouponItem[];
}

interface PayoutsApiResponse {
  totalsByTipster?: AdminTipsterSummaryItem[];
  ledger?: AdminTipsterLedgerItem[];
}

interface InboxApiResponse {
  items?: AdminInboxRow[];
}

interface AuditApiResponse {
  entries?: AdminAuditRow[];
}

type TransferFilterKey = "pending_review" | "all" | "approved" | "rejected";
type InboxFilterKey = "pending" | "all" | "feedback" | "support" | "deletion";

const TRANSFER_FILTER_TABS: readonly SofascoreTabItem[] = [
  { id: "pending_review", label: "Pendientes" },
  { id: "all", label: "Todas" },
  { id: "approved", label: "Aprobadas" },
  { id: "rejected", label: "Rechazadas" },
];

const INBOX_FILTER_TABS: readonly SofascoreTabItem[] = [
  { id: "pending", label: "Pendientes" },
  { id: "all", label: "Todos" },
  { id: "feedback", label: "Feedback" },
  { id: "support", label: "Soporte" },
  { id: "deletion", label: "Bajas" },
];

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
  transfer_monthly: "Transferencia SPEI",
  coupon: "Cupón",
  coupon_gift: "Cupón",
  referral_bonus: "Referido (+7d)",
  ambassador_bonus: "Embajador (+30d)",
  admin_grant: "Cortesía manual",
  tipster_free: "Tipster oficial",
  subscription: "Suscripción Stripe",
};

const TRANSFER_STATUS_LABELS: Record<
  AdminTransferRow["status"],
  { label: string; tone: "warning" | "success" | "danger" | "info" }
> = {
  pending_review: { label: "Pendiente", tone: "warning" },
  approved: { label: "Aprobada", tone: "success" },
  rejected: { label: "Rechazada", tone: "danger" },
  canceled: { label: "Cancelada", tone: "info" },
};

type FormDialogState =
  | { kind: "rejectForm"; row: AdminTransferRow }
  | { kind: "grantForm"; member: AdminMemberItem }
  | { kind: "revokeForm"; member: AdminMemberItem; grant: AdminMemberGrantItem }
  | { kind: "redemptions"; coupon: AdminCouponItem }
  | { kind: "markPaidForm"; row: AdminTipsterLedgerItem }
  | null;

type ConfirmActionState =
  | { kind: "approve"; row: AdminTransferRow; adminNotes: string | null }
  | { kind: "reject"; row: AdminTransferRow; reason: string; adminNotes: string | null }
  | { kind: "revoke"; member: AdminMemberItem; grant: AdminMemberGrantItem; reason: string }
  | { kind: "deactivateCoupon"; coupon: AdminCouponItem }
  | { kind: "markPaid"; row: AdminTipsterLedgerItem; reference: string; note: string | null }
  | null;

function isAdminOpsTabKey(value: string): value is AdminOpsTabKey {
  return (
    value === "transfers" ||
    value === "members" ||
    value === "coupons" ||
    value === "payouts" ||
    value === "inbox" ||
    value === "audit"
  );
}

function isTransferFilterKey(value: string): value is TransferFilterKey {
  return (
    value === "pending_review" ||
    value === "all" ||
    value === "approved" ||
    value === "rejected"
  );
}

function isInboxFilterKey(value: string): value is InboxFilterKey {
  return (
    value === "pending" ||
    value === "all" ||
    value === "feedback" ||
    value === "support" ||
    value === "deletion"
  );
}

export function AdminPaymentsCouponsSection({
  storyOverride,
  allowedTabs,
  embedded = false,
}: {
  storyOverride?: AdminPaymentsStoryOverride;
  allowedTabs?: readonly AdminOpsTabKey[];
  embedded?: boolean;
} = {}): React.JSX.Element {
  const { accountsEnabled: ctxAccountsEnabled, hasAccountSessionAuth, paymentMode } =
    usePlatformCore();
  const { pushToast } = usePlatformActions();
  const accountsEnabled = storyOverride?.accountsEnabled ?? ctxAccountsEnabled;
  const isStoryMock = Boolean(storyOverride);
  const canFetchAdmin = Boolean(
    !isStoryMock &&
      (storyOverride?.accountsEnabled !== undefined
        ? storyOverride.accountsEnabled
        : hasAccountSessionAuth),
  );
  const isPreviewMode = !canFetchAdmin && !isStoryMock && !accountsEnabled;

  const visibleTabs = useMemo(() => {
    if (!allowedTabs || allowedTabs.length === 0) return ALL_ADMIN_OPS_TABS;
    const allowedSet = new Set<AdminOpsTabKey>(allowedTabs);
    const filtered = ALL_ADMIN_OPS_TABS.filter((tab) => allowedSet.has(tab.key));
    return filtered.length > 0 ? filtered : ALL_ADMIN_OPS_TABS;
  }, [allowedTabs]);

  const initialActiveTab = useMemo<AdminOpsTabKey>(() => {
    const requested = storyOverride?.initialTab;
    if (requested && visibleTabs.some((t) => t.key === requested)) {
      return requested;
    }
    return visibleTabs[0]?.key ?? "transfers";
  }, [storyOverride?.initialTab, visibleTabs]);

  const [selectedTab, setSelectedTab] = useState<AdminOpsTabKey>(initialActiveTab);
  const activeTab: AdminOpsTabKey = visibleTabs.some((t) => t.key === selectedTab)
    ? selectedTab
    : (visibleTabs[0]?.key ?? "transfers");

  const dialogTitleId = useId();
  const sectionTitleId = useId();

  const [transferFilter, setTransferFilter] = useState<TransferFilterKey>("pending_review");
  const [transferQuery, setTransferQuery] = useState<string>("");
  const [submittedTransferQuery, setSubmittedTransferQuery] = useState<string>("");
  const [transferNotesById, setTransferNotesById] = useState<Record<string, string>>({});

  const [memberQuery, setMemberQuery] = useState<string>("");
  const [submittedMemberQuery, setSubmittedMemberQuery] = useState<string>("");

  const [newCouponCode, setNewCouponCode] = useState<string>("");
  const [newCouponDays, setNewCouponDays] = useState<string>("30");
  const [newCouponMaxUses, setNewCouponMaxUses] = useState<string>("1");
  const [newCouponExpires, setNewCouponExpires] = useState<string>("");
  const [newCouponNote, setNewCouponNote] = useState<string>("");

  const [batchCount, setBatchCount] = useState<string>("10");
  const [batchDays, setBatchDays] = useState<string>("30");
  const [batchPrefix, setBatchPrefix] = useState<string>("");
  const [batchExpires, setBatchExpires] = useState<string>("");
  const [batchNote, setBatchNote] = useState<string>("");
  const [generatedBatch, setGeneratedBatch] = useState<AdminCouponItem[]>([]);

  const [redemptions, setRedemptions] = useState<AdminCouponRedemptionItem[]>([]);
  const [redemptionsLoading, setRedemptionsLoading] = useState<boolean>(false);

  const [inboxFilter, setInboxFilter] = useState<InboxFilterKey>("pending");
  const [localStoryCoupons, setLocalStoryCoupons] = useState<AdminCouponItem[] | null>(
    storyOverride?.coupons ?? null,
  );
  const [localStoryInbox, setLocalStoryInbox] = useState<AdminInboxRow[] | null>(
    storyOverride?.inbox ?? null,
  );

  const [previewTick, setPreviewTick] = useState<number>(0);

  const [formDialog, setFormDialog] = useState<FormDialogState>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState>(null);
  const [busyAction, setBusyAction] = useState<boolean>(false);
  const [dialogNote, setDialogNote] = useState<string>("");
  const [dialogReason, setDialogReason] = useState<string>("");
  const [grantDays, setGrantDays] = useState<string>("15");
  const [payoutRef, setPayoutRef] = useState<string>("");

  useSafeEffect(() => {
    if (!isPreviewMode || typeof window === "undefined") return;
    const handleSync = () => setPreviewTick((tick) => tick + 1);
    window.addEventListener(PREVIEW_SPEI_EVENT, handleSync);
    return () => window.removeEventListener(PREVIEW_SPEI_EVENT, handleSync);
  }, [isPreviewMode]);

  const previewData = useMemo(() => {
    void previewTick;
    if (!isPreviewMode) {
      return { transfers: [] as AdminTransferRow[], coupons: [] as AdminCouponItem[] };
    }
    const st = readPreviewSpeiState();
    const q = submittedTransferQuery.trim().toLowerCase();
    const mappedTransfers: AdminTransferRow[] = st.requests
      .filter((r) => (transferFilter === "all" ? true : r.status === transferFilter))
      .filter((r) => {
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

    const mappedCoupons: AdminCouponItem[] = st.coupons.map((c) => ({
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
    }));

    return { transfers: mappedTransfers, coupons: mappedCoupons };
  }, [isPreviewMode, previewTick, submittedTransferQuery, transferFilter]);

  const transfersUrl = useMemo(() => {
    const qs = new URLSearchParams({ status: transferFilter, limit: "40" });
    if (submittedTransferQuery.trim()) qs.set("q", submittedTransferQuery.trim());
    return `/api/admin/transfers?${qs.toString()}`;
  }, [submittedTransferQuery, transferFilter]);

  const membersUrl = useMemo(
    () => `/api/admin/members?q=${encodeURIComponent(submittedMemberQuery.trim())}&limit=40`,
    [submittedMemberQuery],
  );

  const transfersReq = useAbortableJson<TransfersApiResponse>(transfersUrl, {
    enabled: canFetchAdmin && activeTab === "transfers",
  });
  const membersReq = useAbortableJson<MembersApiResponse>(membersUrl, {
    enabled: canFetchAdmin && activeTab === "members",
  });
  const couponsReq = useAbortableJson<CouponsApiResponse>("/api/admin/coupons?limit=40", {
    enabled: canFetchAdmin && activeTab === "coupons",
  });
  const payoutsReq = useAbortableJson<PayoutsApiResponse>("/api/admin/tipster-payouts?limit=40", {
    enabled: canFetchAdmin && activeTab === "payouts",
  });
  const inboxReq = useAbortableJson<InboxApiResponse>("/api/admin/inbox?limit=40", {
    enabled: canFetchAdmin && activeTab === "inbox",
  });
  const auditReq = useAbortableJson<AuditApiResponse>("/api/admin/audit?limit=40", {
    enabled: canFetchAdmin && activeTab === "audit",
  });

  const transfers = useMemo(() => {
    if (storyOverride?.transfers) {
      const q = submittedTransferQuery.trim().toLowerCase();
      return storyOverride.transfers.filter((r) => {
        if (transferFilter !== "all" && r.status !== transferFilter) return false;
        if (!q) return true;
        return (
          r.referenceCode.toLowerCase().includes(q) ||
          r.userEmail.toLowerCase().includes(q) ||
          (r.userHandle ?? "").toLowerCase().includes(q)
        );
      });
    }
    if (isPreviewMode) return previewData.transfers;
    return transfersReq.data?.requests ?? [];
  }, [
    isPreviewMode,
    previewData.transfers,
    storyOverride?.transfers,
    submittedTransferQuery,
    transferFilter,
    transfersReq.data?.requests,
  ]);

  const members = useMemo(() => {
    if (storyOverride?.members) {
      const q = submittedMemberQuery.trim().toLowerCase();
      if (!q) return storyOverride.members;
      return storyOverride.members.filter(
        (m) =>
          m.email.toLowerCase().includes(q) ||
          (m.handle ?? "").toLowerCase().includes(q) ||
          (m.displayName ?? "").toLowerCase().includes(q),
      );
    }
    return membersReq.data?.members ?? [];
  }, [membersReq.data?.members, storyOverride?.members, submittedMemberQuery]);

  const coupons = useMemo(() => {
    if (localStoryCoupons) return localStoryCoupons;
    if (isPreviewMode) return previewData.coupons;
    return couponsReq.data?.coupons ?? [];
  }, [couponsReq.data?.coupons, isPreviewMode, localStoryCoupons, previewData.coupons]);

  const tipsterTotals =
    storyOverride?.payouts?.totalsByTipster ?? payoutsReq.data?.totalsByTipster ?? [];
  const tipsterLedger =
    storyOverride?.payouts?.ledger ?? payoutsReq.data?.ledger ?? [];
  const inboxItems = localStoryInbox ?? inboxReq.data?.items ?? [];
  const auditEntries = storyOverride?.audit ?? auditReq.data?.entries ?? [];

  const openRedemptionsModal = useCallback(
    async (coupon: AdminCouponItem) => {
      setFormDialog({ kind: "redemptions", coupon });
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

  const executeApproveTransfer = async (row: AdminTransferRow, adminNotes: string | null) => {
    if (isPreviewMode) {
      const approved = approvePreviewTransfer(row.id, adminNotes);
      if (approved) {
        pushToast(
          `Pago ${approved.request.referenceCode} confirmado · Cupón ${approved.coupon.code} enviado desde noreply@pitchlab.mx.`,
          "success",
        );
      }
      setPreviewTick((tick) => tick + 1);
      return;
    }
    if (!canFetchAdmin) {
      pushToast(
        `Confirmación simulada (${row.referenceCode}) · Cupón enviado desde noreply@pitchlab.mx.`,
        "success",
      );
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch(`/api/admin/transfers/${row.id}/approve`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ adminNotes }),
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
        `Pago ${row.referenceCode} confirmado${couponText} enviado desde noreply@pitchlab.mx.`,
        "success",
      );
      transfersReq.reload();
      couponsReq.reload();
    } catch (err) {
      void err;
      pushToast("Error de conexión al confirmar el pago.", "danger");
    } finally {
      setBusyAction(false);
    }
  };

  const executeRejectTransfer = async (
    row: AdminTransferRow,
    reason: string,
    adminNotes: string | null,
  ) => {
    if (isPreviewMode) {
      rejectPreviewTransfer(row.id, reason, adminNotes);
      pushToast(`Solicitud ${row.referenceCode} rechazada.`, "default");
      setPreviewTick((tick) => tick + 1);
      return;
    }
    if (!canFetchAdmin) {
      pushToast(`Rechazo simulado (${row.referenceCode}).`, "default");
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch(`/api/admin/transfers/${row.id}/reject`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason, adminNotes }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        pushToast(json?.error ?? "No se pudo rechazar la solicitud.", "danger");
        return;
      }
      pushToast(`Solicitud ${row.referenceCode} rechazada y socio notificado.`, "default");
      transfersReq.reload();
    } catch (err) {
      void err;
      pushToast("Error de conexión al rechazar.", "danger");
    } finally {
      setBusyAction(false);
    }
  };

  const handleSubmitRejectForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (formDialog?.kind !== "rejectForm") return;
    const cleanReason = dialogReason.trim();
    if (cleanReason.length < 3) {
      pushToast("Escribe el motivo del rechazo (mínimo 3 caracteres).", "warning");
      return;
    }
    const targetRow = formDialog.row;
    const cleanNote = dialogNote.trim() || null;
    setFormDialog(null);
    setConfirmAction({
      kind: "reject",
      row: targetRow,
      reason: cleanReason,
      adminNotes: cleanNote,
    });
  };

  const handleConfirmGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formDialog?.kind !== "grantForm") return;
    const parsedDays = parseStrictFiniteNumber(grantDays);
    if (parsedDays === null || !Number.isInteger(parsedDays) || parsedDays < 1 || parsedDays > 365) {
      pushToast("Indica entre 1 y 365 días.", "warning");
      return;
    }
    if (dialogReason.trim().length < 3) {
      pushToast("Escribe el motivo de la concesión.", "warning");
      return;
    }
    if (!canFetchAdmin) {
      pushToast(`Simulado: +${parsedDays} días para ${formDialog.member.email}.`, "success");
      setFormDialog(null);
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch("/api/admin/access/grant", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUserId: formDialog.member.id,
          days: parsedDays,
          reason: dialogReason.trim(),
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        pushToast(json?.error ?? "No se pudieron otorgar los días.", "danger");
        return;
      }
      pushToast(`+${parsedDays} días otorgados a ${formDialog.member.email}.`, "success");
      setFormDialog(null);
      setDialogReason("");
      membersReq.reload();
    } catch (err) {
      void err;
      pushToast("Error de conexión al otorgar días.", "danger");
    } finally {
      setBusyAction(false);
    }
  };

  const handleSubmitRevokeForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (formDialog?.kind !== "revokeForm") return;
    const cleanReason = dialogReason.trim();
    if (cleanReason.length < 3) {
      pushToast("Escribe el motivo de la revocación.", "warning");
      return;
    }
    const { member, grant } = formDialog;
    setFormDialog(null);
    setConfirmAction({
      kind: "revoke",
      member,
      grant,
      reason: cleanReason,
    });
  };

  const executeRevokeGrant = async (grant: AdminMemberGrantItem, reason: string) => {
    if (!canFetchAdmin) {
      pushToast("Revocación simulada.", "default");
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch("/api/admin/access/revoke", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          grantId: grant.id,
          reason,
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        pushToast(json?.error ?? "No se pudo revocar la concesión.", "danger");
        return;
      }
      pushToast("Concesión revocada y vigencia recalculada.", "success");
      membersReq.reload();
    } catch (err) {
      void err;
      pushToast("Error de conexión al revocar.", "danger");
    } finally {
      setBusyAction(false);
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    const days = parseStrictFiniteNumber(newCouponDays);
    if (days === null || !Number.isInteger(days) || days < 1 || days > 365) {
      pushToast("Indica entre 1 y 365 días para el cupón.", "warning");
      return;
    }
    const trimmedMax = newCouponMaxUses.trim();
    const parsedMax = trimmedMax ? parseStrictFiniteNumber(trimmedMax) : null;
    if (trimmedMax && (parsedMax === null || !Number.isInteger(parsedMax) || parsedMax < 1)) {
      pushToast("El cupo máximo debe ser un número entero mayor a 0.", "warning");
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
          maxRedemptions: parsedMax,
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
      couponsReq.reload();
    } catch (err) {
      void err;
      pushToast("Error de conexión al crear el cupón.", "danger");
    } finally {
      setBusyAction(false);
    }
  };

  const handleGenerateBatchCoupons = async (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseStrictFiniteNumber(batchCount);
    const days = parseStrictFiniteNumber(batchDays);
    if (count === null || !Number.isInteger(count) || count < 1 || count > 50) {
      pushToast("Indica entre 1 y 50 códigos por lote.", "warning");
      return;
    }
    if (days === null || !Number.isInteger(days) || days < 1 || days > 365) {
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
      couponsReq.reload();
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
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://pitchlab.mx";
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
      setLocalStoryInbox((prev) =>
        (prev ?? []).map((it) =>
          it.id === itemId ? { ...it, resolved: true, resolvedAtIso: new Date().toISOString() } : it,
        ),
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
      inboxReq.reload();
    } catch (err) {
      void err;
      pushToast("Error de conexión al actualizar la bandeja.", "danger");
    } finally {
      setBusyAction(false);
    }
  };

  const executeToggleCoupon = useCallback(
    async (coupon: AdminCouponItem) => {
      if (!canFetchAdmin) {
        setLocalStoryCoupons((prev) =>
          (prev ?? coupons).map((c) => (c.id === coupon.id ? { ...c, active: !c.active } : c)),
        );
        pushToast(
          coupon.active
            ? `Cupón ${coupon.code} desactivado (vista previa).`
            : `Cupón ${coupon.code} activado (vista previa).`,
          "default",
        );
        return;
      }
      setBusyAction(true);
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
        pushToast(
          coupon.active ? `Cupón ${coupon.code} desactivado.` : `Cupón ${coupon.code} reactivado.`,
          "success",
        );
        couponsReq.reload();
      } catch (err) {
        void err;
        pushToast("Error de conexión.", "danger");
      } finally {
        setBusyAction(false);
      }
    },
    [canFetchAdmin, coupons, couponsReq, pushToast],
  );

  const handleSubmitMarkPaidForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (formDialog?.kind !== "markPaidForm") return;
    const cleanRef = payoutRef.trim();
    if (cleanRef.length < 3) {
      pushToast("Escribe la referencia SPEI de liquidación.", "warning");
      return;
    }
    const row = formDialog.row;
    const cleanNote = dialogNote.trim() || null;
    setFormDialog(null);
    setConfirmAction({
      kind: "markPaid",
      row,
      reference: cleanRef,
      note: cleanNote,
    });
  };

  const executeMarkPaid = async (
    row: AdminTipsterLedgerItem,
    reference: string,
    note: string | null,
  ) => {
    if (!canFetchAdmin) {
      pushToast(`Pago manual simulado (${reference}).`, "success");
      return;
    }
    setBusyAction(true);
    try {
      const res = await fetch(`/api/admin/tipster-payouts/${row.id}/mark-paid`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reference, note }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        pushToast(json?.error ?? "No se pudo registrar el pago manual.", "danger");
        return;
      }
      pushToast("Comisión marcada como pagada y recibo enviado al tipster.", "success");
      setPayoutRef("");
      setDialogNote("");
      payoutsReq.reload();
    } catch (err) {
      void err;
      pushToast("Error de conexión al liquidar.", "danger");
    } finally {
      setBusyAction(false);
    }
  };

  const copyCouponLink = useCallback(
    async (code: string) => {
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
    },
    [pushToast],
  );

  const pendingTransfersCount = transfers.filter((t) => t.status === "pending_review").length;

  const opsTabItems = useMemo<readonly SofascoreTabItem[]>(
    () =>
      visibleTabs.map((tab) => ({
        id: tab.key,
        label: tab.label,
        count:
          tab.key === "transfers" && pendingTransfersCount > 0
            ? pendingTransfersCount
            : undefined,
      })),
    [pendingTransfersCount, visibleTabs],
  );

  const couponColumns = useMemo<readonly SofascoreTableColumn<AdminCouponItem>[]>(
    () => [
      {
        key: "code",
        header: "Código",
        sticky: true,
        render: (c) => (
          <div className="pl-ta-row-start">
            <strong className="num" style={{ color: "var(--pl-brand)" }}>
              {c.code}
            </strong>
            {c.transferRequestId ? (
              <span className="pl-ta-badge" data-tone="info">
                SPEI · 1 uso
              </span>
            ) : null}
          </div>
        ),
      },
      {
        key: "days",
        header: "Días",
        numeric: true,
        render: (c) => `+${c.days}d`,
      },
      {
        key: "uses",
        header: "Usos",
        numeric: true,
        render: (c) => `${c.redeemedCount} / ${c.maxRedemptions ?? "∞"}`,
      },
      {
        key: "expires",
        header: "Expira",
        numeric: true,
        render: (c) => formatDateMx(c.expiresAtIso),
      },
      {
        key: "status",
        header: "Estado",
        render: (c) => (
          <span className="pl-ta-badge" data-tone={c.active ? "success" : "danger"}>
            {c.active ? "Activo" : "Inactivo"}
          </span>
        ),
      },
      {
        key: "actions",
        header: "Acciones",
        align: "end",
        render: (c) => (
          <div className="pl-ta-row-end">
            <Button variant="secondary" size="sm" onClick={() => void copyCouponLink(c.code)}>
              Copiar liga
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void openRedemptionsModal(c)}>
              Ver canjes ({c.redeemedCount})
            </Button>
            <Button
              variant="secondary"
              tone={c.active ? "danger" : "default"}
              size="sm"
              disabled={busyAction}
              onClick={() => {
                if (c.active) {
                  setConfirmAction({ kind: "deactivateCoupon", coupon: c });
                } else {
                  void executeToggleCoupon(c);
                }
              }}
            >
              {c.active ? "Desactivar" : "Activar"}
            </Button>
          </div>
        ),
      },
    ],
    [busyAction, copyCouponLink, executeToggleCoupon, openRedemptionsModal],
  );

  const payoutColumns = useMemo<readonly SofascoreTableColumn<AdminTipsterLedgerItem>[]>(
    () => [
      {
        key: "tipster",
        header: "Tipster",
        sticky: true,
        render: (r) => <strong>@{r.tipsterHandle}</strong>,
      },
      {
        key: "origin",
        header: "Origen",
        render: (r) => <span className="pl-ta-code-text">{r.stripeInvoiceId}</span>,
      },
      {
        key: "commission",
        header: "Comisión",
        align: "end",
        numeric: true,
        render: (r) => <strong>{formatMxn(r.commissionCentavosMxn)}</strong>,
      },
      {
        key: "clears",
        header: "Libera",
        numeric: true,
        render: (r) => formatDateMx(r.clearsAtIso),
      },
      {
        key: "status",
        header: "Estado",
        render: (r) => (
          <span
            className="pl-ta-badge"
            data-tone={
              r.status === "paid_out"
                ? "success"
                : r.status === "payable"
                  ? "brand"
                  : "warning"
            }
          >
            {r.status === "paid_out"
              ? "Pagada"
              : r.status === "payable"
                ? "Lista para pagar"
                : "En ventana 14d"}
          </span>
        ),
      },
      {
        key: "payout",
        header: "Liquidación",
        align: "end",
        render: (r) =>
          r.status === "paid_out" ? (
            <span className="pl-ta-muted-text">{r.payoutNote ?? formatDateMx(r.paidOutAtIso)}</span>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setPayoutRef("");
                setDialogNote("");
                setFormDialog({ kind: "markPaidForm", row: r });
              }}
            >
              Marcar pagado
            </Button>
          ),
      },
    ],
    [],
  );

  const auditColumns = useMemo<readonly SofascoreTableColumn<AdminAuditRow>[]>(
    () => [
      {
        key: "action",
        header: "Acción",
        sticky: true,
        render: (entry) => (
          <span className="pl-ta-badge" data-tone="brand">
            {entry.action}
          </span>
        ),
      },
      {
        key: "actor",
        header: "Actor",
        render: (entry) => <span className="pl-ta-break-any">{entry.actorEmail}</span>,
      },
      {
        key: "target",
        header: "Objetivo",
        render: (entry) => <code className="pl-ta-code-text">{entry.targetKey.slice(0, 36)}</code>,
      },
      {
        key: "date",
        header: "Fecha",
        align: "end",
        numeric: true,
        render: (entry) => formatDateMx(entry.createdAtIso),
      },
    ],
    [],
  );

  const visibleInboxItems = useMemo(
    () =>
      inboxItems.filter((it) => {
        if (inboxFilter === "pending") return !it.resolved;
        if (inboxFilter === "all") return true;
        return it.kind === inboxFilter;
      }),
    [inboxFilter, inboxItems],
  );

  const confirmDialogProps = (() => {
    if (!confirmAction) return null;
    if (confirmAction.kind === "approve") {
      const { row, adminNotes } = confirmAction;
      const planText = row.planInterval === "annual" ? "365 días (anual)" : "30 días (mensual)";
      const noteText = adminNotes ? ` Nota interna: «${adminNotes}».` : "";
      return {
        title: `Confirmar pago ${row.referenceCode} y enviar cupón`,
        description: `Se generará un cupón personal de un solo uso por ${planText} (${formatMxn(row.amountCentavosMxn)}) y se enviará a ${row.userEmail} desde noreply@pitchlab.mx.${noteText}`,
        confirmLabel: "Confirmar y enviar cupón",
        tone: "brand" as const,
        onConfirm: () => {
          void executeApproveTransfer(row, adminNotes);
        },
      };
    }
    if (confirmAction.kind === "reject") {
      const { row, reason, adminNotes } = confirmAction;
      return {
        title: `Confirmar rechazo de ${row.referenceCode}`,
        description: `Motivo visible para ${row.userEmail}: «${reason}». Esta acción notifica al socio por correo y cierra la solicitud actual.`,
        confirmLabel: "Rechazar solicitud",
        tone: "danger" as const,
        onConfirm: () => {
          void executeRejectTransfer(row, reason, adminNotes);
        },
      };
    }
    if (confirmAction.kind === "revoke") {
      const { member, grant, reason } = confirmAction;
      return {
        title: `Revocar concesión (+${grant.daysGranted} días)`,
        description: `Se retirarán los días de ${SOURCE_LABELS[grant.sourceKind] ?? grant.sourceKind} a ${member.email} y se recalculará su vigencia. Motivo: «${reason}».`,
        confirmLabel: "Revocar concesión",
        tone: "danger" as const,
        onConfirm: () => {
          void executeRevokeGrant(grant, reason);
        },
      };
    }
    if (confirmAction.kind === "deactivateCoupon") {
      const { coupon } = confirmAction;
      return {
        title: `Desactivar cupón ${coupon.code}`,
        description: `Ningún socio podrá canjear el código ${coupon.code} (+${coupon.days} días) mientras permanezca inactivo.`,
        confirmLabel: "Desactivar cupón",
        tone: "danger" as const,
        onConfirm: () => {
          void executeToggleCoupon(coupon);
        },
      };
    }
    const { row, reference, note } = confirmAction;
    return {
      title: `Confirmar pago a @${row.tipsterHandle}`,
      description: `Se marcará como pagada la comisión neta de ${formatMxn(row.commissionCentavosMxn)} con folio SPEI «${reference}» y se enviará comprobante al tipster.`,
      confirmLabel: "Confirmar liquidación",
      tone: "brand" as const,
      onConfirm: () => {
        void executeMarkPaid(row, reference, note);
      },
    };
  })();

  const cardTitle =
    embedded && visibleTabs.length === 1
      ? visibleTabs[0]?.label
      : embedded
        ? undefined
        : "Cobros SPEI, socios, cupones y liquidaciones";

  return (
    <div data-admin-payments-section="">
      <SofascoreCard
        id={cardTitle ? sectionTitleId : undefined}
        title={cardTitle}
        meta={
          pendingTransfersCount > 0 && visibleTabs.some((t) => t.key === "transfers") ? (
            <span className="pl-ta-badge num" data-tone="warning">
              <MaestroIcon name="receipt" size={13} />
              <span>
                {pendingTransfersCount}{" "}
                {pendingTransfersCount === 1 ? "SPEI pendiente" : "SPEI pendientes"}
              </span>
            </span>
          ) : undefined
        }
      >
        <div className="pl-ta-stack">
          {!embedded ? (
            <p className="pl-ta-muted-text">
              Confirma pagos SPEI para enviar cupones personales desde noreply@pitchlab.mx, ajusta
              vigencias con auditoría y liquida comisiones de tipsters.
            </p>
          ) : null}

          {visibleTabs.length > 1 ? (
            <SofascoreTabs
              items={opsTabItems}
              value={activeTab}
              onChange={(next) => {
                if (isAdminOpsTabKey(next)) setSelectedTab(next);
              }}
              variant="segmented"
              ariaLabel="Operación comercial Beta 1.0"
            />
          ) : null}

          {activeTab === "transfers" ? (
            <div className="pl-ta-stack" role="tabpanel" aria-label="Transferencias SPEI">
              <SofascoreFilterBar
                searchValue={transferQuery}
                onSearchChange={(val) => {
                  setTransferQuery(val);
                  if (val === "") setSubmittedTransferQuery("");
                }}
                searchPlaceholder="Referencia PL-…, correo o @usuario"
                resultCount={transfers.length}
                trailing={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSubmittedTransferQuery(transferQuery);
                      if (canFetchAdmin) transfersReq.reload();
                    }}
                  >
                    <MaestroIcon name="search" size={14} />
                    <span>Buscar</span>
                  </Button>
                }
              >
                <SofascoreTabs
                  items={TRANSFER_FILTER_TABS}
                  value={transferFilter}
                  onChange={(next) => {
                    if (isTransferFilterKey(next)) setTransferFilter(next);
                  }}
                  variant="segmented"
                  ariaLabel="Filtrar transferencias SPEI"
                />
              </SofascoreFilterBar>

              {transfersReq.loading ? (
                <p className="pl-ta-muted-text">Cargando transferencias…</p>
              ) : transfersReq.error ? (
                <p className="pl-ta-alert-text" role="alert">
                  {transfersReq.error}
                </p>
              ) : transfers.length === 0 ? (
                <SofascoreEmptyState
                  title="Sin solicitudes SPEI en este filtro"
                  description="Cambia de pestaña o limpia la búsqueda para revisar otras transferencias."
                />
              ) : (
                <div className="pl-ta-stack">
                  {transfers.map((row) => {
                    const st = TRANSFER_STATUS_LABELS[row.status];
                    const rowNote = transferNotesById[row.id] ?? "";
                    return (
                      <article
                        key={row.id}
                        className="pl-ta-item-card"
                        data-admin-transfer-row={row.referenceCode}
                      >
                        <div className="pl-ta-row">
                          <div className="pl-ta-stack-sm">
                            <div className="pl-ta-row-start">
                              <strong
                                className="num"
                                style={{ color: "var(--pl-brand)", fontSize: "0.9375rem" }}
                              >
                                {row.referenceCode}
                              </strong>
                              <span className="pl-ta-badge" data-tone={st.tone}>
                                {st.label}
                              </span>
                              {row.amountMismatch ? (
                                <span
                                  className="pl-ta-badge"
                                  data-tone="warning"
                                  data-amount-mismatch=""
                                >
                                  Monto distinto reportado
                                </span>
                              ) : null}
                              {row.referralDiscountApplied ? (
                                <span className="pl-ta-badge" data-tone="info">
                                  -30 % referido
                                </span>
                              ) : null}
                            </div>
                            <div className="pl-ta-secondary-text">
                              <strong>
                                {row.userHandle ? `@${row.userHandle}` : row.userDisplayName ?? "Socio"}
                              </strong>{" "}
                              · <span className="pl-ta-break-any">{row.userEmail}</span> ·{" "}
                              <span className="num">
                                {row.planInterval === "annual" ? "Anual (365d)" : "Mensual (30d)"}
                              </span>
                            </div>
                          </div>

                          <div className="num" style={{ textAlign: "end" }}>
                            <strong style={{ display: "block", fontSize: "0.9375rem" }}>
                              {formatMxn(row.amountCentavosMxn)}
                            </strong>
                            {row.reportedAmountCentavosMxn !== null ? (
                              <span
                                className="pl-ta-muted-text"
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

                        <div className="pl-ta-meta-grid">
                          <span>Banco: {row.originBank ?? "Sin reportar"}</span>
                          <span className="num">Rastreo: {row.receiptReference ?? "Sin reportar"}</span>
                          <span>Titular: {row.payerName ?? "—"}</span>
                          <span className="num">
                            Fecha SPEI: {row.transferDate ?? formatDateMx(row.createdAtIso)}
                          </span>
                        </div>

                        {row.userNote ? (
                          <p className="pl-ta-secondary-text">Nota del socio: “{row.userNote}”</p>
                        ) : null}

                        {row.rejectionReason ? (
                          <p className="pl-ta-alert-text">
                            Motivo de rechazo: {row.rejectionReason}
                          </p>
                        ) : null}

                        {row.status === "approved" && row.issuedCouponCode ? (
                          <div
                            className="pl-ta-row pl-ta-divider"
                            data-admin-coupon-summary={row.referenceCode}
                          >
                            <div className="pl-ta-row-start">
                              <span className="pl-ta-muted-text">Cupón emitido (1 uso):</span>
                              <strong
                                className="num"
                                style={{ color: "var(--pl-brand)" }}
                                data-admin-issued-coupon={row.issuedCouponCode}
                              >
                                {row.issuedCouponCode}
                              </strong>
                              <span
                                className="pl-ta-badge"
                                data-tone={row.couponRedeemedAtIso ? "success" : "info"}
                              >
                                {row.couponRedeemedAtIso
                                  ? `Canjeado el ${formatDateMx(row.couponRedeemedAtIso)}`
                                  : `Pendiente de canje · vence ${formatDateMx(row.couponExpiresAtIso)}`}
                              </span>
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void copyCouponLink(row.issuedCouponCode!)}
                              data-admin-copy-issued={row.issuedCouponCode}
                            >
                              <MaestroIcon name="copy" size={14} />
                              <span>Copiar liga /canjear</span>
                            </Button>
                          </div>
                        ) : null}

                        {row.status === "pending_review" ? (
                          <div className="pl-ta-stack-sm pl-ta-divider">
                            <details className="pl-ta-note-details">
                              <summary className="pl-ta-note-summary">
                                Añadir nota interna opcional (folio bancario)
                              </summary>
                              <input
                                type="text"
                                maxLength={240}
                                aria-label={`Nota interna para ${row.referenceCode}`}
                                placeholder="Ej. Banco Santander folio 9812"
                                value={rowNote}
                                onChange={(e) =>
                                  setTransferNotesById((prev) => ({
                                    ...prev,
                                    [row.id]: e.target.value,
                                  }))
                                }
                                className="pl-ta-input"
                              />
                            </details>
                            <div className="pl-ta-row-end">
                              <Button
                                variant="secondary"
                                tone="danger"
                                size="sm"
                                disabled={busyAction}
                                onClick={() => {
                                  setDialogReason("");
                                  setDialogNote(rowNote);
                                  setFormDialog({ kind: "rejectForm", row });
                                }}
                                data-admin-reject={row.referenceCode}
                              >
                                <MaestroIcon name="x" size={14} />
                                <span>Rechazar</span>
                              </Button>
                              <Button
                                variant="primary"
                                size="sm"
                                disabled={busyAction}
                                onClick={() =>
                                  setConfirmAction({
                                    kind: "approve",
                                    row,
                                    adminNotes: rowNote.trim() || null,
                                  })
                                }
                                data-admin-approve={row.referenceCode}
                              >
                                <MaestroIcon name="check" size={14} />
                                <span>Confirmar pago y enviar cupón</span>
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "members" ? (
            <div className="pl-ta-stack" role="tabpanel" aria-label="Socios y acceso">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setSubmittedMemberQuery(memberQuery);
                  if (canFetchAdmin) membersReq.reload();
                }}
                className="pl-ta-row"
              >
                <div className="pl-ta-field">
                  <input
                    type="search"
                    value={memberQuery}
                    onChange={(e) => {
                      setMemberQuery(e.target.value);
                      if (e.target.value === "") setSubmittedMemberQuery("");
                    }}
                    placeholder="Buscar por correo o @usuario (ej. @lupita_mx)"
                    aria-label="Buscar socios por correo o @usuario"
                    className="pl-ta-input"
                  />
                </div>
                <Button type="submit" variant="primary" size="default">
                  <MaestroIcon name="search" size={14} />
                  <span>Buscar socios</span>
                </Button>
              </form>

              {membersReq.loading ? (
                <p className="pl-ta-muted-text">Buscando socios…</p>
              ) : membersReq.error ? (
                <p className="pl-ta-alert-text" role="alert">
                  {membersReq.error}
                </p>
              ) : members.length === 0 ? (
                <SofascoreEmptyState
                  title="Sin socios para mostrar"
                  description={
                    canFetchAdmin
                      ? "No hay socios que coincidan con la búsqueda."
                      : "Conecta cuentas y sesión fundadora para consultar y ajustar vigencias de socios."
                  }
                />
              ) : (
                <div className="pl-ta-stack">
                  {members.map((m) => (
                    <article key={m.id} className="pl-ta-item-card">
                      <div className="pl-ta-row">
                        <div className="pl-ta-stack-sm">
                          <div className="pl-ta-row-start">
                            <strong>
                              {m.handle ? `@${m.handle}` : m.displayName ?? "Sin @usuario"}
                            </strong>
                            <span
                              className="pl-ta-badge"
                              data-tone={m.accessUntilIso ? "success" : "warning"}
                            >
                              {m.accessUntilIso
                                ? `Activo hasta ${formatDateMx(m.accessUntilIso)}`
                                : "Sin pase vigente"}
                            </span>
                          </div>
                          <span className="pl-ta-muted-text pl-ta-break-any">{m.email}</span>
                        </div>

                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setGrantDays("15");
                            setDialogReason("");
                            setFormDialog({ kind: "grantForm", member: m });
                          }}
                        >
                          <MaestroIcon name="plus" size={14} />
                          <span>Dar días</span>
                        </Button>
                      </div>

                      {m.grants.length > 0 ? (
                        <ul className="pl-ta-grant-list">
                          {m.grants.slice(0, 5).map((g) => (
                            <li key={g.id} className="pl-ta-grant-row">
                              <span
                                style={{
                                  color: g.revokedAtIso
                                    ? "var(--pl-text-muted)"
                                    : "var(--pl-text-secondary)",
                                }}
                              >
                                <strong>{SOURCE_LABELS[g.sourceKind] ?? g.sourceKind}</strong> ·{" "}
                                <span className="num">+{g.daysGranted}d</span> (vence{" "}
                                <span className="num">{formatDateMx(g.endsAtIso)}</span>)
                                {g.note ? ` · ${g.note}` : ""}
                                {g.revokedAtIso
                                  ? ` · REVOCADA (${g.revokeReason ?? "sin motivo"})`
                                  : ""}
                              </span>
                              {!g.revokedAtIso ? (
                                <Button
                                  variant="secondary"
                                  tone="danger"
                                  size="sm"
                                  onClick={() => {
                                    setDialogReason("");
                                    setFormDialog({ kind: "revokeForm", member: m, grant: g });
                                  }}
                                >
                                  Revocar
                                </Button>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "coupons" ? (
            <div className="pl-ta-stack" role="tabpanel" aria-label="Cupones de acceso">
              <form onSubmit={handleCreateCoupon} noValidate className="pl-ta-item-card">
                <div className="pl-ta-row">
                  <strong>Crear nuevo cupón de acceso</strong>
                  <span className="pl-ta-muted-text">
                    Si dejas el código vacío, se genera sin 0/O ni 1/I.
                  </span>
                </div>

                <div className="pl-ta-form-grid-5">
                  <input
                    type="text"
                    maxLength={32}
                    placeholder="Código (opcional, ej. NAVIDAD15)"
                    aria-label="Código personalizado de cupón"
                    value={newCouponCode}
                    onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                    className="pl-ta-input pl-ta-input-upper num"
                  />
                  <input
                    type="number"
                    min={1}
                    max={365}
                    placeholder="Días (1-365)"
                    aria-label="Días del cupón"
                    value={newCouponDays}
                    onChange={(e) => setNewCouponDays(e.target.value)}
                    className="pl-ta-input num"
                  />
                  <input
                    type="number"
                    min={1}
                    placeholder="Cupo máx. (vacío = ∞)"
                    aria-label="Cupo máximo de canjes"
                    value={newCouponMaxUses}
                    onChange={(e) => setNewCouponMaxUses(e.target.value)}
                    className="pl-ta-input num"
                  />
                  <input
                    type="date"
                    aria-label="Fecha límite del cupón"
                    value={newCouponExpires}
                    onChange={(e) => setNewCouponExpires(e.target.value)}
                    className="pl-ta-input num"
                  />
                  <input
                    type="text"
                    maxLength={200}
                    placeholder="Nota interna"
                    aria-label="Nota interna del cupón"
                    value={newCouponNote}
                    onChange={(e) => setNewCouponNote(e.target.value)}
                    className="pl-ta-input"
                  />
                </div>

                <div className="pl-ta-row">
                  <div className="pl-ta-row-start">
                    <span className="pl-ta-muted-text">Duración rápida:</span>
                    {QUICK_COUPON_DAYS.map((d) => (
                      <Button
                        key={d}
                        variant={newCouponDays === String(d) ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => setNewCouponDays(String(d))}
                      >
                        <span className="num">{d}d</span>
                      </Button>
                    ))}
                  </div>
                  <Button
                    type="submit"
                    variant="primary"
                    size="default"
                    disabled={busyAction}
                    data-admin-create-coupon=""
                  >
                    <MaestroIcon name="ticket" size={14} />
                    <span>{busyAction ? "Creando…" : "Crear cupón"}</span>
                  </Button>
                </div>
              </form>

              <form
                onSubmit={handleGenerateBatchCoupons}
                noValidate
                className="pl-ta-item-card"
                data-admin-coupon-batch=""
              >
                <div className="pl-ta-row">
                  <div>
                    <strong>Generar lote de códigos de un solo uso</strong>
                    <p className="pl-ta-muted-text">
                      Crea hasta 50 códigos únicos (1 uso cada uno) con seguimiento de canjes.
                    </p>
                  </div>
                  <span className="pl-ta-badge" data-tone="brand">
                    1 uso · auditable
                  </span>
                </div>

                <div className="pl-ta-form-grid-5">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    placeholder="Cantidad (1-50)"
                    aria-label="Cantidad de códigos de un solo uso"
                    value={batchCount}
                    onChange={(e) => setBatchCount(e.target.value)}
                    className="pl-ta-input num"
                  />
                  <input
                    type="number"
                    min={1}
                    max={365}
                    placeholder="Días (1-365)"
                    aria-label="Días de pase del lote"
                    value={batchDays}
                    onChange={(e) => setBatchDays(e.target.value)}
                    className="pl-ta-input num"
                  />
                  <input
                    type="text"
                    maxLength={10}
                    placeholder="Prefijo (ej. VIP, PROMO)"
                    aria-label="Prefijo opcional del lote"
                    value={batchPrefix}
                    onChange={(e) => setBatchPrefix(e.target.value.toUpperCase())}
                    className="pl-ta-input pl-ta-input-upper num"
                  />
                  <input
                    type="date"
                    aria-label="Fecha límite del lote"
                    value={batchExpires}
                    onChange={(e) => setBatchExpires(e.target.value)}
                    className="pl-ta-input num"
                  />
                  <input
                    type="text"
                    maxLength={200}
                    placeholder="Campaña o nota interna"
                    aria-label="Nota del lote de cupones"
                    value={batchNote}
                    onChange={(e) => setBatchNote(e.target.value)}
                    className="pl-ta-input"
                  />
                </div>

                <div className="pl-ta-row">
                  <div className="pl-ta-row-start">
                    {QUICK_COUPON_DAYS.map((d) => (
                      <Button
                        key={`batch-${d}`}
                        variant={batchDays === String(d) ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => setBatchDays(String(d))}
                      >
                        <span className="num">+{d}d</span>
                      </Button>
                    ))}
                  </div>
                  <Button
                    type="submit"
                    variant="primary"
                    size="default"
                    disabled={busyAction}
                    data-admin-generate-batch=""
                  >
                    <MaestroIcon name="layers" size={14} />
                    <span>{busyAction ? "Generando…" : `Generar ${batchCount || 1} códigos`}</span>
                  </Button>
                </div>

                {generatedBatch.length > 0 ? (
                  <div className="pl-ta-stack-sm pl-ta-divider">
                    <div className="pl-ta-row">
                      <strong className="num" style={{ color: "var(--pl-success)" }}>
                        {generatedBatch.length} códigos listos (+{generatedBatch[0]?.days ?? batchDays} días · 1 uso)
                      </strong>
                      <div className="pl-ta-row-start">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void handleCopyBatchCodes()}
                        >
                          <MaestroIcon name="copy" size={14} />
                          <span>Copiar lista</span>
                        </Button>
                        <Button variant="secondary" size="sm" onClick={handleDownloadBatchCsv}>
                          <MaestroIcon name="download" size={14} />
                          <span>Exportar CSV</span>
                        </Button>
                      </div>
                    </div>
                    <pre className="pl-ta-pre num">
                      {generatedBatch.map((c) => c.code).join("\n")}
                    </pre>
                  </div>
                ) : null}
              </form>

              {couponsReq.loading ? (
                <p className="pl-ta-muted-text">Cargando cupones…</p>
              ) : couponsReq.error ? (
                <p className="pl-ta-alert-text" role="alert">
                  {couponsReq.error}
                </p>
              ) : (
                <SofascoreTable
                  caption="Cupones de acceso temporal"
                  columns={couponColumns}
                  rows={coupons}
                  rowKey={(c) => c.id}
                  density="compact"
                  emptyState={
                    <SofascoreEmptyState
                      title="Aún no hay cupones creados"
                      description="Crea un cupón individual o genera un lote de códigos de un solo uso arriba."
                    />
                  }
                />
              )}
            </div>
          ) : null}

          {activeTab === "payouts" ? (
            <div className="pl-ta-stack" role="tabpanel" aria-label="Liquidaciones tipsters">
              {paymentMode === "transfer" ? (
                <p className="pl-ta-secondary-text">
                  Modo transferencia manual activo: las comisiones del 25 % sobre ventas netas (sin
                  IVA) maduran a los 14 días y se liquidan por SPEI fuera de línea; registra aquí tu
                  folio para emitir su recibo.
                </p>
              ) : null}

              {payoutsReq.loading ? (
                <p className="pl-ta-muted-text">Cargando libro de comisiones…</p>
              ) : payoutsReq.error ? (
                <p className="pl-ta-alert-text" role="alert">
                  {payoutsReq.error}
                </p>
              ) : tipsterLedger.length === 0 ? (
                <SofascoreEmptyState
                  title="Sin comisiones de tipsters registradas"
                  description="Aún no hay comisiones generadas por pagos de referidos de tipsters."
                />
              ) : (
                <div className="pl-ta-stack">
                  <div className="pl-ta-payout-totals num">
                    {tipsterTotals.map((t) => (
                      <div key={t.tipsterUserId} className="pl-ta-item-card">
                        <strong>
                          {t.displayName} (@{t.handle})
                        </strong>
                        <div className="pl-ta-row">
                          <span className="pl-ta-muted-text">En espera (14d)</span>
                          <span>{formatMxn(t.pendingClearanceCentavos)}</span>
                        </div>
                        <div className="pl-ta-row" style={{ color: "var(--pl-brand)" }}>
                          <strong>Listo por pagar</strong>
                          <strong>{formatMxn(t.payableCentavos)}</strong>
                        </div>
                        <div className="pl-ta-row" style={{ color: "var(--pl-success)" }}>
                          <span>Liquidado</span>
                          <span>{formatMxn(t.paidOutCentavos)}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <SofascoreTable
                    caption="Detalle de comisiones de tipsters"
                    columns={payoutColumns}
                    rows={tipsterLedger}
                    rowKey={(r) => r.id}
                    density="compact"
                  />
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "inbox" ? (
            <div
              className="pl-ta-stack"
              role="tabpanel"
              aria-label="Bandeja y soporte"
              data-admin-inbox-panel=""
            >
              <div className="pl-ta-row">
                <SofascoreTabs
                  items={INBOX_FILTER_TABS}
                  value={inboxFilter}
                  onChange={(next) => {
                    if (isInboxFilterKey(next)) setInboxFilter(next);
                  }}
                  variant="segmented"
                  ariaLabel="Filtrar bandeja de mensajes"
                />
                {canFetchAdmin ? (
                  <Button variant="secondary" size="sm" onClick={inboxReq.reload}>
                    Actualizar
                  </Button>
                ) : null}
              </div>

              {inboxReq.loading ? (
                <p className="pl-ta-muted-text">Cargando bandeja…</p>
              ) : inboxReq.error ? (
                <p className="pl-ta-alert-text" role="alert">
                  {inboxReq.error}
                </p>
              ) : visibleInboxItems.length === 0 ? (
                <SofascoreEmptyState
                  title="Sin mensajes en esta vista"
                  description="Los envíos desde Preferencias → Feedback, Soporte y Eliminar cuenta aparecen aquí."
                />
              ) : (
                <div className="pl-ta-stack">
                  {visibleInboxItems.map((item) => {
                    const meta = INBOX_KIND_META[item.kind];
                    return (
                      <article key={item.id} className="pl-ta-item-card">
                        <div className="pl-ta-row">
                          <div className="pl-ta-stack-sm">
                            <div className="pl-ta-row-start">
                              <span className="pl-ta-badge" data-tone={meta.tone}>
                                {meta.label}
                              </span>
                              {item.category ? (
                                <span className="pl-ta-badge">{item.category}</span>
                              ) : null}
                              <span
                                className="pl-ta-badge"
                                data-tone={item.resolved ? "success" : "warning"}
                              >
                                {item.resolved ? "Atendido" : "Pendiente"}
                              </span>
                            </div>
                            <strong>
                              {item.subject ||
                                (item.kind === "deletion"
                                  ? "Solicitud formal de eliminación de cuenta"
                                  : "Mensaje de socio")}
                            </strong>
                            <span className="pl-ta-muted-text pl-ta-break-any">
                              {item.handle ? `@${item.handle} · ` : ""}
                              {item.actorEmail} · {formatDateMx(item.createdAtIso)}
                            </span>
                          </div>
                          {!item.resolved ? (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={busyAction}
                              onClick={() => void handleResolveInboxItem(item.id)}
                            >
                              Marcar atendido
                            </Button>
                          ) : null}
                        </div>
                        <p className="pl-ta-secondary-text" style={{ whiteSpace: "pre-wrap" }}>
                          {item.message}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}

          {activeTab === "audit" ? (
            <div
              className="pl-ta-stack"
              role="tabpanel"
              aria-label="Auditoría administrativa"
              data-admin-audit-panel=""
            >
              <div className="pl-ta-row">
                <p className="pl-ta-muted-text">
                  Bitácora inmutable de accesos administrativos, emisión de cupones, concesiones,
                  moderación y solicitudes de privacidad.
                </p>
                {canFetchAdmin ? (
                  <Button variant="secondary" size="sm" onClick={auditReq.reload}>
                    Actualizar
                  </Button>
                ) : null}
              </div>

              {auditReq.loading ? (
                <p className="pl-ta-muted-text">Cargando auditoría…</p>
              ) : auditReq.error ? (
                <p className="pl-ta-alert-text" role="alert">
                  {auditReq.error}
                </p>
              ) : (
                <SofascoreTable
                  caption="Auditoría de seguridad y operación"
                  columns={auditColumns}
                  rows={auditEntries}
                  rowKey={(entry) => entry.id}
                  density="compact"
                  emptyState={
                    <SofascoreEmptyState
                      title="Sin registros recientes en la auditoría"
                      description={
                        canFetchAdmin
                          ? "Aún no existen movimientos administrativos registrados."
                          : "Al iniciar sesión como fundador con PostgreSQL verás aquí la bitácora auditable."
                      }
                    />
                  }
                />
              )}
            </div>
          ) : null}
        </div>
      </SofascoreCard>

      <TopLayerModalDialog
        open={formDialog !== null}
        onClose={() => setFormDialog(null)}
        ariaLabelledBy={dialogTitleId}
        maxWidth="30rem"
      >
        {formDialog?.kind === "rejectForm" ? (
          <form onSubmit={handleSubmitRejectForm} className="pl-ta-modal-body">
            <h3 id={dialogTitleId} className="pl-ta-modal-title">
              Rechazar transferencia {formDialog.row.referenceCode}
            </h3>
            <p className="pl-ta-secondary-text">
              El socio recibirá un correo con este motivo para poder corregir o intentar de nuevo.
            </p>
            <input
              type="text"
              required
              minLength={3}
              maxLength={280}
              placeholder="Motivo visible al socio (ej. Monto incompleto o no localizado)"
              value={dialogReason}
              onChange={(e) => setDialogReason(e.target.value)}
              className="pl-ta-input"
            />
            <input
              type="text"
              maxLength={240}
              placeholder="Nota interna opcional"
              value={dialogNote}
              onChange={(e) => setDialogNote(e.target.value)}
              className="pl-ta-input"
            />
            <div className="pl-ta-row-end">
              <Button variant="secondary" autoFocus onClick={() => setFormDialog(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" tone="danger" disabled={busyAction}>
                Continuar a confirmación
              </Button>
            </div>
          </form>
        ) : null}

        {formDialog?.kind === "grantForm" ? (
          <form onSubmit={handleConfirmGrant} className="pl-ta-modal-body">
            <h3 id={dialogTitleId} className="pl-ta-modal-title">
              Dar días a {formDialog.member.handle ? `@${formDialog.member.handle}` : formDialog.member.email}
            </h3>
            <label className="pl-ta-field">
              <span className="pl-ta-label">Días (1 a 365)</span>
              <input
                type="number"
                min={1}
                max={365}
                required
                value={grantDays}
                onChange={(e) => setGrantDays(e.target.value)}
                className="pl-ta-input num"
              />
            </label>
            <label className="pl-ta-field">
              <span className="pl-ta-label">Motivo (obligatorio, queda en auditoría)</span>
              <input
                type="text"
                required
                minLength={3}
                maxLength={280}
                placeholder="Ej. Compensación soporte o cortesía Beta 1.0"
                value={dialogReason}
                onChange={(e) => setDialogReason(e.target.value)}
                className="pl-ta-input"
              />
            </label>
            <div className="pl-ta-row-end">
              <Button variant="secondary" autoFocus onClick={() => setFormDialog(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={busyAction}>
                {busyAction ? "Guardando…" : "Otorgar días"}
              </Button>
            </div>
          </form>
        ) : null}

        {formDialog?.kind === "revokeForm" ? (
          <form onSubmit={handleSubmitRevokeForm} className="pl-ta-modal-body">
            <h3 id={dialogTitleId} className="pl-ta-modal-title">
              Revocar concesión (+{formDialog.grant.daysGranted} días)
            </h3>
            <p className="pl-ta-secondary-text">
              Se retirarán los días de{" "}
              {SOURCE_LABELS[formDialog.grant.sourceKind] ?? formDialog.grant.sourceKind} y se
              recalculará el acceso de {formDialog.member.email}.
            </p>
            <input
              type="text"
              required
              minLength={3}
              maxLength={280}
              placeholder="Motivo obligatorio de revocación"
              value={dialogReason}
              onChange={(e) => setDialogReason(e.target.value)}
              className="pl-ta-input"
            />
            <div className="pl-ta-row-end">
              <Button variant="secondary" autoFocus onClick={() => setFormDialog(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" tone="danger" disabled={busyAction}>
                Continuar a confirmación
              </Button>
            </div>
          </form>
        ) : null}

        {formDialog?.kind === "redemptions" ? (
          <div className="pl-ta-modal-body">
            <h3 id={dialogTitleId} className="pl-ta-modal-title">
              Canjes del cupón {formDialog.coupon.code}
            </h3>
            {redemptionsLoading ? (
              <p className="pl-ta-muted-text">Cargando historial…</p>
            ) : redemptions.length === 0 ? (
              <p className="pl-ta-muted-text">
                Ningún socio ha canjeado este código todavía.
              </p>
            ) : (
              <ul className="pl-ta-mod-compact-list">
                {redemptions.map((item) => (
                  <li key={item.id} className="pl-ta-mod-compact-row">
                    <span className="pl-ta-mod-compact-copy">
                      <strong>
                        {item.handle ? `@${item.handle}` : item.displayName ?? "Socio"}
                      </strong>{" "}
                      · {item.email}
                    </span>
                    <span className="pl-ta-muted-text num">
                      {formatDateMx(item.createdAtIso)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="pl-ta-row-end">
              <Button variant="secondary" autoFocus onClick={() => setFormDialog(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : null}

        {formDialog?.kind === "markPaidForm" ? (
          <form onSubmit={handleSubmitMarkPaidForm} className="pl-ta-modal-body">
            <h3 id={dialogTitleId} className="pl-ta-modal-title">
              Liquidar comisión a @{formDialog.row.tipsterHandle}
            </h3>
            <p className="pl-ta-secondary-text num">
              Monto neto de comisión:{" "}
              <strong>{formatMxn(formDialog.row.commissionCentavosMxn)}</strong>. Al confirmar se
              enviará el comprobante al correo del tipster.
            </p>
            <input
              type="text"
              required
              minLength={3}
              maxLength={80}
              placeholder="Referencia o clave de rastreo SPEI"
              value={payoutRef}
              onChange={(e) => setPayoutRef(e.target.value)}
              className="pl-ta-input num"
            />
            <input
              type="text"
              maxLength={200}
              placeholder="Nota opcional"
              value={dialogNote}
              onChange={(e) => setDialogNote(e.target.value)}
              className="pl-ta-input"
            />
            <div className="pl-ta-row-end">
              <Button variant="secondary" autoFocus onClick={() => setFormDialog(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={busyAction}>
                Continuar a confirmación
              </Button>
            </div>
          </form>
        ) : null}
      </TopLayerModalDialog>

      <ConfirmActionDialog
        open={confirmDialogProps !== null}
        title={confirmDialogProps?.title ?? ""}
        description={confirmDialogProps?.description ?? ""}
        confirmLabel={confirmDialogProps?.confirmLabel ?? "Confirmar"}
        tone={confirmDialogProps?.tone ?? "danger"}
        onConfirm={() => {
          confirmDialogProps?.onConfirm();
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}
