import glob
import json
import os
import re

def main():
    # 1. Check module 39381 in f9c2a762374fe321.js
    with open("pickbot/evidence/javascript/route-chunks/f9c2a762374fe321.js", "r", encoding="utf-8") as f:
        txt = f.read()
    idx = txt.find("39381")
    print("=== MODULE 39381 (PLANS JSON) ===")
    print(txt[max(0, idx - 80) : idx + 2800])

    # 2. Check external URLs in public payloads
    print("\n=== EXTERNAL URLS IN PUBLIC PAYLOADS ===")
    for p in sorted(glob.glob("pickbot/evidence/network-schemas/*.json")):
        raw = open(p, encoding="utf-8", errors="ignore").read()
        for m in set(re.findall(r'https?://[^"\\\s]+', raw)):
            print(os.path.basename(p), "->", m)

    # 3. Find all JS & CSS chunks referenced across captures, chunks, and browser_sandbox
    existing_js = set(os.listdir("pickbot/evidence/javascript/route-chunks"))
    os.makedirs("pickbot/evidence/css", exist_ok=True)
    existing_css = set(os.listdir("pickbot/evidence/css"))

    found_js = set()
    found_css = set()
    dpl_ids = set()

    sandbox_dir = r"C:\Users\T490s\.gemini\antigravity\brain\85fd27fa-2fc6-403d-84ae-0739e5126307\browser_sandbox\outputs"
    search_paths = (
        glob.glob("pickbot/evidence/captures/*")
        + glob.glob("pickbot/evidence/javascript/route-chunks/*.js")
        + glob.glob(os.path.join(sandbox_dir, "*.json"))
    )
    for p in search_paths:
        if os.path.isfile(p):
            raw = open(p, encoding="utf-8", errors="ignore").read()
            for m in re.findall(r"_next/static/chunks/((?:turbopack-)?[a-f0-9]{16}\.js)", raw):
                found_js.add(m)
            for m in re.findall(r'"((?:turbopack-)?[a-f0-9]{16}\.js)"', raw):
                found_js.add(m)
            for m in re.findall(r"_next/static/chunks/([a-f0-9]{16}\.css)", raw):
                found_css.add(m)
            for m in re.findall(r'"([a-f0-9]{16}\.css)"', raw):
                found_css.add(m)
            for m in re.findall(r"dpl=(dpl_[A-Za-z0-9]+)", raw):
                dpl_ids.add(m)

    missing_js = sorted(found_js - existing_js)
    missing_css = sorted(found_css - existing_css)
    print("\nExisting JS chunks:", len(existing_js))
    print("Total referenced JS chunks:", len(found_js))
    print("Missing JS chunks:", missing_js)
    print("Referenced CSS files:", sorted(found_css))
    print("Missing CSS files:", missing_css)
    print("Deployment IDs:", sorted(dpl_ids))

    # 4. List step files in browser_sandbox/outputs
    step_files = sorted(glob.glob(os.path.join(sandbox_dir, "*.json")))
    print("\nBrowser sandbox output JSON files:", len(step_files))
    for sf in step_files:
        print(" -", os.path.basename(sf), os.path.getsize(sf), "B")


if __name__ == "__main__":
    main()
