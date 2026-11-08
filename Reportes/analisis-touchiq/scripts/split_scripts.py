import re, os
base = "/Users/jairbonilla/Desktop/Pitch Lab/touchiq-analysis"
html = open(os.path.join(base, "index.html"), encoding="utf-8", errors="replace").read()
blocks = re.findall(r"<script[^>]*>(.*?)</script>", html, re.S)
os.makedirs(os.path.join(base, "js-tree"), exist_ok=True)
for i, b in enumerate(blocks):
    p = os.path.join(base, "js-tree", f"script_{i}.js")
    open(p, "w", encoding="utf-8").write(b)
    print(f"script_{i}.js: {len(b):,} chars")
# quick targeted facts
for pat, name in [(r"fetch\(\s*['\"`]([^'\"`]+)", "fetch-urls"),
                  (r"localStorage\.(get|set|remove)Item\(['\"]([^'\"]+)", "ls-keys"),
                  (r"function\s+([A-Za-z_$][\w$]*)\s*\(", "functions"),
                  (r"(id=\"[a-zA-Z][\w-]*\")", "element-ids")]:
    m = re.findall(pat, html)
    if name == "ls-keys":
        m = sorted({x[1] for x in m})
        print(f"\n## localStorage keys ({len(m)}):", m[:25])
    elif name == "functions":
        m = sorted(set(m))
        print(f"\n## functions ({len(m)}):", m[:60])
    elif name == "fetch-urls":
        m = sorted(set(m))
        print(f"\n## fetch URLs ({len(m)}):", m[:20])
    else:
        print(f"\n## {name}: {len(m)} (first 15):", m[:15])
