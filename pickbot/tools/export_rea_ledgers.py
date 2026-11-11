import json
import os

ROOT = r"C:\Users\T490s\.gemini\antigravity\worktrees\PitchLab\explore_pickbot_architecture\pickbot"
STEPS = r"C:\Users\T490s\.gemini\antigravity\brain\fb8eeb78-1cec-4286-970c-24f3afbc8957\.system_generated\steps"

# 1. Save 22-js-routes-core-23-chunks.json from step 360
s360 = json.load(open(os.path.join(STEPS, "360", "output.txt"), encoding="utf-8"))
with open(os.path.join(ROOT, "evidence", "captures", "22-js-routes-core-23-chunks.json"), "w", encoding="utf-8") as f:
    json.dump(s360, f, ensure_ascii=False, indent=2)
print("js-routes-core-23-chunks evidence_id:", s360["evidence_id"], "items:", len(s360["normalized_result"].get("items", [])))
for item in s360["normalized_result"].get("items", [])[:25]:
    print("  route:", item.get("path"), item.get("mechanisms"))

# 2. Load get_evidence_bundle summary from step 374
bundle = json.load(open(os.path.join(STEPS, "374", "output.txt"), encoding="utf-8"))
res = bundle.get("result", bundle)
print("Bundle keys:", list(res.keys()))
ev_items = res.get("evidence") or res.get("records") or res.get("items") or []
unk_items = res.get("unknowns") or []
print(f"Total retained evidence records in REA session: {len(ev_items)}")
print(f"Total unknown records in bundle: {len(unk_items)}")

with open(os.path.join(ROOT, "evidence", "rea-evidence-summary.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=2)

with open(os.path.join(ROOT, "evidence", "rea-unknowns.json"), "w", encoding="utf-8") as f:
    json.dump(unk_items, f, ensure_ascii=False, indent=2)

for idx, ev in enumerate(ev_items, 1):
    op = ev.get("operation")
    eid = ev.get("evidence_id")
    subj = (ev.get("subject") or {}).get("name")
    print(f"{idx:2d}. {eid} | {op:32s} | {subj}")
