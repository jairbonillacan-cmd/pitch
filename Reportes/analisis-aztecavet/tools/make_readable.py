"""Create readable copies of the extracted scripts with base64 blobs stripped.

Replaces giant string literals (PAGES blobs, base64 images, SVG art) with short
placeholders, then does a naive beautify (newline after ; { and before }) so the
logic can be read linearly. Read-only with respect to sources.
Run with: python3 -I make_readable.py
"""
import re
from pathlib import Path

base = Path(__file__).resolve().parent.parent
out = base / "readable"
out.mkdir(exist_ok=True)


def strip_blobs(s: str) -> str:
    # base64-ish long runs (>200 chars) -> placeholder
    s = re.sub(r"'[A-Za-z0-9+/=]{200,}'", "'<B64:BLOB>'", s)
    s = re.sub(r'"data:image/[a-z]+;base64,[^"]{100,}"', '"<IMG_B64>"', s)
    s = re.sub(r"'data:image/[a-z]+;base64,[^']{100,}'", "'<IMG_B64>'", s)
    # long single-quoted strings that are template-ish HTML (SVG art etc.)
    s = re.sub(r"'<svg[^']{300,}'", "'<SVG_ART>'", s)
    s = re.sub(r"`<svg[^`]{300,}`", "`<SVG_ART>`", s)
    return s


def beautify(s: str) -> str:
    s = strip_blobs(s)
    # protect strings: naive approach — only break outside quotes for common cases
    out_lines = []
    depth = 0
    buf = ""
    in_s = None  # current quote char
    esc = False
    tmpl_depth = 0
    for ch in s:
        buf += ch
        if in_s:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == in_s:
                in_s = None
            continue
        if ch in ("'", '"', "`"):
            in_s = ch
            continue
        if ch == "{":
            depth += 1
            out_lines.append("  " * (depth - 1) + buf.strip())
            buf = ""
        elif ch == "}":
            out_lines.append("  " * (depth - 1) + buf.strip())
            depth = max(0, depth - 1)
            out_lines.append("  " * (depth - 1) + "}" if depth else "}")
            buf = ""
        elif ch == ";":
            out_lines.append("  " * depth + buf.strip())
            buf = ""
    if buf.strip():
        out_lines.append(buf.strip())
    return "\n".join(out_lines)


jobs = [
    ("scripts/inline_1.js", "inline_1_readable.js"),
    ("scripts/inline_2.js", "inline_2_readable.js"),
    ("scripts/pages/fb.html", "fb_readable.js"),
    ("scripts/pages/nhl.html", "nhl_readable.js"),
    ("scripts/pages/mlb.html", "mlb_readable.js"),
]
for src, dst in jobs:
    p = base / src
    if p.suffix == ".html":
        text = p.read_text(encoding="utf-8", errors="replace")
        scripts = re.findall(r"<script[^>]*>(.*?)</script>", text, re.DOTALL | re.IGNORECASE)
        body = "\n\n/* ===== script block boundary ===== */\n\n".join(scripts)
        # also dump the static HTML body (scripts stripped) for structure review
        html_only = re.sub(r"<script[^>]*>.*?</script>", "<!-- script removed -->", text, flags=re.DOTALL | re.IGNORECASE)
        (out / (dst.replace("_readable.js", "_body.html"))).write_text(html_only, encoding="utf-8")
    else:
        body = p.read_text(encoding="utf-8", errors="replace")
    pretty = beautify(body)
    dest = out / dst
    dest.write_text(pretty, encoding="utf-8")
    print(f"{dst}: {len(pretty)} chars, {pretty.count(chr(10))} lines")
