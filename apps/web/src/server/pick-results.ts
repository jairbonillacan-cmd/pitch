import { parseStrictFiniteNumber } from "@pitchlab/contracts";
import {
  and,
  eq,
  getEmailPreferences,
  sealedPicks,
  userPreferences,
  users,
  type Db,
  type SealedParlayLegResult,
} from "@pitchlab/db";
import { renderEmail, siteUrl } from "@pitchlab/emails";
import { isCredibleClvPct, isParlayClvEntry } from "@pitchlab/ui/record-stats";
import { firstName, formatOdds, formatPoints } from "./email-format";
import type { Mailer } from "./mailer";
import { logSecurityEvent } from "./safe-logger";
import { sendPushToUsers } from "./web-push";

export type PickResult = "won" | "lost" | "void";
export type PickResultLabelEs = "Ganada" | "Perdida" | "Push";
export type SettledPick = typeof sealedPicks.$inferSelect;

export function formatPickResultLabelEs(result: PickResult): PickResultLabelEs {
  if (result === "won") return "Ganada";
  if (result === "lost") return "Perdida";
  return "Push";
}

function isValidPickResult(raw: string): raw is PickResult {
  return raw === "won" || raw === "lost" || raw === "void";
}

export async function settleSealedPick(
  db: Db,
  input: {
    userId: string;
    pickId: string;
    result: PickResult;
    clvPct?: number | null;
    closingDecimal?: number | null;
    parlayLegResults?: SealedParlayLegResult[] | null;
    isParlay?: boolean;
    now: Date;
  },
): Promise<SettledPick | null> {
  if (!isValidPickResult(input.result)) return null;
  const isParlay = isParlayClvEntry({
    isParlay: input.isParlay,
    pickId: input.pickId,
    parlayLegs: input.parlayLegResults,
  });
  const credibleClv =
    input.clvPct != null && isCredibleClvPct(input.clvPct, isParlay)
      ? Math.round(input.clvPct * 100) / 100
      : null;
  const validClosingDecimal =
    input.closingDecimal != null &&
    Number.isFinite(input.closingDecimal) &&
    input.closingDecimal >= 1.01 &&
    input.closingDecimal <= 9999
      ? input.closingDecimal
      : null;

  const [row] = await db
    .update(sealedPicks)
    .set({
      status: input.result,
      settledAt: input.now,
      ...(credibleClv !== null ? { clvPct: credibleClv.toFixed(2) } : {}),
      ...(validClosingDecimal !== null
        ? { closingDecimal: validClosingDecimal.toFixed(3) }
        : {}),
      ...(input.parlayLegResults !== undefined ? { parlayLegResults: input.parlayLegResults } : {}),
    })
    .where(
      and(
        eq(sealedPicks.userId, input.userId),
        eq(sealedPicks.pickId, input.pickId),
        eq(sealedPicks.status, "pending"),
      ),
    )
    .returning();
  return row ?? null;
}

export type PickNotice = "enviado" | "sin_aviso" | "sin_correo";

export async function notifyPickGraded(db: Db, mailer: Mailer, pick: SettledPick): Promise<PickNotice> {
  if (!isValidPickResult(pick.status)) return "sin_aviso";
  const { pickResults } = await getEmailPreferences(db, pick.userId);
  if (!pickResults) return "sin_aviso";

  const [user] = await db
    .select({ email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, pick.userId));
  if (!user) return "sin_correo";
  const [prefs] = await db
    .select({ oddsFormat: userPreferences.oddsFormat })
    .from(userPreferences)
    .where(eq(userPreferences.userId, pick.userId));
  const format = prefs?.oddsFormat === "decimal" ? "decimal" : "american";
  const userDecimal = parseStrictFiniteNumber(pick.userDecimal) ?? 1.02;
  const fairDecimal = parseStrictFiniteNumber(pick.fairDecimal) ?? 1.02;
  const parsedClv = pick.clvPct != null ? parseStrictFiniteNumber(pick.clvPct) : null;
  const isParlay = isParlayClvEntry({
    pickKind: pick.pickKind,
    origin: pick.origin,
    parlayLegs: pick.parlayLegs,
    pickId: pick.pickId,
  });
  const clvPct = isCredibleClvPct(parsedClv, isParlay) ? parsedClv : null;

  const { subject, html, text } = await renderEmail("pick-graded", {
    name: firstName(user.displayName),
    result: pick.status,
    matchLabel: pick.matchLabel,
    leagueLabel: pick.leagueLabel,
    pickLabel: pick.pickLabel,
    userOddsLabel: formatOdds(userDecimal, format),
    fairOddsLabel: formatOdds(fairDecimal, format),
    ...(clvPct !== null ? { clvLabel: formatPoints(clvPct) } : {}),
    journalUrl: `${siteUrl()}/app/lab`,
    settingsUrl: `${siteUrl()}/app/account?tab=prefs`,
  });
  await mailer.send({
    to: user.email,
    subject,
    html,
    text,
    idempotencyKey: `pick-graded:${pick.id}`,
    tags: [{ name: "tipo", value: "pick_graded" }],
  });
  return "enviado";
}

export async function settleAndNotify(
  db: Db,
  mailer: Mailer,
  input: {
    userId: string;
    pickId: string;
    result: PickResult;
    clvPct?: number | null;
    closingDecimal?: number | null;
    parlayLegResults?: SealedParlayLegResult[] | null;
    isParlay?: boolean;
    now: Date;
  },
): Promise<{ settled: boolean; notice: PickNotice | "error" }> {
  const pick = await settleSealedPick(db, input);
  if (!pick) return { settled: false, notice: "sin_aviso" };

  const pushTitle =
    pick.status === "won"
      ? "Pick ganado en tu récord"
      : pick.status === "lost"
        ? "Pick calificado como perdido"
        : "Pick calificado como nulo (push)";
  await sendPushToUsers(db, [pick.userId], "picks", {
    title: pushTitle,
    body: `${pick.pickLabel} · ${pick.matchLabel}`,
    url: "/app/lab",
    tag: `pick-${pick.id}`,
  }).catch(() => undefined);

  try {
    return { settled: true, notice: await notifyPickGraded(db, mailer, pick) };
  } catch (error) {
    logSecurityEvent("error", "pick_graded_email_failed", {
      pickId: pick.id,
      userId: pick.userId,
      error,
    });
    return { settled: true, notice: "error" };
  }
}

export interface DailySettledPickItemV6 {
  readonly id: string;
  readonly pickId: string;
  readonly gameId: string;
  readonly leagueLabel: string;
  readonly matchLabel: string;
  readonly pickLabel: string;
  readonly origin: string;
  readonly pickKind: "single" | "parlay";
  readonly status: PickResult;
  readonly statusLabelEs: PickResultLabelEs;
  readonly userDecimal: number;
  readonly fairDecimal: number;
  readonly closingDecimal: number | null;
  readonly clvPct: number | null;
  readonly sealedAtUtc: string;
  readonly kickoffAtUtc: string;
  readonly settledAtUtc: string | null;
}

export interface DailySettledResultsSummaryV6 {
  readonly settledCount: number;
  readonly wonCount: number;
  readonly lostCount: number;
  readonly voidCount: number;
  readonly hitRatePct: number | null;
  readonly credibleClvCount: number;
  readonly avgCredibleClvPct: number | null;
  readonly items: readonly DailySettledPickItemV6[];
}

export function summarizeDailySettledResultsV6(
  picks: readonly SettledPick[],
): DailySettledResultsSummaryV6 {
  const items: DailySettledPickItemV6[] = [];
  let wonCount = 0;
  let lostCount = 0;
  let voidCount = 0;
  let clvSum = 0;
  let credibleClvCount = 0;

  for (const row of picks) {
    if (!isValidPickResult(row.status)) continue;
    const isParlay = isParlayClvEntry({
      pickKind: row.pickKind,
      origin: row.origin,
      parlayLegs: row.parlayLegs,
      pickId: row.pickId,
    });
    const rawClv = row.clvPct != null ? parseStrictFiniteNumber(row.clvPct) : null;
    const credibleClv = isCredibleClvPct(rawClv, isParlay) ? rawClv : null;
    if (credibleClv !== null) {
      clvSum += credibleClv;
      credibleClvCount += 1;
    }
    if (row.status === "won") wonCount += 1;
    else if (row.status === "lost") lostCount += 1;
    else voidCount += 1;

    items.push({
      id: row.id,
      pickId: row.pickId,
      gameId: row.gameId,
      leagueLabel: row.leagueLabel,
      matchLabel: row.matchLabel,
      pickLabel: row.pickLabel,
      origin: row.origin,
      pickKind: row.pickKind === "parlay" ? "parlay" : "single",
      status: row.status,
      statusLabelEs: formatPickResultLabelEs(row.status),
      userDecimal: parseStrictFiniteNumber(row.userDecimal) ?? 0,
      fairDecimal: parseStrictFiniteNumber(row.fairDecimal) ?? 0,
      closingDecimal: row.closingDecimal != null ? parseStrictFiniteNumber(row.closingDecimal) : null,
      clvPct: credibleClv,
      sealedAtUtc: row.sealedAt.toISOString(),
      kickoffAtUtc: row.kickoffAt.toISOString(),
      settledAtUtc: row.settledAt ? row.settledAt.toISOString() : null,
    });
  }

  const decisive = wonCount + lostCount;
  return {
    settledCount: items.length,
    wonCount,
    lostCount,
    voidCount,
    hitRatePct: decisive > 0 ? Math.round((wonCount / decisive) * 10_000) / 100 : null,
    credibleClvCount,
    avgCredibleClvPct:
      credibleClvCount > 0 ? Math.round((clvSum / credibleClvCount) * 100) / 100 : null,
    items,
  };
}
