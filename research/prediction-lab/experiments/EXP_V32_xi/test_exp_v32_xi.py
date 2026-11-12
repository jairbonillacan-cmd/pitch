"""Suite de pruebas de `EXP_V32_xi` (Ola 3 · Agente `B7`).

Verifica:
  1. Paridad cruzada Python ↔ TypeScript (`< 1e-12`) invocando `src/domain/prediction/engine.ts`
     vía `npx vite-node` (`computeLineupAvailabilityDelta`, `applyAvailabilityDeltaToProbs`,
     `predictMotorA`, `predictMotorAWithAvailability`).
  2. Guardia anti-fuga estricta del contrato `CONTRACT_XI_PUBLISHED.md`
     (`ts_xi_published <= ts_captured <= ts_decision - 2.0 min < kickoff_utc`,
     fill diferido `>= ts_decision + 2.0 min <= kickoff_utc`, prohibición de inventar `ts_xi_published`
     en lecturas en frío e idempotencia JSONL append-only).
  3. Validador de fuentes legales (`api_only` vs `blocked_pending_owner_decision`) y escaneo estático
     cero evasión anti-bot en `EXP_V32_xi`.
  4. No-lectura de `holdout_sealed` (`< 2025-02-02T17:30:00Z`), congelamiento SHA-256 de `v3.1`,
     `production_activated == False`, cero campos públicos de `stake`/`kelly` y etiquetado `"no significativa"`
     cuando el IC 95% cruza `0`.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import subprocess
import sys
from typing import Any

import numpy as np
import pandas as pd
import pytest

EXP_DIR = Path(__file__).resolve().parent
PRED_LAB_ROOT = EXP_DIR.parents[1]
REPO_ROOT = EXP_DIR.parents[3]
SERVICES_MODELS_DIR = REPO_ROOT / "services" / "models"

for _p in (str(EXP_DIR), str(SERVICES_MODELS_DIR), str(PRED_LAB_ROOT)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import backtest as bt  # noqa: E402
import run_exp_v32_xi as exp  # noqa: E402
import xi_collector as xic  # noqa: E402


def _make_sample_xi_team(prefix: str) -> list[dict[str, Any]]:
    positions = ["G", "D", "D", "D", "D", "M", "M", "M", "F", "F", "F"]
    return [
        {
            "player_id": f"{prefix}_p{i + 1}",
            "player_name": f"{prefix.upper()} Player {i + 1}",
            "position": positions[i],
            "shirt_number": i + 1,
        }
        for i in range(11)
    ]


def _make_valid_xi_record(**overrides: Any) -> dict[str, Any]:
    raw_bytes = b'{"fixture":1001,"lineups_ok":true}'
    base: dict[str, Any] = {
        "event_id": "ws:football:E0:20241102:arsenal:newcastle",
        "league": "E0",
        "kickoff_utc": "2024-11-02T12:30:00Z",
        "ts_xi_published": "2024-11-02T11:25:00Z",
        "ts_captured": "2024-11-02T11:27:00Z",
        "lead_minutes_to_kickoff": 63.0,
        "home_starting_xi": _make_sample_xi_team("home"),
        "away_starting_xi": _make_sample_xi_team("away"),
        "home_missing_key_starters": [
            {
                "player_id": "home_p99",
                "player_name": "Martin Odegaard",
                "reason": "injured_out",
                "market_value_share": 0.14,
            }
        ],
        "away_missing_key_starters": [],
        "source": "api_football",
        "raw_sha256": hashlib.sha256(raw_bytes).hexdigest(),
        "ts_xi_published_precision": "transition_poll_upper_bound",
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# 1. Paridad cruzada Python ↔ TypeScript (< 1e-12) vía `npx vite-node`
# ---------------------------------------------------------------------------
def test_ts_python_parity_under_1e12(tmp_path: Path) -> None:
    model_path = REPO_ROOT / "src" / "data" / "prediction" / "model_motor_a.json"
    model = json.loads(model_path.read_text(encoding="utf-8"))

    # 40+ contextos diversos para computeLineupAvailabilityDelta
    delta_cases: list[dict[str, Any]] = [
        {"homeTeamCtx": None, "awayTeamCtx": None},
        {"homeTeamCtx": {}, "awayTeamCtx": {}},
        {
            "homeTeamCtx": {"missing_market_value_ratio": 0.18, "injured_players_count": 2},
            "awayTeamCtx": None,
        },
        {
            "homeTeamCtx": None,
            "awayTeamCtx": {"missing_market_value_ratio": 0.22, "suspended_players_count": 1},
        },
        {
            "homeTeamCtx": {
                "missing_market_value_ratio": 0.15,
                "value_ratio_vs_league_median": 1.85,
                "injured_players_count": 3,
                "rotowire_injured_out_count": 2,
                "suspended_players_count": 1,
            },
            "awayTeamCtx": {
                "missing_market_value_ratio": 0.05,
                "value_ratio_vs_league_median": 0.72,
                "injured_players_count": 1,
                "rotowire_injured_out_count": 0,
                "suspended_players_count": 0,
            },
        },
        # Saturaciones de bounds y clip_abs (+/- 0.35)
        {
            "homeTeamCtx": {
                "missing_market_value_ratio": 0.95,
                "value_ratio_vs_league_median": 0.05,
                "injured_players_count": 12,
                "rotowire_injured_out_count": 10,
                "suspended_players_count": 4,
            },
            "awayTeamCtx": {
                "missing_market_value_ratio": 0.0,
                "value_ratio_vs_league_median": 25.0,
                "injured_players_count": 0,
            },
        },
        {
            "homeTeamCtx": {
                "missing_market_value_ratio": 0.0,
                "value_ratio_vs_league_median": 18.0,
                "injured_players_count": 0,
            },
            "awayTeamCtx": {
                "missing_market_value_ratio": 0.88,
                "value_ratio_vs_league_median": 0.08,
                "injured_players_count": 9,
                "suspended_players_count": 3,
            },
        },
        # Prior deshabilitado -> exactamente 0
        {
            "homeTeamCtx": {"missing_market_value_ratio": 0.3, "injured_players_count": 3},
            "awayTeamCtx": {"missing_market_value_ratio": 0.0, "injured_players_count": 0},
            "config": {**exp.DEFAULT_PROSPECTIVE_AVAILABILITY_PRIOR, "enabled": False},
        },
        # Valores negativos o cero en value_ratio_vs_league_median -> fallback seguro
        {
            "homeTeamCtx": {"missing_market_value_ratio": -0.2, "value_ratio_vs_league_median": -1.5, "injured_players_count": -3},
            "awayTeamCtx": {"missing_market_value_ratio": 0.12, "value_ratio_vs_league_median": 0.0, "suspended_players_count": 2},
        },
    ]

    rng = np.random.default_rng(20261112)
    for _ in range(35):
        h_rw = None if rng.random() < 0.4 else int(rng.integers(0, 6))
        a_rw = None if rng.random() < 0.4 else int(rng.integers(0, 6))
        delta_cases.append(
            {
                "homeTeamCtx": {
                    "missing_market_value_ratio": float(rng.uniform(0.0, 0.75)),
                    "value_ratio_vs_league_median": float(rng.uniform(0.2, 4.5)),
                    "injured_players_count": int(rng.integers(0, 8)),
                    "rotowire_injured_out_count": h_rw,
                    "suspended_players_count": int(rng.integers(0, 3)),
                },
                "awayTeamCtx": {
                    "missing_market_value_ratio": float(rng.uniform(0.0, 0.75)),
                    "value_ratio_vs_league_median": float(rng.uniform(0.2, 4.5)),
                    "injured_players_count": int(rng.integers(0, 8)),
                    "rotowire_injured_out_count": a_rw,
                    "suspended_players_count": int(rng.integers(0, 3)),
                },
            }
        )

    prob_shift_cases = [
        {"probs": [0.45, 0.27, 0.28], "delta": 0.0},
        {"probs": [0.45, 0.27, 0.28], "delta": 0.35},
        {"probs": [0.45, 0.27, 0.28], "delta": -0.35},
        {"probs": [0.72, 0.18, 0.10], "delta": -0.215},
        {"probs": [0.14, 0.24, 0.62], "delta": 0.185},
    ]
    for d_val in np.linspace(-0.35, 0.35, 21):
        raw_p = rng.dirichlet([2.5, 1.8, 2.2])
        prob_shift_cases.append({"probs": [float(raw_p[0]), float(raw_p[1]), float(raw_p[2])], "delta": float(d_val)})

    # 25 filas reales de walk_forward_dev (< 2025-02-02) incluyendo imputación de nulos
    base_feat_names = model["features"][: model["n_features_base"]]
    div_levels = model["div_levels"]
    feats_df = pd.read_parquet(
        PRED_LAB_ROOT / "data" / "processed" / "features.parquet",
        columns=["match_date", "div"] + base_feat_names,
    )
    feats_dev = feats_df[feats_df["match_date"] < pd.Timestamp("2025-02-02")].iloc[::1500].head(25).copy()
    assert len(feats_dev) == 25

    motor_a_cases: list[dict[str, Any]] = []
    for i, (_, row_s) in enumerate(feats_dev.iterrows()):
        f_list: list[float | None] = []
        for col in base_feat_names:
            v = row_s[col]
            f_list.append(None if pd.isna(v) else float(v))
        # Forzar al menos un null explícito en la primera fila para verificar imputación idéntica TS↔Py
        if i == 0:
            f_list[0] = None
            f_list[5] = None
        div_str = f"div_{row_s['div']}"
        onehot = [1.0 if lvl == div_str else 0.0 for lvl in div_levels]
        avail: Any = (
            float(np.linspace(-0.35, 0.35, 25)[i])
            if i % 2 == 0
            else delta_cases[4 + (i % 15)]
        )
        motor_a_cases.append({"row": {"features": f_list, "div_onehot": onehot}, "availability": avail})

    bridge_in_path = tmp_path / "ts_parity_input.json"
    bridge_in_path.write_text(
        json.dumps(
            {
                "modelPath": str(model_path),
                "deltaCases": delta_cases,
                "probShiftCases": prob_shift_cases,
                "motorACases": motor_a_cases,
            }
        ),
        encoding="utf-8",
    )

    npx_bin = "npx.cmd" if os.name == "nt" else "npx"
    proc = subprocess.run(
        [
            npx_bin,
            "vite-node",
            str(EXP_DIR / "ts_parity_bridge.mts"),
            "--input",
            str(bridge_in_path),
        ],
        cwd=str(REPO_ROOT),
        capture_output=True,
        text=True,
        check=True,
        timeout=90,
    )
    stdout_lines = [ln.strip() for ln in proc.stdout.splitlines() if ln.strip().startswith("{")]
    assert stdout_lines, f"Salida inesperada de vite-node: {proc.stdout}\n{proc.stderr}"
    ts_out = json.loads(stdout_lines[-1])

    max_diff = 0.0
    for c_in, ts_res in zip(delta_cases, ts_out["deltaResults"]):
        py_res = exp.compute_lineup_availability_delta(
            c_in.get("homeTeamCtx"), c_in.get("awayTeamCtx"), c_in.get("config")
        )
        for k, ts_val in ts_res.items():
            diff = abs(float(py_res[k]) - float(ts_val))
            max_diff = max(max_diff, diff)
            assert diff < 1e-12, f"Divergencia en computeLineupAvailabilityDelta.{k}: py={py_res[k]} ts={ts_val}"

    for c_in, ts_probs in zip(prob_shift_cases, ts_out["probShiftResults"]):
        py_probs = exp.apply_availability_delta_to_probs(c_in["probs"], c_in["delta"])
        for j in range(3):
            diff = abs(py_probs[j] - float(ts_probs[j]))
            max_diff = max(max_diff, diff)
            assert diff < 1e-12

    for c_in, ts_m in zip(motor_a_cases, ts_out["motorAResults"]):
        py_base = exp.predict_motor_a(c_in["row"], model)
        py_with = exp.predict_motor_a_with_availability(c_in["row"], model, c_in["availability"])
        for key in ("pHome", "pDraw", "pAway"):
            d_base = abs(float(py_base[key]) - float(ts_m["base"][key]))
            d_with = abs(float(py_with[key]) - float(ts_m["withAvailability"][key]))
            max_diff = max(max_diff, d_base, d_with)
            assert d_base < 1e-12
            assert d_with < 1e-12
        d_delta = abs(
            float(py_with["lineupAvailabilityDelta"]) - float(ts_m["withAvailability"]["lineupAvailabilityDelta"])
        )
        max_diff = max(max_diff, d_delta)
        assert d_delta < 1e-12

    assert max_diff < 1e-12


# ---------------------------------------------------------------------------
# 2. Guardia Anti-Fuga Estricta (`ts_xi_published` + `2.0 min`) y Esquema JSONL
# ---------------------------------------------------------------------------
def test_contract_xi_anti_leakage_and_2min_guards(tmp_path: Path) -> None:
    rec = _make_valid_xi_record()
    validated = xic.validate_xi_anti_leakage(rec, "2024-11-02T11:30:00Z")
    assert validated["event_id"] == rec["event_id"]

    # Frontera exacta: ts_captured == ts_decision - 2.0 min -> permitido
    xic.validate_xi_anti_leakage(rec, "2024-11-02T11:29:00Z")

    # 1 segundo dentro del colchón de 2 minutos -> XILeakageError
    with pytest.raises(xic.XILeakageError, match="buffer 2.00m"):
        xic.validate_xi_anti_leakage(rec, "2024-11-02T11:28:59Z")

    # Clarividencia: ts_xi_published > ts_captured -> XILeakageError
    bad_pub = _make_valid_xi_record(ts_xi_published="2024-11-02T11:27:01Z")
    with pytest.raises(xic.XILeakageError, match="ts_xi_published"):
        xic.validate_xi_record(bad_pub)

    # Captura en o post-kickoff -> XILeakageError
    bad_ko = _make_valid_xi_record(
        ts_xi_published="2024-11-02T12:25:00Z",
        ts_captured="2024-11-02T12:30:00Z",
        lead_minutes_to_kickoff=0.0,
    )
    with pytest.raises(xic.XILeakageError):
        xic.validate_xi_record(bad_ko)

    # Decisión post-kickoff -> XILeakageError
    with pytest.raises(xic.XILeakageError, match="post-kickoff"):
        xic.validate_xi_anti_leakage(rec, "2024-11-02T12:30:00Z")

    # Prohibido debilitar el buffer por debajo de 2.0 min
    with pytest.raises(xic.XILeakageError):
        xic.validate_xi_anti_leakage(rec, "2024-11-02T11:30:00Z", min_ingestion_buffer_minutes=1.5)

    # Fill diferido >= ts_decision + 2.0 min: ignora tick en +1.0 min y llena en +2.0 min
    ticks = [
        {"market": "1x2", "selection": "home", "book": "pinnacle", "price_decimal": 1.95, "ts_captured": "2024-11-02T11:31:00Z"},
        {"market": "1x2", "selection": "home", "book": "pinnacle", "price_decimal": 1.88, "ts_captured": "2024-11-02T11:32:00Z"},
        {"market": "1x2", "selection": "home", "book": "pinnacle", "price_decimal": 1.84, "ts_captured": "2024-11-02T12:31:00Z"},
    ]
    fill = xic.resolve_xi_delayed_execution_tick(
        rec,
        "2024-11-02T11:30:00Z",
        ticks,
        selection="home",
        book="pinnacle",
        execution_delay_minutes=2.0,
    )
    assert fill["filled"] is True
    assert fill["price_tomado"] == pytest.approx(1.88)
    assert fill["ts_executed"] == "2024-11-02T11:32:00Z"

    with pytest.raises(xic.XILeakageError):
        xic.resolve_xi_delayed_execution_tick(
            rec, "2024-11-02T11:30:00Z", ticks, selection="home", book="pinnacle", execution_delay_minutes=1.0
        )

    # Prohibición de fabricar ts_xi_published en lectura en frío de API-Football
    api_payload = json.dumps(
        {
            "errors": [],
            "response": [
                {"startXI": [{"player": {"id": i + 1, "name": f"H{i + 1}", "pos": "M", "number": i + 1}} for i in range(11)]},
                {"startXI": [{"player": {"id": 100 + i + 1, "name": f"A{i + 1}", "pos": "M", "number": i + 1}} for i in range(11)]},
            ],
        }
    ).encode("utf-8")
    fx_meta = {
        "league": "E0",
        "kickoff_utc": "2024-11-02T12:30:00Z",
        "home_team": "Arsenal",
        "away_team": "Newcastle",
    }
    with pytest.raises(xic.XILeakageError, match="lectura en frío"):
        xic.parse_api_football_lineups_payload(
            api_payload,
            fixture_meta=fx_meta,
            ts_captured=xic.parse_strict_utc_iso("2024-11-02T11:27:00Z", "ts"),
            prior_empty_poll_ts=None,
        )

    parsed_ok = xic.parse_api_football_lineups_payload(
        api_payload,
        fixture_meta=fx_meta,
        ts_captured=xic.parse_strict_utc_iso("2024-11-02T11:27:00Z", "ts"),
        prior_empty_poll_ts=xic.parse_strict_utc_iso("2024-11-02T11:24:00Z", "prev"),
    )
    assert parsed_ok is not None
    assert parsed_ok["ts_xi_published"] == "2024-11-02T11:27:00Z"
    assert parsed_ok["ts_xi_published_precision"] == "transition_poll_upper_bound"

    # Validaciones estructurales e idempotencia append-only
    with pytest.raises(xic.XIContractError, match="exactamente 11"):
        xic.validate_xi_record(_make_valid_xi_record(home_starting_xi=_make_sample_xi_team("home")[:10]))

    with pytest.raises(xic.XIContractError, match="simultáneamente titular y ausente"):
        xic.validate_xi_record(
            _make_valid_xi_record(
                home_missing_key_starters=[{"player_id": "home_p1", "player_name": "HOME Player 1"}]
            )
        )

    jsonl_p = tmp_path / "xi_snapshots.jsonl"
    _, appended_1 = xic.append_xi_record_jsonl(jsonl_p, rec)
    _, appended_2 = xic.append_xi_record_jsonl(jsonl_p, rec)
    assert appended_1 is True
    assert appended_2 is False
    assert len(xic.load_xi_records_jsonl(jsonl_p)) == 1


# ---------------------------------------------------------------------------
# 3. Validador de Fuentes Legales y Escaneo Cero Evasión Anti-Bot
# ---------------------------------------------------------------------------
def test_legal_sources_validator_and_collector_no_evasion(tmp_path: Path) -> None:
    expected_blocked = {"espn_site_api", "sofascore", "fotmob", "flashscore", "rotowire_web"}
    expected_api_only = {"api_football", "football_data_org"}

    observed_blocked = {
        k for k, v in xic.XI_LEGAL_SOURCES_REGISTRY.items() if v.legal_status == "blocked_pending_owner_decision"
    }
    observed_api_only = {k for k, v in xic.XI_LEGAL_SOURCES_REGISTRY.items() if v.legal_status == "api_only"}
    assert observed_blocked == expected_blocked
    assert observed_api_only == expected_api_only

    for blk in expected_blocked:
        with pytest.raises(xic.XISourceBlockedError):
            xic.assert_source_legally_allowed(blk)
        with pytest.raises(xic.XISourceBlockedError):
            xic.run_collector(dry_run=True, requested_sources=[blk], env={})

    dry = xic.run_collector(dry_run=True, env={}, now_utc="2026-11-12T17:00:00Z")
    assert dry["disk_mutated"] is False
    assert dry["cadence_t60m"]["sha256_matches_frozen_v3_1"] is True
    assert dry["cadence_t60m"]["recommended_interval_minutes"] <= 3.69

    once_no_keys = xic.run_collector(
        dry_run=False,
        once=True,
        env={},
        output_dir=tmp_path,
        now_utc="2026-11-12T17:00:00Z",
    )
    assert once_no_keys["status"] == "idle_no_active_legal_credentials"
    assert once_no_keys["records_written"] == 0
    assert once_no_keys["fabricated_records"] == 0
    assert not (tmp_path / "xi_snapshots.jsonl").exists()
    assert (tmp_path / "xi_health.json").exists()

    # Simular transición legal de 2 sondeos con API_FOOTBALL_KEY presente y transporte mock limpio
    fx_list = [
        {
            "api_football_fixture_id": "998877",
            "league": "MEX",
            "kickoff_utc": "2026-11-12T18:00:00Z",
            "home_team": "Club America",
            "away_team": "Toluca",
        }
    ]
    empty_bytes = json.dumps({"errors": [], "response": []}).encode("utf-8")
    full_bytes = json.dumps(
        {
            "errors": [],
            "response": [
                {"startXI": [{"player": {"id": i + 1, "name": f"Am{i + 1}", "pos": "M", "number": i + 1}} for i in range(11)]},
                {"startXI": [{"player": {"id": 50 + i + 1, "name": f"To{i + 1}", "pos": "M", "number": i + 1}} for i in range(11)]},
            ],
        }
    ).encode("utf-8")

    r1 = xic.run_collector(
        dry_run=False,
        once=True,
        env={"API_FOOTBALL_KEY": "test_legal_key"},
        fixtures=fx_list,
        output_dir=tmp_path / "mock_run",
        now_utc="2026-11-12T16:57:00Z",
        http_get_fn=lambda url, headers=None, timeout_seconds=12.0: (200, {}, empty_bytes),
    )
    assert r1["records_written"] == 0

    r2 = xic.run_collector(
        dry_run=False,
        once=True,
        env={"API_FOOTBALL_KEY": "test_legal_key"},
        fixtures=fx_list,
        output_dir=tmp_path / "mock_run",
        now_utc="2026-11-12T17:00:00Z",
        http_get_fn=lambda url, headers=None, timeout_seconds=12.0: (200, {}, full_bytes),
    )
    assert r2["records_written"] == 1
    saved = xic.load_xi_records_jsonl(tmp_path / "mock_run" / "xi_snapshots.jsonl")
    assert len(saved) == 1
    assert saved[0]["lead_minutes_to_kickoff"] == pytest.approx(60.0)

    # Escaneo estático anti-evasión sobre módulos de implementación en EXP_V32_xi
    banned_tokens = [
        "solve_" + "cloudflare",
        "Stealthy" + "Fetcher",
        "curl_" + "cffi",
        "cloud" + "scraper",
        "undetected_" + "chromedriver",
        "puppeteer" + "-extra",
    ]
    for impl_file in ("xi_collector.py", "run_exp_v32_xi.py", "ts_parity_bridge.mts"):
        src_text = (EXP_DIR / impl_file).read_text(encoding="utf-8")
        for tok in banned_tokens:
            assert tok.lower() not in src_text.lower(), f"Token anti-bot prohibido {tok!r} en {impl_file}"


# ---------------------------------------------------------------------------
# 4. No-Lectura de Holdout, Congelamiento v3.1 y Validación de Artefactos
# ---------------------------------------------------------------------------
def test_holdout_sealed_untouched_and_v3_1_governance() -> None:
    with pytest.raises(bt.HoldoutSealedError):
        exp.enforce_walk_forward_dev_only("holdout_sealed", False)
    with pytest.raises(bt.HoldoutSealedError):
        exp.enforce_walk_forward_dev_only("walk_forward_dev", True)
    with pytest.raises(bt.HoldoutSealedError):
        exp.enforce_walk_forward_dev_only("both", True)

    leaked_df = pd.DataFrame(
        [{"event_id": "holdout_1", "ts_event_start": pd.Timestamp("2025-02-02T17:30:00Z")}]
    )
    with pytest.raises(bt.DataLeakageError):
        exp.assert_no_holdout_events(leaked_df)

    with pytest.raises(xic.XILeakageError):
        xic.validate_xi_record(
            _make_valid_xi_record(
                kickoff_utc="2025-02-02T17:30:00Z",
                ts_xi_published="2025-02-02T16:25:00Z",
                ts_captured="2025-02-02T16:27:00Z",
                lead_minutes_to_kickoff=63.0,
            ),
            forbid_holdout_after_utc=exp.HOLDOUT_CUT_UTC,
        )

    with pytest.raises(PermissionError):
        exp.register_xi_trial(
            registry_path=bt.DEFAULT_REGISTRY_PATH,
            trial_name="forbidden_shared_registry",
            provenance="observed",
            eval_split="walk_forward_dev",
            unlock_holdout=False,
            config_payload={},
        )

    frozen = exp.verify_frozen_v3_1_artifacts(REPO_ROOT)
    assert frozen["all_frozen_sha256_verified"] is True
    assert frozen["production_segments_enabled"] == 0

    assert exp.DEFAULT_RESULTS_JSON.exists(), "Debe existir exp_v32_xi_results.json"
    assert exp.DEFAULT_XI_TRIAL_REGISTRY.exists(), "Debe existir trial_registry_xi.jsonl"

    results = json.loads(exp.DEFAULT_RESULTS_JSON.read_text(encoding="utf-8"))
    assert results["production_activated"] is False
    assert results["holdout_sealed_untouched"] is True
    assert results["unlock_holdout"] is False
    assert results["eval_split"] == "walk_forward_dev"
    exp.assert_no_public_stake_fields(results)

    obs = results["observed_evaluation"]
    assert obs["provenance"] == "observed"
    assert results["local_xi_coverage_audit"]["n_events_with_real_ts_xi_published_in_dev"] == 0
    obs_cal = obs["calibration_paired_pinnacle"]
    assert obs_cal["delta_ll_xi_vs_base"] == 0.0
    assert obs_cal["delta_ll_xi_vs_base_ci95"] == [0.0, 0.0]
    assert obs_cal["delta_ll_xi_vs_base_significance_label"] == "no significativa"

    # Verificar que todo IC 95% que cruza 0 lleve obligatoriamente la etiqueta "no significativa"
    all_runs = [obs] + list(results["synthetic_sensitivity_studies"])
    for run in all_runs:
        cal = run["calibration_paired_pinnacle"]
        for metric_prefix in (
            "delta_ll_xi_vs_base",
            "delta_ll_base_vs_pinnacle_close",
            "delta_ll_xi_vs_pinnacle_close",
            "delta_brier_xi_vs_base",
            "delta_brier_base_vs_pinnacle_close",
            "delta_brier_xi_vs_pinnacle_close",
        ):
            lo, hi = cal[f"{metric_prefix}_ci95"]
            lbl = cal[f"{metric_prefix}_significance_label"]
            if lo <= 0.0 <= hi:
                assert lbl == "no significativa"
            else:
                assert lbl == "significativa"

    reg_lines = [
        json.loads(line)
        for line in exp.DEFAULT_XI_TRIAL_REGISTRY.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    assert len(reg_lines) >= 4
    for entry in reg_lines:
        assert entry["eval_split"] == "walk_forward_dev"
        assert entry["unlock_holdout"] is False
        assert entry["production_activated"] is False
