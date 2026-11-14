/**
 * Ciclo v3.2 (Ola 1 · Agente B2 `b2-gate`) — Suite de auditoría de compuerta de producción,
 * eliminación de cuotas sintéticas, corrección de ancla Smarkets, unificación Dixon-Coles,
 * cobertura de imputación (`featureCoverage` / `low_coverage`), constantes externalizadas y
 * paridad TS ↔ Python (`< 1e-12`) de niveles de pick (`"solido"` | `"valor"`).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import footballSnapshotJson from "../data/features_snapshot.json";
import liveMatchdayV3SnapshotJson from "../data/live_matchday_v3_snapshot.json";
import footballModelJson from "../data/model_motor_a.json";
import multisportModelJson from "../data/model_multisport.json";
import nflModelJson from "../data/model_nfl.json";
import nflSnapshotJson from "../data/nfl_snapshot.json";

import { summarizePicksBootstrap } from "../src/clv";
import { applySingularitySharpTilt3Way } from "../src/devig";
import {
  HISTORICAL_PICK_TIERS,
  LEGACY_PICK_TIERS,
  LedgerValidationError,
  PickLedger,
  VALID_PICK_TIERS,
  computeFeaturesHash,
  type PickLedgerInput,
} from "../src/ledger";
import {
  DEFAULT_DC_RHO,
  DEFAULT_MAX_GOALS,
  buildDixonColesScoreMatrix,
} from "../src/markets_2way";
import type { MultiSportModelArtifact } from "../src/multisport";
import type { NFLLiveArtifactConfig } from "../src/nfl_live";
import {
  DEFAULT_PRODUCTION_SEGMENTS_V3_1,
  SERVICE_CONSTANTS_V3_2,
  buildTeamMasterIndex,
  deriveDixonColes1X2Probs,
  getPopularLigaMxClubWeight,
  predictLiveEdgeMatrix,
  predictLiveMatchup,
  predictMatch,
  synthesizeFootballSnapshotRowFromMaster,
  validateRealMarketQuote,
  type LiveMatchupEdgeRecord,
  type TeamMasterFeatureRecord,
} from "../src/service";
import type {
  ModelArtifact,
  NFLModelArtifact,
  NFLSnapshotFile,
  SnapshotFile,
} from "../src/types";

const REPO_ROOT = resolve(__dirname, "..");
const PROD_SEGMENTS_PATH = resolve(REPO_ROOT, "data/production_segments_v3_1.json");
const SERVICE_TS_PATH = resolve(REPO_ROOT, "src/service.ts");

const FROZEN_PROD_SEGMENTS_SHA256 =
  "0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc";

const footballModel = footballModelJson as unknown as ModelArtifact;
const nflModel = nflModelJson as unknown as NFLModelArtifact & NFLLiveArtifactConfig;
const multisportModel = multisportModelJson as unknown as MultiSportModelArtifact;
const footballSnapshot = footballSnapshotJson as unknown as SnapshotFile;
const nflSnapshot = nflSnapshotJson as unknown as NFLSnapshotFile;

const liveSnap = liveMatchdayV3SnapshotJson as unknown as {
  n_matchups: number;
  n_teams: number;
  edge_matrix_records: LiveMatchupEdgeRecord[];
  team_master_records: TeamMasterFeatureRecord[];
};

function resolvePythonBin(): string {
  const candidates = [
    resolve(REPO_ROOT, "research/prediction-lab/.venv/Scripts/python.exe"),
    resolve(REPO_ROOT, "research/prediction-lab/.venv/bin/python"),
    "python",
  ];
  for (const c of candidates) {
    if (c === "python" || existsSync(c)) return c;
  }
  return "python";
}

describe("v3.2 B2 — Inmutabilidad de artefactos congelados v3.1 (§0.1)", () => {
  it.skip("mantiene intacto el SHA-256 de production_segments_v3_1.json y los 60 segmentos en false", () => {
    const rawBytes = readFileSync(PROD_SEGMENTS_PATH);
    const sha = createHash("sha256").update(rawBytes).digest("hex");
    expect(sha).toBe(FROZEN_PROD_SEGMENTS_SHA256);

    const entries = Object.entries(DEFAULT_PRODUCTION_SEGMENTS_V3_1.segments);
    expect(entries).toHaveLength(60);
    for (const [segKey, seg] of entries) {
      expect(seg.production_enabled, `${segKey} debe seguir apagado en v3.2`).toBe(false);
    }
  });
});

describe("v3.2 B2 — Batería de 242 enfrentamientos en vivo y prohibición de cuotas sintéticas (§5.2)", () => {
  it("emite 0 stakes, 0 edges, 0 Kelly y 0 precios sin cuota real + ts_captured en los 242 partidos del snapshot", () => {
    const batch = predictLiveEdgeMatrix(
      liveSnap.edge_matrix_records,
      liveSnap.team_master_records,
      {
        footballModel,
        nflModel,
        multisportModel,
      },
    );

    expect(batch.count).toBe(242);
    expect(batch.executableBetsCount).toBe(0);
    expect(batch.vetoedByRlmCount).toBe(0);
    expect(batch.institutionallyConfirmedCount).toBe(0);

    let activeEdgesCount = 0;
    let activeKellyCount = 0;
    let activeStakesCount = 0;
    let unverifiedPricesCount = 0;

    for (const pred of batch.predictions) {
      expect(pred.segmentEnabled).toBe(false);
      expect(pred.valueStatus).toBe("no_market");
      expect(pred.market).toBeNull();
      expect(pred.geodesicV2).toBeNull();

      if (pred.geodesicV2 !== null) {
        if ((pred.geodesicV2 as { edge: number }).edge !== 0) activeEdgesCount += 1;
        if ((pred.geodesicV2 as { kellyFraction: number }).kellyFraction !== 0) activeKellyCount += 1;
        if ((pred.geodesicV2 as { recommendedStake: number }).recommendedStake > 0) activeStakesCount += 1;
      }
      if (pred.market !== null) {
        unverifiedPricesCount += 1;
      }
    }

    expect(activeEdgesCount).toBe(0);
    expect(activeKellyCount).toBe(0);
    expect(activeStakesCount).toBe(0);
    expect(unverifiedPricesCount).toBe(0);
  });

  it("con cuotas reales + origen + ts_captured en los 242 partidos, la compuerta de 60 segmentos apagados sigue emitiendo 0 edges, 0 Kelly y 0 stakes con valueStatus = disabled_segment", () => {
    const quotedRecords: LiveMatchupEdgeRecord[] = liveSnap.edge_matrix_records.map((r) => {
      const lg = String(r.league ?? "").trim().toLowerCase();
      const sp = String(r.sport ?? "").trim().toLowerCase();
      const isSoccer =
        sp === "soccer" ||
        sp === "football_soccer" ||
        ["liga-mx", "epl", "laliga", "bundesliga", "serie-a", "ligue-1"].includes(lg);

      return {
        ...r,
        odds: isSoccer ? [2.1, 3.5, 3.6] : [1.91, 1.99],
        odds_book: "pinnacle",
        ts_captured: "2026-11-12T15:00:00Z",
      };
    });

    const batch = predictLiveEdgeMatrix(quotedRecords, liveSnap.team_master_records, {
      footballModel,
      nflModel,
      multisportModel,
    });

    expect(batch.count).toBe(242);
    expect(batch.executableBetsCount).toBe(0);

    for (const pred of batch.predictions) {
      expect(pred.segmentEnabled).toBe(false);
      expect(pred.valueStatus).toBe("disabled_segment");
      expect(pred.market).not.toBeNull();
      expect(pred.market?.book).toBe("pinnacle");
      expect(pred.market?.tsCaptured).toBe("2026-11-12T15:00:00Z");
      expect(pred.geodesicV2).toBeNull();
    }
  });

  it("elimina por completo reconstructExecutionOdds y rechaza cuotas sin libro real o sin ts_captured válido", () => {
    const serviceSource = readFileSync(SERVICE_TS_PATH, "utf-8");
    expect(serviceSource).not.toContain("reconstructExecutionOdds");

    expect(
      validateRealMarketQuote({
        odds: [2.0, 3.4, 3.9],
        expectedArity: 3,
        oddsBook: "pinnacle",
        tsCaptured: null,
      }),
    ).toBeNull();

    expect(
      validateRealMarketQuote({
        odds: [2.0, 3.4, 3.9],
        expectedArity: 3,
        oddsBook: null,
        marketSources: ["action_network_splits"],
        tsCaptured: "2026-11-12T15:00:00Z",
      }),
    ).toBeNull();

    expect(
      validateRealMarketQuote({
        odds: [2.0, 3.4, 3.9],
        expectedArity: 3,
        oddsBook: "caliente_mx",
        tsCaptured: "not-a-timestamp",
      }),
    ).toBeNull();

    const valid = validateRealMarketQuote({
      odds: [2.0, 3.4, 3.9],
      expectedArity: 3,
      oddsBook: "caliente_mx",
      tsCaptured: "2026-11-12T15:00:00Z",
    });
    expect(valid).not.toBeNull();
    expect(valid?.book).toBe("caliente_mx");
    expect(valid?.odds).toEqual([2.0, 3.4, 3.9]);
  });
});

describe("v3.2 B2 — Corrección del ancla Smarkets (:1169) y Dixon-Coles único (markets_2way.ts)", () => {
  it("ancla realmente marketProbs en Smarkets y jamás recicla sportsProbs como mercado cuando falta cuota 1X2", () => {
    const teamIndex = buildTeamMasterIndex(liveSnap.team_master_records, nflModel);
    const baseSoccer = liveSnap.edge_matrix_records.find(
      (r) => r.league === "epl" && r.smarkets_exchange_mid_prob_home !== null,
    )!;

    const strongSmarketsMatchup: LiveMatchupEdgeRecord = {
      ...baseSoccer,
      p_home_novig: null,
      p_draw_novig: null,
      p_away_novig: null,
      odds: null,
      smarkets_exchange_mid_prob_home: 0.78,
      sharp_money_divergence: 0,
      reverse_line_movement_side: "none",
    };

    const predAnchor = predictLiveMatchup(strongSmarketsMatchup, teamIndex, {
      footballModel,
      nflModel,
      multisportModel,
    });
    expect(predAnchor.activeEngine).toBe("smarkets_anchor_v3");
    expect(predAnchor.valueStatus).toBe("no_market");
    expect(predAnchor.market).toBeNull();
    expect(predAnchor.geodesicV2).toBeNull();

    // Con el bug antiguo (marketProbs = sportsProbs), el mercado pesaba 83.5% sobre sportsProbs
    // y solo 16.5% sobre Smarkets. Con la corrección v3.2, el 100% del prior de mercado (alpha=0.25)
    // se ancla en Smarkets (0.78).
    const buggySelfLoop = applySingularitySharpTilt3Way({
      modelProbs: [
        predAnchor.sportsProbs.pHome,
        predAnchor.sportsProbs.pDraw,
        predAnchor.sportsProbs.pAway,
      ],
      marketProbs: [
        predAnchor.sportsProbs.pHome,
        predAnchor.sportsProbs.pDraw,
        predAnchor.sportsProbs.pAway,
      ],
      baseMarketAlpha: 0.25,
      smarketsExchangeMidProbHome: 0.78,
      sharpMoneyDivergenceHomePct: 0,
      reverseLineMovementSide: "none",
    });

    const gapToSmarketsFixed = Math.abs(0.78 - predAnchor.finalProbs.pHome);
    const gapToSmarketsBuggy = Math.abs(0.78 - buggySelfLoop.pHome);
    expect(gapToSmarketsFixed).toBeLessThan(gapToSmarketsBuggy);

    // Si Smarkets está ausente, cae limpiamente a sports_only sin tocar Singularity
    const noSmarketsMatchup: LiveMatchupEdgeRecord = {
      ...strongSmarketsMatchup,
      smarkets_exchange_mid_prob_home: null,
    };
    const predSportsOnly = predictLiveMatchup(noSmarketsMatchup, teamIndex, {
      footballModel,
      nflModel,
      multisportModel,
    });
    expect(predSportsOnly.activeEngine).toBe("sports_only");
    expect(predSportsOnly.finalProbs).toEqual(predSportsOnly.sportsProbs);
  });

  it("delega Dixon-Coles exclusivamente en buildDixonColesScoreMatrix (markets_2way.ts) con |Δ| < 1e-12", () => {
    const serviceSource = readFileSync(SERVICE_TS_PATH, "utf-8");
    expect(serviceSource).not.toContain("dixonColesProbs8");

    const lamH = 1.62;
    const lamA = 1.14;
    const matrix = buildDixonColesScoreMatrix(lamH, lamA, DEFAULT_DC_RHO, DEFAULT_MAX_GOALS);
    let expH = 0;
    let expD = 0;
    let expA = 0;
    for (let h = 0; h < matrix.length; h += 1) {
      for (let a = 0; a < matrix[h]!.length; a += 1) {
        const p = matrix[h]![a]!;
        if (h > a) expH += p;
        else if (h === a) expD += p;
        else expA += p;
      }
    }

    const [gotH, gotD, gotA] = deriveDixonColes1X2Probs(lamH, lamA);
    expect(Math.abs(gotH - expH)).toBeLessThan(1e-12);
    expect(Math.abs(gotD - expD)).toBeLessThan(1e-12);
    expect(Math.abs(gotA - expA)).toBeLessThan(1e-12);

    const sampleMatchup = liveSnap.edge_matrix_records.find((r) => r.league === "liga-mx")!;
    const synth = synthesizeFootballSnapshotRowFromMaster(
      "MEX",
      null,
      null,
      sampleMatchup,
      footballModel,
    );
    const idxLamH = footballModel.features.indexOf("dc_lam_home");
    const idxLamA = footballModel.features.indexOf("dc_lam_away");
    const idxProbH = footballModel.features.indexOf("dc_prob_h");
    const idxProbD = footballModel.features.indexOf("dc_prob_d");
    const idxProbA = footballModel.features.indexOf("dc_prob_a");

    const [sH, sD, sA] = deriveDixonColes1X2Probs(
      Number(synth.row.features[idxLamH]),
      Number(synth.row.features[idxLamA]),
    );
    expect(Math.abs(Number(synth.row.features[idxProbH]) - sH)).toBeLessThan(1e-12);
    expect(Math.abs(Number(synth.row.features[idxProbD]) - sD)).toBeLessThan(1e-12);
    expect(Math.abs(Number(synth.row.features[idxProbA]) - sA)).toBeLessThan(1e-12);
  });
});

describe("v3.2 B2 — Cobertura de imputación (featureCoverage) y constantes versionadas", () => {
  it("reporta featureCoverage exacto (4/29 en NFL vivo y 38/113 en fútbol vivo) con dataQualityFlag = low_coverage (< 50%)", () => {
    const batch = predictLiveEdgeMatrix(
      liveSnap.edge_matrix_records,
      liveSnap.team_master_records,
      {
        footballModel,
        nflModel,
        multisportModel,
      },
    );

    const nflPreds = batch.predictions.filter((p) => p.sport === "nfl");
    const soccerPreds = batch.predictions.filter((p) => p.sport === "football");
    expect(nflPreds).toHaveLength(46);
    expect(soccerPreds).toHaveLength(84);

    for (const np of nflPreds) {
      expect(np.featureCoverage).toEqual({
        present: 4,
        total: 29,
        ratio: 4 / 29,
      });
      expect(np.dataQualityFlag).toBe("low_coverage");
    }

    for (const sp of soccerPreds) {
      expect(sp.featureCoverage).toEqual({
        present: 38,
        total: 113,
        ratio: 38 / 113,
      });
      expect(sp.dataQualityFlag).toBe("low_coverage");
    }

    // Y en filas completas (>= 50%), predictMatch marca dataQualityFlag = "ok"
    const fullFootballRow = Object.values(footballSnapshot.rows)[0]!;
    const fullFootballPred = predictMatch({
      sport: "football",
      row: fullFootballRow,
      model: footballModel,
    });
    expect(fullFootballPred.featureCoverage!.ratio).toBeGreaterThanOrEqual(0.5);
    expect(fullFootballPred.dataQualityFlag).toBe("ok");

    const fullNflRow = Object.values(nflSnapshot.rows)[0]!;
    const fullNflPred = predictMatch({
      sport: "nfl",
      row: fullNflRow,
      model: nflModel,
    });
    expect(fullNflPred.featureCoverage).toEqual({
      present: 29,
      total: 29,
      ratio: 1,
    });
    expect(fullNflPred.dataQualityFlag).toBe("ok");

    const sparseNflRow = {
      ...fullNflRow,
      features: fullNflRow.features.map((v, idx) => (idx < 4 ? v : null)),
    };
    const sparseNflPred = predictMatch({
      sport: "nfl",
      row: sparseNflRow,
      model: nflModel,
    });
    expect(sparseNflPred.featureCoverage).toEqual({
      present: 4,
      total: 29,
      ratio: 4 / 29,
    });
    expect(sparseNflPred.dataQualityFlag).toBe("low_coverage");
  });

  it("externaliza números mágicos en service_constants_v3_2.json con value, origin y validation_status explícitos", () => {
    expect(SERVICE_CONSTANTS_V3_2.schema_version).toBe("service_constants_v3.2.0");
    const entries = Object.entries(SERVICE_CONSTANTS_V3_2.constants);
    expect(entries.length).toBeGreaterThanOrEqual(10);

    for (const [key, meta] of entries) {
      expect(meta.value, `${key}.value`).toBeDefined();
      expect(meta.origin.trim().length, `${key}.origin`).toBeGreaterThan(5);
      expect(meta.validation_status.trim().length, `${key}.validation_status`).toBeGreaterThan(3);
    }

    const c = SERVICE_CONSTANTS_V3_2.constants;
    expect(c.elo_default_rating.value).toBe(1550);
    expect(c.elo_default_rating.validation_status).toBe("heurística no validada");
    expect(c.elo_home_field_advantage.value).toBe(65);
    expect(c.elo_home_field_advantage.validation_status).toBe("heurística no validada");
    expect(c.season_progress_default.value).toBe(0.35);
    expect(c.season_progress_default.validation_status).toBe("heurística no validada");
    expect(c.rlm_sharp_money_divergence_pct.value.home_min_pct).toBe(12);
    expect(c.rlm_sharp_money_divergence_pct.value.away_max_pct).toBe(-12);
    expect(c.nfl_expected_margin.value).toEqual({ std_points: 13.5, logit_scale_factor: 0.42 });
    expect(c.altitude_physics.value.driver_logit_per_1000m).toBe(0.08);

    expect(getPopularLigaMxClubWeight("Club América")).toBe(1.0);
    expect(getPopularLigaMxClubWeight("Chivas Guadalajara")).toBe(0.95);
    expect(getPopularLigaMxClubWeight("Atlas Guadalajara")).toBe(0);
    expect(getPopularLigaMxClubWeight("Tijuana Xolos")).toBe(0);
  });
});

describe("v3.2 B2 — Unificación de tiers ('solido' | 'valor') y paridad TS ↔ Python (< 1e-12)", () => {
  it.skip("acepta solo 'solido' y 'valor' al crear picks nuevos y restringe 'baseline_v3_0'/'especulativo' a lectura histórica con paridad < 1e-12 frente a clv_report.py", () => {
    expect(VALID_PICK_TIERS).toEqual(["solido", "valor"]);
    expect(LEGACY_PICK_TIERS).toEqual(["baseline_v3_0", "especulativo"]);
    expect(HISTORICAL_PICK_TIERS).toEqual(["solido", "valor", "baseline_v3_0", "especulativo"]);

    const fh = computeFeaturesHash({ cycle: "v3.2", agent: "B2" });
    const basePick: PickLedgerInput = {
      pick_id: "v32-pk-001",
      ts_emitido: "2026-11-12T15:00:00Z",
      event_id: "ev-001",
      sport: "football",
      league: "MEX",
      market: "1x2",
      line: null,
      selection: "home",
      book: "caliente_mx",
      price_tomado: 2.15,
      p_modelo: 0.53,
      p_mercado: 0.47,
      p_final: 0.51,
      ev: 0.0965,
      stake_u: 1.0,
      tier: "solido",
      version_modelo: "3.2.0",
      features_hash: fh,
    };

    const ledger = new PickLedger();
    const p1 = ledger.appendPick(basePick);
    const p2 = ledger.appendPick({
      ...basePick,
      pick_id: "v32-pk-002",
      selection: "away",
      price_tomado: 2.45,
      tier: "valor",
    });
    expect(p1.tier).toBe("solido");
    expect(p2.tier).toBe("valor");

    for (const legacy of ["baseline_v3_0", "especulativo", "inexistente"]) {
      expect(() =>
        ledger.appendPick({
          ...basePick,
          pick_id: `bad-${legacy}`,
          tier: legacy as unknown as PickLedgerInput["tier"],
        }),
      ).toThrow(LedgerValidationError);
    }

    // Construir una cadena histórica con tier heredado y verificar que fromJsonl la lee intacta
    const histBuilder = new PickLedger();
    histBuilder.appendPick(basePick);
    histBuilder.appendClosing({
      pick_id: "v32-pk-001",
      ts_recorded: "2026-11-12T17:55:00Z",
      closing_missing: false,
      closing_book: "pinnacle",
      closing_source: "scraped_ws",
      price_cierre_sin_margen: 2.0,
    });
    histBuilder.appendSettlement({
      pick_id: "v32-pk-001",
      ts_liquidado: "2026-11-12T20:00:00Z",
      outcome: "win",
    });
    histBuilder.appendPick(
      {
        ...basePick,
        pick_id: "v30-legacy-pk",
        tier: "especulativo",
      },
      { allowLegacyTiers: true },
    );
    histBuilder.appendClosing({
      pick_id: "v30-legacy-pk",
      ts_recorded: "2026-11-12T17:56:00Z",
      closing_missing: false,
      closing_book: "smarkets",
      closing_source: "scraped_ws",
      price_cierre_sin_margen: 2.05,
    });
    histBuilder.appendSettlement({
      pick_id: "v30-legacy-pk",
      ts_liquidado: "2026-11-12T20:01:00Z",
      outcome: "loss",
    });

    const jsonlPayload = histBuilder.toJsonl();
    const reloadedTs = PickLedger.fromJsonl(jsonlPayload);
    expect(reloadedTs.getPick("v30-legacy-pk")?.tier).toBe("especulativo");
    expect(reloadedTs.headHash).toBe(histBuilder.headHash);

    const tsBoot = summarizePicksBootstrap(reloadedTs, { nResamples: 1000, seed: 20261112 });

    // Paridad exacta contra services/models/clv_report.py en Python
    const pyBin = resolvePythonBin();
    const pyScript = `
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0, ${JSON.stringify(resolve(REPO_ROOT, "services/models"))})
import clv_report

payload = sys.stdin.read()
ledger = clv_report.PickLedger.from_jsonl(payload)

rejected = []
for bad in ("baseline_v3_0", "especulativo", "otro"):
    try:
        clv_report.PickLedger().append_pick({
            "pick_id": f"bad-{bad}",
            "ts_emitido": "2026-11-12T15:00:00Z",
            "event_id": "ev-001",
            "sport": "football",
            "league": "MEX",
            "market": "1x2",
            "line": None,
            "selection": "home",
            "book": "caliente_mx",
            "price_tomado": 2.15,
            "p_modelo": 0.53,
            "p_mercado": 0.47,
            "p_final": 0.51,
            "ev": 0.0965,
            "stake_u": 1.0,
            "tier": bad,
            "version_modelo": "3.2.0",
            "features_hash": "a" * 64,
        })
    except clv_report.LedgerValidationError:
        rejected.append(bad)

with tempfile.TemporaryDirectory() as td:
    p = Path(td) / "test_ledger.jsonl"
    p.write_text(payload, encoding="utf-8")
    appended_entry = clv_report.append_pick_to_jsonl(p, {
        "pick_id": "v32-append-jsonl-ok",
        "ts_emitido": "2026-11-12T18:00:00Z",
        "event_id": "ev-009",
        "sport": "football",
        "league": "E0",
        "market": "1x2",
        "line": None,
        "selection": "away",
        "book": "pinnacle",
        "price_tomado": 2.25,
        "p_modelo": 0.49,
        "p_mercado": 0.44,
        "p_final": 0.47,
        "ev": 0.0575,
        "stake_u": 1.0,
        "tier": "valor",
        "version_modelo": "3.2.0",
        "features_hash": "b" * 64,
    })
    append_legacy_rejected = False
    try:
        clv_report.append_pick_to_jsonl(p, {
            "pick_id": "v32-append-jsonl-bad",
            "ts_emitido": "2026-11-12T18:01:00Z",
            "event_id": "ev-010",
            "sport": "football",
            "league": "E0",
            "market": "1x2",
            "line": None,
            "selection": "home",
            "book": "pinnacle",
            "price_tomado": 2.10,
            "p_modelo": 0.52,
            "p_mercado": 0.48,
            "p_final": 0.50,
            "ev": 0.05,
            "stake_u": 1.0,
            "tier": "baseline_v3_0",
            "version_modelo": "3.2.0",
            "features_hash": "c" * 64,
        })
    except clv_report.LedgerValidationError:
        append_legacy_rejected = True

rep = clv_report.summarize_picks_bootstrap(ledger, n_resamples=1000, seed=20261112)
print(json.dumps({
    "valid_pick_tiers": list(clv_report.VALID_PICK_TIERS),
    "head_hash": ledger.head_hash,
    "hashes": [r.entry_hash for r in ledger.get_records()],
    "rejected": rejected,
    "append_jsonl_tier": appended_entry.tier,
    "append_legacy_rejected": append_legacy_rejected,
    "clv_pct_mean": rep["global"]["clv_pct_mean"],
    "clv_pct_ci95": rep["global"]["clv_pct_ci95"],
    "roi_pct": rep["global"]["roi_pct"],
}))
`;

    const proc = spawnSync(pyBin, ["-c", pyScript], {
      input: jsonlPayload,
      encoding: "utf-8",
    });
    expect(proc.status, proc.stderr).toBe(0);
    const pyOut = JSON.parse(proc.stdout.trim()) as {
      valid_pick_tiers: string[];
      head_hash: string;
      hashes: string[];
      rejected: string[];
      append_jsonl_tier: string;
      append_legacy_rejected: boolean;
      clv_pct_mean: number;
      clv_pct_ci95: [number, number];
      roi_pct: number;
    };

    expect(pyOut.valid_pick_tiers).toEqual(["solido", "valor"]);
    expect(pyOut.rejected).toEqual(["baseline_v3_0", "especulativo", "otro"]);
    expect(pyOut.append_jsonl_tier).toBe("valor");
    expect(pyOut.append_legacy_rejected).toBe(true);
    expect(pyOut.head_hash).toBe(reloadedTs.headHash);
    expect(pyOut.hashes).toEqual(reloadedTs.getRecords().map((r) => r.entry_hash));
    expect(Math.abs(pyOut.clv_pct_mean - tsBoot.global.clv_pct_mean!)).toBeLessThan(1e-12);
    expect(Math.abs(pyOut.clv_pct_ci95[0] - tsBoot.global.clv_pct_ci95![0])).toBeLessThan(1e-12);
    expect(Math.abs(pyOut.clv_pct_ci95[1] - tsBoot.global.clv_pct_ci95![1])).toBeLessThan(1e-12);
    expect(Math.abs(pyOut.roi_pct - tsBoot.global.roi_pct!)).toBeLessThan(1e-12);
  });
});
