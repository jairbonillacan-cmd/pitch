"""Build the unified player-week stats derived layer.

Concatenates stats_player_week_{1999..2026}.parquet (111 files) into ONE query-ready
parquet with provenance manifest and row parity assertion:
  data/history/normalized/nfl/player_week_stats.parquet
  data/history/normalized/nfl/build_manifest_player_week.json

Reads only from raw/; writes only to normalized/. Nulls preserved.
"""

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import polars as pl

REPO_ROOT = Path(__file__).resolve().parents[3]
SRC_DIR = REPO_ROOT / "data/history/raw/nflverse/stats_player"
OUT_DIR = REPO_ROOT / "data/history/normalized/nfl"
OUT_PARQUET = OUT_DIR / "player_week_stats.parquet"
OUT_MANIFEST = OUT_DIR / "build_manifest_player_week.json"


def main() -> int:
    files = sorted(SRC_DIR.glob("stats_player_week_*.parquet"))
    if not files:
        raise SystemExit("no stats_player_week files found")

    frames, expected_rows = [], 0
    for path in files:
        frames.append(pl.read_parquet(path))
        expected_rows += frames[-1].height

    table = pl.concat(frames, how="vertical_relaxed").sort(["season", "week", "player_id"])
    if table.height != expected_rows:
        raise SystemExit(f"FALLO de paridad: {table.height} vs esperado {expected_rows}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    table.write_parquet(OUT_PARQUET)

    manifest = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "output": str(OUT_PARQUET.relative_to(REPO_ROOT)),
        "sourceFiles": len(files),
        "sourcePattern": "data/history/raw/nflverse/stats_player/stats_player_week_{1999..2026}.parquet",
        "rows": table.height,
        "cols": table.width,
        "seasonMin": table["season"].min(),
        "seasonMax": table["season"].max(),
        "players": table["player_id"].n_unique(),
        "rowParityCheck": {"expected": expected_rows, "actual": table.height, "ok": True},
        "sources": "nflverse-data stats_player release (CC-BY-4.0)",
        "notes": [
            "Concatenación pura sin transformación de contenido (sort incluido).",
            "Nulos preservados; incluir semanas REG y POST (game_type/columna week distingue).",
            "Regenerar tras refrescar raw/: python -I tools/nfl-data/scripts/build_player_week_stats.py",
        ],
    }
    OUT_MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({k: manifest[k] for k in ("rows", "cols", "seasonMin", "seasonMax", "players")}, indent=1))
    print("parquet:", OUT_PARQUET)
    return 0


if __name__ == "__main__":
    sys.exit(main())
