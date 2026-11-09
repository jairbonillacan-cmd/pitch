import os
import json
import hashlib
import shutil

root = r"c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats"
ev_dir = os.path.join(root, "evidence")
brain_dir = r"C:\Users\T490s\.gemini\antigravity\brain\672dc0a7-a1f7-41a2-a5d6-62b96abaa3f8"

# 1. Copy new Wave 2 screenshots to brain_dir
for png in [
    "15-player-tabs-and-events.png",
    "16-goalkeeper-profile.png",
    "17b-match-lideres-tabla-h2h-gkmodal.png",
    "18-league-remaining-tabs-full.png",
    "19b-players-teams-tab.png",
    "20-contacto.png",
]:
    src = os.path.join(ev_dir, "captures", png)
    if os.path.exists(src):
        shutil.copy2(src, os.path.join(brain_dir, png))
        print("Copied screenshot:", png)

# 2. Build SHA-256 inventory of all evidence files (excluding rea-evidence-bundle.json and artifact-sha256-inventory.json itself)
inventory = []
for dirpath, _, filenames in sorted(os.walk(ev_dir)):
    for fn in sorted(filenames):
        if fn in ("rea-evidence-bundle.json", "artifact-sha256-inventory.json"):
            continue
        fp = os.path.join(dirpath, fn)
        rel = os.path.relpath(fp, root).replace("\\", "/")
        sz = os.path.getsize(fp)
        if sz > 5 * 1024 * 1024:
            print(f"LARGE FILE: {rel} -> {sz:,} B")
        h = hashlib.sha256()
        with open(fp, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                h.update(chunk)
        inventory.append({
            "path": rel,
            "bytes": sz,
            "sha256": h.hexdigest()
        })

# Also hash rea-evidence-bundle.json separately for metadata
bundle_fp = os.path.join(ev_dir, "rea-evidence-bundle.json")
bundle_meta = None
if os.path.exists(bundle_fp):
    h = hashlib.sha256()
    with open(bundle_fp, "rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    bundle_meta = {
        "path": "evidence/rea-evidence-bundle.json",
        "bytes": os.path.getsize(bundle_fp),
        "sha256": h.hexdigest(),
        "gitignored": True
    }

out_data = {
    "generated_at": "2026-04-19T20:00:00Z",
    "total_tracked_files": len(inventory),
    "total_tracked_bytes": sum(x["bytes"] for x in inventory),
    "rea_evidence_bundle": bundle_meta,
    "files": inventory
}

inv_path = os.path.join(ev_dir, "artifact-sha256-inventory.json")
with open(inv_path, "w", encoding="utf-8") as f:
    json.dump(out_data, f, indent=2, ensure_ascii=False)

print(f"Inventory written: {len(inventory)} tracked files, {out_data['total_tracked_bytes']:,} bytes.")
if bundle_meta:
    print(f"Bundle SHA-256: {bundle_meta['sha256']} ({bundle_meta['bytes']:,} B)")
