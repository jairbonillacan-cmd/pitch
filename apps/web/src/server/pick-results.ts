/**
 * Liquidación de los picks de la bitácora y su aviso por correo.
 *
 * `settleAndNotify` es el punto de entrada para quien califique picks. Hoy nada lo llama: falta el
 * calificador que decide `won`, `lost` o `void` con el marcador final (ver `docs/architecture/CORREOS.md`).
 */
import { and, eq, getEmailPreferences, sealedPicks, userPreferences, users, type Db } from "@pitchlab/db";
import { renderEmail, siteUrl } from "@pitchlab/emails";
import { firstName, formatOdds, formatPoints } from "./email-format";
import type { Mailer } from "./mailer";

export type PickResult = "won" | "lost" | "void";
export type SettledPick = typeof sealedPicks.$inferSelect;

/**
 * Pasa un pick de `pending` al resultado. Devuelve null si no existe o ya estaba calificado:
 * un pick se califica una sola vez, así que tampoco se avisa dos veces.
 */
export async function settleSealedPick(
  db: Db,
  input: { userId: string; pickId: string; result: PickResult; clvPct?: number | null; now: Date },
): Promise<SettledPick | null> {
  const [row] = await db
    .update(sealedPicks)
    .set({
      status: input.result,
      settledAt: input.now,
      ...(input.clvPct != null ? { clvPct: input.clvPct.toFixed(2) } : {}),
    })
    .where(and(eq(sealedPicks.userId, input.userId), eq(sealedPicks.pickId, input.pickId), eq(sealedPicks.status, "pending")))
    .returning();
  return row ?? null;
}

export type PickNotice = "enviado" | "sin_aviso" | "sin_correo";

/** Manda el aviso de un pick ya calificado, solo si la persona activó «avisarme». */
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

  const { subject, html, text } = await renderEmail("pick-graded", {
    name: firstName(user.displayName),
    result: pick.status,
    matchLabel: pick.matchLabel,
    leagueLabel: pick.leagueLabel,
    pickLabel: pick.pickLabel,
    userOddsLabel: formatOdds(Number(pick.userDecimal), format),
    fairOddsLabel: formatOdds(Number(pick.fairDecimal), format),
    ...(pick.clvPct != null ? { clvLabel: formatPoints(Number(pick.clvPct)) } : {}),
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

/** Califica un pick y, si la persona lo pidió, le avisa. El correo nunca revierte la calificación. */
export async function settleAndNotify(
  db: Db,
  mailer: Mailer,
  input: { userId: string; pickId: string; result: PickResult; clvPct?: number | null; now: Date },
): Promise<{ settled: boolean; notice: PickNotice | "error" }> {
  const pick = await settleSealedPick(db, input);
  if (!pick) return { settled: false, notice: "sin_aviso" };
  try {
    return { settled: true, notice: await notifyPickGraded(db, mailer, pick) };
  } catch (error) {
    console.error("[correo] no se pudo avisar del pick calificado:", error);
    return { settled: true, notice: "error" };
  }
}
