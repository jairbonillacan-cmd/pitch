import { createDb, getOrFreezeMatchMainPick, type Db } from "@pitchlab/db";
import {
  createFrozenMainPickSnapshot,
  PRE_MATCH_FREEZE_WINDOW_MS,
  parseKickoffUtcMs,
} from "@pitchlab/ui/pre-match";
import type { FrozenMainPickSnapshot, PlatformGame } from "@pitchlab/ui/types";

const memoryFrozenByGame = new Map<string, FrozenMainPickSnapshot>();

let frozenDb: Db | null = null;

export async function resolveServerFrozenMainPick(
  game: Pick<PlatformGame, "id" | "kickoffUtc" | "status" | "picks">,
  now: Date = new Date(),
): Promise<FrozenMainPickSnapshot | null> {
  const cached = memoryFrozenByGame.get(game.id);
  if (cached) {
    return cached;
  }

  const kickoffMs = parseKickoffUtcMs(game.kickoffUtc);
  if (!Number.isFinite(kickoffMs)) {
    return null;
  }

  const freezeAtMs = kickoffMs - PRE_MATCH_FREEZE_WINDOW_MS;
  const shouldFreeze = game.status !== "NS" || now.getTime() >= freezeAtMs;
  if (!shouldFreeze) {
    return null;
  }

  const candidateSnapshot = createFrozenMainPickSnapshot(game);
  if (!candidateSnapshot) {
    return null;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      frozenDb ??= createDb(dbUrl);
      const stored = await getOrFreezeMatchMainPick(
        frozenDb,
        {
          gameId: candidateSnapshot.gameId,
          pickId: candidateSnapshot.pickId,
          pickLabel: candidateSnapshot.label,
          categoryLabel: candidateSnapshot.categoryLabel,
          marketGroup: candidateSnapshot.marketGroup,
          selectionKey: candidateSnapshot.selectionKey,
          probability: candidateSnapshot.p,
          fairDecimal: candidateSnapshot.fairDecimal,
          fairAmerican: candidateSnapshot.fairAmerican,
          kickoffAt: new Date(kickoffMs),
        },
        now,
      );
      if (stored) {
        const resolved: FrozenMainPickSnapshot = {
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
        memoryFrozenByGame.set(game.id, resolved);
        return resolved;
      }
    } catch (err) {
      void err;
    }
  }

  memoryFrozenByGame.set(game.id, candidateSnapshot);
  return candidateSnapshot;
}

export function clearServerFrozenPicksCacheForTests(): void {
  memoryFrozenByGame.clear();
}
