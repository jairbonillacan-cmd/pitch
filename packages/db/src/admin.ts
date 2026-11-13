/**
 * Consultas de la consola del fundador (/app/admin) y de banderas operativas.
 */
import { and, count, eq, sql } from "drizzle-orm";
import type { Db } from "./billing";
import {
  adminAuditLogs,
  entitlementGrants,
  platformRuntimeFlags,
  referralGrants,
  socialModerationLogs,
  subscriptions,
  tipstarAttributions,
  tipstarCommissionLedger,
  tipstarProfiles,
  users,
} from "./schema";
import { checkHandleFormat, isHandleAvailable } from "./signup";

export const FLAG_MONTH1_NO_CARD = "month1_no_card_mode";
export const FLAG_TIPSTAR_PAYOUTS = "tipstar_payouts_enabled";
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

export async function isActiveTipstarUser(db: Db, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: tipstarProfiles.userId })
    .from(tipstarProfiles)
    .where(and(eq(tipstarProfiles.userId, userId), eq(tipstarProfiles.isActive, true)));
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
      .where(sql`${entitlementGrants.sourceKind} IN ('trial_m1_nocard', 'trial_tipstar_5d')`),
    db.select({ n: count() }).from(referralGrants).where(eq(referralGrants.status, "rewarded_bilateral")),
    db
      .select({ n: sql<number>`coalesce(sum(${tipstarCommissionLedger.commissionCentavosMxn}), 0)` })
      .from(tipstarCommissionLedger)
      .where(sql`${tipstarCommissionLedger.status} IN ('pending_clearance', 'payable', 'processing_payout')`),
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

export interface TipstarCodeRow {
  code: string;
  handle: string;
  name: string;
  freeDays: number;
  commissionPct: number;
  activeReferrals: number;
  pendingCommissionCentavos: number;
}

export async function listTipstarCodes(db: Db): Promise<TipstarCodeRow[]> {
  const profiles = await db.select().from(tipstarProfiles).where(eq(tipstarProfiles.isActive, true));
  const rows: TipstarCodeRow[] = [];
  for (const p of profiles) {
    const [[a], [c]] = await Promise.all([
      db
        .select({ n: count() })
        .from(tipstarAttributions)
        .where(and(eq(tipstarAttributions.tipstarUserId, p.userId), eq(tipstarAttributions.status, "active_paying"))),
      db
        .select({ n: sql<number>`coalesce(sum(${tipstarCommissionLedger.commissionCentavosMxn}), 0)` })
        .from(tipstarCommissionLedger)
        .where(
          and(
            eq(tipstarCommissionLedger.tipstarUserId, p.userId),
            sql`${tipstarCommissionLedger.status} IN ('pending_clearance', 'payable', 'processing_payout')`,
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

export type CreateTipstarResult = { ok: true } | { ok: false; reason: "codigo_invalido" | "handle_invalido" | "duplicado" };

/** Da de alta a un tipstar: liga (o crea) su usuario por correo y registra su código. */
export async function createTipstarCode(
  db: Db,
  input: { email: string; handle: string; displayName: string; promoCode: string; specialty: string },
): Promise<CreateTipstarResult> {
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
    .insert(tipstarProfiles)
    .values({
      userId: user!.id,
      handle,
      displayName: input.displayName.trim() || `@${handle}`,
      specialty: input.specialty.trim() || "Multideporte",
      promoCode: code,
      defaultWeeklySlug: `${handle.replace(/_/g, "-")}-sem`,
    })
    .onConflictDoNothing()
    .returning({ id: tipstarProfiles.userId });
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
