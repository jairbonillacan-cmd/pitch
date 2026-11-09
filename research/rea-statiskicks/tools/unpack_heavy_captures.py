import json
import base64
from pathlib import Path

bundle_path = Path(r"c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats\evidence\rea-evidence-bundle.json")
out_net = Path(r"c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats\evidence\network-schemas")
out_cap = Path(r"c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats\evidence\captures")
out_scr = Path(r"c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats\evidence\screenshots")

b = json.loads(bundle_path.read_text(encoding="utf-8"))

targets = {
    "ev_8b664e194ac67d05a98289a150adcb3f310fb2622bcc70a084ab5c7d978cb365": "03b-team-full",
    "ev_bba17f5b8205d109afaa59748445fa3e6b8b763f44c88cfbb1a22847a3d405b9": "04b-messi-full",
}

summary = []
for r in b["records"]:
    eid = r["evidence_id"]
    if eid not in targets:
        continue
    prefix = targets[eid]
    nr = r["normalized_result"]
    steps = nr.get("steps", [])
    if steps:
        last_arts = steps[-1].get("artifacts", {})
        if last_arts.get("dom", {}).get("state") == "captured":
            html_text = last_arts["dom"]["value"]["text"]
            (out_cap / f"{prefix}.html").write_text(html_text, encoding="utf-8")
            summary.append(f"{prefix}.html saved ({len(html_text)} B)")
        if last_arts.get("screenshot", {}).get("state") == "captured":
            b64 = last_arts["screenshot"]["value"]["data_base64"]
            (out_scr / f"{prefix}.png").write_bytes(base64.b64decode(b64))
            summary.append(f"{prefix}.png saved")

    events = nr.get("events", {}).get("items", [])
    reqs = {e["transaction_id"]: e for e in events if e.get("kind") == "request"}
    resps = {e["transaction_id"]: e for e in events if e.get("kind") == "response"}
    req_bodies = {e["transaction_id"]: e for e in events if e.get("kind") == "network-content" and e.get("phase") == "request"}
    resp_bodies = {e["transaction_id"]: e for e in events if e.get("kind") == "network-content" and e.get("phase") == "response"}

    for tid, req in reqs.items():
        method = req.get("method", "")
        url = req.get("url", {}).get("url", "")
        if method == "POST" or "livewire" in url or "search" in url:
            rb = req_bodies.get(tid, {}).get("body", {})
            req_txt = rb.get("content", "")
            if rb.get("encoding") == "base64" and req_txt:
                req_txt = base64.b64decode(req_txt).decode("utf-8", errors="replace")

            rsb = resp_bodies.get(tid, {}).get("body", {})
            resp_txt = rsb.get("content", "")
            if rsb.get("encoding") == "base64" and resp_txt:
                resp_txt = base64.b64decode(resp_txt).decode("utf-8", errors="replace")

            calls_desc = ""
            try:
                rj = json.loads(req_txt)
                calls = []
                for c in rj.get("components", []):
                    for call in c.get("calls", []):
                        calls.append(f"{call.get('method')}({call.get('params')})")
                calls_desc = ", ".join(calls)
            except Exception:
                pass

            summary.append(f"  {prefix} {tid}: {method} {url} | calls=[{calls_desc}] | req={len(req_txt)}B | resp={len(resp_txt)}B")
            if req_txt:
                (out_net / f"{prefix}-{tid}-request.json").write_text(req_txt, encoding="utf-8")
            if resp_txt:
                (out_net / f"{prefix}-{tid}-response.json").write_text(resp_txt, encoding="utf-8")

    # Also check console/page-error events!
    for e in events:
        if e.get("kind") in ("console", "page-error"):
            summary.append(f"  {prefix} [{e.get('kind')}]: {json.dumps(e, ensure_ascii=False)}")

Path(r"c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats\tools\unpacked_summary.txt").write_text("\n".join(summary), encoding="utf-8")
print("Done. Lines:", len(summary))
