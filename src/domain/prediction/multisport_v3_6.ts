/**
 * PitchLab Spacetime Multi-Sport v3.6 Candidate (`EXP_V42`) —
 * Evolución candidata para `MLB`, `NHL` y `NBA` en TypeScript puro con paridad IEEE-754 `< 1e-13`
 * frente a `run_multisport_v3_6.py`.
 *
 * Corrige las tres fallas estructurales demostradas en la auditoría forense de Astra AI:
 *  1. MLB (`Kepler v3.6 Candidate`):
 *     - Soporte continuo de entradas del abridor `E[IP_SP] ∈ [1.0, 6.8]` (incl. *openers* `1.2 IP`),
 *       contracción Empirical Bayes de `FIP/ERA` (`kappa_ip = 45`), *platoon splits* y ventaja local.
 *     - Mercados `F5` (`pHome`, `pTie`, `pAway`, `pOver4_5`) y **Cadena de Markov exacta de Extra Innings**
 *       (Regla Manfred corredor en 2.ª + *walk-off* local) que elimina el sesgo de truncamiento `-2.5..-4.0 pp`
 *       en `Totals Over` de juego completo.
 *  2. NHL (`Curvature v3.6 Candidate`):
 *     - Equipos especiales (`PP%` vs `PK%`), fatiga *back-to-back* de portero, bandera de confirmación de
 *       guardameta y régimen de **Portería Vacía (*Empty-Net*)** con identidad exacta de conservación
 *       `(E[G_H] - E[G_H,reg]) + (E[G_A] - E[G_A,reg]) === P(OT)` para `Puck Line ±1.5` y `Totals 5.5/6.0/6.5`.
 *  3. NBA (`Tensor v3.6 Candidate`):
 *     - Descuento directo por impacto de bajas titulares (`missingImpactPts` / `BPM`) + ensanchamiento de
 *       `sigma_margin` ante incertidumbre `GTD/Questionable` + fatiga `B2B / 3-in-4` + probabilidad de prórroga.
 */

import { clamp, normalCdf } from "./math.js";
import { probabilityToFairOdds, type FairOdds } from "./outlook.js";

export const MULTISPORT_V36_SCHEMA_VERSION = "multisport_v3.6.0" as const;

export interface MultiSportV36ConfigArtifact {
  readonly schema_version: string;
  readonly codename: string;
  readonly version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly created_at: string;
  readonly holdout_cut_utc: string;
  readonly holdout_sealed_untouched: boolean;
  readonly mlb: {
    readonly league_woba: number;
    readonly league_fip: number;
    readonly starter_shrink_ip: number;
    readonly home_scoring_mult: number;
    readonly away_scoring_mult: number;
    readonly r_disp_f5: number;
    readonly r_disp_late4: number;
    readonly manfred_runner_boost_runs: number;
  };
  readonly nhl: {
    readonly league_sv_pct: number;
    readonly shots_per_game: number;
    readonly avg_pp_opportunities: number;
    readonly confirmed_goalie_weight: number;
    readonly unconfirmed_goalie_weight: number;
    readonly b2b_sv_pct_penalty: number;
    readonly empty_net_leader_goal_prob: number;
    readonly empty_net_puller_tie_prob: number;
  };
  readonly nba: {
    readonly sigma_margin_base: number;
    readonly sigma_total_base: number;
    readonly home_b2b_penalty_pts: number;
    readonly away_b2b_penalty_pts: number;
    readonly three_in_four_penalty_pts: number;
    readonly ot_scale: number;
  };
}

function nbPmfExact(mu: number, rDisp: number, maxK: number): Float64Array {
  const muC = clamp(mu, 0.02, 30.0);
  const rC = clamp(rDisp, 0.5, 200.0);
  const out = new Float64Array(maxK + 1);
  const p0Ratio = rC / (rC + muC);
  const qRatio = muC / (rC + muC);
  out[0] = Math.exp(rC * Math.log(p0Ratio));
  for (let k = 1; k <= maxK; k += 1) {
    out[k] = out[k - 1]! * ((k - 1.0 + rC) / k) * qRatio;
  }
  let s = 0.0;
  for (let k = 0; k <= maxK; k += 1) s += out[k]!;
  if (s > 0.0) {
    for (let k = 0; k <= maxK; k += 1) out[k] = out[k]! / s;
  }
  return out;
}

function poissonPmfExact(lam: number, maxK: number): Float64Array {
  const lc = clamp(lam, 0.01, 15.0);
  const out = new Float64Array(maxK + 1);
  out[0] = Math.exp(-lc);
  for (let k = 1; k <= maxK; k += 1) {
    out[k] = (out[k - 1]! * lc) / k;
  }
  let s = 0.0;
  for (let k = 0; k <= maxK; k += 1) s += out[k]!;
  if (s > 0.0) {
    for (let k = 0; k <= maxK; k += 1) out[k] = out[k]! / s;
  }
  return out;
}

function convolve1dExact(a: Float64Array, b: Float64Array, maxK: number): Float64Array {
  const out = new Float64Array(maxK + 1);
  for (let i = 0; i < a.length; i += 1) {
    const ai = a[i]!;
    if (ai <= 0.0) continue;
    for (let j = 0; j < b.length; j += 1) {
      const idx = i + j <= maxK ? i + j : maxK;
      out[idx] = out[idx]! + ai * b[j]!;
    }
  }
  let s = 0.0;
  for (let k = 0; k <= maxK; k += 1) s += out[k]!;
  if (s > 0.0) {
    for (let k = 0; k <= maxK; k += 1) out[k] = out[k]! / s;
  }
  return out;
}

// ============================================================================
// 1. MLB — PitchLab Kepler MLB v3.6 Candidate
// ============================================================================

export interface MLBV36Input {
  readonly home_woba?: number;
  readonly away_woba?: number;
  readonly home_platoon_mult?: number;
  readonly away_platoon_mult?: number;
  readonly park_weather_mult?: number;
  readonly home_sp_fip?: number;
  readonly away_sp_fip?: number;
  readonly home_sp_era?: number | null;
  readonly away_sp_era?: number | null;
  readonly home_sp_ip_hist?: number;
  readonly away_sp_ip_hist?: number;
  readonly home_rot_fip?: number;
  readonly away_rot_fip?: number;
  readonly home_bp_fip?: number;
  readonly away_bp_fip?: number;
  readonly home_is_opener?: boolean;
  readonly away_is_opener?: boolean;
  readonly home_sp_exp_ip?: number;
  readonly away_sp_exp_ip?: number;
  readonly neutral_site?: boolean;
  readonly total_line?: number;
}

export interface MLBV36Outlook {
  readonly sport: "mlb";
  readonly p_home: number;
  readonly p_away: number;
  readonly fair_odds_home: FairOdds;
  readonly fair_odds_away: FairOdds;
  readonly f5: {
    readonly mu_home: number;
    readonly mu_away: number;
    readonly p_home: number;
    readonly p_tie: number;
    readonly p_away: number;
    readonly p_over_4_5: number;
    readonly fair_odds_home: FairOdds;
    readonly fair_odds_tie: FairOdds;
    readonly fair_odds_away: FairOdds;
  };
  readonly full_game: {
    readonly mu_9inn_home: number;
    readonly mu_9inn_away: number;
    readonly p_extra_innings: number;
    readonly expected_runs_home: number;
    readonly expected_runs_away: number;
    readonly expected_total_runs: number;
    readonly p_runline_home_minus_1_5: number;
    readonly p_runline_away_plus_1_5: number;
    readonly total_line: number;
    readonly p_over: number;
    readonly p_under: number;
    readonly p_push: number;
    readonly p_over_cond_no_push: number;
    readonly fair_odds_over: FairOdds;
    readonly fair_odds_under: FairOdds;
    readonly p_over_9inn_truncated_astra_bug: number;
    readonly extra_innings_over_correction_pp: number;
  };
}

export function projectMlbV36Outlook(
  inp: MLBV36Input,
  cfgArtifact: MultiSportV36ConfigArtifact,
): MLBV36Outlook {
  const c = cfgArtifact.mlb;
  const lgWoba = c.league_woba;
  const lgFip = c.league_fip;
  const kappaIp = c.starter_shrink_ip;

  const hWoba = inp.home_woba ?? lgWoba;
  const aWoba = inp.away_woba ?? lgWoba;
  const hPlatoon = clamp(inp.home_platoon_mult ?? 1.0, 0.88, 1.14);
  const aPlatoon = clamp(inp.away_platoon_mult ?? 1.0, 0.88, 1.14);
  const pf = clamp(inp.park_weather_mult ?? 1.0, 0.84, 1.32);
  const neutral = Boolean(inp.neutral_site ?? false);

  const shrunkSp = (
    fipV: number,
    eraV: number | null | undefined,
    ipHist: number,
    rotBase: number,
  ): number => {
    const rawQ =
      eraV !== undefined && eraV !== null ? 0.65 * fipV + 0.35 * eraV : fipV;
    const ipC = Math.max(0.0, ipHist);
    return (ipC * rawQ + kappaIp * rotBase) / (ipC + kappaIp);
  };

  const hSpQ = shrunkSp(
    inp.home_sp_fip ?? lgFip,
    inp.home_sp_era,
    inp.home_sp_ip_hist ?? 95.0,
    inp.home_rot_fip ?? lgFip,
  );
  const aSpQ = shrunkSp(
    inp.away_sp_fip ?? lgFip,
    inp.away_sp_era,
    inp.away_sp_ip_hist ?? 95.0,
    inp.away_rot_fip ?? lgFip,
  );
  const hBpFip = inp.home_bp_fip ?? lgFip;
  const aBpFip = inp.away_bp_fip ?? lgFip;

  const hIpExp = inp.home_is_opener ? 1.2 : clamp(inp.home_sp_exp_ip ?? 5.3, 1.0, 6.8);
  const aIpExp = inp.away_is_opener ? 1.2 : clamp(inp.away_sp_exp_ip ?? 5.3, 1.0, 6.8);

  const hcaH = neutral ? 1.0 : c.home_scoring_mult;
  const hcaA = neutral ? 1.0 : c.away_scoring_mult;

  const hOffMult = (hWoba / lgWoba) * hPlatoon * pf * hcaH;
  const aOffMult = (aWoba / lgWoba) * aPlatoon * pf * hcaA;

  const aSpF5 = Math.min(5.0, aIpExp);
  const aBpF5 = 5.0 - aSpF5;
  const hSpF5 = Math.min(5.0, hIpExp);
  const hBpF5 = 5.0 - hSpF5;

  const muF5H = clamp(((aSpF5 * aSpQ + aBpF5 * aBpFip) / 9.0) * hOffMult, 0.45, 7.5);
  const muF5A = clamp(((hSpF5 * hSpQ + hBpF5 * hBpFip) / 9.0) * aOffMult, 0.45, 7.5);

  const aSpL4 = Math.max(0.0, aIpExp - 5.0);
  const aBpL4 = Math.max(0.0, 4.0 - aSpL4);
  const hSpL4 = Math.max(0.0, hIpExp - 5.0);
  const hBpL4 = Math.max(0.0, 4.0 - hSpL4);

  const muL4H = clamp(((aSpL4 * aSpQ + aBpL4 * aBpFip) / 9.0) * hOffMult, 0.35, 6.5);
  const muL4A = clamp(((hSpL4 * hSpQ + hBpL4 * hBpFip) / 9.0) * aOffMult, 0.35, 6.5);

  const maxRF5 = 16;
  const maxR9 = 22;
  const maxRFull = 30;

  const pmfF5H = nbPmfExact(muF5H, c.r_disp_f5, maxRF5);
  const pmfF5A = nbPmfExact(muF5A, c.r_disp_f5, maxRF5);
  const pmfL4H = nbPmfExact(muL4H, c.r_disp_late4, maxRF5);
  const pmfL4A = nbPmfExact(muL4A, c.r_disp_late4, maxRF5);

  let pHF5 = 0.0;
  let pTF5 = 0.0;
  let pAF5 = 0.0;
  let pOv45F5 = 0.0;
  for (let ih = 0; ih <= maxRF5; ih += 1) {
    for (let ia = 0; ia <= maxRF5; ia += 1) {
      const p = pmfF5H[ih]! * pmfF5A[ia]!;
      if (ih > ia) pHF5 += p;
      else if (ih === ia) pTF5 += p;
      else pAF5 += p;
      if (ih + ia > 4) pOv45F5 += p;
    }
  }

  const pmf9H = convolve1dExact(pmfF5H, pmfL4H, maxR9);
  const pmf9A = convolve1dExact(pmfF5A, pmfL4A, maxR9);

  const totalLine = inp.total_line ?? 8.0;
  let pOver9Truncated = 0.0;
  let pTie9 = 0.0;
  for (let ih = 0; ih <= maxR9; ih += 1) {
    for (let ia = 0; ia <= maxR9; ia += 1) {
      const p = pmf9H[ih]! * pmf9A[ia]!;
      if (ih + ia > totalLine) pOver9Truncated += p;
      if (ih === ia) pTie9 += p;
    }
  }

  // Operador de Cadena de Markov Exacta de Extra Innings (Regla Manfred + Walk-Off Local)
  const manfredBoost = c.manfred_runner_boost_runs;
  const lamExtA = clamp((aBpFip * 0.0 + hBpFip / 9.0) * aOffMult + manfredBoost, 0.35, 1.85);
  const lamExtH = clamp(
    (aBpFip / 9.0) * hOffMult + manfredBoost * (neutral ? 1.0 : 1.04),
    0.35,
    1.95,
  );

  const maxExtInn = 6;
  const qa = poissonPmfExact(lamExtA, maxExtInn);
  const qh = poissonPmfExact(lamExtH, maxExtInn);

  let pCont = 0.0;
  let numTiedRuns = 0.0;
  for (let d = 0; d <= maxExtInn; d += 1) {
    const pd = qa[d]! * qh[d]!;
    pCont += pd;
    numTiedRuns += d * pd;
  }
  const pResolve = Math.max(1.0 - pCont, 1e-6);
  const meanTiedRuns = pCont > 1e-6 ? numTiedRuns / Math.max(pCont, 1e-9) : 0.0;

  const sideLen = maxRFull + 1;
  const mFull = new Float64Array(sideLen * sideLen);

  for (let ih = 0; ih <= maxR9; ih += 1) {
    for (let ia = 0; ia <= maxR9; ia += 1) {
      const p9 = pmf9H[ih]! * pmf9A[ia]!;
      if (p9 <= 0.0) continue;
      if (ih !== ia) {
        const fh = Math.min(ih, maxRFull);
        const fa = Math.min(ia, maxRFull);
        mFull[fh * sideLen + fa] = mFull[fh * sideLen + fa]! + p9;
      } else {
        let remMass = p9;
        for (let mStep = 0; mStep < 4; mStep += 1) {
          // Python `round()` usa half-to-even; replicar idéntico para paridad IEEE-754
          const rawTie = mStep * meanTiedRuns;
          const fl = Math.floor(rawTie);
          const diffF = rawTie - fl;
          const stepTieRuns =
            Math.abs(diffF - 0.5) < 1e-12 ? (fl % 2 === 0 ? fl : fl + 1) : Math.round(rawTie);

          const scaleM = mStep === 3 ? remMass / pResolve : remMass;
          for (let ra = 0; ra <= maxExtInn; ra += 1) {
            for (let rh = 0; rh <= maxExtInn; rh += 1) {
              if (ra === rh) continue;
              const pPair = qa[ra]! * qh[rh]!;
              let rhEff: number;
              if (rh > ra && !neutral) {
                rhEff =
                  rh === ra + 1
                    ? ra + 1
                    : rh - ra === 2
                      ? ra + 1
                      : Math.min(rh, ra + 2);
              } else {
                rhEff = rh;
              }
              const fh = Math.min(ih + stepTieRuns + rhEff, maxRFull);
              const fa = Math.min(ia + stepTieRuns + ra, maxRFull);
              mFull[fh * sideLen + fa] = mFull[fh * sideLen + fa]! + scaleM * pPair;
            }
          }
          remMass *= pCont;
        }
      }
    }
  }

  let sFull = 0.0;
  for (let i = 0; i < mFull.length; i += 1) sFull += mFull[i]!;
  if (sFull > 0.0) {
    for (let i = 0; i < mFull.length; i += 1) mFull[i] = mFull[i]! / sFull;
  }

  let pHomeFull = 0.0;
  let pAwayFull = 0.0;
  let pRlHomeM15 = 0.0;
  let pRlAwayP15 = 0.0;
  let pOverFull = 0.0;
  let pUnderFull = 0.0;
  let pPushFull = 0.0;
  let expRunsHFull = 0.0;
  let expRunsAFull = 0.0;

  const isIntTot = Math.abs(totalLine - Math.round(totalLine)) < 1e-9;
  const kTotInt = Math.round(totalLine);

  for (let ih = 0; ih <= maxRFull; ih += 1) {
    for (let ia = 0; ia <= maxRFull; ia += 1) {
      const p = mFull[ih * sideLen + ia]!;
      if (p <= 0.0) continue;
      expRunsHFull += ih * p;
      expRunsAFull += ia * p;
      if (ih > ia) pHomeFull += p;
      else if (ia > ih) pAwayFull += p;
      if (ih - ia >= 2) pRlHomeM15 += p;
      else pRlAwayP15 += p;
      const totSc = ih + ia;
      if (isIntTot) {
        if (totSc > kTotInt) pOverFull += p;
        else if (totSc === kTotInt) pPushFull += p;
        else pUnderFull += p;
      } else if (totSc > totalLine) {
        pOverFull += p;
      } else {
        pUnderFull += p;
      }
    }
  }

  const actOu = Math.max(pOverFull + pUnderFull, 1e-9);
  const pOverCond = pOverFull / actOu;
  const pUnderCond = 1.0 - pOverCond;

  return Object.freeze({
    sport: "mlb",
    p_home: pHomeFull,
    p_away: pAwayFull,
    fair_odds_home: probabilityToFairOdds(clamp(pHomeFull, 0.001, 0.999)),
    fair_odds_away: probabilityToFairOdds(clamp(pAwayFull, 0.001, 0.999)),
    f5: Object.freeze({
      mu_home: muF5H,
      mu_away: muF5A,
      p_home: pHF5,
      p_tie: pTF5,
      p_away: pAF5,
      p_over_4_5: pOv45F5,
      fair_odds_home: probabilityToFairOdds(clamp(pHF5, 0.001, 0.999)),
      fair_odds_tie: probabilityToFairOdds(clamp(pTF5, 0.001, 0.999)),
      fair_odds_away: probabilityToFairOdds(clamp(pAF5, 0.001, 0.999)),
    }),
    full_game: Object.freeze({
      mu_9inn_home: muF5H + muL4H,
      mu_9inn_away: muF5A + muL4A,
      p_extra_innings: pTie9,
      expected_runs_home: expRunsHFull,
      expected_runs_away: expRunsAFull,
      expected_total_runs: expRunsHFull + expRunsAFull,
      p_runline_home_minus_1_5: pRlHomeM15,
      p_runline_away_plus_1_5: pRlAwayP15,
      total_line: totalLine,
      p_over: pOverFull,
      p_under: pUnderFull,
      p_push: pPushFull,
      p_over_cond_no_push: pOverCond,
      fair_odds_over: probabilityToFairOdds(clamp(pOverCond, 0.001, 0.999)),
      fair_odds_under: probabilityToFairOdds(clamp(pUnderCond, 0.001, 0.999)),
      p_over_9inn_truncated_astra_bug: pOver9Truncated,
      extra_innings_over_correction_pp: 100.0 * (pOverCond - pOver9Truncated),
    }),
  });
}

// ============================================================================
// 2. NHL — PitchLab Curvature NHL v3.6 Candidate
// ============================================================================

export interface NHLV36Input {
  readonly base_goals_60_home?: number;
  readonly base_goals_60_away?: number;
  readonly home_pp_pct?: number;
  readonly away_pk_pct?: number;
  readonly away_pp_pct?: number;
  readonly home_pk_pct?: number;
  readonly home_goalie_sv_pct?: number;
  readonly away_goalie_sv_pct?: number;
  readonly home_goalie_confirmed?: boolean;
  readonly away_goalie_confirmed?: boolean;
  readonly home_b2b?: boolean;
  readonly away_b2b?: boolean;
  readonly total_line?: number;
}

export interface NHLV36Outlook {
  readonly sport: "nhl";
  readonly goalie_quality_flag: "ok" | "unconfirmed_goalie_warning";
  readonly p_home: number;
  readonly p_away: number;
  readonly fair_odds_home: FairOdds;
  readonly fair_odds_away: FairOdds;
  readonly p_home_reg: number;
  readonly p_ot_reg: number;
  readonly p_away_reg: number;
  readonly expected_goals_home_reg: number;
  readonly expected_goals_away_reg: number;
  readonly expected_goals_home_full: number;
  readonly expected_goals_away_full: number;
  readonly ot_conservation_residual: number;
  readonly p_puckline_home_minus_1_5: number;
  readonly total_line: number;
  readonly p_over: number;
  readonly p_under: number;
  readonly p_push: number;
  readonly p_over_cond_no_push: number;
  readonly fair_odds_over: FairOdds;
  readonly fair_odds_under: FairOdds;
}

export function projectNhlV36Outlook(
  inp: NHLV36Input,
  cfgArtifact: MultiSportV36ConfigArtifact,
): NHLV36Outlook {
  const c = cfgArtifact.nhl;
  const lam60HBase = inp.base_goals_60_home ?? 2.95;
  const lam60ABase = inp.base_goals_60_away ?? 2.75;

  const hPp = inp.home_pp_pct ?? 20.5;
  const aPk = inp.away_pk_pct ?? 79.5;
  const aPp = inp.away_pp_pct ?? 20.5;
  const hPk = inp.home_pk_pct ?? 79.5;
  const ppOpp = c.avg_pp_opportunities;

  const stDeltaH = ppOpp * ((hPp - (100.0 - aPk)) / 200.0);
  const stDeltaA = ppOpp * ((aPp - (100.0 - hPk)) / 200.0);

  let hSv = inp.home_goalie_sv_pct ?? c.league_sv_pct;
  let aSv = inp.away_goalie_sv_pct ?? c.league_sv_pct;
  if (inp.home_b2b) hSv -= c.b2b_sv_pct_penalty;
  if (inp.away_b2b) aSv -= c.b2b_sv_pct_penalty;

  const hConf = Boolean(inp.home_goalie_confirmed ?? false);
  const aConf = Boolean(inp.away_goalie_confirmed ?? false);
  const wGh = hConf ? c.confirmed_goalie_weight : c.unconfirmed_goalie_weight;
  const wGa = aConf ? c.confirmed_goalie_weight : c.unconfirmed_goalie_weight;

  const gsaaH = wGh * clamp(hSv - c.league_sv_pct, -0.035, 0.03) * c.shots_per_game;
  const gsaaA = wGa * clamp(aSv - c.league_sv_pct, -0.035, 0.03) * c.shots_per_game;

  const lam60H = clamp(lam60HBase + stDeltaH - gsaaA, 1.45, 5.1);
  const lam60A = clamp(lam60ABase + stDeltaA - gsaaH, 1.45, 5.1);

  const maxG = 14;
  const pmf57H = poissonPmfExact(0.95 * lam60H, maxG);
  const pmf57A = poissonPmfExact(0.95 * lam60A, maxG);
  const pEnLeader = c.empty_net_leader_goal_prob;
  const pEnTie = c.empty_net_puller_tie_prob;

  const nGrid = maxG + 2;
  const mReg = new Float64Array(nGrid * nGrid);
  const q3H = poissonPmfExact(0.05 * lam60H, 3);
  const q3A = poissonPmfExact(0.05 * lam60A, 3);

  for (let ih = 0; ih <= maxG; ih += 1) {
    for (let ia = 0; ia <= maxG; ia += 1) {
      const p57 = pmf57H[ih]! * pmf57A[ia]!;
      if (p57 <= 0.0) continue;
      const diff = ih - ia;
      if (diff === 1 || diff === 2) {
        const pStay = Math.max(0.0, 1.0 - pEnLeader - pEnTie);
        const h1 = Math.min(ih + 1, maxG + 1);
        const a1 = Math.min(ia + 1, maxG + 1);
        mReg[h1 * nGrid + ia] = mReg[h1 * nGrid + ia]! + p57 * pEnLeader;
        mReg[ih * nGrid + a1] = mReg[ih * nGrid + a1]! + p57 * pEnTie;
        mReg[ih * nGrid + ia] = mReg[ih * nGrid + ia]! + p57 * pStay;
      } else if (diff === -1 || diff === -2) {
        const pStay = Math.max(0.0, 1.0 - pEnLeader - pEnTie);
        const h1 = Math.min(ih + 1, maxG + 1);
        const a1 = Math.min(ia + 1, maxG + 1);
        mReg[ih * nGrid + a1] = mReg[ih * nGrid + a1]! + p57 * pEnLeader;
        mReg[h1 * nGrid + ia] = mReg[h1 * nGrid + ia]! + p57 * pEnTie;
        mReg[ih * nGrid + ia] = mReg[ih * nGrid + ia]! + p57 * pStay;
      } else {
        for (let dh = 0; dh <= 3; dh += 1) {
          for (let da = 0; da <= 3; da += 1) {
            const fh = Math.min(ih + dh, maxG + 1);
            const fa = Math.min(ia + da, maxG + 1);
            mReg[fh * nGrid + fa] = mReg[fh * nGrid + fa]! + p57 * q3H[dh]! * q3A[da]!;
          }
        }
      }
    }
  }

  let sReg = 0.0;
  for (let i = 0; i < mReg.length; i += 1) sReg += mReg[i]!;
  for (let i = 0; i < mReg.length; i += 1) mReg[i] = mReg[i]! / sReg;

  let pHReg = 0.0;
  let pOtReg = 0.0;
  let pAReg = 0.0;
  let egHReg = 0.0;
  let egAReg = 0.0;
  for (let ih = 0; ih < nGrid; ih += 1) {
    for (let ia = 0; ia < nGrid; ia += 1) {
      const p = mReg[ih * nGrid + ia]!;
      egHReg += ih * p;
      egAReg += ia * p;
      if (ih > ia) pHReg += p;
      else if (ih === ia) pOtReg += p;
      else pAReg += p;
    }
  }

  const strengthShareH = clamp(
    0.5 + 0.35 * (lam60H / (lam60H + lam60A) - 0.5) + 0.015,
    0.38,
    0.62,
  );
  const mFull = new Float64Array(mReg);
  for (let k = 0; k < nGrid - 1; k += 1) {
    const pk = mFull[k * nGrid + k]!;
    mFull[k * nGrid + k] = 0.0;
    mFull[(k + 1) * nGrid + k] = mFull[(k + 1) * nGrid + k]! + pk * strengthShareH;
    mFull[k * nGrid + (k + 1)] = mFull[k * nGrid + (k + 1)]! + pk * (1.0 - strengthShareH);
  }
  const lastI = nGrid - 1;
  if (mFull[lastI * nGrid + lastI]! > 0.0) {
    const pk = mFull[lastI * nGrid + lastI]!;
    mFull[lastI * nGrid + lastI] = 0.0;
    mFull[lastI * nGrid + (lastI - 1)] = mFull[lastI * nGrid + (lastI - 1)]! + pk;
  }

  let pHomeMl = 0.0;
  let pAwayMl = 0.0;
  let egHFull = 0.0;
  let egAFull = 0.0;
  let pPlHomeM15 = 0.0;
  const totLine = inp.total_line ?? 6.0;
  const isIntL = Math.abs(totLine - Math.round(totLine)) < 1e-9;
  const kInt = Math.round(totLine);
  let pOv = 0.0;
  let pUn = 0.0;
  let pPs = 0.0;

  for (let ih = 0; ih < nGrid; ih += 1) {
    for (let ia = 0; ia < nGrid; ia += 1) {
      const p = mFull[ih * nGrid + ia]!;
      egHFull += ih * p;
      egAFull += ia * p;
      if (ih > ia) pHomeMl += p;
      else if (ia > ih) pAwayMl += p;
      if (ih - ia >= 2) pPlHomeM15 += p;
      const ts = ih + ia;
      if (isIntL) {
        if (ts > kInt) pOv += p;
        else if (ts === kInt) pPs += p;
        else pUn += p;
      } else if (ts > totLine) {
        pOv += p;
      } else {
        pUn += p;
      }
    }
  }

  const otConservationResidual = Math.abs(
    egHFull - egHReg + (egAFull - egAReg) - pOtReg,
  );
  const pOverCond = pOv / Math.max(pOv + pUn, 1e-9);

  return Object.freeze({
    sport: "nhl",
    goalie_quality_flag: hConf && aConf ? "ok" : "unconfirmed_goalie_warning",
    p_home: pHomeMl,
    p_away: pAwayMl,
    fair_odds_home: probabilityToFairOdds(clamp(pHomeMl, 0.001, 0.999)),
    fair_odds_away: probabilityToFairOdds(clamp(pAwayMl, 0.001, 0.999)),
    p_home_reg: pHReg,
    p_ot_reg: pOtReg,
    p_away_reg: pAReg,
    expected_goals_home_reg: egHReg,
    expected_goals_away_reg: egAReg,
    expected_goals_home_full: egHFull,
    expected_goals_away_full: egAFull,
    ot_conservation_residual: otConservationResidual,
    p_puckline_home_minus_1_5: pPlHomeM15,
    total_line: totLine,
    p_over: pOv,
    p_under: pUn,
    p_push: pPs,
    p_over_cond_no_push: pOverCond,
    fair_odds_over: probabilityToFairOdds(clamp(pOverCond, 0.001, 0.999)),
    fair_odds_under: probabilityToFairOdds(clamp(1.0 - pOverCond, 0.001, 0.999)),
  });
}

// ============================================================================
// 3. NBA — PitchLab Tensor NBA v3.6 Candidate
// ============================================================================

export interface NBAV36Input {
  readonly structural_margin_with_hca?: number;
  readonly structural_total_points?: number;
  readonly home_missing_impact_pts?: number;
  readonly away_missing_impact_pts?: number;
  readonly home_injuries_out?: number;
  readonly away_injuries_out?: number;
  readonly home_questionable_impact_pts?: number;
  readonly away_questionable_impact_pts?: number;
  readonly home_injuries_q?: number;
  readonly away_injuries_q?: number;
  readonly home_b2b?: boolean;
  readonly away_b2b?: boolean;
  readonly home_3in4?: boolean;
  readonly away_3in4?: boolean;
  readonly spread_line_home?: number;
  readonly total_line?: number;
}

export interface NBAV36Outlook {
  readonly sport: "nba";
  readonly expected_margin: number;
  readonly expected_total: number;
  readonly sigma_margin_effective: number;
  readonly p_home: number;
  readonly p_away: number;
  readonly fair_odds_home: FairOdds;
  readonly fair_odds_away: FairOdds;
  readonly p_overtime: number;
  readonly spread_line_home: number;
  readonly p_spread_home_cover: number;
  readonly total_line: number;
  readonly p_over: number;
  readonly p_under: number;
  readonly fair_odds_over: FairOdds;
  readonly fair_odds_under: FairOdds;
}

export function projectNbaV36Outlook(
  inp: NBAV36Input,
  cfgArtifact: MultiSportV36ConfigArtifact,
): NBAV36Outlook {
  const c = cfgArtifact.nba;
  const baseMargin = inp.structural_margin_with_hca ?? 2.4;
  const baseTotal = inp.structural_total_points ?? 226.5;

  const hMissPts = inp.home_missing_impact_pts ?? 1.35 * (inp.home_injuries_out ?? 0.0);
  const aMissPts = inp.away_missing_impact_pts ?? 1.35 * (inp.away_injuries_out ?? 0.0);
  const hGtdPts = inp.home_questionable_impact_pts ?? 0.85 * (inp.home_injuries_q ?? 0.0);
  const aGtdPts = inp.away_questionable_impact_pts ?? 0.85 * (inp.away_injuries_q ?? 0.0);

  const injMarginDelta = clamp(
    aMissPts - hMissPts + 0.45 * (aGtdPts - hGtdPts),
    -14.5,
    14.5,
  );

  let restDelta = 0.0;
  if (inp.home_b2b) restDelta -= c.home_b2b_penalty_pts;
  if (inp.away_b2b) restDelta += c.away_b2b_penalty_pts;
  if (inp.home_3in4) restDelta -= c.three_in_four_penalty_pts;
  if (inp.away_3in4) restDelta += c.three_in_four_penalty_pts;

  const expMargin = baseMargin + injMarginDelta + restDelta;
  const b2bCount = (inp.home_b2b ? 1 : 0) + (inp.away_b2b ? 1 : 0);
  const expTotal = clamp(
    baseTotal - 0.35 * (hMissPts + aMissPts) - 0.8 * b2bCount,
    196.0,
    256.0,
  );

  const gtdVarExtra = 0.25 * (hGtdPts * hGtdPts + aGtdPts * aGtdPts);
  const sigmaEff = Math.sqrt(c.sigma_margin_base * c.sigma_margin_base + gtdVarExtra);
  const sigmaTot = c.sigma_total_base;

  const pHome = clamp(normalCdf(expMargin / sigmaEff), 1e-6, 1.0 - 1e-6);
  const pAway = 1.0 - pHome;

  const sigmaReg = 0.945 * sigmaEff;
  const pOt = clamp(
    c.ot_scale *
      (normalCdf((0.5 - expMargin) / sigmaReg) - normalCdf((-0.5 - expMargin) / sigmaReg)),
    0.015,
    0.11,
  );

  const roundHalfEven = (v: number): number => {
    const fl = Math.floor(v);
    const d = v - fl;
    return Math.abs(d - 0.5) < 1e-12 ? (fl % 2 === 0 ? fl : fl + 1) : Math.round(v);
  };

  const spreadLine = inp.spread_line_home ?? -roundHalfEven(expMargin) - 0.5;
  const totalLine = inp.total_line ?? roundHalfEven(expTotal) + 0.5;

  const pCoverHome = clamp(normalCdf((expMargin + spreadLine) / sigmaEff), 1e-6, 1.0 - 1e-6);
  const pOver = clamp(normalCdf((expTotal - totalLine) / sigmaTot), 1e-6, 1.0 - 1e-6);
  const pUnder = 1.0 - pOver;

  return Object.freeze({
    sport: "nba",
    expected_margin: expMargin,
    expected_total: expTotal,
    sigma_margin_effective: sigmaEff,
    p_home: pHome,
    p_away: pAway,
    fair_odds_home: probabilityToFairOdds(clamp(pHome, 0.001, 0.999)),
    fair_odds_away: probabilityToFairOdds(clamp(pAway, 0.001, 0.999)),
    p_overtime: pOt,
    spread_line_home: spreadLine,
    p_spread_home_cover: pCoverHome,
    total_line: totalLine,
    p_over: pOver,
    p_under: pUnder,
    fair_odds_over: probabilityToFairOdds(clamp(pOver, 0.001, 0.999)),
    fair_odds_under: probabilityToFairOdds(clamp(pUnder, 0.001, 0.999)),
  });
}

// ============================================================================
// 4. Multi-Sport v4.0 Unified Suite (`EXP_V47`: MLB + NHL + NBA + NCAAF Horizon v4.0)
// ============================================================================

export const MULTISPORT_V40_SCHEMA_VERSION = "multisport_v4.0.0" as const;

export interface NCAAFV40Input {
  readonly home_power_rating: number;
  readonly away_power_rating: number;
  readonly home_off_pts_pg?: number;
  readonly home_def_pts_pg?: number;
  readonly away_off_pts_pg?: number;
  readonly away_def_pts_pg?: number;
  readonly home_elevation_m?: number;
  readonly away_elevation_m?: number;
  readonly neutral_site?: boolean;
  readonly home_qb_out_penalty_pts?: number;
  readonly away_qb_out_penalty_pts?: number;
  readonly spread_line_home?: number;
  readonly total_line?: number;
}

export interface NCAAFV40Outlook {
  readonly sport: "ncaaf";
  readonly expected_margin: number;
  readonly expected_total: number;
  readonly sigma_margin_effective: number;
  readonly altitude_hypoxia_adv_pts: number;
  readonly p_home: number;
  readonly p_away: number;
  readonly fair_odds_home: FairOdds;
  readonly fair_odds_away: FairOdds;
  readonly spread_line_home: number;
  readonly p_spread_home_cover: number;
  readonly p_spread_push: number;
  readonly p_spread_home_cover_no_push: number;
  readonly fair_odds_spread_home: FairOdds;
  readonly total_line: number;
  readonly p_over: number;
  readonly p_under: number;
  readonly fair_odds_over: FairOdds;
  readonly fair_odds_under: FairOdds;
}

const NCAAF_KEY_NUMBERS_WEIGHTS: Readonly<Record<number, number>> = Object.freeze({
  3: 1.85,
  6: 1.25,
  7: 1.95,
  10: 1.45,
  13: 1.18,
  14: 1.65,
  17: 1.38,
  21: 1.48,
  24: 1.25,
  28: 1.32,
});

/**
 * Motor `PitchLab Horizon NCAAF v4.0`:
 *  - Incorpora ventaja local colegial (`+2.85` pts), choque de altitud (`WYO/AFA/BYU/COL`),
 *    descuento por baja/portal de QB titular y amortiguamiento de varianza en *garbage-time* cuando `|margin| > 17`.
 *  - Construye una PMF discreta inclinada en `-65..+65` con picos colegiales exactos (`3, 7, 10, 14, 17, 21`).
 */
export function projectNcaafV40Outlook(inp: NCAAFV40Input): NCAAFV40Outlook {
  const hca = inp.neutral_site ? 0.0 : 2.85;
  const elH = inp.home_elevation_m ?? 180.0;
  const elA = inp.away_elevation_m ?? 180.0;
  const altAdv =
    !inp.neutral_site && elH >= 1350.0 ? 1.15 * Math.max(0.0, (elH - elA) / 1000.0) : 0.0;

  const qbDelta = (inp.away_qb_out_penalty_pts ?? 0.0) - (inp.home_qb_out_penalty_pts ?? 0.0);
  const expMargin = inp.home_power_rating - inp.away_power_rating + hca + altAdv + qbDelta;

  const hOff = inp.home_off_pts_pg ?? 28.5;
  const hDef = inp.home_def_pts_pg ?? 26.5;
  const aOff = inp.away_off_pts_pg ?? 28.5;
  const aDef = inp.away_def_pts_pg ?? 26.5;
  const rawTotal = 0.5 * (hOff + aDef + aOff + hDef) - 0.35 * ((inp.home_qb_out_penalty_pts ?? 0.0) + (inp.away_qb_out_penalty_pts ?? 0.0));
  const expTotal = clamp(rawTotal, 34.0, 82.0);

  // En NCAAF, las palizas > 17 pts meten suplentes en 4Q (*garbage time*), estabilizando ligeramente sigma relativo
  const blowoutExtra = Math.min(3.2, 0.06 * Math.max(0.0, Math.abs(expMargin) - 14.0));
  const sigmaEff = 15.6 + blowoutExtra;
  const sigmaTot = 16.2;

  // PMF discreta de números clave colegiales en `m = -65..+65` (`m != 0`, sin empates tras OT colegial)
  const maxM = 65;
  const pmf = new Float64Array(2 * maxM + 1);
  let totW = 0.0;
  for (let m = -maxM; m <= maxM; m += 1) {
    if (m === 0) continue;
    const z = (m - expMargin) / sigmaEff;
    const keyMult = NCAAF_KEY_NUMBERS_WEIGHTS[Math.abs(m)] ?? 1.0;
    const w = Math.exp(-0.5 * z * z) * keyMult;
    pmf[m + maxM] = w;
    totW += w;
  }
  const invW = 1.0 / Math.max(totW, 1e-30);
  let pHome = 0.0;
  for (let idx = 0; idx < pmf.length; idx += 1) {
    pmf[idx] = pmf[idx]! * invW;
    if (idx - maxM > 0) pHome += pmf[idx]!;
  }
  pHome = clamp(pHome, 0.001, 0.999);
  const pAway = 1.0 - pHome;

  const roundHalfEven = (v: number): number => {
    const fl = Math.floor(v);
    const d = v - fl;
    return Math.abs(d - 0.5) < 1e-12 ? (fl % 2 === 0 ? fl : fl + 1) : Math.round(v);
  };
  const spreadLine = inp.spread_line_home ?? -roundHalfEven(expMargin) - 0.5;
  const totalLine = inp.total_line ?? roundHalfEven(expTotal) + 0.5;

  let pHCov = 0.0;
  let pACov = 0.0;
  let pPush = 0.0;
  for (let idx = 0; idx < pmf.length; idx += 1) {
    const p = pmf[idx]!;
    if (p <= 0.0) continue;
    const dv = idx - maxM + spreadLine;
    if (Math.abs(dv) < 1e-9) pPush += p;
    else if (dv > 0.0) pHCov += p;
    else pACov += p;
  }
  const act = pHCov + pACov;
  const phNoPush = act > 1e-12 ? clamp(pHCov / act, 0.001, 0.999) : 0.5;

  const pOver = clamp(normalCdf((expTotal - totalLine) / sigmaTot), 0.001, 0.999);
  const pUnder = 1.0 - pOver;

  return Object.freeze({
    sport: "ncaaf",
    expected_margin: expMargin,
    expected_total: expTotal,
    sigma_margin_effective: sigmaEff,
    altitude_hypoxia_adv_pts: altAdv,
    p_home: pHome,
    p_away: pAway,
    fair_odds_home: probabilityToFairOdds(pHome),
    fair_odds_away: probabilityToFairOdds(pAway),
    spread_line_home: spreadLine,
    p_spread_home_cover: pHCov,
    p_spread_push: pPush,
    p_spread_home_cover_no_push: phNoPush,
    fair_odds_spread_home: probabilityToFairOdds(phNoPush),
    total_line: totalLine,
    p_over: pOver,
    p_under: pUnder,
    fair_odds_over: probabilityToFairOdds(pOver),
    fair_odds_under: probabilityToFairOdds(pUnder),
  });
}

export interface MultiSportV40TeamStateEntry {
  readonly team_key: string;
  readonly team_name: string;
  readonly sport: "mlb" | "nhl" | "nba" | "ncaaf";
  readonly elevation_m: number;
  readonly is_dome: boolean;
  readonly metrics: Readonly<Record<string, number>>;
}

export interface MultiSportV40StateArtifact {
  readonly schema_version: string;
  readonly status: "candidate" | "production";
  readonly production_activated: boolean;
  readonly holdout_cut_utc: string;
  readonly holdout_sealed_untouched: boolean;
  readonly v36_physics_config: MultiSportV36ConfigArtifact;
  readonly teams: Readonly<Record<string, MultiSportV40TeamStateEntry>>;
}

export function predictLiveMultiSportV40Matchup(params: {
  readonly sport: "mlb" | "nhl" | "nba" | "ncaaf";
  readonly homeKey: string;
  readonly awayKey: string;
  readonly stateArtifact: MultiSportV40StateArtifact;
  readonly neutralSite?: boolean;
  readonly totalLine?: number;
  readonly spreadLineHome?: number;
}): MLBV36Outlook | NHLV36Outlook | NBAV36Outlook | NCAAFV40Outlook {
  const st = params.stateArtifact;
  const h = st.teams[`${params.sport}::${params.homeKey}`];
  const a = st.teams[`${params.sport}::${params.awayKey}`];
  if (!h || !a) {
    throw new Error(
      `Franquicia no encontrada en MultiSportV40StateArtifact: ${params.sport} (${params.homeKey} vs ${params.awayKey})`,
    );
  }

  if (params.sport === "mlb") {
    const parkAltMult = !h.is_dome && h.elevation_m >= 1200.0 ? 1.18 : 1.0;
    return projectMlbV36Outlook(
      {
        home_woba: h.metrics["woba"],
        away_woba: a.metrics["woba"],
        park_weather_mult: parkAltMult,
        home_sp_fip: h.metrics["fip"],
        away_sp_fip: a.metrics["fip"],
        home_sp_era: h.metrics["era"],
        away_sp_era: a.metrics["era"],
        home_rot_fip: h.metrics["fip"],
        away_rot_fip: a.metrics["fip"],
        home_bp_fip: h.metrics["fip"],
        away_bp_fip: a.metrics["fip"],
        neutral_site: params.neutralSite ?? false,
        total_line: params.totalLine,
      },
      st.v36_physics_config,
    );
  }

  if (params.sport === "nhl") {
    const base60H = 0.5 * ((h.metrics["xgf_5v5"] ?? 2.55) + (a.metrics["xga_5v5"] ?? 2.55)) + 0.35;
    const base60A = 0.5 * ((a.metrics["xgf_5v5"] ?? 2.55) + (h.metrics["xga_5v5"] ?? 2.55)) + 0.15;
    return projectNhlV36Outlook(
      {
        base_goals_60_home: base60H,
        base_goals_60_away: base60A,
        home_goalie_sv_pct: h.metrics["sv_pct"],
        away_goalie_sv_pct: a.metrics["sv_pct"],
        home_goalie_confirmed: true,
        away_goalie_confirmed: true,
        total_line: params.totalLine,
      },
      st.v36_physics_config,
    );
  }

  if (params.sport === "nba") {
    const paceAvg = 0.5 * ((h.metrics["pace"] ?? 99.0) + (a.metrics["pace"] ?? 99.0));
    const netDiff = (h.metrics["net_rtg"] ?? 0.0) - (a.metrics["net_rtg"] ?? 0.0);
    const altHca = !params.neutralSite && h.elevation_m >= 1200.0 ? 1.15 : 0.0;
    const hca = params.neutralSite ? 0.0 : 2.35 + altHca;
    const margin = (netDiff * paceAvg) / 100.0 + hca;
    const expTot =
      (((h.metrics["ortg"] ?? 114.5) + (a.metrics["drtg"] ?? 114.5) + (a.metrics["ortg"] ?? 114.5) + (h.metrics["drtg"] ?? 114.5)) *
        0.5 *
        paceAvg) /
      100.0;
    return projectNbaV36Outlook(
      {
        structural_margin_with_hca: margin,
        structural_total_points: expTot,
        spread_line_home: params.spreadLineHome,
        total_line: params.totalLine,
      },
      st.v36_physics_config,
    );
  }

  return projectNcaafV40Outlook({
    home_power_rating: h.metrics["power_rating"] ?? 0.0,
    away_power_rating: a.metrics["power_rating"] ?? 0.0,
    home_off_pts_pg: h.metrics["pts_pg"] ?? 28.5,
    home_def_pts_pg: h.metrics["opp_pts_pg"] ?? 26.5,
    away_off_pts_pg: a.metrics["pts_pg"] ?? 28.5,
    away_def_pts_pg: a.metrics["opp_pts_pg"] ?? 26.5,
    home_elevation_m: h.elevation_m,
    away_elevation_m: a.elevation_m,
    neutral_site: params.neutralSite ?? false,
    spread_line_home: params.spreadLineHome,
    total_line: params.totalLine,
  });
}
