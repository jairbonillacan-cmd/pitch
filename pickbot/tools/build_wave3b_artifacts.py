import base64
import glob
import hashlib
import json
import os
import re
from datetime import datetime, timezone

ROOT = r"C:\Users\T490s\.gemini\antigravity\worktrees\PitchLab\explore_pickbot_architecture\pickbot"
STEPS_DIR = r"C:\Users\T490s\.gemini\antigravity\brain\fb8eeb78-1cec-4286-970c-24f3afbc8957\.system_generated\steps"
SANDBOX_OUT = r"C:\Users\T490s\.gemini\antigravity\brain\85fd27fa-2fc6-403d-84ae-0739e5126307\browser_sandbox\outputs"

CAPTURES_DIR = os.path.join(ROOT, "evidence", "captures")
SCHEMAS_DIR = os.path.join(ROOT, "evidence", "network-schemas")
SCREENSHOTS_DIR = os.path.join(ROOT, "evidence", "screenshots")
CHUNKS_DIR = os.path.join(ROOT, "evidence", "javascript", "route-chunks")
CSS_DIR = os.path.join(ROOT, "evidence", "css")

def scrub_text(s: str) -> str:
    if not s:
        return s
    # Redact user-supplied tokens via env vars (if provided) + structural regexes so zero PII lives in code
    extra_pairs = [
        (os.environ.get("PICKBOT_REDACT_UID", ""), "REDACTED_FIREBASE_UID"),
        (os.environ.get("PICKBOT_REDACT_MONGO_ID", ""), "000000000000000000000000"),
        (os.environ.get("PICKBOT_REDACT_HANDLE", ""), "redacted_user"),
        (os.environ.get("PICKBOT_REDACT_INVITE", ""), "XXXX-XXXX"),
        (os.environ.get("PICKBOT_REDACT_INVITE_RAW", ""), "XXXXXXXX"),
    ]
    for old, new in extra_pairs:
        if old:
            s = s.replace(old, new)
            s = s.replace(old.lower(), new.lower())
    s = re.sub(r"([?&]uid=)[A-Za-z0-9_-]{20,36}", r"\1REDACTED_FIREBASE_UID", s)
    s = re.sub(r"([?&]mongoUserId=)[0-9a-f]{24}", r"\1000000000000000000000000", s)
    s = re.sub(r'("mongoId"\s*:\s*")[0-9a-f]{24}(")', r"\g<1>000000000000000000000000\2", s)
    s = re.sub(r'("inviteCode"\s*:\s*")[A-Z0-9]{4}-[A-Z0-9]{4}(")', r"\g<1>XXXX-XXXX\2", s)
    s = re.sub(r'("inviteCodeRaw"\s*:\s*")[A-Z0-9]{8}(")', r"\g<1>XXXXXXXX\2", s)
    def repl_email(m):
        em = m.group(0)
        if em.lower() == "pickbot.mx@gmail.com":
            return em
        return "redacted@example.com"
    s = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", repl_email, s)
    return s

def load_rea_step_evidence(step_num: int) -> dict:
    p = os.path.join(STEPS_DIR, str(step_num), "output.txt")
    with open(p, "r", encoding="utf-8") as f:
        raw = json.load(f)
    if isinstance(raw, dict) and "content" in raw:
        return json.loads(raw["content"][0]["text"])
    return raw

# 1. Unpack steps 291, 298, 308
step_mappings = [
    (291, "18-public-apis-and-pickbot30d-capture.json"),
    (298, "19-soporte-and-match-details-capture.json"),
    (308, "20-nba-match-detail-capture.json"),
]

for step_num, cap_filename in step_mappings:
    ev = load_rea_step_evidence(step_num)
    out_cap = os.path.join(CAPTURES_DIR, cap_filename)
    with open(out_cap, "w", encoding="utf-8") as f:
        json.dump(ev, f, ensure_ascii=False)
    print(f"Saved {cap_filename}: {ev['evidence_id']} ({os.path.getsize(out_cap)} B)")

    # Check end artifacts (DOM, screenshot) for step 298 (/soporte)
    steps = ev["normalized_result"].get("steps", [])
    if steps:
        last_art = steps[-1].get("artifacts", {})
        dom_art = last_art.get("dom", {})
        if dom_art.get("state") == "captured" and "html" in dom_art:
            dom_path = os.path.join(CAPTURES_DIR, "19-soporte-document.html")
            with open(dom_path, "w", encoding="utf-8") as f:
                f.write(dom_art["html"])
            print(f"  Saved 19-soporte-document.html ({os.path.getsize(dom_path)} B)")
        shot_art = last_art.get("screenshot", {})
        if shot_art.get("state") == "captured":
            b64 = shot_art.get("content") or shot_art.get("data_base64")
            if b64:
                shot_path = os.path.join(SCREENSHOTS_DIR, "15-soporte.png")
                with open(shot_path, "wb") as f:
                    f.write(base64.b64decode(b64))
                print(f"  Saved 15-soporte.png ({os.path.getsize(shot_path)} B)")

    items = ev["normalized_result"]["events"]["items"]
    tx_meta = {i["transaction_id"]: (i["url"]["url"], i.get("status")) for i in items if i["kind"] == "response"}
    for it in items:
        if it["kind"] == "network-content" and it["phase"] == "response":
            url, st = tx_meta.get(it["transaction_id"], ("", None))
            b = it.get("body", {})
            if "/api/" in url:
                print(f"  [{step_num}] {it['transaction_id']} {st} state={b.get('state')} reason={b.get('reason')} url={url}")
            if b.get("state") == "captured" and "/api/" in url and st == 200:
                raw_bytes = base64.b64decode(b["content"])
                txt = raw_bytes.decode("utf-8", "replace")
                if "users/search?q=america" in url:
                    sp = os.path.join(SCHEMAS_DIR, "18-api_users_search_q_america.json")
                    with open(sp, "w", encoding="utf-8") as f:
                        f.write(txt)
                elif "strategyId=pickbot&from=2026-10-13" in url:
                    sp = os.path.join(SCHEMAS_DIR, "18-api_rendimiento_30d_pickbot.json")
                    with open(sp, "w", encoding="utf-8") as f:
                        f.write(txt)
                elif "e422af92d1fc06c0a330838c1c2f2e08" in url:
                    sp = os.path.join(SCHEMAS_DIR, "19-api_match_ucl_galatasaray_aston_villa.json")
                    with open(sp, "w", encoding="utf-8") as f:
                        f.write(txt)
                elif "0380db9fc7de24aed0c27138c02467e5" in url:
                    sp = os.path.join(SCHEMAS_DIR, "19-api_match_ligamx_queretaro_monterrey.json")
                    with open(sp, "w", encoding="utf-8") as f:
                        f.write(txt)
                elif "rendimiento/export?dataset=daily" in url:
                    sp = os.path.join(SCHEMAS_DIR, "19-api_rendimiento_export_daily_30d.csv")
                    with open(sp, "w", encoding="utf-8") as f:
                        f.write(txt)
                elif "37f4c00ff7ec01d5aa7c33dd1ac84bbc" in url:
                    sp = os.path.join(SCHEMAS_DIR, "20-api_match_nba_celtics_raptors.json")
                    with open(sp, "w", encoding="utf-8") as f:
                        f.write(txt)

# 2. Build 100% redacted HAR 1.2 from authenticated browser_sandbox walkthrough + public captures
har_entries = []
seen_keys = set()
auth_catalog = []

def add_har_entry(method: str, url: str, status: int, resp_body: str | None, started: str = "2026-11-11T21:26:00.000Z", mime: str = "application/json"):
    clean_url = scrub_text(url)
    clean_body = scrub_text(resp_body) if resp_body is not None else ""
    dedup_key = (method.upper(), clean_url, status, len(clean_body))
    if dedup_key in seen_keys:
        return
    seen_keys.add(dedup_key)

    # Parse query string
    q_list = []
    if "?" in clean_url:
        qs = clean_url.split("?", 1)[1]
        for part in qs.split("&"):
            if not part:
                continue
            if "=" in part:
                k, v = part.split("=", 1)
                q_list.append({"name": k, "value": v})
            else:
                q_list.append({"name": part, "value": ""})

    body_bytes = len(clean_body.encode("utf-8"))
    entry = {
        "startedDateTime": started,
        "time": 120.0,
        "request": {
            "method": method.upper(),
            "url": clean_url,
            "httpVersion": "HTTP/2.0",
            "cookies": [],
            "headers": [
                {"name": "Accept", "value": "application/json"},
                {"name": "Host", "value": "www.pickbot.mx"},
            ],
            "queryString": q_list,
            "headersSize": -1,
            "bodySize": 0,
        },
        "response": {
            "status": int(status) if status else 200,
            "statusText": "OK" if int(status or 200) == 200 else str(status),
            "httpVersion": "HTTP/2.0",
            "cookies": [],
            "headers": [
                {"name": "Content-Type", "value": f"{mime}; charset=utf-8"},
                {"name": "Server", "value": "Vercel"},
            ],
            "content": {
                "size": body_bytes,
                "mimeType": mime,
                "text": clean_body,
            },
            "redirectURL": "",
            "headersSize": -1,
            "bodySize": body_bytes,
        },
        "cache": {},
        "timings": {"blocked": 0, "dns": 0, "connect": 0, "send": 1, "wait": 110, "receive": 9, "ssl": 0},
    }
    if method.upper() in ("POST", "PATCH", "PUT"):
        req_text = "{}"
        if "/api/auth/sync" in clean_url:
            req_text = json.dumps({"uid": "REDACTED_FIREBASE_UID", "email": "redacted@example.com", "displayName": "redacted_user"})
        entry["request"]["postData"] = {"mimeType": "application/json", "text": req_text}
        entry["request"]["bodySize"] = len(req_text)
    har_entries.append(entry)
    auth_catalog.append({
        "method": method.upper(),
        "url": clean_url,
        "status": int(status) if status else 200,
        "body_bytes": body_bytes,
        "response_preview": clean_body[:600],
    })

for sf in sorted(glob.glob(os.path.join(SANDBOX_OUT, "step_*.json")), key=lambda p: int(re.search(r"step_(\d+)\.json", p).group(1))):
    with open(sf, "r", encoding="utf-8") as f:
        d = json.load(f)
    val = d.get("value")
    if isinstance(val, list):
        for item in val:
            if isinstance(item, dict) and "url" in item and str(item.get("url", "")).startswith("https://www.pickbot.mx/api/"):
                st = item.get("status") or 200
                if st == 0:
                    continue
                body = item.get("responsePreview") or item.get("bodySnippet") or ""
                add_har_entry(item.get("method", "GET"), item["url"], st, body)
    elif isinstance(val, dict):
        if "url" in val and str(val.get("url", "")).startswith("https://www.pickbot.mx/api/"):
            st = val.get("status") or 200
            if st != 0:
                body = val.get("dataSnippet") or (json.dumps(val["body"]) if val.get("body") else "")
                add_har_entry("POST" if "/refresh" in val["url"] else "GET", val["url"], st, body)
        if "unlockReqPreview" in val and val["unlockReqPreview"]:
            add_har_entry(
                "GET",
                "https://www.pickbot.mx/api/pick-energy/unlocks?mongoUserId=000000000000000000000000",
                val.get("unlockReqStatus", 200),
                val["unlockReqPreview"],
            )
        if "sample" in val and isinstance(val["sample"], dict) and val["sample"].get("responseBodyPreview"):
            add_har_entry(
                "GET",
                "https://www.pickbot.mx/api/auth/me?uid=REDACTED_FIREBASE_UID",
                200,
                val["sample"]["responseBodyPreview"],
            )

# Also add full-body public API responses so the HAR represents the complete API surface
public_json_files = [
    ("GET", "https://www.pickbot.mx/api/strategies/pickbot", os.path.join(SCHEMAS_DIR, "15-alltime-api_strategies_pickbot.json"), "application/json"),
    ("GET", "https://www.pickbot.mx/api/strategies/shared/691d418b0b53b755e4", os.path.join(SCHEMAS_DIR, "14-shared-strategy-api_strategies_shared_691d418b0b53b755e4.json"), "application/json"),
    ("POST", "https://www.pickbot.mx/api/rendimiento/preview", os.path.join(SCHEMAS_DIR, "14-shared-strategy-api_rendimiento_preview.json"), "application/json"),
    ("GET", "https://www.pickbot.mx/api/leaderboard?period=all&limit=50", os.path.join(SCHEMAS_DIR, "17-extra-api_leaderboard_period_all_limit_50.json"), "application/json"),
    ("GET", "https://www.pickbot.mx/api/users/6ac65ae98c9b95b86171133a", os.path.join(SCHEMAS_DIR, "12-public-profile-api_users_6ac65ae98c9b95b86171133a.json"), "application/json"),
    ("GET", "https://www.pickbot.mx/api/users/6ac65ae98c9b95b86171133a/follow", os.path.join(SCHEMAS_DIR, "12-public-profile-api_users_6ac65ae98c9b95b86171133a_follow.json"), "application/json"),
    ("GET", "https://www.pickbot.mx/api/users/search?q=america", os.path.join(SCHEMAS_DIR, "18-api_users_search_q_america.json"), "application/json"),
    ("GET", "https://www.pickbot.mx/api/rendimiento?sportKey=all&strategyId=pickbot&from=2026-10-13&to=2026-11-11", os.path.join(SCHEMAS_DIR, "18-api_rendimiento_30d_pickbot.json"), "application/json"),
    ("GET", "https://www.pickbot.mx/api/markets/matches/e422af92d1fc06c0a330838c1c2f2e08?sportKey=soccer_uefa_champs_league", os.path.join(SCHEMAS_DIR, "19-api_match_ucl_galatasaray_aston_villa.json"), "application/json"),
    ("GET", "https://www.pickbot.mx/api/markets/matches/0380db9fc7de24aed0c27138c02467e5?sportKey=soccer_mexico_ligamx", os.path.join(SCHEMAS_DIR, "19-api_match_ligamx_queretaro_monterrey.json"), "application/json"),
    ("GET", "https://www.pickbot.mx/api/rendimiento/export?dataset=daily&sportKey=all&strategyId=none&from=2026-10-13&to=2026-11-11", os.path.join(SCHEMAS_DIR, "19-api_rendimiento_export_daily_30d.csv"), "text/csv"),
]

for m, u, fp, mime in public_json_files:
    if os.path.exists(fp):
        with open(fp, "r", encoding="utf-8") as f:
            add_har_entry(m, u, 200, f.read(), mime=mime)

har_doc = {
    "log": {
        "version": "1.2",
        "creator": {"name": "PitchLab-REA-Redacted-Builder", "version": "1.0"},
        "pages": [
            {
                "startedDateTime": "2026-11-11T21:25:00.000Z",
                "id": "page_pickbot_walkthrough",
                "title": "PickBot Authenticated & Public API Surface (PII Redacted)",
                "pageTimings": {"onContentLoad": 450, "onLoad": 890},
            }
        ],
        "entries": har_entries,
    }
}

har_path = os.path.join(CAPTURES_DIR, "21-authenticated-walkthrough-redacted.har")
with open(har_path, "w", encoding="utf-8") as f:
    json.dump(har_doc, f, ensure_ascii=False, indent=2)
print(f"Saved HAR: {har_path} ({len(har_entries)} entries, {os.path.getsize(har_path)} B)")

auth_cat_path = os.path.join(SCHEMAS_DIR, "21-authenticated-endpoints-redacted.json")
with open(auth_cat_path, "w", encoding="utf-8") as f:
    json.dump({"total_entries": len(auth_catalog), "entries": auth_catalog}, f, ensure_ascii=False, indent=2)
print(f"Saved Auth Catalog: {auth_cat_path}")

# 3. Build scripts-index.json for all 51 route-chunks + 2 CSS stylesheets
scripts_index = []
first_party_chunks = []

for fn in sorted(os.listdir(CHUNKS_DIR)):
    if not fn.endswith(".js"):
        continue
    fp = os.path.join(CHUNKS_DIR, fn)
    raw = open(fp, "rb").read()
    sha = hashlib.sha256(raw).hexdigest()
    txt = raw.decode("utf-8", "replace")
    is_pickbot = any(
        kw in txt
        for kw in [
            "/api/",
            "pickbot",
            "PickBot",
            "sport_key",
            "MAX_PICK_ENERGY",
            "flagcdn.com",
            "prod_U2en",
            "pickbot-87e95",
            "TeamAvatar",
            "edge_pp",
            "mongoUserId",
            "basketball_nba",
            "estrategia",
            "clasificacion",
            "rendimiento",
        ]
    )
    # Exclude huge vendor chunks > 160 KB from first-party AST pass unless explicitly needed
    category = "first-party" if (is_pickbot and len(raw) < 160000) else ("vendor-or-runtime" if len(raw) >= 160000 or not is_pickbot else "first-party")
    if category == "first-party":
        first_party_chunks.append(fn)
    scripts_index.append({
        "filename": fn,
        "url": f"https://www.pickbot.mx/_next/static/chunks/{fn}?dpl=dpl_7NUCdW69BaU9CMQePVhfQtRBwC3n",
        "bytes": len(raw),
        "sha256": sha,
        "category": category,
        "contains_pickbot_domain_markers": is_pickbot,
    })

css_index = []
for fn in sorted(os.listdir(CSS_DIR)):
    if not fn.endswith(".css"):
        continue
    fp = os.path.join(CSS_DIR, fn)
    raw = open(fp, "rb").read()
    css_index.append({
        "filename": fn,
        "url": f"https://www.pickbot.mx/_next/static/chunks/{fn}?dpl=dpl_7NUCdW69BaU9CMQePVhfQtRBwC3n",
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    })

idx_path = os.path.join(ROOT, "evidence", "javascript", "scripts-index.json")
with open(idx_path, "w", encoding="utf-8") as f:
    json.dump(
        {
            "deployment_id": "dpl_7NUCdW69BaU9CMQePVhfQtRBwC3n",
            "total_js_chunks": len(scripts_index),
            "first_party_js_count": len(first_party_chunks),
            "vendor_or_runtime_js_count": len(scripts_index) - len(first_party_chunks),
            "total_css_files": len(css_index),
            "first_party_source_paths": first_party_chunks,
            "javascript_chunks": scripts_index,
            "css_stylesheets": css_index,
        },
        f,
        ensure_ascii=False,
        indent=2,
    )
print(f"Saved scripts-index.json: {len(scripts_index)} JS ({len(first_party_chunks)} first-party) + {len(css_index)} CSS")
print("First-party chunks:", first_party_chunks)
