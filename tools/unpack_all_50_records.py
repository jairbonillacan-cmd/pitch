import json
import base64
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

steps_dir = Path(r"C:\Users\T490s\.gemini\antigravity\brain\672dc0a7-a1f7-41a2-a5d6-62b96abaa3f8\.system_generated\steps")
worktree = Path(r"c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats")
out_cap = worktree / "evidence" / "captures"
out_scr = worktree / "evidence" / "screenshots"
out_net = worktree / "evidence" / "network-schemas"
out_css = worktree / "evidence" / "css"

def unpack_record(d: dict, prefix: str, save_json: bool = True):
    eid = d.get("evidence_id")
    print(f"=== {prefix} | {eid} ===")
    if save_json:
        # Don't write >5MB json into captures if it's huge, or strip large base64
        raw_str = json.dumps(d, ensure_ascii=False)
        if len(raw_str) < 5_000_000:
            (out_cap / f"{prefix}-capture.json").write_text(raw_str, encoding="utf-8")

    nr = d.get("normalized_result") or {}
    steps = nr.get("steps", [])
    for s in steps:
        sid = s.get("step_id")
        st = s.get("status")
        arts = s.get("artifacts", {})
        dom = arts.get("dom", {})
        scr = arts.get("screenshot", {})
        if dom.get("state") == "captured":
            html_txt = dom["value"]["text"]
            html_name = f"{prefix}-{sid}.html" if len(steps) > 2 else f"{prefix}.html"
            (out_cap / html_name).write_text(html_txt, encoding="utf-8")
            print(f"  saved HTML: {html_name} ({len(html_txt)} B)")
        if scr.get("state") == "captured":
            b64 = scr["value"]["data_base64"]
            png_name = f"{prefix}-{sid}.png" if len(steps) > 2 and sid != steps[-1].get("step_id") else f"{prefix}.png"
            (out_scr / png_name).write_bytes(base64.b64decode(b64))
            print(f"  saved PNG: {png_name}")

    events = nr.get("events", {}).get("items", [])
    reqs = {e["transaction_id"]: e for e in events if e.get("kind") == "request"}
    resps = {e["transaction_id"]: e for e in events if e.get("kind") == "response"}
    req_bodies = {e["transaction_id"]: e for e in events if e.get("kind") == "network-content" and e.get("phase") == "request"}
    resp_bodies = {e["transaction_id"]: e for e in events if e.get("kind") == "network-content" and e.get("phase") == "response"}

    for tid, req in reqs.items():
        method = req.get("method", "")
        url = req.get("url", {}).get("url", "")
        status = resps.get(tid, {}).get("status")

        rb = req_bodies.get(tid, {}).get("body", {})
        req_txt = rb.get("content", "")
        if rb.get("encoding") == "base64" and req_txt:
            req_txt = base64.b64decode(req_txt).decode("utf-8", errors="replace")

        rsb = resp_bodies.get(tid, {}).get("body", {})
        resp_txt = rsb.get("content", "")
        if rsb.get("encoding") == "base64" and resp_txt:
            resp_txt = base64.b64decode(resp_txt).decode("utf-8", errors="replace")

        # Save CSS files from 25-all-10-missing-css-files
        if "/custom_assets/css/" in url and resp_txt:
            css_name = url.split("/custom_assets/css/")[1].split("?")[0]
            css_path = out_css / css_name
            if not css_path.exists() or prefix == "25-css-files":
                css_path.write_text(resp_txt, encoding="utf-8")
                print(f"  saved CSS: {css_name} ({len(resp_txt)} B)")

        if method == "POST" or "livewire-e3175f40/update" in url or "/search" in url:
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
            if resp_txt:
                (out_net / f"{prefix}-{tid}-response.json").write_text(resp_txt, encoding="utf-8")

# 1. Unpack inline step outputs from steps 378, 379, 380, 383
for step_num, prefix in [
    (378, "17b-match-lideres-tabla-h2h-gkmodal"),
    (379, "19b-players-teams-tab"),
    (380, "25-css-files"),
    (383, "27-goalkeeper-rpc"),
]:
    p = steps_dir / str(step_num) / "output.txt"
    if p.exists():
        d = json.loads(p.read_text(encoding="utf-8"))
        if "result" in d and isinstance(d["result"], dict) and "evidence_id" in d["result"]:
            d = d["result"]
        unpack_record(d, prefix)

# 2. Unpack heavy records from rea-evidence-bundle.json
bundle_path = worktree / "evidence" / "rea-evidence-bundle.json"
b = json.loads(bundle_path.read_text(encoding="utf-8"))

heavy_map = {
    "ev_0700c65f2578ac47321b10307b377cc8c867c497219d6853bba0e13b4570ecba": "18-league-remaining-tabs-full",
    "ev_41b5aea3bed59d22cc2341601bbb6e439bbddbfe0f29718f52b6d936339f0f29": "26-player-rpc-full",
    "ev_74a52e0220f984a17430b4b2b419aa9f80fa8d74ef2ff815ea1436e3eaf8b0e9": "28-match-alineaciones-rpc-full",
}

for r in b.get("records", []):
    eid = r.get("evidence_id")
    if eid in heavy_map:
        unpack_record(r, heavy_map[eid], save_json=False)

# 3. Save unknowns and updated summary
unknowns = b.get("unknowns", [])
(worktree / "evidence" / "rea-unknowns.json").write_text(json.dumps(unknowns, indent=2, ensure_ascii=False), encoding="utf-8")

summary_records = []
for r in b.get("records", []):
    summary_records.append({
        "evidence_id": r.get("evidence_id"),
        "operation": r.get("operation"),
        "authority": r.get("authority"),
        "confidence": r.get("confidence"),
        "provider": r.get("provider"),
        "subject": r.get("subject"),
        "limitation_count": len(r.get("limitations") or []),
    })
summary_obj = {
    "total_retained_records": len(summary_records),
    "unknown_count": len(unknowns),
    "records": summary_records,
    "unknowns": unknowns,
}
(worktree / "evidence" / "rea-evidence-summary.json").write_text(json.dumps(summary_obj, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Updated rea-evidence-summary.json: {len(summary_records)} records, {len(unknowns)} unknowns")
