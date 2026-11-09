#!/usr/bin/env python3
"""Selección de candidatos con bootstrap pareado por bloques (solo val 2023/24).

Uso:
    ./.venv/bin/python pipeline/select_candidates.py --artifacts A,B --max-season 2023
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sys

import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from eval.compare import paired_bootstrap_delta  # noqa: E402
from eval.metrics import multiclass_log_loss, rps, brier_multiclass  # noqa: E402

SEED = 20261109
VAL = 2023


def load(artifacts):
    frames = {}
    for art in artifacts:
        art = art if os.path.isabs(art) else os.path.join(ROOT, art)
        for path in glob.glob(os.path.join(art, "pred_*.csv")):
            name = os.path.basename(path)[5:-4]
            df = pd.read_csv(path)
            df = df[df.season.astype(str).str[:4].astype(int) == VAL]
            if len(df) == 0:
                continue
            df = df.set_index("match_id")
            frames[name if name not in frames else f"{name}@{os.path.basename(art)}"] = df
    return frames


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--artifacts", required=True)
    ap.add_argument("--max-season", type=int, default=VAL)
    ap.add_argument("--pairs", default="")
    args = ap.parse_args()
    arts = [a.strip() for a in args.artifacts.split(",") if a.strip()]
    frames = load(arts)
    print(f"modelos con val: {sorted(frames)}")
    table = []
    for name, df in sorted(frames.items()):
        p = df[["p_home", "p_draw", "p_away"]].to_numpy(float)
        y = df.y.to_numpy(int)
        table.append((name, len(df), multiclass_log_loss(y, p), brier_multiclass(y, p), rps(y, p),
                      float(np.mean(p.argmax(1) == y))))
    print(f"{'modelo':42s} {'n':>7s} {'logloss':>9s} {'brier':>8s} {'rps':>8s} {'acc':>7s}")
    for name, n, ll, br, rp, acc in sorted(table, key=lambda x: x[2]):
        print(f"{name:42s} {n:7,d} {ll:9.5f} {br:8.5f} {rp:8.5f} {acc:7.4f}")

    pairs = [tuple(p.split(">")) for p in args.pairs.split(",") if ">" in p]
    if not pairs:
        names = [t[0] for t in sorted(table, key=lambda x: x[2])]
        base = names[0]
        pairs = [(n, base) for n in names[1:4]]
    results = {}
    for a, b in pairs:
        if a not in frames or b not in frames:
            continue
        common = frames[a].index.intersection(frames[b].index)
        if len(common) < 500:
            continue
        ya = frames[a].loc[common, "y"].to_numpy(int)
        pa = frames[a].loc[common, ["p_home", "p_draw", "p_away"]].to_numpy(float)
        pb = frames[b].loc[common, ["p_home", "p_draw", "p_away"]].to_numpy(float)
        blocks = (frames[a].loc[common, "season"].astype(str) + "|" + frames[a].loc[common, "div"]).to_numpy()
        res = paired_bootstrap_delta(ya, pa, pb, blocks=blocks, B=2000, seed=SEED)
        results[f"{a} vs {b}"] = res
        print(f"\n{a} vs {b}: n={len(common):,}")
        print(json.dumps({k: (float(v) if isinstance(v, (int, float, np.floating)) else v)
                          for k, v in res.items()}, indent=1, default=str))
    out = os.path.join(ROOT, "artifacts", "candidate_selection.json")
    with open(out, "w") as f:
        json.dump({"table": [{"model": n, "n": nn, "log_loss": ll, "brier": br, "rps": rp, "accuracy": acc}
                             for n, nn, ll, br, rp, acc in table],
                   "bootstrap": results}, f, indent=1, default=str)
    print(f"\nescrito -> {out}")


if __name__ == "__main__":
    main()
