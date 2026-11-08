"""Extract every screenshot artifact from a REA session bundle into screenshots/.

Each capture_browser_scenario record contributes its captured screenshot steps,
named by evidence id prefix + step id. Run with:
python3 -I extract_all_shots.py <session.json> <out_dir>
"""
import base64
import json
import sys
from pathlib import Path

session = Path(sys.argv[1])
out_dir = Path(sys.argv[2])
shots = out_dir / "screenshots"
shots.mkdir(parents=True, exist_ok=True)

data = json.loads(session.read_text(encoding="utf-8"))
records = data.get("records", data if isinstance(data, list) else [])
count = 0
for rec in records:
    if rec.get("operation") != "capture_browser_scenario":
        continue
    eid = rec.get("evidence_id", "")[:8]
    nr = rec.get("normalized_result", {})
    for s in nr.get("steps", []):
        for name, art in (s.get("artifacts") or {}).items():
            if name == "screenshot" and isinstance(art, dict) and art.get("state") == "captured":
                payload = art.get("value") if isinstance(art.get("value"), dict) else art
                png = shots / f"{eid}_{s.get('step_id')}.png"
                png.write_bytes(base64.b64decode(payload["data_base64"]))
                print(f"{png.name}: {payload['bytes']} bytes")
                count += 1
print(f"total screenshots: {count}")
