import json
import re
from html.parser import HTMLParser
from pathlib import Path

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self._skip = False
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip = True
    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self._skip = False
        elif tag in ("p", "div", "li", "h1", "h2", "h3", "h4", "section", "br"):
            self.parts.append("\n")
    def handle_data(self, data):
        if not self._skip:
            t = data.strip()
            if t:
                self.parts.append(t + " ")

def html_to_text(h: str) -> str:
    p = TextExtractor()
    p.feed(h)
    return re.sub(r"\n{2,}", "\n", "".join(p.parts)).strip()

BASE = Path(r"C:\Users\T490s\.gemini\antigravity\worktrees\PitchLab\explore_pickbot_architecture\pickbot")
chunks_dir = BASE / "evidence/javascript/route-chunks"

print("==========================================")
print("1. PRIVACIDAD & TERMINOS LEGAL DISCLOSURES")
print("==========================================")
for legal_name in ("09-privacidad.html", "10-terminos.html"):
    p = BASE / "evidence/captures" / legal_name
    if p.exists():
        txt = html_to_text(p.read_text(encoding="utf-8", errors="ignore"))
        print(f"\n--- {legal_name} ({len(txt)} chars) ---")
        print(txt[:8000])

print("\n==========================================")
print("2. NEW PUBLIC API PAYLOAD SCHEMAS")
print("==========================================")
for jf in sorted((BASE / "evidence/network-schemas").glob("*.json")):
    txt = jf.read_text(encoding="utf-8", errors="ignore")
    print(f"\n--- {jf.name} ({len(txt)} B) ---")
    print(txt[:1800])

print("\n==========================================")
print("3. ALL 44 JS CHUNKS CLASSIFICATION & API/FORMULA SCAN")
print("==========================================")
first_party_chunks = []
vendor_chunks = []
all_apis = set()
all_urls = set()
all_bookmakers = set()
ai_hits = []
math_hits = []

BOOKIE_CANDIDATES = [
    "fanduel", "draftkings", "betmgm", "caesars", "pointsbet", "betrivers",
    "pinnacle", "bet365", "caliente", "codere", "playdoit", "1xbet", "betway",
    "unibet", "williamhill", "bovada", "betonlineag", "lowvig", "mybookieag",
    "betfair", "marathonbet", "888sport", "bwin", "betsson", "stake", "novibet",
    "rushbet", "betano", "strendus", "winpot", "sportium"
]

for cf in sorted(chunks_dir.glob("*.js")):
    code = cf.read_text(encoding="utf-8", errors="ignore")
    has_pickbot = any(k in code for k in ("/api/", "PickBot", "pickbot", "sportKey", "mongoUserId", "pickEnergy", "edge_pp", "AI Pick Creator"))
    is_vendor = False
    vendor_tag = []
    if "firebase" in code.lower() and "initializeApp" in code and not ("/api/auth/sync" in code):
        vendor_tag.append("firebase-sdk")
    if "react-dom" in code or "__SECRET_INTERNALS" in code or "reconciler" in code:
        vendor_tag.append("react-dom")
    if "Turbopack" in code and len(code) < 15000:
        vendor_tag.append("turbopack-runtime")

    if has_pickbot:
        first_party_chunks.append(cf.name)
    else:
        vendor_chunks.append((cf.name, len(code), vendor_tag))

    # Extract /api/... strings
    for m in re.finditer(r'["\'`](/api/[a-zA-Z0-9_/\-\?\=\&\$\{\}\.\[\]]+)["\'`]', code):
        all_apis.add((cf.name, m.group(1)))

    # Extract https:// URLs
    for m in re.finditer(r'https?://[a-zA-Z0-9\.\-_/\?\=\&\%]+', code):
        u = m.group(0)
        if not any(skip in u for skip in ("reactjs.org", "react.dev", "radix-ui.com", "w3.org", "mozilla.org", "github.com/vercel", "nextjs.org")):
            all_urls.add((cf.name, u))

    # Bookmakers
    low = code.lower()
    for b in BOOKIE_CANDIDATES:
        if re.search(rf'\b{b}\b', low):
            all_bookmakers.add((cf.name, b))

    # AI / Model / Simulation / Prompt / Cost keywords
    for kw in ("allowedModels", "messagesPerConversation", "picksPerMonth", "simulation", "simulaci", "20000", "20,000", "openai", "gpt-", "gemini", "claude", "anthropic", "deepseek", "perplexity", "edge_pp", "impliedProb", "americanToDecimal", "kelly", "parlay", "pick-set", "pick_set", "unlock", "stripe"):
        for m in re.finditer(re.escape(kw), code, re.IGNORECASE):
            start = max(0, m.start() - 120)
            end = min(len(code), m.end() + 180)
            ai_hits.append((cf.name, kw, code[start:end].replace("\n", " ")))

print(f"\nFirst-party chunks ({len(first_party_chunks)}): {first_party_chunks}")
print(f"Vendor/runtime chunks ({len(vendor_chunks)}): {vendor_chunks}")

print(f"\n=== ALL /api/ ENDPOINTS ACROSS 44 CHUNKS ({len(all_apis)}) ===")
for fn, ep in sorted(all_apis, key=lambda x: x[1]):
    print(f"  [{fn}] {ep}")

print(f"\n=== ALL NON-DOC EXTERNAL URLS ACROSS 44 CHUNKS ({len(all_urls)}) ===")
for fn, u in sorted(all_urls, key=lambda x: x[1]):
    print(f"  [{fn}] {u}")

print(f"\n=== BOOKMAKER HITS ({len(all_bookmakers)}) ===")
for fn, b in sorted(all_bookmakers):
    print(f"  [{fn}] {b}")

print(f"\n=== KEYWORD / FORMULA / AI HITS (showing up to 120 unique snippets) ===")
seen_snips = set()
count = 0
for fn, kw, snip in ai_hits:
    key = (fn, snip[:80])
    if key not in seen_snips:
        seen_snips.add(key)
        print(f"  [{fn} | {kw}] {snip}")
        count += 1
        if count >= 120:
            break
