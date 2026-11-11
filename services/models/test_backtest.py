#!/usr/bin/env python3
"""Suite de pruebas unitarias e integración Red-Team para `services/models/backtest.py` (`PitchLab A3`)."""

from __future__ import annotations

from datetime import timedelta
import json
from pathlib import Path
import sys
from typing import Any

import numpy as np
import pandas as pd
import pytest

MODELS_DIR = Path(__file__).resolve().parent
REPO_ROOT = MODELS_DIR.parents[1]
for _p in (str(REPO_ROOT), str(MODELS_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

import backtest as bt
from backtest import (
    BacktestConfig,
    DataLeakageError,
    HoldoutSealedError,
    resolve_sharp_closing_market,
    run_backtest,
    settle_selection_unit_return,
)
import clv_report


def _make_synthetic_dataset(
    n_events: int = 10,
    *,
    source: str = "historical_fd",
    base_ts: str = "2024-01-01T15:00:00Z",
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Construye eventos y snapshots sintéticos causalmente válidos para tests deterministas."""
    t0 = pd.Timestamp(base_ts)
    ev_rows: list[dict[str, Any]] = []
    odds_rows: list[dict[str, Any]] = []

    for i in range(n_events):
        eid = f"ev_{i:03d}"
        ts_start = t0 + timedelta(days=7 * i)
        ts_dec = ts_start - (timedelta(hours=24) if source == "historical_fd" else timedelta(minutes=60))
        ts_disp = ts_dec - timedelta(hours=2)
        league = "E0" if i % 2 == 0 else "MEX"
        season = "2024" if i < n_events // 2 else "2025"
        outcome_y = 0 if i % 3 != 2 else 2
        h_goals, a_goals = (2.0, 0.0) if outcome_y == 0 else (0.0, 1.0)

        ev_rows.append(
            {
                "event_id": eid,
                "sport": "football",
                "league": league,
                "season": season,
                "fold_key": season,
                "market": "1x2",
                "line": np.nan,
                "source_mode": source,
                "ts_disponible": ts_disp,
                "ts_decision": ts_dec,
                "ts_event_start": ts_start,
                "home_score": h_goals,
                "away_score": a_goals,
                "y": outcome_y,
                "p_model_home": 0.56,
                "p_model_draw": 0.24,
                "p_model_away": 0.20,
            }
        )

        # Apertura (`b365` ofrece ligero valor en local; `pinnacle` ancla mercado sharp)
        open_ts = ts_dec
        close_ts = ts_start - timedelta(seconds=1)
        for book, o_open, o_close in (
            ("b365", (2.15, 3.40, 3.60), (1.95, 3.50, 4.00)),
            ("pinnacle", (2.02, 3.55, 3.95), (1.92, 3.60, 4.25)),
        ):
            for sel, p_op, p_cl in zip(("home", "draw", "away"), o_open, o_close):
                odds_rows.append(
                    {
                        "event_id": eid,
                        "sport": "football",
                        "league": league,
                        "market": "1x2",
                        "line": np.nan,
                        "selection": sel,
                        "book": book,
                        "price_decimal": p_op,
                        "ts_captured": open_ts,
                        "ts_event_start": ts_start,
                        "source": source,
                        "snapshot_stage": "open",
                    }
                )
                odds_rows.append(
                    {
                        "event_id": eid,
                        "sport": "football",
                        "league": league,
                        "market": "1x2",
                        "line": np.nan,
                        "selection": sel,
                        "book": book,
                        "price_decimal": p_cl,
                        "ts_captured": close_ts,
                        "ts_event_start": ts_start,
                        "source": source,
                        "snapshot_stage": "close",
                    }
                )

    return pd.DataFrame(ev_rows), pd.DataFrame(odds_rows)


def _always_home_selector(
    event_ctx: dict[str, Any],
    decision_quotes: list[dict[str, Any]],
    config: BacktestConfig,
) -> list[dict[str, Any]]:
    """Selector determinista auxiliar para aislar pruebas de ejecución, CLV y bootstrap."""
    b365_home = [
        q
        for q in decision_quotes
        if bt.canonical_book(q["book"]) in ("b365", "caliente")
        and bt.canonical_selection(q["selection"]) == "home"
    ]
    if not b365_home:
        return []
    q = b365_home[0]
    return [
        {
            "market": event_ctx["market"],
            "line": event_ctx["line"],
            "selection": "home",
            "book": q["book"],
            "source": q["source"],
            "price_decision": float(q["price_decimal"]),
            "p_modelo": float(event_ctx["p_model_vec"][0]),
            "p_mercado": 1.0 / float(q["price_decimal"]),
            "p_final": float(event_ctx["p_model_vec"][0]),
            "stake_u": 1.0,
            "tier": "baseline_v3_0",
        }
    ]


# ---------------------------------------------------------------------------
# 1. Principio NO NEGOCIABLE: Anti-Fuga (`DataLeakageError`)
# ---------------------------------------------------------------------------
def test_leakage_ts_disponible_after_ts_decision_raises(tmp_path: Path) -> None:
    """Inyecta `ts_disponible > ts_decision` en una fila de features y verifica `DataLeakageError`."""
    events_df, odds_df = _make_synthetic_dataset(10)
    events_df.loc[3, "ts_disponible"] = events_df.loc[3, "ts_decision"] + timedelta(seconds=1)

    with pytest.raises(DataLeakageError, match="ts_disponible"):
        run_backtest(
            {
                "phase": "test_leak_features",
                "events_df": events_df,
                "odds_df": odds_df,
                "registry_path": tmp_path / "reg.jsonl",
            }
        )


def test_leakage_decision_quote_ts_captured_after_ts_decision_raises(tmp_path: Path) -> None:
    """Inyecta una cuota evaluada en decisión con `ts_captured > ts_decision` y verifica `DataLeakageError`."""
    events_df, odds_df = _make_synthetic_dataset(10)

    # Caso A: cuota explícita en `decision_odds_df` capturada 30s después de `ts_decision`
    dec_df = odds_df[odds_df["snapshot_stage"] == "open"].copy().reset_index(drop=True)
    target_eid = str(events_df.iloc[0]["event_id"])
    target_dec_ts = events_df.iloc[0]["ts_decision"]
    dec_df.loc[dec_df["event_id"] == target_eid, "ts_captured"] = target_dec_ts + timedelta(seconds=30)

    with pytest.raises(DataLeakageError, match="ts_captured"):
        run_backtest(
            {
                "phase": "test_leak_decision_df",
                "events_df": events_df,
                "odds_df": odds_df,
                "decision_odds_df": dec_df,
                "registry_path": tmp_path / "reg_a.jsonl",
            }
        )

    # Caso B: snapshot `open` en `historical_fd` cuyo `ts_captured > ts_decision` (sin `decision_odds_df`)
    bad_odds_df = odds_df.copy()
    mask_open_0 = (bad_odds_df["event_id"] == target_eid) & (bad_odds_df["snapshot_stage"] == "open")
    bad_odds_df.loc[mask_open_0, "ts_captured"] = target_dec_ts + timedelta(minutes=5)

    with pytest.raises(DataLeakageError, match="ts_captured"):
        run_backtest(
            {
                "phase": "test_leak_open_stage",
                "events_df": events_df,
                "odds_df": bad_odds_df,
                "registry_path": tmp_path / "reg_b.jsonl",
            }
        )


def test_leakage_post_kickoff_decision_and_rogue_selector_raise(tmp_path: Path) -> None:
    """Verifica bloqueo si `ts_decision > ts_event_start` o si un selector intenta usar cuota futura."""
    events_df, odds_df = _make_synthetic_dataset(10)
    bad_ev = events_df.copy()
    bad_ev.loc[0, "ts_decision"] = bad_ev.loc[0, "ts_event_start"] + timedelta(seconds=5)

    with pytest.raises(DataLeakageError, match="post-kickoff"):
        run_backtest(
            {
                "phase": "test_post_kickoff",
                "events_df": bad_ev,
                "odds_df": odds_df,
                "registry_path": tmp_path / "reg_pk.jsonl",
            }
        )

    def rogue_selector(
        event_ctx: dict[str, Any],
        decision_quotes: list[dict[str, Any]],
        cfg: BacktestConfig,
    ) -> list[dict[str, Any]]:
        return [
            {
                "market": "1x2",
                "line": None,
                "selection": "home",
                "book": "b365",
                "source": "historical_fd",
                "price_decision": 2.15,
                "ts_captured": event_ctx["ts_decision"] + timedelta(minutes=1),
                "p_modelo": 0.56,
                "p_mercado": 0.46,
                "p_final": 0.56,
                "stake_u": 1.0,
            }
        ]

    with pytest.raises(DataLeakageError, match="ts_captured"):
        run_backtest(
            {
                "phase": "test_rogue_selector",
                "events_df": events_df,
                "odds_df": odds_df,
                "pick_selector_fn": rogue_selector,
                "registry_path": tmp_path / "reg_rogue.jsonl",
            }
        )


# ---------------------------------------------------------------------------
# 2. Ejecución Realista: Retraso 2.0 min en `scraped_ws` e Interpolación `alpha` en `historical_fd`
# ---------------------------------------------------------------------------
def test_scraped_ws_2min_execution_delay_exact_fill_and_unfilled(tmp_path: Path) -> None:
    """En `scraped_ws` multi-tick, ignora ticks en `(ts_decision, ts_decision + 2m)` y llena al primer tick `>= +2m`."""
    t_start_0 = pd.Timestamp("2025-03-01T18:00:00Z")
    t_dec_0 = pd.Timestamp("2025-03-01T17:00:00Z")

    t_start_1 = pd.Timestamp("2025-03-08T18:00:00Z")
    t_dec_1 = pd.Timestamp("2025-03-08T17:00:00Z")

    t_start_2 = pd.Timestamp("2025-03-15T18:00:00Z")  # caerá en el 20% holdout (1 de 3 eventos -> ceil(0.6)=1)
    t_dec_2 = pd.Timestamp("2025-03-15T17:00:00Z")

    events_df = pd.DataFrame(
        [
            {
                "event_id": "ws_fill",
                "sport": "football",
                "league": "MEX",
                "season": "2025",
                "fold_key": "2025",
                "market": "1x2",
                "line": np.nan,
                "source_mode": "scraped_ws",
                "ts_disponible": t_dec_0 - timedelta(hours=1),
                "ts_decision": t_dec_0,
                "ts_event_start": t_start_0,
                "home_score": 2.0,
                "away_score": 1.0,
                "y": 0,
                "p_model_home": 0.58,
                "p_model_draw": 0.24,
                "p_model_away": 0.18,
            },
            {
                "event_id": "ws_unfilled",
                "sport": "football",
                "league": "MEX",
                "season": "2025",
                "fold_key": "2025",
                "market": "1x2",
                "line": np.nan,
                "source_mode": "scraped_ws",
                "ts_disponible": t_dec_1 - timedelta(hours=1),
                "ts_decision": t_dec_1,
                "ts_event_start": t_start_1,
                "home_score": 1.0,
                "away_score": 0.0,
                "y": 0,
                "p_model_home": 0.58,
                "p_model_draw": 0.24,
                "p_model_away": 0.18,
            },
            {
                "event_id": "ws_holdout",
                "sport": "football",
                "league": "MEX",
                "season": "2025",
                "fold_key": "2025",
                "market": "1x2",
                "line": np.nan,
                "source_mode": "scraped_ws",
                "ts_disponible": t_dec_2 - timedelta(hours=1),
                "ts_decision": t_dec_2,
                "ts_event_start": t_start_2,
                "home_score": 0.0,
                "away_score": 0.0,
                "y": 1,
                "p_model_home": 0.40,
                "p_model_draw": 0.30,
                "p_model_away": 0.30,
            },
        ]
    )

    odds_rows: list[dict[str, Any]] = []
    # Evento `ws_fill`: tick decisión 16:59 (2.40), tick prematuro +90s 17:01:30 (2.35), tick válido +120s 17:02:00 (2.22), tick posterior 17:20 (2.08)
    for ts_c, prices in [
        (t_dec_0 - timedelta(minutes=1), (2.40, 3.30, 3.20)),
        (t_dec_0 + timedelta(seconds=90), (2.35, 3.30, 3.25)),
        (t_dec_0 + timedelta(minutes=2), (2.22, 3.40, 3.45)),
        (t_dec_0 + timedelta(minutes=20), (2.08, 3.50, 3.80)),
    ]:
        for sel, pr in zip(("home", "draw", "away"), prices):
            odds_rows.append(
                {
                    "event_id": "ws_fill",
                    "sport": "football",
                    "league": "MEX",
                    "market": "1x2",
                    "line": np.nan,
                    "selection": sel,
                    "book": "caliente",
                    "price_decimal": pr,
                    "ts_captured": ts_c,
                    "ts_event_start": t_start_0,
                    "source": "scraped_ws",
                }
            )
    # Cierre sharp Pinnacle para `ws_fill`
    for sel, pr in zip(("home", "draw", "away"), (2.00, 3.55, 4.10)):
        odds_rows.append(
            {
                "event_id": "ws_fill",
                "sport": "football",
                "league": "MEX",
                "market": "1x2",
                "line": np.nan,
                "selection": sel,
                "book": "pinnacle",
                "price_decimal": pr,
                "ts_captured": t_start_0 - timedelta(seconds=10),
                "ts_event_start": t_start_0,
                "source": "scraped_ws",
            }
        )

    # Evento `ws_unfilled`: tiene tick antes de decisión y tick +60s (< 2m), pero NINGÚN tick en [t_dec+2m, t_start]
    for ts_c, pr_h in [
        (t_dec_1 - timedelta(minutes=1), 2.40),
        (t_dec_1 + timedelta(seconds=60), 2.36),
        (t_start_1 + timedelta(seconds=5), 2.10),  # post-kickoff -> inválido
    ]:
        for sel, pr in zip(("home", "draw", "away"), (pr_h, 3.30, 3.20)):
            odds_rows.append(
                {
                    "event_id": "ws_unfilled",
                    "sport": "football",
                    "league": "MEX",
                    "market": "1x2",
                    "line": np.nan,
                    "selection": sel,
                    "book": "caliente",
                    "price_decimal": pr,
                    "ts_captured": ts_c,
                    "ts_event_start": t_start_1,
                    "source": "scraped_ws",
                }
            )

    rep = run_backtest(
        BacktestConfig(
            phase="test_ws_delay",
            events_df=events_df,
            odds_df=pd.DataFrame(odds_rows),
            pick_selector_fn=_always_home_selector,
            execution_delay_minutes=2.0,
            registry_path=tmp_path / "reg_ws.jsonl",
        )
    )

    assert rep["execution_summary"]["n_candidates_selected_at_decision"] == 2
    assert rep["execution_summary"]["n_picks_filled"] == 1
    assert rep["execution_summary"]["n_unfilled_execution"] == 1
    assert rep["n_picks"] == 1
    # Ganó 1u a cuota exactamente 2.22 -> PnL = +1.22u -> ROI = +1.22
    assert rep["roi_pct"] == pytest.approx(1.22, abs=1e-9)


def test_historical_fd_alpha_interpolation_and_forbids_close_betting(tmp_path: Path) -> None:
    """Verifica `p_exec = (1-alpha)/open + alpha/close`, `price_tomado = 1/p_exec` en 0.0, 0.05, 0.10 y bloquea `>= 1.0`."""
    events_df, odds_df = _make_synthetic_dataset(5, source="historical_fd")
    # Fijar open=2.50 y close=2.00 en `b365` home para comprobar fórmula exacta
    odds_df.loc[
        (odds_df["book"] == "b365") & (odds_df["selection"] == "home") & (odds_df["snapshot_stage"] == "open"),
        "price_decimal",
    ] = 2.50
    odds_df.loc[
        (odds_df["book"] == "b365") & (odds_df["selection"] == "home") & (odds_df["snapshot_stage"] == "close"),
        "price_decimal",
    ] = 2.00
    # Todos ganan local para leer `price_tomado = 1 + roi_pct` directamente
    events_df["home_score"] = 2.0
    events_df["away_score"] = 0.0
    events_df["y"] = 0

    for alpha_val, expected_p_exec in [(0.0, 0.40), (0.05, 0.405), (0.10, 0.41)]:
        rep = run_backtest(
            BacktestConfig(
                phase=f"test_alpha_{alpha_val}",
                events_df=events_df,
                odds_df=odds_df,
                pick_selector_fn=_always_home_selector,
                historical_delay_alpha=alpha_val,
                registry_path=tmp_path / "reg_alpha.jsonl",
            )
        )
        expected_price = 1.0 / expected_p_exec
        assert rep["n_picks"] == 4  # 80% dev de 5 eventos = 4
        assert rep["roi_pct"] == pytest.approx(expected_price - 1.0, abs=1e-12)

    with pytest.raises(DataLeakageError, match="historical_delay_alpha"):
        run_backtest(
            BacktestConfig(
                phase="test_alpha_close_forbidden",
                events_df=events_df,
                odds_df=odds_df,
                historical_delay_alpha=1.0,
                registry_path=tmp_path / "reg_alpha.jsonl",
            )
        )


# ---------------------------------------------------------------------------
# 3. Definición Estricta de Cuota de Cierre Sharp
# ---------------------------------------------------------------------------
def test_strict_sharp_closing_rules_pinnacle_and_smarkets_fallback() -> None:
    """En `historical_fd` solo Pinnacle `close` es válido; en `scraped_ws` Pinnacle -> Smarkets; recreativas -> missing."""
    ts_start = pd.Timestamp("2025-05-01T20:00:00Z")

    # 1) Histórico sin Pinnacle `close` (solo Pinnacle `open`, `b365` `close` y `bfe` `close`) -> closing_missing=True
    hist_no_pin_close = [
        {"market": "1x2", "line": None, "selection": s, "book": "pinnacle", "price_decimal": p,
         "ts_captured": ts_start - timedelta(hours=24), "source": "historical_fd", "snapshot_stage": "open"}
        for s, p in zip(("home", "draw", "away"), (2.05, 3.50, 3.90))
    ] + [
        {"market": "1x2", "line": None, "selection": s, "book": b, "price_decimal": p,
         "ts_captured": ts_start - timedelta(seconds=1), "source": "historical_fd", "snapshot_stage": "close"}
        for b in ("b365", "bfe")
        for s, p in zip(("home", "draw", "away"), (2.00, 3.50, 4.00))
    ]
    res_hist = resolve_sharp_closing_market(hist_no_pin_close, market="1x2", line=None, ts_event_start=ts_start)
    assert res_hist["closing_missing"] is True
    assert res_hist["closing_book"] is None

    # 2) `scraped_ws` sin Pinnacle pero con Smarkets -> fallback válido a `smarkets`
    ws_smarkets = [
        {"market": "1x2", "line": None, "selection": s, "book": "smarkets", "price_decimal": p,
         "ts_captured": ts_start - timedelta(minutes=3), "source": "scraped_ws"}
        for s, p in zip(("home", "draw", "away"), (2.10, 3.45, 3.85))
    ]
    res_ws_smk = resolve_sharp_closing_market(ws_smarkets, market="1x2", line=None, ts_event_start=ts_start)
    assert res_ws_smk["closing_missing"] is False
    assert res_ws_smk["closing_book"] == "smarkets"
    assert sum(res_ws_smk["probs_novig"].values()) == pytest.approx(1.0, abs=1e-12)

    # 3) `scraped_ws` solo con casas recreativas (`caliente`, `codere`, `b365`) -> closing_missing=True
    ws_soft_only = [
        {"market": "1x2", "line": None, "selection": s, "book": "caliente", "price_decimal": p,
         "ts_captured": ts_start - timedelta(minutes=1), "source": "scraped_ws"}
        for s, p in zip(("home", "draw", "away"), (1.95, 3.40, 3.70))
    ]
    res_ws_soft = resolve_sharp_closing_market(ws_soft_only, market="1x2", line=None, ts_event_start=ts_start)
    assert res_ws_soft["closing_missing"] is True


# ---------------------------------------------------------------------------
# 4. Walk-Forward Estricto + Holdout Sellado (Último 20% Temporal) + Registro de Ensayos
# ---------------------------------------------------------------------------
def test_walk_forward_chronological_80_20_sealed_holdout_and_trial_registry(tmp_path: Path) -> None:
    """Verifica bloqueo del último 20% temporal y conteo exacto `n_configs_tested_before_holdout`."""
    events_df, odds_df = _make_synthetic_dataset(20)
    # Desordenar deliberadamente para comprobar que el arnés ordena cronológicamente antes del corte 80/20
    shuffled_events = events_df.sample(frac=1.0, random_state=7).reset_index(drop=True)
    reg_file = tmp_path / "holdout_trial_registry.jsonl"

    # Intento de abrir `holdout_sealed` sin `unlock_holdout=True` -> HoldoutSealedError
    with pytest.raises(HoldoutSealedError):
        run_backtest(
            BacktestConfig(
                phase="illegal_holdout_peek",
                eval_split="holdout_sealed",
                unlock_holdout=False,
                events_df=shuffled_events,
                odds_df=odds_df,
                registry_path=reg_file,
            )
        )

    # Intento de reducir `holdout_fraction < 0.20` -> HoldoutSealedError
    with pytest.raises(HoldoutSealedError):
        run_backtest(
            BacktestConfig(
                phase="illegal_fraction",
                holdout_fraction=0.10,
                events_df=shuffled_events,
                odds_df=odds_df,
                registry_path=reg_file,
            )
        )

    # Correr 3 configuraciones distintas en `walk_forward_dev` ( más 1 repetición de la 3ra para probar hashes únicos )
    for min_ev_val in (0.01, 0.02, 0.03, 0.03):
        dev_rep = run_backtest(
            BacktestConfig(
                phase="dev_grid_search",
                eval_split="walk_forward_dev",
                unlock_holdout=False,
                min_ev=min_ev_val,
                events_df=shuffled_events,
                odds_df=odds_df,
                registry_path=reg_file,
            )
        )
        assert dev_rep["split_summary"]["n_total"] == 20
        assert dev_rep["split_summary"]["n_dev"] == 16
        assert dev_rep["split_summary"]["n_holdout"] == 4
        assert dev_rep["calibration"]["global"]["n_events_total"] == 16
        assert "n_configs_tested_before_holdout" not in dev_rep

    # Desbloquear `holdout_sealed` al cierre de la fase -> reporta obligatoriamente `n_configs_tested_before_holdout == 3`
    holdout_rep = run_backtest(
        BacktestConfig(
            phase="final_phase_gate",
            eval_split="holdout_sealed",
            unlock_holdout=True,
            min_ev=0.02,
            events_df=shuffled_events,
            odds_df=odds_df,
            registry_path=reg_file,
        )
    )
    assert holdout_rep["n_configs_tested_before_holdout"] == 3
    assert holdout_rep["calibration"]["global"]["n_events_total"] == 4

    lines = [json.loads(line) for line in reg_file.read_text(encoding="utf-8").splitlines() if line.strip()]
    assert len(lines) == 5
    assert lines[-1]["unlock_holdout"] is True
    assert lines[-1]["n_configs_tested_before_this_call"] == 3


# ---------------------------------------------------------------------------
# 5. Contrato de Métricas, Bootstrap >= 1000, Significancia y Paridad con `a2-ledger`
# ---------------------------------------------------------------------------
def test_bootstrap_metrics_contract_and_a2_ledger_integration(tmp_path: Path) -> None:
    """Verifica todas las métricas obligatorias, IC 95% (`>= 1000`), bandera `no significativa` y puente `clv_report`."""
    events_df, odds_df = _make_synthetic_dataset(20)

    with pytest.raises(ValueError, match="bootstrap_samples"):
        run_backtest(
            BacktestConfig(
                events_df=events_df,
                odds_df=odds_df,
                bootstrap_samples=500,
                registry_path=tmp_path / "reg_bad_boot.jsonl",
            )
        )

    # Alternar victorias y derrotas al 50% con cuota ~2.0 para que el IC 95% de ROI cruce 0 -> `no significativa`
    for idx in range(len(events_df)):
        win_home = idx % 2 == 0
        events_df.loc[idx, "home_score"] = 1.0 if win_home else 0.0
        events_df.loc[idx, "away_score"] = 0.0 if win_home else 1.0
        events_df.loc[idx, "y"] = 0 if win_home else 2
        events_df.loc[idx, "p_model_home"] = 0.50
        events_df.loc[idx, "p_model_draw"] = 0.25
        events_df.loc[idx, "p_model_away"] = 0.25

    rep = run_backtest(
        BacktestConfig(
            phase="test_metrics_contract",
            events_df=events_df,
            odds_df=odds_df,
            pick_selector_fn=_always_home_selector,
            bootstrap_samples=1000,
            seed=42,
            registry_path=tmp_path / "reg_metrics.jsonl",
        )
    )

    required_top_keys = (
        "log_loss_model",
        "log_loss_closing_novig",
        "delta_log_loss",
        "delta_log_loss_ci95",
        "brier_model",
        "brier_closing_novig",
        "delta_brier",
        "delta_brier_ci95",
        "n_picks",
        "roi_pct",
        "roi_pct_ci95",
        "clv_pct_mean",
        "clv_pct_ci95",
        "clv_prob_mean",
        "clv_prob_ci95",
        "pct_picks_clv_positive",
        "max_drawdown_u",
    )
    for key in required_top_keys:
        assert key in rep, f"Falta clave obligatoria en report: {key}"

    # Desglose por `league × market` presente en calibración y apuestas
    assert "E0__1x2" in rep["calibration"]["by_league_market"]
    assert "MEX__1x2" in rep["calibration"]["by_league_market"]
    assert "E0__1x2" in rep["betting"]["by_league_market"]
    assert "MEX__1x2" in rep["betting"]["by_league_market"]

    # Integración real con `services/models/clv_report.py` (`a2-ledger`)
    assert rep["betting"]["global"]["clv_report_connected"] is True

    # Cuando el IC 95% de ROI cruza 0, debe marcarse `roi_significant: False` y `"no significativa"`
    roi_lo, roi_hi = rep["roi_pct_ci95"]
    assert roi_lo <= 0.0 <= roi_hi
    assert rep["roi_significant"] is False
    assert rep["roi_significance"] == "no significativa"

    # Cuando el CLV es uniformemente positivo en todos los picks, el IC 95% queda > 0 -> significativa
    clv_lo, clv_hi = rep["clv_pct_ci95"]
    assert clv_lo > 0.0 and clv_hi > 0.0
    assert rep["clv_pct_significant"] is True
    assert rep["pct_picks_clv_positive"] == pytest.approx(1.0)
    assert rep["max_drawdown_u"] > 0.0


def test_walk_forward_custom_model_fn_strict_causality(tmp_path: Path) -> None:
    """Verifica que `model_fn` entrenado por pliegue jamás observe eventos `>= fold_cut_ts` ni del holdout."""
    events_df, odds_df = _make_synthetic_dataset(15)
    seen_folds: list[tuple[str, int, int]] = []

    def causal_model_fn(train_df: pd.DataFrame, test_df: pd.DataFrame, cfg: BacktestConfig) -> pd.DataFrame:
        cut_ts = test_df["ts_decision"].min()
        if not train_df.empty:
            assert (train_df["ts_event_start"] < cut_ts).all()
        seen_folds.append((str(test_df["fold_key"].iloc[0]), len(train_df), len(test_df)))
        out = test_df.copy()
        out["p_model_home"] = 0.55
        out["p_model_draw"] = 0.25
        out["p_model_away"] = 0.20
        return out

    rep = run_backtest(
        BacktestConfig(
            phase="test_custom_wf",
            walk_forward_granularity="month",
            events_df=events_df,
            odds_df=odds_df,
            model_fn=causal_model_fn,
            registry_path=tmp_path / "reg_wf.jsonl",
        )
    )
    assert len(seen_folds) >= 2
    assert rep["calibration"]["global"]["n_events_total"] == 12  # 80% de 15 = 12


def test_asian_handicap_quarter_lines_and_totals_settlement_and_ledger_compat() -> None:
    """Verifica liquidación exacta de cuartos asiáticos (`.25`/`.75`) y compatibilidad con `PickLedger` de A2."""
    # Local 1-1 con línea -0.25 -> diff = -0.25 -> half_loss (-0.5u por unidad apostada)
    st_hl, ret_hl = settle_selection_unit_return("ah", "home", -0.25, 1.95, 1.0, 1.0)
    assert st_hl == "half_loss"
    assert ret_hl == pytest.approx(-0.5)

    # Local 1-1 con línea +0.25 -> diff = +0.25 -> half_win (+0.5 * 0.90 = +0.45u)
    st_hw, ret_hw = settle_selection_unit_return("ah", "home", 0.25, 1.90, 1.0, 1.0)
    assert st_hw == "half_win"
    assert ret_hw == pytest.approx(0.45)

    # Totales 2-0 con línea 2.0 -> push/void (0.0u)
    st_push, ret_push = settle_selection_unit_return("totals", "over", 2.0, 1.92, 2.0, 0.0)
    assert st_push == "void"
    assert ret_push == pytest.approx(0.0)

    # Verificar que un pick emitido es aceptado sin fricción por `clv_report.PickLedger`
    ledger = clv_report.PickLedger()
    entry = ledger.append_pick(
        {
            "pick_id": "test:ev_001:1x2:home:0",
            "ts_emitido": "2025-01-01T12:00:00+00:00",
            "event_id": "ev_001",
            "sport": "football",
            "league": "E0",
            "market": "1x2",
            "line": None,
            "selection": "home",
            "book": "b365",
            "price_tomado": 2.10,
            "p_modelo": 0.54,
            "p_mercado": 0.47,
            "p_final": 0.52,
            "ev": 0.092,
            "stake_u": 0.025,
            "tier": "baseline_v3_0",
            "version_modelo": "spacetime_v3.0+geodesic_v2.0",
            "features_hash": clv_report.compute_features_hash({"event_id": "ev_001"}),
        }
    )
    assert entry.pick_id == "test:ev_001:1x2:home:0"
    assert ledger.verify_integrity() is True
