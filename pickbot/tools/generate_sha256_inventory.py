import hashlib
import json
import os
import re

ROOT = r"C:\Users\T490s\.gemini\antigravity\worktrees\PitchLab\explore_pickbot_architecture\pickbot"
EVIDENCE_DIR = os.path.join(ROOT, "evidence")
INV_PATH = os.path.join(EVIDENCE_DIR, "artifact-sha256-inventory.json")

entries = []
total_bytes = 0
by_folder = {}

for dp, dn, fn in os.walk(EVIDENCE_DIR):
    dn.sort()
    for f in sorted(fn):
        full = os.path.join(dp, f)
        if os.path.abspath(full) == os.path.abspath(INV_PATH):
            continue
        rel = os.path.relpath(full, EVIDENCE_DIR).replace("\\", "/")
        top = rel.split("/")[0] if "/" in rel else "(root)"
        raw = open(full, "rb").read()
        sz = len(raw)
        sha = hashlib.sha256(raw).hexdigest()
        total_bytes += sz
        by_folder[top] = by_folder.get(top, {"count": 0, "bytes": 0})
        by_folder[top]["count"] += 1
        by_folder[top]["bytes"] += sz
        entries.append({"path": rel, "bytes": sz, "sha256": sha})

inv = {
    "target": "https://www.pickbot.mx/",
    "deployment_id": "dpl_7NUCdW69BaU9CMQePVhfQtRBwC3n",
    "total_artifacts": len(entries),
    "total_bytes": total_bytes,
    "by_category": by_folder,
    "artifacts": entries,
}

with open(INV_PATH, "w", encoding="utf-8") as f:
    json.dump(inv, f, ensure_ascii=False, indent=2)

print(f"Total artifacts in evidence/ (excluding inventory itself): {len(entries)}, total_bytes: {total_bytes:,} ({total_bytes/1024/1024:.2f} MiB)")
for k, v in sorted(by_folder.items()):
    print(f"  {k:20s}: {v['count']:3d} files, {v['bytes']:12,d} B")

# Print exact stats from rendimiento JSONs and /soporte
r_all = json.load(open(os.path.join(EVIDENCE_DIR, "network-schemas", "15-alltime-api_rendimiento_allTime_1_sportKey_all_strategyId_none.json"), encoding="utf-8"))
print("\nALL-TIME RENDIMIENTO SUMMARY:", json.dumps(r_all.get("summary"), ensure_ascii=False))
print("ALL-TIME PERIOD:", json.dumps(r_all.get("period"), ensure_ascii=False))
sports = r_all.get("bySport") or r_all.get("sports") or r_all.get("leagues") or []
print(f"ALL-TIME SPORTS COUNT ({len(sports)}):")
for sp in sports:
    print(" ", json.dumps(sp, ensure_ascii=False))

r_30_none = json.load(open(os.path.join(EVIDENCE_DIR, "network-schemas", "03-rendimiento-api_rendimiento_sportKey_all_strategyId_none_from_2026-10-13_to_2026-11-11.json"), encoding="utf-8"))
r_30_pb = json.load(open(os.path.join(EVIDENCE_DIR, "network-schemas", "18-api_rendimiento_30d_pickbot.json"), encoding="utf-8"))
print("\n30D NONE SUMMARY:", json.dumps(r_30_none.get("summary"), ensure_ascii=False))
print("30D PICKBOT SUMMARY:", json.dumps(r_30_pb.get("summary"), ensure_ascii=False))

soporte_html = open(os.path.join(EVIDENCE_DIR, "captures", "19-soporte-document.html"), encoding="utf-8").read()
# Strip <style> and <script> tags
clean_soporte = re.sub(r"<(style|script)[^>]*>.*?</\1>", " ", soporte_html, flags=re.S | re.I)
clean_soporte = re.sub(r"<[^>]+>", " ", clean_soporte)
print("\nSOPORTE BODY TEXT:", re.sub(r"\s+", " ", clean_soporte).strip()[:1200])
