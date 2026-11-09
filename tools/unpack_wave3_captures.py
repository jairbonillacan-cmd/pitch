import base64
import json
import shutil
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(r"c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats")
EVIDENCE = ROOT / "evidence"
OUT_CAP = EVIDENCE / "captures"
OUT_SCR = EVIDENCE / "screenshots"
OUT_NET = EVIDENCE / "network-schemas"
ARTIFACT_DIR = Path(r"C:\Users\T490s\.gemini\antigravity\brain\672dc0a7-a1f7-41a2-a5d6-62b96abaa3f8")

# Remove empty evidence/pages directory if created earlier
pages_dir = EVIDENCE / "pages"
if pages_dir.exists():
    shutil.rmtree(pages_dir, ignore_errors=True)

bundle_path = EVIDENCE / "rea-evidence-bundle.json"
print(f"Loading {bundle_path} ({bundle_path.stat().st_size} bytes)...")
b = json.loads(bundle_path.read_text(encoding="utf-8"))

wave3_map = {
    "ev_a1d8facdf931a87bf33ba5e703e23d73cd2ee0c4550557ba3b84cdb9a1c10088": "29-locked-league-and-team-tabs",
    "ev_9435086f6ae02ff0707fefa83c7cf473eda660deed890524e621cb9825c97446": "30-player-tabs-compare-desempeno-modals",
    "ev_04b1ede55ec1bd3f547cd81c48dc5a1fc2e4e8b8f9a9020481a3e35092a126e8": "31-players-statranges-and-matches-hub",
    "ev_29b855423c405747f62b135a8e740ea6f51016bfd5f5e06d85762496b82e346e": "32-dark-mode-and-mobile-match-pitch",
}


def unpack_record(d: dict, prefix: str):
    eid = d.get("evidence_id")
    print(f"=== {prefix} | {eid} ===")
    nr = d.get("normalized_result") or {}
    steps = nr.get("steps", [])
    step_summaries = []
    for s in steps:
        sid = s.get("step_id")
        st = s.get("status")
        err = s.get("error")
        url_after = (s.get("after_url") or {}).get("url")
        arts = s.get("artifacts", {})
        dom = arts.get("dom", {})
        scr = arts.get("screenshot", {})
        dom_len = 0
        if dom.get("state") == "captured":
            html_txt = dom["value"]["text"]
            dom_len = len(html_txt)
            # Save key step HTMLs (wait-*, goto-*, click-*, scenario_end)
            if sid.startswith(("wait-", "goto-", "nav-")) or sid in ("scenario_end", "click-period-pill", "click-prev-day", "click-alineaciones-mobile"):
                html_name = f"{prefix}-{sid}.html"
                (OUT_CAP / html_name).write_text(html_txt, encoding="utf-8")
                print(f"  saved HTML: {html_name} ({dom_len} B) url={url_after}")
        if scr.get("state") == "captured":
            b64 = scr["value"]["data_base64"]
            png_name = f"{prefix}.png" if sid == steps[-1].get("step_id") else f"{prefix}-{sid}.png"
            out_png = OUT_SCR / png_name
            out_png.write_bytes(base64.b64decode(b64))
            shutil.copy2(out_png, ARTIFACT_DIR / png_name)
            print(f"  saved PNG: {png_name} ({out_png.stat().st_size} B)")
        step_summaries.append({
            "step_id": sid,
            "status": st,
            "error": err,
            "after_url": url_after,
            "dom_bytes": dom_len,
            "screenshot_state": scr.get("state"),
        })

    events = (nr.get("events") or {}).get("items", [])
    reqs = {e["transaction_id"]: e for e in events if e.get("kind") == "request"}
    resps = {e["transaction_id"]: e for e in events if e.get("kind") == "response"}
    req_bodies = {e["transaction_id"]: e for e in events if e.get("kind") == "network-content" and e.get("phase") == "request"}
    resp_bodies = {e["transaction_id"]: e for e in events if e.get("kind") == "network-content" and e.get("phase") == "response"}

    net_summary = []
    for tid, req in reqs.items():
        method = req.get("method", "")
        url = (req.get("url") or {}).get("url", "")
        status = (resps.get(tid) or {}).get("status")
        resp_headers = (resps.get(tid) or {}).get("headers")

        rb = (req_bodies.get(tid) or {}).get("body", {})
        req_txt = rb.get("content", "")
        if rb.get("encoding") == "base64" and req_txt:
            req_txt = base64.b64decode(req_txt).decode("utf-8", errors="replace")

        rsb = (resp_bodies.get(tid) or {}).get("body", {})
        resp_txt = rsb.get("content", "")
        if rsb.get("encoding") == "base64" and resp_txt:
            resp_txt = base64.b64decode(resp_txt).decode("utf-8", errors="replace")

        is_interesting = (
            method == "POST"
            or "livewire-e3175f40/update" in url
            or "/players/search" in url
            or "/robots.txt" in url
            or "/sitemap.xml" in url
            or url.endswith("/up")
            or "/league/7ut48s80k421xixh6ev5i6h62" in url
            or "/partidos?fecha=" in url
        )
        if is_interesting:
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
                (OUT_NET / f"{prefix}-{tid}-request.json").write_text(req_txt, encoding="utf-8")
            if resp_txt and "livewire.min.js" not in url and len(resp_txt) < 500_000:
                ext = "json" if resp_txt.lstrip().startswith(("{", "[")) else "txt"
                (OUT_NET / f"{prefix}-{tid}-response.{ext}").write_text(resp_txt, encoding="utf-8")
            net_summary.append({
                "transaction_id": tid,
                "method": method,
                "url": url,
                "status": status,
                "calls": calls_desc,
                "req_bytes": len(req_txt),
                "resp_bytes": len(resp_txt),
                "response_headers": resp_headers,
            })

    (OUT_NET / f"{prefix}-capture-summary.json").write_text(
        json.dumps({
            "evidence_id": eid,
            "scenario_prefix": prefix,
            "steps": step_summaries,
            "interesting_transactions": net_summary,
        }, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


for r in b.get("records", []):
    eid = r.get("evidence_id")
    if eid in wave3_map:
        unpack_record(r, wave3_map[eid])

# Update rea-unknowns.json and rea-evidence-summary.json
unknowns = b.get("unknowns", [])
(EVIDENCE / "rea-unknowns.json").write_text(json.dumps(unknowns, indent=2, ensure_ascii=False), encoding="utf-8")

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
(EVIDENCE / "rea-evidence-summary.json").write_text(json.dumps(summary_obj, indent=2, ensure_ascii=False), encoding="utf-8")
print(f"Updated rea-evidence-summary.json: {len(summary_records)} records, {len(unknowns)} unknowns")

# Remove >5MB duplicate raw evidence files so git stays clean
if bundle_path.exists():
    bundle_path.unlink()
    print("Removed temporary 567MB rea-evidence-bundle.json after unpacking")
agentenv_ev = EVIDENCE / "agentenv-statiskicks" / "envs" / "statiskicks-web-env" / "evidence.json"
if agentenv_ev.exists():
    agentenv_ev.unlink()
    print("Removed 4.7MB duplicate agentenv evidence.json (retained manifest.json, verify.py, Dockerfile, env.toml, smoke.json, README.md)")
