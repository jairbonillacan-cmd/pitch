"""Re-verify every checksum recorded in the download manifest against disk.

Usage: python -I verify_manifest_checksums.py

Appends nothing; prints a summary and exits non-zero on any mismatch.
"""

import hashlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
MANIFEST = REPO_ROOT / "data" / "history" / "manifests" / "nfl-downloads-manifest.jsonl"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    # último registro por (dataset, asset) — el manifest es append-only
    latest: dict[tuple[str, str], dict] = {}
    for line in MANIFEST.read_text(encoding="utf-8").splitlines():
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        status = record.get("status")
        if status in ("downloaded", "skipped_existing", "preexisting_registered"):
            latest[(record["dataset"], record["asset"])] = record

    ok = mismatch = missing = 0
    for (dataset, asset), record in sorted(latest.items()):
        path = REPO_ROOT / record["localPath"]
        if not path.exists():
            print(f"[MISSING] {record['localPath']}")
            missing += 1
            continue
        actual = sha256_file(path)
        if actual != record.get("sha256"):
            print(f"[MISMATCH] {record['localPath']}: manifest={record.get('sha256')} actual={actual}")
            mismatch += 1
        else:
            ok += 1

    print(f"\nVerificados: {ok} ok · {mismatch} mismatch · {missing} faltantes · {len(latest)} registros únicos")
    return 0 if (mismatch == 0 and missing == 0) else 1


if __name__ == "__main__":
    sys.exit(main())
