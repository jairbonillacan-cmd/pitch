import json
import base64
import re
import sys
import html as html_mod
from pathlib import Path

cap_file = Path(sys.argv[1])
prefix = sys.argv[2]

d = json.loads(cap_file.read_text(encoding="utf-8"))
print(f"=== {prefix} | evidence_id: {d.get('evidence_id')} ===")
steps = d["normalized_result"]["steps"]
last_step = steps[-1]
arts = last_step.get("artifacts", {})

if arts.get("screenshot", {}).get("state") == "captured":
    b64 = arts["screenshot"]["value"]["data_base64"]
    out_png = Path(f".worktrees/REA-stats/evidence/screenshots/{prefix}.png")
    out_png.write_bytes(base64.b64decode(b64))
    print("Saved screenshot:", out_png)

if arts.get("dom", {}).get("state") == "captured":
    html_text = arts["dom"]["value"]["text"]
    out_html = Path(f".worktrees/REA-stats/evidence/captures/{prefix}.html")
    out_html.write_text(html_text, encoding="utf-8")
    print("Saved HTML:", out_html, "len:", len(html_text))

    hrefs = sorted(set(re.findall(r'href=["\']([^"\']+)["\']', html_text)))
    print("HREFs count:", len(hrefs))
    for h in hrefs[:80]:
        if not any(x in h for x in ("bootstrap", "fonts.", "custom_assets")):
            print("  href:", h)

    wires = re.findall(r'wire:snapshot=["\']([^"\']+)["\']', html_text)
    print("Livewire snapshots:", len(wires))
    decoded = []
    for i, w in enumerate(wires):
        p = json.loads(html_mod.unescape(w))
        decoded.append(p)
        data = p.get("data")
        dkeys = list(data.keys()) if isinstance(data, dict) else []
        print(f"  [{i}] name={p['memo'].get('name')} path={p['memo'].get('path')} data_keys={dkeys}")
    Path(f".worktrees/REA-stats/evidence/captures/{prefix}-livewire.json").write_text(
        json.dumps(decoded, indent=2, ensure_ascii=False), encoding="utf-8"
    )
