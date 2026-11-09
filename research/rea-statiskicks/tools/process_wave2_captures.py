import json
import base64
import re
import html as html_mod
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

steps_dir = Path(r"C:\Users\T490s\.gemini\antigravity\brain\672dc0a7-a1f7-41a2-a5d6-62b96abaa3f8\.system_generated\steps")
out_cap = Path(r"c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats\evidence\captures")
out_scr = Path(r"c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats\evidence\screenshots")
out_net = Path(r"c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats\evidence\network-schemas")

wave2 = [
    (345, "15-player-tabs-and-events"),
    (346, "16-goalkeeper-profile"),
    (347, "17-match-remaining-tabs"),
    (358, "19-players-explorer-and-teams-tab"),
    (359, "20-contacto"),
    (361, "21-privacidad"),
    (362, "22-terminos"),
    (363, "23-forgot-password"),
    (367, "18a-league-leaders-standings-results"),
    (368, "18b-league-calendar-stats"),
    (369, "24-players-search-and-oauth"),
]

for step_num, prefix in wave2:
    src = steps_dir / str(step_num) / "output.txt"
    if not src.exists():
        print(f"Missing step {step_num}")
        continue
    raw = src.read_text(encoding="utf-8")
    d = json.loads(raw)
    if "result" in d and isinstance(d["result"], dict) and "evidence_id" in d["result"]:
        d = d["result"]
    eid = d.get("evidence_id")
    print(f"=== {prefix} (step {step_num}) | {eid} ===")
    # Save compact capture json
    (out_cap / f"{prefix}-capture.json").write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")

    nr = d.get("normalized_result", {})
    steps = nr.get("steps", [])
    for s in steps:
        sid = s.get("step_id")
        st = s.get("status")
        err = s.get("error")
        arts = s.get("artifacts", {})
        dom = arts.get("dom", {})
        scr = arts.get("screenshot", {})
        url_after = s.get("after_url", {}).get("url")
        print(f"  step [{sid}] status={st} err={err} url={url_after} dom={dom.get('state')} scr={scr.get('state')}")
        if dom.get("state") == "captured":
            html_txt = dom["value"]["text"]
            html_name = f"{prefix}-{sid}.html" if len(steps) > 2 else f"{prefix}.html"
            (out_cap / html_name).write_text(html_txt, encoding="utf-8")
        if scr.get("state") == "captured":
            b64 = scr["value"]["data_base64"]
            png_name = f"{prefix}-{sid}.png" if len(steps) > 2 and sid != steps[-1].get("step_id") else f"{prefix}.png"
            (out_scr / png_name).write_bytes(base64.b64decode(b64))

    events = nr.get("events", {}).get("items", [])
    reqs = {e["transaction_id"]: e for e in events if e.get("kind") == "request"}
    resps = {e["transaction_id"]: e for e in events if e.get("kind") == "response"}
    req_bodies = {e["transaction_id"]: e for e in events if e.get("kind") == "network-content" and e.get("phase") == "request"}
    resp_bodies = {e["transaction_id"]: e for e in events if e.get("kind") == "network-content" and e.get("phase") == "response"}

    for tid, req in reqs.items():
        method = req.get("method", "")
        url = req.get("url", {}).get("url", "")
        status = resps.get(tid, {}).get("status")
        if method == "POST" or "livewire" in url or "search" in url or "google" in url or "accounts.google" in url:
            rb = req_bodies.get(tid, {}).get("body", {})
            req_txt = rb.get("content", "")
            if rb.get("encoding") == "base64" and req_txt:
                req_txt = base64.b64decode(req_txt).decode("utf-8", errors="replace")

            rsb = resp_bodies.get(tid, {}).get("body", {})
            resp_txt = rsb.get("content", "")
            if rsb.get("encoding") == "base64" and resp_txt:
                resp_txt = base64.b64decode(resp_txt).decode("utf-8", errors="replace")

            calls_desc = ""
            if req_txt:
                try:
                    rj = json.loads(req_txt)
                    calls = []
                    for c in rj.get("components", []):
                        for call in c.get("calls", []):
                            calls.append(f"{call.get('method')}({call.get('params')})")
                        if c.get("updates"):
                            calls.append(f"updates={list(c.get('updates').keys())}")
                    calls_desc = ", ".join(calls)
                except Exception:
                    pass
            print(f"  NET {tid}: {method} {url} [{status}] | calls=[{calls_desc}] | req={len(req_txt)}B | resp={len(resp_txt)}B")
            if req_txt:
                (out_net / f"{prefix}-{tid}-request.json").write_text(req_txt, encoding="utf-8")
            if resp_txt and "livewire.min.js" not in url:
                (out_net / f"{prefix}-{tid}-response.json").write_text(resp_txt, encoding="utf-8")

# Discover all external CSS and JS across all HTML files
all_css = set()
all_js = set()
for f in out_cap.glob("*.html"):
    txt = f.read_text(encoding="utf-8")
    for m in re.findall(r'<link[^>]*href=["\']([^"\']+\.css[^"\']*)["\']', txt, re.I):
        if "statiskicks.com" in m:
            all_css.add(m)
    for m in re.findall(r'<script[^>]*src=["\']([^"\']+)["\']', txt, re.I):
        if "statiskicks.com" in m:
            all_js.add(m)

print("=== ALL STATISKICKS CSS FILES DISCOVERED ===")
for c in sorted(all_css):
    print(" ", c)
print("=== ALL STATISKICKS JS FILES DISCOVERED ===")
for j in sorted(all_js):
    print(" ", j)
