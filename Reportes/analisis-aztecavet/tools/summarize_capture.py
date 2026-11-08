"""Summarize a REA capture_browser_scenario evidence bundle and extract artifacts.

Prints step statuses, artifact states, storage, console/network events, and writes
screenshot artifacts to screenshots/ for visual review. Run with:
python3 -I summarize_capture.py <bundle.json> <out_dir>
"""
import base64
import json
import sys
from pathlib import Path

bundle = Path(sys.argv[1])
out_dir = Path(sys.argv[2])
shots = out_dir / "screenshots"
shots.mkdir(parents=True, exist_ok=True)

data = json.loads(bundle.read_text(encoding="utf-8"))
records = data["records"] if isinstance(data, dict) and "records" in data else data

cap = None
for rec in records if isinstance(records, list) else [records]:
    op = rec.get("operation", "")
    if op == "capture_browser_scenario":
        cap = rec
        break
if cap is None:
    print("No capture_browser_scenario record found")
    sys.exit(1)

nr = cap.get("normalized_result", {})
print("=== browser ===")
print(json.dumps(nr.get("browser"), ensure_ascii=False))
print("=== steps ===")
for s in nr.get("steps", []):
    arts = {k: (v.get("state") if isinstance(v, dict) else v) for k, v in (s.get("artifacts") or {}).items()}
    print(f"[{s.get('step_index')}] {s.get('step_id')} :: {s.get('status')} :: {s.get('elapsed_ms')}ms :: {s.get('error') or ''} :: arts={arts}")

evs = (nr.get("events") or {}).get("items", [])
print(f"=== events: {len(evs)} retained ===")
for e in evs:
    kind = e.get("kind")
    if kind == "console":
        print(f"  console[{e.get('level')}] {e.get('text','')[:160]}")
    elif kind == "network-content":
        body = e.get("body") or {}
        hdrs = {h.get("name"): h.get("value") for h in ((e.get("headers") or {}).get("items") or [])[:6]}
        print(f"  net {e.get('phase')} tx={e.get('transaction_id')} body={body.get('state')}")
    elif kind in ("request", "response", "request-finished"):
        u = (e.get("url") or {}).get("url", "")
        print(f"  {kind} {e.get('method','')} {u[:120]} status={e.get('status')}")
    else:
        print(f"  {kind}: {json.dumps(e)[:180]}")

print("=== final artifacts ===")
final = None
for s in nr.get("steps", []):
    if s.get("step_id") == "sport-settle":
        final = s
arts_all = []
for s in nr.get("steps", []):
    for name, art in (s.get("artifacts") or {}).items():
        if isinstance(art, dict) and art.get("state") == "captured":
            arts_all.append((s.get("step_id"), name, art))
for sid, name, art in arts_all:
    if name == "screenshot":
        png = shots / f"{sid}.png"
        payload = art.get("value") if isinstance(art.get("value"), dict) else art
        png.write_bytes(base64.b64decode(payload["data_base64"]))
        print(f"  wrote {png.name} ({art['bytes']} bytes, sha {art['sha256'][:12]})")

# DOM artifact of final step (may be huge) -> write to file
for sid, name, art in arts_all:
    if name == "dom":
        out = out_dir / f"dom_{sid}.html"
        val = art.get("value")
        if isinstance(val, dict) and "data_base64" in val:
            out.write_bytes(base64.b64decode(val["data_base64"]))
        else:
            out.write_text(json.dumps(val, ensure_ascii=False), encoding="utf-8")
        print(f"  wrote {out.name} ({out.stat().st_size} bytes)")

print("=== storage (final capture) ===")
for s in nr.get("steps", []):
    st = (s.get("artifacts") or {}).get("storage")
    if isinstance(st, dict) and st.get("state") == "captured":
        print(json.dumps(st.get("value"), ensure_ascii=False)[:2000])

print("=== url/history (final) ===")
for s in nr.get("steps", []):
    for k in ("url", "history"):
        st = (s.get("artifacts") or {}).get(k)
        if isinstance(st, dict) and st.get("state") == "captured":
            print(f"  {k}: {json.dumps(st.get('value'), ensure_ascii=False)[:600]}")
