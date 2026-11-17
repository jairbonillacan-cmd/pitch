"""Experimento de ablación meteorológica real ERA5 (`Open-Meteo Historical Archive API`, `CC-BY 4.0`) sobre Selecciones (`< 2025-02-02`).

Evalúa de forma empírica y honesta sobre `walk_forward_dev` (`2010..2024`, `n = 12,904`) si la meteorología
diaria real en la sede del partido (`apparent_temperature_max`, `precipitation_sum`, `wind_speed_10m_max`)
aporta señal incremental sobre `PitchLab Meridian v2.0` (`49` features base, que ya incluye `thermal_climate_adv`
determinista y presión barométrica `ISA`).
"""

from __future__ import annotations

import os

os.environ.setdefault("OMP_NUM_THREADS", "4")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")

from collections import Counter
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
import time
from typing import Any
import urllib.error
import urllib.request

import numpy as np
import pandas as pd

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
for _p in (str(REPO_ROOT), str(EXP_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from services.models import outlook_calibration as oc  # noqa: E402

from intl_causal_features import INTL_BASE_38_FEATURES  # noqa: E402
from intl_free_data_v2 import FREE_OPEN_CACHE_DIR  # noqa: E402
from intl_geography import FEDERATION_CATALOG, resolve_match_venue_physics  # noqa: E402
from intl_ingest import (  # noqa: E402
    ARTIFACTS_DIR,
    HOLDOUT_CUT_DATE,
    HOLDOUT_CUT_ISO,
    MODERN_TRAIN_MIN_YEAR,
    VAL_MAX_YEAR,
    load_intl_matches_dev,
)
from run_ablation_v2 import (  # noqa: E402
    ALL_V2_EXTRA_COLS,
    TRIAL_REGISTRY_OUT,
    _eval_feature_subset_walk_forward,
    build_intl_v2_causal_dataset,
)
from run_experiment import BOOTSTRAP_SAMPLES, BOOTSTRAP_SEED  # noqa: E402

ERA5_CACHE_JSON = FREE_OPEN_CACHE_DIR / "open_meteo_era5_top_venues_dev.json"
ERA5_ABLATION_OUT = ARTIFACTS_DIR / "exp_v33_open_meteo_era5_ablation.json"
UA = {"User-Agent": "PitchLab-PredictionLab/3.3 (Open-Meteo CC-BY-4.0 Academic Evaluation)"}

ERA5_3_COLS: tuple[str, ...] = (
    "era5_rain_compress_elo",
    "era5_heat_acclim_adv",
    "era5_wind_compress_elo",
)


def fetch_cached_era5_top_venues(coords_ordered: list[tuple[float, float]], max_venues: int = 32) -> dict[str, dict[str, tuple[float, float, float]]]:
    """Descarga con respeto estricto de cuota (`CC-BY 4.0`, Open-Meteo Fair Use) y cachea series diarias
    `2014-01-01..2025-02-01` (`< HOLDOUT`) para los `max_venues` hubs internacionales principales."""
    FREE_OPEN_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_map: dict[str, dict[str, list[float]]] = {}
    if ERA5_CACHE_JSON.exists():
        cache_map = json.loads(ERA5_CACHE_JSON.read_text(encoding="utf-8"))

    target_coords = [c for c in coords_ordered[:max_venues] if f"{c[0]:.1f},{c[1]:.1f}" not in cache_map]
    if not target_coords:
        return cache_map  # type: ignore[return-value]

    batch_size = 4
    for start_i in range(0, len(target_coords), batch_size):
        chunk = target_coords[start_i : start_i + batch_size]
        lats_s = ",".join(f"{c[0]:.2f}" for c in chunk)
        lons_s = ",".join(f"{c[1]:.2f}" for c in chunk)
        url = (
            f"https://archive-api.open-meteo.com/v1/archive?"
            f"latitude={lats_s}&longitude={lons_s}"
            f"&start_date=2014-01-01&end_date=2025-02-01"
            f"&daily=apparent_temperature_max,precipitation_sum,wind_speed_10m_max&timezone=UTC"
        )
        req = urllib.request.Request(url, headers=UA)
        try:
            with urllib.request.urlopen(req, timeout=45) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            print(f"[Open-Meteo Fair-Use] HTTP {exc.code} tras {len(cache_map)} sedes cacheadas; deteniendo descarga cortésmente.")
            break

        items = payload if isinstance(payload, list) else [payload]
        for (lat_k, lon_k), obj in zip(chunk, items):
            daily = obj.get("daily", {})
            times = daily.get("time", [])
            temps = daily.get("apparent_temperature_max", [])
            precs = daily.get("precipitation_sum", [])
            winds = daily.get("wind_speed_10m_max", [])
            key = f"{lat_k:.1f},{lon_k:.1f}"
            d_map: dict[str, list[float]] = {}
            for dt_s, tp, pr, wn in zip(times, temps, precs, winds):
                if dt_s >= HOLDOUT_CUT_DATE:
                    continue
                t_v = float(tp) if tp is not None else 20.0
                p_v = float(pr) if pr is not None else 0.0
                w_v = float(wn) if wn is not None else 12.0
                d_map[str(dt_s)] = [round(t_v, 1), round(p_v, 1), round(w_v, 1)]
            cache_map[key] = d_map
        ERA5_CACHE_JSON.write_text(json.dumps(cache_map), encoding="utf-8")
        time.sleep(2.5)

    return cache_map  # type: ignore[return-value]


def main() -> None:
    dev_matches_df, _ = load_intl_matches_dev(force_download=False)
    v2_df, _ = build_intl_v2_causal_dataset(
        dev_matches_df,
        enforce_before_holdout=True,
        max_source_date_exclusive=HOLDOUT_CUT_DATE,
    )
    modern_df = v2_df[v2_df["year"] >= MODERN_TRAIN_MIN_YEAR].copy().reset_index(drop=True)

    # Resolver coordenada redondeada `(0.1 deg)` de cada sede
    coord_keys: list[tuple[float, float]] = []
    home_lats: list[float] = []
    away_lats: list[float] = []
    for r in modern_df.itertuples(index=False):
        vp = resolve_match_venue_physics(
            home_code=str(r.home_code),
            away_code=str(r.away_code),
            match_city=str(r.city),
            match_country=str(r.country),
            is_neutral_flag=bool(r.neutral),
        )
        coord_keys.append((round(float(vp["venue_lat"]), 1), round(float(vp["venue_lon"]), 1)))
        home_lats.append(float(FEDERATION_CATALOG.get(str(r.home_code), ("OFC", 0.0, 0.0, 0.0, ""))[1]))
        away_lats.append(float(FEDERATION_CATALOG.get(str(r.away_code), ("OFC", 0.0, 0.0, 0.0, ""))[1]))

    freq = Counter(coord_keys)
    ordered_unique_coords = [c for c, _ in freq.most_common()]
    era5_map = fetch_cached_era5_top_venues(ordered_unique_coords, max_venues=32)

    n = len(modern_df)
    rain_comp = np.zeros(n, dtype=np.float64)
    heat_adv = np.zeros(n, dtype=np.float64)
    wind_comp = np.zeros(n, dtype=np.float64)
    matched_weather = 0

    d_strs = modern_df["date_str"].astype(str).str.slice(0, 10).to_numpy()
    elo_effs = modern_df["elo_diff_eff"].to_numpy(dtype=np.float64)

    for i in range(n):
        ck = f"{coord_keys[i][0]:.1f},{coord_keys[i][1]:.1f}"
        rec = era5_map.get(ck, {}).get(d_strs[i])
        if rec is None:
            continue
        matched_weather += 1
        app_t, precip_mm, wind_kmh = float(rec[0]), float(rec[1]), float(rec[2])
        elo_sc = elo_effs[i] / 400.0
        # Lluvia fuerte (> 5 mm) y viento fuerte (> 28 km/h) comprimen la ventaja técnica del favorito
        rain_intensity = math.log1p(max(0.0, precip_mm - 4.0))
        rain_comp[i] = -rain_intensity * elo_sc
        wind_intensity = max(0.0, (wind_kmh - 26.0) / 15.0)
        wind_comp[i] = -wind_intensity * elo_sc
        # Estrés por bochorno real (`apparent_temperature_max > 31 °C`) ponderado por latitud habitual
        if app_t > 31.0:
            trop_diff = (min(55.0, abs(away_lats[i])) - min(55.0, abs(home_lats[i]))) / 35.0
            heat_adv[i] = ((app_t - 31.0) / 8.0) * trop_diff

    modern_df["era5_rain_compress_elo"] = rain_comp
    modern_df["era5_heat_acclim_adv"] = heat_adv
    modern_df["era5_wind_compress_elo"] = wind_comp

    print(f"[Open-Meteo ERA5 CC-BY-4.0] Cobertura real de partido = {matched_weather} / {n} ({100.0 * matched_weather / max(1, n):.1f}%)")

    cols_v2 = INTL_BASE_38_FEATURES + ALL_V2_EXTRA_COLS
    cols_v2_era5 = cols_v2 + ERA5_3_COLS

    P_v2, y_oof, oof_meta = _eval_feature_subset_walk_forward(modern_df, cols_v2, 0.02, 4380.0)
    P_era5, _, _ = _eval_feature_subset_walk_forward(modern_df, cols_v2_era5, 0.02, 4380.0)

    val_m = oof_meta["year"].to_numpy(dtype=int) <= VAL_MAX_YEAR
    val_ll_v2 = float(np.mean(oc.compute_categorical_log_loss_vec(P_v2[val_m], y_oof[val_m])))
    val_ll_era5 = float(np.mean(oc.compute_categorical_log_loss_vec(P_era5[val_m], y_oof[val_m])))

    ll_v2_vec = oc.compute_categorical_log_loss_vec(P_v2, y_oof)
    ev_era5_vs_v2 = oc.evaluate_calibration_with_bootstrap(
        P_era5,
        y_oof,
        benchmark_ll_vec=ll_v2_vec,
        n_resamples=BOOTSTRAP_SAMPLES,
        seed=BOOTSTRAP_SEED,
        include_bins=False,
    )
    decision = "accepted" if (val_ll_era5 < val_ll_v2 and ev_era5_vs_v2["significance"] == "significativa" and ev_era5_vs_v2["delta_ll_vs_benchmark"] < 0) else "rejected_keep_deterministic_v2"
    print(
        f"[VAL 2010..2019] v2.0={val_ll_v2:.6f} | v2.0+ERA5={val_ll_era5:.6f} | "
        f"2010-24 ΔLL={ev_era5_vs_v2['delta_ll_vs_benchmark']:+.5f} {ev_era5_vs_v2['delta_ll_ci95']} ({ev_era5_vs_v2['significance']}) -> {decision}"
    )

    out_rep = {
        "experiment_id": "EXP_V33_open_meteo_era5_weather",
        "license": "CC-BY 4.0 (Open-Meteo Historical Weather API / Copernicus ERA5)",
        "eval_split": "walk_forward_dev",
        "holdout_cut_utc": HOLDOUT_CUT_ISO,
        "weather_match_coverage_pct": round(100.0 * matched_weather / max(1, n), 2),
        "val_2010_2019": {"meridian_v2_ll": round(val_ll_v2, 6), "meridian_v2_plus_era5_ll": round(val_ll_era5, 6)},
        "walk_forward_2010_2024_vs_meridian_v2": ev_era5_vs_v2,
        "decision": decision,
        "rationale": (
            "Meridian v2.0 ya captura la climatología térmica estacional (`thermal_climate_adv`) y la hipoxia barométrica (`ISA`). "
            "Se documenta el experimento real con ERA5 diario (`< 2025-02-02`) manteniendo inferencia síncrona determinista `< 0.1 ms` sin I/O HTTP."
        ),
    }
    ERA5_ABLATION_OUT.write_text(json.dumps(out_rep, indent=2), encoding="utf-8")

    with TRIAL_REGISTRY_OUT.open("a", encoding="utf-8") as rfh:
        rfh.write(
            json.dumps(
                {
                    "timestamp_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "experiment_id": "EXP_V33_open_meteo_era5_weather",
                    "eval_split": "walk_forward_dev",
                    "unlock_holdout": False,
                    "n_eval": int(len(y_oof)),
                    "log_loss": ev_era5_vs_v2["log_loss"],
                    "delta_ll_vs_v2": ev_era5_vs_v2["delta_ll_vs_benchmark"],
                    "delta_ll_vs_v2_ci95": ev_era5_vs_v2["delta_ll_ci95"],
                    "decision": decision,
                }
            )
            + "\n"
        )


if __name__ == "__main__":
    main()
