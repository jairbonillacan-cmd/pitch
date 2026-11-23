import {
  createDb,
  getFrozenMatchMainPick,
  getOrFreezeMatchMainPick,
  type Db,
  type StoredFrozenPick,
} from "@pitchlab/db";
import {
  auditPreKickoffCausalityV6,
  computeCanonicalSealSha256V6,
  formatEpochMsUtc,
  normalizeLifecycleStatusV6,
  parseIsoUtcEpochMs,
  sealPreKickoffOutlookV6,
  type PreKickoffAnalysisPayloadV6,
  type PreKickoffCausalityAuditReportV6,
  type SealPreKickoffInputV6,
  type SealPreKickoffOutcomeV6,
  type SealedPreKickoffRecordV6,
  type SnapshotCausalityObservationV6,
} from "@pitchlab/spacetime/v6";
import {
  createFrozenMainPickSnapshot,
  PRE_MATCH_FREEZE_WINDOW_MS,
  parseKickoffUtcMs,
} from "@pitchlab/ui/pre-match";
import type { FrozenMainPickSnapshot, PlatformGame } from "@pitchlab/ui/types";

export interface FrozenMainPickResolveOptions {
  readonly now?: Date;
  readonly inputsAsOfUtc?: string | null;
  readonly causalBackfillSnapshot?: FrozenMainPickSnapshot | null;
  readonly causalBackfillInputsAsOfUtc?: string | null;
}

export type ServerFrozenPickGameInput = Pick<PlatformGame, "id" | "kickoffUtc" | "status" | "picks"> &
  Partial<Pick<PlatformGame, "league" | "sport" | "home" | "away" | "x12" | "projection">>;

const memoryFrozenByGame = new Map<string, FrozenMainPickSnapshot>();
const memorySealRecordByGame = new Map<string, SealedPreKickoffRecordV6>();

let frozenDb: Db | null = null;

function mapStoredFrozenPick(stored: StoredFrozenPick): FrozenMainPickSnapshot {
  return {
    gameId: stored.gameId,
    pickId: stored.pickId,
    label: stored.pickLabel,
    categoryLabel: stored.categoryLabel,
    marketGroup: stored.marketGroup,
    selectionKey: stored.selectionKey,
    p: stored.probability,
    fairDecimal: stored.fairDecimal,
    fairAmerican: stored.fairAmerican,
    kickoffUtc: stored.kickoffAtIso,
    freezeAtUtc: stored.freezeAtIso,
  };
}

function buildAnalysisPayloadFromSnapshot(
  game: ServerFrozenPickGameInput,
  snapshot: FrozenMainPickSnapshot,
  inputsAsOfUtc: string,
): PreKickoffAnalysisPayloadV6 {
  const probabilities: Record<string, number | null> = {
    pMainPick: snapshot.p,
    fairDecimalMainPick: snapshot.fairDecimal,
  };
  if (game.x12) {
    probabilities.pHome = game.x12[0];
    probabilities.pDraw = game.x12[1];
    probabilities.pAway = game.x12[2];
  }
  const projection: Record<string, number | null> = game.projection
    ? {
        home: game.projection.home,
        away: game.projection.away,
        total: game.projection.total,
      }
    : {};
  return {
    inputsAsOfUtc,
    probabilities,
    projection,
  };
}

function resolveKickoffEpochMs(kickoffUtc: string): number | null {
  const strictMs = parseIsoUtcEpochMs(kickoffUtc);
  if (strictMs !== null && Number.isFinite(strictMs)) {
    return Math.trunc(strictMs);
  }
  const fallbackMs = parseKickoffUtcMs(kickoffUtc);
  return Number.isFinite(fallbackMs) ? Math.trunc(fallbackMs) : null;
}

function resolveGameMeta(game: ServerFrozenPickGameInput): {
  sport: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
} {
  return {
    sport: game.sport ?? "football",
    league: String(game.league ?? "unknown"),
    homeTeam: game.home?.slug ?? "home",
    awayTeam: game.away?.slug ?? "away",
  };
}

function createExistingSealFromSnapshot(
  game: ServerFrozenPickGameInput,
  snapshot: FrozenMainPickSnapshot,
  kickoffMs: number,
): SealedPreKickoffRecordV6 | null {
  const freezeMs = parseIsoUtcEpochMs(snapshot.freezeAtUtc);
  const safeInputsMs =
    freezeMs !== null && freezeMs <= kickoffMs
      ? freezeMs
      : kickoffMs - PRE_MATCH_FREEZE_WINDOW_MS;
  const meta = resolveGameMeta(game);
  const outcome = sealPreKickoffOutlookV6({
    matchId: snapshot.gameId,
    sport: meta.sport,
    league: meta.league,
    homeTeam: meta.homeTeam,
    awayTeam: meta.awayTeam,
    kickoffUtc: formatEpochMsUtc(kickoffMs),
    status: "scheduled",
    incomingAnalysis: buildAnalysisPayloadFromSnapshot(
      game,
      snapshot,
      formatEpochMsUtc(safeInputsMs),
    ),
  });
  return outcome.sealedRecord;
}

export function verifyPreKickoffSealHashV6(record: SealedPreKickoffRecordV6): boolean {
  if (record.inputsAsOfEpochMs > record.kickoffEpochMs) {
    return false;
  }
  const expected = computeCanonicalSealSha256V6({
    matchId: record.matchId,
    sport: record.sport,
    league: record.league,
    homeTeam: record.homeTeam,
    awayTeam: record.awayTeam,
    kickoffEpochMs: record.kickoffEpochMs,
    inputsAsOfEpochMs: record.inputsAsOfEpochMs,
    sealOrigin: record.sealOrigin,
    prevSealSha256: record.prevSealSha256,
    probabilities: record.probabilities,
    projection: record.projection,
  });
  return expected === record.sealSha256;
}

export function getServerPreKickoffSealRecordV6(
  gameId: string,
): SealedPreKickoffRecordV6 | null {
  return memorySealRecordByGame.get(gameId) ?? null;
}

export function sealServerMatchOutlookV6(
  input: Omit<SealPreKickoffInputV6, "existingSealedRecord"> & {
    readonly existingSealedRecord?: SealedPreKickoffRecordV6 | null;
  },
): SealPreKickoffOutcomeV6 {
  const existing = input.existingSealedRecord ?? memorySealRecordByGame.get(input.matchId) ?? null;
  const outcome = sealPreKickoffOutlookV6({
    ...input,
    existingSealedRecord: existing,
    allowPreKickoffRefresh: false,
  });
  if (outcome.sealedRecord && verifyPreKickoffSealHashV6(outcome.sealedRecord)) {
    memorySealRecordByGame.set(input.matchId, outcome.sealedRecord);
  }
  return outcome;
}

export function auditServerPreKickoffCausalityV6(
  observations: readonly SnapshotCausalityObservationV6[],
  options?: { readonly allowPreKickoffRefresh?: boolean },
): PreKickoffCausalityAuditReportV6 {
  return auditPreKickoffCausalityV6(observations, options);
}

export async function resolveServerFrozenMainPick(
  game: ServerFrozenPickGameInput,
  nowOrOptions: Date | FrozenMainPickResolveOptions = new Date(),
): Promise<FrozenMainPickSnapshot | null> {
  const options: FrozenMainPickResolveOptions =
    nowOrOptions instanceof Date ? { now: nowOrOptions } : nowOrOptions;
  const now = options.now ?? new Date();
  const kickoffMs = resolveKickoffEpochMs(game.kickoffUtc);
  if (kickoffMs === null) {
    return null;
  }
  const kickoffUtcCanonical = formatEpochMsUtc(kickoffMs);
  const meta = resolveGameMeta(game);
  const lifecycleStatus = normalizeLifecycleStatusV6(game.status);

  let existingFrozen = memoryFrozenByGame.get(game.id) ?? null;
  let existingSeal = memorySealRecordByGame.get(game.id) ?? null;

  const dbUrl = process.env.DATABASE_URL;
  if (!existingFrozen && dbUrl) {
    try {
      frozenDb ??= createDb(dbUrl);
      const storedExisting = await getFrozenMatchMainPick(frozenDb, game.id);
      if (storedExisting) {
        existingFrozen = mapStoredFrozenPick(storedExisting);
        memoryFrozenByGame.set(game.id, existingFrozen);
      }
    } catch (err) {
      void err;
    }
  }

  if (existingFrozen && !existingSeal) {
    existingSeal = createExistingSealFromSnapshot(game, existingFrozen, kickoffMs);
    if (existingSeal) {
      memorySealRecordByGame.set(game.id, existingSeal);
    }
  }

  const candidateSnapshot = createFrozenMainPickSnapshot(game);

  let incomingAnalysis: PreKickoffAnalysisPayloadV6 | null = null;
  if (candidateSnapshot) {
    if (options.inputsAsOfUtc !== undefined) {
      if (typeof options.inputsAsOfUtc === "string" && options.inputsAsOfUtc.trim().length > 0) {
        incomingAnalysis = buildAnalysisPayloadFromSnapshot(
          game,
          candidateSnapshot,
          options.inputsAsOfUtc,
        );
      }
    } else if (lifecycleStatus === "scheduled") {
      incomingAnalysis = buildAnalysisPayloadFromSnapshot(
        game,
        candidateSnapshot,
        now.toISOString(),
      );
    } else if (now.getTime() > kickoffMs) {
      incomingAnalysis = buildAnalysisPayloadFromSnapshot(
        game,
        candidateSnapshot,
        now.toISOString(),
      );
    }
  }

  const causalBackfillAnalysis =
    options.causalBackfillSnapshot &&
    typeof options.causalBackfillInputsAsOfUtc === "string" &&
    options.causalBackfillInputsAsOfUtc.trim().length > 0
      ? buildAnalysisPayloadFromSnapshot(
          game,
          options.causalBackfillSnapshot,
          options.causalBackfillInputsAsOfUtc,
        )
      : null;

  if (existingFrozen) {
    sealPreKickoffOutlookV6({
      matchId: game.id,
      sport: meta.sport,
      league: meta.league,
      homeTeam: meta.homeTeam,
      awayTeam: meta.awayTeam,
      kickoffUtc: kickoffUtcCanonical,
      status: game.status,
      incomingAnalysis,
      existingSealedRecord: existingSeal,
      causalBackfillAnalysis,
      allowPreKickoffRefresh: false,
    });
    return existingFrozen;
  }

  const freezeAtMs = kickoffMs - PRE_MATCH_FREEZE_WINDOW_MS;
  if (lifecycleStatus === "scheduled" && now.getTime() < freezeAtMs) {
    return null;
  }

  const sealOutcome = sealPreKickoffOutlookV6({
    matchId: game.id,
    sport: meta.sport,
    league: meta.league,
    homeTeam: meta.homeTeam,
    awayTeam: meta.awayTeam,
    kickoffUtc: kickoffUtcCanonical,
    status: game.status,
    incomingAnalysis,
    existingSealedRecord: null,
    causalBackfillAnalysis,
    allowPreKickoffRefresh: false,
  });

  if (
    !sealOutcome.hasForecast ||
    !sealOutcome.sealedRecord ||
    !verifyPreKickoffSealHashV6(sealOutcome.sealedRecord)
  ) {
    return null;
  }

  const usedCausalBackfill =
    sealOutcome.sealAction === "recovered_ft_from_causal_walkforward" ||
    sealOutcome.sealAction === "rejected_contaminated_sealed_from_causal_backfill";
  const resolvedSnapshot = usedCausalBackfill
    ? (options.causalBackfillSnapshot ?? null)
    : candidateSnapshot;
  if (!resolvedSnapshot) {
    return null;
  }

  if (dbUrl) {
    try {
      frozenDb ??= createDb(dbUrl);
      const freezeAnchorDate =
        now.getTime() >= freezeAtMs ? now : new Date(Math.min(kickoffMs, freezeAtMs));
      const stored = await getOrFreezeMatchMainPick(
        frozenDb,
        {
          gameId: resolvedSnapshot.gameId,
          pickId: resolvedSnapshot.pickId,
          pickLabel: resolvedSnapshot.label,
          categoryLabel: resolvedSnapshot.categoryLabel,
          marketGroup: resolvedSnapshot.marketGroup,
          selectionKey: resolvedSnapshot.selectionKey,
          probability: resolvedSnapshot.p,
          fairDecimal: resolvedSnapshot.fairDecimal,
          fairAmerican: resolvedSnapshot.fairAmerican,
          kickoffAt: new Date(kickoffMs),
        },
        freezeAnchorDate,
      );
      if (stored) {
        const mapped = mapStoredFrozenPick(stored);
        memoryFrozenByGame.set(game.id, mapped);
        memorySealRecordByGame.set(game.id, sealOutcome.sealedRecord);
        return mapped;
      }
    } catch (err) {
      void err;
    }
  }

  memoryFrozenByGame.set(game.id, resolvedSnapshot);
  memorySealRecordByGame.set(game.id, sealOutcome.sealedRecord);
  return resolvedSnapshot;
}

export function clearServerFrozenPicksCacheForTests(): void {
  memoryFrozenByGame.clear();
  memorySealRecordByGame.clear();
}
