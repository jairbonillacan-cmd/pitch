import json
import base64
import re
import html as html_mod
from pathlib import Path

cap_path = Path(".worktrees/REA-stats/evidence/captures/01-home-capture.json")
with cap_path.open("r", encoding="utf-8") as f:
    d = json.load(f)

nr = d["normalized_result"]
step = nr["steps"][1]
arts = step["artifacts"]

# Save screenshot
scr_val = arts["screenshot"]["value"]
Path(".worktrees/REA-stats/evidence/screenshots/01-home.png").write_bytes(base64.b64decode(scr_val["data_base64"]))
print("Saved 01-home.png, bytes:", scr_val["bytes"], "sha256:", scr_val["sha256"])

# Save DOM
dom_val = arts["dom"]["value"]
html_text = dom_val["text"]
Path(".worktrees/REA-stats/evidence/captures/01-home.html").write_text(html_text, encoding="utf-8")
print("Saved 01-home.html, bytes:", dom_val["bytes"], "sha256:", dom_val["sha256"])

# Save Accessibility
acc_val = arts["accessibility"]["value"]
Path(".worktrees/REA-stats/evidence/captures/01-home-accessibility.txt").write_text(acc_val["text"], encoding="utf-8")
print("Saved 01-home-accessibility.txt, bytes:", acc_val["bytes"])

# Save Storage
Path(".worktrees/REA-stats/evidence/captures/01-home-storage.json").write_text(
    json.dumps(arts["storage"]["value"], indent=2), encoding="utf-8"
)

# Extract all hrefs
hrefs = sorted(set(re.findall(r'href=["\']([^"\']+)["\']', html_text)))
print("\n--- HREFs found in 01-home.html (" + str(len(hrefs)) + ") ---")
for h in hrefs:
    print(" ", h)

# Extract all wire:snapshot attributes
wires = re.findall(r'wire:snapshot=["\']([^"\']+)["\']', html_text)
print("\n--- Livewire wire:snapshot count:", len(wires), "---")
decoded_wires = []
for idx, w in enumerate(wires):
    unescaped = html_mod.unescape(w)
    try:
        parsed = json.loads(unescaped)
        decoded_wires.append(parsed)
        memo = parsed.get("memo", {})
        data_keys = list(parsed.get("data", {}).keys())
        print(f"  [{idx}] name={memo.get('name')} id={memo.get('id')} path={memo.get('path')} method={memo.get('method')} children={list(memo.get('children', {}).keys())} data_keys={data_keys}")
    except Exception as e:
        print(f"  [{idx}] parse error: {e}")

Path(".worktrees/REA-stats/evidence/captures/01-home-livewire-snapshots.json").write_text(
    json.dumps(decoded_wires, indent=2, ensure_ascii=False), encoding="utf-8"
)
