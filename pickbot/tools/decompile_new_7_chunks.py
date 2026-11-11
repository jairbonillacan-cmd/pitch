import json
import os
import re

JS_DIR = "pickbot/evidence/javascript/route-chunks"
NEW_CHUNKS = [
    "b297d412266b6464.js",
    "e62978f1d163b3ba.js",
    "727ad43a47a73d31.js",
    "9f3bf131c0c314ee.js",
    "ac282bd7cb74dc3b.js",
    "a6dad97d9634a72d.js",
    "ccce59f1fd59f1da.js",
]

def main():
    # 1. Check steps in 15-alltime capture
    d15 = json.load(open("pickbot/evidence/captures/15-alltime-rendimiento-and-infra-capture.json", encoding="utf-8"))
    print("=== STEPS IN 15-ALLTIME ===")
    for st in d15["normalized_result"]["steps"]:
        print(st["step_index"], st["step_id"], st["status"], st.get("error"), f"events {st['event_sequence_start']}..{st['event_sequence_end']}")
    print("\n=== ALL RESPONSES IN 15-ALLTIME ===")
    tx_url = {}
    for ev in d15["normalized_result"]["events"]["items"]:
        tid = ev.get("transaction_id")
        if ev.get("kind") == "request":
            tx_url[tid] = ev.get("url", {}).get("url")
        elif ev.get("kind") == "response":
            print(" ", tid, ev.get("status"), tx_url.get(tid))
        elif ev.get("kind") == "network-content" and ev.get("phase") == "response":
            b = ev.get("body", {})
            print("   -> body state:", b.get("state"), "bytes:", b.get("bytes"), "url:", tx_url.get(tid))

    # 2. Decompile / summarize the 7 new chunks
    out_lines = []
    for fn in NEW_CHUNKS:
        fp = os.path.join(JS_DIR, fn)
        txt = open(fp, encoding="utf-8", errors="replace").read()
        apis = sorted(set(re.findall(r"/api/[a-zA-Z0-9/_${}?=&.-]+", txt)))
        urls = sorted(set(re.findall(r"https?://[a-zA-Z0-9./_${}?=&-]+", txt)))
        exports = re.findall(r'e\.s\(\[(.*?)\]\)', txt)
        print(f"\n=== NEW CHUNK: {fn} ({len(txt)} B) ===")
        print("  APIs:", apis)
        print("  URLs:", urls[:15])
        print("  Exports:", exports[:15])
        if fn in ("b297d412266b6464.js", "e62978f1d163b3ba.js", "727ad43a47a73d31.js", "9f3bf131c0c314ee.js", "ac282bd7cb74dc3b.js"):
            out_lines.append(f"=== FULL DUMP: {fn} ({len(txt)} B) ===\n{txt}\n")

    with open("pickbot/evidence/captures/new_7_chunks_decompiled.txt", "w", encoding="utf-8") as fp:
        fp.write("\n".join(out_lines))
    print("\nWrote pickbot/evidence/captures/new_7_chunks_decompiled.txt")


if __name__ == "__main__":
    main()
