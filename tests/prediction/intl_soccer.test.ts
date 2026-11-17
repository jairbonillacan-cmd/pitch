/**
 * Suite de paridad TS <-> Python (`< 1e-12`), física internacional, puente Club -> Selección
 * y cumplimiento de `CONTRACT_OUTLOOK.md` para `PitchLab Meridian v1.0` (`EXP_V33_intl_soccer`).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import intlCalibrationJson from "../../src/data/prediction/intl_outlook_calibration_v1.json";
import intlCalibrationV2Json from "../../src/data/prediction/intl_outlook_calibration_v2.json";
import intlCausalStateJson from "../../src/data/prediction/intl_soccer_causal_state.json";
import intlCausalStateV2Json from "../../src/data/prediction/intl_soccer_causal_state_v2.json";
import intlSnapshotJson from "../../src/data/prediction/intl_soccer_snapshot.json";
import intlSnapshotV2Json from "../../src/data/prediction/intl_soccer_snapshot_v2.json";
import intlSnapshotV3Json from "../../src/data/prediction/intl_soccer_snapshot_v3.json";
import intlModelJson from "../../src/data/prediction/model_intl_soccer_v1.json";
import intlModelV2Json from "../../src/data/prediction/model_intl_soccer_v2.json";
import intlModelV3Json from "../../src/data/prediction/model_intl_soccer_v3.json";

import { assertValidModel } from "../../src/domain/prediction/engine.js";
import {
  buildIntlMatchOutlook,
  computeSquadClubAdjustment,
  computeThermalClimateMismatch,
  getDefaultIntlCalibrationArtifact,
  getDefaultIntlCausalStateArtifact,
  getDefaultIntlModelArtifact,
  getMeridianV1Artifacts,
  getMeridianV3Artifacts,
  getMeridianV3CausalStateArtifact,
  INTL_BASE_38_FEATURES,
  INTL_DIV_LEVELS,
  INTL_V2_49_FEATURES,
  INTL_V3_53_FEATURES,
  isaPressureHpa,
  MERIDIAN_MODEL_CODENAME,
  MERIDIAN_V3_MODEL_CODENAME,
  predictIntlSoccer1X2,
  resolveIntlTournamentRegime,
  resolveNationalTeamCode,
  synthesizeIntlMatchSnapshotRow,
  type IntlCausalStateArtifact,
} from "../../src/domain/prediction/intl_soccer.js";
import type { OutlookCalibrationArtifact } from "../../src/domain/prediction/outlook.js";
import type { ModelArtifact, SnapshotRow } from "../../src/domain/prediction/types.js";

const REPO_ROOT = resolve(__dirname, "../..");
const PROD_SEGMENTS_PATH = resolve(REPO_ROOT, "src/data/prediction/production_segments_v3_1.json");
const FROZEN_PROD_SEGMENTS_SHA256 =
  "0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc";

const FORBIDDEN_OUTLOOK_KEYS = new Set([
  "stake",
  "kelly",
  "kellyfraction",
  "expectededge",
  "edge",
  "ev",
  "value",
  "valuestatus",
  "tier",
]);

const intlModel = intlModelJson as unknown as ModelArtifact & {
  status: string;
  production_activated: boolean;
};
const intlState = intlCausalStateJson as unknown as IntlCausalStateArtifact;
const intlCal = intlCalibrationJson as unknown as OutlookCalibrationArtifact;
const intlSnap = intlSnapshotJson as unknown as {
  n: number;
  rows: Record<
    string,
    SnapshotRow & {
      probs_python: readonly [number, number, number];
      dc_lam_home_python: number;
      dc_lam_away_python: number;
      dc_rho: number;
    }
  >;
};

const intlModelV2 = intlModelV2Json as unknown as ModelArtifact & {
  status: string;
  production_activated: boolean;
};
const intlStateV2 = intlCausalStateV2Json as unknown as IntlCausalStateArtifact;
const intlCalV2 = intlCalibrationV2Json as unknown as OutlookCalibrationArtifact;
const intlSnapV2 = intlSnapshotV2Json as unknown as {
  n: number;
  rows: Record<
    string,
    SnapshotRow & {
      probs_python: readonly [number, number, number];
    }
  >;
};

const intlModelV3 = intlModelV3Json as unknown as ModelArtifact & {
  status: string;
  production_activated: boolean;
};
const intlSnapV3 = intlSnapshotV3Json as unknown as {
  n: number;
  rows: Record<
    string,
    SnapshotRow & {
      probs_python: readonly [number, number, number];
    }
  >;
};

function resolvePythonBin(): string {
  const candidates = [
    "C:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/prediction-lab/research/prediction-lab/.venv/Scripts/python.exe",
    resolve(REPO_ROOT, "research/prediction-lab/.venv/Scripts/python.exe"),
    resolve(REPO_ROOT, "research/prediction-lab/.venv/bin/python"),
    "python",
  ];
  for (const c of candidates) {
    if (c === "python" || existsSync(c)) return c;
  }
  return "python";
}

function assertNoForbiddenKeys(obj: unknown, path = "root"): void {
  if (obj === null || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => assertNoForbiddenKeys(item, `${path}[${idx}]`));
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    expect(FORBIDDEN_OUTLOOK_KEYS.has(k.toLowerCase()), `Clave prohibida en ${path}.${k}`).toBe(false);
    assertNoForbiddenKeys(v, `${path}.${k}`);
  }
}

describe("EXP_V33_intl_soccer — Gobernanza y contrato ModelArtifact (engine.ts intacto)", () => {
  it("valida model_intl_soccer_v1.json con engine.ts::assertValidModel y preserva production_segments_v3_1.json", () => {
    expect(() => assertValidModel(intlModel)).not.toThrow();
    expect(intlModel.codename).toBe("PitchLab Meridian v1.0");
    expect(intlModel.status).toBe("candidate");
    expect(intlModel.production_activated).toBe(false);
    expect(intlModel.n_features_base).toBe(INTL_BASE_38_FEATURES.length);
    expect(intlModel.div_levels).toEqual([...INTL_DIV_LEVELS]);

    const shaProd = createHash("sha256").update(readFileSync(PROD_SEGMENTS_PATH)).digest("hex");
    expect(shaProd).toBe(FROZEN_PROD_SEGMENTS_SHA256);
  });

  it("alcanza paridad exacta TS <-> Python (< 1e-12) en los 200 partidos de intl_soccer_snapshot.json", () => {
    const entries = Object.entries(intlSnap.rows);
    expect(entries.length).toBeGreaterThanOrEqual(100);

    let maxAbsDiff = 0.0;
    for (const [, row] of entries) {
      const pred = predictIntlSoccer1X2(row, intlModel);
      const dH = Math.abs(pred.pHome - row.probs_python[0]);
      const dD = Math.abs(pred.pDraw - row.probs_python[1]);
      const dA = Math.abs(pred.pAway - row.probs_python[2]);
      maxAbsDiff = Math.max(maxAbsDiff, dH, dD, dA);
      expect(Math.abs(pred.pHome + pred.pDraw + pred.pAway - 1.0)).toBeLessThan(1e-12);
    }
    expect(maxAbsDiff).toBeLessThan(1e-12);
  });

  it("valida PitchLab Meridian v2.0 (49 features base) como motor por defecto y alcanza paridad < 1e-12 en intl_soccer_snapshot_v2.json", () => {
    expect(() => assertValidModel(intlModelV2)).not.toThrow();
    expect(getDefaultIntlModelArtifact().codename).toBe(MERIDIAN_MODEL_CODENAME);
    expect(intlModelV2.codename).toBe("PitchLab Meridian v2.0");
    expect(intlModelV2.status).toBe("candidate");
    expect(intlModelV2.production_activated).toBe(false);
    expect(intlModelV2.n_features_base).toBe(INTL_V2_49_FEATURES.length);
    expect(intlModelV2.div_levels).toEqual([...INTL_DIV_LEVELS]);
    expect(getDefaultIntlCausalStateArtifact().n_features_base).toBe(49);
    expect(getDefaultIntlCalibrationArtifact().holdout_sealed_untouched).toBe(true);
    expect(getMeridianV1Artifacts().model?.codename).toBe("PitchLab Meridian v1.0");

    const entriesV2 = Object.entries(intlSnapV2.rows);
    expect(entriesV2.length).toBeGreaterThanOrEqual(150);

    let maxAbsDiffV2 = 0.0;
    for (const [, row] of entriesV2) {
      const pred = predictIntlSoccer1X2(row, intlModelV2);
      const dH = Math.abs(pred.pHome - row.probs_python[0]);
      const dD = Math.abs(pred.pDraw - row.probs_python[1]);
      const dA = Math.abs(pred.pAway - row.probs_python[2]);
      maxAbsDiffV2 = Math.max(maxAbsDiffV2, dH, dD, dA);
      expect(Math.abs(pred.pHome + pred.pDraw + pred.pAway - 1.0)).toBeLessThan(1e-12);
    }
    expect(maxAbsDiffV2).toBeLessThan(1e-12);
  });

  it("valida PitchLab Meridian v3.0 (53 features base: copas élite CC0 + Banco Mundial PDDL/CC-BY-4.0) con paridad < 1e-12", () => {
    expect(() => assertValidModel(intlModelV3)).not.toThrow();
    expect(getMeridianV3Artifacts().model?.codename).toBe(MERIDIAN_V3_MODEL_CODENAME);
    expect(intlModelV3.status).toBe("candidate");
    expect(intlModelV3.production_activated).toBe(false);
    expect(intlModelV3.n_features_base).toBe(INTL_V3_53_FEATURES.length);

    let maxAbsDiffV3 = 0.0;
    for (const [, row] of Object.entries(intlSnapV3.rows)) {
      const pred = predictIntlSoccer1X2(row, intlModelV3);
      maxAbsDiffV3 = Math.max(
        maxAbsDiffV3,
        Math.abs(pred.pHome - row.probs_python[0]),
        Math.abs(pred.pDraw - row.probs_python[1]),
        Math.abs(pred.pAway - row.probs_python[2]),
      );
    }
    expect(maxAbsDiffV3).toBeLessThan(1e-12);

    const pyBin = resolvePythonBin();
    const pyScriptV3 = `
import json, sys
sys.path.insert(0, ${JSON.stringify(resolve(REPO_ROOT, "research/prediction-lab/experiments/EXP_V33_intl_soccer"))})
from run_meridian_v3_experiment import synthesize_live_intl_v3_row
st3 = json.load(open(${JSON.stringify(resolve(REPO_ROOT, "src/data/prediction/intl_soccer_causal_state_v3.json"))}, encoding="utf-8"))
r = synthesize_live_intl_v3_row(
    home_team="Marruecos",
    away_team="España",
    regime="INTL_WC",
    match_date_iso="2026-07-02",
    causal_states_v3=st3["teams"],
    selected_extra_v3_cols=tuple(st3["v3_extra_features"]),
    city="East Rutherford",
    country="United States",
    is_neutral=True,
)
print(json.dumps(r))
`;
    const procV3 = spawnSync(pyBin, ["-B", "-c", pyScriptV3], { encoding: "utf-8", timeout: 60_000 });
    expect(procV3.status, procV3.stderr).toBe(0);
    const pyRowV3 = JSON.parse(procV3.stdout) as { features: number[]; div_onehot: number[] };

    const tsSynV3 = synthesizeIntlMatchSnapshotRow({
      homeTeam: "Marruecos",
      awayTeam: "España",
      tournament: "FIFA World Cup",
      matchDateUtc: "2026-07-02",
      venue: { city: "East Rutherford", country: "United States", isNeutral: true },
      causalState: getMeridianV3CausalStateArtifact(),
      nFeaturesBase: 53,
    });
    expect(tsSynV3.row.features).toHaveLength(53);
    for (let j = 0; j < INTL_V3_53_FEATURES.length; j += 1) {
      expect(
        Math.abs((tsSynV3.row.features[j] as number) - pyRowV3.features[j]!),
        `Feature v3 ${INTL_V3_53_FEATURES[j]}`,
      ).toBeLessThan(1e-12);
    }

    const outV3 = buildIntlMatchOutlook(
      {
        matchId: "INTL_MAR_ESP_V3",
        homeTeam: "Marruecos",
        awayTeam: "España",
        tournament: "FIFA World Cup",
        matchDateUtc: "2026-07-02T20:00:00Z",
        tsDecisionUtc: "2026-07-02T18:00:00Z",
        venue: { city: "East Rutherford", country: "United States", isNeutral: true },
      },
      getMeridianV3Artifacts(),
    );
    expect(outV3.outlook.markets).toHaveLength(11);
    expect(outV3.outlook.dataQuality.coverageRatio).toBe(1.0);
    expect(outV3.outlook.dataQuality.flag).toBe("ok");
  });
});

describe("EXP_V33_intl_soccer — Paridad en vivo TS <-> Python (< 1e-12) en síntesis causal y puente Club->Selección", () => {
  it("reproduce bit a bit (< 1e-12) las 38 features, lambdas y ajuste de convocatoria frente a Python", () => {
    const pyBin = resolvePythonBin();
    const cases = [
      {
        homeTeam: "BOL",
        awayTeam: "BRA",
        tournament: "FIFA World Cup qualification",
        matchDateUtc: "2026-11-18",
        city: "El Alto",
        country: "Bolivia",
        isNeutral: false,
      },
      {
        homeTeam: "México",
        awayTeam: "Colombia",
        tournament: "Friendly",
        matchDateUtc: "2026-11-18",
        city: "Arlington",
        country: "United States",
        isNeutral: true,
      },
      {
        homeTeam: "España",
        awayTeam: "Francia",
        tournament: "UEFA Nations League",
        matchDateUtc: "2026-11-19",
        city: "Munich",
        country: "Germany",
        isNeutral: true,
      },
      {
        homeTeam: "Argentina",
        awayTeam: "Uruguay",
        tournament: "Copa América",
        matchDateUtc: "2026-11-20",
        city: "Miami Gardens",
        country: "United States",
        isNeutral: true,
      },
    ];

    const pyScript = `
import json, sys
sys.path.insert(0, ${JSON.stringify(resolve(REPO_ROOT, "research/prediction-lab/experiments/EXP_V33_intl_soccer"))})
from intl_causal_features import synthesize_live_intl_row, compute_squad_club_adjustment
from intl_ingest import classify_intl_tournament

state = json.load(open(${JSON.stringify(resolve(REPO_ROOT, "src/data/prediction/intl_soccer_causal_state.json"))}, encoding="utf-8"))["teams"]
cases = json.loads(sys.argv[1])
out = []
for c in cases:
    reg = classify_intl_tournament(c["tournament"])
    r = synthesize_live_intl_row(
        home_team=c["homeTeam"],
        away_team=c["awayTeam"],
        regime=reg,
        match_date_iso=c["matchDateUtc"],
        causal_states=state,
        city=c["city"],
        country=c["country"],
        is_neutral=c["isNeutral"],
    )
    out.append(r)

adj = compute_squad_club_adjustment(
    ts_published_utc="2026-11-18T19:00:00Z",
    ts_decision_utc="2026-11-18T19:15:00Z",
    kickoff_utc="2026-11-18T20:00:00Z",
    home_players=[{"clubElo": 1820.0, "recentClubMinutes30d": 300.0, "isStarter": True, "clubCode": "ARS"}] * 6 + [{"clubElo": 1760.0, "recentClubMinutes30d": 240.0, "isStarter": True, "clubCode": "LIV"}] * 5,
    away_players=[{"clubElo": 1510.0, "recentClubMinutes30d": 180.0, "isStarter": True, "clubCode": f"C{i}"} for i in range(11)],
    home_baseline_club_elo=1580.0,
    away_baseline_club_elo=1540.0,
)
print(json.dumps({"rows": out, "adj": adj}))
`;

    const proc = spawnSync(pyBin, ["-B", "-c", pyScript, JSON.stringify(cases)], {
      encoding: "utf-8",
      timeout: 25_000,
    });
    expect(proc.status, proc.stderr).toBe(0);
    const pyOut = JSON.parse(proc.stdout) as {
      rows: Array<{
        features: number[];
        div_onehot: number[];
        dc_lam_home: number;
        dc_lam_away: number;
        dc_rho: number;
      }>;
      adj: {
        net_elo_delta: number;
        log_lambda_shift: number;
        lam_home_multiplier: number;
        lam_away_multiplier: number;
      };
    };

    cases.forEach((c, idx) => {
      const tsSyn = synthesizeIntlMatchSnapshotRow({
        homeTeam: c.homeTeam,
        awayTeam: c.awayTeam,
        tournament: c.tournament,
        matchDateUtc: c.matchDateUtc,
        venue: { city: c.city, country: c.country, isNeutral: c.isNeutral },
        causalState: intlState,
      });
      const pyRow = pyOut.rows[idx]!;
      expect(tsSyn.row.div_onehot).toEqual(pyRow.div_onehot);
      for (let j = 0; j < INTL_BASE_38_FEATURES.length; j += 1) {
        const diff = Math.abs((tsSyn.row.features[j] as number) - pyRow.features[j]!);
        expect(diff, `Feature ${INTL_BASE_38_FEATURES[j]} en caso ${idx}`).toBeLessThan(1e-12);
      }
      expect(Math.abs(tsSyn.onlineLamHome - pyRow.dc_lam_home)).toBeLessThan(1e-12);
      expect(Math.abs(tsSyn.onlineLamAway - pyRow.dc_lam_away)).toBeLessThan(1e-12);
      expect(Math.abs(tsSyn.rho - pyRow.dc_rho)).toBeLessThan(1e-12);
    });

    const tsAdj = computeSquadClubAdjustment({
      tsDecisionUtc: "2026-11-18T19:15:00Z",
      kickoffUtc: "2026-11-18T20:00:00Z",
      homeBaselineClubElo: 1580.0,
      awayBaselineClubElo: 1540.0,
      squadContext: {
        tsPublishedUtc: "2026-11-18T19:00:00Z",
        homePlayers: [
          ...Array.from({ length: 6 }, () => ({
            clubElo: 1820.0,
            recentClubMinutes30d: 300.0,
            isStarter: true,
            clubCode: "ARS",
          })),
          ...Array.from({ length: 5 }, () => ({
            clubElo: 1760.0,
            recentClubMinutes30d: 240.0,
            isStarter: true,
            clubCode: "LIV",
          })),
        ],
        awayPlayers: Array.from({ length: 11 }, (_, i) => ({
          clubElo: 1510.0,
          recentClubMinutes30d: 180.0,
          isStarter: true,
          clubCode: `C${i}`,
        })),
      },
    });
    expect(Math.abs(tsAdj.net_elo_delta - pyOut.adj.net_elo_delta)).toBeLessThan(1e-12);
    expect(Math.abs(tsAdj.log_lambda_shift - pyOut.adj.log_lambda_shift)).toBeLessThan(1e-12);
    expect(Math.abs(tsAdj.lam_home_multiplier - pyOut.adj.lam_home_multiplier)).toBeLessThan(1e-12);
    expect(Math.abs(tsAdj.lam_away_multiplier - pyOut.adj.lam_away_multiplier)).toBeLessThan(1e-12);
  });

  it("reproduce bit a bit (< 1e-12) las 49 features de Meridian v2.0 (Transfermarkt CC0 + Goalscorers + FIFA SUM + Clima) frente a Python", () => {
    const pyBin = resolvePythonBin();
    const casesV2 = [
      {
        homeTeam: "Colombia",
        awayTeam: "Inglaterra",
        tournament: "FIFA World Cup",
        matchDateUtc: "2026-07-04",
        city: "Miami Gardens",
        country: "United States",
        isNeutral: true,
      },
      {
        homeTeam: "Noruega",
        awayTeam: "Marruecos",
        tournament: "Friendly",
        matchDateUtc: "2026-01-15",
        city: "Oslo",
        country: "Norway",
        isNeutral: false,
      },
      {
        homeTeam: "Ecuador",
        awayTeam: "Argentina",
        tournament: "FIFA World Cup qualification",
        matchDateUtc: "2026-09-08",
        city: "Quito",
        country: "Ecuador",
        isNeutral: false,
      },
    ];

    const pyScriptV2 = `
import json, sys
sys.path.insert(0, ${JSON.stringify(resolve(REPO_ROOT, "research/prediction-lab/experiments/EXP_V33_intl_soccer"))})
from run_ablation_v2 import synthesize_live_intl_v2_row
from intl_ingest import classify_intl_tournament

state_v2 = json.load(open(${JSON.stringify(resolve(REPO_ROOT, "src/data/prediction/intl_soccer_causal_state_v2.json"))}, encoding="utf-8"))["teams"]
cases = json.loads(sys.argv[1])
out = []
for c in cases:
    reg = classify_intl_tournament(c["tournament"])
    out.append(synthesize_live_intl_v2_row(
        home_team=c["homeTeam"],
        away_team=c["awayTeam"],
        regime=reg,
        match_date_iso=c["matchDateUtc"],
        causal_states_v2=state_v2,
        city=c["city"],
        country=c["country"],
        is_neutral=c["isNeutral"],
    ))
print(json.dumps({"rows": out}))
`;

    const procV2 = spawnSync(pyBin, ["-B", "-c", pyScriptV2, JSON.stringify(casesV2)], {
      encoding: "utf-8",
      timeout: 60_000,
    });
    expect(procV2.status, procV2.stderr).toBe(0);
    const pyOutV2 = JSON.parse(procV2.stdout) as {
      rows: Array<{ features: number[]; div_onehot: number[] }>;
    };

    casesV2.forEach((c, idx) => {
      const tsSynV2 = synthesizeIntlMatchSnapshotRow({
        homeTeam: c.homeTeam,
        awayTeam: c.awayTeam,
        tournament: c.tournament,
        matchDateUtc: c.matchDateUtc,
        venue: { city: c.city, country: c.country, isNeutral: c.isNeutral },
        causalState: intlStateV2,
        nFeaturesBase: 49,
      });
      const pyRow = pyOutV2.rows[idx]!;
      expect(tsSynV2.row.features).toHaveLength(49);
      expect(tsSynV2.row.div_onehot).toEqual(pyRow.div_onehot);
      for (let j = 0; j < INTL_V2_49_FEATURES.length; j += 1) {
        const diff = Math.abs((tsSynV2.row.features[j] as number) - pyRow.features[j]!);
        expect(diff, `Feature v2 ${INTL_V2_49_FEATURES[j]} en caso ${idx}`).toBeLessThan(1e-12);
      }
    });

    // Ventaja térmica tropical en julio para Colombia (lat 10.9°) sobre Inglaterra (lat 51.5°) en Miami (> 28°C)
    const heatAdv = computeThermalClimateMismatch({
      homeBaseLat: 10.9231,
      awayBaseLat: 51.556,
      venueLat: 25.958,
      venueElevM: 3.0,
      matchMonth: 7,
    });
    expect(heatAdv).toBeGreaterThan(0.0);
  });
});

describe("EXP_V33_intl_soccer — Monotonías físicas y contrato MatchOutlook (11 mercados)", () => {
  it("respeta monotonía física de altitud (El Alto 4150m vs neutral llano) y diáspora (CDMX > Arlington > Londres > Tokio)", () => {
    expect(resolveNationalTeamCode("México")).toBe("MEX");
    expect(resolveIntlTournamentRegime("Eliminatorias CONMEBOL")).toBe("INTL_QUAL");
    expect(isaPressureHpa(4150)).toBeLessThan(630);

    const bolElAlto = buildIntlMatchOutlook({
      matchId: "BOL_COL_ELALTO",
      homeTeam: "Bolivia",
      awayTeam: "Colombia",
      tournament: "FIFA World Cup qualification",
      matchDateUtc: "2026-11-18T20:00:00Z",
      tsDecisionUtc: "2026-11-18T18:00:00Z",
      venue: { city: "El Alto", country: "Bolivia", isNeutral: false },
    });
    const bolNeutral = buildIntlMatchOutlook({
      matchId: "BOL_COL_MIAMI",
      homeTeam: "Bolivia",
      awayTeam: "Colombia",
      tournament: "FIFA World Cup qualification",
      matchDateUtc: "2026-11-18T20:00:00Z",
      tsDecisionUtc: "2026-11-18T18:00:00Z",
      venue: { city: "Orlando", country: "United States", isNeutral: true },
    });

    const pBolHomeHigh =
      bolElAlto.outlook.marketsByKey["1x2"]!.selections.find((s) => s.selection === "home")!.p;
    const pBolHomeSea =
      bolNeutral.outlook.marketsByKey["1x2"]!.selections.find((s) => s.selection === "home")!.p;
    expect(pBolHomeHigh).toBeGreaterThan(pBolHomeSea);

    const mexCdmx = buildIntlMatchOutlook({
      matchId: "MEX_JPN_CDMX",
      homeTeam: "México",
      awayTeam: "Japón",
      tournament: "Friendly",
      matchDateUtc: "2026-11-18T20:00:00Z",
      tsDecisionUtc: "2026-11-18T18:00:00Z",
      venue: { city: "Ciudad de México", country: "Mexico", isNeutral: false },
    });
    const mexDallas = buildIntlMatchOutlook({
      matchId: "MEX_JPN_DAL",
      homeTeam: "México",
      awayTeam: "Japón",
      tournament: "Friendly",
      matchDateUtc: "2026-11-18T20:00:00Z",
      tsDecisionUtc: "2026-11-18T18:00:00Z",
      venue: { city: "Arlington", country: "United States", isNeutral: true },
    });
    const mexLondon = buildIntlMatchOutlook({
      matchId: "MEX_JPN_LON",
      homeTeam: "México",
      awayTeam: "Japón",
      tournament: "Friendly",
      matchDateUtc: "2026-11-18T20:00:00Z",
      tsDecisionUtc: "2026-11-18T18:00:00Z",
      venue: { city: "London", country: "England", isNeutral: true },
    });
    const mexTokyo = buildIntlMatchOutlook({
      matchId: "MEX_JPN_TOK",
      homeTeam: "México",
      awayTeam: "Japón",
      tournament: "Friendly",
      matchDateUtc: "2026-11-18T20:00:00Z",
      tsDecisionUtc: "2026-11-18T18:00:00Z",
      venue: { city: "Tokyo", country: "Japan", isNeutral: false },
    });

    const pH = (res: ReturnType<typeof buildIntlMatchOutlook>) =>
      res.outlook.marketsByKey["1x2"]!.selections.find((s) => s.selection === "home")!.p;

    expect(pH(mexCdmx)).toBeGreaterThan(pH(mexDallas));
    expect(pH(mexDallas)).toBeGreaterThan(pH(mexLondon));
    expect(pH(mexLondon)).toBeGreaterThan(pH(mexTokyo));
  });

  it("emite los 11 mercados + topScorelines[3], cobertura 100% ok, market: null y cero stakes/Kelly", () => {
    const res = buildIntlMatchOutlook(
      {
        matchId: "INTL_ARG_BRA_2026",
        homeTeam: "Argentina",
        awayTeam: "Brasil",
        tournament: "FIFA World Cup qualification",
        matchDateUtc: "2026-11-19T00:00:00Z",
        tsDecisionUtc: "2026-11-18T22:00:00Z",
        venue: { city: "Buenos Aires", country: "Argentina", isNeutral: false },
      },
      { model: intlModel, causalState: intlState, calibration: intlCal },
    );

    const { outlook } = res;
    expect(outlook.markets).toHaveLength(11);
    expect(outlook.topScorelines).toHaveLength(3);
    expect(outlook.dataQuality.coverageRatio).toBe(1.0);
    expect(outlook.dataQuality.flag).toBe("ok");
    expect(outlook.dataQuality.sharpMarketAvailable).toBe(false);

    for (const mkt of outlook.markets) {
      expect(mkt.market).toBeNull();
      const sumP = mkt.selections.reduce((acc, s) => acc + s.p, 0.0);
      expect(Math.abs(sumP - mkt.expectedProbabilitySum)).toBeLessThan(1e-12);
    }

      assertNoForbiddenKeys(outlook);

      const resV2 = buildIntlMatchOutlook(
        {
          matchId: "INTL_ARG_BRA_2026_V2",
          homeTeam: "Argentina",
          awayTeam: "Brasil",
          tournament: "FIFA World Cup qualification",
          matchDateUtc: "2026-11-19T00:00:00Z",
          tsDecisionUtc: "2026-11-18T22:00:00Z",
          venue: { city: "Buenos Aires", country: "Argentina", isNeutral: false },
        },
        { model: intlModelV2, causalState: intlStateV2, calibration: intlCalV2 },
      );
      expect(resV2.synthesized.row.features).toHaveLength(49);
      expect(resV2.outlook.markets).toHaveLength(11);
      expect(resV2.outlook.dataQuality.coverageRatio).toBe(1.0);
      expect(resV2.outlook.dataQuality.flag).toBe("ok");
      assertNoForbiddenKeys(resV2.outlook);
    });
});
