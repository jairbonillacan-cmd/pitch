"""Suite de pruebas para `EXP_V32_nfl_epa` (Ola 3 · Agente B9).

Verifica:
1. Guardia anti-fuga `w' < w` e invariancia exacta (`< 1e-12`) ante truncamiento de semanas/temporadas futuras.
2. No-lectura absoluta de `holdout_sealed` (`>= 2025-02-02T17:30:00Z`) e inmutabilidad SHA-256 de `v3.0`/`v3.1`.
3. Gobernanza del candidato (`"status": "candidate"`, `"production_activated": false`, cero campos de stake/kelly,
   etiqueta obligatoria `"no significativa"` cuando el IC 95% cruza `0`, etiqueta `"sin cierre sharp"` en consenso
   `nflverse`, y bloqueo honesto `DESCONOCIDO` en `nfl_sharp_closing.parquet` con `0 < 64` juegos liquidados).
4. Mejora sustantiva de `featureCoverage` en vivo frente al `4/29` (`13.79%`) actual y paridad cruzada TS↔Python
   `< 1e-9` (objetivo `< 1e-12`) invocando `predictNFL` y `evaluateLiveMatchdaySnapshot` vía `npx vite-node`.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import pytest

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
PRED_LAB_ROOT = REPO_ROOT / "research" / "prediction-lab"

for p in (str(REPO_ROOT), str(EXP_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from services.models import backtest as bt  # noqa: E402

from causal_epa_features import (  # noqa: E402
    CANDIDATE_41_FEATURES,
    EPA_12_FEATURES,
    build_causal_epa_dataset,
    load_dev_nfl_base_features,
)
from pbp_ingest import (  # noqa: E402
    ARTIFACTS_DIR,
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    HoldoutSealedAccessError,
    assert_dates_strictly_before_holdout,
    assert_season_allowed,
    build_or_load_pbp_game_aggregates,
)
from run_experiment import (  # noqa: E402
    CANDIDATE_JSON_OUT,
    FROZEN_V30_MODEL_JSON,
    assert_no_forbidden_keys_recursive,
)

EXPECTED_FROZEN_SHA256 = {
    "src/data/prediction/production_segments_v3_1.json": "0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc",
    "src/data/prediction/blend_weights_v3_1.json": "b29d7a451f6011126997c122778b42ad3239c78337d17c5fa78d550f5c92739b",
    "src/data/prediction/pick_policy_v3_1.json": "2359c8f8822ea394a380202c04e0bcd010d1a3fae7c5c25b8c11ebe810bfb7d1",
    "src/data/prediction/stale_lines_config.json": "8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac",
    "src/domain/prediction/engine.ts": "9270125c49e81adf57e90c76db07eb95f53ab35a5051e49265b35b80ed0553bc",
    "services/models/artifacts/sealed_holdout_v3_1_eval.json": "5c9e550bfd7889e44f674c91cf64cea4c07b4281fc72231b8cadff850309f2dd",
}


def _eval_candidate_python(features_row: list[float | None], cand_model: dict[str, Any]) -> list[float]:
    mean = np.asarray(cand_model["scaler"]["mean"], dtype=np.float64)
    scale = np.asarray(cand_model["scaler"]["scale"], dtype=np.float64)
    scale = np.where(scale == 0.0, 1.0, scale)
    coef = np.asarray(cand_model["coef"], dtype=np.float64)
    intercept = np.asarray(cand_model["intercept"], dtype=np.float64)
    x = np.array(
        [mean[i] if (v is None or not np.isfinite(float(v))) else float(v) for i, v in enumerate(features_row)],
        dtype=np.float64,
    )
    z = (x - mean) / scale
    logits = coef @ z + intercept
    logits = logits - np.max(logits)
    ex = np.exp(logits)
    p = ex / np.sum(ex)
    classes = cand_model["classes"]
    return [float(p[classes.index(0)]), float(p[classes.index(1)]), float(p[classes.index(2)])]


def test_strict_causality_truncation_invariance_w_lt_w() -> None:
    """Truncar las semanas futuras `9..18` de `2024` no altera ni en `1e-12` ninguna feature de `<= Semana 8`."""
    tg_df, qb_df, _ = build_or_load_pbp_game_aggregates(force_rebuild=False)
    base_dev = load_dev_nfl_base_features()

    sub_base = base_dev[base_dev["season"] >= 2021].copy().reset_index(drop=True)
    sub_tg = tg_df[tg_df["season"] >= 2021].copy().reset_index(drop=True)
    sub_qb = qb_df[qb_df["season"] >= 2021].copy().reset_index(drop=True)

    full_out, _ = build_causal_epa_dataset(sub_base, sub_tg, sub_qb)

    cut_mask_base = (sub_base["season"] < 2024) | ((sub_base["season"] == 2024) & (sub_base["week"] <= 8))
    cut_gdays_max = str(sub_base.loc[cut_mask_base, "gameday"].astype(str).str[:10].max())
    trunc_base = sub_base.loc[cut_mask_base].copy().reset_index(drop=True)
    trunc_tg = sub_tg[sub_tg["game_date"].astype(str).str[:10] <= cut_gdays_max].copy().reset_index(drop=True)
    trunc_qb = sub_qb[sub_qb["game_date"].astype(str).str[:10] <= cut_gdays_max].copy().reset_index(drop=True)

    trunc_out, _ = build_causal_epa_dataset(trunc_base, trunc_tg, trunc_qb)

    merged = trunc_out[["game_id"] + EPA_12_FEATURES].merge(
        full_out[["game_id"] + EPA_12_FEATURES],
        on="game_id",
        suffixes=("_trunc", "_full"),
        how="inner",
    )
    assert len(merged) == len(trunc_out) and len(merged) > 800
    for col in EPA_12_FEATURES:
        diff = np.max(np.abs(merged[f"{col}_trunc"].to_numpy() - merged[f"{col}_full"].to_numpy()))
        assert diff < 1e-12, f"Fuga temporal detectada en {col}: max |Δ| = {diff}"


def test_zero_holdout_reads_and_sealed_guards() -> None:
    """Cualquier intento de acceder a `>= 2025-02-02T17:30:00Z` o `season >= 2025` lanza error inmediato."""
    with pytest.raises(HoldoutSealedAccessError):
        assert_season_allowed(2025)

    with pytest.raises(HoldoutSealedAccessError):
        assert_dates_strictly_before_holdout(pd.Series(["2025-01-05", "2025-02-02"]), context="unit_test_boundary")

    with pytest.raises(HoldoutSealedAccessError):
        assert_dates_strictly_before_holdout(pd.Series(["2025-02-09"]), context="super_bowl_lix_holdout")

    with pytest.raises(bt.HoldoutSealedError):
        bt.run_backtest(
            bt.BacktestConfig(
                eval_split="holdout_sealed",
                unlock_holdout=False,
                registry_path=ARTIFACTS_DIR / "_tmp_test_reg.jsonl",
            )
        )

    base_dev = load_dev_nfl_base_features()
    assert str(base_dev["gameday"].astype(str).str[:10].max()) < HOLDOUT_CUT_DATE
    assert int(base_dev["season"].max()) == 2024


def test_frozen_artifacts_and_model_nfl_untouched() -> None:
    """Verifica que los 4 artefactos v3.1, `engine.ts` y `model_nfl.json` permanecen intactos."""
    for rel_path, expected_sha in EXPECTED_FROZEN_SHA256.items():
        fp = REPO_ROOT / rel_path
        actual_sha = hashlib.sha256(fp.read_bytes()).hexdigest()
        assert actual_sha == expected_sha, f"Artefacto congelado alterado: {rel_path}"

    # Verificar que `git diff -- src/data/prediction/model_nfl.json` esté vacío
    res = subprocess.run(
        ["git", "diff", "--name-only", "--", "src/data/prediction/model_nfl.json", "src/domain/prediction/engine.ts"],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=True,
    )
    assert res.stdout.strip() == ""


def test_candidate_governance_labels_and_sharp_gate() -> None:
    """Verifica el esquema del candidato inactivo, ausencia de stakes, etiquetas `no significativa` y `sin cierre sharp`."""
    assert CANDIDATE_JSON_OUT.exists(), "Falta src/data/prediction/model_nfl_v3_2_candidate.json"
    cand = json.loads(CANDIDATE_JSON_OUT.read_text(encoding="utf-8"))
    assert cand["sport"] == "nfl"
    assert cand["status"] == "candidate"
    assert cand["production_activated"] is False
    assert cand["governance"]["production_activated"] is False
    assert cand["governance"]["production_enabled"] is False
    assert cand["governance"]["holdout_untouched"] is True
    assert cand["governance"]["holdout_cut_iso"] == HOLDOUT_CUT_ISO
    assert cand["n_features"] == len(CANDIDATE_41_FEATURES) == 41
    assert cand["features"] == CANDIDATE_41_FEATURES
    assert len(cand["coef"]) == 3 and all(len(r) == 41 for r in cand["coef"])
    assert len(cand["intercept"]) == 3
    assert_no_forbidden_keys_recursive(cand, path="candidate_json")

    results_path = ARTIFACTS_DIR / "exp_v32_nfl_epa_results.json"
    assert results_path.exists(), "Falta exp_v32_nfl_epa_results.json"
    res = json.loads(results_path.read_text(encoding="utf-8"))
    ev = res["evaluation"]

    assert ev["eval_split"] == "walk_forward_dev"
    assert ev["n_holdout_sealed_untouched"] == 14163
    assert "sin cierre sharp" in ev["nflverse_consensus_sin_cierre_sharp"]["benchmark_note"]

    # Verificar compuerta `B6` (`0 < 64` juegos liquidados -> `DESCONOCIDO`)
    b6 = ev["sharp_closing_corpus_b6"]
    assert b6["n_prospective_games"] == 13
    assert b6["n_rows"] == 39
    assert b6["n_settled_games"] == 0
    assert b6["corpus_sufficient_for_eval"] is False
    assert b6["sharp_calibration_status"] == "DESCONOCIDO"

    # Toda comparación cuyo IC 95% cruza `0` debe llevar `"no significativa"`
    for cname, comp in ev["paired_comparisons_mulberry32"].items():
        lo, hi = comp["delta_ll_ci95"]
        if lo <= 0.0 <= hi:
            assert comp["significance"] == "no significativa", f"Falta etiqueta `no significativa` en {cname}"
        else:
            assert comp["significance"] == "significativa"
        if "consensus" in cname:
            assert "sin cierre sharp" in comp.get("benchmark_label", "")


def test_ts_python_parity_and_live_feature_coverage_gain() -> None:
    """Verifica paridad TS↔Python `< 1e-9` (`< 1e-12`) contra `engine.ts::predictNFL` y salto de `featureCoverage`."""
    cand = json.loads(CANDIDATE_JSON_OUT.read_text(encoding="utf-8"))
    feats_df = pd.read_parquet(ARTIFACTS_DIR / "nfl_dev_causal_41_features.parquet")
    sample_df = feats_df[feats_df["season"] >= 2010].iloc[::19].head(200).copy()

    cases: list[dict[str, Any]] = []
    for r in sample_df.to_dict("records"):
        fvec = [float(r[c]) for c in CANDIDATE_41_FEATURES]
        cases.append(
            {
                "id": str(r["game_id"]),
                "home_team": str(r["home_team"]),
                "away_team": str(r["away_team"]),
                "features": fvec,
                "py_probs": _eval_candidate_python(fvec, cand),
            }
        )
    for mid, lrow in cand["precomputed_live_rows"].items():
        fvec_live = lrow["features"]
        cases.append(
            {
                "id": f"live::{mid}",
                "home_team": str(lrow["home_team"]),
                "away_team": str(lrow["away_team"]),
                "features": fvec_live,
                "py_probs": _eval_candidate_python(fvec_live, cand),
            }
        )

    cases_path = ARTIFACTS_DIR / "ts_parity_cases.json"
    cases_path.write_text(json.dumps(cases), encoding="utf-8")

    npx_bin = shutil.which("npx.cmd") or shutil.which("npx")
    assert npx_bin is not None, "No se encontro npx en PATH"
    probe_ts = EXP_DIR / "ts_parity_probe.ts"
    proc = subprocess.run(
        [npx_bin, "vite-node", str(probe_ts)],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=True,
        timeout=90,
    )
    lines = [ln.strip() for ln in proc.stdout.splitlines() if ln.strip().startswith("{")]
    assert lines, f"Salida inesperada de ts_parity_probe.ts: {proc.stdout}"
    payload = json.loads(lines[-1])

    assert payload["status"] == "ok"
    assert payload["candidate_status"] == "candidate"
    assert payload["production_activated"] is False
    assert payload["n_parity_cases_checked"] == len(cases) >= 240
    assert payload["max_abs_diff_ts_vs_py"] < 1e-12  # Cumple holgadamente `< 1e-9`

    base_cov = payload["baseline_live"]["coverage_ratio_mean"]
    cand_cov = payload["candidate_live"]["coverage_ratio_mean"]
    assert base_cov == pytest.approx(4.0 / 29.0, abs=1e-6)
    assert payload["baseline_live"]["low_coverage_count"] == 46
    assert cand_cov > 0.80  # ~83.6% - 85.4% frente al 13.79% actual
    assert payload["candidate_live"]["low_coverage_count"] == 0
    assert payload["baseline_live"]["executable_bets_count"] == 0
    assert payload["candidate_live"]["executable_bets_count"] == 0
