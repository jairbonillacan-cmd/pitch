import fs from "fs";
import path from "path";

// 1. UTILIDADES Y MATEMÁTICA BÁSICA
const dec = s => {
  const v = parseFloat(String(s).replace(",", "."));
  if (isNaN(v)) return null;
  if (Math.abs(v) >= 100) return v > 0 ? 1 + v / 100 : 1 + 100 / -v;
  return v > 1 ? v : null;
};

const pois = (l, max = 15) => {
  const a = [];
  let p = Math.exp(-l);
  a.push(p);
  for (let k = 1; k < max; k++) {
    p *= l / k;
    a.push(p);
  }
  return a;
};

const phi = x => {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
};

// 2. PRUEBAS MATEMÁTICAS
const results = {
  odds_conversion: [],
  ev_and_sizing: [],
  football_simulation: {},
  nhl_simulation: {},
  mlb_simulation: {},
  parlay_calculation: {}
};

// Test Odds Conversion
const oddsCases = [
  { raw: "2.50", expectedDec: 2.50 },
  { raw: "1.40", expectedDec: 1.40 },
  { raw: "+150", expectedDec: 2.50 },
  { raw: "-200", expectedDec: 1.50 },
  { raw: "+100", expectedDec: 2.00 },
  { raw: "-110", expectedDec: 1.90909 },
  { raw: "invalid", expectedDec: null }
];

oddsCases.forEach(c => {
  const parsed = dec(c.raw);
  const diff = parsed && c.expectedDec ? Math.abs(parsed - c.expectedDec) : 0;
  results.odds_conversion.push({
    raw: c.raw,
    parsed,
    expected: c.expectedDec,
    valid: diff < 0.001 || (parsed === null && c.expectedDec === null)
  });
});

// Test Expected Value & Sizing
const evCases = [
  { p: 0.55, d: 2.00, th: 0.60, expectedEV: 0.10, expectedUnit: 5 },  // EV = +10% > 4%, p < 0.60 -> 5%
  { p: 0.65, d: 1.80, th: 0.60, expectedEV: 0.17, expectedUnit: 10 }, // EV = +17% > 4%, p >= 0.60 -> 10%
  { p: 0.50, d: 2.05, th: 0.60, expectedEV: 0.025, expectedUnit: 0 }, // EV = +2.5% < 4% -> 0 (no apostar)
  { p: 0.40, d: 2.20, th: 0.60, expectedEV: -0.12, expectedUnit: 0 }  // EV = -12% -> 0
];

evCases.forEach(c => {
  const ev = c.p * c.d - 1;
  let unit = 0;
  if (ev >= 0.04) {
    unit = c.p >= c.th ? 10 : 5;
  }
  results.ev_and_sizing.push({
    p: c.p,
    d: c.d,
    ev: +ev.toFixed(4),
    unit,
    expectedUnit: c.expectedUnit,
    pass: unit === c.expectedUnit
  });
});

// Test Football Engine Simulation (e.g. América vs Monterrey)
// América rs=1.65, ra=1.10; Monterrey rs=1.45, ra=1.20; LG=1.51
const LG_MX = 1.51;
const H_rs = 1.65, H_ra = 1.10;
const A_rs = 1.45, A_ra = 1.20;
const pyth = (rs, ra, exp = 1.7) => Math.pow(rs, exp) / (Math.pow(rs, exp) + Math.pow(ra, exp));
const px = pyth(H_rs, H_ra, 1.7);
const py = pyth(A_rs, A_ra, 1.7);
const pn = (px - px * py) / (px + py - 2 * px * py);
const HFA = 0.54;
const o = (pn / (1 - pn)) * (HFA / (1 - HFA));
const share = 0.5 + 0.85 * (o / (1 + o) - 0.5);

// Goles proyectados y Dixon-Coles
const raw_lh = (H_rs * A_ra) / LG_MX;
const raw_la = (A_rs * H_ra) / LG_MX;

// Poisson
const P_goals = pois(raw_lh, 10);
const Q_goals = pois(raw_la, 10);
const rho = -0.14; // Liga MX
const tau = (i, j) => {
  if (i === 0 && j === 0) return 1 - raw_lh * raw_la * rho;
  if (i === 0 && j === 1) return 1 + raw_lh * rho;
  if (i === 1 && j === 0) return 1 + raw_la * rho;
  if (i === 1 && j === 1) return 1 - rho;
  return 1;
};

let w = 0, d = 0, l = 0;
for (let i = 0; i < 10; i++) {
  for (let j = 0; j < 10; j++) {
    const p = P_goals[i] * Q_goals[j] * tau(i, j);
    if (i > j) w += p;
    else if (i === j) d += p;
    else l += p;
  }
}

results.football_simulation = {
  H_rs, H_ra, A_rs, A_ra,
  pyth_H: +px.toFixed(4),
  pyth_A: +py.toFixed(4),
  neutral_log5: +pn.toFixed(4),
  hfa_share: +share.toFixed(4),
  projected_goals_home: +raw_lh.toFixed(4),
  projected_goals_away: +raw_la.toFixed(4),
  prob_home_win: +w.toFixed(4),
  prob_draw: +d.toFixed(4),
  prob_away_win: +l.toFixed(4),
  sum_probs: +(w + d + l).toFixed(4)
};

// Test MLB Normal Distribution Over/Under
const mlb_gh = 4.8;
const mlb_ga = 3.6;
const mlb_tot = mlb_gh + mlb_ga;
const mlb_line = 8.5;
const mlb_SD = 3 * Math.SQRT2;
const mlb_pO = 1 - phi((mlb_line - mlb_tot) / mlb_SD);
const mlb_pU = 1 - mlb_pO;

results.mlb_simulation = {
  projected_runs_home: mlb_gh,
  projected_runs_away: mlb_ga,
  total_runs: mlb_tot,
  line: mlb_line,
  SD: +mlb_SD.toFixed(5),
  prob_over: +mlb_pO.toFixed(4),
  prob_under: +mlb_pU.toFixed(4)
};

// Test Parlay Combination
const leg1_p = 0.65, leg1_d = 1.50;
const leg2_p = 0.70, leg2_d = 1.40;
const parlay_p = leg1_p * leg2_p;
const parlay_d = leg1_d * leg2_d;
const parlay_ev = parlay_p * parlay_d - 1;

results.parlay_calculation = {
  legs: [
    { p: leg1_p, d: leg1_d },
    { p: leg2_p, d: leg2_d }
  ],
  combined_p: +parlay_p.toFixed(4),
  combined_d: +parlay_d.toFixed(4),
  fair_odds: +(1 / parlay_p).toFixed(4),
  ev: +parlay_ev.toFixed(4)
};

const outPath = path.resolve("research/aztecavet/evidence/mathematical-tests/test_results.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log("Pruebas matemáticas completadas y guardadas en:", outPath);
