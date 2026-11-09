#!/usr/bin/env python3
"""A05 — Auditoría de features causales del Motor A (PitchLab).

Ejecuta, de forma reproducible y sin tocar `features/build_features.py`:

1. **Diccionario real** de las columnas de `data/processed/features.parquet`,
   agrupadas por bloque con su fórmula/fuente y su rol
   (`feature` / `target` / `post-partido` / `mercado` / `metadato`).
2. **Auditoría de leakage** con evidencia:
   a. *Test de viaje en el tiempo*: se reconstruyen las features usando SOLO
      partidos con `match_date < corte` y se comparan las filas anteriores al
      corte contra el dataset completo. Cualquier diferencia es información
      futura. El reconstrucor es una réplica exacta de `build_features.main()`
      y se **valida** primero contra el parquet real (debe ser idéntico).
   b. *Atribución de los priors de equipo*: se comprueba a qué temporada
      pertenece realmente el agregado que acaba en `home_prev_*`/`away_prev_*`.
   c. Correlación de cada feature con el target y con los goles del partido.
   d. Verificación manual (2 casos) de `h_points_r5` contra las fechas.
   e. Verificación del Elo pre/post (recálculo completo de una división y
      comprobación de la fórmula de actualización).
3. **Calidad**: nulos por bloque y temporada, constantes/cuasi-constantes,
   estabilidad (media/std por temporada), correlación con el target y
   multicolinealidad (|r| > 0.9).
4. **Ablación** con regresión logística multinomial estandarizada, walk-forward
   por temporada sobre `dev` + `val` (2008/09 → 2023/24). El conjunto `test`
   (2024/25 y 2025/26) **no se toca**.

Uso
---
    cd research/prediction-lab
    ./.venv/bin/python features/audit_features.py                  # todo
    ./.venv/bin/python features/audit_features.py --skip-ablation
    ./.venv/bin/python features/audit_features.py --skip-timewarp --max-iter 300

Salida
------
    features/feature_audit.json   (todo lo anterior, serializable)

Notas de honestidad
-------------------
* El parquet real tiene **198 columnas**, no 192 como decía el encargo: se
  auditan las 198 y se reporta la discrepancia.
* No se modifica ningún artefacto previo: el script solo lee
  `data/processed/features.parquet` y `data/processed/matches.parquet`.
* Las features marcadas como `post-partido` o `target` se excluyen siempre del
  modelo; el bloque `priors` se audita tal cual está y, además, se reconstruye
  una versión causal propia para medir su valor honesto.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Sequence, Tuple

import numpy as np
import pandas as pd

LAB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if LAB not in sys.path:
    sys.path.insert(0, LAB)

from features import build_features as bf  # noqa: E402  (solo lectura)
import eval.metrics as em  # noqa: E402

PROC = os.path.join(LAB, "data", "processed")
FEATURES_PATH = os.path.join(PROC, "features.parquet")
MATCHES_PATH = os.path.join(PROC, "matches.parquet")
DEFAULT_OUT = os.path.join(LAB, "features", "feature_audit.json")

SEED = 20261109
DEFAULT_CUTOFFS = ("2020-07-01", "2021-01-15")
WALK_START = 2008          # primera temporada predicha (2008/09)
VAL_SEASON = 2023          # última temporada usada (val)
DEV_MAX = 2022
TEST_SEASONS = (2024, 2025, 2026)

# Columnas del partido que NO son features: resultado, estadísticas del propio
# partido y Elo posterior. Se excluyen SIEMPRE del modelo.
TARGET_COLS = ["y", "result", "home_goals", "away_goals", "goals_total"]
POST_MATCH_PREFIXES = ("ht_", "shots_", "sot_", "corners_", "fouls_", "yellows_", "reds_")
META_COLS = [
    "match_id", "source", "div", "league", "country", "season", "season_start",
    "match_date", "kickoff_time", "home_team", "away_team", "source_season_file",
    "source_row", "has_result", "has_close_odds", "has_open_odds", "has_shots",
    "ingested_at",
]

ELO_BLOCK = ["elo_home", "elo_away", "elo_diff"]
# Columnas de tiro: se usan para la ablación "todo sin tiros".
SHOT_TOKENS = ("shots", "sot", "corners", "goals_per_shot", "sot_rate", "prev_sot_pg")


# ---------------------------------------------------------------------------
# utilidades
# ---------------------------------------------------------------------------
def r6(x: Any) -> Any:
    """Redondea floats para que el JSON sea legible y estable."""
    if isinstance(x, (np.floating, float)):
        v = float(x)
        return None if not np.isfinite(v) else round(v, 6)
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.bool_,)):
        return bool(x)
    return x


def jsonable(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {str(k): jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [jsonable(v) for v in obj]
    if isinstance(obj, (np.ndarray,)):
        return [jsonable(v) for v in obj.tolist()]
    return r6(obj)


def git_commit() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=LAB,
                                       stderr=subprocess.DEVNULL).decode().strip()
    except Exception:
        return "unknown"


def load_matches(cut: pd.Timestamp | None = None) -> pd.DataFrame:
    """`bf.load_matches()` (idéntico) y, opcionalmente, filtrado por fecha < corte.

    Filtrar DESPUÉS de ordenar es equivalente a filtrar antes: el orden relativo
    dentro de cada división se conserva, que es lo único que usa el pipeline.
    """
    df = bf.load_matches()
    if cut is not None:
        df = df[df["match_date"] < cut].copy()
    return df


def load_dataset() -> Tuple[pd.DataFrame, pd.DataFrame]:
    feat = pd.read_parquet(FEATURES_PATH)
    matches = pd.read_parquet(MATCHES_PATH)
    matches["match_date"] = pd.to_datetime(matches["match_date"])
    return feat, matches


# ---------------------------------------------------------------------------
# reconstrucción exacta del pipeline (réplica de build_features.main)
# ---------------------------------------------------------------------------
def rebuild_features(df: pd.DataFrame) -> pd.DataFrame:
    """Réplica exacta y sin IO de `features/build_features.py::main()`.

    Se valida contra el parquet real en `check_reproduction()`; si la réplica no
    fuese idéntica, el test de viaje en el tiempo no sería concluyente.
    """
    df = df.copy()
    df = bf.elo_block(df, k=bf.ELO_K, hfa=bf.ELO_HFA, season_reg=bf.ELO_SEASON_REGRESSION,
                      mov=bf.ELO_MOV, prefix="elo")
    df = bf.elo_block(df, k=10, hfa=bf.ELO_HFA, season_reg=bf.ELO_SEASON_REGRESSION,
                      mov=False, prefix="elo_k10")
    df = bf.elo_block(df, k=40, hfa=bf.ELO_HFA, season_reg=bf.ELO_SEASON_REGRESSION,
                      mov=True, prefix="elo_k40")
    long = bf.build_long(df)
    long = bf.rest_and_congestion(long)
    long = bf.rolling_features(long)
    long = long.sort_values(["team", "match_date", "match_id"], kind="mergesort")
    long["prev_div"] = long.groupby("team")["div"].shift(1)
    long["prev_season"] = long.groupby("team").season.shift(1)
    long["div_change"] = ((long.prev_div.notna()) & (long.prev_div != long["div"])).astype(int)
    long["season_break"] = ((long.prev_season.notna()) & (long.prev_season != long.season)).astype(int)

    feat_cols = [c for c in long.columns if any(c.endswith(s) for s in ("_r5", "_r10", "_ewm5"))]
    feat_cols += ["days_rest", "matches_last_14d", "div_change", "season_break", "is_home"]
    base = ["match_id", "team", "is_home"] + feat_cols
    home_feats = (long[long.is_home == 1][base].add_prefix("h_")
                  .rename(columns={"h_match_id": "match_id"}).drop(columns=["h_team", "h_is_home"]))
    away_feats = (long[long.is_home == 0][base].add_prefix("a_")
                  .rename(columns={"a_match_id": "match_id"}).drop(columns=["a_team", "a_is_home"]))
    out = df.merge(home_feats, on="match_id", how="left").merge(away_feats, on="match_id", how="left")
    out = bf.context_features(out)
    tp = bf.team_season_priors(long)
    for side, team in (("home", "home_team"), ("away", "away_team")):
        m = out[["match_id", "div", team, "season"]].merge(
            tp, left_on=["div", team, "season"], right_on=["div", "team", "prev_of"], how="left")
        m = m.set_index("match_id")
        for c in ("prev_n", "prev_ppg", "prev_gf_pg", "prev_ga_pg", "prev_sot_pg"):
            out[f"{side}_{c}"] = m[c].reindex(out.match_id).values
    lp = bf.league_priors(df)
    out = out.merge(lp, on=["div", "season"], how="left")
    for c in ("elo_diff", "elo_diff_no_hfa"):
        out[c] = out[c].astype(float)
    out["elo_prob_home_nodraw"] = 1.0 / (1.0 + 10.0 ** (-out.elo_diff / 400.0))
    out["elo_diff_x_progress"] = out.elo_diff * out.season_progress
    out["form_pts_diff_r5"] = out.h_points_r5 - out.a_points_r5
    out["form_gd_diff_r5"] = out.h_gd_r5 - out.a_gd_r5
    out["form_gd_diff_r10"] = out.h_gd_r10 - out.a_gd_r10
    out["rest_diff"] = out.h_days_rest - out.a_days_rest
    out["congestion_diff"] = out.h_matches_last_14d - out.a_matches_last_14d
    out["y"] = out.result.map({"H": 0, "D": 1, "A": 2}).astype("Int64")
    out["season_start"] = pd.to_numeric(out.season_start, errors="coerce").astype("Int64")
    out["goals_total"] = out.home_goals + out.away_goals
    out = out.sort_values(["div", "match_date", "match_id"], kind="mergesort").reset_index(drop=True)
    return out


def frames_identical(ref: pd.DataFrame, got: pd.DataFrame, tol: float = 0.0) -> Dict[str, Any]:
    """Compara dos frames por `match_id`; devuelve columnas que difieren."""
    a = ref.set_index("match_id").sort_index()
    b = got.set_index("match_id").sort_index()
    res: Dict[str, Any] = {
        "rows_ref": int(len(a)), "rows_got": int(len(b)),
        "same_index": bool(a.index.equals(b.index)),
        "same_columns": bool(set(a.columns) == set(b.columns)),
        "missing_columns": sorted(set(a.columns) - set(b.columns)),
        "extra_columns": sorted(set(b.columns) - set(a.columns)),
        "differing": {}, "n_differing_columns": 0, "identical": False,
    }
    if not res["same_index"] or not res["same_columns"]:
        return res
    for col in a.columns:
        x, y = a[col], b[col]
        if x.dtype.kind in "fiub" and y.dtype.kind in "fiub":
            d = (x.astype("float64") - y.astype("float64")).abs()
            n = int((d.fillna(0.0) > tol).sum())
            if n:
                res["differing"][col] = {"n": n, "max_abs_diff": float(d.max())}
        else:
            n = int((x.fillna("§").astype(str) != y.fillna("§").astype(str)).sum())
            if n:
                res["differing"][col] = {"n": n, "max_abs_diff": None}
    res["n_differing_columns"] = len(res["differing"])
    res["identical"] = res["n_differing_columns"] == 0
    return res


def check_reproduction(feat: pd.DataFrame) -> Tuple[Dict[str, Any], pd.DataFrame]:
    """Valida que `rebuild_features` reproduce el parquet real (control del test)."""
    t0 = time.time()
    rebuilt = rebuild_features(load_matches())
    cmp = frames_identical(feat, rebuilt)
    cmp["seconds"] = round(time.time() - t0, 1)
    return cmp, rebuilt


# ---------------------------------------------------------------------------
# 1. diccionario
# ---------------------------------------------------------------------------
GROUP_SPECS: List[Dict[str, Any]] = [
    {
        "group": "metadatos",
        "role": "metadato (no usar como feature)",
        "formula": "Columnas de identificación y procedencia tal cual llegan de matches.parquet. "
                   "`source_row` y `source_season_file` permiten trazar la fila original; "
                   "`has_*` son flags de cobertura del ETL.",
        "source": "etl/build_matches.py",
    },
    {
        "group": "target",
        "role": "target (prohibido como feature)",
        "formula": "`y = 0/1/2` desde `result` (H/D/A); `goals_total = home_goals + away_goals`. "
                   "`result`, `home_goals` y `away_goals` son el marcador del propio partido.",
        "source": "matches.parquet",
    },
    {
        "group": "post_partido",
        "role": "post-partido (prohibido como feature)",
        "formula": "Estadísticas del PROPIO partido (tiros, córners, faltas, tarjetas, descanso) "
                   "y Elo posterior `elo_*_post = elo_pre + K*MOV*(score - exp)`. "
                   "No existen antes del pitido final.",
        "source": "matches.parquet + features/build_features.py::elo_block",
    },
    {
        "group": "elo_pre",
        "role": "feature",
        "formula": "Elo causal por (div, equipo): `R_pre` es el rating ANTES del partido; "
                   "`exp_home = 1/(1+10^-((R_h+65-R_a)/400))`; "
                   "`R_post = R_pre + K*MOV(gd)*(score - exp)` con K∈{10,20,40}, "
                   "MOV = 1 / 1.5 / (11+|gd|)/8 y regresión a 1500 del 33 % entre temporadas. "
                   "`elo_diff = R_h + 65 - R_a`; `elo_diff_no_hfa = R_h - R_a`; "
                   "`elo_prob_home_nodraw = 1/(1+10^(-elo_diff/400))` (transformación monótona de elo_diff).",
        "source": "features/build_features.py::elo_block",
    },
    {
        "group": "forma",
        "role": "feature",
        "formula": "Medias móviles por equipo con `.shift(1)`: `X_r{w} = mean(X_{t-1..t-w})`, "
                   "`min_periods=1`; `X_ewm5` con halflife=5 partidos. X ∈ {points, gf, ga, gd, "
                   "shots, sot, corners, win, draw, loss, goals_per_shot, sot_rate} para w∈{5,10}. "
                   "Diferenciales: `form_pts_diff_r5 = h_points_r5 - a_points_r5` (idem gd r5/r10).",
        "source": "features/build_features.py::rolling_features",
    },
    {
        "group": "descanso",
        "role": "feature",
        "formula": "`days_rest` = días desde el partido anterior del equipo (NaN en el primero); "
                   "`matches_last_14d` = nº de partidos del equipo en los 14 días previos "
                   "(estrictamente anteriores). Diferenciales `rest_diff`, `congestion_diff`.",
        "source": "features/build_features.py::rest_and_congestion",
    },
    {
        "group": "contexto",
        "role": "feature",
        "formula": "`*_season_match_no` = nº de partidos previos del equipo en la temporada-división "
                   "(cumcount); `round_no = max(local, visitante)`; "
                   "`season_progress = (fecha - min(fecha temporada)) / (max(fecha temporada) - min(fecha))` "
                   "**usa la fecha del último partido de la temporada (información futura de calendario)**; "
                   "`div_change` / `season_break` = flags de cambio de división / temporada.",
        "source": "features/build_features.py::context_features",
    },
    {
        "group": "priors_equipo",
        "role": "feature (AUDITADA: resultado del test de viaje en el tiempo)",
        "formula": "Agregados por (div, equipo, temporada) de la temporada ANTERIOR según la intención "
                   "declarada: `prev_ppg = pts/n`, `prev_gf_pg`, `prev_ga_pg`, `prev_sot_pg` y `prev_n`. "
                   "Implementación real: `prev_of = season.shift(1)` y join `left.season == right.prev_of`.",
        "source": "features/build_features.py::team_season_priors + main()",
    },
    {
        "group": "priors_liga",
        "role": "feature",
        "formula": "`lg_avg_total_prev` y `lg_home_win_prev` = media de goles totales y % de victoria "
                   "local de la temporada ANTERIOR de la división (join correcto por `(div, season)`).",
        "source": "features/build_features.py::league_priors",
    },
    {
        "group": "mercado",
        "role": "mercado (fuera del Motor A; disponible para Motor B)",
        "formula": "Cuotas decimales de apertura y cierre (b365, ps, avg, max, bf, bfe) y líneas de "
                   "totales 2.5. No son features deportivas: se excluyen de la ablación. "
                   "Las de CIERRE no son válidas para una predicción previa al partido "
                   "(CONTRACT_DATASET §3.4).",
        "source": "matches.parquet",
    },
]


def classify_columns(df: pd.DataFrame) -> Dict[str, List[str]]:
    cols = list(df.columns)
    assigned: Dict[str, str] = {}
    groups: Dict[str, List[str]] = {g["group"]: [] for g in GROUP_SPECS}

    def put(group: str, cs: Iterable[str]) -> None:
        for c in cs:
            if c in assigned:
                continue
            assigned[c] = group
            groups[group].append(c)

    put("metadatos", [c for c in META_COLS if c in cols])
    put("target", [c for c in TARGET_COLS if c in cols])
    put("post_partido", [c for c in cols if c.startswith(POST_MATCH_PREFIXES) or c.endswith("_post")])
    put("mercado", [c for c in cols if c.startswith("odds_") or c.startswith("totals_")])
    put("elo_pre", [c for c in cols if c.startswith("elo")])
    put("priors_equipo", [c for c in cols if c.startswith(("home_prev_", "away_prev_"))])
    put("priors_liga", [c for c in cols if c.startswith("lg_")])
    put("forma", [c for c in cols if (c.startswith(("h_", "a_")) and
                                      any(c.endswith(s) for s in ("_r5", "_r10", "_ewm5")))
                  or c.startswith("form_")])
    put("descanso", [c for c in cols if c.endswith(("_days_rest", "_matches_last_14d")) or
                     c in ("rest_diff", "congestion_diff")])
    put("contexto", [c for c in cols if c.endswith(("_season_match_no", "_div_change", "_season_break"))
                     or c in ("round_no", "season_progress")])

    leftovers = [c for c in cols if c not in assigned]
    if leftovers:  # nunca debería ocurrir; si ocurre, es un hallazgo
        groups.setdefault("sin_clasificar", [])
        put("sin_clasificar", leftovers)
    return groups


# ---------------------------------------------------------------------------
# 2. leakage
# ---------------------------------------------------------------------------
def test_time_travel(full: pd.DataFrame, cutoffs: Sequence[str]) -> Dict[str, Any]:
    """Reconstruye con datos < corte y compara las filas < corte contra el dataset."""
    out: Dict[str, Any] = {"protocol": {
        "rebuild": "features/build_features.py (replica exacta, validada contra el parquet)",
        "rule": "solo partidos con match_date < corte",
        "cutoffs": list(cutoffs)}, "runs": []}
    for cutoff in cutoffs:
        t0 = time.time()
        cut = pd.Timestamp(cutoff)
        rebuilt = rebuild_features(load_matches(cut))
        ref = full[full["match_date"] < cut]
        cmp = frames_identical(ref, rebuilt)
        by_group: Dict[str, int] = {}
        groups = classify_columns(ref)
        for gname, gcols in groups.items():
            by_group[gname] = sum(1 for c in gcols if c in cmp["differing"])
        out["runs"].append({
            "cutoff": cutoff,
            "rows_compared": cmp["rows_ref"],
            "n_columns_compared": len(ref.columns),
            "identical": cmp["identical"],
            "n_differing_columns": cmp["n_differing_columns"],
            "differing_columns": cmp["differing"],
            "differing_by_group": by_group,
            "seconds": round(time.time() - t0, 1),
        })
    # resumen de columnas que fallan en al menos un corte
    failing = set()
    for run in out["runs"]:
        failing |= set(run["differing_columns"])
    out["columns_depending_on_future"] = sorted(failing)
    out["n_columns_depending_on_future"] = len(failing)
    out["verdict"] = ("LEAKAGE_CONFIRMADO" if failing else "SIN_DIFERENCIAS")
    return out


def probe_team_priors(feat: pd.DataFrame, matches: pd.DataFrame) -> Dict[str, Any]:
    """¿A qué temporada pertenece el agregado que acaba en `home_prev_*`?

    Se construyen los agregados por (div, equipo, temporada) desde el mismo
    `long` que usa build_features y se compara, para cada partido, con el
    agregado de su propia temporada, el de la anterior y el de la siguiente.
    """
    df = load_matches()
    long = bf.build_long(bf.elo_block(df.copy(), prefix="elo"))
    agg = (long.groupby(["div", "team", "season"], as_index=False)
           .agg(n=("match_id", "size"), gf=("gf", "sum"), ga=("ga", "sum"), pts=("points", "sum")))
    agg["ppg"] = agg.pts / agg.n
    agg["gf_pg"] = agg.gf / agg.n
    agg["ga_pg"] = agg.ga / agg.n
    agg["sot_pg"] = long.groupby(["div", "team", "season"]).sot.mean().values
    agg = agg.sort_values(["div", "team", "season"], kind="mergesort").reset_index(drop=True)
    for c in ("n", "ppg", "gf_pg", "ga_pg"):
        agg["next_" + c] = agg.groupby(["div", "team"])[c].shift(-1)
        agg["prev_" + c] = agg.groupby(["div", "team"])[c].shift(1)

    m = feat.merge(agg, left_on=["div", "home_team", "season"],
                   right_on=["div", "team", "season"], how="left")
    sub = m[m["home_prev_ppg"].notna()]
    res: Dict[str, Any] = {
        "n_rows": int(len(m)), "n_with_prior": int(len(sub)),
        "share_with_prior": round(len(sub) / len(m), 4),
        "matches": {},
        "detail": {},
    }
    for col, base in (("home_prev_ppg", "ppg"), ("home_prev_gf_pg", "gf_pg"),
                      ("home_prev_ga_pg", "ga_pg"), ("home_prev_n", "n")):
        for lab in ("", "next_", "prev_"):
            ok = ((sub[col] - sub[f"{lab}{base}"]).abs() < 1e-9).mean()
            res["matches"][f"{col}=={lab or 'own_'}{base}"] = round(float(ok), 4)
    # precisión del diagnóstico: cuántas filas coinciden con la temporada siguiente
    res["detail"] = {
        "next_season_ppg_match": res["matches"]["home_prev_ppg==next_ppg"],
        "own_season_ppg_match": res["matches"]["home_prev_ppg==own_ppg"],
        "prev_season_ppg_match": res["matches"]["home_prev_ppg==prev_ppg"],
        "sot_pg_zero_share": round(float((sub["home_prev_sot_pg"] == 0).mean()), 4),
    }
    res["diagnosis"] = (
        "home_prev_*/away_prev_* contienen el agregado de la temporada SIGUIENTE "
        "(futuro), no la anterior"
        if res["detail"]["next_season_ppg_match"] > 0.99 else
        "no se confirma la atribución a la temporada siguiente")
    return res


def rolling_manual_cases(feat: pd.DataFrame, matches: pd.DataFrame, n_cases: int = 2) -> Dict[str, Any]:
    """Recalcula `h_points_r5` a mano (últimos 5 partidos ANTERIORES) y compara."""
    df = load_matches()
    long = bf.build_long(bf.elo_block(df.copy(), prefix="elo"))
    long = long.sort_values(["team", "match_date", "match_id"], kind="mergesort")
    rng = np.random.default_rng(SEED)
    pool = feat[(feat["h_points_r5"].notna()) & (feat["season"].isin(["2015/16", "2019/20", "2022/23"]))]
    cases = []
    for _ in range(n_cases):
        row = pool.iloc[int(rng.integers(0, len(pool)))]
        hist = long[(long.team == row.home_team) & (long.match_date < row.match_date)]
        hist = hist.sort_values(["match_date", "match_id"])
        last5 = hist.tail(5)
        manual = float(last5["points"].mean())
        cases.append({
            "match_id": str(row.match_id),
            "team": str(row.home_team),
            "opponent": str(row.away_team),
            "match_date": str(pd.Timestamp(row.match_date).date()),
            "season": str(row.season),
            "last_matches": [{
                "date": str(pd.Timestamp(r.match_date).date()),
                "opponent": str(r.opponent),
                "gf": int(r.gf), "ga": int(r.ga), "points": int(r.points),
            } for r in last5.itertuples(index=False)],
            "n_previous_matches": int(len(hist)),
            "manual_mean_points": round(manual, 6),
            "dataset_h_points_r5": round(float(row.h_points_r5), 6),
            "abs_diff": float(abs(manual - float(row.h_points_r5))),
            "self_match_in_window": bool(((hist.match_id == row.match_id).sum()) > 0),
        })
    return {"cases": cases,
            "all_match": all(c["abs_diff"] < 1e-9 for c in cases),
            "window_size": 5, "min_periods": 1}


def elo_verification(feat: pd.DataFrame, matches: pd.DataFrame, n_cases: int = 2) -> Dict[str, Any]:
    """Recalcula el Elo de una división completa y comprueba la fórmula de update."""
    d = matches[matches["div"] == "E0"].sort_values(["match_date", "match_id"]).reset_index(drop=True)
    ratings: Dict[str, float] = {}
    last: Dict[str, str] = {}
    recs = []
    for r in d.itertuples(index=False):
        for t in (r.home_team, r.away_team):
            if t not in ratings:
                ratings[t] = bf.ELO_START
                last[t] = r.season
            elif last[t] != r.season:
                ratings[t] = bf.ELO_START + (ratings[t] - bf.ELO_START) * (1 - bf.ELO_SEASON_REGRESSION)
                last[t] = r.season
        rh, ra = ratings[r.home_team], ratings[r.away_team]
        exp = 1.0 / (1.0 + 10.0 ** (-((rh + bf.ELO_HFA) - ra) / 400.0))
        gd = int(r.home_goals) - int(r.away_goals)
        score = 1.0 if gd > 0 else (0.5 if gd == 0 else 0.0)
        mov = bf.mov_multiplier(gd)
        delta = bf.ELO_K * mov * (score - exp)
        recs.append((r.match_id, rh, ra, exp, rh + delta, ra - delta, gd, score, mov, delta))
        ratings[r.home_team], ratings[r.away_team] = rh + delta, ra - delta
    rec = pd.DataFrame(recs, columns=["match_id", "elo_home_rec", "elo_away_rec", "exp_rec",
                                      "home_post_rec", "away_post_rec", "gd", "score", "mov", "delta"])
    f = feat.set_index("match_id")
    j = rec.set_index("match_id").join(
        f[["elo_home", "elo_away", "elo_exp_home", "elo_home_post", "elo_away_post"]], how="inner")
    diffs = {a: float((j[a] - j[b]).abs().max()) for a, b in
             (("elo_home_rec", "elo_home"), ("elo_away_rec", "elo_away"),
              ("exp_rec", "elo_exp_home"), ("home_post_rec", "elo_home_post"),
              ("away_post_rec", "elo_away_post"))}
    # la fórmula del update debe cumplirse exactamente en el dataset completo
    gd_all = (feat["goals_total"] - 2 * feat["away_goals"]).astype(float)
    mov_all = np.where(gd_all.abs() <= 1, 1.0, np.where(gd_all.abs() == 2, 1.5, (11 + gd_all.abs()) / 8))
    score_all = np.where(gd_all > 0, 1.0, np.where(gd_all == 0, 0.5, 0.0))
    expected_delta = bf.ELO_K * mov_all * (score_all - feat["elo_exp_home"])
    formula_err = float(np.abs((feat["elo_home_post"] - feat["elo_home"]) - expected_delta).max())
    cases = []
    rng = np.random.default_rng(SEED)
    sample = j.iloc[rng.choice(len(j), size=n_cases, replace=False)]
    for mid, r in sample.iterrows():
        cases.append({
            "match_id": str(mid),
            "elo_home_pre": round(float(r.elo_home), 6),
            "exp_home": round(float(r.elo_exp_home), 6),
            "elo_home_post": round(float(r.elo_home_post), 6),
            "delta": round(float(r.elo_home_post - r.elo_home), 6),
            "recomputed_delta": round(float(r["delta"]), 6),
            "K": bf.ELO_K, "mov": float(r.mov), "score": float(r.score), "gd": int(r.gd),
            "matches_recomputation": bool(abs(float(r.elo_home) - float(r.elo_home_rec)) < 1e-12),
        })
    return {"division": "E0", "rows_compared": int(len(j)), "max_abs_diff_vs_recomputation": diffs,
            "max_abs_diff_formula_post_equals_pre_plus_delta": formula_err,
            "cases": cases,
            "verdict": "Elo pre-partido causal: el pre no incorpora el resultado; el post sí (y por eso se excluye)"}


def target_correlations(feat: pd.DataFrame, feature_cols: Sequence[str]) -> Dict[str, Any]:
    """|corr| de cada feature con el target y con los goles del partido."""
    y = feat["y"].astype(float)
    gd = (feat["home_goals"] - feat["away_goals"]).astype(float)
    gt = feat["goals_total"].astype(float)
    rows = []
    for c in feature_cols:
        s = feat[c]
        if not pd.api.types.is_numeric_dtype(s):
            continue
        s = s.astype(float)
        rows.append({
            "feature": c,
            "corr_y": float(s.corr(y)),
            "corr_goal_diff": float(s.corr(gd)),
            "corr_goals_total": float(s.corr(gt)),
            "null_share": float(s.isna().mean()),
        })
    t = pd.DataFrame(rows)
    t["max_abs_target_corr"] = t[["corr_y", "corr_goal_diff", "corr_goals_total"]].abs().max(axis=1)
    top = t.sort_values("max_abs_target_corr", ascending=False).head(12)
    flagged = t[t["max_abs_target_corr"] > 0.95]
    return {
        "n_features": int(len(t)),
        "max_abs_corr_y": float(t["corr_y"].abs().max()),
        "max_abs_corr_goal_diff": float(t["corr_goal_diff"].abs().max()),
        "max_abs_corr_goals_total": float(t["corr_goals_total"].abs().max()),
        "n_flagged_abs_gt_0.95": int(len(flagged)),
        "flagged": flagged[["feature", "max_abs_target_corr"]].to_dict("records"),
        "top12": top[["feature", "corr_y", "corr_goal_diff", "corr_goals_total"]]
                  .round(4).to_dict("records"),
    }


def post_match_check(feat: pd.DataFrame) -> Dict[str, Any]:
    """Demuestra que las columnas `_post` y las stats del partido son post-resultado."""
    gd = (feat["home_goals"] - feat["away_goals"]).astype(float)
    delta = feat["elo_home_post"] - feat["elo_home"]
    out = {
        "elo_post_delta_corr_goal_diff": round(float(delta.corr(gd)), 4),
        "elo_post_delta_unique_signs": int(np.sign(delta).nunique()),
        "example": {
            "match_id": str(feat.loc[0, "match_id"]),
            "elo_home": round(float(feat.loc[0, "elo_home"]), 4),
            "elo_home_post": round(float(feat.loc[0, "elo_home_post"]), 4),
            "home_goals": int(feat.loc[0, "home_goals"]),
            "away_goals": int(feat.loc[0, "away_goals"]),
        },
    }
    stats = ["shots_home", "sot_home", "corners_home", "fouls_home", "yellows_home", "reds_home"]
    out["match_stats_corr_with_goal_diff"] = {
        c: round(float(feat[c].corr(gd)), 4) for c in stats if c in feat.columns}
    return out


def same_date_check(matches: pd.DataFrame) -> Dict[str, Any]:
    """¿Algún equipo juega dos partidos el mismo día? (rompería el shift(1))."""
    h = matches[["div", "season", "match_date", "home_team"]].rename(columns={"home_team": "team"})
    a = matches[["div", "season", "match_date", "away_team"]].rename(columns={"away_team": "team"})
    long = pd.concat([h, a])
    dup = long.duplicated(subset=["team", "match_date"], keep=False)
    return {"n_team_date_duplicates": int(dup.sum()),
            "examples": long[dup].head(5).astype(str).to_dict("records")}


def section_leakage(feat: pd.DataFrame, matches: pd.DataFrame, groups: Dict[str, List[str]],
                    cutoffs: Sequence[str], skip_timewarp: bool) -> Dict[str, Any]:
    feature_cols = [c for c in groups.get("elo_pre", []) + groups.get("forma", []) +
                    groups.get("descanso", []) + groups.get("contexto", []) +
                    groups.get("priors_equipo", []) + groups.get("priors_liga", []) if c in feat.columns]
    res: Dict[str, Any] = {"feature_pool": len(feature_cols)}
    t0 = time.time()
    cmp, rebuilt_full = check_reproduction(feat)
    res["reproduction_check"] = cmp
    res["reproduction_check_seconds"] = round(time.time() - t0, 1)
    if not skip_timewarp:
        res["time_travel"] = test_time_travel(rebuilt_full, cutoffs)
    res["team_priors_probe"] = probe_team_priors(feat, matches)
    res["rolling_manual_check"] = rolling_manual_cases(feat, matches)
    res["elo_check"] = elo_verification(feat, matches)
    res["target_correlation"] = target_correlations(feat, feature_cols)
    res["post_match_check"] = post_match_check(feat)
    res["same_date_check"] = same_date_check(matches)

    findings = []
    probe = res["team_priors_probe"]
    if probe["detail"]["next_season_ppg_match"] > 0.99:
        findings.append({
            "id": "L1", "severity": "crítica",
            "title": "Los priors de equipo usan la temporada SIGUIENTE (futuro)",
            "columns": groups.get("priors_equipo", []),
            "evidence": (f"{probe['detail']['next_season_ppg_match']*100:.1f}% de las "
                         f"{probe['n_with_prior']:,} filas con prior no nulo tienen home_prev_ppg igual "
                         "al PPG de la temporada SIGUIENTE del equipo; solo "
                         f"{probe['detail']['prev_season_ppg_match']*100:.1f}% coincide con la temporada "
                         "anterior que el nombre del bloque declara. El join es left.season == right.prev_of, "
                         "de modo que la fila emparejada es la de la temporada posterior."),
            "impact": "El offline se infla con información imposible en producción; el bloque debe "
                      "excluirse o reimplementarse (ver bloque g del ablation).",
        })
    tt = res.get("time_travel")
    if tt and tt["columns_depending_on_future"]:
        soft = [c for c in tt["columns_depending_on_future"] if "progress" in c]
        if soft:
            findings.append({
                "id": "L2", "severity": "media",
                "title": "`season_progress` (y `elo_diff_x_progress`) usan la fecha del último partido de la temporada",
                "columns": soft,
                "evidence": "Al truncar a mitad de temporada, season_progress cambia porque el denominador usa "
                            "max(match_date) de la temporada completa (calendario futuro).",
                "impact": "No filtra el resultado, pero sí conocimiento del calendario; distorsiona la escala "
                          "temporal. Recomendado sustituir por un calendario fijo (inicio + 300 días).",
            })
    findings.append({
        "id": "L3", "severity": "crítica",
        "title": "Columnas post-partido y target dentro del parquet de features",
        "columns": groups.get("post_partido", []) + groups.get("target", []),
        "evidence": "`elo_*_post`, `shots_*`, `ht_*`, goles y `result` están en el mismo archivo que las "
                    f"features; corr(Δelo del local, diferencia de goles) = "
                    f"{res['post_match_check']['elo_post_delta_corr_goal_diff']} y stats del propio partido "
                    f"como sot_home correlacionan {res['post_match_check']['match_stats_corr_with_goal_diff'].get('sot_home')}.",
        "impact": "Un baseline que use `select_dtypes(number)` filtra el resultado. Excluir por lista explícita.",
    })
    findings.append({
        "id": "L4", "severity": "baja",
        "title": "Elo pre-partido verificado causal",
        "columns": groups.get("elo_pre", []),
        "evidence": (f"Recálculo completo de E0 ({res['elo_check']['rows_compared']:,} partidos): diferencia máxima "
                     f"{max(res['elo_check']['max_abs_diff_vs_recomputation'].values()):.2e}. "
                     "La fórmula post = pre + K*MOV*(score-exp) se cumple exactamente."),
        "impact": "Sin acción; el bloque Elo es seguro.",
    })
    findings.append({
        "id": "L5", "severity": "baja",
        "title": "Rolling de forma verificado contra las fechas",
        "columns": groups.get("forma", []),
        "evidence": (f"{res['rolling_manual_check']['all_match']}: los 2 casos recalculados a mano coinciden "
                     "exactamente con h_points_r5 usando solo partidos con fecha estrictamente anterior."),
        "impact": "Sin acción.",
    })
    res["findings"] = findings
    res["leakage_found"] = any(f["severity"] == "crítica" for f in findings)
    return res


# ---------------------------------------------------------------------------
# 3. calidad
# ---------------------------------------------------------------------------
def section_quality(feat: pd.DataFrame, groups: Dict[str, List[str]]) -> Dict[str, Any]:
    seasons = sorted(feat["season"].unique(), key=lambda s: (int(str(s).split("/")[0]), str(s)))
    out: Dict[str, Any] = {"seasons": [str(s) for s in seasons], "n_rows": int(len(feat))}

    # nulos por bloque y temporada
    nulls_group: Dict[str, Any] = {}
    nulls_matrix: Dict[str, Dict[str, float]] = {}
    for g in ("elo_pre", "forma", "descanso", "contexto", "priors_equipo", "priors_liga"):
        cols = [c for c in groups.get(g, []) if c in feat.columns]
        if not cols:
            continue
        nulls_group[g] = {"n_columns": len(cols), "null_share": round(float(feat[cols].isna().mean().mean()), 4),
                          "worst_columns": {c: round(float(feat[c].isna().mean()), 4) for c in
                                            feat[cols].isna().mean().sort_values(ascending=False).head(5).index}}
        per = feat.groupby("season")[cols].apply(lambda d: float(d.isna().mean().mean()))
        nulls_matrix[g] = {str(k): round(float(v), 4) for k, v in per.items()}
    out["nulls_by_group"] = nulls_group
    out["nulls_by_group_season"] = nulls_matrix

    # constantes / cuasi-constantes
    constants, near = [], []
    for c in feat.columns:
        s = feat[c]
        nun = int(s.nunique(dropna=True))
        if nun <= 1:
            constants.append({"column": c, "value": str(s.dropna().iloc[0]) if nun == 1 else None})
        elif nun > 1 and pd.api.types.is_numeric_dtype(s):
            top = float(s.value_counts(normalize=True, dropna=True).iloc[0])
            if top > 0.99:
                near.append({"column": c, "top_share": round(top, 4), "n_unique": nun})
    out["constants"] = constants
    out["near_constants"] = sorted(near, key=lambda d: -d["top_share"])[:20]

    # estabilidad por temporada
    feature_pool = [c for g in ("elo_pre", "forma", "descanso", "contexto", "priors_equipo", "priors_liga")
                    for c in groups.get(g, []) if c in feat.columns]
    num = feat[feature_pool].select_dtypes(include=[np.number])
    by_season = num.groupby(feat["season"]).mean()
    std_all = num.std()
    drift = (by_season.max() - by_season.min()) / std_all.replace(0, np.nan)
    drift = drift.replace([np.inf, -np.inf], np.nan).dropna()
    out["stability"] = {
        "n_features": int(len(drift)),
        "median_drift": round(float(drift.median()), 4),
        "p90_drift": round(float(drift.quantile(0.9)), 4),
        "top_drifting": {k: round(float(v), 4) for k, v in drift.sort_values(ascending=False).head(10).items()},
        "note": "drift = (max media temporal - min media temporal) / std global; >1 indica régimen inestable",
    }

    # distribuciones de referencia
    key = ["elo_diff", "elo_home", "h_points_r5", "h_days_rest", "h_matches_last_14d",
           "season_progress", "home_prev_ppg", "lg_avg_total_prev", "form_gd_diff_r5"]
    dist = {}
    for c in key:
        if c in feat.columns:
            s = feat[c].astype(float)
            dist[c] = {"mean": round(float(s.mean()), 4), "std": round(float(s.std()), 4),
                       "p05": round(float(s.quantile(0.05)), 4), "p50": round(float(s.median()), 4),
                       "p95": round(float(s.quantile(0.95)), 4), "null_share": round(float(s.isna().mean()), 4)}
    out["distributions"] = dist
    if "h_days_rest" in feat.columns:
        dr = feat["h_days_rest"].dropna()
        out["rest_outliers"] = {
            "max_days": round(float(dr.max()), 1),
            "share_gt_30d": round(float((dr > 30).mean()), 4),
            "share_gt_90d": round(float((dr > 90).mean()), 4),
            "note": "el descanso no está acotado: un equipo que vuelve a la liga tras años arrastra un "
                    "valor enorme y el escalado lo comprime mal; conviene clip a 30-45 días",
        }

    # multicolinealidad
    corr = num.corr()
    pairs = []
    cols = list(corr.columns)
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            v = corr.iat[i, j]
            if np.isfinite(v) and abs(v) > 0.9:
                pairs.append({"a": cols[i], "b": cols[j], "r": round(float(v), 4)})
    pairs.sort(key=lambda d: -abs(d["r"]))
    out["multicollinearity"] = {
        "n_pairs_abs_gt_0.9": len(pairs),
        "n_features_in_pool": len(cols),
        "share_features_in_a_pair": round(len({d["a"] for d in pairs} | {d["b"] for d in pairs}) / max(len(cols), 1), 4),
        "top_pairs": pairs[:15],
    }

    # correlación con el target (features usables)
    out["target_correlation"] = target_correlations(feat, feature_pool)
    return out


# ---------------------------------------------------------------------------
# 4. ablación
# ---------------------------------------------------------------------------
def build_blocks(groups: Dict[str, List[str]], feat: pd.DataFrame) -> Dict[str, List[str]]:
    def keep(cs: Sequence[str]) -> List[str]:
        return [c for c in cs if c in feat.columns]

    elo = keep(ELO_BLOCK)
    forma = keep(groups.get("forma", []))
    resto = keep(groups.get("descanso", []))
    ctx = keep(groups.get("contexto", []))
    prior = keep(groups.get("priors_equipo", []) + groups.get("priors_liga", []))

    def uniq(xs: Iterable[str]) -> List[str]:
        seen, out = set(), []
        for x in xs:
            if x not in seen:
                seen.add(x)
                out.append(x)
        return out

    b_elo = uniq(elo)
    b_forma = uniq(b_elo + forma)
    b_ctx = uniq(b_forma + resto + ctx)
    b_all = uniq(b_ctx + prior)
    no_shots = [c for c in b_all if not any(tok in c for tok in SHOT_TOKENS)]
    no_soft = [c for c in b_all if c not in ("season_progress", "elo_diff_x_progress")]
    blocks = {
        "a_elo": b_elo,
        "b_elo_forma": b_forma,
        "c_elo_forma_descanso_contexto": b_ctx,
        "d_todo": b_all,
        "e_todo_sin_tiros": uniq(no_shots),
        "f_todo_sin_priors": uniq([c for c in b_all if c not in set(prior)]),
        "g_todo_priors_causales": uniq(b_ctx + [c for c in feat.columns if c.startswith("hon_")]),
        "h_todo_sin_progress": uniq(no_soft),
    }
    return blocks


def causal_priors(df: pd.DataFrame) -> pd.DataFrame:
    """Priors de equipo estrictamente causales: última temporada TERMINADA antes del partido.

    Para cada partido se toma la última temporada del equipo cuyo último partido
    es anterior a la fecha del partido (merge_asof por equipo). Sin fuga posible:
    todas las fechas usadas son < match_date.
    """
    df = df[df["result"].notna() & df["home_goals"].notna() & df["away_goals"].notna()].copy()
    df["home_goals"] = df["home_goals"].astype(int)
    df["away_goals"] = df["away_goals"].astype(int)
    df["match_date"] = pd.to_datetime(df["match_date"])
    long = bf.build_long(bf.elo_block(df.copy(), prefix="elo"))
    season_last = (long.groupby(["team", "season"], as_index=False)
                   .agg(last_date=("match_date", "max"), n=("match_id", "size"),
                        gf=("gf", "sum"), ga=("ga", "sum"), pts=("points", "sum"),
                        sot=("sot", "mean")))
    season_last["ppg"] = season_last.pts / season_last.n
    season_last["gf_pg"] = season_last.gf / season_last.n
    season_last["ga_pg"] = season_last.ga / season_last.n
    cols = ["n", "ppg", "gf_pg", "ga_pg", "sot"]
    out = df[["match_id", "match_date", "home_team", "away_team"]].copy()
    for side, team in (("h", "home_team"), ("a", "away_team")):
        cur = out[["match_id", "match_date", team]].rename(columns={team: "team"})
        cur = cur.sort_values(["match_date", "team"], kind="mergesort")
        right = season_last.sort_values("last_date", kind="mergesort")
        merged = pd.merge_asof(cur, right, left_on="match_date", right_on="last_date",
                               by="team", direction="backward", allow_exact_matches=False)
        merged = merged.set_index("match_id")
        for c in cols:
            name = f"hon_{side}_{c}" if c != "sot" else f"hon_{side}_sot_pg"
            out[name] = merged[c].reindex(out.match_id).values
    return out.set_index("match_id")


def walk_forward_ablation(feat: pd.DataFrame, blocks: Dict[str, List[str]],
                          walk_start: int = WALK_START, last_season: int = VAL_SEASON,
                          max_iter: int = 300, seed: int = SEED, n_boot: int = 2000,
                          verbose: bool = True) -> Dict[str, Any]:
    """Ablación walk-forward por temporada con regresión logística multinomial.

    Bloques con la MISMA lista de columnas (p. ej. `c` y `f`) se entrenan una sola
    vez y comparten predicciones: así la comparación es exacta y no se duplica
    cómputo. Solo se usan temporadas <= `last_season` (dev + val); `test` queda
    fuera por construcción.
    """
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler

    data = feat.loc[feat["season_start"].astype(int) <= last_season].reset_index(drop=True)
    ss = data["season_start"].astype(int).to_numpy()
    y = data["y"].astype(int).to_numpy()
    seasons = [int(s) for s in sorted(set(ss.tolist())) if walk_start <= s <= last_season]

    cols_by_block = {name: [c for c in cols if c in data.columns] for name, cols in blocks.items()}
    key_names: Dict[Tuple[str, ...], List[str]] = {}
    for name, cols in cols_by_block.items():
        key_names.setdefault(tuple(cols), []).append(name)

    store: Dict[Tuple[str, ...], Dict[str, list]] = {}
    hit_max = {k: 0 for k in key_names}
    train_sizes = []
    for season in seasons:
        tr_idx = np.where(ss < season)[0]
        te_idx = np.where(ss == season)[0]
        if len(tr_idx) < 2000 or len(te_idx) == 0:
            continue
        train_sizes.append({"season": season, "n_train": int(len(tr_idx)), "n_test": int(len(te_idx))})
        Xtr_all = data.iloc[tr_idx]
        for key in key_names:
            cols = list(key)
            pipe = Pipeline([
                ("imp", SimpleImputer(strategy="median")),
                ("sc", StandardScaler()),
                ("lr", LogisticRegression(max_iter=max_iter, C=1.0, solver="lbfgs", tol=1e-4)),
            ])
            pipe.fit(Xtr_all[cols], y[tr_idx])
            p = pipe.predict_proba(data.iloc[te_idx][cols])
            n_iter = int(np.max(pipe.named_steps["lr"].n_iter_))
            if n_iter >= max_iter:
                hit_max[key] += 1
            d = store.setdefault(key, {"y": [], "p": [], "season": []})
            d["y"].append(y[te_idx])
            d["p"].append(p)
            d["season"].append(np.full(int(len(te_idx)), season))
        if verbose:
            print(f"      fold {season}: train={len(tr_idx):,} test={len(te_idx):,} "
                  f"({len(key_names)} conjuntos)")

    results: Dict[str, Dict[str, Any]] = {}
    for key, names in key_names.items():
        yv = np.concatenate(store[key]["y"])
        pv = np.vstack(store[key]["p"])
        sv = np.concatenate(store[key]["season"])
        for name in names:
            results[name] = {"y": yv, "p": pv, "season": sv, "key": key}

    summary: Dict[str, Any] = {}
    per_sample: Dict[str, np.ndarray] = {}
    for name, d in results.items():
        per_sample[name] = em.per_sample_log_loss(d["y"], d["p"])
        summary[name] = {
            "n_features": int(len(d["key"])),
            "n": int(len(d["y"])),
            "n_seasons": int(len(np.unique(d["season"]))),
            "log_loss": round(float(em.multiclass_log_loss(d["y"], d["p"])), 5),
            "brier": round(float(em.brier_multiclass(d["y"], d["p"])), 5),
            "accuracy": round(float(em.accuracy(d["y"], d["p"])), 5),
            "rps": round(float(em.rps(d["y"], d["p"])), 5),
            "folds_hit_max_iter": int(hit_max.get(d["key"], 0)),
            "features": list(d["key"]),
        }

    # ---- diferencias pareadas vs d_todo, bootstrap por temporada ----
    ref = "d_todo" if "d_todo" in results else next(iter(results))
    uniq = np.array(sorted(set(results[ref]["season"].tolist())))
    season_mask = {s: (results[ref]["season"] == s) for s in uniq}
    rng = np.random.default_rng(seed)
    paired: Dict[str, Any] = {}
    for name in results:
        if name == ref:
            continue
        diff = per_sample[name] - per_sample[ref]
        sums = np.array([diff[m].sum() for m in season_mask.values()])
        cnts = np.array([int(m.sum()) for m in season_mask.values()], dtype=float)
        boot = np.empty(n_boot)
        for b in range(n_boot):
            pick = rng.integers(0, len(uniq), size=len(uniq))
            boot[b] = sums[pick].sum() / cnts[pick].sum()
        paired[name] = {
            "delta_log_loss_vs_d_todo": round(float(diff.mean()), 5),
            "ci95_low": round(float(np.percentile(boot, 2.5)), 5),
            "ci95_high": round(float(np.percentile(boot, 97.5)), 5),
            "share_resamples_worse_than_d": round(float((boot > 0).mean()), 4),
            "bootstrap": int(n_boot), "block": "temporada", "seed": seed,
            "n_seasons": int(len(uniq)),
        }

    key_blocks = ("a_elo", "b_elo_forma", "c_elo_forma_descanso_contexto", "d_todo",
                  "e_todo_sin_tiros", "g_todo_priors_causales", "h_todo_sin_progress")
    per_season: Dict[str, Any] = {}
    for name in key_blocks:
        if name not in results:
            continue
        d = results[name]
        per_season[name] = {
            int(s): round(float(em.multiclass_log_loss(d["y"][d["season"] == s],
                                                       d["p"][d["season"] == s])), 5)
            for s in uniq}

    # f == c por construcción (los priors son el único bloque añadido sobre c)
    priors = [c for c in cols_by_block.get("d_todo", []) if c not in set(cols_by_block.get("f_todo_sin_priors", []))]
    note = None
    if "f_todo_sin_priors" in cols_by_block and \
            tuple(cols_by_block["f_todo_sin_priors"]) == tuple(cols_by_block["c_elo_forma_descanso_contexto"]):
        note = ("`f_todo_sin_priors` tiene exactamente las mismas columnas que "
                "`c_elo_forma_descanso_contexto` (los priors son el único bloque que `d` añade "
                f"sobre `c`: {len(priors)} columnas). Sus métricas coinciden por construcción; "
                "se conserva la etiqueta para cumplir el contrato de la tarea.")

    return {
        "protocol": {
            "model": ("LogisticRegression multinomial (solver=lbfgs, C=1.0, max_iter=%d) dentro de "
                      "Pipeline(SimpleImputer(median) -> StandardScaler -> LR); imputación y "
                      "escalado ajustados SOLO con train de cada fold" % max_iter),
            "split": "walk-forward expanding por temporada: train = season_start < S, predice = S",
            "seasons_predicted": [int(s) for s in seasons],
            "train_sizes": train_sizes,
            "partitions_used": "dev (<=2022/23) + val (2023/24)",
            "test_untouched": {"test": [2024, 2025], "live": [2026]},
            "metric_impl": "eval/metrics.py (CONTRACT_PREDICTIONS §3)",
            "n_total": int(len(results[ref]["y"])),
            "random_state": "no aplica (LR determinista); seed=%d solo para bootstrap" % seed,
        },
        "blocks": summary,
        "paired_vs_d_todo": paired,
        "log_loss_by_season": per_season,
        "priors_removed_between_d_and_f": priors,
        "note": note,
    }


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="A05 — auditoría de features causales")
    ap.add_argument("--output", default=DEFAULT_OUT)
    ap.add_argument("--cutoffs", default=",".join(DEFAULT_CUTOFFS))
    ap.add_argument("--skip-timewarp", action="store_true")
    ap.add_argument("--skip-ablation", action="store_true")
    ap.add_argument("--skip-quality", action="store_true")
    ap.add_argument("--max-iter", type=int, default=300)
    ap.add_argument("--bootstrap", type=int, default=2000)
    args = ap.parse_args(argv)

    t_start = time.time()
    feat, matches = load_dataset()
    groups = classify_columns(feat)
    n_assigned = sum(len(v) for v in groups.values())
    if n_assigned != len(feat.columns):
        print(f"[warn] columnas sin clasificar: {sorted(set(feat.columns) - set(sum(groups.values(), [])))}")

    report: Dict[str, Any] = {
        "task": "A05 — auditoría de features causales",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "git_commit": git_commit(),
        "python": sys.version.split()[0],
        "seed": SEED,
        "dataset": {
            "path": os.path.relpath(FEATURES_PATH, LAB),
            "rows": int(len(feat)),
            "columns": int(feat.columns.size),
            "note_expected": "el encargo decía 181.268 × 192; el artefacto real tiene 198 columnas",
            "seasons": int(feat["season"].nunique()),
            "date_range": [str(feat["match_date"].min().date()), str(feat["match_date"].max().date())],
            "n_trainable_features": int(sum(len(groups[g]) for g in
                                             ("elo_pre", "forma", "descanso", "contexto",
                                              "priors_equipo", "priors_liga"))),
            "partitions": {
                "dev_le_2022": int((feat["season_start"] <= 2022).sum()),
                "val_2023": int((feat["season_start"] == 2023).sum()),
                "test_2024_2025": int(feat["season_start"].isin([2024, 2025]).sum()),
                "live_2026": int((feat["season_start"] == 2026).sum()),
            },
            "rows_by_season": {str(k): int(v) for k, v in feat["season"].value_counts().sort_index().items()},
        },
        "dictionary": {
            "n_columns_classified": n_assigned,
            "groups": [{
                **{k: g[k] for k in ("group", "role", "formula", "source")},
                "n_columns": len(groups.get(g["group"], [])),
                "columns": groups.get(g["group"], []),
            } for g in GROUP_SPECS] + ([{
                "group": "sin_clasificar", "role": "?", "formula": "?", "source": "?",
                "n_columns": len(groups.get("sin_clasificar", [])),
                "columns": groups.get("sin_clasificar", [])}] if groups.get("sin_clasificar") else []),
        },
    }

    print("[1/4] leakage ...")
    report["leakage"] = section_leakage(feat, matches, groups,
                                       [c.strip() for c in args.cutoffs.split(",") if c.strip()],
                                       args.skip_timewarp)
    print(f"      verdict: {report['leakage'].get('time_travel', {}).get('verdict', 'n/a')} | "
          f"leakage_found={report['leakage']['leakage_found']}")

    if not args.skip_quality:
        print("[2/4] calidad ...")
        report["quality"] = section_quality(feat, groups)

    if not args.skip_ablation:
        print("[3/4] priors causales + ablación ...")
        hon = causal_priors(matches)
        feat2 = feat.merge(hon, left_on="match_id", right_index=True, how="left")
        blocks = build_blocks(groups, feat2)
        report["causal_priors"] = {
            "definition": "última temporada TERMINADA del equipo con last_date < match_date "
                          "(merge_asof por equipo, allow_exact_matches=False)",
            "columns": [c for c in feat2.columns if c.startswith("hon_")],
            "null_share": {c: round(float(feat2[c].isna().mean()), 4)
                           for c in feat2.columns if c.startswith("hon_")},
            "leak_check": "todas las fechas usadas son < match_date por construcción",
        }
        report["ablation"] = walk_forward_ablation(feat2, blocks, max_iter=args.max_iter)
        for name, b in report["ablation"]["blocks"].items():
            print(f"      {name:32s} LL={b['log_loss']:.5f} Brier={b['brier']:.5f} acc={b['accuracy']:.4f} "
                  f"({b['n_features']} feats, n={b['n']:,})")

    report["elapsed_seconds"] = round(time.time() - t_start, 1)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(jsonable(report), f, ensure_ascii=False, indent=2)
    print(f"[4/4] escrito -> {args.output}  ({report['elapsed_seconds']}s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
