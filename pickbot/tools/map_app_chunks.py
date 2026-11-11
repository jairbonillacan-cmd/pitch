import json
import re
from pathlib import Path

BASE = Path(r"C:\Users\T490s\.gemini\antigravity\worktrees\PitchLab\explore_pickbot_architecture\pickbot")
js_dir = BASE / "evidence/javascript/home-scripts/files"
manifest = json.loads((BASE / "evidence/javascript/home-scripts/manifest.json").read_text(encoding="utf-8"))

# Map relative_path -> original URL
path_to_url = {}
for s in manifest["scripts"]:
    c = s.get("content", {})
    if c.get("relative_path"):
        path_to_url[c["relative_path"]] = s.get("url")

print("=== CHUNK INVENTORY ===")
app_paths = []
for rel, url in sorted(path_to_url.items()):
    f = js_dir / rel
    txt = f.read_text(encoding="utf-8", errors="ignore")
    first_120 = txt[:120].replace("\n", " ")
    is_google = "googletagmanager" in url or "doubleclick" in url or "vercel" in url
    is_react_dom = "react-dom" in txt[:5000] or "__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED" in txt or "ReactDOM" in txt[:5000]
    print(f"{rel} ({len(txt)} B) -> {url}")
    print(f"   google/ads={is_google} react_dom={is_react_dom} head={first_120[:90]}")
    if not is_google and len(txt) < 200000:
        app_paths.append(rel)

print("\nCandidate app_paths for complete REA JS analysis:", len(app_paths))
for p in app_paths:
    print(" ", p)

# Extract all sport_keys, bookmakers, endpoints, collections, models from source-7, 8, 10, 11, 16, 18
target_chunks = [p for p in path_to_url if any(x in p for x in ("source-7-", "source-8-", "source-10-", "source-11-", "source-16-", "source-18-", "source-1-", "source-2-", "source-5-", "source-9-", "source-12-", "source-14-", "source-15-", "source-17-"))]
all_fetch_calls = set()
all_sport_keys = set()
for rel in sorted(target_chunks):
    txt = (js_dir / rel).read_text(encoding="utf-8", errors="ignore")
    for m in re.finditer(r'fetch\s*\(\s*([^,\)]{1,140})', txt):
        all_fetch_calls.add((rel.split("-")[1], m.group(1).strip()))
    for sk in re.findall(r'["\']((?:soccer|basketball|americanfootball|baseball|icehockey|mma|tennis|boxing|golf|motorsport|rugby|cricket|aussierules)_[a-z0-9_]+)["\']', txt):
        all_sport_keys.add(sk)

print(f"\n=== ALL FETCH CALLS IN CHUNKS ({len(all_fetch_calls)}) ===")
for src, expr in sorted(all_fetch_calls):
    print(f"  [source-{src}] fetch({expr})")

print(f"\n=== ALL SPORT_KEYS IN CHUNKS ({len(all_sport_keys)}) ===")
for sk in sorted(all_sport_keys):
    print(" ", sk)
