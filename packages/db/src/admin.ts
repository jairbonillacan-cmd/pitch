/**
 * Consultas de la consola del fundador (/app/admin) y de banderas operativas.
 */
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { accessUntil, grantDays, revokeGrant, type Db } from "./billing";
import {
  adminAuditLogs,
  entitlementGrants,
  platformRuntimeFlags,
  referralGrants,
  socialModerationLogs,
  subscriptions,
  tipsterAttributions,
  tipsterCommissionLedger,
  tipsterProfiles,
  users,
} from "./schema";
import { checkHandleFormat, isHandleAvailable } from "./signup";

export const FLAG_MONTH1_NO_CARD = "month1_no_card_mode";
export const FLAG_TIPSTER_PAYOUTS = "tipster_payouts_enabled";
export const FLAG_AI_ENABLED = "ai.enabled";

export interface AdminAuditInput {
  actorUserId: string | null;
  actorEmail: string;
  action: string;
  targetKey: string;
  payloadJson?: Record<string, unknown> | null;
  ipSubnetHash?: string | null;
}

export async function recordAdminAudit(db: Db, entry: AdminAuditInput): Promise<void> {
  await db.insert(adminAuditLogs).values({
    actorUserId: entry.actorUserId,
    actorEmail: entry.actorEmail.trim().toLowerCase(),
    action: entry.action,
    targetKey: entry.targetKey,
    payloadJson: entry.payloadJson ?? null,
    ipSubnetHash: entry.ipSubnetHash ?? null,
  });
}

export async function isActiveTipsterUser(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: tipsterProfiles.userId })
    .from(tipsterProfiles)
    .where(and(eq(tipsterProfiles.userId, userId), eq(tipsterProfiles.isActive, true)));
  return Boolean(row);
}

export async function getBoolFlag(db: Db, key: string, fallback: boolean): Promise<boolean> {
  const [row] = await db
    .select({ v: platformRuntimeFlags.boolValue })
    .from(platformRuntimeFlags)
    .where(eq(platformRuntimeFlags.key, key));
  return row ? row.v : fallback;
}

export async function setBoolFlag(db: Db, key: string, value: boolean, updatedByUserId: string | null): Promise<void> {
  await db
    .insert(platformRuntimeFlags)
    .values({ key, boolValue: value, updatedByUserId, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformRuntimeFlags.key,
      set: { boolValue: value, updatedByUserId, updatedAt: new Date() },
    });
}

export interface AdminOverview {
  members: number;
  activeSubscriptions: number;
  freeTrialsGranted: number;
  referralsRewarded: number;
  commissionsPayableCentavos: number;
  moderationBlocks: number;
}

const num = (v: unknown) => Number(v ?? 0);

export async function adminOverview(db: Db): Promise<AdminOverview> {
  const [[m], [s], [t], [r], [c], [b]] = await Promise.all([
    db.select({ n: count() }).from(users),
    db
      .select({ n: count() })
      .from(subscriptions)
      .where(sql`${subscriptions.status} IN ('active', 'trialing_card', 'past_due_grace')`),
    db
      .select({ n: count() })
      .from(entitlementGrants)
      .where(sql`${entitlementGrants.sourceKind} IN ('trial_m1_nocard', 'trial_tipster_5d')`),
    db.select({ n: count() }).from(referralGrants).where(eq(referralGrants.status, "rewarded_bilateral")),
    db
      .select({ n: sql<number>`coalesce(sum(${tipsterCommissionLedger.commissionCentavosMxn}), 0)` })
      .from(tipsterCommissionLedger)
      .where(sql`${tipsterCommissionLedger.status} IN ('pending_clearance', 'payable', 'processing_payout')`),
    db.select({ n: count() }).from(socialModerationLogs),
  ]);
  return {
    members: num(m?.n),
    activeSubscriptions: num(s?.n),
    freeTrialsGranted: num(t?.n),
    referralsRewarded: num(r?.n),
    commissionsPayableCentavos: num(c?.n),
    moderationBlocks: num(b?.n),
  };
}

export interface TipsterCodeRow {
  code: string;
  handle: string;
  name: string;
  freeDays: number;
  commissionPct: number;
  activeReferrals: number;
  pendingCommissionCentavos: number;
}

export async function listTipsterCodes(db: Db): Promise<TipsterCodeRow[]> {
  const profiles = await db.select().from(tipsterProfiles).where(eq(tipsterProfiles.isActive, true));
  const rows: TipsterCodeRow[] = [];
  for (const p of profiles) {
    const [[a], [c]] = await Promise.all([
      db
        .select({ n: count() })
        .from(tipsterAttributions)
        .where(and(eq(tipsterAttributions.tipsterUserId, p.userId), eq(tipsterAttributions.status, "active_paying"))),
      db
        .select({ n: sql<number>`coalesce(sum(${tipsterCommissionLedger.commissionCentavosMxn}), 0)` })
        .from(tipsterCommissionLedger)
        .where(
          and(
            eq(tipsterCommissionLedger.tipsterUserId, p.userId),
            sql`${tipsterCommissionLedger.status} IN ('pending_clearance', 'payable', 'processing_payout')`,
          ),
        ),
    ]);
    rows.push({
      code: p.promoCode,
      handle: p.handle,
      name: p.displayName,
      freeDays: p.freeTrialDays,
      commissionPct: p.commissionBps / 100,
      activeReferrals: num(a?.n),
      pendingCommissionCentavos: num(c?.n),
    });
  }
  return rows;
}

export type CreateTipsterResult = { ok: true } | { ok: false; reason: "codigo_invalido" | "handle_invalido" | "duplicado" };

/** Da de alta a un tipster: liga (o crea) su usuario por correo y registra su código. */
export async function createTipsterCode(
  db: Db,
  input: { email: string; handle: string; displayName: string; promoCode: string; specialty: string },
): Promise<CreateTipsterResult> {
  const code = input.promoCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,16}$/.test(code)) return { ok: false, reason: "codigo_invalido" };
  const handleCheck = checkHandleFormat(input.handle);
  if (!handleCheck.ok) return { ok: false, reason: "handle_invalido" };
  const handle = handleCheck.handle;
  const email = input.email.trim().toLowerCase();
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!(await isHandleAvailable(db, handle, user?.id))) {
    return { ok: false, reason: "duplicado" };
  }
  if (!user) {
    [user] = await db.insert(users).values({ email, handle, displayName: input.displayName }).returning();
  }
  const inserted = await db
    .insert(tipsterProfiles)
    .values({
      userId: user!.id,
      handle,
      displayName: input.displayName.trim() || `@${handle}`,
      specialty: input.specialty.trim() || "Multideporte",
      promoCode: code,
      defaultWeeklySlug: `${handle.replace(/_/g, "-")}-sem`,
    })
    .onConflictDoNothing()
    .returning({ id: tipsterProfiles.userId });
  return inserted.length ? { ok: true } : { ok: false, reason: "duplicado" };
}

export interface MyReferrals {
  referralCode: string | null;
  paidFriends: number;
  pendingFriends: number;
}

export async function myReferrals(db: Db, userId: string): Promise<MyReferrals> {
  const [u] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId));
  const rows = await db
    .select({ status: referralGrants.status })
    .from(referralGrants)
    .where(eq(referralGrants.referrerUserId, userId));
  return {
    referralCode: u?.code ?? null,
    paidFriends: rows.filter((r) => r.status === "rewarded_bilateral").length,
    pendingFriends: rows.filter((r) => r.status === "trial_started").length,
  };
}

export interface AdminMemberGrantRow {
  id: string;
  sourceKind: string;
  daysGranted: number;
  startsAt: Date;
  endsAt: Date;
  revokedAt: Date | null;
  revokeReason: string | null;
  note: string | null;
  createdAt: Date;
}

export interface AdminMemberWithGrants {
  id: string;
  email: string;
  handle: string | null;
  displayName: string | null;
  isAmbassador: boolean;
  createdAt: Date;
  accessUntil: Date | null;
  activeSourceKind: string | null;
  grants: AdminMemberGrantRow[];
}

/** Busca socios por correo o `@usuario` y lista su acceso vigente e historial de concesiones. */
export async function adminFindMembersWithGrants(
  db: Db,
  query: string,
  now: Date,
  limit = 25,
): Promise<AdminMemberWithGrants[]> {
  const raw = query.trim();
  const cleanHandle = raw.replace(/^@+/, "");
  const matchedUsers = raw
    ? await db
        .select({
          id: users.id,
          email: users.email,
          handle: users.handle,
          displayName: users.displayName,
          isAmbassador: users.isAmbassador,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(
          or(
            ilike(users.email, `%${raw}%`),
            ilike(users.handle, `%${cleanHandle}%`),
            ilike(users.displayName, `%${raw}%`),
          ),
        )
        .orderBy(desc(users.createdAt))
        .limit(limit)
    : await db
        .select({
          id: users.id,
          email: users.email,
          handle: users.handle,
          displayName: users.displayName,
          isAmbassador: users.isAmbassador,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(limit);

  if (matchedUsers.length === 0) return [];
  const userIds = matchedUsers.map((u) => u.id);

  const [allGrants, activeSubs] = await Promise.all([
    db
      .select({
        id: entitlementGrants.id,
        userId: entitlementGrants.userId,
        sourceKind: entitlementGrants.sourceKind,
        daysGranted: entitlementGrants.daysGranted,
        startsAt: entitlementGrants.startsAt,
        endsAt: entitlementGrants.endsAt,
        revokedAt: entitlementGrants.revokedAt,
        revokeReason: entitlementGrants.revokeReason,
        note: entitlementGrants.note,
        createdAt: entitlementGrants.createdAt,
      })
      .from(entitlementGrants)
      .where(inArray(entitlementGrants.userId, userIds))
      .orderBy(desc(entitlementGrants.endsAt), desc(entitlementGrants.createdAt)),
    db
      .select({
        userId: subscriptions.userId,
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        graceUntil: subscriptions.graceUntil,
      })
      .from(subscriptions)
      .where(inArray(subscriptions.userId, userIds)),
  ]);

  const grantsByUser = new Map<string, AdminMemberGrantRow[]>();
  for (const g of allGrants) {
    const bucket = grantsByUser.get(g.userId) ?? [];
    bucket.push({
      id: g.id,
      sourceKind: g.sourceKind,
      daysGranted: g.daysGranted,
      startsAt: g.startsAt,
      endsAt: g.endsAt,
      revokedAt: g.revokedAt,
      revokeReason: g.revokeReason,
      note: g.note,
      createdAt: g.createdAt,
    });
    grantsByUser.set(g.userId, bucket);
  }

  const subByUser = new Map(activeSubs.map((s) => [s.userId, s]));
  const nowMs = now.getTime();

  return matchedUsers.map((u) => {
    const grants = grantsByUser.get(u.id) ?? [];
    const sub = subByUser.get(u.id);
    const activeGrants = grants.filter((g) => !g.revokedAt && g.endsAt.getTime() > nowMs);
    let bestMs: number | null = null;
    let activeSourceKind: string | null = null;

    for (const g of activeGrants) {
      const endMs = g.endsAt.getTime();
      if (bestMs === null || endMs > bestMs) {
        bestMs = endMs;
        activeSourceKind = g.sourceKind;
      }
    }
    if (sub && ["active", "trialing_card", "trialing_no_card"].includes(sub.status)) {
      const subMs = sub.currentPeriodEnd.getTime();
      if (subMs > nowMs && (bestMs === null || subMs > bestMs)) {
        bestMs = subMs;
        activeSourceKind = "subscription";
      }
    } else if (sub?.status === "past_due_grace" && sub.graceUntil) {
      const graceMs = sub.graceUntil.getTime();
      if (graceMs > nowMs && (bestMs === null || graceMs > bestMs)) {
        bestMs = graceMs;
        activeSourceKind = "subscription";
      }
    }

    return {
      ...u,
      accessUntil: bestMs !== null ? new Date(bestMs) : null,
      activeSourceKind,
      grants,
    };
  });
}

export type AdminGrantResult =
  | { ok: true; grantId: string; newAccessUntil: Date | null }
  | { ok: false; reason: "dias_invalidos" | "motivo_requerido" | "usuario_no_encontrado" };

/** Concede días manuales (`admin_grant`) desde la consola y registra la auditoría en la misma transacción. */
export async function adminGrantAccessDays(
  db: Db,
  input: {
    adminUserId: string | null;
    adminEmail: string;
    targetUserId: string;
    days: number;
    reason: string;
    now: Date;
    ipSubnetHash?: string | null;
  },
): Promise<AdminGrantResult> {
  const days = Math.trunc(input.days);
  if (!Number.isFinite(days) || days < 1 || days > 365) return { ok: false, reason: "dias_invalidos" };
  const cleanReason = input.reason.trim().replace(/\s+/g, " ").slice(0, 280);
  if (cleanReason.length < 3) return { ok: false, reason: "motivo_requerido" };

  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [target] = await t.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, input.targetUserId));
    if (!target) return { ok: false, reason: "usuario_no_encontrado" } as const;

    const grantId = await grantDays(t, {
      userId: target.id,
      sourceKind: "admin_grant",
      days,
      idempotencyKey: `admin:${randomUUID()}`,
      now: input.now,
      note: cleanReason,
    });
    const newAccessUntil = await accessUntil(t, target.id, input.now);

    await recordAdminAudit(t, {
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      action: "admin_grant_access",
      targetKey: target.id,
      payloadJson: { targetEmail: target.email, days, reason: cleanReason, grantId },
      ipSubnetHash: input.ipSubnetHash ?? null,
    });

    return { ok: true, grantId, newAccessUntil } as const;
  });
}

export type AdminRevokeResult =
  | { ok: true; userId: string; removedMs: number; newAccessUntil: Date | null }
  | { ok: false; reason: "motivo_requerido" | "no_encontrada_o_revocada" };

/** Revoca una concesión existente y recorre hacia atrás las concesiones encadenadas en la misma transacción. */
export async function adminRevokeGrant(
  db: Db,
  input: {
    adminUserId: string | null;
    adminEmail: string;
    grantId: string;
    reason: string;
    now: Date;
    ipSubnetHash?: string | null;
  },
): Promise<AdminRevokeResult> {
  const cleanReason = input.reason.trim().replace(/\s+/g, " ").slice(0, 280);
  if (cleanReason.length < 3) return { ok: false, reason: "motivo_requerido" };

  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const revoked = await revokeGrant(t, input.grantId, cleanReason, input.now);
    if (!revoked) return { ok: false, reason: "no_encontrada_o_revocada" } as const;

    const newAccessUntil = await accessUntil(t, revoked.userId, input.now);
    await recordAdminAudit(t, {
      actorUserId: input.adminUserId,
      actorEmail: input.adminEmail,
      action: "admin_revoke_grant",
      targetKey: input.grantId,
      payloadJson: { userId: revoked.userId, reason: cleanReason, removedMs: revoked.removedMs },
      ipSubnetHash: input.ipSubnetHash ?? null,
    });

    return { ok: true, userId: revoked.userId, removedMs: revoked.removedMs, newAccessUntil } as const;
  });
}
