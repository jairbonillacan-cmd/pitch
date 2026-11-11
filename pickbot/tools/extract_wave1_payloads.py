import json
import base64
import re
from pathlib import Path

BASE = Path(r"C:\Users\T490s\.gemini\antigravity\worktrees\PitchLab\explore_pickbot_architecture\pickbot")
d57 = json.loads((BASE / "evidence/captures/01-home-scenario-capture.json").read_text(encoding="utf-8"))
ev_items = d57["normalized_result"]["events"]["items"]

req_by_tx = {}
resp_by_tx = {}
resp_content_by_tx = {}

for e in ev_items:
    k = e.get("kind")
    tx_id = e.get("transaction_id")
    if k == "request":
        req_by_tx[tx_id] = e
    elif k == "response":
        resp_by_tx[tx_id] = e
    elif k == "network-content" and e.get("phase") == "response":
        resp_content_by_tx[tx_id] = e

print(f"Total transactions: {len(req_by_tx)}")
for tx_id, req in req_by_tx.items():
    u = req.get("url")
    u_str = u.get("url") if isinstance(u, dict) else str(u)
    resp = resp_by_tx.get(tx_id, {})
    rc = resp_content_by_tx.get(tx_id, {})
    body = rc.get("body", {})
    hdrs = {h["name"]: h["value"] for h in rc.get("headers", {}).get("items", [])}
    b_bytes = body.get("bytes")
    print(f"[{tx_id}] {req.get('method')} {u_str} -> {resp.get('status')} ({hdrs.get('content-type')}, {b_bytes} B)")
    if body.get("state") == "captured" and body.get("encoding") == "base64":
        raw = base64.b64decode(body["content"])
        ct = hdrs.get("content-type", "")
        if "css" in ct or u_str.endswith(".css") or ".css?" in u_str:
            css_name = u_str.split("/")[-1].split("?")[0]
            (BASE / "evidence/css" / css_name).write_bytes(raw)
            print(f"  -> Saved CSS {css_name} ({len(raw)} B)")
        elif "/api/" in u_str or u_str.endswith("/picks"):
            safe = re.sub(r'[^a-zA-Z0-9_-]+', '_', u_str.split("pickbot.mx")[-1]).strip("_")[:80]
            ext = ".json" if "json" in ct else ".txt"
            out_f = BASE / "evidence/network-schemas" / f"01-home-{safe}{ext}"
            out_f.write_bytes(raw)
            txt = raw.decode("utf-8", errors="replace")
            print(f"  -> Saved {out_f.name} ({len(raw)} B)")
            print(f"     PREVIEW: {txt[:1200]}")
