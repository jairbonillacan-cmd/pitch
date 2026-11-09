import re
import sys
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")

cap = Path(r"c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats\evidence\captures")
out_js = Path(r"c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats\evidence\javascript\inline-pages")
out_css = Path(r"c:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\REA-stats\evidence\css\inline-pages")
out_js.mkdir(parents=True, exist_ok=True)
out_css.mkdir(parents=True, exist_ok=True)

for name in ["03-team.html", "04-player.html", "04b-messi-full.html", "07-players.html", "12-register.html"]:
    txt = (cap / name).read_text(encoding="utf-8")
    slug = name.replace(".html", "")
    scripts = [
        m.group(2)
        for m in re.finditer(r"<script([^>]*)>(.*?)</script>", txt, re.S)
        if "src=" not in m.group(1) and "application/json" not in m.group(1)
    ]
    styles = [m.group(2) for m in re.finditer(r"<style([^>]*)>(.*?)</style>", txt, re.S)]
    print(f"=== {name} ===")
    for i, s in enumerate(scripts):
        print(f"  JS block [{i}]: {len(s)} B | head: {s.strip()[:120].replace(chr(10), ' ')}")
        if len(s) > 3500 or name == "12-register.html":
            (out_js / f"{slug}-block-{i}.js").write_text(s, encoding="utf-8")
    for i, st in enumerate(styles):
        print(f"  CSS block [{i}]: {len(st)} B | head: {st.strip()[:120].replace(chr(10), ' ')}")
        if len(st) > 3000:
            (out_css / f"{slug}-style-{i}.css").write_text(st, encoding="utf-8")
