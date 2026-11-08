"""Extract inline <script> blocks from the captured HTML into separate files.

Reads the untrusted downloaded HTML from raw/, writes extracted scripts to
scripts/ so REA's analyze_javascript_application can consume them.
Run with: python3 -I extract_scripts.py <html_path> <out_dir>
"""
import re
import sys
from pathlib import Path

html_path = Path(sys.argv[1])
out_dir = Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)

text = html_path.read_text(encoding="utf-8", errors="replace")
pattern = re.compile(r"<script([^>]*)>(.*?)</script>", re.DOTALL | re.IGNORECASE)
count = 0
for match in pattern.finditer(text):
    attrs = match.group(1)
    body = match.group(2)
    if body.strip() == "":
        continue
    if "src=" in attrs:
        continue  # external scripts were already confirmed absent
    count += 1
    out = out_dir / f"inline_{count}.js"
    out.write_text(body, encoding="utf-8")
    print(f"inline_{count}.js: {len(body)} bytes, attrs={attrs.strip()[:80]}")
print(f"total: {count} inline scripts")
