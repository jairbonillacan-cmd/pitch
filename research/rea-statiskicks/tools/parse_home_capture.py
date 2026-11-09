import json
import base64
from pathlib import Path

cap_path = Path(".worktrees/REA-stats/evidence/captures/01-home-capture.json")
with cap_path.open("r", encoding="utf-8") as f:
    d = json.load(f)

nr = d["normalized_result"]
steps = nr.get("steps", [])
print("Steps count:", len(steps))
for s in steps:
    print("Step:", s.get("step_id"), s.get("status"), "after_url:", s.get("after_url"))
    arts = s.get("artifacts", {})
    for k, v in arts.items():
        if isinstance(v, dict):
            print(f"  artifact {k}: state={v.get('state')} keys={list(v.keys())}")
            if k == "screenshot" and v.get("state") == "captured":
                b64 = v.get("data_base64") or v.get("base64") or (v.get("value", {}) if isinstance(v.get("value"), dict) else {}).get("base64")
                if b64:
                    out_png = Path(".worktrees/REA-stats/evidence/screenshots/01-home.png")
                    out_png.write_bytes(base64.b64decode(b64))
                    print("  saved screenshot to", out_png)
            if k == "dom" and v.get("state") == "captured":
                html = v.get("html") or (v.get("value", {}) if isinstance(v.get("value"), dict) else {}).get("html")
                if html:
                    out_html = Path(".worktrees/REA-stats/evidence/captures/01-home.html")
                    out_html.write_text(html, encoding="utf-8")
                    print("  saved DOM HTML to", out_html, "len:", len(html))

events = nr.get("events", {}).get("items", [])
print("Total event items:", len(events))
kinds = {}
for ev in events:
    k = ev.get("kind") or ev.get("type")
    kinds[k] = kinds.get(k, 0) + 1
print("Event kinds:", kinds)

for ev in events:
    if ev.get("kind") in ("network-request", "network-response", "request", "response") or "url" in str(ev)[:200]:
        pass
# Print first 5 events structure
for i, ev in enumerate(events[:5]):
    print(f"Event {i}: keys={list(ev.keys())} kind={ev.get('kind')} type={ev.get('type')}")
