#!/usr/bin/env python3
"""A16 — Validación de release completa (registry + paridad TS + suites Python).

Uso:
    ./.venv/bin/python pipeline/validate_release.py [--skip-tests]

Salida: `registry/release_report.json` + resumen legible. Exit code != 0 si falla un bloque.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO = os.path.dirname(os.path.dirname(ROOT))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
import registry as reg  # noqa: E402


def run(cmd, cwd):
    proc = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    return {
        "cmd": " ".join(cmd),
        "returncode": proc.returncode,
        "stdout_tail": (proc.stdout or "")[-800:],
        "stderr_tail": (proc.stderr or "")[-800:],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-tests", action="store_true")
    args = ap.parse_args()
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "blocks": {},
    }
    ok = True

    # 1. Registro y artefactos
    data = reg.load_registry(reg.DEFAULT_REGISTRY)
    reg_ok = True
    for m in data["models"]:
        code = reg.verify(argparse.Namespace(registry=reg.DEFAULT_REGISTRY, model_id=m["model_id"]))
        reg_ok = reg_ok and code == 0
    report["blocks"]["registry"] = {"ok": reg_ok, "models": [m["model_id"] for m in data["models"]]}
    ok = ok and reg_ok

    # 2. Snapshots de paridad
    snaps = [
        "../../src/data/prediction/features_snapshot.json",
        "../../src/data/prediction/nfl_snapshot.json",
        "../../src/data/prediction/fixture_requests.json",
        "../../src/data/prediction/multisport_snapshot.json",
        "../../src/data/prediction/market_v3_snapshot.json",
        "../../src/data/prediction/live_matchday_v3_snapshot.json",
    ]
    snap_ok = all(os.path.exists(os.path.join(ROOT, s)) for s in snaps)
    report["blocks"]["snapshots"] = {"ok": snap_ok, "files": snaps}
    ok = ok and snap_ok

    # 3. Paridad TS
    if not args.skip_tests:
        npx_bin = shutil.which("npx") or "npx"
        py_bin = sys.executable
        ts = run([npx_bin, "vitest", "run", "tests/prediction"], REPO)
        report["blocks"]["ts_parity"] = {"ok": ts["returncode"] == 0, **ts}
        ok = ok and ts["returncode"] == 0

        ev = run([py_bin, "-m", "unittest", "discover", "-s", "eval/tests", "-p", "test_*.py"], ROOT)
        report["blocks"]["eval_tests"] = {"ok": ev["returncode"] == 0, **ev}
        ok = ok and ev["returncode"] == 0

        etl = run([py_bin, "-m", "unittest", "discover", "-s", "etl/tests", "-p", "test_*.py"], ROOT)
        report["blocks"]["etl_tests"] = {"ok": etl["returncode"] == 0, **etl}
        ok = ok and etl["returncode"] == 0

        pyp = run([py_bin, "-m", "unittest", "discover", "-s", "pipeline/tests", "-p", "test_*.py"], ROOT)
        report["blocks"]["registry_tests"] = {"ok": pyp["returncode"] == 0, **pyp}
        ok = ok and pyp["returncode"] == 0

    # 4. Hashes de datos
    hashes = {}
    for rel in ("data/processed/matches.parquet", "data/processed/features.parquet"):
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            hashes[rel] = {"sha256": reg.sha256_file(p), "bytes": os.path.getsize(p)}
    report["blocks"]["data_hashes"] = {"ok": len(hashes) == 2, **hashes}
    ok = ok and len(hashes) == 2

    report["ok"] = ok
    out = os.path.join(ROOT, "registry", "release_report.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=1)
    print(json.dumps({k: v.get("ok") for k, v in report["blocks"].items()}, indent=1))
    print("RELEASE:", "OK" if ok else "FALLO", "->", out)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
