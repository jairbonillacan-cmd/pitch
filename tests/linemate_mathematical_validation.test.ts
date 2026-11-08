import { describe, it, expect } from 'vitest';

/**
 * Mathematical Engine for LineMate NFL Reverse Engineering & PitchLab Core
 * Validates hit rates, splits, push handling, odds conversion, vig removal,
 * and opponent ranking formulas.
 */

// 1. LineMate Observable Hit Rate Calculation (from buildTrendsData)
export function computeLineMateHitRate(games: Array<{ value: number; isHome?: boolean }>, line: number, outcome: 'over' | 'under') {
  let hits = 0;
  let pushes = 0;
  let total = 0;

  for (const g of games) {
    total += g.value;
    if (g.value === line) {
      pushes++;
    } else if (outcome === 'over' && g.value > line) {
      hits++;
    } else if (outcome === 'under' && g.value < line) {
      hits++;
    }
  }

  const sampleSize = games.length;
  if (sampleSize === 0) {
    return {
      hits: 0,
      pushes: 0,
      misses: 0,
      sampleSize: 0,
      hitRate: 0,
      missRate: 0,
      pushRate: 0,
      average: 0
    };
  }

  const misses = sampleSize - hits - pushes;
  // Decimal precision 1 place as observed in LineMate
  const hitRate = Number(((hits / sampleSize) * 100).toFixed(1));
  const missRate = Number(((misses / sampleSize) * 100).toFixed(1));
  const pushRate = Number(((pushes / sampleSize) * 100).toFixed(1));
  const average = Number((total / sampleSize).toFixed(1));

  return {
    hits,
    pushes,
    misses,
    sampleSize,
    hitRate,
    missRate,
    pushRate,
    average
  };
}

// 2. PitchLab Enhanced Hit Rate Engine (accounting for pushes conditionally)
export function computePitchLabHitRate(
  games: Array<{ value: number; isHome?: boolean; minutes?: number }>,
  line: number,
  outcome: 'over' | 'under',
  options: { excludePushesFromDenominator?: boolean; minMinutes?: number } = {}
) {
  // Filter DNP / low participation
  const eligibleGames = options.minMinutes !== undefined
    ? games.filter(g => (g.minutes ?? 0) >= options.minMinutes)
    : games;

  let hits = 0;
  let pushes = 0;
  let total = 0;

  for (const g of eligibleGames) {
    total += g.value;
    if (g.value === line) {
      pushes++;
    } else if (outcome === 'over' && g.value > line) {
      hits++;
    } else if (outcome === 'under' && g.value < line) {
      hits++;
    }
  }

  const totalGames = eligibleGames.length;
  if (totalGames === 0) {
    return { hitRateRaw: 0, hitRateAdjusted: 0, hits: 0, pushes: 0, misses: 0, totalGames: 0 };
  }

  const misses = totalGames - hits - pushes;
  const hitRateRaw = (hits / totalGames) * 100;

  // Standard betting market adjustment: pushes refunded, so effective hit rate is hits / (hits + misses)
  const decisiveGames = hits + misses;
  const hitRateAdjusted = decisiveGames > 0 ? (hits / decisiveGames) * 100 : 0;

  return {
    hits,
    pushes,
    misses,
    totalGames,
    decisiveGames,
    hitRateRaw: Number(hitRateRaw.toFixed(1)),
    hitRateAdjusted: Number(hitRateAdjusted.toFixed(1)),
    average: Number((total / totalGames).toFixed(2))
  };
}

// 3. Odds Conversions & Vig Removal
export function americanToDecimal(american: number): number {
  if (american > 0) {
    return Number((1 + american / 100).toFixed(4));
  } else {
    return Number((1 + 100 / Math.abs(american)).toFixed(4));
  }
}

export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2.0) {
    return Math.round((decimal - 1) * 100);
  } else {
    return Math.round(-100 / (decimal - 1));
  }
}

export function americanToImpliedProbability(american: number): number {
  if (american > 0) {
    return Number((100 / (american + 100)).toFixed(4));
  } else {
    return Number((Math.abs(american) / (Math.abs(american) + 100)).toFixed(4));
  }
}

export function removeVigProportional(americanOver: number, americanUnder: number) {
  const pOverRaw = americanToImpliedProbability(americanOver);
  const pUnderRaw = americanToImpliedProbability(americanUnder);
  const totalMarket = pOverRaw + pUnderRaw;
  const vig = Number(((totalMarket - 1) * 100).toFixed(2));

  const fairPOver = Number((pOverRaw / totalMarket).toFixed(4));
  const fairPUnder = Number((pUnderRaw / totalMarket).toFixed(4));

  return {
    rawOver: pOverRaw,
    rawUnder: pUnderRaw,
    vigPercent: vig,
    fairOver: fairPOver,
    fairUnder: fairPUnder
  };
}

// 4. Opponent Defensive Ranking (from buildTeamPropRankings)
export function computeOpponentRankings(
  teams: Array<{ code: string; allowedStatPerGame: number }>,
  order: 'ASC' | 'DESC' = 'ASC'
) {
  // ASC: lower allowed stats = stingier defense (Rank 1 = lowest allowed)
  // DESC: higher allowed stats = stingier defense (e.g. sacks, interceptions)
  const sorted = [...teams].sort((a, b) => {
    return order === 'ASC'
      ? a.allowedStatPerGame - b.allowedStatPerGame
      : b.allowedStatPerGame - a.allowedStatPerGame;
  });

  const rankings: Record<string, { rank: number; value: number }> = {};
  sorted.forEach((team, idx) => {
    rankings[team.code] = { rank: idx + 1, value: team.allowedStatPerGame };
  });

  return rankings;
}

// --- TEST SUITE ---
describe('LineMate Mathematical Validations', () => {

  it('validates 100% hit rate calculation without pushes', () => {
    const games = [
      { value: 12 }, { value: 15 }, { value: 10 }, { value: 18 }, { value: 22 }
    ];
    const res = computeLineMateHitRate(games, 9.5, 'over');
    expect(res.hits).toBe(5);
    expect(res.pushes).toBe(0);
    expect(res.misses).toBe(0);
    expect(res.hitRate).toBe(100.0);
    expect(res.missRate).toBe(0.0);
    expect(res.average).toBe(15.4);
  });

  it('validates 0% hit rate calculation', () => {
    const games = [
      { value: 2 }, { value: 4 }, { value: 3 }, { value: 5 }, { value: 1 }
    ];
    const res = computeLineMateHitRate(games, 5.5, 'over');
    expect(res.hits).toBe(0);
    expect(res.misses).toBe(5);
    expect(res.hitRate).toBe(0.0);
    expect(res.missRate).toBe(100.0);
  });

  it('validates LineMate push handling where pushes remain in denominator', () => {
    // 10 games: 7 hits (value > 10), 1 push (value === 10), 2 misses (value < 10)
    const games = [
      { value: 12 }, { value: 14 }, { value: 10 }, { value: 8 }, { value: 15 },
      { value: 11 }, { value: 16 }, { value: 7 }, { value: 13 }, { value: 19 }
    ];
    const res = computeLineMateHitRate(games, 10, 'over');
    expect(res.hits).toBe(7);
    expect(res.pushes).toBe(1);
    expect(res.misses).toBe(2);
    expect(res.sampleSize).toBe(10);
    // LineMate formula: hits / games.length = 7 / 10 = 70.0%
    expect(res.hitRate).toBe(70.0);
    // misses / games.length = 2 / 10 = 20.0%
    expect(res.missRate).toBe(20.0);
    expect(res.pushRate).toBe(10.0);
    // HitRate + MissRate + PushRate = 100%
    expect(res.hitRate + res.missRate + res.pushRate).toBe(100.0);
  });

  it('validates PitchLab push-adjusted hit rate vs raw hit rate', () => {
    const games = [
      { value: 12 }, { value: 14 }, { value: 10 }, { value: 8 }, { value: 15 },
      { value: 11 }, { value: 16 }, { value: 7 }, { value: 13 }, { value: 19 }
    ];
    const res = computePitchLabHitRate(games, 10, 'over');
    expect(res.hitRateRaw).toBe(70.0); // LineMate raw
    // In decisive bets (stake refunded on push), 7 hits out of 9 decisive = 77.8%
    expect(res.hitRateAdjusted).toBe(77.8);
  });

  it('validates under markets calculation', () => {
    const games = [
      { value: 0 }, { value: 0 }, { value: 1 }, { value: 0 }, { value: 2 }
    ];
    const res = computeLineMateHitRate(games, 0.5, 'under');
    expect(res.hits).toBe(3); // values 0, 0, 0
    expect(res.misses).toBe(2); // values 1, 2
    expect(res.hitRate).toBe(60.0);
  });

  it('validates American to Decimal odds and Implied Probability', () => {
    // -110 standard line
    expect(americanToDecimal(-110)).toBe(1.9091);
    expect(americanToImpliedProbability(-110)).toBe(0.5238);

    // +150 underdog
    expect(americanToDecimal(150)).toBe(2.5);
    expect(americanToImpliedProbability(150)).toBe(0.4);

    // -200 heavy favorite
    expect(americanToDecimal(-200)).toBe(1.5);
    expect(americanToImpliedProbability(-200)).toBe(0.6667);
  });

  it('validates vig removal and fair probability calculation', () => {
    // Standard -110 / -110 market
    const market = removeVigProportional(-110, -110);
    expect(market.rawOver).toBe(0.5238);
    expect(market.rawUnder).toBe(0.5238);
    expect(market.vigPercent).toBe(4.76); // ~4.76% standard bookmaker vig
    expect(market.fairOver).toBe(0.5);
    expect(market.fairUnder).toBe(0.5);
  });

  it('validates opponent defensive ranking ordering', () => {
    const teams = [
      { code: 'DEN', allowedStatPerGame: 180.2 },
      { code: 'KC', allowedStatPerGame: 210.5 },
      { code: 'CIN', allowedStatPerGame: 265.8 },
      { code: 'DAL', allowedStatPerGame: 245.0 }
    ];
    const rankings = computeOpponentRankings(teams, 'ASC');
    // DEN allows fewest -> Rank 1
    expect(rankings['DEN'].rank).toBe(1);
    // KC -> Rank 2
    expect(rankings['KC'].rank).toBe(2);
    // DAL -> Rank 3
    expect(rankings['DAL'].rank).toBe(3);
    // CIN allows most -> Rank 4 (worst defense against this stat)
    expect(rankings['CIN'].rank).toBe(4);
  });
});
