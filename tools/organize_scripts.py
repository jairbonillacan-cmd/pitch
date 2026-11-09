import json
import shutil
from pathlib import Path

manifest_path = Path(".worktrees/REA-stats/evidence/javascript/home-scripts/manifest.json")
m = json.loads(manifest_path.read_text(encoding="utf-8"))

named_dir = Path(".worktrees/REA-stats/evidence/javascript/named")
named_dir.mkdir(parents=True, exist_ok=True)

index_rows = []
for s in m.get("scripts", []):
    url = s["url"]
    content = s["content"]
    rel = content["relative_path"]
    src_file = Path(".worktrees/REA-stats/evidence/javascript/home-scripts/files") / rel
    clean_name = url.split("?")[0].split("/")[-1]
    dst_file = named_dir / clean_name
    shutil.copy2(src_file, dst_file)
    index_rows.append({
        "name": clean_name,
        "url": url,
        "isolated_path": rel,
        "sha256": content["sha256"],
        "bytes": content["bytes"]
    })
    print(f"{clean_name:32s} | {content['bytes']:8d} B | {content['sha256'][:16]}... | {url}")

Path(".worktrees/REA-stats/evidence/javascript/scripts-index.json").write_text(
    json.dumps(index_rows, indent=2), encoding="utf-8"
)
