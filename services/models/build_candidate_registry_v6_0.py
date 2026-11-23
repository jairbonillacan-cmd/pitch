"""EXP_V62 — Generador del Manifiesto Criptográfico Canónico `src/data/prediction/candidate_registry_v6_0.json`.

Indexa con `SHA-256` y `size_bytes` todos los artefactos activos `v6.0` (`EXP_V58`..`EXP_V62`,
`status: "candidate"`, `production_activated: False`, `holdout_sealed_untouched: True`) y verifica
criptográficamente los **`25 / 25` artefactos previos intactos** (`11` congelados `v3.0/v3.1/v3.2` +
`11` de `v5.1` + `3` de `v5.2`).
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "src" / "data" / "prediction"
REGISTRY_OUT = DATA_DIR / "candidate_registry_v6_0.json"

FROZEN_V3_BASELINES_11: dict[str, str] = {
    "src/domain/prediction/engine.ts": "77dc721430ff17b10cdfa6e1fb472a0bab37a7160636fa4fe7def012249d78a7",
    "src/domain/prediction/outlook.ts": "26933d21438d5298d527cde11913faad26242b326a18ad3d5e683c510cecca47",
    "src/domain/prediction/service.ts": "53fbf32117ab6a649fa5a06be4b75637aaba34cc473533867552d6a3c53c80b5",
    "src/data/prediction/live_matchday_v3_snapshot.json": "1dace760d68442e73c4b365f85cd16509093716b1bcac72aa1da67b61ec29699",
    "src/data/prediction/production_segments_v3_1.json": "0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc",
    "src/data/prediction/blend_weights_v3_1.json": "b29d7a451f6011126997c122778b42ad3239c78337d17c5fa78d550f5c92739b",
    "src/data/prediction/pick_policy_v3_1.json": "2359c8f8822ea394a380202c04e0bcd010d1a3fae7c5c25b8c11ebe810bfb7d1",
    "src/data/prediction/stale_lines_config.json": "8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac",
    "src/data/prediction/model_motor_a.json": "3c72967eddc79bb71ca7fcae40bf21aae760269dc62b43cf2b2db7eeacfceec9",
    "src/data/prediction/model_nfl.json": "e74ae241875739d2dc18564f85133d4e20c1d0cef41d64b6f705852601597225",
    "services/models/artifacts/sealed_holdout_v3_1_eval.json": "5c9e550bfd7889e44f674c91cf64cea4c07b4281fc72231b8cadff850309f2dd",
}

INHERITED_V5_1_BASELINES_11: dict[str, str] = {
    "src/data/prediction/gbm_club_v5_0_candidate.json": "e6345a01d79ae73b2d306be12dad03aae8ae16286dcad2c8794bc2b5ea7aa939",
    "src/data/prediction/model_club_goals_v5_0_candidate.json": "6cd7d6eb3eeed44ab1c3e0b894a08f69de5737da0edc9b9b58e3e6676edeef51",
    "src/data/prediction/model_intl_goals_v5_0_candidate.json": "4f7de6a596e80d4ccadb1442de99d9612cad33a6231570ba3daf66257c8c5708",
    "src/data/prediction/model_soccer_micro_v5_0_candidate.json": "fe8cb21debbae900e3c181aab46879750410468b1e3d3d1b316e025627024398",
    "src/data/prediction/model_nfl_v5_0_candidate.json": "1ccaf831df66c52252c13a81affa6d77704800d7305c23aae04a0a00fddccdd3",
    "src/data/prediction/model_hierarchical_props_v5_0_candidate.json": "40702cd3181707b5f3457fc844ebd543fbc26c5f626450dc71a4def28d721320",
    "src/data/prediction/sgp_copula_v5_0_candidate.json": "56ef8d07ac00a96890ce1b60368ae1c6fcbea9a040f14967edc87dc307e41b94",
    "src/data/prediction/model_inplay_early_payout_v5_0_candidate.json": "b0e6a50735856dd3ce052a46042f9b8c07b7f1859977b20eb1de244f8164d408",
    "src/data/prediction/model_epistemic_conformal_v5_1_candidate.json": "657843b8af2961d9b3fde7f6e4c796be8206caa2b0bbdebaf11187d26459c5ba",
    "src/data/prediction/multisport_v4_0_state_candidate.json": "79f04770695eca43c3eb823317b1c81adceae2adfab058fd50ee44859c4da4c7",
    "src/data/prediction/live_matchday_v5_candidate_snapshot.json": "02d17fc10ace231ed60fa8563c5888319e6aa8f8a5f26ae3439b88c1df30e834",
}

INHERITED_V5_2_BASELINES_3: dict[str, str] = {
    "src/data/prediction/model_v5_2_live_feedback_candidate.json": "012dcb47fb9e025c6e7e99c4b40a4a1388c4b412e34c50afe4ed92a0d9c5b512",
    "src/data/prediction/v5_2_live_feedback_snapshot.json": "7e93a5d197a9a06fa4bf2ff2eabc90c13f2f18d60518ac00d1edd06cd94e17fa",
    "research/prediction-lab/experiments/EXP_V57_v5_2_live_feedback/artifacts/exp_v57_v5_2_results.json": "3ab18320e544f1448f3fde20f047ddaef3d0500414e95aa59564251ecb012ff5",
}


def _sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def _verify_baseline_map(baselines: dict[str, str], label: str) -> dict[str, dict[str, Any]]:
    audit: dict[str, dict[str, Any]] = {}
    for rel_p, expected_sha in baselines.items():
        fp = REPO_ROOT / rel_p
        if not fp.exists():
            raise FileNotFoundError(f"[{label}] Artefacto previo faltante: {rel_p}")
        actual_sha = _sha256(fp)
        if actual_sha != expected_sha:
            raise AssertionError(
                f"[{label}] VIOLACIÓN CRIPTOGRÁFICA en {rel_p}: {actual_sha} != {expected_sha}"
            )
        audit[rel_p] = {
            "sha256": actual_sha,
            "size_bytes": fp.stat().st_size,
            "intact": True,
        }
    return audit


def main() -> None:
    frozen_v3_audit = _verify_baseline_map(FROZEN_V3_BASELINES_11, "v3_frozen_11")
    v5_1_audit = _verify_baseline_map(INHERITED_V5_1_BASELINES_11, "v5_1_inherited_11")
    v5_2_audit = _verify_baseline_map(INHERITED_V5_2_BASELINES_3, "v5_2_inherited_3")

    total_prior_verified = len(frozen_v3_audit) + len(v5_1_audit) + len(v5_2_audit)
    assert total_prior_verified == 25, f"Expected 25 prior artifacts verified, got {total_prior_verified}"

    v6_entries: list[dict[str, Any]] = [
        {
            "id": "soccer_57_causal_hierarchy_model_v6_0",
            "experiment": "EXP_V58",
            "sport": "soccer_53_competitions",
            "market": "1x2_4param_score_matrix_venn_abers_playable",
            "version": "6.0.0-candidate",
            "artifact_path": "src/data/prediction/model_soccer_57_v6_0_candidate.json",
            "ts_module": "src/domain/prediction/soccer_57_v6_0.ts",
            "validation_status": "walk_forward_date_causal_2026_active_43_plus_10_confederation_prior",
        },
        {
            "id": "soccer_57_parity_snapshot_v6_0",
            "experiment": "EXP_V58",
            "sport": "soccer_53_competitions",
            "market": "parity_vectors_60_ieee754",
            "version": "6.0.0-candidate",
            "artifact_path": "src/data/prediction/soccer_57_v6_0_snapshot.json",
            "ts_module": "src/domain/prediction/soccer_57_v6_0.ts",
            "validation_status": "ieee754_parity_lt_1e12_verified",
        },
        {
            "id": "exp_v58_soccer_57_results_v6_0",
            "experiment": "EXP_V58",
            "sport": "soccer_53_competitions",
            "market": "oos_evaluation_report",
            "version": "6.0.0-candidate",
            "artifact_path": "research/prediction-lab/experiments/EXP_V58_soccer_57_v6_0/artifacts/exp_v58_soccer_57_v6_0_results.json",
            "ts_module": "src/domain/prediction/soccer_57_v6_0.ts",
            "validation_status": "cluster_mulberry32_1000_seed_20261111",
        },
        {
            "id": "props_coupled_gk_us_model_v6_0",
            "experiment": "EXP_V59",
            "sport": "soccer_and_us_major_pro",
            "market": "coupled_shots_multiline_gk_saves_sgp_us_props",
            "version": "6.0.0-candidate",
            "artifact_path": "src/data/prediction/model_props_v6_0_candidate.json",
            "ts_module": "src/domain/prediction/props_v6_0.ts",
            "validation_status": "oos_2020_2025_preholdout_and_us_prospective_walkforward",
        },
        {
            "id": "props_parity_snapshot_v6_0",
            "experiment": "EXP_V59",
            "sport": "soccer_and_us_major_pro",
            "market": "parity_vectors_88_ieee754",
            "version": "6.0.0-candidate",
            "artifact_path": "src/data/prediction/props_v6_0_snapshot.json",
            "ts_module": "src/domain/prediction/props_v6_0.ts",
            "validation_status": "ieee754_parity_lt_1e12_verified",
        },
        {
            "id": "exp_v59_props_results_v6_0",
            "experiment": "EXP_V59",
            "sport": "soccer_and_us_major_pro",
            "market": "oos_evaluation_report",
            "version": "6.0.0-candidate",
            "artifact_path": "research/prediction-lab/experiments/EXP_V59_props_v6_0/artifacts/exp_v59_props_v6_0_results.json",
            "ts_module": "src/domain/prediction/props_v6_0.ts",
            "validation_status": "cluster_mulberry32_1000_seed_20261111",
        },
        {
            "id": "multisport_walkforward_physics_model_v6_0",
            "experiment": "EXP_V60",
            "sport": "mlb_nhl_nba_nfl",
            "market": "ml_spread_totals_f5_emptynet_early_payout",
            "version": "6.0.0-candidate",
            "artifact_path": "src/data/prediction/model_multisport_v6_0_candidate.json",
            "ts_module": "src/domain/prediction/multisport_v6_0.ts",
            "validation_status": "walk_forward_game_oos_2026_verified_2920_games",
        },
        {
            "id": "multisport_parity_and_live_snapshot_v6_0",
            "experiment": "EXP_V60",
            "sport": "mlb_nhl_nba_nfl",
            "market": "parity_vectors_64_plus_82_live_scheduled",
            "version": "6.0.0-candidate",
            "artifact_path": "src/data/prediction/multisport_v6_0_snapshot.json",
            "ts_module": "src/domain/prediction/multisport_v6_0.ts",
            "validation_status": "ieee754_parity_lt_1e12_verified",
        },
        {
            "id": "exp_v60_multisport_results_v6_0",
            "experiment": "EXP_V60",
            "sport": "mlb_nhl_nba_nfl",
            "market": "oos_evaluation_report",
            "version": "6.0.0-candidate",
            "artifact_path": "research/prediction-lab/experiments/EXP_V60_multisport_v6_0/artifacts/exp_v60_multisport_v6_0_results.json",
            "ts_module": "src/domain/prediction/multisport_v6_0.ts",
            "validation_status": "cluster_mulberry32_1000_seed_20261111",
        },
        {
            "id": "officials_and_prekickoff_freeze_model_v6_0",
            "experiment": "EXP_V61",
            "sport": "all_57_leagues",
            "market": "global_referees_booking_points_prekickoff_seal_power_devig",
            "version": "6.0.0-candidate",
            "artifact_path": "src/data/prediction/model_officials_freeze_v6_0_candidate.json",
            "ts_module": "src/domain/prediction/prekickoff_freeze_v6_0.ts",
            "validation_status": "1110_soccer_officials_166_snapshots_zero_contaminated_accepted",
        },
        {
            "id": "officials_freeze_parity_snapshot_v6_0",
            "experiment": "EXP_V61",
            "sport": "all_57_leagues",
            "market": "parity_vectors_officials_seal_sha256_quotes",
            "version": "6.0.0-candidate",
            "artifact_path": "src/data/prediction/officials_freeze_v6_0_snapshot.json",
            "ts_module": "src/domain/prediction/prekickoff_freeze_v6_0.ts",
            "validation_status": "ieee754_and_sha256_parity_verified",
        },
        {
            "id": "exp_v61_officials_freeze_results_v6_0",
            "experiment": "EXP_V61",
            "sport": "all_57_leagues",
            "market": "oos_and_causality_audit_report",
            "version": "6.0.0-candidate",
            "artifact_path": "research/prediction-lab/experiments/EXP_V61_officials_freeze_v6_0/artifacts/exp_v61_officials_freeze_v6_0_results.json",
            "ts_module": "src/domain/prediction/prekickoff_freeze_v6_0.ts",
            "validation_status": "cluster_mulberry32_1000_seed_20261111",
        },
        {
            "id": "live_matchday_unified_snapshot_v6_0",
            "experiment": "EXP_V62",
            "sport": "all_57_leagues",
            "market": "unified_match_intelligence_v6_57_leagues",
            "version": "6.0.0-candidate",
            "artifact_path": "src/data/prediction/live_matchday_v6_candidate_snapshot.json",
            "ts_module": "src/domain/prediction/unified_outlook_v6.ts",
            "validation_status": "57_of_57_leagues_sealed_guardrail_verified_ieee754_parity",
        },
        {
            "id": "exp_v62_unified_results_v6_0",
            "experiment": "EXP_V62",
            "sport": "all_57_leagues",
            "market": "unified_hub_audit_report",
            "version": "6.0.0-candidate",
            "artifact_path": "research/prediction-lab/experiments/EXP_V62_unified_v6_0/artifacts/exp_v62_unified_v6_0_results.json",
            "ts_module": "src/domain/prediction/unified_outlook_v6.ts",
            "validation_status": "16_redteam_axioms_verified",
        },
    ]

    for ent in v6_entries:
        ap = REPO_ROOT / ent["artifact_path"]
        if not ap.exists():
            raise FileNotFoundError(f"Artefacto v6.0 faltante: {ent['artifact_path']}")
        obj = json.loads(ap.read_text(encoding="utf-8"))
        if obj.get("status") != "candidate":
            raise AssertionError(f"status != 'candidate' en {ent['artifact_path']}")
        if obj.get("production_activated") is not False:
            raise AssertionError(f"production_activated != False en {ent['artifact_path']}")
        holdout_ok = (
            obj.get("holdout_sealed_untouched") is True
            or (obj.get("governance") or {}).get("holdout_sealed_untouched") is True
        )
        if not holdout_ok:
            raise AssertionError(f"holdout_sealed_untouched != True en {ent['artifact_path']}")

        ent["status"] = "candidate"
        ent["production_activated"] = False
        ent["holdout_sealed_untouched"] = True
        ent["sha256"] = _sha256(ap)
        ent["size_bytes"] = ap.stat().st_size

    payload = {
        "schema_version": "candidate_registry_v6.0.0",
        "suite_codename": "PitchLab Spacetime v6.0 Unified 57-League Candidate Suite",
        "suite_version": "6.0.0-candidate",
        "status": "candidate",
        "production_activated": False,
        "holdout_cut_utc": "2025-02-02T17:30:00Z",
        "holdout_window_protected": ["2025-02-02", "2026-11-08"],
        "holdout_sealed_untouched": True,
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "ts_barrel_entrypoint": "src/domain/prediction/v6_index.ts",
        "prior_immutable_artifacts_verified_count": total_prior_verified,
        "n_active_v6_0_candidate_artifacts": len(v6_entries),
        "active_v6_0_artifacts": v6_entries,
        "frozen_v3_governance_audit": frozen_v3_audit,
        "inherited_v5_1_governance_audit": v5_1_audit,
        "inherited_v5_2_governance_audit": v5_2_audit,
    }

    out_bytes = (json.dumps(payload, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    REGISTRY_OUT.write_bytes(out_bytes)
    print(
        f"[EXP_V62] Manifiesto canónico guardado en {REGISTRY_OUT.name}: "
        f"{len(v6_entries)} artefactos v6.0 indexados, {total_prior_verified}/25 artefactos previos intactos."
    )


if __name__ == "__main__":
    main()
