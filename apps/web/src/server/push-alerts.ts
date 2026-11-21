import { createHash } from "node:crypto";
import {
  canonicalGameHref,
  type LiveMatchDetail,
  type LiveScoreboard,
} from "@pitchlab/contracts";
import {
  and,
  authUser,
  claimLiveCacheSlotOnce,
  desc,
  eq,
  hasActivePaseTotal,
  inArray,
  listLiveGameWatchers,
  listPushAlertRecipients,
  sealedPicks,
  users,
  type Db,
} from "@pitchlab/db";
import type { PlatformDataset, PlatformGame } from "@pitchlab/ui/types";
import { getLiveScoreboard, type LiveDeps } from "./live";
import {
  loadUserLiveTrackedPicks,
  type LivePickMilestoneKind,
  type LiveTrackedPickItem,
} from "./live-pick-tracker";
import { buildServerRawPlatformDataset } from "./platform-data";
import { isAdminEmail } from "./session-user";
import {
  isWebPushConfigured,
  sendPushToUsers,
  type WebPushMessagePayload,
} from "./web-push";

export type { LivePickMilestoneKind };

const PREMATCH_MIN_MS = 45 * 60_000;
const PREMATCH_MAX_MS = 75 * 60_000;
const LINE_MOVE_MIN_RATIO = 0.05;
const DEDUPE_TTL_MS = 6 * 3_600_000;
const LIVE_PICK_DEDUPE_TTL_MS = 24 * 3_600_000;
const MAX_MILESTONE_USERS = 40;
const MILESTONE_HASH_LENGTH = 12;

export interface DetectedLineMoveAlert {
  game: PlatformGame;
  label: string;
  selection: string;
  openDecimal: number;
  currentDecimal: number;
  shiftPct: number;
  bookLabel: string;
  edgePts: number | null;
}

export interface PushAlertsRunReport {
  configured: boolean;
  prematchGamesChecked: number;
  prematchPushesSent: number;
  lineMovesDetected: number;
  lineMovePushesSent: number;
  prunedSubscriptions: number;
}

export interface LivePickMilestonePushReport {
  readonly configured: boolean;
  readonly usersChecked: number;
  readonly picksEvaluated: number;
  readonly milestonesDetected: number;
  readonly pushesSent: number;
  readonly duplicatesSkipped: number;
  readonly prunedSubscriptions: number;
}

export interface DispatchLivePickMilestonePushesOptions {
  readonly now?: Date;
  readonly userIds?: readonly string[];
  readonly liveDeps?: LiveDeps;
  readonly scoreboard?: LiveScoreboard;
  readonly matchDetails?:
    | ReadonlyMap<string, LiveMatchDetail>
    | Readonly<Record<string, LiveMatchDetail>>;
  readonly loadMatchDetail?: (gameId: string) => Promise<LiveMatchDetail | null>;
  readonly dataset?: PlatformDataset | null;
  readonly fetchImpl?: typeof fetch;
  readonly sendPushImpl?: typeof sendPushToUsers;
  readonly forceConfiguredCheck?: boolean;
  readonly maxUsers?: number;
}

export function buildLivePickMilestoneHash(
  pickId: string,
  milestone: LivePickMilestoneKind,
  valueKey: string,
): string {
  const canonical = `${pickId.trim()}|${milestone}|${valueKey.trim()}`;
  return createHash("sha256")
    .update(canonical)
    .digest("hex")
    .slice(0, MILESTONE_HASH_LENGTH);
}

export function detectSignificantLineMoves(
  dataset: PlatformDataset,
  nowMs: number = Date.now(),
  minShiftRatio: number = LINE_MOVE_MIN_RATIO,
): DetectedLineMoveAlert[] {
  const alerts: DetectedLineMoveAlert[] = [];
  const horizonMs = nowMs + 48 * 3_600_000;

  for (const game of dataset.games) {
    if (game.status !== "NS") continue;
    const kickoffMs = Date.parse(game.kickoffUtc);
    if (!Number.isFinite(kickoffMs) || kickoffMs <= nowMs || kickoffMs > horizonMs) continue;

    let bestForGame: DetectedLineMoveAlert | null = null;
    for (const row of game.markets) {
      if (
        typeof row.openDecimal !== "number" ||
        typeof row.currentDecimal !== "number" ||
        !(row.openDecimal > 1.01) ||
        !(row.currentDecimal > 1.01)
      ) {
        continue;
      }
      const openProb = 1 / row.openDecimal;
      const currentProb = 1 / row.currentDecimal;
      const relativeShift = Math.abs(row.currentDecimal - row.openDecimal) / row.openDecimal;
      const probShift = Math.abs(currentProb - openProb);
      if (relativeShift < minShiftRatio && probShift < minShiftRatio) continue;
      const shiftPct = Math.round(relativeShift * 1000) / 10;
      const edgePts =
        typeof row.edgePts === "number"
          ? row.edgePts
          : Math.round((row.p - 1 / row.currentDecimal) * 1000) / 10;
      if (edgePts < 1.5 && row.movementDirection !== "shortening") continue;

      const candidate: DetectedLineMoveAlert = {
        game,
        label: row.label,
        selection: `${row.market}:${row.selection}`,
        openDecimal: row.openDecimal,
        currentDecimal: row.currentDecimal,
        shiftPct,
        bookLabel: row.quoteBookLabel ?? row.bookQuotes?.[0]?.bookLabel ?? "Mercado",
        edgePts,
      };
      if (!bestForGame || candidate.shiftPct > bestForGame.shiftPct) {
        bestForGame = candidate;
      }
    }
    if (bestForGame) alerts.push(bestForGame);
  }

  return alerts.sort((a, b) => b.shiftPct - a.shiftPct).slice(0, 12);
}

export function findPreMatchPushGames(
  dataset: PlatformDataset,
  nowMs: number = Date.now(),
): PlatformGame[] {
  return dataset.games.filter((game) => {
    if (game.status !== "NS") return false;
    const kickoffMs = Date.parse(game.kickoffUtc);
    if (!Number.isFinite(kickoffMs)) return false;
    const delta = kickoffMs - nowMs;
    return delta >= PREMATCH_MIN_MS && delta <= PREMATCH_MAX_MS;
  });
}

async function claimAlertOnce(db: Db, cacheKey: string, now: Date): Promise<boolean> {
  try {
    return await claimLiveCacheSlotOnce(
      db,
      cacheKey,
      { sentAt: now.toISOString() },
      now,
      DEDUPE_TTL_MS,
    );
  } catch (err) {
    void err;
    return true;
  }
}

async function claimLivePickMilestoneOnce(
  db: Db,
  cacheKey: string,
  meta: {
    readonly sentAt: string;
    readonly pickId: string;
    readonly milestone: LivePickMilestoneKind;
    readonly hash: string;
  },
  now: Date,
): Promise<boolean> {
  return claimLiveCacheSlotOnce(db, cacheKey, meta, now, LIVE_PICK_DEDUPE_TTL_MS);
}

function sanitizeCacheSegment(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_");
  return cleaned.slice(0, 64) || "user";
}

function buildMilestonePushPayload(
  item: LiveTrackedPickItem,
  milestone: LivePickMilestoneKind,
  hash: string,
): WebPushMessagePayload {
  const baseHref = (item.href.split("#")[0] ?? "").trim() || "/app/historial";
  const url = `${baseHref}#pick-${hash}`;
  const tag = `live-pick-${hash}`;

  if (milestone === "hit_locked") {
    return {
      title: `Pick asegurado · ${item.matchLabel}`,
      body: `${item.pickLabel} superó la línea (${item.actualValue}/${item.targetLine} ${item.unitLabel}).`,
      url,
      tag,
    };
  }
  if (milestone === "half_way") {
    return {
      title: `A mitad de camino · ${item.matchLabel}`,
      body: `${item.pickLabel}: ${item.actualValue}/${item.targetLine} ${item.unitLabel} (proy. ${item.projectedFinal}).`,
      url,
      tag,
    };
  }
  if (milestone === "starter_on_bench") {
    return {
      title: `Alerta de alineación · ${item.matchLabel}`,
      body: item.starterAlertDetail ?? `${item.pickLabel}: jugador figura en banca.`,
      url,
      tag,
    };
  }
  const suffix = item.asianLabel ? ` · ${item.asianLabel}` : "";
  return {
    title: `Pick cerrado · ${item.matchLabel}`,
    body: `${item.pickLabel} finalizó (${item.actualValue}/${item.targetLine} ${item.unitLabel}${suffix}).`,
    url,
    tag,
  };
}

async function hasActivePushAlertAccess(
  db: Db,
  userId: string,
  now: Date,
  cache: Map<string, boolean>,
): Promise<boolean> {
  const cached = cache.get(userId);
  if (cached !== undefined) return cached;
  let allowed = await hasActivePaseTotal(db, userId, now);
  if (!allowed) {
    const [row] = await db
      .select({ email: users.email, emailVerified: authUser.emailVerified })
      .from(users)
      .innerJoin(authUser, eq(authUser.id, users.authUserId))
      .where(eq(users.id, userId));
    allowed = Boolean(row?.emailVerified && isAdminEmail(row.email));
  }
  cache.set(userId, allowed);
  return allowed;
}

async function filterActivePaseUserIds(
  db: Db,
  userIds: readonly string[],
  now: Date,
  cache: Map<string, boolean>,
): Promise<string[]> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const allowed: string[] = [];
  for (const userId of unique) {
    if (await hasActivePushAlertAccess(db, userId, now, cache)) {
      allowed.push(userId);
    }
  }
  return allowed;
}

export async function dispatchLivePickMilestonePushes(
  db: Db,
  opts: DispatchLivePickMilestonePushesOptions = {},
): Promise<LivePickMilestonePushReport> {
  const now = opts.now ?? new Date();
  const configured = opts.forceConfiguredCheck ?? isWebPushConfigured();
  if (!configured) {
    return {
      configured: false,
      usersChecked: 0,
      picksEvaluated: 0,
      milestonesDetected: 0,
      pushesSent: 0,
      duplicatesSkipped: 0,
      prunedSubscriptions: 0,
    };
  }

  const maxUsers =
    typeof opts.maxUsers === "number" && Number.isFinite(opts.maxUsers)
      ? Math.max(1, Math.min(MAX_MILESTONE_USERS, Math.trunc(opts.maxUsers)))
      : MAX_MILESTONE_USERS;

  let candidateUserIds: string[];
  if (opts.userIds) {
    candidateUserIds = Array.from(
      new Set(opts.userIds.map((id) => id.trim()).filter((id) => id.length > 0)),
    ).slice(0, maxUsers);
  } else {
    const liveRecipients = await listPushAlertRecipients(db, "live");
    const recipientIds = liveRecipients.map((recipient) => recipient.userId);
    if (recipientIds.length === 0) {
      return {
        configured: true,
        usersChecked: 0,
        picksEvaluated: 0,
        milestonesDetected: 0,
        pushesSent: 0,
        duplicatesSkipped: 0,
        prunedSubscriptions: 0,
      };
    }
    const pendingUserRows = await db
      .select({ userId: sealedPicks.userId })
      .from(sealedPicks)
      .where(
        and(eq(sealedPicks.status, "pending"), inArray(sealedPicks.userId, recipientIds)),
      )
      .orderBy(desc(sealedPicks.kickoffAt))
      .limit(maxUsers * 5);
    candidateUserIds = Array.from(new Set(pendingUserRows.map((row) => row.userId))).slice(
      0,
      maxUsers,
    );
  }

  const paseAccessCache = new Map<string, boolean>();
  const activeUserIds = await filterActivePaseUserIds(db, candidateUserIds, now, paseAccessCache);
  if (activeUserIds.length === 0) {
    return {
      configured: true,
      usersChecked: 0,
      picksEvaluated: 0,
      milestonesDetected: 0,
      pushesSent: 0,
      duplicatesSkipped: 0,
      prunedSubscriptions: 0,
    };
  }

  let sharedScoreboard: LiveScoreboard;
  if (opts.scoreboard) {
    sharedScoreboard = opts.scoreboard;
  } else {
    try {
      sharedScoreboard = await getLiveScoreboard(opts.liveDeps);
    } catch (err) {
      void err;
      sharedScoreboard = {
        generatedAt: now.toISOString(),
        sourceFetchedAt: null,
        active: false,
        nextPollSeconds: null,
        notice: null,
        entries: [],
      };
    }
  }

  const sendPush = opts.sendPushImpl ?? sendPushToUsers;
  let picksEvaluated = 0;
  let milestonesDetected = 0;
  let pushesSent = 0;
  let duplicatesSkipped = 0;
  let prunedSubscriptions = 0;

  for (const userId of activeUserIds) {
    const tracked = await loadUserLiveTrackedPicks(db, userId, {
      now,
      scoreboard: sharedScoreboard,
      liveDeps: opts.liveDeps,
      matchDetails: opts.matchDetails,
      loadMatchDetail: opts.loadMatchDetail,
      dataset: opts.dataset,
    });
    picksEvaluated += tracked.items.length;

    const userSegment = sanitizeCacheSegment(userId);
    for (const item of tracked.items) {
      for (const candidate of item.milestoneCandidates) {
        milestonesDetected += 1;
        const hash = buildLivePickMilestoneHash(
          item.pickId,
          candidate.milestone,
          candidate.valueKey,
        );
        const cacheKey = `push:livepick:${userSegment}:${hash}`;
        const claimed = await claimLivePickMilestoneOnce(
          db,
          cacheKey,
          {
            sentAt: now.toISOString(),
            pickId: item.pickId,
            milestone: candidate.milestone,
            hash,
          },
          now,
        );
        if (!claimed) {
          duplicatesSkipped += 1;
          continue;
        }
        const payload = buildMilestonePushPayload(item, candidate.milestone, hash);
        const delivery = await sendPush(db, [userId], "live", payload, opts.fetchImpl);
        pushesSent += delivery.sent;
        prunedSubscriptions += delivery.pruned;
      }
    }
  }

  return {
    configured: true,
    usersChecked: activeUserIds.length,
    picksEvaluated,
    milestonesDetected,
    pushesSent,
    duplicatesSkipped,
    prunedSubscriptions,
  };
}

export async function runScheduledPushAlerts(
  db: Db,
  options: {
    now?: Date;
    dataset?: PlatformDataset;
    fetchImpl?: typeof fetch;
    forceConfiguredCheck?: boolean;
  } = {},
): Promise<PushAlertsRunReport> {
  const now = options.now ?? new Date();
  const configured = options.forceConfiguredCheck ?? isWebPushConfigured();
  if (!configured) {
    return {
      configured: false,
      prematchGamesChecked: 0,
      prematchPushesSent: 0,
      lineMovesDetected: 0,
      lineMovePushesSent: 0,
      prunedSubscriptions: 0,
    };
  }

  const dataset = options.dataset ?? buildServerRawPlatformDataset();
  const prematchGames = findPreMatchPushGames(dataset, now.getTime());
  const lineMoves = detectSignificantLineMoves(dataset, now.getTime());

  let prematchPushesSent = 0;
  let lineMovePushesSent = 0;
  let prunedSubscriptions = 0;
  const paseAccessCache = new Map<string, boolean>();

  if (prematchGames.length > 0) {
    const watchers = await listLiveGameWatchers(
      db,
      prematchGames.map((g) => g.id),
    );
    for (const game of prematchGames) {
      const candidateUserIds = watchers
        .filter((w) => w.gameId === game.id && w.kickoff)
        .map((w) => w.userId);
      const userIds = await filterActivePaseUserIds(db, candidateUserIds, now, paseAccessCache);
      if (userIds.length === 0) continue;
      const shouldSend = await claimAlertOnce(db, `push:prematch60:${game.id}`, now);
      if (!shouldSend) continue;

      const mainPick = game.picks[0];
      const href = canonicalGameHref(game.league, game);
      const res = await sendPushToUsers(
        db,
        userIds,
        "live",
        {
          title: `En 1 h: ${game.home.shortName} vs ${game.away.shortName}`,
          body: mainPick && !mainPick.isRedacted
            ? `Pick principal congelado: ${mainPick.label} (${Math.round(mainPick.p * 100)} %).`
            : `${game.leagueLabel} · Revisa bajas, árbitro y cuotas antes del inicio.`,
          url: href,
          tag: `prematch-60m-${game.id}`,
        },
        options.fetchImpl,
      );
      prematchPushesSent += res.sent;
      prunedSubscriptions += res.pruned;
    }
  }

  if (lineMoves.length > 0) {
    const allRecipients = await listPushAlertRecipients(db, "picks");
    const activeRecipientIds = new Set(
      await filterActivePaseUserIds(
        db,
        allRecipients.map((r) => r.userId),
        now,
        paseAccessCache,
      ),
    );
    const recipients = allRecipients.filter((r) => activeRecipientIds.has(r.userId));
    for (const move of lineMoves) {
      const homeKey = `${move.game.league}:${move.game.home.slug}`;
      const awayKey = `${move.game.league}:${move.game.away.slug}`;
      const targetUsers = recipients
        .filter((r) => {
          if (!r.lineMoveAlerts) return false;
          if (r.followedTeams.includes(homeKey) || r.followedTeams.includes(awayKey)) return true;
          if (r.favoriteLeagues.length === 0) return true;
          return r.favoriteLeagues.includes(move.game.league);
        })
        .map((r) => r.userId);
      if (targetUsers.length === 0) continue;

      const cacheKey = `push:linemove:${move.game.id}:${move.selection}:${move.currentDecimal.toFixed(2)}`;
      const shouldSend = await claimAlertOnce(db, cacheKey, now);
      if (!shouldSend) continue;

      const href = canonicalGameHref(move.game.league, move.game);
      const res = await sendPushToUsers(
        db,
        targetUsers,
        "picks",
        {
          title: `Movimiento ${move.shiftPct.toFixed(1)} % · ${move.game.home.shortName} vs ${move.game.away.shortName}`,
          body: `${move.label}: ${move.openDecimal.toFixed(2)} → ${move.currentDecimal.toFixed(2)} (${move.bookLabel}).`,
          url: href,
          tag: `line-move-${move.game.id}`,
        },
        options.fetchImpl,
      );
      lineMovePushesSent += res.sent;
      prunedSubscriptions += res.pruned;
    }
  }

  return {
    configured: true,
    prematchGamesChecked: prematchGames.length,
    prematchPushesSent,
    lineMovesDetected: lineMoves.length,
    lineMovePushesSent,
    prunedSubscriptions,
  };
}
