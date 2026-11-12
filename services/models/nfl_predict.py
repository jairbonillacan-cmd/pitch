"""Inferencia con el artefacto del GBM NFL (blend situacional).

Lee `services/models/artifacts/nfl_blend/model.txt` + `metadata.json` y un JSONL de
features pre-partido; escribe probabilidades por partido (local/empate/visita) y la
probabilidad binaria de victoria local.

Uso:
  python services/models/nfl_predict.py --features <features.jsonl> --out <predicciones.jsonl>
  python services/models/nfl_predict.py --features <features.jsonl>  # imprime por stdout
"""
import argparse
import json
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

import lightgbm as lgb

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ARTIFACT = ROOT / "services" / "models" / "artifacts" / "nfl_blend"


def load_artifact(artifact_dir: Path):
    metadata = json.loads((artifact_dir / "metadata.json").read_text(encoding="utf-8"))
    booster = lgb.Booster(model_file=str(artifact_dir / "model.txt"))
    return metadata, booster


def predict(metadata: dict, booster: lgb.Booster, rows: list) -> list:
    features = metadata["features"]
    matrix = []
    for row in rows:
        matrix.append([float("nan") if row.get(name) is None else float(row[name]) for name in features])
    probabilities = booster.predict(matrix)
    output = []
    for row, probs in zip(rows, probabilities, strict=True):
        home, draw, away = (float(probs[0]), float(probs[1]), float(probs[2]))
        output.append(
            {
                "id": row.get("id"),
                "season": row.get("season"),
                "pHome": home,
                "pDraw": draw,
                "pAway": away,
                "pHomeBinary": home / max(home + away, 1e-9),
            }
        )
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--artifact", default=str(DEFAULT_ARTIFACT))
    parser.add_argument("--features", required=True)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    metadata, booster = load_artifact(Path(args.artifact))
    rows = []
    with Path(args.features).open(encoding="utf-8") as handle:
        for line in handle:
            if line.strip():
                rows.append(json.loads(line))
    predictions = predict(metadata, booster, rows)
    body = "\n".join(json.dumps(item, ensure_ascii=False) for item in predictions) + "\n"
    if args.out:
        Path(args.out).write_text(body, encoding="utf-8")
        print(f"[nfl_predict] {len(predictions)} predicciones → {args.out}")
    else:
        sys.stdout.write(body)


if __name__ == "__main__":
    main()
