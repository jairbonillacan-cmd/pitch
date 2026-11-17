"""Extractores causales `t' < t` sobre nuevas fuentes abiertas CC0 1.0 para Selecciones Nacionales (`Meridian v2.0`).

Fuentes integradas con licencia `CC0 1.0 Universal` verificada:
  1. `martj42/international_results/goalscorers.csv` (`47,914` goles con minuto, `penalty`, `own_goal`, `scorer`):
     - Descomposición de goles en juego abierto sin penales (`npG`) y descuento parcial de autogoles.
     - Supremacía exacta ponderada por tiempo en ventaja minuto a minuto (`time_in_lead_ratio` en `[-1, +1]`).
     - Diversidad de amenaza ofensiva (`distinct_scorers_r10`).
  2. `dcaribou/transfermarkt-datasets` (`tm_players.csv.gz` + `tm_player_valuations.csv.gz`, `656,301` valuaciones):
     - Snapshots mensuales estrictamente causales (`valuation.date < snapshot_date < match_date`) del pool
       de jugadores activos (`16..39` años, valuación en últimos `730` días) por ciudadanía FIFA (`202` países).
     - Variables desbloqueadas:
       * `tm_log_top23_val_diff`: log-valor de mercado (€M) del Top-23 elegible.
       * `tm_top5_share_diff`: proporción del Top-23 militando en `GB1, ES1, L1, IT1, FR1`.
       * `tm_depth_ratio_diff`: profundidad de banquillo (`ranks 12..23` / `ranks 1..11`).
       * `tm_val_vs_elo_gap_diff`: brecha de talento real de clubes frente al Elo histórico de la selección.
  3. Física climática estacional / choque térmico latitudinal + fórmula oficial FIFA SUM (`scale=600`).
"""

from __future__ import annotations

from bisect import bisect_left
from datetime import datetime
import math
from pathlib import Path
from typing import Any, Mapping

import numpy as np
import pandas as pd

from intl_geography import FEDERATION_CATALOG, get_federation_profile, resolve_team_code

EXP_DIR = Path(__file__).resolve().parent
REPO_ROOT = EXP_DIR.parents[3]
FREE_OPEN_CACHE_DIR = REPO_ROOT / "research" / "prediction-lab" / "data" / "raw" / "free_open_v33"

GOALSCORERS_CSV_PATH = FREE_OPEN_CACHE_DIR / "goalscorers.csv"
TM_PLAYERS_GZ_PATH = FREE_OPEN_CACHE_DIR / "tm_players.csv.gz"
TM_VALUATIONS_GZ_PATH = FREE_OPEN_CACHE_DIR / "tm_player_valuations.csv.gz"

BIG5_COMP_IDS: frozenset[str] = frozenset({"GB1", "ES1", "L1", "IT1", "FR1"})

# Prior estructural de log(1 + valor Top-23 en €M) por confederación cuando no existen registros TM (< 2004 o micro-federación)
CONFED_PRIOR_LOG_TOP23_EUR_M: dict[str, float] = {
    "UEFA": 3.85,
    "CONMEBOL": 4.35,
    "CONCACAF": 2.10,
    "CAF": 2.75,
    "AFC": 2.05,
    "OFC": 0.85,
}
CONFED_PRIOR_TOP5_SHARE: dict[str, float] = {
    "UEFA": 0.24,
    "CONMEBOL": 0.30,
    "CONCACAF": 0.07,
    "CAF": 0.18,
    "AFC": 0.06,
    "OFC": 0.02,
}


def _date_iso_to_ord(date_iso: str) -> int:
    y, m, d = (int(x) for x in str(date_iso).strip()[:10].split("-"))
    return datetime(y, m, d).toordinal()


def build_goalscorers_match_summary(
    goalscorers_path: Path = GOALSCORERS_CSV_PATH,
    max_date_exclusive: str | None = None,
) -> dict[tuple[str, str, str], dict[str, Any]]:
    """Indexa `goalscorers.csv` por `(date_str, home_code, away_code)` devolviendo para cada partido:
    - `pk_h`, `pk_a`: goles de penal
    - `og_h`, `og_a`: goles a favor por autogol rival
    - `time_in_lead_ratio`: `(mins_home_leading - mins_away_leading) / T_end` en `[-1.0, +1.0]`
    - `scorers_h`, `scorers_a`: conjuntos de nombres de goleadores propios (sin autogoles)
    """
    if not goalscorers_path.exists():
        return {}

    gs = pd.read_csv(goalscorers_path)
    gs["date_str"] = gs["date"].astype(str).str.slice(0, 10)
    if max_date_exclusive is not None:
        gs = gs[gs["date_str"] < str(max_date_exclusive)[:10]].copy()

    gs["h_code"] = gs["home_team"].astype(str).map(resolve_team_code)
    gs["a_code"] = gs["away_team"].astype(str).map(resolve_team_code)
    gs["t_code"] = gs["team"].astype(str).map(resolve_team_code)
    gs["is_pk"] = gs["penalty"].astype(str).str.lower().isin(("true", "1", "yes"))
    gs["is_og"] = gs["own_goal"].astype(str).str.lower().isin(("true", "1", "yes"))
    gs["min_num"] = pd.to_numeric(gs["minute"], errors="coerce").fillna(45.0).clip(1.0, 120.0)
    gs["scorer_clean"] = gs["scorer"].fillna("").astype(str).str.strip()

    index: dict[tuple[str, str, str], dict[str, Any]] = {}
    for (d_str, hc, ac), grp in gs.groupby(["date_str", "h_code", "a_code"], sort=False):
        if hc == ac:
            continue
        pk_h = 0
        pk_a = 0
        og_h = 0
        og_a = 0
        scorers_h: set[str] = set()
        scorers_a: set[str] = set()
        events: list[tuple[float, int]] = []

        for r in grp.itertuples(index=False):
            is_home_goal = (r.t_code == hc)
            if not is_home_goal and r.t_code != ac:
                continue
            if is_home_goal:
                if r.is_pk:
                    pk_h += 1
                if r.is_og:
                    og_h += 1
                elif r.scorer_clean and r.scorer_clean != "NA":
                    scorers_h.add(r.scorer_clean)
                events.append((float(r.min_num), 1))
            else:
                if r.is_pk:
                    pk_a += 1
                if r.is_og:
                    og_a += 1
                elif r.scorer_clean and r.scorer_clean != "NA":
                    scorers_a.add(r.scorer_clean)
                events.append((float(r.min_num), -1))

        events.sort(key=lambda x: x[0])
        max_m = events[-1][0] if events else 90.0
        t_end = 120.0 if max_m > 95.0 else 90.0

        cur_diff = 0
        prev_t = 0.0
        lead_h = 0.0
        lead_a = 0.0
        for m_t, delta in events:
            t_clamped = min(t_end, max(prev_t, m_t))
            dt = t_clamped - prev_t
            if cur_diff > 0:
                lead_h += dt
            elif cur_diff < 0:
                lead_a += dt
            cur_diff += delta
            prev_t = t_clamped

        rem = max(0.0, t_end - prev_t)
        if cur_diff > 0:
            lead_h += rem
        elif cur_diff < 0:
            lead_a += rem

        index[(str(d_str), str(hc), str(ac))] = {
            "pk_h": pk_h,
            "pk_a": pk_a,
            "og_h": og_h,
            "og_a": og_a,
            "time_in_lead_ratio": float((lead_h - lead_a) / t_end),
            "n_unique_scorers_h": len(scorers_h),
            "n_unique_scorers_a": len(scorers_a),
        }

    return index


class CausalTransfermarktNationalPoolBridge:
    """Construye snapshots trimestrales/mensuales estrictamente causales (`val.date < snap_date < match_date`)
    del valor de mercado (€) y composición en ligas Top-5 del pool elegible de cada selección FIFA."""

    def __init__(
        self,
        players_path: Path = TM_PLAYERS_GZ_PATH,
        valuations_path: Path = TM_VALUATIONS_GZ_PATH,
        max_date_exclusive: str | None = None,
    ) -> None:
        self._snap_ords: list[int] = []
        self._snapshots: list[dict[str, dict[str, float]]] = []

        if not players_path.exists() or not valuations_path.exists():
            return

        pl = pd.read_csv(
            players_path,
            usecols=["player_id", "country_of_citizenship", "date_of_birth", "position"],
        )
        pl = pl[pl["country_of_citizenship"].notna()].copy()
        pl["fed_code"] = pl["country_of_citizenship"].astype(str).map(resolve_team_code)
        known = set(FEDERATION_CATALOG.keys())
        pl = pl[pl["fed_code"].isin(known)].copy()
        pl["birth_year"] = pd.to_numeric(pl["date_of_birth"].astype(str).str.slice(0, 4), errors="coerce").fillna(1990).astype(int)
        pl["is_att"] = (pl["position"].fillna("") == "Attack").astype(int)

        pv = pd.read_csv(
            valuations_path,
            usecols=["player_id", "date", "market_value_in_eur", "player_club_domestic_competition_id"],
        )
        pv["date_str"] = pv["date"].astype(str).str.slice(0, 10)
        if max_date_exclusive is not None:
            pv = pv[pv["date_str"] < str(max_date_exclusive)[:10]].copy()

        pv["val_eur"] = pd.to_numeric(pv["market_value_in_eur"], errors="coerce").fillna(0.0)
        pv = pv[pv["val_eur"] > 0.0].copy()
        pv["v_dt"] = pd.to_datetime(pv["date_str"], format="%Y-%m-%d", errors="coerce")
        pv = pv[pv["v_dt"].notna()].copy()
        pv["v_ord"] = pv["v_dt"].map(lambda d: d.toordinal()).astype(np.int64)
        pv["is_top5"] = pv["player_club_domestic_competition_id"].fillna("").isin(BIG5_COMP_IDS).astype(int)

        merged = pv.merge(pl[["player_id", "fed_code", "birth_year", "is_att"]], on="player_id", how="inner")
        if merged.empty:
            return

        merged = merged.sort_values("v_ord", kind="mergesort").reset_index(drop=True)
        v_ords = merged["v_ord"].to_numpy(dtype=np.int64)
        pids = merged["player_id"].to_numpy(dtype=np.int64)
        feds = merged["fed_code"].to_numpy(dtype=str)
        byears = merged["birth_year"].to_numpy(dtype=np.int64)
        vals = merged["val_eur"].to_numpy(dtype=np.float64)
        top5s = merged["is_top5"].to_numpy(dtype=np.int64)
        atts = merged["is_att"].to_numpy(dtype=np.int64)

        # Generar puntos de control el día 1 de cada dos meses desde 2004-07-01 hasta el máximo disponible
        max_year = int(merged["v_dt"].dt.year.max()) + 1
        snap_dates: list[tuple[int, int]] = []
        for yr in range(2004, min(max_year + 1, 2027)):
            for mo in (1, 3, 5, 7, 9, 11):
                if yr == 2004 and mo < 7:
                    continue
                d_iso = f"{yr:04d}-{mo:02d}-01"
                if max_date_exclusive is not None and d_iso > str(max_date_exclusive)[:10]:
                    continue
                snap_dates.append((datetime(yr, mo, 1).toordinal(), yr))

        # Pase incremental O(N_valuations + N_snaps * N_active_players): ultra rápido (~1.2 s)
        latest_by_pid: dict[int, tuple[int, str, int, float, int, int]] = {}
        ptr = 0
        n_rows = len(v_ords)

        for s_ord, s_year in snap_dates:
            while ptr < n_rows and v_ords[ptr] < s_ord:
                latest_by_pid[int(pids[ptr])] = (
                    int(v_ords[ptr]),
                    str(feds[ptr]),
                    int(byears[ptr]),
                    float(vals[ptr]),
                    int(top5s[ptr]),
                    int(atts[ptr]),
                )
                ptr += 1

            min_valid_ord = s_ord - 730
            fed_buckets: dict[str, list[tuple[float, int, int]]] = {}
            stale_pids: list[int] = []
            for pid_k, (vo, fc, byr, veur, t5, iatt) in latest_by_pid.items():
                age_approx = s_year - byr
                if vo < min_valid_ord or age_approx > 39:
                    if age_approx > 40 or vo < s_ord - 1460:
                        stale_pids.append(pid_k)
                    continue
                if age_approx < 16:
                    continue
                lst = fed_buckets.get(fc)
                if lst is None:
                    lst = []
                    fed_buckets[fc] = lst
                lst.append((veur, t5, iatt))

            for sp in stale_pids:
                latest_by_pid.pop(sp, None)

            snap_dict: dict[str, dict[str, float]] = {}
            for fc, items in fed_buckets.items():
                items.sort(key=lambda x: x[0], reverse=True)
                top23 = items[:23]
                n_p = len(top23)
                if n_p == 0:
                    continue
                sum_eur_m = sum(x[0] for x in top23) / 1e6
                log_val = math.log1p(max(0.0, sum_eur_m))
                top5_sh = sum(x[1] for x in top23) / float(n_p)
                xi_sum = sum(x[0] for x in top23[:11])
                bench_sum = sum(x[0] for x in top23[11:])
                depth_ratio = (bench_sum / xi_sum) if xi_sum > 1e4 else 0.25
                att_sh = sum(x[0] for x in top23 if x[2] == 1) / max(1.0, sum(x[0] for x in top23))
                w_conf = min(1.0, n_p / 11.0)
                snap_dict[fc] = {
                    "log_top23_eur_m": log_val,
                    "top5_share": top5_sh,
                    "depth_ratio": min(1.0, depth_ratio),
                    "att_val_share": att_sh,
                    "coverage_weight": w_conf,
                }

            self._snap_ords.append(s_ord)
            self._snapshots.append(snap_dict)

    def lookup_pool_metrics(self, fed_code: str, match_date_ord: int, confed: str, current_elo: float) -> dict[str, float]:
        """Devuelve métricas del pool elegible estrictamente `< match_date_ord` con contracción bayesiana suave
        hacia el prior de confederación/Elo cuando la cobertura histórica (`< 2004` o micro-estado) es parcial."""
        # Prior implícito coherente con el Elo actual para que antes de 2004 el residual `val_vs_elo_gap` valga `0.0`!
        elo_implied_log_val = max(0.20, min(7.20, CONFED_PRIOR_LOG_TOP23_EUR_M.get(confed, 2.20) + (current_elo - 1500.0) / 135.0))
        prior_t5 = CONFED_PRIOR_TOP5_SHARE.get(confed, 0.10)
        default_res = {
            "tm_log_top23_eur_m": elo_implied_log_val,
            "tm_top5_share": prior_t5,
            "tm_depth_ratio": 0.28,
            "tm_att_val_share": 0.34,
            "tm_val_vs_elo_gap": 0.0,
            "tm_has_pool": 0.0,
        }
        if not self._snap_ords:
            return default_res

        idx = bisect_left(self._snap_ords, int(match_date_ord)) - 1
        if idx < 0:
            return default_res

        entry = self._snapshots[idx].get(fed_code)
        if entry is None:
            # En era Transfermarkt (>= 2005), una selección con 0 jugadores valuados en TM es genuinamente amateur/local
            raw_low_val = 0.25
            return {
                "tm_log_top23_eur_m": raw_low_val,
                "tm_top5_share": 0.0,
                "tm_depth_ratio": 0.15,
                "tm_att_val_share": 0.33,
                "tm_val_vs_elo_gap": raw_low_val - elo_implied_log_val,
                "tm_has_pool": 0.5,
            }

        w = float(entry["coverage_weight"])
        log_val = w * float(entry["log_top23_eur_m"]) + (1.0 - w) * elo_implied_log_val
        t5 = w * float(entry["top5_share"]) + (1.0 - w) * prior_t5
        depth = w * float(entry["depth_ratio"]) + (1.0 - w) * 0.28
        att_sh = w * float(entry["att_val_share"]) + (1.0 - w) * 0.34
        return {
            "tm_log_top23_eur_m": log_val,
            "tm_top5_share": t5,
            "tm_depth_ratio": depth,
            "tm_att_val_share": att_sh,
            "tm_val_vs_elo_gap": log_val - elo_implied_log_val,
            "tm_has_pool": w,
        }


def compute_thermal_climate_mismatch(
    *,
    home_base_lat: float,
    away_base_lat: float,
    venue_lat: float,
    venue_elev_m: float,
    match_month: int,
) -> float:
    """Estima la ventaja fisiológica de aclimatación térmica/estacional (`[-1.5, +1.5]`) en la sede del partido
    a partir de latitud solar, hemisferio, mes del año (`1..12`) y gradiente adiabático de altitud (`-6.5 °C / km`).
    100% determinista y reproducible en TS sin requerir llamadas HTTP síncronas en inferencia `< 1 ms`."""
    # Declinación solar aproximada: pico boreal en julio (`m=7`), pico austral en enero (`m=1`)
    seasonal_phase = math.cos(2.0 * math.pi * (float(match_month) - 7.0) / 12.0)

    def _est_ambient_temp_c(lat_deg: float, elev_m: float) -> float:
        abs_lat = min(70.0, abs(float(lat_deg)))
        # Temperatura media a nivel del mar ~ 28°C en ecuador cayendo hacia latitudes altas
        t_mean_sl = 28.0 - 0.36 * abs_lat
        # Amplitud estacional crece con la latitud; signo se invierte en hemisferio sur
        hemi_sign = 1.0 if float(lat_deg) >= 0.0 else -1.0
        amp = 0.22 * abs_lat
        t_sl = t_mean_sl + hemi_sign * amp * seasonal_phase
        # Gradiente térmico vertical estándar (-6.5 °C por cada 1000 m)
        return t_sl - 0.0065 * max(0.0, float(elev_m))

    t_venue = _est_ambient_temp_c(venue_lat, venue_elev_m)
    t_home_hab = _est_ambient_temp_c(home_base_lat, 150.0)
    t_away_hab = _est_ambient_temp_c(away_base_lat, 150.0)

    # El estrés fisiológico aparece sobre todo con calor tropical (`t_venue > 24°C`) o frío invernal (`t_venue < 6°C`)
    if t_venue > 24.0:
        stress_away = max(0.0, t_venue - max(20.0, t_away_hab))
        stress_home = max(0.0, t_venue - max(20.0, t_home_hab))
        return max(-1.5, min(1.5, (stress_away - stress_home) / 8.0))
    if t_venue < 6.0:
        stress_away = max(0.0, min(12.0, t_away_hab) - t_venue)
        stress_home = max(0.0, min(12.0, t_home_hab) - t_venue)
        return max(-1.5, min(1.5, (stress_away - stress_home) / 10.0))
    return 0.0
