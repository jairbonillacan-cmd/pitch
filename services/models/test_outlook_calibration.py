"""Tests unitarios, matemáticos, anti-fuga y de paridad SHA-256 para `outlook_calibration.py` (`v3.2-B4`)."""

from __future__ import annotations

import json
import math
from pathlib import Path
import sys

import numpy as np
import pandas as pd
import pytest

MODELS_DIR = Path(__file__).resolve().parent
WORKTREE_ROOT = MODELS_DIR.parent.parent

if str(MODELS_DIR) not in sys.path:
    sys.path.insert(0, str(MODELS_DIR))

import backtest as bt  # noqa: E402
import clv_report  # noqa: E402
import outlook_calibration as oc  # noqa: E402

ARTIFACT_PY_PATH = MODELS_DIR / "artifacts" / "outlook_calibration_v3_2.json"
ARTIFACT_TS_PATH = WORKTREE_ROOT / "src" / "data" / "prediction" / "outlook_calibration_v3_2.json"
BLEND_PY_PATH = MODELS_DIR / "artifacts" / "blend_weights_v3_1.json"
BLEND_TS_PATH = WORKTREE_ROOT / "src" / "data" / "prediction" / "blend_weights_v3_1.json"
REGISTRY_PATH = MODELS_DIR / "artifacts" / "holdout_trial_registry.jsonl"


@pytest.fixture(scope="module")
def calibration_artifact() -> dict:
    assert ARTIFACT_PY_PATH.exists(), f"Falta {ARTIFACT_PY_PATH}"
    return json.loads(ARTIFACT_PY_PATH.read_text(encoding="utf-8"))


def test_mirror_sha256_parity_and_contract_v3_2_schema(calibration_artifact: dict) -> None:
    """Verifica SHA-256 idéntico entre Python y TS (`CONTRACT_OUTLOOK.md` §3) y esquema completo."""
    assert ARTIFACT_PY_PATH.exists()
    assert ARTIFACT_TS_PATH.exists()
    sha_py = oc.file_sha256(ARTIFACT_PY_PATH)
    sha_ts = oc.file_sha256(ARTIFACT_TS_PATH)
    assert sha_py == sha_ts
    assert ARTIFACT_PY_PATH.read_bytes() == ARTIFACT_TS_PATH.read_bytes()

    assert calibration_artifact["schema_version"] == "outlook_calibration_v3.2.0"
    assert calibration_artifact["eval_split"] == "walk_forward_dev"
    assert calibration_artifact["holdout_cut_utc"] == "2025-02-02T17:30:00Z"
    assert calibration_artifact["holdout_sealed_untouched"] is True
    assert int(calibration_artifact["bootstrap_samples"]) >= 1000
    assert float(calibration_artifact["max_sharp_age_minutes"]) == pytest.approx(180.0)

    # Cero campos prohibidos de stake, Kelly, EV, tier o "pick seguro"
    oc.assert_no_forbidden_public_fields(calibration_artifact)

    sp = calibration_artifact["split_summary"]
    assert sp["n_total_universe"] == 70812
    assert sp["n_walk_forward_dev"] == 56649
    assert sp["n_holdout_sealed_untouched"] == 14163

    segments = calibration_artifact["segments"]
    # 23 ligas fútbol × 4 mercados (92) + NFL::moneyline (1) + 5 rollups GLOBAL = 98
    assert len(segments) == 98
    for g_key in (
        "GLOBAL::football::1x2",
        "GLOBAL::football::totals",
        "GLOBAL::football::btts",
        "GLOBAL::football::ah",
        "GLOBAL::nfl::moneyline",
        "NFL::moneyline",
        "E0::1x2",
        "E0::totals",
        "E0::btts",
        "E0::ah",
        "MEX::1x2",
        "MEX::btts",
    ):
        assert g_key in segments, f"Falta segmento requerido {g_key}"

    for seg_key, seg in segments.items():
        k_outcomes = 3 if seg["market"] == "1x2" else 2
        assert seg["selected_source_when_sharp_present"] in ("market_sharp_novig", "blend_v3_1")
        fb = seg["fallback_order"]
        assert set(fb) == {"market_sharp_novig", "blend_v3_1", "model", "base_rate"}
        assert fb[0] == seg["selected_source_when_sharp_present"]
        assert fb[-2:] == ["model", "base_rate"]

        n_seg = int(seg["n"])
        assert n_seg > 0, f"Segmento {seg_key} sin observaciones en walk_forward_dev"
        assert 0.0 <= float(seg["ece"]) <= 1.0
        assert float(seg["ece_ci95"][0]) <= float(seg["ece_ci95"][1]) + 1e-12
        assert float(seg["log_loss"]) > 0.0
        assert float(seg["log_loss_ci95"][0]) <= float(seg["log_loss_ci95"][1]) + 1e-12
        assert 0.0 <= float(seg["brier"]) <= 2.0 + 1e-9
        assert float(seg["brier_ci95"][0]) <= float(seg["brier_ci95"][1]) + 1e-12
        assert 0.0 <= float(seg["rps"]) <= 1.0 + 1e-9
        assert float(seg["rps_ci95"][0]) <= float(seg["rps_ci95"][1]) + 1e-12

        d_ci = seg["delta_ll_ci95"]
        assert float(d_ci[0]) <= float(d_ci[1]) + 1e-12
        if float(d_ci[0]) <= 0.0 <= float(d_ci[1]):
            assert seg["significance"] == "no significativa", f"{seg_key} cruza 0 pero no lleva 'no significativa'"
        else:
            assert seg["significance"] == "significativa"

        bins = seg["reliability_bins"]
        assert len(bins) == 10
        assert sum(int(b["n"]) for b in bins) == n_seg * k_outcomes
        for idx_b, b in enumerate(bins):
            assert b["bin_index"] == idx_b
            assert b["p_min"] == pytest.approx(idx_b * 0.1)
            assert b["p_max"] == pytest.approx((idx_b + 1) * 0.1)
            if int(b["n"]) == 0:
                assert b["mean_pred"] is None
                assert b["empirical_freq"] is None
                assert b["ci95_low"] is None
                assert b["ci95_high"] is None
            else:
                assert b["p_min"] - 1e-9 <= float(b["mean_pred"]) <= b["p_max"] + 1e-9
                assert 0.0 <= float(b["empirical_freq"]) <= 1.0
                assert 0.0 <= float(b["ci95_low"]) <= float(b["ci95_high"]) <= 1.0


def test_nfl_moneyline_explicitly_labeled_sin_cierre_sharp_and_btts_honest_coverage(
    calibration_artifact: dict,
) -> None:
    """Verifica etiqueta explícita 'sin cierre sharp' en NFL y ausencia de cuotas inventadas en BTTS."""
    segments = calibration_artifact["segments"]

    for nfl_k in ("NFL::moneyline", "GLOBAL::nfl::moneyline"):
        nfl_seg = segments[nfl_k]
        assert "sin cierre sharp" in nfl_seg["benchmark_note"]
        assert nfl_seg["sharp_closing_status"] == "sin cierre sharp"
        assert nfl_seg["coverage_epistemic"]["sharp_closing_quotes"] == "sin cierre sharp"
        assert nfl_seg["sources"]["market_sharp_novig"] is None
        assert nfl_seg["sources"]["nflverse_consensus_novig_sin_cierre_sharp"] is not None
        assert int(nfl_seg["sources"]["nflverse_consensus_novig_sin_cierre_sharp"]["n"]) >= 3800

    for seg_k, seg in segments.items():
        if seg["market"] == "btts":
            assert seg["coverage_epistemic"]["pre_decision_sharp_quotes"] == "DESCONOCIDO"
            assert seg["coverage_epistemic"]["sharp_closing_quotes"] == "DESCONOCIDO"
            assert seg["coverage_epistemic"]["model_probs"] == "OBSERVADO"
            assert seg["sources"]["market_sharp_novig"] is None
            assert seg["sources"]["blend_v3_1"] is None
            assert seg["evaluated_source_in_dev"] == "model"


def test_frozen_v3_1_weights_untouched_and_causal_selection_consistency(
    calibration_artifact: dict,
) -> None:
    """Verifica que `blend_weights_v3_1.json` no fue modificado y que toda selección `blend_v3_1`
    cumple `w_effective > 0.05` y mejora causal en `walk_forward_dev`."""
    sha_blend_ts = oc.file_sha256(BLEND_TS_PATH)
    sha_blend_py = oc.file_sha256(BLEND_PY_PATH)
    assert sha_blend_ts == sha_blend_py
    assert calibration_artifact["frozen_blend_weights_sha256"] == sha_blend_ts

    for seg_k, seg in calibration_artifact["segments"].items():
        w_eff = float(seg["frozen_w_effective"])
        audit = seg["causal_selection_audit"]
        if w_eff <= 0.05 + 1e-12:
            assert seg["selected_source_when_sharp_present"] == "market_sharp_novig", seg_k
        if seg["selected_source_when_sharp_present"] == "blend_v3_1":
            assert w_eff > 0.05 + 1e-12, seg_k
            assert audit["frozen_blend_beats_or_ties_sharp_open"] is True, seg_k
            assert audit["wf_causal_blend_beats_or_ties_sharp_open"] is True, seg_k
            assert float(audit["log_loss_blend_frozen"]) <= float(audit["log_loss_sharp_open"]) + 1e-12
            assert float(audit["log_loss_blend_wf_causal"]) <= float(audit["log_loss_sharp_open"]) + 1e-12


def test_zero_holdout_leakage_guards_and_registry_append(tmp_path: Path) -> None:
    """Verifica bloqueo duro de `holdout_sealed` y registro idempotente en `holdout_trial_registry.jsonl`."""
    with pytest.raises(bt.HoldoutSealedError):
        oc.enforce_walk_forward_dev_only("walk_forward_dev", True)
    with pytest.raises(bt.HoldoutSealedError):
        oc.enforce_walk_forward_dev_only("holdout_sealed", False)

    cut = pd.Timestamp("2025-02-02T17:30:00Z")
    df_ok = pd.DataFrame(
        {"event_id": ["e1"], "ts_event_start": [pd.Timestamp("2025-02-02T17:00:00Z")]}
    )
    oc.assert_no_holdout_events(df_ok, cut)

    df_leaked = pd.DataFrame(
        {"event_id": ["e2"], "ts_event_start": [pd.Timestamp("2025-02-02T17:30:00Z")]}
    )
    with pytest.raises(bt.DataLeakageError):
        oc.assert_no_holdout_events(df_leaked, cut)

    # Verificar que el registro oficial tiene >= 30 entradas y nuestra corrida está en walk_forward_dev
    entries = [
        json.loads(line)
        for line in REGISTRY_PATH.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    assert len(entries) >= 30
    b4_entries = [e for e in entries[29:] if e.get("phase") == oc.TRIAL_PHASE_NAME]
    assert len(b4_entries) == 1
    assert b4_entries[0]["eval_split"] == "walk_forward_dev"
    assert b4_entries[0]["unlock_holdout"] is False

    # Idempotencia sobre registro temporal
    tmp_reg = tmp_path / "reg.jsonl"
    e1 = oc.append_walk_forward_trial_registry(registry_path=tmp_reg, config_hash="abc123")
    e2 = oc.append_walk_forward_trial_registry(registry_path=tmp_reg, config_hash="abc123")
    assert e1["trial_seq"] == 1
    assert e2["trial_seq"] == 1
    assert len(tmp_reg.read_text(encoding="utf-8").splitlines()) == 1

    with pytest.raises(bt.HoldoutSealedError):
        oc.append_walk_forward_trial_registry(
            registry_path=tmp_reg,
            config_hash="def456",
            unlock_holdout=True,
        )


def test_forbidden_public_fields_guard_rejects_betting_fields() -> None:
    """Verifica que `assert_no_forbidden_public_fields` rechaza stake, kelly, ev, tier, value y 'pick seguro'."""
    for bad_key in ("stake", "kelly", "kellyFraction", "expectedEdge", "ev", "value", "tier"):
        with pytest.raises(oc.OutlookCalibrationError):
            oc.assert_no_forbidden_public_fields({"segments": {"E0::1x2": {bad_key: 1.0}}})
    with pytest.raises(oc.OutlookCalibrationError):
        oc.assert_no_forbidden_public_fields({"note": "Este es un pick seguro garantizado"})


def test_simplex_metrics_rps_ordering_and_quarter_line_calibration() -> None:
    """Verifica exactitud matemática de suma 1 (`< 1e-12`), log-loss, Brier, RPS ordinal y líneas `.25`."""
    raw = np.array([[0.50, 0.30, 0.20], [2.0, 1.0, 1.0]], dtype=np.float64)
    norm = oc.normalize_simplex_rows(raw)
    assert np.all(np.abs(norm.sum(axis=1) - 1.0) < 1e-12)

    # Sensibilidad ordinal de RPS en 1X2 (home=0, draw=1, away=2):
    # Cuando ocurre home (y=0), concentrar masa en draw [0, 1, 0] está más cerca que en away [0, 0, 1].
    p_ord = np.array([[0.0, 1.0, 0.0], [0.0, 0.0, 1.0]], dtype=np.float64)
    y_ord = np.array([0, 0], dtype=np.int64)
    br = oc.compute_brier_vec(p_ord, y_ord)
    rps = oc.compute_rps_vec(p_ord, y_ord)
    assert br[0] == pytest.approx(2.0, abs=1e-12)
    assert br[1] == pytest.approx(2.0, abs=1e-12)
    assert rps[0] == pytest.approx(0.5, abs=1e-12)  # 0.5 * ((0 - 1)^2 + (1 - 1)^2) = 0.5
    assert rps[1] == pytest.approx(1.0, abs=1e-12)  # 0.5 * ((0 - 1)^2 + (0 - 1)^2) = 1.0
    assert rps[0] < rps[1]

    # En 2 vías (K=2), RPS == (p_0 - y_0)^2 == 0.5 * Brier_2way
    p_2w = np.array([[0.65, 0.35], [0.25, 0.75]], dtype=np.float64)
    y_2w = np.array([0, 1], dtype=np.int64)
    ll_2w = oc.compute_categorical_log_loss_vec(p_2w, y_2w)
    br_2w = oc.compute_brier_vec(p_2w, y_2w)
    rps_2w = oc.compute_rps_vec(p_2w, y_2w)
    assert ll_2w[0] == pytest.approx(-math.log(0.65), abs=1e-12)
    assert ll_2w[1] == pytest.approx(-math.log(0.75), abs=1e-12)
    assert rps_2w == pytest.approx(0.5 * br_2w, abs=1e-12)

    # Calibración Bayesiana exacta en hándicap asiático de cuarto de línea (-0.25):
    # 45 victorias completas (w=1, y=0), 28 medias derrotas por empate (w=0.5, y=1), 27 derrotas completas (w=1, y=1)
    # p_effective_win exacta = 45 / (45 + 14 + 27) = 45 / 86
    p_eff = 45.0 / 86.0
    probs_q = np.tile(np.array([[p_eff, 1.0 - p_eff]], dtype=np.float64), (100, 1))
    y_q = np.array([0] * 45 + [1] * 28 + [1] * 27, dtype=np.int64)
    w_q = np.array([1.0] * 45 + [0.5] * 28 + [1.0] * 27, dtype=np.float64)
    res_q = oc.evaluate_calibration_with_bootstrap(
        probs_q,
        y_q,
        active_weights=w_q,
        n_resamples=1000,
        seed=20261111,
    )
    assert res_q["ece"] == pytest.approx(0.0, abs=1e-12)


def test_mulberry32_parity_determinism_and_causal_base_rate() -> None:
    """Verifica paridad bit a bit de `mulberry32` con `clv_report`, reproducibilidad y causalidad temporal."""
    u_oc = oc.mulberry32_uniforms(20261111, 2500)
    u_clv = clv_report.mulberry32_uniforms(20261111, 2500)
    assert np.max(np.abs(u_oc - u_clv)) < 1e-15

    # Fragmentación por rangos idéntica al stream continuo
    u_part1 = oc.mulberry32_uniforms_range(20261111, 1, 1000)
    u_part2 = oc.mulberry32_uniforms_range(20261111, 1001, 1500)
    assert np.array_equal(u_oc, np.concatenate([u_part1, u_part2]))

    with pytest.raises(oc.OutlookCalibrationError):
        oc.evaluate_calibration_with_bootstrap(
            np.array([[0.6, 0.4], [0.5, 0.5]]),
            np.array([0, 1]),
            n_resamples=999,
        )

    # Determinismo exacto con igual semilla y etiqueta 'no significativa' cuando IC cruza 0
    rng_u = oc.mulberry32_uniforms(77, 400)
    p_good = np.column_stack([np.clip(0.75 + 0.1 * (rng_u[:200] - 0.5), 0.55, 0.90), np.zeros(200)])
    p_good[:, 1] = 1.0 - p_good[:, 0]
    p_coin = np.full((200, 2), 0.5, dtype=np.float64)
    y_det = (rng_u[200:] > 0.78).astype(np.int64)  # ~78% clase 0

    ll_coin = oc.compute_categorical_log_loss_vec(p_coin, y_det)
    r1 = oc.evaluate_calibration_with_bootstrap(
        p_good, y_det, benchmark_ll_vec=ll_coin, n_resamples=1000, seed=20261111
    )
    r2 = oc.evaluate_calibration_with_bootstrap(
        p_good, y_det, benchmark_ll_vec=ll_coin, n_resamples=1000, seed=20261111
    )
    assert r1 == r2
    assert r1["delta_ll_vs_benchmark"] < 0.0
    assert r1["delta_ll_ci95"][1] < 0.0
    assert r1["significance"] == "significativa"

    # Comparación nula (ruido simétrico que cruza 0 -> 'no significativa')
    p_noise = np.full((200, 2), 0.5001, dtype=np.float64)
    p_noise[:, 1] = 0.4999
    y_bal = np.array([0, 1] * 100, dtype=np.int64)
    ll_coin_bal = oc.compute_categorical_log_loss_vec(np.full((200, 2), 0.5), y_bal)
    r_null = oc.evaluate_calibration_with_bootstrap(
        p_noise, y_bal, benchmark_ll_vec=ll_coin_bal, n_resamples=1000, seed=20261111
    )
    assert r_null["delta_ll_ci95"][0] <= 0.0 <= r_null["delta_ll_ci95"][1]
    assert r_null["significance"] == "no significativa"

    # Causalidad estricta en `compute_causal_base_rate_matrix`: mutar pliegues futuros jamás altera el pasado
    folds = np.array(["f1"] * 40 + ["f2"] * 40)
    ts_st = np.array(
        [pd.Timestamp("2022-01-01T00:00:00Z") + pd.Timedelta(days=i) for i in range(80)]
    )
    ts_dc = ts_st - pd.Timedelta(hours=6)
    y_a = np.array([0] * 30 + [1] * 10 + [0] * 40, dtype=np.int64)
    y_b = np.array([0] * 30 + [1] * 10 + [1] * 40, dtype=np.int64)  # pliegue futuro invertido
    w_ones = np.ones(80, dtype=np.float64)

    br_a = oc.compute_causal_base_rate_matrix(
        fold_keys=folds, ts_event_starts=ts_st, ts_decisions=ts_dc, outcomes_y=y_a, active_weights=w_ones, n_classes=2
    )
    br_b = oc.compute_causal_base_rate_matrix(
        fold_keys=folds, ts_event_starts=ts_st, ts_decisions=ts_dc, outcomes_y=y_b, active_weights=w_ones, n_classes=2
    )
    assert np.array_equal(br_a[:40], br_b[:40])
    assert np.array_equal(br_a[40:], br_b[40:])  # f2 solo ve f1, tampoco ve resultados dentro de f2!
