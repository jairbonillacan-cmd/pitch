import base64
import json
import os
import re

STEP_229 = r"C:\Users\T490s\.gemini\antigravity\brain\fb8eeb78-1cec-4286-970c-24f3afbc8957\.system_generated\steps\229\output.txt"
STEP_230 = r"C:\Users\T490s\.gemini\antigravity\brain\fb8eeb78-1cec-4286-970c-24f3afbc8957\.system_generated\steps\230\output.txt"

CAPTURES_DIR = "pickbot/evidence/captures"
JS_DIR = "pickbot/evidence/javascript/route-chunks"
CSS_DIR = "pickbot/evidence/css"
SCHEMAS_DIR = "pickbot/evidence/network-schemas"
SHOTS_DIR = "pickbot/evidence/screenshots"

for d in (CAPTURES_DIR, JS_DIR, CSS_DIR, SCHEMAS_DIR, SHOTS_DIR):
    os.makedirs(d, exist_ok=True)


def decode_body(body_obj):
    if not body_obj or body_obj.get("state") != "captured":
        return None
    enc = body_obj.get("encoding")
    content = body_obj.get("content")
    if content is not None:
        if enc == "base64":
            return base64.b64decode(content)
        return content.encode("utf-8")
    val = body_obj.get("value") or {}
    if "text" in val and val["text"] is not None:
        return val["text"].encode("utf-8")
    if "data_base64" in val and val["data_base64"]:
        return base64.b64decode(val["data_base64"])
    return None


def unpack_capture(src_path, dest_json_name, prefix):
    with open(src_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    dest_path = os.path.join(CAPTURES_DIR, dest_json_name)
    with open(dest_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    ev_id = data.get("evidence_id")
    norm = data.get("normalized_result", {})
    steps = norm.get("steps", [])
    events = norm.get("events", {}).get("items", [])

    print(f"=== {dest_json_name} ({ev_id}) ===")
    print(f"Steps: {len(steps)} | Events retained: {norm.get('events', {}).get('retained')}, dropped: {norm.get('events', {}).get('dropped')}")

    # Check final step artifacts
    for st in steps:
        arts = st.get("artifacts", {})
        shot = arts.get("screenshot", {})
        if shot.get("state") == "captured":
            b64 = shot["value"]["data_base64"]
            out_png = os.path.join(SHOTS_DIR, f"{prefix}.png")
            with open(out_png, "wb") as fp:
                fp.write(base64.b64decode(b64))
            print(f"  Saved screenshot -> {out_png}")
        dom = arts.get("dom", {})
        if dom.get("state") == "captured":
            html = dom["value"].get("html") or dom["value"].get("text") or ""
            if html:
                out_html = os.path.join(CAPTURES_DIR, f"{prefix}-document.html")
                with open(out_html, "w", encoding="utf-8") as fp:
                    fp.write(html)
                print(f"  Saved DOM -> {out_html} ({len(html)} chars)")

    # Map transaction_id -> (method, url, status)
    tx_meta = {}
    for ev in events:
        tid = ev.get("transaction_id")
        if not tid:
            continue
        if ev.get("kind") == "request":
            tx_meta.setdefault(tid, {})["method"] = ev.get("method")
            tx_meta[tid]["url"] = ev.get("url", {}).get("url", "")
            tx_meta[tid]["resource_type"] = ev.get("resource_type")
        elif ev.get("kind") == "response":
            tx_meta.setdefault(tid, {})["status"] = ev.get("status")

    saved_files = []
    for ev in events:
        if ev.get("kind") == "network-content" and ev.get("phase") == "response":
            tid = ev.get("transaction_id")
            meta = tx_meta.get(tid, {})
            url = meta.get("url", "")
            status = meta.get("status")
            raw = decode_body(ev.get("body"))
            if raw is None:
                continue

            m_js = re.search(r"/_next/static/chunks/((?:turbopack-)?[a-f0-9]{16}\.js)", url)
            m_css = re.search(r"/_next/static/chunks/([a-f0-9]{16}\.css)", url)
            if m_js and status == 200:
                fname = m_js.group(1)
                out_p = os.path.join(JS_DIR, fname)
                is_new = not os.path.exists(out_p)
                with open(out_p, "wb") as fp:
                    fp.write(raw)
                if is_new:
                    print(f"  [NEW JS] {fname} ({len(raw)} B)")
                saved_files.append((fname, len(raw), status, url))
            elif m_css and status == 200:
                fname = m_css.group(1)
                out_p = os.path.join(CSS_DIR, fname)
                with open(out_p, "wb") as fp:
                    fp.write(raw)
                print(f"  [CSS] {fname} ({len(raw)} B)")
                saved_files.append((fname, len(raw), status, url))
            elif "pickbot.mx" in url and ("/api/" in url or any(url.endswith(x) for x in ("/robots.txt", "/sitemap.xml", "/manifest.webmanifest"))):
                slug = re.sub(r"[^a-zA-Z0-9._-]+", "_", url.split("pickbot.mx")[-1].strip("/"))
                ext = ".json"
                if "export" in url and status == 200:
                    ext = ".csv"
                elif slug.endswith(".txt") or slug.endswith(".xml") or slug.endswith(".webmanifest"):
                    ext = ""
                out_p = os.path.join(SCHEMAS_DIR, f"{prefix}-{slug}{ext}")
                with open(out_p, "wb") as fp:
                    fp.write(raw)
                print(f"  [API/INFRA {status}] {url} -> {os.path.basename(out_p)} ({len(raw)} B)")
    return data


def main():
    unpack_capture(STEP_229, "14-shared-strategy-and-chunks-capture.json", "14-shared-strategy")
    unpack_capture(STEP_230, "15-alltime-rendimiento-and-infra-capture.json", "15-alltime")

    # Inspect key API payloads
    print("\n--- PICKBOT SYSTEM STRATEGY (/api/strategies/pickbot) ---")
    p_strat = os.path.join(SCHEMAS_DIR, "15-alltime-api_strategies_pickbot.json")
    if os.path.exists(p_strat):
        print(open(p_strat, encoding="utf-8", errors="replace").read()[:2000])

    print("\n--- SHARED STRATEGY (/api/strategies/shared/691d418b0b53b755e4) ---")
    p_sh = os.path.join(SCHEMAS_DIR, "14-shared-strategy-api_strategies_shared_691d418b0b53b755e4.json")
    if os.path.exists(p_sh):
        print(open(p_sh, encoding="utf-8", errors="replace").read()[:2000])

    for label, fn in [
        ("ALL-TIME RENDIMIENTO (NONE)", "15-alltime-api_rendimiento_allTime_1_sportKey_all_strategyId_none.json"),
        ("ALL-TIME RENDIMIENTO (PICKBOT)", "15-alltime-api_rendimiento_allTime_1_sportKey_all_strategyId_pickbot.json"),
    ]:
        fp = os.path.join(SCHEMAS_DIR, fn)
        if os.path.exists(fp):
            d = json.load(open(fp, encoding="utf-8"))
            print(f"\n--- {label} ---")
            print("Summary:", json.dumps(d.get("summary"), ensure_ascii=False))
            daily = d.get("daily", [])
            print(f"Daily count: {len(daily)} | First day: {daily[0] if daily else None} | Last day: {daily[-1] if daily else None}")
            leagues = d.get("byLeague", [])
            print(f"Total leagues in byLeague: {len(leagues)}")
            for lg in leagues:
                print(f"  - {lg.get('sport_key')}: {lg.get('sport_title')} | W-L-P: {lg.get('won')}-{lg.get('lost')}-{lg.get('push')} (pend {lg.get('pending')}) | win_ratio={lg.get('win_ratio')}% | roi={lg.get('roi')}%")

    for fn in ("15-alltime-api_rendimiento_export_dataset_monthly_sportKey_all_strategyId_none_allTime_1.csv", "15-alltime-robots.txt", "15-alltime-sitemap.xml", "15-alltime-manifest.webmanifest"):
        fp = os.path.join(SCHEMAS_DIR, fn)
        if os.path.exists(fp):
            print(f"\n--- {fn} ---")
            print(open(fp, encoding="utf-8", errors="replace").read()[:1500])


if __name__ == "__main__":
    main()
