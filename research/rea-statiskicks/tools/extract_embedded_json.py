import json
import re
import html as html_mod
from pathlib import Path

captures_dir = Path(".worktrees/REA-stats/evidence/captures")
schemas_dir = Path(".worktrees/REA-stats/evidence/network-schemas")
schemas_dir.mkdir(parents=True, exist_ok=True)

for name in ["03-team.html", "04-player.html", "05-matches.html", "06-league.html", "07-players.html", "09-match-detail.html"]:
    p = captures_dir / name
    txt = p.read_text(encoding="utf-8")
    print(f"================ {name} ================")
    # Find all wire:click full strings
    wcs = sorted(set(re.findall(r'wire:click(?:\.[a-z]+)*="([^"]+)"', txt)))
    for wc in wcs:
        print("  wire:click:", wc)
    # Find all wire:init
    winits = sorted(set(re.findall(r'wire:init="([^"]+)"', txt)))
    for wi in winits:
        print("  wire:init:", wi)
    # Find all application/json scripts
    for idx, m in enumerate(re.finditer(r'<script([^>]*type=["\']application/json["\'][^>]*)>(.*?)</script>', txt, re.S)):
        attrs, body = m.groups()
        print(f"  JSON script [{idx}] attrs={attrs.strip()} len={len(body)}")
        attr_name = re.findall(r'data-[a-z0-9-]+', attrs)
        tag_slug = attr_name[0] if attr_name else f"json-{idx}"
        out_path = schemas_dir / f"{name.replace('.html', '')}-{tag_slug}.json"
        out_path.write_text(body.strip(), encoding="utf-8")

    # Find any data-* attribute whose value starts with { or [
    for m in re.finditer(r'(data-[a-z0-9-]+)=(["\'])(\s*[\{\[].*?)\2', txt, re.S):
        attr, _, val = m.groups()
        unesc = html_mod.unescape(val)
        if len(unesc) > 80:
            print(f"  JSON data-attr {attr}: len={len(unesc)} sample={unesc[:140]}...")
            out_path = schemas_dir / f"{name.replace('.html', '')}-{attr}.json"
            out_path.write_text(unesc, encoding="utf-8")
