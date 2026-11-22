export const PLAYABLE_ODDS_MIN = 1.55;
export const PLAYABLE_ODDS_MAX = 2.60;
export const CONSERVATIVE_MAX_ODDS = 1.45;

const DOUBLE_CHANCE_RE =
  /double[_\s-]*chance|doble\s+oportunidad|\bo\s+empate\b|\((?:1x|x2|12)\)/i;

export interface PlayablePickScoreInput {
  readonly market?: string | null;
  readonly label?: string | null;
  readonly p: number;
  readonly decimal?: number | null;
  readonly evPct?: number | null;
  readonly evidenceAvgPct?: number | null;
}

export interface HeadlinePickCandidate {
  readonly market?: string | null;
  readonly label?: string | null;
  readonly p: number;
  readonly fairDecimal: number;
  readonly marketDecimal?: number | null;
  readonly isRedacted?: boolean;
  readonly evPct?: number | null;
}

export function isDoubleChancePick(
  market: string | null | undefined,
  label: string | null | undefined,
): boolean {
  const m = (market ?? "").trim().toLowerCase();
  if (m === "double_chance" || m === "dc") return true;
  const text = (label ?? "").trim();
  if (!text) return false;
  return DOUBLE_CHANCE_RE.test(text);
}

export function isPlayableValueOdds(decimal: number | null | undefined): boolean {
  return (
    typeof decimal === "number" &&
    Number.isFinite(decimal) &&
    decimal >= PLAYABLE_ODDS_MIN &&
    decimal <= PLAYABLE_ODDS_MAX
  );
}

export function isConservativeChalkPick(
  market: string | null | undefined,
  label: string | null | undefined,
  decimal: number | null | undefined,
  evPct?: number | null,
): boolean {
  if (isDoubleChancePick(market, label)) {
    return true;
  }
  const hasHighEv =
    typeof evPct === "number" && Number.isFinite(evPct) && evPct >= 2.0;
  if (
    typeof decimal === "number" &&
    Number.isFinite(decimal) &&
    decimal > 1.0 &&
    decimal < CONSERVATIVE_MAX_ODDS &&
    !hasHighEv
  ) {
    return true;
  }
  return false;
}

function resolveEffectivePickDecimal(input: {
  readonly decimal?: number | null;
  readonly fairDecimal?: number | null;
  readonly marketDecimal?: number | null;
  readonly p: number;
}): number | null {
  if (
    typeof input.decimal === "number" &&
    Number.isFinite(input.decimal) &&
    input.decimal > 1.01
  ) {
    return input.decimal;
  }
  if (
    typeof input.marketDecimal === "number" &&
    Number.isFinite(input.marketDecimal) &&
    input.marketDecimal > 1.01
  ) {
    return input.marketDecimal;
  }
  if (
    typeof input.fairDecimal === "number" &&
    Number.isFinite(input.fairDecimal) &&
    input.fairDecimal > 1.01
  ) {
    return input.fairDecimal;
  }
  if (typeof input.p === "number" && Number.isFinite(input.p) && input.p > 0.01) {
    return Math.round((1 / input.p) * 100) / 100;
  }
  return null;
}

export function scorePlayablePick(input: PlayablePickScoreInput): number {
  const effectiveDecimal = resolveEffectivePickDecimal(input);
  const evPct =
    typeof input.evPct === "number" && Number.isFinite(input.evPct)
      ? input.evPct
      : null;
  const isChalk = isConservativeChalkPick(
    input.market,
    input.label,
    effectiveDecimal,
    evPct,
  );

  let tierBonus = 0;
  if (isChalk) {
    tierBonus = -80;
  } else if (isPlayableValueOdds(effectiveDecimal)) {
    tierBonus = 100;
  } else if (
    effectiveDecimal !== null &&
    effectiveDecimal >= CONSERVATIVE_MAX_ODDS &&
    effectiveDecimal <= 3.4
  ) {
    tierBonus = 45;
  }

  const evComponent =
    evPct !== null && evPct > 0 ? Math.min(25, evPct) * 3.0 : 0;
  const evidenceComponent =
    typeof input.evidenceAvgPct === "number" &&
    Number.isFinite(input.evidenceAvgPct)
      ? Math.max(0, Math.min(100, input.evidenceAvgPct)) * 0.4
      : 0;

  const pSafe =
    typeof input.p === "number" && Number.isFinite(input.p) ? input.p : 0.5;
  const sweetSpotDistance = Math.abs(pSafe - 0.57);
  const probComponent = Math.max(0, 30 - sweetSpotDistance * 45);

  return tierBonus + evComponent + evidenceComponent + probComponent;
}

export function selectHeadlineMatchPick<T extends HeadlinePickCandidate>(
  picks: readonly T[],
): T | undefined {
  if (picks.length === 0) return undefined;
  const visible = picks.filter((pk) => !pk.isRedacted);
  const pool = visible.length > 0 ? visible : picks;

  let best: T = pool[0]!;
  let bestScore = -Infinity;

  for (const candidate of pool) {
    const decimal = resolveEffectivePickDecimal(candidate);
    const derivedEv =
      typeof candidate.evPct === "number" && Number.isFinite(candidate.evPct)
        ? candidate.evPct
        : candidate.marketDecimal && candidate.marketDecimal > 1.01
          ? Math.round((candidate.p * candidate.marketDecimal - 1) * 1000) / 10
          : null;
    const score = scorePlayablePick({
      market: candidate.market,
      label: candidate.label,
      p: candidate.p,
      decimal,
      evPct: derivedEv,
    });
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

export function partitionPlayableAndConservative<
  T extends {
    readonly market?: string | null;
    readonly label?: string | null;
    readonly decimal?: number | null;
    readonly evPct?: number | null;
  },
>(items: readonly T[]): {
  readonly playable: readonly T[];
  readonly conservative: readonly T[];
} {
  const playable: T[] = [];
  const conservative: T[] = [];
  for (const item of items) {
    if (
      isConservativeChalkPick(
        item.market,
        item.label,
        item.decimal,
        item.evPct,
      )
    ) {
      conservative.push(item);
    } else {
      playable.push(item);
    }
  }
  if (playable.length === 0) {
    return { playable: items, conservative: [] };
  }
  return { playable, conservative };
}
