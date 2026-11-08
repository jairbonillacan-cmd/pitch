"""Decode the PAGES blobs (base64 HTML) from the extracted main script.

Finds `PAGES={'fb': '...','nhl': '...','mlb': '...'}` in inline_1.js, base64-decodes
each entry into scripts/pages/<key>.html, and reports sizes. Also extracts the
dec() helper if present for reference. Read-only with respect to the source.
Run with: python3 -I extract_pages.py <inline_1.js> <out_dir>
"""
import base64
import re
import sys
from pathlib import Path

src = Path(sys.argv[1]).read_text(encoding="utf-8", errors="replace")
out_dir = Path(sys.argv[2])
out_dir.mkdir(parents=True, exist_ok=True)

# The PAGES literal: PAGES={'fb': 'AAA...', 'nhl': 'AAA...', ...}
match = re.search(r"PAGES=\{(.*?)\}", src, re.DOTALL)
if not match:
    print("PAGES literal not found")
    sys.exit(1)
inner = match.group(1)
pairs = re.findall(r"'([a-z0-9_]+)'\s*:\s*'([^']*)'", inner)
print(f"PAGES entries: {len(pairs)}")
for key, blob in pairs:
    pad = blob + "=" * (-len(blob) % 4)
    try:
        decoded = base64.b64decode(pad)
        head = decoded[:40]
        out = out_dir / f"{key}.html"
        out.write_bytes(decoded)
        print(f"  {key}: {len(blob)} b64 -> {len(decoded)} bytes, head={head!r}")
    except Exception as exc:  # show why a blob failed
        print(f"  {key}: FAILED ({exc}), head={blob[:40]!r}")
