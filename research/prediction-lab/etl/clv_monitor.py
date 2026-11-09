#!/usr/bin/env python3
"""Monitor de CLV (closing line value) sobre los snapshots de `capture_odds.py`.

Idea
----
CLV mide si el precio que capturamos batió al precio de cierre. Para cada resultado
(local/empate/visitante) comparamos la probabilidad implícita **sin margen** en la
captura contra la del cierre:

    CLV_log = log(p_close) - log(p_captured)

CLV_log > 0 significa que el cierre nos dio la razón: el mercado se movió hacia
nuestra probabilidad. Es la única señal de calidad de una estrategia que se puede
medir sin esperar al resultado, y por eso importa tanto tener el instante de captura.

De-vig
------
Las cuotas crudas incluyen margen. Se calculan dos variantes:
  * proporcional: p_i = (1/o_i) / Σ_j (1/o_j)      (reparte el margen en proporción)
  * power:        p_i = (1/o_i)^k con Σ_j (1/o_i)^k = 1, k resuelto por bisección
La power respeta mejor la asimetría favorito-longshot; la proporcional es el
estándar de comparación. Ambas se reportan.

Unión con el histórico
----------------------
Clave (div, fecha, home_slug, away_slug) usando `slug`/`canonical_team` de
`etl/build_matches.py` (importado sin ejecutar su main). Solo se consideran
partidos con cuota de cierre y resultado en `data/processed/matches.parquet`.

Validez temporal
----------------
`fixtures.csv` da fecha y hora **local** del país de la liga, sin zona horaria.
La captura es UTC. Para no contar como "pre-partido" una captura posterior al
saque inicial se exige `kickoff_local - captured_at_utc > --tz-safety` (3 h por
defecto, cota superior del desfase UTC de las ligas cubiertas). Los partidos dentro
de esa banda se marcan `ambiguous` y se excluyen del CLV.

Uso
---
    ./.venv/bin/python etl/clv_monitor.py
    ./.venv/bin/python etl/clv_monitor.py --snapshot data/snapshots/odds_20261109T100153Z.csv
    ./.venv/bin/python etl/clv_monitor.py --snapshots-dir /tmp/x --out /tmp/clv.json
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SNAPSHOTS_DIR = os.path.join(ROOT, "data", "snapshots")
DEFAULT_MATCHES = os.path.join(ROOT, "data", "processed", "matches.parquet")
DEFAULT_OUT = os.path.join(ROOT, "data", "snapshots", "clv_report.json")

SCHEMA_VERSION = 1
TZ_SAFETY_HOURS = 3.0
OUTCOMES = ("H", "D", "A")
MIN_ODDS = 1.01
MAX_ODDS = 1000.0

# prefix en fixtures.csv -> sufijo en matches.parquet
# `matches=None` = la casa existe en el snapshot pero no hay serie de cierre
# comparable en el histórico, así que no entra en el CLV por casa.
BOOKS: dict[str, dict[str, Any]] = {
    "b365": {"prefix": "B365", "matches": "b365", "label": "Bet365"},
    "avg": {"prefix": "Avg", "matches": "avg", "label": "Avg (consenso)"},
    "max": {"prefix": "Max", "matches": "max", "label": "Max (mejor precio)"},
    "bfe": {"prefix": "BFE", "matches": "bfe", "label": "Betfair Exchange"},
    "pp": {"prefix": "PP", "matches": "ps", "label": "Pinnacle (PP≈PS, supuesto)"},
    "bfd": {"prefix": "BFD", "matches": None, "label": "BFD (sin cierre comparable)"},
    "bv": {"prefix": "BV", "matches": None, "label": "BetVictor (sin cierre)"},
    "bw": {"prefix": "BW", "matches": None, "label": "Bet&Win (sin cierre)"},
    "skb": {"prefix": "SKB", "matches": None, "label": "SKB (sin cierre)"},
}


# --------------------------------------------------------------------------- #
# Helpers de nombres de equipo
# --------------------------------------------------------------------------- #
def load_slug_helpers() -> tuple[Any, Any]:
    """Importa slug/canonical_team de build_matches sin ejecutar su main.

    Si el módulo no estuviera disponible se usa una copia local idéntica para no
    romper el monitor (se avisa por stderr).
    """
    etl_dir = os.path.join(ROOT, "etl")
    if etl_dir not in sys.path:
        sys.path.insert(0, etl_dir)
    try:
        import build_matches as bm  # noqa: PLC0415
        return bm.slug, bm.canonical_team
    except Exception as exc:  # pragma: no cover - solo si el módulo cambia de sitio
        import re
        import unicodedata

        print(f"[clv] aviso: no se pudo importar build_matches ({exc}); uso slug local",
              file=sys.stderr)

        def slug(value: str) -> str:
            s = unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode()
            return re.sub(r"[^a-zA-Z0-9]+", "_", s).strip("_").lower()

        return slug, lambda div, name: name


# --------------------------------------------------------------------------- #
# De-vig
# --------------------------------------------------------------------------- #
def devig_proportional(odds: np.ndarray) -> np.ndarray | None:
    inv = 1.0 / odds
    total = inv.sum()
    if not np.isfinite(total) or total <= 0:
        return None
    return inv / total


def devig_power(odds: np.ndarray, tol: float = 1e-12, max_iter: int = 200) -> tuple[np.ndarray | None, float | None]:
    """Resuelve k en Σ (1/o_i)^k = 1 por bisección (f decreciente en k)."""
    inv = 1.0 / odds
    lo, hi = 0.05, 8.0
    f = lambda k: float(np.sum(inv ** k)) - 1.0  # noqa: E731
    if f(lo) < 0 or f(hi) > 0:
        return None, None
    for _ in range(max_iter):
        mid = 0.5 * (lo + hi)
        if f(mid) > 0:
            lo = mid
        else:
            hi = mid
        if hi - lo < tol:
            break
    k = 0.5 * (lo + hi)
    probs = inv ** k
    total = probs.sum()
    if not np.isfinite(total) or total <= 0:
        return None, None
    return probs / total, k


def overround(odds: np.ndarray) -> float:
    return float((1.0 / odds).sum() - 1.0)


def valid_triplet(values: list[float]) -> np.ndarray | None:
    try:
        arr = np.asarray(values, dtype=float)
    except (TypeError, ValueError):
        return None
    if arr.shape != (3,) or not np.all(np.isfinite(arr)):
        return None
    if np.any(arr < MIN_ODDS) or np.any(arr > MAX_ODDS):
        return None
    return arr


# --------------------------------------------------------------------------- #
# Carga de snapshots
# --------------------------------------------------------------------------- #
def resolve_snapshot_paths(args: argparse.Namespace) -> list[str]:
    paths: list[str] = []
    for item in args.snapshot or []:
        if os.path.isdir(item):
            paths.extend(sorted(glob.glob(os.path.join(item, "odds_*.csv"))))
        else:
            paths.extend(sorted(glob.glob(item)))
    if not paths:
        paths = sorted(glob.glob(os.path.join(args.snapshots_dir, "odds_*.csv")))
    return [p for p in dict.fromkeys(paths) if os.path.isfile(p)]


def load_snapshots(paths: list[str], slug, canonical_team,
                   tz_safety: float) -> tuple[pd.DataFrame, list[dict[str, Any]]]:
    frames: list[pd.DataFrame] = []
    meta: list[dict[str, Any]] = []
    for path in paths:
        df = pd.read_csv(path, dtype=str, keep_default_na=False, na_values=[""])
        if "captured_at_utc" not in df.columns:
            print(f"[clv] aviso: {os.path.basename(path)} sin captured_at_utc; se omite",
                  file=sys.stderr)
            continue
        captured = pd.to_datetime(df["captured_at_utc"], utc=True, errors="coerce")
        if captured.isna().all():
            print(f"[clv] aviso: {os.path.basename(path)} con captured_at_utc ilegible; se omite",
                  file=sys.stderr)
            continue
        date_iso = pd.to_datetime(df["Date"], format="%d/%m/%Y", errors="coerce").dt.strftime("%Y-%m-%d")
        kickoff = pd.to_datetime(
            df["Date"].astype(str).str.strip() + " " + df["Time"].astype(str).str.strip(),
            format="%d/%m/%Y %H:%M", errors="coerce",
        )
        out = pd.DataFrame({
            "snapshot_file": os.path.basename(path),
            "div": df["Div"].str.strip(),
            "date_iso": date_iso,
            "kickoff_local": kickoff,
            "captured_at": captured.dt.tz_convert("UTC").dt.tz_localize(None),
            "home_team": df["HomeTeam"].str.strip(),
            "away_team": df["AwayTeam"].str.strip(),
        })
        out["home_slug"] = [slug(canonical_team(d, n)) for d, n in zip(out["div"], out["home_team"])]
        out["away_slug"] = [slug(canonical_team(d, n)) for d, n in zip(out["div"], out["away_team"])]
        for book, spec in BOOKS.items():
            for outcome, suffix in zip(OUTCOMES, ("H", "D", "A")):
                col = f"{spec['prefix']}{suffix}"
                out[f"{book}_{outcome}"] = pd.to_numeric(df[col], errors="coerce") if col in df.columns else np.nan
        frames.append(out)
        meta.append({
            "file": os.path.basename(path),
            "rows": int(len(out)),
            "captured_at_utc": str(captured.dropna().min())[:19].replace(" ", "T") + "Z",
            "date_min": str(out["date_iso"].min()),
            "date_max": str(out["date_iso"].max()),
            "divisions": int(out["div"].nunique()),
        })

    if not frames:
        return pd.DataFrame(), meta
    snap = pd.concat(frames, ignore_index=True)
    snap = snap.dropna(subset=["date_iso"])
    snap["hours_to_kickoff"] = (snap["kickoff_local"] - snap["captured_at"]).dt.total_seconds() / 3600.0
    snap["kickoff_status"] = np.select(
        [
            snap["kickoff_local"].isna(),
            snap["hours_to_kickoff"] < 0,
            snap["hours_to_kickoff"] <= tz_safety,
        ],
        ["unknown", "post_kickoff", "ambiguous"],
        default="pre_kickoff",
    )
    return snap, meta


# --------------------------------------------------------------------------- #
# Carga del histórico
# --------------------------------------------------------------------------- #
def load_matches(path: str, snap: pd.DataFrame, slug, canonical_team) -> tuple[pd.DataFrame, dict[str, Any]]:
    """Devuelve (partidos de las fechas del snapshot, universo completo de div/equipos).

    El universo se calcula sobre la tabla **completa**: sirve para diagnosticar por qué
    un fixture no empareja (división no ingerida vs equipo desconocido vs sin fila) y
    no debe verse afectado por el filtro de fechas.
    """
    cols = ["div", "match_date", "home_team", "away_team", "result", "has_close_odds"]
    for spec in BOOKS.values():
        if spec["matches"]:
            for outcome in OUTCOMES:
                cols.append(f"odds_close_{spec['matches']}_{outcome.lower()}")
    cols = [c for c in dict.fromkeys(cols)]
    full = pd.read_parquet(path, columns=cols)
    full["date_iso"] = full["match_date"].astype(str)

    cache: dict[tuple[str, str], str] = {}

    def team_slug(div: str, name: str) -> str:
        key = (div, name)
        if key not in cache:
            cache[key] = slug(canonical_team(div, name))
        return cache[key]

    universe = {
        "divisions": set(full["div"].dropna().unique()),
        "teams": {(d, team_slug(d, n)) for d, n in zip(full["div"], full["home_team"])}
                 | {(d, team_slug(d, n)) for d, n in zip(full["div"], full["away_team"])},
    }

    # Solo fechas presentes en los snapshots para el frame de unión.
    wanted = set(snap["date_iso"].dropna().unique())
    matches = full[full["date_iso"].isin(wanted)].copy()
    matches["home_slug"] = [team_slug(d, n) for d, n in zip(matches["div"], matches["home_team"])]
    matches["away_slug"] = [team_slug(d, n) for d, n in zip(matches["div"], matches["away_team"])]
    matches = matches.drop_duplicates(subset=["div", "date_iso", "home_slug", "away_slug"], keep="last")
    return matches, universe


# --------------------------------------------------------------------------- #
# Métricas
# --------------------------------------------------------------------------- #
def summarize(values: pd.Series) -> dict[str, Any]:
    vals = pd.to_numeric(values, errors="coerce").dropna()
    if vals.empty:
        return {"n_obs": 0, "mean": None, "median": None, "std": None,
                "pct_positive": None, "min": None, "max": None}
    return {
        "n_obs": int(len(vals)),
        "mean": float(vals.mean()),
        "median": float(vals.median()),
        "std": float(vals.std(ddof=1)) if len(vals) > 1 else 0.0,
        "pct_positive": float((vals > 0).mean()),
        "min": float(vals.min()),
        "max": float(vals.max()),
    }


def build_clv_observations(joined: pd.DataFrame) -> pd.DataFrame:
    """Genera una fila por (snapshot, partido, casa, método, resultado) con CLV."""
    rows: list[dict[str, Any]] = []
    usable = joined[joined["kickoff_status"] == "pre_kickoff"]
    for _, r in usable.iterrows():
        for book, spec in BOOKS.items():
            if not spec["matches"]:
                continue
            cap = valid_triplet([r.get(f"{book}_{o}") for o in OUTCOMES])
            close = valid_triplet([r.get(f"odds_close_{spec['matches']}_{o.lower()}") for o in OUTCOMES])
            if cap is None or close is None:
                continue
            cap_prop = devig_proportional(cap)
            close_prop = devig_proportional(close)
            cap_pow, cap_k = devig_power(cap)
            close_pow, close_k = devig_power(close)
            if cap_prop is None or close_prop is None:
                continue
            base = {
                "snapshot_file": r["snapshot_file"],
                "div": r["div"],
                "date_iso": r["date_iso"],
                "home_team": r["home_team"],
                "away_team": r["away_team"],
                "book": book,
                "book_label": spec["label"],
                "overround_captured": overround(cap),
                "overround_close": overround(close),
                "power_k_captured": cap_k,
                "power_k_close": close_k,
            }
            for method, pc, pl in (
                ("proportional", cap_prop, close_prop),
                ("power", cap_pow, close_pow),
            ):
                if pc is None or pl is None:
                    continue
                for i, outcome in enumerate(OUTCOMES):
                    rows.append({
                        **base,
                        "method": method,
                        "outcome": outcome,
                        "odds_captured": float(cap[i]),
                        "odds_close": float(close[i]),
                        "p_captured": float(pc[i]),
                        "p_close": float(pl[i]),
                        "clv_log": float(np.log(pl[i]) - np.log(pc[i])),
                    })
    return pd.DataFrame(rows)


def coverage_block(snap: pd.DataFrame, universe: dict[str, Any], joined: pd.DataFrame,
                   obs: pd.DataFrame) -> dict[str, Any]:
    # Universo sobre la tabla completa: el frame `joined` solo tiene las fechas del snapshot.
    known_divisions = universe["divisions"]
    known_teams = universe["teams"]

    matched_keys = set(zip(joined["div"], joined["date_iso"], joined["home_slug"], joined["away_slug"]))
    unmatched = snap[~snap.apply(
        lambda r: (r["div"], r["date_iso"], r["home_slug"], r["away_slug"]) in matched_keys, axis=1
    )] if not snap.empty else snap

    reasons = {"division_not_ingested": 0, "team_slug_unknown": 0, "no_match_row": 0}
    for _, r in unmatched.iterrows():
        if r["div"] not in known_divisions:
            reasons["division_not_ingested"] += 1
        elif (r["div"], r["home_slug"]) not in known_teams or (r["div"], r["away_slug"]) not in known_teams:
            reasons["team_slug_unknown"] += 1
        else:
            reasons["no_match_row"] += 1

    usable = snap[snap["kickoff_status"] == "pre_kickoff"]
    usable_with_close = joined[
        (joined["kickoff_status"] == "pre_kickoff")
        & joined[[f"odds_close_{s['matches']}_{o.lower()}"
                  for s in BOOKS.values() if s["matches"] for o in OUTCOMES]].notna().any(axis=1)
    ] if not joined.empty else joined

    by_div = {}
    for div, grp in snap.groupby("div"):
        sub_join = joined[joined["div"] == div] if not joined.empty else joined
        by_div[div] = {
            "rows": int(len(grp)),
            "pre_kickoff": int((grp["kickoff_status"] == "pre_kickoff").sum()),
            "joined": int(len(sub_join)),
            "with_close_odds": int(sub_join["has_close_odds"].fillna(False).sum()) if not sub_join.empty else 0,
        }

    return {
        "snapshot_rows": int(len(snap)),
        "unique_fixtures": int(snap.drop_duplicates(subset=["div", "date_iso", "home_slug", "away_slug"]).shape[0]),
        "joined_to_matches": int(len(joined)),
        "joined_with_result": int(joined["result"].notna().sum()) if not joined.empty else 0,
        "joined_with_close_odds": int(joined["has_close_odds"].fillna(False).sum()) if not joined.empty else 0,
        "pre_kickoff_rows": int(len(usable)),
        "pre_kickoff_joined": int((joined["kickoff_status"] == "pre_kickoff").sum()) if not joined.empty else 0,
        "pre_kickoff_with_close_odds": int(len(usable_with_close)),
        "clv_observations": int(len(obs)),
        "clv_fixtures_covered": int(obs.drop_duplicates(subset=["div", "date_iso", "home_team", "away_team"]).shape[0]) if not obs.empty else 0,
        "kickoff_status_counts": {k: int(v) for k, v in snap["kickoff_status"].value_counts().items()},
        "unmatched_reasons": reasons,
        "by_division": by_div,
    }


def aggregate(obs: pd.DataFrame) -> dict[str, Any]:
    if obs.empty:
        empty = {"n_obs": 0, "mean": None, "median": None, "std": None,
                 "pct_positive": None, "min": None, "max": None}
        return {
            "status": "no_observations",
            "overall": {"proportional": dict(empty), "power": dict(empty)},
            "by_bookmaker": {}, "by_division": {}, "by_outcome": {},
            "overround": {"captured_mean": None, "close_mean": None},
        }
    out: dict[str, Any] = {
        "status": "ok",
        "overall": {m: summarize(g["clv_log"]) for m, g in obs.groupby("method")},
        "by_bookmaker": {},
        "by_division": {},
        "by_outcome": {},
        "overround": {
            "captured_mean": float(obs["overround_captured"].mean()),
            "close_mean": float(obs["overround_close"].mean()),
            "delta_mean": float((obs["overround_captured"] - obs["overround_close"]).mean()),
        },
    }
    for book, g in obs.groupby("book"):
        out["by_bookmaker"][book] = {
            "label": g["book_label"].iloc[0],
            "proportional": summarize(g[g["method"] == "proportional"]["clv_log"]),
            "power": summarize(g[g["method"] == "power"]["clv_log"]),
        }
    for div, g in obs.groupby("div"):
        out["by_division"][div] = {
            "proportional": summarize(g[g["method"] == "proportional"]["clv_log"]),
        }
    for outcome, g in obs.groupby("outcome"):
        out["by_outcome"][outcome] = {
            "proportional": summarize(g[g["method"] == "proportional"]["clv_log"]),
        }
    return out


def pending_block(snap: pd.DataFrame, joined: pd.DataFrame, obs: pd.DataFrame) -> list[dict[str, Any]]:
    """Watchlist: fixtures capturados antes del saque inicial que aún no tienen cierre.

    Se construye desde el **snapshot**, no desde la unión: un partido futuro todavía no
    está en `matches.parquet` y aun así debe quedar en la lista para medirlo cuando se
    juegue. Si ya está en el histórico, se anota si trae cierre y resultado.
    """
    if snap.empty:
        return []
    joined_idx = {
        (r["div"], r["date_iso"], r["home_team"], r["away_team"]): r
        for _, r in joined.iterrows()
    } if not joined.empty else {}
    done = set()
    if not obs.empty:
        done = set(zip(obs["div"], obs["date_iso"], obs["home_team"], obs["away_team"]))

    pending = []
    for _, r in snap[snap["kickoff_status"] == "pre_kickoff"].iterrows():
        key = (r["div"], r["date_iso"], r["home_team"], r["away_team"])
        if key in done:
            continue
        hit = joined_idx.get(key)
        if hit is not None and bool(hit.get("has_close_odds")):
            continue
        cap = valid_triplet([r.get(f"avg_{o}") for o in OUTCOMES])
        if cap is None:  # Avg es el consenso; si falta, Bet365 como respaldo
            cap = valid_triplet([r.get(f"b365_{o}") for o in OUTCOMES])
        probs = devig_proportional(cap) if cap is not None else None
        pending.append({
            "div": r["div"],
            "date": r["date_iso"],
            "kickoff_local": str(r["kickoff_local"]),
            "home_team": r["home_team"],
            "away_team": r["away_team"],
            "hours_to_kickoff_at_capture": round(float(r["hours_to_kickoff"]), 2),
            "in_historical_table": hit is not None,
            "captured_probs_proportional": None if probs is None else
                {o: round(float(probs[i]), 4) for i, o in enumerate(OUTCOMES)},
            "captured_overround": None if cap is None else round(overround(cap), 4),
            "awaiting": "resultado y cuota de cierre" if hit is not None
                        else "fila en matches.parquet + resultado + cuota de cierre",
        })
    pending.sort(key=lambda x: x["kickoff_local"])
    return pending


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Calcula CLV entre snapshots propios y cuotas de cierre históricas.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--snapshots-dir", default=DEFAULT_SNAPSHOTS_DIR)
    parser.add_argument("--snapshot", action="append", default=None,
                        help="snapshot concreto (ruta o glob); repetible")
    parser.add_argument("--matches", default=DEFAULT_MATCHES)
    parser.add_argument("--out", default=DEFAULT_OUT, help="JSON de salida")
    parser.add_argument("--tz-safety", type=float, default=TZ_SAFETY_HOURS,
                        help="horas mínimas entre captura y saque inicial para considerar la captura pre-partido")
    parser.add_argument("--list", action="store_true", help="lista snapshots y sale")
    args = parser.parse_args(argv)

    paths = resolve_snapshot_paths(args)
    if args.list:
        for p in paths:
            print(f"{os.path.basename(p)}  {os.path.getsize(p):>9,} bytes")
        return 0
    if not paths:
        print(f"[clv] no hay snapshots en {args.snapshots_dir}", file=sys.stderr)
        return 2

    slug, canonical_team = load_slug_helpers()
    snap, snap_meta = load_snapshots(paths, slug, canonical_team, args.tz_safety)
    if snap.empty:
        print("[clv] ningún snapshot utilizable", file=sys.stderr)
        return 2

    print(f"[clv] {len(paths)} snapshot(s) · {len(snap)} filas · "
          f"{snap['date_iso'].min()} → {snap['date_iso'].max()}")

    matches, universe = load_matches(args.matches, snap, slug, canonical_team)
    joined = snap.merge(
        matches, on=["div", "date_iso", "home_slug", "away_slug"],
        how="inner", suffixes=("", "_m"),
    )
    obs = build_clv_observations(joined)
    coverage = coverage_block(snap, universe, joined, obs)
    metrics = aggregate(obs)
    pending = pending_block(snap, joined, obs)

    limitations = [
        "Una sola captura: sin pares apertura→captura→cierre no se puede separar "
        "movimiento de mercado de ruido de una única observación.",
        "El proveedor no publica el instante en que sus cuotas eran válidas; "
        "captured_at_utc es el instante de nuestra petición, no el de validez en la casa.",
        "La hora de saque inicial es local del país de la liga y llega sin zona horaria; "
        f"se exige un margen de {args.tz_safety} h y se excluyen los partidos ambiguos.",
        "fixtures.csv no trae resultados: el CLV solo se puede cerrar cuando el partido "
        "aparezca en matches.parquet con cuota de cierre.",
        "Cobertura de casas desigual: solo B365/Avg/Max/BFE tienen serie de cierre comparable; "
        "PP se asume equivalente a PS (Pinnacle) y BFD/BV/BW/SKB no tienen contraparte.",
        "CLV no es rentabilidad: mide movimiento de precio, no acierto ni yield.",
    ]

    report = {
        "schema_version": SCHEMA_VERSION,
        "generated_at_utc": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "inputs": {
            "snapshots": snap_meta,
            "matches_path": os.path.relpath(args.matches, ROOT),
            "tz_safety_hours": args.tz_safety,
        },
        "definitions": {
            "clv_log": "log(p_close) - log(p_captured) por resultado (H/D/A), con p sin margen",
            "p_captured": "probabilidad implícita de-vig en el instante de la captura",
            "p_close": "probabilidad implícita de-vig de la cuota de cierre del histórico",
            "pct_positive": "fracción de observaciones con clv_log > 0",
            "mean": "media aritmética de clv_log sobre las observaciones agregadas",
            "observation": "(snapshot, partido, casa, método de-vig, resultado)",
            "devig_proportional": "p_i = (1/o_i) / Σ(1/o_j)",
            "devig_power": "p_i = (1/o_i)^k con k tal que Σ(1/o_i)^k = 1",
        },
        "coverage": coverage,
        "clv": metrics,
        "pending": pending,
        "limitations": limitations,
    }

    out_path = os.path.abspath(args.out)
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    tmp = f"{out_path}.tmp.{os.getpid()}"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    os.replace(tmp, out_path)

    # ---------------- impresión legible ----------------
    print("\n== COBERTURA ==")
    print(f"  filas del snapshot ............ {coverage['snapshot_rows']}")
    print(f"  emparejadas con histórico ..... {coverage['joined_to_matches']}")
    print(f"  con resultado ................. {coverage['joined_with_result']}")
    print(f"  con cuota de cierre ........... {coverage['joined_with_close_odds']}")
    print(f"  capturadas antes del saque .... {coverage['pre_kickoff_rows']}")
    print(f"  pre-partido + cierre .......... {coverage['pre_kickoff_with_close_odds']}")
    print(f"  observaciones de CLV .......... {coverage['clv_observations']}")
    print(f"  estado kickoff ................ {coverage['kickoff_status_counts']}")
    print(f"  no emparejadas ................ {coverage['unmatched_reasons']}")

    print("\n== CLV ==")
    if metrics["status"] == "no_observations":
        print("  sin observaciones: ningún partido capturado antes del saque inicial tiene")
        print("  todavía cuota de cierre en matches.parquet. El motor queda listo y el")
        print("  resultado se poblará en cuanto el histórico incorpore esos partidos.")
    else:
        print(f"  {'método':<14}{'n':>5}{'media':>10}{'mediana':>10}{'%>0':>8}")
        for method, s in metrics["overall"].items():
            print(f"  {method:<14}{s['n_obs']:>5}{s['mean']:>10.5f}{s['median']:>10.5f}"
                  f"{(s['pct_positive'] or 0) * 100:>7.1f}%")
        print("\n  por casa:")
        for book, s in metrics["by_bookmaker"].items():
            p = s["proportional"]
            print(f"    {book:<6}{p['n_obs']:>5}  media {p['mean']:>9.5f}  %>0 {(p['pct_positive'] or 0) * 100:>5.1f}%")

    if pending:
        print(f"\n== PENDIENTES ({len(pending)}) ==")
        for item in pending:
            probs = item["captured_probs_proportional"]
            probs_txt = "" if not probs else " ".join(f"{o}={probs[o]:.3f}" for o in OUTCOMES)
            print(f"  {item['date']} {item['div']:<4} {item['home_team']} vs {item['away_team']} "
                  f"({item['hours_to_kickoff_at_capture']:.1f} h) {probs_txt}")

    print(f"\n[clv] escrito {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
