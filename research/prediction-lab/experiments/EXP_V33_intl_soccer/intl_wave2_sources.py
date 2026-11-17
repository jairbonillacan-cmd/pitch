"""Extractores causales `t' < t` de Ola 2 para Selecciones Nacionales (`PitchLab Meridian v3.0`, `EXP_V33_intl_soccer`).

Nuevas fuentes gratuitas abiertas con licencia verificada:
  1. `dcaribou/transfermarkt-datasets/appearances.csv.gz` (`CC0 1.0 Universal`, `1,894,350` apariciones `2012..2026`):
     - Snapshots mensuales el día 1 de cada mes (`app.date < snap_date < match_date`, garantizado por `bisect_left - 1`):
       * `tm_active_90s_diff`: log-minutos reales jugados en clubes (`90d` previos) por el Top-18 activo de la selección.
       * `tm_elite_cup_90s_diff`: log-minutos en torneos continentales de élite (`CL, EL, ECL, CLI` en `180d` previos).
       * `tm_club_ga_per90_diff`: producción ofensiva real `(G + A) / 90` en clubes (encogimiento Empirical-Bayes) de atacantes/medios.
       * `tm_match_fit_share_diff`: proporción del Top-18 con `>= 360` minutos competitivos de club en los últimos `90` días.
  2. Banco Mundial vía Open Knowledge Foundation:
     - `wb_population.csv` (`ODC-PDDL-1.0` Dominio Público) y `wb_gdp.csv` (`CC-BY-4.0`), estrictamente rezagados a `Year <= match_year - 1`:
       * `wb_log10_pop_diff`: base demográfica de talento elegible.
       * `wb_log10_gdp_pc_diff`: infraestructura económica y formativa per cápita.
"""

from __future__ import annotations

from bisect import bisect_left
from datetime import datetime
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from intl_free_data_v2 import FREE_OPEN_CACHE_DIR, TM_PLAYERS_GZ_PATH
from intl_geography import FEDERATION_CATALOG, resolve_team_code

TM_APPEARANCES_GZ_PATH = FREE_OPEN_CACHE_DIR / "tm_appearances.csv.gz"
WB_POP_CSV_PATH = FREE_OPEN_CACHE_DIR / "wb_population.csv"
WB_GDP_CSV_PATH = FREE_OPEN_CACHE_DIR / "wb_gdp.csv"

ELITE_CONT_COMP_IDS: frozenset[str] = frozenset({"CL", "EL", "ECL", "CLI", "CLQ", "ELQ"})

# Mapeo ISO-3 Banco Mundial -> código FIFA PitchLab cuando difieren (incluye reparto demográfico Home Nations de GBR)
ISO3_TO_FIFA_MAP: dict[str, list[tuple[str, float]]] = {
    "DEU": [("GER", 1.0)],
    "NLD": [("NED", 1.0)],
    "PRT": [("POR", 1.0)],
    "CHE": [("SUI", 1.0)],
    "DNK": [("DEN", 1.0)],
    "HRV": [("CRO", 1.0)],
    "GRC": [("GRE", 1.0)],
    "URY": [("URU", 1.0)],
    "PRY": [("PAR", 1.0)],
    "CHL": [("CHI", 1.0)],
    "CRI": [("CRC", 1.0)],
    "HND": [("HON", 1.0)],
    "DZA": [("ALG", 1.0)],
    "ZAF": [("RSA", 1.0)],
    "SAU": [("KSA", 1.0)],
    "ARE": [("UAE", 1.0)],
    "IDN": [("INA", 1.0)],
    "MYS": [("MAS", 1.0)],
    "PHL": [("PHI", 1.0)],
    "VNM": [("VIE", 1.0)],
    "LBN": [("LIB", 1.0)],
    "KWT": [("KUW", 1.0)],
    "OMN": [("OMA", 1.0)],
    "BGD": [("BAN", 1.0)],
    "NPL": [("NEP", 1.0)],
    "LKA": [("SRI", 1.0)],
    "MMR": [("MYA", 1.0)],
    "KHM": [("CAM", 1.0)],
    "TWN": [("TPE", 1.0)],
    "PRK": [("PRK", 1.0)],
    "KOR": [("KOR", 1.0)],
    "GBR": [("ENG", 0.843), ("SCO", 0.082), ("WAL", 0.047), ("NIR", 0.028)],
}

CONFED_PRIOR_LOG10_POP: dict[str, float] = {
    "UEFA": 7.05,
    "CONMEBOL": 7.45,
    "CONCACAF": 6.85,
    "CAF": 7.30,
    "AFC": 7.50,
    "OFC": 5.80,
}

CONFED_PRIOR_LOG10_GDP_PC: dict[str, float] = {
    "UEFA": 4.42,
    "CONMEBOL": 3.92,
    "CONCACAF": 3.95,
    "CAF": 3.32,
    "AFC": 3.85,
    "OFC": 3.70,
}

CONFED_PRIOR_ACTIVE_90S: dict[str, float] = {
    "UEFA": 4.55,
    "CONMEBOL": 4.40,
    "CONCACAF": 3.15,
    "CAF": 3.65,
    "AFC": 2.95,
    "OFC": 1.60,
}


class CausalWorldBankMacroBridge:
    """Índice macro-demográfico anual rezagado (`Year <= match_year - 1`) para federaciones FIFA."""

    def __init__(
        self,
        pop_path: Path = WB_POP_CSV_PATH,
        gdp_path: Path = WB_GDP_CSV_PATH,
        max_year_inclusive: int = 2024,
    ) -> None:
        # fed_code -> (years_sorted, vals_sorted)
        self._pop_series: dict[str, tuple[list[int], list[float]]] = {}
        self._gdp_series: dict[str, tuple[list[int], list[float]]] = {}

        known_feds = set(FEDERATION_CATALOG.keys())

        def _load_wb_table(csv_path: Path, scale_by_pop_share: bool) -> dict[str, tuple[list[int], list[float]]]:
            if not csv_path.exists():
                return {}
            df = pd.read_csv(csv_path)
            df["Year"] = pd.to_numeric(df["Year"], errors="coerce")
            df["Value"] = pd.to_numeric(df["Value"], errors="coerce")
            df = df[df["Year"].notna() & df["Value"].notna() & (df["Value"] > 0) & (df["Year"] <= max_year_inclusive)].copy()
            df["yr_i"] = df["Year"].astype(int)

            acc: dict[str, dict[int, float]] = {}
            for r in df.itertuples(index=False):
                iso3 = str(getattr(r, "_1", "") if not hasattr(r, "Country_Code") else r.Country_Code)
                # Acceso seguro por posición: Country Name=0, Country Code=1, Year=2, Value=3
                cname = str(r[0]).strip()
                ccode = str(r[1]).strip().upper()
                yr_i = int(r.yr_i)
                val_f = float(r[3])

                targets: list[tuple[str, float]] = []
                if ccode in ISO3_TO_FIFA_MAP:
                    targets = ISO3_TO_FIFA_MAP[ccode]
                elif ccode in known_feds:
                    targets = [(ccode, 1.0)]
                else:
                    rc = resolve_team_code(cname)
                    if rc in known_feds:
                        targets = [(rc, 1.0)]

                for fc, share in targets:
                    adj_v = val_f * (share if scale_by_pop_share else share)
                    acc.setdefault(fc, {})[yr_i] = adj_v

            out_map: dict[str, tuple[list[int], list[float]]] = {}
            for fc, ydict in acc.items():
                yrs = sorted(ydict.keys())
                out_map[fc] = (yrs, [ydict[y] for y in yrs])
            return out_map

        self._pop_series = _load_wb_table(pop_path, scale_by_pop_share=True)
        self._gdp_series = _load_wb_table(gdp_path, scale_by_pop_share=True)

    def lookup_macro(self, fed_code: str, match_year: int, confed: str) -> dict[str, float]:
        """Consulta estrictamente `Year <= match_year - 1`."""
        target_max_yr = int(match_year) - 1
        prior_pop = CONFED_PRIOR_LOG10_POP.get(confed, 6.80)
        prior_gdppc = CONFED_PRIOR_LOG10_GDP_PC.get(confed, 3.80)

        pop_val: float | None = None
        ps = self._pop_series.get(fed_code)
        if ps is not None:
            idx = bisect_left(ps[0], target_max_yr + 1) - 1
            if idx >= 0:
                pop_val = ps[1][idx]

        gdp_val: float | None = None
        gs = self._gdp_series.get(fed_code)
        if gs is not None:
            idx_g = bisect_left(gs[0], target_max_yr + 1) - 1
            if idx_g >= 0:
                gdp_val = gs[1][idx_g]

        log10_pop = math.log10(max(3e4, pop_val)) if pop_val is not None else prior_pop
        if pop_val is not None and gdp_val is not None and pop_val > 1e3:
            gdp_pc = max(250.0, min(150_000.0, gdp_val / pop_val))
            log10_gdppc = math.log10(gdp_pc)
        else:
            log10_gdppc = prior_gdppc

        return {
            "wb_log10_pop": log10_pop,
            "wb_log10_gdp_pc": log10_gdppc,
        }


class CausalNationalAppearancesBridge:
    """Construye snapshots mensuales `YYYY-MM-01` estrictamente causales (`app.date < snap_date < match_date`)
    sobre las `1,894,350` apariciones de `tm_appearances.csv.gz` (`CC0 1.0`)."""

    def __init__(
        self,
        players_path: Path = TM_PLAYERS_GZ_PATH,
        appearances_path: Path = TM_APPEARANCES_GZ_PATH,
        max_date_exclusive: str | None = None,
    ) -> None:
        self._snap_ords: list[int] = []
        self._snaps: list[dict[str, dict[str, float]]] = []

        if not players_path.exists() or not appearances_path.exists():
            return

        pl = pd.read_csv(players_path, usecols=["player_id", "country_of_citizenship", "position"])
        pl = pl[pl["country_of_citizenship"].notna()].copy()
        pl["fed_code"] = pl["country_of_citizenship"].astype(str).map(resolve_team_code)
        pl = pl[pl["fed_code"].isin(set(FEDERATION_CATALOG.keys()))].copy()
        pl["is_att_mid"] = pl["position"].fillna("").isin(("Attack", "Midfield")).astype(np.int8)

        ap = pd.read_csv(
            appearances_path,
            usecols=["player_id", "date", "competition_id", "goals", "assists", "minutes_played"],
        )
        ap["date_str"] = ap["date"].astype(str).str.slice(0, 10)
        if max_date_exclusive is not None:
            ap = ap[ap["date_str"] < str(max_date_exclusive)[:10]].copy()

        ap = ap.merge(pl[["player_id", "fed_code", "is_att_mid"]], on="player_id", how="inner")
        if ap.empty:
            return

        ap["yr"] = pd.to_numeric(ap["date_str"].str.slice(0, 4), errors="coerce")
        ap["mo"] = pd.to_numeric(ap["date_str"].str.slice(5, 7), errors="coerce")
        ap = ap[ap["yr"].notna() & ap["mo"].notna()].copy()
        ap["ym"] = ap["yr"].astype(np.int32) * 12 + (ap["mo"].astype(np.int32) - 1)
        ap["mins"] = pd.to_numeric(ap["minutes_played"], errors="coerce").fillna(0.0).clip(0.0, 130.0)
        ap["ga"] = (
            pd.to_numeric(ap["goals"], errors="coerce").fillna(0.0).clip(0.0, 10.0)
            + pd.to_numeric(ap["assists"], errors="coerce").fillna(0.0).clip(0.0, 10.0)
        )
        ap["elite_mins"] = np.where(ap["competition_id"].fillna("").isin(ELITE_CONT_COMP_IDS), ap["mins"], 0.0)

        # Colapsar a resumen jugador-mes `(ym, fed_code, player_id, is_att_mid)` -> O(N) ultra rápido
        grp = (
            ap.groupby(["ym", "fed_code", "player_id", "is_att_mid"], sort=False, as_index=False)[
                ["mins", "ga", "elite_mins"]
            ]
            .sum()
        )

        # Indexar por `ym` para ventanas deslizantes de 3 meses (`90d`) y 6 meses (`180d`) estrictamente `< snap_ym`
        by_ym: dict[int, list[tuple[str, int, int, float, float, float]]] = {}
        for r in grp.itertuples(index=False):
            by_ym.setdefault(int(r.ym), []).append(
                (str(r.fed_code), int(r.player_id), int(r.is_att_mid), float(r.mins), float(r.ga), float(r.elite_mins))
            )

        min_ym = int(grp["ym"].min())
        max_ym = int(grp["ym"].max()) + 1

        for snap_ym in range(max(2012 * 12 + 9, min_ym + 2), max_ym + 1):
            s_yr = snap_ym // 12
            s_mo = (snap_ym % 12) + 1
            s_iso = f"{s_yr:04d}-{s_mo:02d}-01"
            if max_date_exclusive is not None and s_iso > str(max_date_exclusive)[:10]:
                continue
            s_ord = datetime(s_yr, s_mo, 1).toordinal()

            # Acumular 3 meses previos completos (`snap_ym - 3 .. snap_ym - 1`) y 6 meses para copas continentales
            fed_p_3m: dict[str, dict[int, list[float]]] = {}  # fed -> pid -> [mins_3m, ga_3m, is_att_mid]
            fed_elite_6m: dict[str, float] = {}

            for w_ym in range(snap_ym - 6, snap_ym):
                rows_m = by_ym.get(w_ym)
                if not rows_m:
                    continue
                in_3m = w_ym >= (snap_ym - 3)
                for fc, pid, iam, mn, ga_v, el_mn in rows_m:
                    if el_mn > 0.0:
                        fed_elite_6m[fc] = fed_elite_6m.get(fc, 0.0) + el_mn
                    if in_3m and mn > 0.0:
                        f_d = fed_p_3m.setdefault(fc, {})
                        cur = f_d.get(pid)
                        if cur is None:
                            f_d[pid] = [mn, ga_v, float(iam)]
                        else:
                            cur[0] += mn
                            cur[1] += ga_v

            snap_dict: dict[str, dict[str, float]] = {}
            all_feds_m = set(fed_p_3m.keys()) | set(fed_elite_6m.keys())
            for fc in all_feds_m:
                p_map = fed_p_3m.get(fc, {})
                p_list = sorted(p_map.values(), key=lambda x: x[0], reverse=True)
                top18 = p_list[:18]
                sum_90s = sum(x[0] for x in top18) / 90.0
                fit_cnt = sum(1 for x in top18 if x[0] >= 360.0)
                att_90s = sum(x[0] for x in top18 if x[2] > 0.5) / 90.0
                att_ga = sum(x[1] for x in top18 if x[2] > 0.5)
                ga_per90 = (att_ga + 0.30 * 12.0) / (att_90s + 12.0)
                elite_90s = fed_elite_6m.get(fc, 0.0) / 90.0
                cov_w = min(1.0, len(top18) / 10.0)
                snap_dict[fc] = {
                    "active_log_90s": math.log1p(max(0.0, sum_90s)),
                    "elite_cup_log_90s": math.log1p(max(0.0, elite_90s)),
                    "club_ga_per90": ga_per90,
                    "match_fit_share": fit_cnt / 18.0,
                    "cov_w": cov_w,
                }

            self._snap_ords.append(s_ord)
            self._snaps.append(snap_dict)

    def lookup_appearances(self, fed_code: str, match_ord: int, confed: str, current_elo: float) -> dict[str, float]:
        prior_90s = max(0.8, min(5.4, CONFED_PRIOR_ACTIVE_90S.get(confed, 3.0) + (current_elo - 1500.0) / 220.0))
        prior_elite = max(0.0, (current_elo - 1520.0) / 160.0) if confed in ("UEFA", "CONMEBOL") else max(0.0, (current_elo - 1620.0) / 200.0)
        prior_fit = max(0.08, min(0.85, 0.38 + (current_elo - 1500.0) / 650.0))
        default_res = {
            "tm_active_log_90s": prior_90s,
            "tm_elite_cup_log_90s": prior_elite,
            "tm_club_ga_per90": 0.30,
            "tm_match_fit_share": prior_fit,
            "tm_app_cov": 0.0,
        }
        if not self._snap_ords:
            return default_res

        idx = bisect_left(self._snap_ords, int(match_ord)) - 1
        if idx < 0:
            return default_res

        ent = self._snaps[idx].get(fed_code)
        if ent is None:
            return {
                "tm_active_log_90s": 0.40,
                "tm_elite_cup_log_90s": 0.0,
                "tm_club_ga_per90": 0.24,
                "tm_match_fit_share": 0.05,
                "tm_app_cov": 0.5,
            }

        w = float(ent["cov_w"])
        return {
            "tm_active_log_90s": w * float(ent["active_log_90s"]) + (1.0 - w) * prior_90s,
            "tm_elite_cup_log_90s": w * float(ent["elite_cup_log_90s"]) + (1.0 - w) * prior_elite,
            "tm_club_ga_per90": w * float(ent["club_ga_per90"]) + (1.0 - w) * 0.30,
            "tm_match_fit_share": w * float(ent["match_fit_share"]) + (1.0 - w) * prior_fit,
            "tm_app_cov": w,
        }
