import json
import base64
from pathlib import Path

BASE = Path(r"C:\Users\T490s\.gemini\antigravity\worktrees\PitchLab\explore_pickbot_architecture\pickbot")
STEP60 = Path(r"C:\Users\T490s\.gemini\antigravity\brain\fb8eeb78-1cec-4286-970c-24f3afbc8957\.system_generated\steps\60\output.txt")

dst60 = BASE / "evidence" / "captures" / "01-home-analyze-web-bundle-routes.json"
if STEP60.exists():
    dst60.write_bytes(STEP60.read_bytes())

p55 = BASE / "evidence" / "captures" / "01-home-inspect-web-page.json"
p57 = BASE / "evidence" / "captures" / "01-home-scenario-capture.json"
p64 = BASE / "evidence" / "captures" / "01-home-export-web-scripts.json"

d55 = json.loads(p55.read_text(encoding="utf-8"))
print("=== 1. INSPECT_WEB_PAGE ===")
print("evidence_id:", d55.get("evidence_id"))
nr55 = d55.get("normalized_result", {})
print("target:", json.dumps(nr55.get("target"), ensure_ascii=False))
scripts_obj = nr55.get("scripts", {})
if isinstance(scripts_obj, dict):
    print("scripts keys:", list(scripts_obj.keys()))
    items = scripts_obj.get("items") or scripts_obj.get("scripts") or []
    print(f"scripts items ({len(items)}):")
    for i, s in enumerate(items[:40]):
        print(f"  [{i}] url={s.get('url')} | bytes={s.get('source_bytes') or s.get('length')} | map={s.get('source_map_url')}")
print("storage:", json.dumps(nr55.get("storage"), indent=2, ensure_ascii=False)[:1500])
print("metadata:", json.dumps(nr55.get("metadata"), indent=2, ensure_ascii=False)[:1500])

d57 = json.loads(p57.read_text(encoding="utf-8"))
print("\n=== 2. CAPTURE_BROWSER_SCENARIO ===")
print("evidence_id:", d57.get("evidence_id"))
nr57 = d57.get("normalized_result", {})
print("nr57 keys:", list(nr57.keys()))
for k, v in nr57.items():
    if isinstance(v, dict):
        print(f"  dict {k}: keys={list(v.keys())}")
    elif isinstance(v, list):
        print(f"  list {k}: len={len(v)}")

# Save final artifacts if present
final_art = nr57.get("final") or {}
if not final_art and nr57.get("steps"):
    final_art = nr57["steps"][-1].get("artifacts", {})
for name, filename in [("dom", "01-home.html"), ("accessibility", "01-home-accessibility.json"), ("storage", "01-home-storage.json")]:
    sec = final_art.get(name) or nr57.get(name) or {}
    if isinstance(sec, dict) and sec.get("state") == "captured":
        val = sec.get("value")
        out_path = BASE / "evidence" / "captures" / filename
        if isinstance(val, str):
            out_path.write_text(val, encoding="utf-8")
        elif isinstance(val, dict) and "html" in val:
            out_path.write_text(val["html"], encoding="utf-8")
        else:
            out_path.write_text(json.dumps(val, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"Saved {filename} ({out_path.stat().st_size} bytes)")

sc = final_art.get("screenshot") or nr57.get("screenshot") or {}
if isinstance(sc, dict) and sc.get("state") == "captured":
    b64 = sc["value"]["data_base64"]
    png_path = BASE / "evidence" / "screenshots" / "01-home.png"
    png_path.write_bytes(base64.b64decode(b64))
    print(f"Saved 01-home.png ({png_path.stat().st_size} bytes)")

# Network transactions
net = nr57.get("network") or {}
txs = net.get("transactions") if isinstance(net, dict) else (nr57.get("network_transactions") or [])
if not txs and isinstance(nr57.get("events"), list):
    net_ev = [e for e in nr57["events"] if e.get("family") == "network" or "request" in str(e.get("kind", ""))]
    print("network events sample:", json.dumps(net_ev[:3], ensure_ascii=False)[:1000])
print(f"transactions ({len(txs or [])}):")
for i, tx in enumerate((txs or [])[:80]):
    req = tx.get("request", {})
    resp = tx.get("response") or {}
    u = req.get("url")
    u_str = u.get("url") if isinstance(u, dict) else u
    hdrs = resp.get("headers") or []
    interesting_hdrs = {h.get("name"): h.get("value") for h in hdrs if isinstance(h, dict) and str(h.get("name", "")).lower() in ("server", "x-powered-by", "x-vercel-id", "cf-ray", "via", "x-nextjs-cache", "x-nextjs-prerender", "content-type")}
    body = resp.get("body") or {}
    print(f"  [{i}] {req.get('method')} {u_str} -> {resp.get('status')} | hdrs={interesting_hdrs} | body={body.get('state')}({body.get('bytes')}B)")

d64 = json.loads(p64.read_text(encoding="utf-8"))
print("\n=== 3. EXPORT_WEB_SCRIPTS ===")
print("evidence_id:", d64.get("evidence_id"))
nr64 = d64.get("normalized_result", {})
print("analysis_input:", nr64.get("analysis_input"))
exp_scripts = nr64.get("scripts", [])
print(f"exported scripts ({len(exp_scripts)}):")
for i, s in enumerate(exp_scripts):
    print(f"  [{i}] status={s.get('status')} path={s.get('relative_path')} bytes={s.get('bytes')} url={s.get('source_url')}")

d60 = json.loads(dst60.read_text(encoding="utf-8"))
print("\n=== 4. ANALYZE_WEB_BUNDLE (ROUTES VIEW) ===")
print("evidence_id:", d60.get("evidence_id"))
nr60 = d60.get("normalized_result", {})
print("parent_evidence_id:", nr60.get("parent_evidence_id"))
print("nr60:", json.dumps(nr60, indent=2, ensure_ascii=False)[:5000])
