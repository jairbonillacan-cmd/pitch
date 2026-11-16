/**
 * Embudo mínimo propio (privacidad primero, solo con consentimiento `analyticsConsent`).
 */
import { createHash } from "node:crypto";
import { countDistinct, gte } from "drizzle-orm";
import type { Db } from "./billing";
import { funnelEvents } from "./schema";

export const FUNNEL_STAGE_NAMES = [
  "landing",
  "signup_step1",
  "signup_step2",
  "first_sealed_pick",
  "spei_transfer",
  "coupon_redeemed",
] as const;

export type FunnelStageName = (typeof FUNNEL_STAGE_NAMES)[number];

export const FUNNEL_STAGE_ORDER: Readonly<Record<FunnelStageName, number>> = {
  landing: 1,
  signup_step1: 2,
  signup_step2: 3,
  first_sealed_pick: 4,
  spei_transfer: 5,
  coupon_redeemed: 6,
};

export const FUNNEL_STAGE_LABELS: Readonly<Record<FunnelStageName, string>> = {
  landing: "Visita a landing",
  signup_step1: "Inicio paso 1 (cuenta)",
  signup_step2: "Completa paso 2 (perfil)",
  first_sealed_pick: "Primer pick sellado",
  spei_transfer: "Solicitud SPEI",
  coupon_redeemed: "Cupón canjeado",
};

export function isFunnelStageName(raw: unknown): raw is FunnelStageName {
  return typeof raw === "string" && (FUNNEL_STAGE_NAMES as readonly string[]).includes(raw);
}

/** Deriva un identificador anónimo estable por sesión o usuario sin guardar PII cruda. */
export function sessionHashFromRaw(raw: string): string {
  return createHash("sha256").update(`pl-funnel:${raw.trim()}`).digest("hex").slice(0, 32);
}

export async function recordFunnelEvent(
  db: Db,
  input: {
    eventName: FunnelStageName;
    sessionKey: string;
    userId?: string | null;
    sourcePath?: string | null;
    meta?: Record<string, string | number | boolean> | null;
    now?: Date;
  },
): Promise<boolean> {
  const sessionHash = sessionHashFromRaw(input.sessionKey);
  const now = input.now ?? new Date();
  const inserted = await db
    .insert(funnelEvents)
    .values({
      eventName: input.eventName,
      stageOrder: FUNNEL_STAGE_ORDER[input.eventName],
      sessionHash,
      userId: input.userId ?? null,
      sourcePath: input.sourcePath ? input.sourcePath.slice(0, 120) : null,
      meta: input.meta ?? null,
      createdAt: now,
    })
    .onConflictDoNothing({ target: [funnelEvents.sessionHash, funnelEvents.eventName] })
    .returning({ id: funnelEvents.id });
  return inserted.length > 0;
}

export interface AdminFunnelStageSummary {
  stage: FunnelStageName;
  order: number;
  label: string;
  count30d: number;
  conversionFromPrevPct: number | null;
  conversionFromLandingPct: number | null;
}

export interface AdminFunnelSummary {
  windowDays: number;
  generatedAtIso: string;
  stages: AdminFunnelStageSummary[];
}

export async function getAdminFunnelSummary(
  db: Db,
  now = new Date(),
  windowDays = 30,
): Promise<AdminFunnelSummary> {
  const since = new Date(now.getTime() - Math.max(1, windowDays) * 86_400_000);
  const rows = await db
    .select({
      eventName: funnelEvents.eventName,
      sessions: countDistinct(funnelEvents.sessionHash),
    })
    .from(funnelEvents)
    .where(gte(funnelEvents.createdAt, since))
    .groupBy(funnelEvents.eventName);

  const byStage = new Map<string, number>();
  for (const r of rows) {
    byStage.set(r.eventName, Number(r.sessions));
  }

  const landingCount = byStage.get("landing") ?? 0;
  let prevCount: number | null = null;
  const stages: AdminFunnelStageSummary[] = FUNNEL_STAGE_NAMES.map((stage) => {
    const c = byStage.get(stage) ?? 0;
    const conversionFromPrevPct =
      prevCount !== null && prevCount > 0 ? Math.round((c / prevCount) * 1000) / 10 : null;
    const conversionFromLandingPct =
      landingCount > 0 ? Math.round((c / landingCount) * 1000) / 10 : null;
    prevCount = c;
    return {
      stage,
      order: FUNNEL_STAGE_ORDER[stage],
      label: FUNNEL_STAGE_LABELS[stage],
      count30d: c,
      conversionFromPrevPct,
      conversionFromLandingPct,
    };
  });

  return {
    windowDays,
    generatedAtIso: now.toISOString(),
    stages,
  };
}
