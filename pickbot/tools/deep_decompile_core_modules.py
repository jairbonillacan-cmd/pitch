import base64
import json
import re
from pathlib import Path

BASE = Path(r"C:\Users\T490s\.gemini\antigravity\worktrees\PitchLab\explore_pickbot_architecture\pickbot")
chunks_dir = BASE / "evidence/javascript/route-chunks"
out_report = BASE / "evidence/captures/decompiled_findings_raw.txt"

lines = []
def log(s=""):
    lines.append(str(s))

# 1. Extract /privacidad and /terminos HTML response bodies from scenario captures
for lbl in ("09-privacidad", "10-terminos", "08-plan", "02-picks"):
    cap = json.loads((BASE / "evidence/captures" / f"{lbl}-scenario-capture.json").read_text(encoding="utf-8"))
    evs = cap["normalized_result"]["events"]["items"]
    reqs = {e["transaction_id"]: e for e in evs if e.get("kind") == "request"}
    rcs = {e["transaction_id"]: e for e in evs if e.get("kind") == "network-content" and e.get("phase") == "response"}
    for tx_id, rq in reqs.items():
        u = rq.get("url", {})
        u_str = u.get("url") if isinstance(u, dict) else str(u)
        if u_str.rstrip("/").endswith(lbl.split("-", 1)[1]):
            body = rcs.get(tx_id, {}).get("body", {})
            if body.get("state") == "captured" and body.get("encoding") == "base64":
                html = base64.b64decode(body["content"]).decode("utf-8", errors="replace")
                (BASE / "evidence/captures" / f"{lbl}-document.html").write_text(html, encoding="utf-8")
                # Strip tags for text inspection
                clean = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.S|re.I)
                clean = re.sub(r"<style[^>]*>.*?</style>", " ", clean, flags=re.S|re.I)
                clean = re.sub(r"<[^>]+>", "\n", clean)
                clean = re.sub(r"\n\s*\n+", "\n", clean).strip()
                log(f"=== DOCUMENT TEXT: {lbl} ({len(clean)} chars) ===")
                log(clean[:10000])

# 2. Scan ALL 44 chunks for ALL fetch(...) calls, ALL "/api" substrings (even template literals with backticks), and Next Server Actions
log("\n=== ALL FETCH / API / SERVER ACTION PATTERNS ACROSS ALL 44 CHUNKS ===")
for cf in sorted(chunks_dir.glob("*.js")):
    code = cf.read_text(encoding="utf-8", errors="ignore")
    # Every occurrence of /api/ with surrounding 120 chars
    for m in re.finditer(r'/api/[a-zA-Z0-9_/\-]+', code):
        st = max(0, m.start() - 60)
        en = min(len(code), m.end() + 100)
        log(f"[{cf.name}] {code[st:en]}")
    # Server actions (createServerReference)
    for m in re.finditer(r'createServerReference\([^\)]{1,160}\)', code):
        log(f"[{cf.name} SERVER_ACTION] {m.group(0)}")

# 3. Dump full Simulation + Admin Match Pick Context + Math in 01e832ac972c5620.js
log("\n=== DEEP DIVE: 01e832ac972c5620.js (Simulation, Math, Admin Context) ===")
c01 = (chunks_dir / "01e832ac972c5620.js").read_text(encoding="utf-8", errors="ignore")
for anchor in ("function v(", "sport_family_code", "match-pick-context", "matchUnlockCost", "getBetCombinedOdds", " Momios directos", "bookmaker"):
    idx = c01.find(anchor)
    if idx != -1:
        log(f"\n--- 01e832ac972c5620.js @ '{anchor}' (offset {idx}) ---")
        log(c01[max(0, idx - 600):min(len(c01), idx + 5500)])

# 4. Dump /picks AI Pick Creator & Chatbot chunks (968c97a841ab948b.js, b1a4fab04b669688.js, cb5b69c89a2e494c.js, f9c2a762374fe321.js)
for fn in ("968c97a841ab948b.js", "b1a4fab04b669688.js", "cb5b69c89a2e494c.js"):
    code = (chunks_dir / fn).read_text(encoding="utf-8", errors="ignore")
    log(f"\n=== FULL /PICKS CHUNK: {fn} ({len(code)} B) ===")
    log(code[:20000])
    if len(code) > 20000:
        log("--- PART 2 ---")
        log(code[20000:48000])

# Check f9c2a762374fe321.js for Pick Creator / Chat / Sports / Odds / Bookmakers
cf9 = (chunks_dir / "f9c2a762374fe321.js").read_text(encoding="utf-8", errors="ignore")
log(f"\n=== DEEP DIVE: f9c2a762374fe321.js ({len(cf9)} B) ===")
# Find all Turbopack module boundaries in f9c2a762374fe321.js
for m in re.finditer(r'(\d{3,6}),\s*\(e,\s*t,\s*s\)\s*=>|(\d{3,6}),\s*e\s*=>', cf9):
    pos = m.start()
    log(f"Module header at {pos}: {cf9[pos:pos+220]}")
# Also search f9c2a762374fe321.js for AI Pick Creator / chat / model / bookmaker / sport_key
for kw in ("AI Pick Creator", "messagesPerConversation", "allowedModels", "Parlay del", "Rompe momios", "Rápido", "Profundo", "Analista", "bookmaker", "fanduel", "pinnacle", "caliente", "momio"):
    idx = cf9.find(kw)
    if idx != -1:
        log(f"\n--- f9c2a762374fe321.js @ '{kw}' (offset {idx}) ---")
        log(cf9[max(0, idx - 500):min(len(cf9), idx + 3500)])

# 5. Dump Pick Energy + Stripe + Strategy Engine + Uploads chunks
for fn in ("e730e2375a473fd6.js", "66c68b8fed519b4e.js", "dae971cea01c1720.js", "e28be9743872cf14.js", "5d3ff053c1cadced.js", "46d33aee8f2857f7.js", "edabb558bc566d6c.js"):
    code = (chunks_dir / fn).read_text(encoding="utf-8", errors="ignore")
    log(f"\n=== MODULE DUMP: {fn} ({len(code)} B) ===")
    log(code[:18000])
    if len(code) > 18000:
        log("--- TAIL ---")
        log(code[18000:38000])

out_report.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {out_report} ({out_report.stat().st_size} bytes, {len(lines)} lines)")
