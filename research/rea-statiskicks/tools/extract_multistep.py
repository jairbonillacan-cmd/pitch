import json
import base64
import re
import html as html_mod
from pathlib import Path

def process_multistep(cap_path: Path, prefix: str):
    d = json.loads(cap_path.read_text(encoding="utf-8"))
    print(f"=== {prefix} | evidence_id: {d.get('evidence_id')} ===")
    nr = d["normalized_result"]
    for s in nr.get("steps", []):
        sid = s.get("step_id")
        st = s.get("status")
        arts = s.get("artifacts", {})
        dom = arts.get("dom", {})
        scr = arts.get("screenshot", {})
        print(f"  step {sid}: {st} | dom={dom.get('state')} ({dom.get('value', {}).get('bytes') if isinstance(dom.get('value'), dict) else None} B) | scr={scr.get('state')}")
        if dom.get("state") == "captured" and sid.startswith("wait-"):
            txt = dom["value"]["text"]
            out_html = Path(f".worktrees/REA-stats/evidence/captures/{prefix}-{sid}.html")
            out_html.write_text(txt, encoding="utf-8")
            # Extract any application/json scripts or large JSON data-* attributes
            for idx, m in enumerate(re.finditer(r'<script([^>]*type=["\']application/json["\'][^>]*)>(.*?)</script>', txt, re.S)):
                attrs, body = m.groups()
                print(f"    JSON script [{idx}] attrs={attrs.strip()} len={len(body)}")
                attr_name = re.findall(r'data-[a-z0-9-]+', attrs)
                slug = attr_name[0] if attr_name else f"json-{idx}"
                Path(f".worktrees/REA-stats/evidence/network-schemas/{prefix}-{sid}-{slug}.json").write_text(body.strip(), encoding="utf-8")
            for m in re.finditer(r'(data-[a-z0-9-]+)=(["\'])(\s*[\{\[].*?)\2', txt, re.S):
                attr, _, val = m.groups()
                unesc = html_mod.unescape(val)
                if len(unesc) > 80:
                    print(f"    JSON data-attr {attr}: len={len(unesc)} sample={unesc[:120]}...")
                    Path(f".worktrees/REA-stats/evidence/network-schemas/{prefix}-{sid}-{attr}.json").write_text(unesc, encoding="utf-8")
        if scr.get("state") == "captured":
            b64 = scr["value"]["data_base64"]
            Path(f".worktrees/REA-stats/evidence/screenshots/{prefix}-{sid}.png").write_bytes(base64.b64decode(b64))

    # Also extract Livewire POST request bodies
    events = nr.get("events", {}).get("items", [])
    reqs = {e["transaction_id"]: e for e in events if e["kind"] == "request"}
    req_bodies = {e["transaction_id"]: e for e in events if e["kind"] == "network-content" and e.get("phase") == "request"}
    for tid, req in reqs.items():
        if req.get("method") == "POST":
            url = req["url"]["url"]
            b = req_bodies.get(tid, {}).get("body", {})
            content = b.get("content", "")
            if b.get("encoding") == "base64" and content:
                content = base64.b64decode(content).decode("utf-8", errors="replace")
            print(f"  POST {tid} -> {url} | body len={len(content)} sample={content[:200]}...")
            Path(f".worktrees/REA-stats/evidence/network-schemas/{prefix}-post-{tid}.json").write_text(content, encoding="utf-8")

process_multistep(Path(".worktrees/REA-stats/evidence/captures/13-match-tabs-capture.json"), "13-match-tabs")
process_multistep(Path(".worktrees/REA-stats/evidence/captures/14-league-tabs-capture.json"), "14-league-tabs")
