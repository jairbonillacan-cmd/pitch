import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertValidNFLModel, predictNFL } from "../../../../src/domain/prediction/engine.js";
import type { MultiSportModelArtifact } from "../../../../src/domain/prediction/multisport.js";
import type { NFLLiveArtifactConfig } from "../../../../src/domain/prediction/nfl_live.js";
import {
  computeFeatureCoverage,
  predictLiveEdgeMatrix,
  type LiveMatchupEdgeRecord,
  type TeamMasterFeatureRecord,
} from "../../../../src/domain/prediction/service.js";
import type {
  ModelArtifact,
  NFLModelArtifact,
  NFLSnapshotRow,
} from "../../../../src/domain/prediction/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../..");

const candidatePath = path.join(repoRoot, "src/data/prediction/model_nfl_v3_2_candidate.json");
const baselineModelPath = path.join(repoRoot, "src/data/prediction/model_nfl.json");
const footballModelPath = path.join(repoRoot, "src/data/prediction/model_motor_a.json");
const multisportModelPath = path.join(repoRoot, "src/data/prediction/model_multisport.json");
const liveSnapshotPath = path.join(repoRoot, "src/data/prediction/live_matchday_v3_snapshot.json");
const devProbeInputPath = path.join(__dirname, "artifacts/ts_parity_cases.json");

const candidateRaw = JSON.parse(fs.readFileSync(candidatePath, "utf-8"));
const baselineModel = JSON.parse(fs.readFileSync(baselineModelPath, "utf-8")) as NFLModelArtifact & NFLLiveArtifactConfig;
const footballModel = JSON.parse(fs.readFileSync(footballModelPath, "utf-8")) as ModelArtifact;
const multisportModel = JSON.parse(fs.readFileSync(multisportModelPath, "utf-8")) as MultiSportModelArtifact;
const liveSnapshot = JSON.parse(fs.readFileSync(liveSnapshotPath, "utf-8")) as {
  edge_matrix_records: LiveMatchupEdgeRecord[];
  team_master_records: TeamMasterFeatureRecord[];
};

assertValidNFLModel(candidateRaw as NFLModelArtifact);

if (candidateRaw.status !== "candidate" || candidateRaw.production_activated !== false) {
  throw new Error(
    `Gobernanza invalida en candidato: status=${String(candidateRaw.status)}, production_activated=${String(
      candidateRaw.production_activated,
    )}`,
  );
}

interface ParityCase {
  id: string;
  home_team: string;
  away_team: string;
  features: (number | null)[];
  py_probs: [number, number, number];
}

let maxAbsDiff = 0.0;
let nCasesChecked = 0;

if (fs.existsSync(devProbeInputPath)) {
  const cases = JSON.parse(fs.readFileSync(devProbeInputPath, "utf-8")) as ParityCase[];
  for (const c of cases) {
    const row: NFLSnapshotRow = {
      home_team: c.home_team,
      away_team: c.away_team,
      features: c.features,
    };
    const pred = predictNFL(row, candidateRaw as NFLModelArtifact);
    const diffs = [
      Math.abs(pred.pHome - c.py_probs[0]),
      Math.abs(pred.pDraw - c.py_probs[1]),
      Math.abs(pred.pAway - c.py_probs[2]),
    ];
    for (const d of diffs) {
      if (d > maxAbsDiff) {
        maxAbsDiff = d;
      }
    }
    const simplexErr = Math.abs(pred.pHome + pred.pDraw + pred.pAway - 1.0);
    if (simplexErr > 1e-12) {
      throw new Error(`Error de simplex en ${c.id}: ${simplexErr}`);
    }
    nCasesChecked += 1;
  }
}

// Medir `featureCoverage` y compuerta de produccion en `predictLiveEdgeMatrix` (`service.ts`)
const baseEval = predictLiveEdgeMatrix(
  liveSnapshot.edge_matrix_records,
  liveSnapshot.team_master_records,
  {
    footballModel,
    nflModel: baselineModel,
    multisportModel,
  },
);
const baseNflPreds = baseEval.predictions.filter((p) => p.league === "nfl" || p.sport === "nfl");
const baseCovMean =
  baseNflPreds.reduce((acc, p) => acc + p.featureCoverage.ratio, 0) / Math.max(1, baseNflPreds.length);
const baseLowCovCount = baseNflPreds.filter((p) => p.dataQualityFlag === "low_coverage").length;

const precomputedRows = (candidateRaw.precomputed_live_rows ?? {}) as Record<string, NFLSnapshotRow>;
const candEval = predictLiveEdgeMatrix(
  liveSnapshot.edge_matrix_records,
  liveSnapshot.team_master_records,
  {
    footballModel,
    nflModel: candidateRaw as NFLModelArtifact & NFLLiveArtifactConfig,
    multisportModel,
    precomputedNflRows: precomputedRows,
  },
);
const candNflPreds = candEval.predictions.filter((p) => p.league === "nfl" || p.sport === "nfl");
const candCovMean =
  candNflPreds.reduce((acc, p) => acc + p.featureCoverage.ratio, 0) / Math.max(1, candNflPreds.length);
const candPresentMean =
  candNflPreds.reduce((acc, p) => acc + p.featureCoverage.present, 0) / Math.max(1, candNflPreds.length);
const candLowCovCount = candNflPreds.filter((p) => p.dataQualityFlag === "low_coverage").length;

// Verificar directamente `computeFeatureCoverage` sobre cada fila precomputada
let minRowRatio = 1.0;
for (const r of Object.values(precomputedRows)) {
  const fc = computeFeatureCoverage(r.features, candidateRaw.n_features);
  if (fc.ratio < minRowRatio) {
    minRowRatio = fc.ratio;
  }
}

const out = {
  status: "ok",
  candidate_status: candidateRaw.status,
  production_activated: candidateRaw.production_activated,
  n_features: candidateRaw.n_features,
  n_parity_cases_checked: nCasesChecked,
  max_abs_diff_ts_vs_py: maxAbsDiff,
  baseline_live: {
    n_nfl_matchups: baseNflPreds.length,
    present_mean: 4,
    total: baselineModel.n_features,
    coverage_ratio_mean: baseCovMean,
    low_coverage_count: baseLowCovCount,
    executable_bets_count: baseEval.executableBetsCount,
  },
  candidate_live: {
    n_nfl_matchups: candNflPreds.length,
    present_mean: candPresentMean,
    total: candidateRaw.n_features,
    coverage_ratio_mean: candCovMean,
    min_row_coverage_ratio: minRowRatio,
    low_coverage_count: candLowCovCount,
    executable_bets_count: candEval.executableBetsCount,
  },
};

console.log(JSON.stringify(out));
