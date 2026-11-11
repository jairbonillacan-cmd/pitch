import json
import re
from pathlib import Path

BASE = Path(r"C:\Users\T490s\.gemini\antigravity\worktrees\PitchLab\explore_pickbot_architecture\pickbot")
js_dir = BASE / "evidence/javascript/home-scripts/files"
manifest_path = BASE / "evidence/javascript/home-scripts/manifest.json"

manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
print("=== EXPORT_WEB_SCRIPTS MANIFEST ===")
print("manifest keys:", list(manifest.keys()))
for i, s in enumerate(manifest.get("scripts", [])):
    print(f"  [{i}] {s}")

print("\n=== DEEP CHUNK CLASSIFICATION & API/DATA PROVENANCE SCAN ===")
for f in sorted(js_dir.rglob("*.js")):
    txt = f.read_text(encoding="utf-8", errors="ignore")
    rel = str(f.relative_to(js_dir))
    # Find any fetch(...) or /api/ or sport/odds/pick keywords
    apis = sorted(set(re.findall(r'["\'`](/api/[a-zA-Z0-9_/\-\[\]\.?=&${}]+)["\'`]', txt)))
    template_apis = sorted(set(re.findall(r'`(/api/[^`]+)`', txt)))
    routes = sorted(set(re.findall(r'["\'`](/(?:picks|feed|clasificacion|buscar|amigos|perfil|login|admin|chat|bot|planes|pro|pricing|partidos|ligas|cuotas|momios|bankroll|stats|rendimiento)[a-zA-Z0-9_/\-\[\]]*)["\'`]', txt)))
    # Identify library/app role
    markers = []
    for kw in ("firebase", "firestore", "pickbot", "sportKey", "bookmaker", "the-odds-api", "odds", "api-sports", "apifootball", "sportradar", "sofascore", "fotmob", "opta", "openai", "anthropic", "gemini", "claude", "gpt", "stripe", "mercadopago", "leaderboard", "rendimiento", "parlay", "momio", "cuota", "chat", "stream"):
        if re.search(kw, txt, re.IGNORECASE):
            markers.append(kw)
    print(f"\n--- {rel} ({len(txt)} B) ---")
    print("  markers:", markers)
    if apis or template_apis:
        print("  apis:", apis, template_apis)
    if routes:
        print("  routes:", routes)

# Also inspect 01-home-scenario-capture.json network-content events to see actual /api/leaderboard and /api/markets/matches responses!
d57 = json.loads((BASE / "evidence/captures/01-home-scenario-capture.json").read_text(encoding="utf-8"))
ev_items = d57["normalized_result"]["events"]["items"]
print("\n=== SAVING CAPTURED API RESPONSES FROM HOME SCENARIO ===")
req_by_tx = {}
resp_by_tx = {}
content_by_tx = {}
for e in ev_items:
    k = e.get("kind")
    tx_id = e.get("transaction_id") or e.get("request_id")
    if k == "request":
        req_by_tx[tx_id] = e
    elif k == "response":
        resp_by_tx[tx_id] = e
    elif k == "network-content":
        content_by_tx.setdefault(tx_id, []).append(e)

print(f"Matched {len(req_by_tx)} requests, {len(resp_by_tx)} responses, {len(content_by_tx)} content groups")
if len(req_by_tx) > 0:
    sample_tx = next(iter(req_by_tx))
    print("Sample req keys:", list(req_by_tx[sample_tx].keys()))
    if sample_tx in resp_by_tx:
        print("Sample resp keys:", list(resp_by_tx[sample_tx].keys()))
    if sample_tx in content_by_tx:
        print("Sample content keys:", [list(c.keys()) for c in content_by_tx[sample_tx]])

for tx_id, req in req_by_tx.items():
    u = req.get("url")
    u_str = u.get("url") if isinstance(u, dict) else str(u)
    resp = resp_by_tx.get(tx_id, {})
    status = resp.get("status")
    if "/api/" in u_str or u_str.endswith("/picks") or u_str == "https://www.pickbot.mx/":
        print(f"  TX {tx_id}: {req.get('method')} {u_str} -> {status}")
        hdrs = resp.get("headers") or []
        print("    resp headers:", {h.get("name"): h.get("value") for h in hdrs if isinstance(h, dict)})
        for c in content_by_tx.get(tx_id, []):
            print("    content:", {k: (v if k != "text" and k != "data_base64" else f"<{len(str(v))} chars>") for k, v in c.items()})
            if c.get("phase") == "response" or "response" in str(c.get("target", "")) or "body" in str(c):
                txt_val = c.get("text")
                if not txt_val and c.get("data_base64"):
                    import base64
                    txt_val = base64.b64decode(c["data_base64"]).decode("utf-8", errors="replace")
                if txt_val and "/api/" in u_str:
                    safe_name = re.sub(r'[^a-zA-Z0-9_-]+', '_', u_str.split("pickbot.mx")[-1])[:80]
                    out_f = BASE / "evidence/network-schemas" / f"01-home{safe_name}.json"
                    out_f.write_text(txt_val, encoding="utf-8")
                    print(f"    -> Saved {out_f.name} ({len(txt_val)} chars), preview: {txt_val[:400]}")
