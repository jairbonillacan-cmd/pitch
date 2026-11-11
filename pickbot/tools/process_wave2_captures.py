import base64
import hashlib
import json
import re
import shutil
from pathlib import Path

BASE = Path(r"C:\Users\T490s\.gemini\antigravity\worktrees\PitchLab\explore_pickbot_architecture\pickbot")
STEPS_DIR = Path(r"C:\Users\T490s\.gemini\antigravity\brain\fb8eeb78-1cec-4286-970c-24f3afbc8957\.system_generated\steps")

CAPTURES_MAP = [
    ("02-picks", 157),
    ("03-rendimiento", 158),
    ("04-estrategias", 159),
    ("05-clasificacion", 160),
    ("06-feed", 162),
    ("07-buscar", 163),
    ("08-plan", 164),
    ("09-privacidad", 165),
    ("10-terminos", 167),
    ("11-amigos", 168),
    ("12-public-profile", 169),
    ("13-settings", 170),
]

(BASE / "evidence/captures").mkdir(parents=True, exist_ok=True)
(BASE / "evidence/screenshots").mkdir(parents=True, exist_ok=True)
(BASE / "evidence/network-schemas").mkdir(parents=True, exist_ok=True)
(BASE / "evidence/javascript/route-chunks").mkdir(parents=True, exist_ok=True)

def load_step_json(step_num: int) -> dict:
    raw_txt = (STEPS_DIR / str(step_num) / "output.txt").read_text(encoding="utf-8")
    obj = json.loads(raw_txt)
    if isinstance(obj, dict) and "evidence_id" in obj:
        return obj
    if isinstance(obj, dict) and "content" in obj and isinstance(obj["content"], list):
        for item in obj["content"]:
            if isinstance(item, dict) and "text" in item:
                return json.loads(item["text"])
    raise ValueError(f"Unexpected JSON wrapper in step {step_num}: {list(obj.keys())[:5]}")

chunk_registry = {}  # chunk_filename -> {"url": ..., "bytes": ..., "sha256": ..., "routes": set()}
api_registry = []

# First index Wave 1 chunks from home-scripts/manifest.json
w1_manifest = json.loads((BASE / "evidence/javascript/home-scripts/manifest.json").read_text(encoding="utf-8"))
w1_files_dir = BASE / "evidence/javascript/home-scripts/files"
for s in w1_manifest["scripts"]:
    url = s.get("url", "")
    c = s.get("content", {})
    rel = c.get("relative_path")
    if rel and "/_next/static/chunks/" in url:
        fname = url.split("/_next/static/chunks/")[-1].split("?")[0]
        src_file = w1_files_dir / rel
        if src_file.exists():
            raw = src_file.read_bytes()
            (BASE / "evidence/javascript/route-chunks" / fname).write_bytes(raw)
            chunk_registry[fname] = {
                "url": url,
                "bytes": len(raw),
                "sha256": hashlib.sha256(raw).hexdigest(),
                "routes": ["01-home"],
            }

summary_records = []

for label, step_num in CAPTURES_MAP:
    doc = load_step_json(step_num)
    ev_id = doc["evidence_id"]
    cap_file = BASE / "evidence/captures" / f"{label}-scenario-capture.json"
    cap_file.write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")

    nr = doc["normalized_result"]
    final_step = nr["steps"][-1]
    art = final_step.get("artifacts", {})

    # Save screenshot
    scr = art.get("screenshot", {})
    if scr.get("state") == "captured":
        png_bytes = base64.b64decode(scr["value"]["data_base64"])
        (BASE / "evidence/screenshots" / f"{label}.png").write_bytes(png_bytes)

    # Save DOM for legal pages & key routes
    dom = art.get("dom", {})
    if dom.get("state") == "captured":
        html_val = dom["value"]
        html_text = html_val.get("html") or html_val.get("content") or ""
        if html_text and label in ("09-privacidad", "10-terminos", "02-picks", "03-rendimiento", "04-estrategias", "08-plan"):
            (BASE / "evidence/captures" / f"{label}.html").write_text(html_text, encoding="utf-8")

    # Parse network events
    ev_items = nr.get("events", {}).get("items", [])
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

    new_chunks_this_route = []
    apis_this_route = []
    for tx_id, req in req_by_tx.items():
        u = req.get("url")
        u_str = u.get("url") if isinstance(u, dict) else str(u)
        resp = resp_by_tx.get(tx_id, {})
        rc = resp_content_by_tx.get(tx_id, {})
        body = rc.get("body", {})
        hdrs = {h["name"].lower(): h["value"] for h in rc.get("headers", {}).get("items", [])}
        ct = hdrs.get("content-type", "")

        if body.get("state") == "captured" and body.get("encoding") == "base64":
            raw = base64.b64decode(body["content"])
            if "/_next/static/chunks/" in u_str and (".js" in u_str):
                fname = u_str.split("/_next/static/chunks/")[-1].split("?")[0]
                if fname not in chunk_registry:
                    (BASE / "evidence/javascript/route-chunks" / fname).write_bytes(raw)
                    chunk_registry[fname] = {
                        "url": u_str,
                        "bytes": len(raw),
                        "sha256": hashlib.sha256(raw).hexdigest(),
                        "routes": [label],
                    }
                    new_chunks_this_route.append(fname)
                else:
                    if label not in chunk_registry[fname]["routes"]:
                        chunk_registry[fname]["routes"].append(label)
            elif "/api/" in u_str:
                safe = re.sub(r"[^a-zA-Z0-9_-]+", "_", u_str.split("pickbot.mx")[-1]).strip("_")[:75]
                ext = ".json" if "json" in ct else ".txt"
                out_f = BASE / "evidence/network-schemas" / f"{label}-{safe}{ext}"
                out_f.write_bytes(raw)
                apis_this_route.append({
                    "method": req.get("method"),
                    "url": u_str,
                    "status": resp.get("status"),
                    "bytes": len(raw),
                    "saved_file": out_f.name,
                })

    summary_records.append({
        "label": label,
        "step_num": step_num,
        "evidence_id": ev_id,
        "final_url": final_step.get("after_url", {}).get("url"),
        "tx_count": len(req_by_tx),
        "new_chunks": new_chunks_this_route,
        "apis": apis_this_route,
    })
    print(f"[{label}] {ev_id} | tx={len(req_by_tx)} | new_chunks={new_chunks_this_route} | apis={[a['url'].split('pickbot.mx')[-1] for a in apis_this_route]}")

(BASE / "evidence/captures/wave2-route-summary.json").write_text(
    json.dumps({"scenarios": summary_records, "chunks": chunk_registry}, indent=2, ensure_ascii=False),
    encoding="utf-8",
)
print(f"\nTotal unique Next.js JS chunks collected in route-chunks/: {len(chunk_registry)}")
for fn, meta in sorted(chunk_registry.items()):
    print(f"  {fn:28s} {meta['bytes']:8d} B  routes={meta['routes']}")
