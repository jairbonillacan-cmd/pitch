import json
import re
import html as html_mod
from pathlib import Path

captures_dir = Path(".worktrees/REA-stats/evidence/captures")
summary = {}

for html_file in sorted(captures_dir.glob("*.html")):
    txt = html_file.read_text(encoding="utf-8")
    wire_clicks = sorted(set(re.findall(r'wire:click(?:\.[a-z]+)*=["\']([^"\']+)["\']', txt)))
    wire_models = sorted(set(re.findall(r'wire:model(?:\.[a-z]+)*=["\']([^"\']+)["\']', txt)))
    data_attrs = sorted(set(re.findall(r'(data-[a-z0-9-]+)=', txt)))
    json_scripts = re.findall(r'<script[^>]*type=["\']application/json["\'][^>]*>(.*?)</script>', txt, re.S)
    
    # Also find large JSON-like data-* attributes
    large_data = []
    for m in re.finditer(r'(data-[a-z0-9-]+)=(["\'])(.*?)\2', txt, re.S):
        attr, _, val = m.groups()
        if len(val) > 200:
            unesc = html_mod.unescape(val)
            large_data.append({
                "attr": attr,
                "len": len(unesc),
                "sample": unesc[:300]
            })

    summary[html_file.name] = {
        "bytes": len(txt),
        "wire_clicks": wire_clicks[:30],
        "wire_models": wire_models[:30],
        "data_attrs": data_attrs,
        "json_scripts_count": len(json_scripts),
        "large_data_attrs_count": len(large_data),
        "large_data_samples": large_data[:10]
    }
    print(f"=== {html_file.name} ({len(txt)} chars) ===")
    print("  wire:click:", wire_clicks[:15])
    print("  wire:model:", wire_models[:15])
    print("  data-* attrs:", [a for a in data_attrs if "sk" in a or "chart" in a or "map" in a or "heat" in a or "pass" in a or "xg" in a or "event" in a or "goal" in a or "momentum" in a or "scatter" in a or "age" in a or "formation" in a or "percentile" in a or "attr" in a][:25])
    print("  large data-* count:", len(large_data), [(x["attr"], x["len"]) for x in large_data[:10]])

Path(".worktrees/REA-stats/evidence/captures/dom-summary.json").write_text(
    json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8"
)
