#!/usr/bin/env python3
"""Ejecuta los cuatro análisis del Motor B en orden reproducible.

Semilla única: ``market_common.SEED = 20261109``. Ningún script toca la
partición ``test``; :func:`market_common.dev_val` aborta si aparece.

Uso::

    ./.venv/bin/python models/b/analysis/run_all.py            # todo
    ./.venv/bin/python models/b/analysis/run_all.py exp07      # solo uno

Salidas en ``models/b/analysis/artifacts/``: JSON + CSV + tablas markdown.
"""
from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

SCRIPTS = {
    "exp08a": ("exp08a_devig.py", "EXP08a — comparación de de-vig"),
    "exp07": ("exp07_market_efficiency.py", "EXP07 — eficiencia, sesgos y Motor A"),
    "exp08b": ("exp08b_odds_classifier.py", "EXP08b — de-vig vs clasificador con cuotas"),
    "exp13": ("exp13_movement.py", "EXP13 — movimiento apertura→cierre"),
}
EXPECTED = [
    "exp08a_devig.json", "exp08a_by_season.csv", "exp08a_by_division.csv",
    "exp08a_bootstrap.csv", "exp08a_reliability.csv", "exp08a_margin.csv",
    "exp08a_tables.md",
    "exp07_market_efficiency.json", "exp07_fav_bands.csv",
    "exp07_efficiency_division.csv", "exp07_efficiency_season.csv", "exp07_tables.md",
    "exp08b_odds_classifier.json", "exp08b_comparisons.csv", "exp08b_tables.md",
    "exp13_movement.json", "exp13_magnitude_by_season.csv",
    "exp13_direction_quintiles.csv", "exp13_tables.md",
]


def main(argv: list[str]) -> int:
    import market_common as K

    K.self_check()  # el bootstrap debe reproducir eval.compare
    wanted = [a for a in argv if a in SCRIPTS] or list(SCRIPTS)
    t0 = time.time()
    for key in wanted:
        script, label = SCRIPTS[key]
        print(f"\n=== {label} ({script}) ===", flush=True)
        start = time.time()
        subprocess.run([sys.executable, str(HERE / script)], check=True)
        print(f"--- {script} OK en {time.time() - start:.1f}s", flush=True)
    missing = [f for f in EXPECTED if not (K.ART / f).exists()]
    print(f"\nTotal: {time.time() - t0:.1f}s · artefactos: "
          f"{len(EXPECTED) - len(missing)}/{len(EXPECTED)}")
    if missing:
        print("FALTAN:", missing)
        return 1
    print("Semilla:", K.SEED, "· particiones usadas: dev + val (test NUNCA)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
