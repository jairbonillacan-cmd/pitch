"""Extractores causales `t' < t` de Ola 2 para Fútbol de Clubes (`EXP_V34_club_free_data` -> `Tachyon v3.4`).

Explota tres tablas abiertas `CC0 1.0` adicionales de `dcaribou/transfermarkt-datasets` + `xgabora` (`MIT`):
  1. `tm_games.csv.gz` (`88,958` partidos incluyendo `CL, EL, ECL, FAC, CGB, DFB, CDR, CIT, FRC`):
     - `tm_midweek_cup_load_diff`: fatiga oculta entre semana (`2..5` días `< match_date`) por Champions/Europa League
       o Copas Domésticas que `matches.parquet` (solo liga doméstica) jamás registra.
     - `tm_games_14d_allcomps_diff`: congestión total de calendario en todas las competiciones (`14d < match_date`).
  2. `tm_appearances.csv.gz` (`1,894,350` apariciones) × `tm_player_valuations.csv.gz` (`656,301` valuaciones `v_ord < a_ord`):
     - `tm_realized_xi_val_diff`: log-valor de mercado (€M) ponderado por minutos de los jugadores que **realmente**
       saltaron al campo en los últimos 3 partidos (`<= 45d < match_date`).
     - `tm_injury_avail_ratio_diff`: ratio `realized_xi_eur / top11_roster_eur` (detector causal de crisis de lesiones/sanciones).
     - `tm_xi_ga90_allcomps_diff`: producción real `(G + A) / 90` del once en todas las competiciones (`<= 45d < match_date`).
  3. `tm_transfers.csv.gz` (`154,155` fichajes `< 2025-02-02`, filtrando cesiones futuras `transfer_date < match_date`):
     - `tm_net_transfer_val_120d_diff`: flujo neto de talento `log1p(entradas_€M) - log1p(salidas_€M)` en los últimos `120` días
       (detecta desmantelamientos veraniegos *fire sales* y refuerzos de mercado en jornadas 1–10 antes de que Elo reaccione).
     - `tm_inbound_fee_120d_diff`: `log1p(inversión_traspasos_€M)` pagada en los últimos `120` días.
"""

from __future__ import annotations

from bisect import bisect_left
from datetime import datetime
import math
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from club_free_sources import FREE_CACHE_DIR, HOLDOUT_CUT_DATE, TM_GAMES_GZ, TM_VALS_GZ

TM_APPEARANCES_GZ = FREE_CACHE_DIR / "tm_appearances.csv.gz"
TM_TRANSFERS_GZ = FREE_CACHE_DIR / "tm_transfers.csv.gz"

DOMESTIC_LEAGUE_COMP_IDS: frozenset[str] = frozenset(
    {
        "GB1", "ES1", "L1", "IT1", "FR1", "PO1", "NL1", "BE1", "TR1", "GR1",
        "SC1", "DK1", "RU1", "UKR1", "BRA1", "ARG1", "MEX1", "MLS1", "JAP1", "SE1",
    }
)


class CausalClubWave2Bridge:
    """Índice O(N) estrictamente causal (`< match_ord`) sobre apariciones reales, fatiga UEFA/Copas y fichajes."""

    def __init__(self, max_date_exclusive: str | None = HOLDOUT_CUT_DATE) -> None:
        # 1. Calendario completo por club (incluye UEFA y Copas): cid -> (ords, is_cup_or_uefa, is_away)
        self._game_schedule: dict[int, tuple[list[int], list[int], list[int]]] = {}
        # 2. XI realmente alineado por partido desde `appearances` × `valuations`: cid -> (ords, xi_eur_m, ga_equiv)
        self._realized_xi: dict[int, tuple[list[int], list[float], list[float]]] = {}
        # 3. Top-11 teórico de plantilla por snapshot para ratio de disponibilidad/lesiones: snap_ords + [{cid: top11_eur_m}]
        self._top11_snap_ords: list[int] = []
        self._top11_snaps: list[dict[int, float]] = []
        # 4. Transferencias causales: cid -> (ords, in_val_m, out_val_m, in_fee_m)
        self._transfers_by_club: dict[int, tuple[list[int], list[float], list[float], list[float]]] = {}

        # --- A. Cargar calendario de partidos de todas las competiciones (`tm_games.csv.gz`) ---
        if TM_GAMES_GZ.exists():
            gm = pd.read_csv(
                TM_GAMES_GZ,
                usecols=["competition_id", "date", "home_club_id", "away_club_id"],
            )
            gm["date_str"] = gm["date"].astype(str).str.slice(0, 10)
            if max_date_exclusive is not None:
                gm = gm[gm["date_str"] < str(max_date_exclusive)[:10]].copy()
            gm["dt"] = pd.to_datetime(gm["date_str"], format="%Y-%m-%d", errors="coerce")
            gm = gm[gm["dt"].notna() & gm["home_club_id"].notna() & gm["away_club_id"].notna()].sort_values("dt", kind="mergesort")
            gm["g_ord"] = gm["dt"].map(lambda d: d.toordinal()).astype(np.int64)
            gm["is_cup"] = (~gm["competition_id"].fillna("").isin(DOMESTIC_LEAGUE_COMP_IDS)).astype(np.int8)

            sched_acc: dict[int, tuple[list[int], list[int], list[int]]] = {}
            for r in gm.itertuples(index=False):
                go = int(r.g_ord)
                ic = int(r.is_cup)
                hcid = int(r.home_club_id)
                acid = int(r.away_club_id)
                sh = sched_acc.setdefault(hcid, ([], [], []))
                sh[0].append(go)
                sh[1].append(ic)
                sh[2].append(0)
                sa = sched_acc.setdefault(acid, ([], [], []))
                sa[0].append(go)
                sa[1].append(ic)
                sa[2].append(1)
            self._game_schedule = sched_acc

        # --- B. Barrido causal conjunto `valuations (v_ord < a_ord)` -> `appearances` ---
        if TM_VALS_GZ.exists() and TM_APPEARANCES_GZ.exists():
            pv = pd.read_csv(
                TM_VALS_GZ,
                usecols=["player_id", "date", "market_value_in_eur", "current_club_id"],
            )
            pv["date_str"] = pv["date"].astype(str).str.slice(0, 10)
            if max_date_exclusive is not None:
                pv = pv[pv["date_str"] < str(max_date_exclusive)[:10]].copy()
            pv["val_eur"] = pd.to_numeric(pv["market_value_in_eur"], errors="coerce").fillna(0.0)
            pv = pv[pv["val_eur"] > 0.0].copy()
            pv["dt"] = pd.to_datetime(pv["date_str"], format="%Y-%m-%d", errors="coerce")
            pv = pv[pv["dt"].notna()].sort_values("dt", kind="mergesort").reset_index(drop=True)
            v_ords = pv["dt"].map(lambda d: d.toordinal()).to_numpy(dtype=np.int64)
            v_pids = pv["player_id"].to_numpy(dtype=np.int64)
            v_vals = pv["val_eur"].to_numpy(dtype=np.float64)
            v_cids = pd.to_numeric(pv["current_club_id"], errors="coerce").fillna(-1).to_numpy(dtype=np.int64)

            # Construir también snapshots bimensuales de `top11_eur_m` por club
            snap_ords_t11: list[int] = []
            for yr in range(2012, 2027):
                for mo in (1, 3, 5, 7, 9, 11):
                    d_iso = f"{yr:04d}-{mo:02d}-01"
                    if max_date_exclusive is not None and d_iso > str(max_date_exclusive)[:10]:
                        continue
                    snap_ords_t11.append(datetime(yr, mo, 1).toordinal())

            latest_club_p: dict[int, tuple[int, int, float]] = {}
            ptr_s = 0
            n_v = len(v_ords)
            for s_ord in snap_ords_t11:
                while ptr_s < n_v and v_ords[ptr_s] < s_ord:
                    if v_cids[ptr_s] > 0:
                        latest_club_p[int(v_pids[ptr_s])] = (int(v_ords[ptr_s]), int(v_cids[ptr_s]), float(v_vals[ptr_s]))
                    ptr_s += 1
                min_vo = s_ord - 540
                cb: dict[int, list[float]] = {}
                for _, (vo, cid_k, ve) in latest_club_p.items():
                    if vo >= min_vo:
                        cb.setdefault(cid_k, []).append(ve)
                s_t11: dict[int, float] = {}
                for cid_k, vl in cb.items():
                    if len(vl) >= 7:
                        vl.sort(reverse=True)
                        s_t11[cid_k] = sum(vl[:11]) / 1e6
                self._top11_snap_ords.append(s_ord)
                self._top11_snaps.append(s_t11)

            # Ahora cargar apariciones y cruzar en una sola pasada lineal O(N_val + N_app)
            ap = pd.read_csv(
                TM_APPEARANCES_GZ,
                usecols=["game_id", "player_id", "player_club_id", "date", "goals", "assists", "minutes_played"],
            )
            ap["date_str"] = ap["date"].astype(str).str.slice(0, 10)
            if max_date_exclusive is not None:
                ap = ap[ap["date_str"] < str(max_date_exclusive)[:10]].copy()
            ap = ap[ap["player_club_id"].notna() & ap["game_id"].notna()].copy()
            ap["dt"] = pd.to_datetime(ap["date_str"], format="%Y-%m-%d", errors="coerce")
            ap = ap[ap["dt"].notna()].sort_values("dt", kind="mergesort").reset_index(drop=True)

            a_ords = ap["dt"].map(lambda d: d.toordinal()).to_numpy(dtype=np.int64)
            a_gids = ap["game_id"].to_numpy(dtype=np.int64)
            a_pids = ap["player_id"].to_numpy(dtype=np.int64)
            a_cids = ap["player_club_id"].to_numpy(dtype=np.int64)
            a_mins = pd.to_numeric(ap["minutes_played"], errors="coerce").fillna(0.0).clip(0.0, 95.0).to_numpy(dtype=np.float64)
            a_ga = (
                pd.to_numeric(ap["goals"], errors="coerce").fillna(0.0).clip(0.0, 10.0)
                + pd.to_numeric(ap["assists"], errors="coerce").fillna(0.0).clip(0.0, 10.0)
            ).to_numpy(dtype=np.float64)

            cur_pval: dict[int, float] = {}
            ptr_v = 0
            # Acumulador por `(cid, gid)` -> `[a_ord, weighted_val_eur, sum_mins, sum_ga]`
            cg_acc: dict[tuple[int, int], list[float]] = {}
            for k in range(len(a_ords)):
                ao = int(a_ords[k])
                while ptr_v < n_v and v_ords[ptr_v] < ao:
                    cur_pval[int(v_pids[ptr_v])] = float(v_vals[ptr_v])
                    ptr_v += 1
                mn = float(a_mins[k])
                if mn <= 0.0:
                    continue
                pv_k = cur_pval.get(int(a_pids[k]), 400_000.0)
                key_cg = (int(a_cids[k]), int(a_gids[k]))
                rec = cg_acc.get(key_cg)
                w_val = pv_k * (mn / 90.0)
                if rec is None:
                    cg_acc[key_cg] = [float(ao), w_val, mn, float(a_ga[k])]
                else:
                    rec[1] += w_val
                    rec[2] += mn
                    rec[3] += float(a_ga[k])

            # Agrupar por `cid` ordenado por `a_ord`
            by_cid_games: dict[int, list[tuple[int, float, float]]] = {}
            for (cid_k, _), (ao_f, w_eur, s_mn, s_ga) in cg_acc.items():
                if s_mn < 450.0:  # Al menos ~5 jugadores reportados en el acta
                    continue
                # Escalar a 11 x 90 = 990 minutos equivalentes
                xi_eur_m = (w_eur * (990.0 / max(450.0, min(1050.0, s_mn)))) / 1e6
                ga_eq = s_ga * (990.0 / max(450.0, s_mn))
                by_cid_games.setdefault(cid_k, []).append((int(ao_f), xi_eur_m, ga_eq))

            for cid_k, glst in by_cid_games.items():
                glst.sort(key=lambda x: x[0])
                self._realized_xi[cid_k] = (
                    [x[0] for x in glst],
                    [x[1] for x in glst],
                    [x[2] for x in glst],
                )

        # --- C. Cargar transferencias estrictamente causales (`tm_transfers.csv.gz`) ---
        if TM_TRANSFERS_GZ.exists():
            tr = pd.read_csv(
                TM_TRANSFERS_GZ,
                usecols=["transfer_date", "from_club_id", "to_club_id", "transfer_fee", "market_value_in_eur"],
            )
            tr["date_str"] = tr["transfer_date"].astype(str).str.slice(0, 10)
            tr = tr[(tr["date_str"] >= "2005-01-01")].copy()
            if max_date_exclusive is not None:
                tr = tr[tr["date_str"] < str(max_date_exclusive)[:10]].copy()
            tr["dt"] = pd.to_datetime(tr["date_str"], format="%Y-%m-%d", errors="coerce")
            tr = tr[tr["dt"].notna()].sort_values("dt", kind="mergesort")
            tr["t_ord"] = tr["dt"].map(lambda d: d.toordinal()).astype(np.int64)
            tr["val_m"] = pd.to_numeric(tr["market_value_in_eur"], errors="coerce").fillna(0.0).clip(0.0, 3e8) / 1e6
            tr["fee_m"] = pd.to_numeric(tr["transfer_fee"], errors="coerce").fillna(0.0).clip(0.0, 3e8) / 1e6

            tr_events: dict[int, list[tuple[int, float, float, float]]] = {}
            for r in tr.itertuples(index=False):
                to_ord = int(r.t_ord)
                vm = float(r.val_m)
                fm = float(r.fee_m)
                if vm <= 0.0 and fm <= 0.0:
                    continue
                if pd.notna(r.to_club_id):
                    tc = int(r.to_club_id)
                    tr_events.setdefault(tc, []).append((to_ord, vm, 0.0, fm))
                if pd.notna(r.from_club_id):
                    fc = int(r.from_club_id)
                    tr_events.setdefault(fc, []).append((to_ord, 0.0, vm, 0.0))

            for cid_k, evs in tr_events.items():
                evs.sort(key=lambda x: x[0])
                self._transfers_by_club[cid_k] = (
                    [x[0] for x in evs],
                    [x[1] for x in evs],
                    [x[2] for x in evs],
                    [x[3] for x in evs],
                )

    def lookup_club_wave2(self, cid: int | None, match_ord: int) -> dict[str, float]:
        res = {
            "midweek_cup_load": 0.0,
            "games_14d_allcomps": 1.5,
            "has_realized_xi": 0.0,
            "realized_xi_log_val": 0.0,
            "injury_avail_ratio": 0.85,
            "xi_ga90_allcomps": 2.10,
            "net_transfer_val_120d": 0.0,
            "inbound_fee_120d": 0.0,
        }
        if cid is None:
            return res

        # 1. Fatiga entre semana UEFA/Copa y carga en 14d
        sch = self._game_schedule.get(cid)
        if sch is not None:
            ords_s, cups_s, aways_s = sch
            idx_hi = bisect_left(ords_s, int(match_ord))
            idx_lo = bisect_left(ords_s, int(match_ord) - 14)
            cnt_14d = 0
            cup_load = 0.0
            for k in range(idx_lo, idx_hi):
                days_ago = int(match_ord) - ords_s[k]
                if 1 <= days_ago <= 14:
                    cnt_14d += 1
                if 2 <= days_ago <= 5 and cups_s[k] == 1:
                    cup_load = max(cup_load, 1.35 if aways_s[k] == 1 else 1.0)
            res["midweek_cup_load"] = cup_load
            res["games_14d_allcomps"] = float(cnt_14d)

        # 2. XI realmente alineado y disponibilidad respecto al Top-11 teórico
        rxi = self._realized_xi.get(cid)
        if rxi is not None:
            ords_x, vals_x, gas_x = rxi
            ix_hi = bisect_left(ords_x, int(match_ord))
            recent_vals: list[float] = []
            recent_gas: list[float] = []
            for k in range(ix_hi - 1, max(-1, ix_hi - 4), -1):
                if (int(match_ord) - ords_x[k]) <= 45:
                    recent_vals.append(vals_x[k])
                    recent_gas.append(gas_x[k])
            if recent_vals:
                mean_xi_m = float(np.mean(recent_vals))
                res["has_realized_xi"] = 1.0
                res["realized_xi_log_val"] = math.log1p(max(0.0, mean_xi_m))
                n_g = float(len(recent_gas))
                res["xi_ga90_allcomps"] = (float(np.sum(recent_gas)) + 2.10 * 3.0) / (n_g + 3.0)

                if self._top11_snap_ords:
                    isnap = bisect_left(self._top11_snap_ords, int(match_ord)) - 1
                    if isnap >= 0:
                        t11_m = self._top11_snaps[isnap].get(cid)
                        if t11_m is not None and t11_m > 0.5:
                            res["injury_avail_ratio"] = max(0.20, min(1.15, mean_xi_m / t11_m))

        # 3. Flujo neto de fichajes últimos 120 días
        tr_c = self._transfers_by_club.get(cid)
        if tr_c is not None:
            ords_t, in_v, out_v, in_f = tr_c
            it_hi = bisect_left(ords_t, int(match_ord))
            it_lo = bisect_left(ords_t, int(match_ord) - 120)
            if it_hi > it_lo:
                sum_in_v = sum(in_v[it_lo:it_hi])
                sum_out_v = sum(out_v[it_lo:it_hi])
                sum_in_f = sum(in_f[it_lo:it_hi])
                res["net_transfer_val_120d"] = math.log1p(sum_in_v) - math.log1p(sum_out_v)
                res["inbound_fee_120d"] = math.log1p(sum_in_f)

        return res
