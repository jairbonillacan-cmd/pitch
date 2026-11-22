import { createHmac, timingSafeEqual } from "node:crypto";
import {
  applyEmailUnsubscribe,
  authUser,
  claimEmail,
  eq,
  findFriendReferrerForUser,
  findModerationTargetAuthor,
  hasActivePaseTotal,
  listEmailSubscribers,
  listSettledPicksBetween,
  listWatchedGameIds,
  markEmail,
  releaseEmail,
  users,
  type Db,
  type ScheduledEmailKind,
} from "@pitchlab/db";
import { noreplySender, renderEmail, siteUrl, type EmailTemplateId } from "@pitchlab/emails";
import type { PlatformDataset, PlatformGame } from "@pitchlab/ui/types";
import { firstName, formatLongDate, formatOdds, formatPoints } from "./email-format";
import type { Mailer } from "./mailer";
import { buildServerRawPlatformDataset } from "./platform-data";
import { loadRankingRows } from "./ranking";
import { logSecurityEvent } from "./safe-logger";
import { isAdminEmail } from "./session-user";

export type UnsubscribeScope = "weekly_digest" | "monthly_record" | "all";

interface UnsubscribeTokenPayload {
  u: string;
  k: UnsubscribeScope;
  exp: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_SCOPES = new Set<UnsubscribeScope>(["weekly_digest", "monthly_record", "all"]);
const MONTH_NAMES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

function unsubscribeSecret(): string {
  const secret =
    process.env.UNSUBSCRIBE_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    "";
  return secret;
}

function hmacSign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function signUnsubscribeToken(
  userId: string,
  scope: UnsubscribeScope,
  now: Date = new Date(),
  ttlDays = 90,
): string | null {
  const secret = unsubscribeSecret();
  if (secret.length < 16 || !UUID_PATTERN.test(userId)) return null;
  const payload: UnsubscribeTokenPayload = {
    u: userId,
    k: scope,
    exp: Math.floor(now.getTime() / 1000) + ttlDays * 86_400,
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${hmacSign(encoded, secret)}`;
}

export function verifyUnsubscribeToken(
  token: string,
  now: Date = new Date(),
): { userId: string; scope: UnsubscribeScope } | null {
  const secret = unsubscribeSecret();
  if (secret.length < 16) return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot >= token.length - 1) return null;
  const encoded = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmacSign(encoded, secret);
  const sigBuf = Buffer.from(sig, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<UnsubscribeTokenPayload>;
    if (
      typeof parsed.u !== "string" ||
      !UUID_PATTERN.test(parsed.u) ||
      typeof parsed.k !== "string" ||
      !VALID_SCOPES.has(parsed.k as UnsubscribeScope) ||
      typeof parsed.exp !== "number" ||
      parsed.exp < Math.floor(now.getTime() / 1000)
    ) {
      return null;
    }
    return { userId: parsed.u, scope: parsed.k as UnsubscribeScope };
  } catch {
    return null;
  }
}

export function unsubscribeUrlFor(userId: string, scope: UnsubscribeScope, now: Date = new Date()): string {
  const base = siteUrl();
  const token = signUnsubscribeToken(userId, scope, now);
  if (!token) return `${base}/app/account`;
  return `${base}/api/me/email-preferences/unsubscribe?token=${encodeURIComponent(token)}`;
}

async function sendClaimedLifecycleEmail<T extends EmailTemplateId>(
  db: Db,
  mailer: Mailer,
  input: {
    userId: string;
    to: string;
    kind: ScheduledEmailKind;
    cycleKey: string;
    templateId: T;
    now: Date;
    buildProps: () => Parameters<typeof renderEmail<T>>[1];
  },
): Promise<"sent" | "duplicate" | "error"> {
  const claimId = await claimEmail(db, {
    userId: input.userId,
    kind: input.kind,
    cycleKey: input.cycleKey,
    sendAt: input.now,
    status: "pending",
  });
  if (!claimId) return "duplicate";

  try {
    const rendered = await renderEmail(input.templateId, input.buildProps());
    const sent = await mailer.send({
      to: input.to,
      from: noreplySender(),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: `${input.kind}:${input.userId}:${input.cycleKey}`,
      tags: [{ name: "tipo", value: input.kind }],
    });
    await markEmail(db, claimId, { status: "sent", providerId: sent.id });
    return "sent";
  } catch (error) {
    await releaseEmail(db, claimId);
    logSecurityEvent("error", "lifecycle_email_send_failed", {
      kind: input.kind,
      cycleKey: input.cycleKey,
      error,
    });
    return "error";
  }
}

export async function sendReferralSignedUpEmail(
  db: Db,
  mailer: Mailer,
  input: { referredUserId: string; friendName: string; status: "trial" | "signed_up"; now?: Date },
): Promise<"sent" | "duplicate" | "skipped" | "error"> {
  const referrer = await findFriendReferrerForUser(db, input.referredUserId);
  if (!referrer?.referrerEmail) return "skipped";
  const now = input.now ?? new Date();
  return sendClaimedLifecycleEmail(db, mailer, {
    userId: referrer.referrerUserId,
    to: referrer.referrerEmail,
    kind: "referral_signed_up",
    cycleKey: `ref:${input.referredUserId}`,
    templateId: "referral-signed-up",
    now,
    buildProps: () => ({
      name: firstName(referrer.referrerDisplayName),
      friendName: firstName(input.friendName) ?? input.friendName.trim(),
      status: input.status,
      referralsUrl: `${siteUrl()}/app/account`,
    }),
  });
}

export async function sendTipsterActivatedEmail(
  db: Db,
  mailer: Mailer,
  input: {
    userId: string;
    email: string;
    displayName: string;
    promoCode: string;
    trialDays: number;
    commissionPct: number;
    now?: Date;
  },
): Promise<"sent" | "duplicate" | "error"> {
  const now = input.now ?? new Date();
  return sendClaimedLifecycleEmail(db, mailer, {
    userId: input.userId,
    to: input.email,
    kind: "tipster_activated",
    cycleKey: `tipster:${input.promoCode.toUpperCase()}`,
    templateId: "tipster-activated",
    now,
    buildProps: () => ({
      name: firstName(input.displayName),
      promoCode: input.promoCode.toUpperCase(),
      trialDays: input.trialDays,
      commissionPct: input.commissionPct,
      shareUrl: `${siteUrl()}/i/${input.promoCode.toUpperCase()}`,
      dashboardUrl: `${siteUrl()}/app`,
    }),
  });
}

export async function sendContentRemovedEmail(
  db: Db,
  mailer: Mailer,
  input: { targetType: "post" | "comment"; targetId: string; reason?: string; now?: Date },
): Promise<"sent" | "duplicate" | "skipped" | "error"> {
  const author = await findModerationTargetAuthor(db, input.targetType, input.targetId);
  if (!author?.email) return "skipped";
  const now = input.now ?? new Date();
  return sendClaimedLifecycleEmail(db, mailer, {
    userId: author.userId,
    to: author.email,
    kind: "content_removed",
    cycleKey: `mod:${input.targetType}:${input.targetId}`,
    templateId: "content-removed",
    now,
    buildProps: () => ({
      name: firstName(author.displayName),
      removedOn: formatLongDate(now, true),
      reason:
        input.reason?.trim() ||
        "Incumplió las reglas de la comunidad de PitchLab y fue ocultado tras revisión de moderación.",
      rulesUrl: `${siteUrl()}/legal/terminos#comunidad`,
    }),
  });
}

function isoWeekKey(date: Date): string {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((copy.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${copy.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function topPickForGame(game: PlatformGame) {
  if (!game.picks.length) return null;
  return [...game.picks].sort((a, b) => b.p - a.p)[0] ?? null;
}

export interface DigestRunSummary {
  cycleKey: string;
  checked: number;
  sent: number;
  skipped: number;
}

async function hasActiveDigestAccess(db: Db, userId: string, email: string, now: Date): Promise<boolean> {
  if (await hasActivePaseTotal(db, userId, now)) return true;
  if (!isAdminEmail(email)) return false;
  const [row] = await db
    .select({ emailVerified: authUser.emailVerified })
    .from(users)
    .innerJoin(authUser, eq(authUser.id, users.authUserId))
    .where(eq(users.id, userId));
  return Boolean(row?.emailVerified);
}

export async function runWeeklyDigestJob(
  db: Db,
  mailer: Mailer,
  options?: { now?: Date; dataset?: PlatformDataset },
): Promise<DigestRunSummary> {
  const now = options?.now ?? new Date();
  const cycleKey = isoWeekKey(now);
  const horizonMs = now.getTime() + 7 * 86_400_000;
  const dataset = options?.dataset ?? buildServerRawPlatformDataset();
  const upcoming = dataset.games.filter((g) => {
    if (g.status !== "NS") return false;
    const ms = Date.parse(g.kickoffUtc);
    return Number.isFinite(ms) && ms > now.getTime() && ms <= horizonMs && topPickForGame(g) !== null;
  });

  const subscribers = await listEmailSubscribers(db, "weekly_digest");
  let sent = 0;
  let skipped = 0;

  if (upcoming.length === 0) {
    return { cycleKey, checked: subscribers.length, sent: 0, skipped: subscribers.length };
  }

  for (const sub of subscribers) {
    if (!(await hasActiveDigestAccess(db, sub.userId, sub.email, now))) {
      skipped += 1;
      continue;
    }

    const watched = new Set(await listWatchedGameIds(db, sub.userId));
    const favLeagues = new Set(sub.favoriteLeagues);
    const ranked = [...upcoming].sort((a, b) => {
      const aw = watched.has(a.id) ? 2 : favLeagues.has(a.league) ? 1 : 0;
      const bw = watched.has(b.id) ? 2 : favLeagues.has(b.league) ? 1 : 0;
      if (bw !== aw) return bw - aw;
      return (topPickForGame(b)?.p ?? 0) - (topPickForGame(a)?.p ?? 0);
    });
    const chosen = ranked.slice(0, 4);
    const items = chosen
      .map((game) => {
        const pick = topPickForGame(game);
        if (!pick || !Number.isFinite(pick.fairDecimal) || pick.fairDecimal <= 1) return null;
        return {
          match: `${game.home.shortName || game.home.name} vs ${game.away.shortName || game.away.name}`,
          league: game.leagueLabel,
          kickoff: game.kickoffLocal || formatLongDate(new Date(game.kickoffUtc)),
          outcome: pick.label,
          probability: `${Math.round(pick.p * 100)} %`,
          fairOdds: formatOdds(pick.fairDecimal, sub.oddsFormat),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (items.length === 0) {
      skipped += 1;
      continue;
    }

    const res = await sendClaimedLifecycleEmail(db, mailer, {
      userId: sub.userId,
      to: sub.email,
      kind: "weekly_digest",
      cycleKey,
      templateId: "weekly-digest",
      now,
      buildProps: () => ({
        name: firstName(sub.displayName),
        weekLabel: `Semana del ${formatLongDate(now)}`,
        items,
        appUrl: `${siteUrl()}/app`,
        unsubscribeUrl: unsubscribeUrlFor(sub.userId, "weekly_digest", now),
      }),
    });
    if (res === "sent") sent += 1;
    else skipped += 1;
  }

  return { cycleKey, checked: subscribers.length, sent, skipped };
}

export function previousMexicoMonthWindow(now: Date): {
  monthKey: string;
  monthLabel: string;
  startUtc: Date;
  endUtc: Date;
} {
  const cdmxMs = now.getTime() - 6 * 3_600_000;
  const cdmx = new Date(cdmxMs);
  const currYear = cdmx.getUTCFullYear();
  const currMonth = cdmx.getUTCMonth();
  const prevMonth = currMonth === 0 ? 11 : currMonth - 1;
  const prevYear = currMonth === 0 ? currYear - 1 : currYear;
  const monthKey = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;
  const monthLabel = `${MONTH_NAMES_ES[prevMonth]} de ${prevYear}`;
  return {
    monthKey,
    monthLabel,
    startUtc: new Date(Date.UTC(prevYear, prevMonth, 1, 6, 0, 0)),
    endUtc: new Date(Date.UTC(currYear, currMonth, 1, 6, 0, 0)),
  };
}

function formatUnitsSigned(units: number): string {
  const rounded = Math.round(units * 10) / 10;
  if (Math.abs(rounded) < 0.05) return "0.0u";
  return rounded > 0 ? `+${rounded.toFixed(1)}u` : `−${Math.abs(rounded).toFixed(1)}u`;
}

export async function runMonthlyRecordJob(
  db: Db,
  mailer: Mailer,
  options?: { now?: Date },
): Promise<DigestRunSummary> {
  const now = options?.now ?? new Date();
  const win = previousMexicoMonthWindow(now);
  const subscribers = await listEmailSubscribers(db, "monthly_record");
  if (subscribers.length === 0) {
    return { cycleKey: win.monthKey, checked: 0, sent: 0, skipped: 0 };
  }

  const rankingRows = await loadRankingRows(db, now).catch(() => []);
  const orderedHandles = [...rankingRows]
    .sort((a, b) => b.windows["30d"].netUnits - a.windows["30d"].netUnits)
    .map((r) => r.handle);

  let sent = 0;
  let skipped = 0;

  for (const sub of subscribers) {
    const picks = await listSettledPicksBetween(db, sub.userId, win.startUtc, win.endUtc);
    if (picks.length === 0) {
      skipped += 1;
      continue;
    }

    let netUnits = 0;
    let wins = 0;
    let losses = 0;
    let voids = 0;
    const clvVals: number[] = [];
    const byLeague = new Map<string, { wins: number; losses: number; net: number }>();

    for (const p of picks) {
      let delta = 0;
      if (p.status === "won") {
        delta = p.units * (p.userDecimal - 1);
        wins += 1;
      } else if (p.status === "lost") {
        delta = -p.units;
        losses += 1;
      } else {
        voids += 1;
      }
      netUnits += delta;
      if (p.clvPct !== null && Number.isFinite(p.clvPct)) clvVals.push(p.clvPct);
      const entry = byLeague.get(p.leagueLabel) ?? { wins: 0, losses: 0, net: 0 };
      if (p.status === "won") entry.wins += 1;
      if (p.status === "lost") entry.losses += 1;
      entry.net += delta;
      byLeague.set(p.leagueLabel, entry);
    }

    const bestLeagueEntry = [...byLeague.entries()]
      .filter(([, v]) => v.wins + v.losses > 0)
      .sort((a, b) => b[1].net - a[1].net)[0];
    const decided = wins + losses;
    const hitsLabel =
      decided > 0
        ? `${wins} de ${decided}${voids > 0 ? ` (${voids} push)` : ""}`
        : `0 de 0 (${voids} push)`;
    const clvLabel =
      clvVals.length > 0
        ? formatPoints(clvVals.reduce((acc, v) => acc + v, 0) / clvVals.length)
        : "Sin cierre registrado";
    const rankIdx = sub.showInRanking && sub.handle ? orderedHandles.indexOf(sub.handle) : -1;
    const rankLabel = rankIdx >= 0 ? `#${rankIdx + 1}` : sub.showInRanking ? "Sin mínimo" : "Privado";

    const res = await sendClaimedLifecycleEmail(db, mailer, {
      userId: sub.userId,
      to: sub.email,
      kind: "monthly_record",
      cycleKey: win.monthKey,
      templateId: "monthly-record",
      now,
      buildProps: () => ({
        name: firstName(sub.displayName),
        monthLabel: win.monthLabel,
        balanceLabel: formatUnitsSigned(netUnits),
        balancePositive: netUnits >= 0,
        hitsLabel,
        clvLabel,
        rankLabel,
        ...(bestLeagueEntry
          ? {
              bestLeague: {
                name: bestLeagueEntry[0],
                record: `${bestLeagueEntry[1].wins}G-${bestLeagueEntry[1].losses}P`,
              },
            }
          : {}),
        journalUrl: `${siteUrl()}/app/lab`,
        settingsUrl: unsubscribeUrlFor(sub.userId, "monthly_record", now),
      }),
    });
    if (res === "sent") sent += 1;
    else skipped += 1;
  }

  return { cycleKey: win.monthKey, checked: subscribers.length, sent, skipped };
}

export async function processUnsubscribeToken(
  db: Db,
  token: string | null | undefined,
  now: Date = new Date(),
): Promise<{ ok: true; scope: UnsubscribeScope } | { ok: false }> {
  const trimmed = token?.trim() ?? "";
  if (!trimmed) return { ok: false };
  const verified = verifyUnsubscribeToken(trimmed, now);
  if (!verified) return { ok: false };
  await applyEmailUnsubscribe(db, verified.userId, verified.scope);
  return { ok: true, scope: verified.scope };
}
