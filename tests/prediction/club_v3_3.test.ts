/**
 * Suite de gobernanza, paridad TS <-> Python (< 1e-12) y contrato MatchOutlook para:
 *  - `PitchLab Tachyon v3.3 Candidate` (`120` base, `EXP_V34_club_free_data`)
 *  - `PitchLab Tachyon v3.4 Candidate` (`127` base, `EXP_V36_club_v3_4_wave2`)
 *  - `PitchLab Tachyon v3.4 Live-Complete` (`52` base, `100%` cobertura viva, `LL = 1.00794`, `ECE = 0.00470`)
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import clubV33SnapshotJson from "../../src/data/prediction/club_v3_3_snapshot.json";
import clubV34LiveSnapshotJson from "../../src/data/prediction/club_v3_4_live_snapshot.json";
import clubV34SnapshotJson from "../../src/data/prediction/club_v3_4_snapshot.json";
import clubV33ModelJson from "../../src/data/prediction/model_club_v3_3_candidate.json";
import clubV34ModelJson from "../../src/data/prediction/model_club_v3_4_candidate.json";
import clubV34LiveModelJson from "../../src/data/prediction/model_club_v3_4_live_candidate.json";

import {
  appendFreeOpenClubCandidateFeatures,
  buildClubV33CandidateOutlook,
  computeLiveClubFreeOpen14Vector,
  computeStatsBombCalibratedMatchXg,
  getDefaultClubFreeOpenStateArtifact,
  getDefaultClubV33CandidateModel,
  getDefaultClubV34CandidateModel,
  getDefaultClubV34LiveCompleteModel,
  predictClubV33Candidate1X2,
  synthesizeClubV34LiveCompleteRow,
  TACHYON_V30_BASE_FEATURE_COUNT,
  TACHYON_V33_CANDIDATE_CODENAME,
  TACHYON_V34_CANDIDATE_CODENAME,
  TACHYON_V34_LIVE_BASE_FEATURE_COUNT,
  TACHYON_V34_LIVE_COMPLETE_CODENAME,
} from "../../src/domain/prediction/club_v3_3.js";
import { assertValidModel } from "../../src/domain/prediction/engine.js";
import type { ModelArtifact, SnapshotRow } from "../../src/domain/prediction/types.js";

const REPO_ROOT = resolve(__dirname, "../..");
const FROZEN_MOTOR_A_SHA256 =
  "3c72967eddc79bb71ca7fcae40bf21aae760269dc62b43cf2b2db7eeacfceec9";
const FROZEN_NFL_SHA256 =
  "e74ae241875739d2dc18564f85133d4e20c1d0cef41d64b6f705852601597225";
const FROZEN_PROD_SEGMENTS_SHA256 =
  "0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc";

type SnapFile = {
  n: number;
  rows: Record<string, SnapshotRow & { probs_python: readonly [number, number, number] }>;
};

const clubModelV33 = clubV33ModelJson as unknown as ModelArtifact & { status: string; production_activated: boolean };
const clubModelV34 = clubV34ModelJson as unknown as ModelArtifact & { status: string; production_activated: boolean };
const clubModelV34Live = clubV34LiveModelJson as unknown as ModelArtifact & { status: string; production_activated: boolean };

const clubSnapV33 = clubV33SnapshotJson as unknown as SnapFile;
const clubSnapV34 = clubV34SnapshotJson as unknown as SnapFile;
const clubSnapV34Live = clubV34LiveSnapshotJson as unknown as SnapFile;

function resolvePythonBin(): string {
  const candidates = [
    "C:/Users/T490s/Desktop/Proyectos/PitchLab/.worktrees/prediction-lab/research/prediction-lab/.venv/Scripts/python.exe",
    resolve(REPO_ROOT, "research/prediction-lab/.venv/Scripts/python.exe"),
    "python",
  ];
  for (const c of candidates) {
    if (c === "python" || existsSync(c)) return c;
  }
  return "python";
}

function assertSnapshotParity(snap: SnapFile, model: ModelArtifact): void {
  const entries = Object.entries(snap.rows);
  expect(entries.length).toBe(200);
  let maxAbsDiff = 0.0;
  for (const [, row] of entries) {
    const pred = predictClubV33Candidate1X2(row, model);
    maxAbsDiff = Math.max(
      maxAbsDiff,
      Math.abs(pred.pHome - row.probs_python[0]),
      Math.abs(pred.pDraw - row.probs_python[1]),
      Math.abs(pred.pAway - row.probs_python[2]),
    );
    expect(Math.abs(pred.pHome + pred.pDraw + pred.pAway - 1.0)).toBeLessThan(1e-12);
  }
  expect(maxAbsDiff).toBeLessThan(1e-12);
}

describe("EXP_V34 / EXP_V36 — Gobernanza, inmutabilidad v3.1/v3.2 y paridad < 1e-12 en v3.3, v3.4 y v3.4 Live-Complete", () => {
  it("valida los 3 modelos candidatos sin alterar ni un byte de producción v3.1/v3.2", () => {
    for (const [m, expectedCode, expectedBase] of [
      [clubModelV33, TACHYON_V33_CANDIDATE_CODENAME, 120],
      [clubModelV34, TACHYON_V34_CANDIDATE_CODENAME, 127],
      [clubModelV34Live, TACHYON_V34_LIVE_COMPLETE_CODENAME, TACHYON_V34_LIVE_BASE_FEATURE_COUNT],
    ] as const) {
      expect(() => assertValidModel(m)).not.toThrow();
      expect(m.codename).toBe(expectedCode);
      expect(m.status).toBe("candidate");
      expect(m.production_activated).toBe(false);
      expect(m.n_features_base).toBe(expectedBase);
    }
    expect(getDefaultClubV33CandidateModel().codename).toBe(TACHYON_V33_CANDIDATE_CODENAME);
    expect(getDefaultClubV34CandidateModel().codename).toBe(TACHYON_V34_CANDIDATE_CODENAME);
    expect(getDefaultClubV34LiveCompleteModel().codename).toBe(TACHYON_V34_LIVE_COMPLETE_CODENAME);

    const shaMotorA = createHash("sha256")
      .update(readFileSync(resolve(REPO_ROOT, "src/data/prediction/model_motor_a.json")))
      .digest("hex");
    const shaNfl = createHash("sha256")
      .update(readFileSync(resolve(REPO_ROOT, "src/data/prediction/model_nfl.json")))
      .digest("hex");
    const shaSegs = createHash("sha256")
      .update(readFileSync(resolve(REPO_ROOT, "src/data/prediction/production_segments_v3_1.json")))
      .digest("hex");

    expect(shaMotorA).toBe(FROZEN_MOTOR_A_SHA256);
    expect(shaNfl).toBe(FROZEN_NFL_SHA256);
    expect(shaSegs).toBe(FROZEN_PROD_SEGMENTS_SHA256);
  });

  it("alcanza paridad numérica exacta TS <-> Python (< 1e-12) en los 600 partidos de v3.3, v3.4 y v3.4 Live-Complete", () => {
    assertSnapshotParity(clubSnapV33, clubModelV33);
    assertSnapshotParity(clubSnapV34, clubModelV34);
    assertSnapshotParity(clubSnapV34Live, clubModelV34Live);
  });

  it("reproduce bit a bit (< 1e-12) el vector vivo de 14 features abiertas frente a Python y logra cobertura 100% ok en v3.4 Live-Complete", () => {
    const pyBin = resolvePythonBin();
    const cases = [
      { div: "E0", homeTeam: "Arsenal", awayTeam: "Man City", eloDiffNoHfa: 35.0, hDivChange: 0.0, aDivChange: 0.0 },
      { div: "SP1", homeTeam: "Real Madrid", awayTeam: "Barcelona", eloDiffNoHfa: 28.0, hDivChange: 0.0, aDivChange: 0.0 },
      { div: "BRA", homeTeam: "Flamengo RJ", awayTeam: "Palmeiras", eloDiffNoHfa: -15.0, hDivChange: 0.0, aDivChange: 0.0 },
    ];
    const pyScript = `
import json, sys
sys.path.insert(0, ${JSON.stringify(resolve(REPO_ROOT, "research/prediction-lab/experiments/EXP_V34_club_free_data"))})
from export_club_live_state_v3_4 import compute_live_club_free_14_vector
st = json.load(open(${JSON.stringify(resolve(REPO_ROOT, "src/data/prediction/club_free_open_state_v3_4.json"))}, encoding="utf-8"))
cases = json.loads(sys.argv[1])
out = [
    compute_live_club_free_14_vector(
        div=c["div"],
        home_team=c["homeTeam"],
        away_team=c["awayTeam"],
        elo_diff_no_hfa=c["eloDiffNoHfa"],
        h_div_change=c["hDivChange"],
        a_div_change=c["aDivChange"],
        club_state_art=st,
    )
    for c in cases
]
print(json.dumps(out))
`;
    const proc = spawnSync(pyBin, ["-B", "-c", pyScript, JSON.stringify(cases)], {
      encoding: "utf-8",
      timeout: 45_000,
    });
    expect(proc.status, proc.stderr).toBe(0);
    const pyVecs = JSON.parse(proc.stdout) as number[][];
    const stateArt = getDefaultClubFreeOpenStateArtifact();

    cases.forEach((c, idx) => {
      const tsVec = computeLiveClubFreeOpen14Vector({ ...c, clubState: stateArt });
      expect(tsVec).toHaveLength(14);
      for (let j = 0; j < 14; j += 1) {
        expect(Math.abs(tsVec[j]! - pyVecs[idx]![j]!), `Feature ${j} en caso ${idx}`).toBeLessThan(1e-12);
      }
    });

    // Verificar síntesis 52/52 (100% cobertura viva, flag = "ok") en Tachyon v3.4 Live-Complete
    const sampleLiveBase38: SnapshotRow = {
      div: "E0",
      season: "2026-2027",
      match_date: "2026-11-21",
      features: Array.from({ length: 38 }, (_, k) => (k === 1 ? 35.0 : 0.15)),
      div_onehot: clubModelV34Live.div_levels.map((lvl) => (lvl === "E0" ? 1 : 0)),
    };
    const row52 = synthesizeClubV34LiveCompleteRow({
      sourceRow: sampleLiveBase38,
      div: "E0",
      homeTeam: "Arsenal",
      awayTeam: "Man City",
      clubState: stateArt,
    });
    expect(row52.features).toHaveLength(52);
    const { outlook } = buildClubV33CandidateOutlook(
      {
        matchId: "E0_ARS_MCI_LIVE_COMPLETE",
        league: "E0",
        homeTeam: "Arsenal",
        awayTeam: "Man City",
        tsDecisionUtc: "2026-11-21T13:00:00Z",
        kickoffUtc: "2026-11-21T15:00:00Z",
        row: row52,
      },
      clubModelV34Live,
    );
    expect(outlook.markets).toHaveLength(11);
    expect(outlook.dataQuality.coverageRatio).toBe(1.0);
    expect(outlook.dataQuality.flag).toBe("ok");
  });

  it("calcula xG calibrado P1-1 (StatsBomb Open Data) y extiende SnapshotRow 113->127 para Tachyon v3.4 Candidate", () => {
    const xgDom = computeStatsBombCalibratedMatchXg({
      isHome: true,
      shots: 18,
      shotsOnTarget: 8,
      corners: 9,
    });
    const xgLow = computeStatsBombCalibratedMatchXg({
      isHome: true,
      shots: 5,
      shotsOnTarget: 1,
      corners: 2,
    });
    expect(xgDom).toBeGreaterThan(2.0);
    expect(xgDom).toBeGreaterThan(xgLow);

    const [matchId, fullRow] = Object.entries(clubSnapV34.rows)[0]!;
    const baseRow113: SnapshotRow = {
      ...fullRow,
      features: fullRow.features.slice(0, TACHYON_V30_BASE_FEATURE_COUNT),
    };
    const extended = appendFreeOpenClubCandidateFeatures({
      baseRow113,
      freeSignals: {
        tm_rel_log_val_diff: 0.75,
        tm_midweek_cup_adv: 1.0,
        tm_net_transfer_val_120d_diff: 0.5,
      },
      model: clubModelV34,
    });
    expect(extended.features).toHaveLength(clubModelV34.n_features_base);

    const { outlook, prediction1X2 } = buildClubV33CandidateOutlook(
      {
        matchId,
        league: fullRow.div ?? "E0",
        homeTeam: "HOME_CLUB",
        awayTeam: "AWAY_CLUB",
        tsDecisionUtc: "2024-11-10T12:00:00Z",
        kickoffUtc: "2024-11-10T15:00:00Z",
        row: fullRow,
      },
      clubModelV34,
    );
    expect(outlook.markets).toHaveLength(11);
    const pHomeMkt = outlook.marketsByKey["1x2"]!.selections.find((s) => s.selection === "home")!.p;
    expect(Math.abs(pHomeMkt - prediction1X2.pHome)).toBeLessThan(1e-4);
  });
});
