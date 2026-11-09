#!/usr/bin/env python3
"""A16 — Registro de modelos y validación de artefactos.

Registro JSON versionado (`registry/models.json`) con sha256, métricas y estado
(candidate/deployed/retired). CLI:

    ./.venv/bin/python pipeline/registry.py list
    ./.venv/bin/python pipeline/registry.py register --model-id X --sport football \
        --version 1.0.0 --artifact src/data/prediction/model_motor_a.json \
        --val-log-loss 1.01029 --test-log-loss 1.01802 --status deployed
    ./.venv/bin/python pipeline/registry.py verify --model-id X
    ./.venv/bin/python pipeline/registry.py promote --model-id X --version 1.0.0

Diseño: el registro es la fuente de verdad del release; `verify` recalcula el hash y
valida el esquema. No firma criptográficamente (limitación documentada).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_REGISTRY = os.path.join(ROOT, "registry", "models.json")
SCHEMA_VERSION = 1


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_registry(path: str) -> dict:
    if not os.path.exists(path):
        return {"schema_version": SCHEMA_VERSION, "updated_at": None, "models": []}
    with open(path) as f:
        data = json.load(f)
    if data.get("schema_version") != SCHEMA_VERSION:
        raise SystemExit(f"schema_version no soportada: {data.get('schema_version')}")
    return data


def save_registry(path: str, data: dict) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    data["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f, indent=1, sort_keys=True)
    os.replace(tmp, path)


def validate_artifact(path: str, sport: str) -> dict:
    """Valida esquema mínimo del artefacto y devuelve un resumen."""
    with open(path) as f:
        art = json.load(f)
    if sport == "football":
        needed = ["features", "coef", "intercept", "scaler", "classes", "n_features_base", "div_levels"]
    elif sport == "nfl":
        needed = ["features", "coef", "intercept", "scaler", "classes", "n_features"]
    else:
        raise SystemExit(f"sport no soportado: {sport}")
    missing = [k for k in needed if k not in art]
    if missing:
        raise SystemExit(f"artefacto inválido: faltan {missing}")
    n = len(art["features"])
    if len(art["coef"]) != 3 or len(art["intercept"]) != 3 or len(art["classes"]) != 3:
        raise SystemExit("artefacto inválido: se esperan 3 clases")
    for row in art["coef"]:
        if len(row) != n:
            raise SystemExit("artefacto inválido: coef no coincide con features")
    if sport == "nfl" and art.get("n_features") != n:
        raise SystemExit("artefacto NFL inválido: n_features != features")
    return {"n_features": n, "version": art.get("version"), "created_at": art.get("created_at")}


def find_model(data: dict, model_id: str) -> dict | None:
    for m in data["models"]:
        if m["model_id"] == model_id:
            return m
    return None


def register(args) -> int:
    data = load_registry(args.registry)
    artifact = os.path.abspath(args.artifact)
    if not os.path.exists(artifact):
        raise SystemExit(f"no existe el artefacto: {artifact}")
    summary = validate_artifact(artifact, args.sport)
    sha = sha256_file(artifact)
    entry = find_model(data, args.model_id)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if entry is None:
        entry = {"model_id": args.model_id, "sport": args.sport, "versions": [], "status": "candidate"}
        data["models"].append(entry)
    existing = [v for v in entry["versions"] if v["version"] == args.version]
    if existing:
        if existing[0]["artifact_sha256"] != sha:
            raise SystemExit("la versión ya existe con otro sha256; usa otra versión")
        print(f"{args.model_id}@{args.version} ya registrado (sin cambios)")
        return 0
    entry["versions"].append({
        "version": args.version,
        "artifact_path": os.path.relpath(artifact, ROOT),
        "artifact_sha256": sha,
        "n_features": summary["n_features"],
        "registered_at": now,
        "metrics": {
            "val_log_loss": args.val_log_loss,
            "test_log_loss": args.test_log_loss,
            "metrics_path": args.metrics_path,
        },
        "notes": args.notes,
    })
    entry["status"] = args.status
    entry["updated_at"] = now
    save_registry(args.registry, data)
    print(f"registrado {args.model_id}@{args.version} sha={sha[:12]}… status={args.status}")
    return 0


def verify(args) -> int:
    data = load_registry(args.registry)
    entry = find_model(data, args.model_id)
    if entry is None:
        print(f"ERROR: {args.model_id} no está en el registro")
        return 1
    failures = 0
    for v in entry["versions"]:
        path = os.path.join(ROOT, v["artifact_path"])
        if not os.path.exists(path):
            print(f"FALLO {v['version']}: falta {path}")
            failures += 1
            continue
        sha = sha256_file(path)
        if sha != v["artifact_sha256"]:
            print(f"FALLO {v['version']}: sha256 no coincide")
            failures += 1
            continue
        try:
            validate_artifact(path, entry["sport"])
        except SystemExit as e:
            print(f"FALLO {v['version']}: {e}")
            failures += 1
            continue
        print(f"OK {args.model_id}@{v['version']} sha={sha[:12]}…")
    return 0 if failures == 0 else 1


def promote(args) -> int:
    data = load_registry(args.registry)
    entry = find_model(data, args.model_id)
    if entry is None:
        print(f"ERROR: {args.model_id} no está en el registro")
        return 1
    target = next((v for v in entry["versions"] if v["version"] == args.version), None)
    if target is None:
        print(f"ERROR: versión {args.version} no registrada")
        return 1
    if target["metrics"].get("val_log_loss") is None or target["metrics"].get("test_log_loss") is None:
        print("ERROR: no se puede promover sin métricas val y test")
        return 1
    path = os.path.join(ROOT, target["artifact_path"])
    if not os.path.exists(path) or sha256_file(path) != target["artifact_sha256"]:
        print("ERROR: el artefacto no verifica (hash/archivo)")
        return 1
    entry["status"] = args.to
    entry["deployed_version"] = args.version
    entry["updated_at"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    save_registry(args.registry, data)
    print(f"{args.model_id}@{args.version} promovido a {args.to}")
    return 0


def list_models(args) -> int:
    data = load_registry(args.registry)
    if args.json:
        print(json.dumps(data, indent=1, sort_keys=True))
        return 0
    for m in data["models"]:
        versions = ", ".join(v["version"] for v in m["versions"]) or "-"
        print(f"{m['model_id']:28s} {m['sport']:9s} status={m.get('status','?'):9s} versions=[{versions}]")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--registry", default=DEFAULT_REGISTRY)
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("register")
    r.add_argument("--model-id", required=True)
    r.add_argument("--sport", required=True, choices=["football", "nfl"])
    r.add_argument("--version", required=True)
    r.add_argument("--artifact", required=True)
    r.add_argument("--val-log-loss", type=float)
    r.add_argument("--test-log-loss", type=float)
    r.add_argument("--metrics-path")
    r.add_argument("--status", default="candidate", choices=["candidate", "deployed", "retired"])
    r.add_argument("--notes", default="")
    r.set_defaults(func=register)
    v = sub.add_parser("verify")
    v.add_argument("--model-id", required=True)
    v.set_defaults(func=verify)
    p = sub.add_parser("promote")
    p.add_argument("--model-id", required=True)
    p.add_argument("--version", required=True)
    p.add_argument("--to", default="deployed", choices=["deployed", "retired"])
    p.set_defaults(func=promote)
    ls = sub.add_parser("list")
    ls.add_argument("--json", action="store_true")
    ls.set_defaults(func=list_models)
    args = ap.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
