"""REM_08 — Generador del Manifiesto Canónico `src/data/prediction/candidate_registry_v5_1.json`.

Centraliza la lista única de artefactos activos `v5.1` por deporte/mercado, su `validation_status`
honesto y su hash criptográfico `SHA-256`, además de auditar los `11` artefactos congelados `v3.0/v3.1/v3.2`.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "src" / "data" / "prediction"
REGISTRY_OUT = DATA_DIR / "candidate_registry_v5_1.json"

FROZEN_BASELINES: dict[str, str] = {
    "src/domain/prediction/engine.ts": "77dc721430ff17b1",
    "src/domain/prediction/outlook.ts": "26933d21438d5298",
    "src/domain/prediction/service.ts": "53fbf32117ab6a64",
    "src/data/prediction/live_matchday_v3_snapshot.json": "1dace760d68442e7",
    "src/data/prediction/production_segments_v3_1.json": "0bc03bbff96a5d82",
    "src/data/prediction/blend_weights_v3_1.json": "b29d7a451f601112",
    "src/data/prediction/pick_policy_v3_1.json": "2359c8f8822ea394",
    "src/data/prediction/stale_lines_config.json": "8bcb9c7be93270cd",
    "src/data/prediction/model_motor_a.json": "3c72967eddc79bb7",
    "src/data/prediction/model_nfl.json": "e74ae241875739d2",
    "services/models/artifacts/sealed_holdout_v3_1_eval.json": "5c9e550bfd7889e4",
}


def _sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def main() -> None:
    inplay_art = json.loads((DATA_DIR / "model_inplay_early_payout_v5_0_candidate.json").read_text(encoding="utf-8"))
    nfl_ep_status = inplay_art["points_sports_early_payout"]["nfl"].get("validation_status", "theoretical_reflection_unvalidated")

    entries: list[dict[str, Any]] = [
        {
            "id": "soccer_club_1x2_v5_1",
            "sport": "soccer",
            "market": "1x2_clubs_22_leagues",
            "version": "5.1.0-candidate",
            "artifact_path": "src/data/prediction/gbm_club_v5_0_candidate.json",
            "state_path": "src/data/prediction/club_state_v5_1.json",
            "validation_status": "oos_validated_2020_2024_cluster_bootstrap",
            "remediation_phase": "REM_02",
        },
        {
            "id": "soccer_club_goals_4param_v5_1",
            "sport": "soccer",
            "market": "totals_btts_score_matrix_clubs",
            "version": "5.1.0-candidate",
            "artifact_path": "src/data/prediction/model_club_goals_v5_0_candidate.json",
            "validation_status": "oos_validated_2020_2024_no_double_inflation",
            "remediation_phase": "REM_02",
        },
        {
            "id": "soccer_intl_meridian_4param_v5_1",
            "sport": "soccer_international",
            "market": "totals_btts_score_matrix_meridian",
            "version": "5.1.0-candidate",
            "artifact_path": "src/data/prediction/model_intl_goals_v5_0_candidate.json",
            "validation_status": "oos_validated_2020_2024_4markets_reported",
            "remediation_phase": "REM_02",
        },
        {
            "id": "soccer_micro_markets_v5_1",
            "sport": "soccer",
            "market": "corners_cards_fouls_sot_shots_reds_booking_points",
            "version": "5.1.0-candidate",
            "artifact_path": "src/data/prediction/model_soccer_micro_v5_0_candidate.json",
            "state_path": "src/data/prediction/club_micro_state_v5_1.json",
            "officials_path": "src/data/prediction/official_priors_v5_1.json",
            "validation_status": "oos_validated_2020_2024_pruned_hgb_conditional_bp",
            "remediation_phase": "REM_03",
        },
        {
            "id": "nfl_minkowski_complete_v5_1",
            "sport": "nfl",
            "market": "ml_spread_ats_posterior_discrete_totals_ot_pbp_props",
            "version": "5.1.0-candidate",
            "artifact_path": "src/data/prediction/model_nfl_v5_0_candidate.json",
            "moneyline_ensemble_path": "src/data/prediction/gbm_nfl_v3_5_candidate.json",
            "totals_ridge_path": "src/data/prediction/model_nfl_totals_v3_5_candidate.json",
            "state_path": "src/data/prediction/nfl_causal_state_v3_5.json",
            "validation_status": "oos_validated_2020_2024_deconvolved_margin_causal_qb",
            "remediation_phase": "REM_04",
        },
        {
            "id": "soccer_hierarchical_props_v5_1",
            "sport": "soccer",
            "market": "player_props_0_5_and_1_5_plus",
            "version": "5.1.0-candidate",
            "artifact_path": "src/data/prediction/model_hierarchical_props_v5_0_candidate.json",
            "validation_status": "oos_validated_2020_2024_causal_starters_clean_ko90_shots_eb_only",
            "remediation_phase": "REM_05",
        },
        {
            "id": "sgp_copula_and_player_linked_v5_1",
            "sport": "soccer_and_nfl",
            "market": "same_game_parlay_copula_and_player_linked_raikov_dc",
            "version": "5.1.0-candidate",
            "artifact_path": "src/data/prediction/sgp_copula_v5_0_candidate.json",
            "validation_status": "oos_validated_2020_2024_residualized_exact_quantile_bw0012",
            "remediation_phase": "REM_05",
        },
        {
            "id": "inplay_and_early_payout_v5_1",
            "sport": "soccer_nfl_nba_mlb",
            "market": "early_payout_and_inplay_spacetime",
            "version": "5.1.0-candidate",
            "artifact_path": "src/data/prediction/model_inplay_early_payout_v5_0_candidate.json",
            "validation_status": f"soccer_oos_validated__nfl_{nfl_ep_status}__nba_mlb_theoretical_reflection_unvalidated",
            "remediation_phase": "REM_06",
        },
        {
            "id": "epistemic_conformal_venn_abers_v5_1",
            "sport": "soccer_nfl_multisport",
            "market": "epistemic_90pct_confidence_intervals",
            "version": "5.1.0-candidate",
            "artifact_path": "src/data/prediction/model_epistemic_conformal_v5_1_candidate.json",
            "validation_status": "oos_validated_2020_2024_inductive_venn_abers_and_logit_envelope",
            "remediation_phase": "REM_06",
        },
        {
            "id": "multisport_unified_v5_1",
            "sport": "mlb_nhl_nba_ncaaf",
            "market": "ml_spread_totals_f5_runline_puckline",
            "version": "5.1.0-candidate",
            "artifact_path": "src/data/prediction/multisport_v4_0_state_candidate.json",
            "validation_status": "structural_prior_no_game_oos",
            "remediation_phase": "REM_07",
        },
        {
            "id": "live_matchday_unified_snapshot_v5_1",
            "sport": "all_10_leagues",
            "market": "unified_matchday_242_matchups",
            "version": "5.1.0-candidate",
            "artifact_path": "src/data/prediction/live_matchday_v5_candidate_snapshot.json",
            "validation_status": "live_inference_zero_v3_copies_honest_data_quality",
            "remediation_phase": "REM_01",
        },
    ]

    for ent in entries:
        ap = REPO_ROOT / ent["artifact_path"]
        assert ap.exists(), f"Artefacto faltante: {ent['artifact_path']}"
        ent["sha256"] = _sha256(ap)
        ent["size_bytes"] = ap.stat().st_size

    frozen_audit: dict[str, dict[str, Any]] = {}
    for rel_p, expected_prefix in FROZEN_BASELINES.items():
        fp = REPO_ROOT / rel_p
        assert fp.exists(), f"Artefacto congelado faltante: {rel_p}"
        actual_sha = _sha256(fp)
        assert actual_sha.startswith(expected_prefix), f"HASH CONGELADO MODIFICADO en {rel_p}: {actual_sha} != {expected_prefix}*"
        frozen_audit[rel_p] = {"sha256": actual_sha, "intact": True}

    payload = {
        "schema_version": "candidate_registry_v5.1.0",
        "suite_codename": "PitchLab v5.1 Self-Audited Remediation Suite",
        "status": "candidate",
        "production_activated": False,
        "holdout_cut_utc": "2025-02-02T17:30:00Z",
        "holdout_sealed_untouched": True,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "n_active_candidate_artifacts": len(entries),
        "ts_barrel_entrypoint": "src/domain/prediction/v5_index.ts",
        "active_artifacts": entries,
        "frozen_v3_governance_audit": frozen_audit,
    }
    REGISTRY_OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"[REM_08] Manifiesto canónico guardado en {REGISTRY_OUT.name} ({len(entries)} artefactos v5.1, 11/11 congelados intactos)")


if __name__ == "__main__":
    main()
