import json
import re
from pathlib import Path

BASE = Path(r"C:\Users\T490s\.gemini\antigravity\worktrees\PitchLab\explore_pickbot_architecture\pickbot")

# 1. Inspect all 8 routes in 01-home-analyze-web-bundle-routes.json
d60 = json.loads((BASE / "evidence/captures/01-home-analyze-web-bundle-routes.json").read_text(encoding="utf-8"))
print("=== ALL ROUTES IN HOME BUNDLE ===")
for item in d60["normalized_result"]["items"]:
    print(" ", item["path"], "|", item["confidence"], "|", item["provenance"]["mechanism"])

# 2. Inspect network events in 01-home-scenario-capture.json
d57 = json.loads((BASE / "evidence/captures/01-home-scenario-capture.json").read_text(encoding="utf-8"))
ev_items = d57["normalized_result"]["events"]["items"]
print(f"\n=== SCENARIO EVENTS ({len(ev_items)}) ===")
kinds = {}
for e in ev_items:
    k = e.get("kind") or e.get("type")
    kinds[k] = kinds.get(k, 0) + 1
print("event kinds:", kinds)
for e in ev_items:
    k = e.get("kind") or e.get("type")
    if k and ("response" in k or "transaction" in k or "request" in k):
        # Print summary of HTTP responses/transactions
        if "response" in k or "transaction" in k:
            u = e.get("url") or (e.get("request") or {}).get("url")
            if isinstance(u, dict):
                u = u.get("url")
            st = e.get("status") or (e.get("response") or {}).get("status")
            hdrs = e.get("headers") or (e.get("response") or {}).get("headers") or []
            interesting = {h["name"]: h["value"] for h in hdrs if isinstance(h, dict) and h.get("name", "").lower() in ("server", "x-powered-by", "x-vercel-id", "x-vercel-cache", "cf-ray", "content-type", "strict-transport-security", "content-security-policy")}
            body = e.get("body") or (e.get("response") or {}).get("body") or {}
            print(f"  [{k}] {st} {u} | hdrs={interesting} | body={body.get('state')}({body.get('bytes')}B)")

# 3. Scan exported JS files & 01-home.html for URLs, API paths, Firebase config, sports providers, LLM/bot endpoints
js_dir = BASE / "evidence/javascript/home-scripts/files"
print("\n=== EXPORTED JS FILES ===")
url_pattern = re.compile(r'https?://[^\s"\'`<>\\)]+')
api_pattern = re.compile(r'["\'`](/api/[a-zA-Z0-9_/\-\[\]\.?=&]+)["\'`]')
route_pattern = re.compile(r'href\s*:\s*["\'`](/[a-zA-Z0-9_/\-\[\]]*)["\'`]')
firebase_pattern = re.compile(r'(apiKey|authDomain|projectId|storageBucket|messagingSenderId|appId|measurementId)\s*:\s*["\'`]([^"\'`]+)["\'`]')

all_urls = set()
all_apis = set()
all_hrefs = set()
fb_configs = []

for f in sorted(js_dir.rglob("*")):
    if f.is_file():
        txt = f.read_text(encoding="utf-8", errors="ignore")
        print(f"  FILE: {f.relative_to(js_dir)} ({len(txt)} chars)")
        for u in url_pattern.findall(txt):
            if not any(x in u for x in ("w3.org", "reactjs.org", "react.dev", "nextjs.org", "mozilla.org", "github.com/vercel", "npmjs.com", "LICENSE")):
                all_urls.add(u)
        for a in api_pattern.findall(txt):
            all_apis.add(a)
        for r in route_pattern.findall(txt):
            all_hrefs.add(r)
        for k, v in firebase_pattern.findall(txt):
            fb_configs.append((f.name, k, v))

html_txt = (BASE / "evidence/captures/01-home.html").read_text(encoding="utf-8", errors="ignore")
for u in url_pattern.findall(html_txt):
    if "w3.org" not in u:
        all_urls.add(u)
for a in api_pattern.findall(html_txt):
    all_apis.add(a)

print("\n=== FIREBASE CONFIG CANDIDATES ===")
for item in fb_configs:
    print(" ", item)

print("\n=== /api/* CANDIDATES ===")
for a in sorted(all_apis):
    print(" ", a)

print("\n=== HREF CANDIDATES ===")
for r in sorted(all_hrefs):
    print(" ", r)

print("\n=== EXTERNAL URLS IN BUNDLES/HTML ===")
for u in sorted(all_urls):
    print(" ", u)
