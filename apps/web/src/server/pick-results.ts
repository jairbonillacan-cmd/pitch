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
import { firstName, formatOdds, formatPoints } from "./email-format";
import type { Mailer } from "./mailer";
import { logSecurityEvent } from "./safe-logger";
import { sendPushToUsers } from "./web-push";

export type PickResult = "won" | "lost" | "void";
export type SettledPick = typeof sealedPicks.$inferSelect;

export async function settleSealedPick(
  db: Db,
  input: {
    userId: string;
    pickId: string;
    result: PickResult;
    clvPct?: number | null;
    closingDecimal?: number | null;
    parlayLegResults?: SealedParlayLegResult[] | null;
    now: Date;
  },
): Promise<SettledPick | null> {
  const [row] = await db
    .update(sealedPicks)
    .set({
      status: input.result,
      settledAt: input.now,
      ...(input.clvPct != null && Number.isFinite(input.clvPct) ? { clvPct: input.clvPct.toFixed(2) } : {}),
      ...(input.closingDecimal != null && Number.isFinite(input.closingDecimal)
        ? { closingDecimal: input.closingDecimal.toFixed(3) }
        : {}),
      ...(input.parlayLegResults !== undefined ? { parlayLegResults: input.parlayLegResults } : {}),
    })
    .where(and(eq(sealedPicks.userId, input.userId), eq(sealedPicks.pickId, input.pickId), eq(sealedPicks.status, "pending")))
    .returning();
  return row ?? null;
}

export type PickNotice = "enviado" | "sin_aviso" | "sin_correo";

export async function notifyPickGraded(db: Db, mailer: Mailer, pick: SettledPick): Promise<PickNotice> {
  if (pick.status !== "won" && pick.status !== "lost" && pick.status !== "void") return "sin_aviso";
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
  const clvPct = pick.clvPct != null ? parseStrictFiniteNumber(pick.clvPct) : null;

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
    now: Date;
  },
): Promise<{ settled: boolean; notice: PickNotice | "error" }> {
  const pick = await settleSealedPick(db, input);
  if (!pick) return { settled: false, notice: "sin_aviso" };

  const pushTitle =
    pick.status === "won"
      ? "Pick ganado en tu bitácora"
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
