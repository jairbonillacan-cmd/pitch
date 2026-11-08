"""Extract data-literal substrings from decoded pages via balanced-brace scanning
(string/comment aware), then evaluate them into JSON via node:vm (literals only,
sandboxed, helper fns est/mk/aud provided like the page defines them).

Run with: python3 -I extract_data.py  (writes data/inventory.json)
"""
import subprocess
from pathlib import Path

base = Path(__file__).resolve().parent.parent
pages = base / "scripts" / "pages"
out = base / "data"
out.mkdir(exist_ok=True)


def read(p):
    return (pages / p).read_text(encoding="utf-8", errors="replace")


def scan_literal(s, anchor):
    """Return the balanced literal starting at the first [ or { after `anchor`."""
    i = s.find(anchor)
    if i < 0:
        raise ValueError(f"anchor not found: {anchor}")
    # first opener after the anchor's '=' (or directly if anchor has none)
    j = s.find("=", i) + 1 if "=" in s[i:i + len(anchor) + 2] else i + len(anchor)
    while s[j] not in "[{":
        j += 1
    depth_stack = []
    k = j
    in_str = None
    while k < len(s):
        c = s[k]
        if in_str:
            if c == "\\":
                k += 2
                continue
            if c == in_str:
                in_str = None
        elif c in "'\"`":
            in_str = c
        elif c == "/" and s[k:k + 2] == "//":
            k = s.find("\n", k)
            if k < 0:
                break
        elif c == "/" and s[k:k + 2] == "/*":
            k = s.find("*/", k) + 1
            if k == 0:
                break
        elif c in "[{":
            depth_stack.append(c)
        elif c in "]}":
            if not depth_stack:
                raise ValueError("unbalanced")
            o = depth_stack.pop()
            if (o == "[" and c != "]") or (o == "{" and c != "}"):
                raise ValueError("mismatched closer")
            if not depth_stack:
                return s[j:k + 1]
        k += 1
    raise ValueError("unterminated literal")


fb = read("fb.html")
nhl = read("nhl.html")
mlb = read("mlb.html")

literals = {
    "fb_teams": scan_literal(fb, "const TD="),
    "fb_fixtures": scan_literal(fb, "const DD="),
    "fb_injuries": scan_literal(fb, "const NW="),
    "fb_comps": scan_literal(fb, "const COMPS="),
    "fb_constants": fb[fb.find("const LG0="):fb.find(";", fb.find("const LG0=")) + 1],
    "nhl_teams": scan_literal(nhl, "const T="),
    "nhl_results": scan_literal(nhl, "const R="),
    "nhl_audit": scan_literal(nhl, "const AUD="),
    "nhl_news": scan_literal(nhl, "const N="),
    "nhl_schedule": scan_literal(nhl, "const D="),
    "nhl_constants": nhl[nhl.find("const E=2.15"):nhl.find(";", nhl.find("const E=2.15")) + 1],
    "mlb_teams": scan_literal(mlb, "const T="),
    "mlb_batters": scan_literal(mlb, "const BT="),
    "mlb_timeline": scan_literal(mlb, "const D="),
    "mlb_constants": mlb[mlb.find("const LG=4.40"):mlb.find(";", mlb.find("const LG=4.40")) + 1],
}


def scan_from(s, start):
    """scan a balanced literal whose opener is exactly at index start."""
    depth_stack = []
    k = start
    in_str = None
    while k < len(s):
        c = s[k]
        if in_str:
            if c == "\\":
                k += 2
                continue
            if c == in_str:
                in_str = None
        elif c in "'\"`":
            in_str = c
        elif c == "/" and s[k:k + 2] == "//":
            k = s.find("\n", k)
            if k < 0:
                break
        elif c == "/" and s[k:k + 2] == "/*":
            k = s.find("*/", k) + 1
            if k == 0:
                break
        elif c in "[{":
            depth_stack.append(c)
        elif c in "]}":
            o = depth_stack.pop()
            if (o == "[" and c != "]") or (o == "{" and c != "}"):
                raise ValueError("mismatched closer")
            if not depth_stack:
                return s[start:k + 1]
        k += 1
    raise ValueError("unterminated literal")


literals["mlb_pitchers"] = scan_from(mlb, mlb.find('[["mar"'))

for name, lit in literals.items():
    (out / f"{name}.lit.js").write_text(lit, encoding="utf-8")

script = """
const fs=require('fs'), vm=require('vm'), path=require('path');
const dir=process.argv[1], names=process.argv.slice(2);
const result={};
const PRELUDE = `
  const est=(gd)=>[55+gd/2,55-gd/2];
  const mk=(arr)=>arr.map(g=>({h:g[0],a:g[1],t:g[2],ref:g[3],s:g[4]}));
  const aud=(arr)=>arr.map(g=>({h:g[0],a:g[1],t:"Final",sc:[g[2],g[3]]}));
`;
for(const n of names){
  const lit=fs.readFileSync(path.join(dir,n+'.lit.js'),'utf8');
  let val;
  if(n.endsWith('_constants')){ val={raw:lit.trim()}; }
  else{
    try{ val=vm.runInNewContext(PRELUDE+';('+lit+')', {}, {timeout:5000}); }
    catch(e){ val={raw:lit.trim().slice(0,200), err:String(e)}; }
  }
  result[n]=val;
}
fs.writeFileSync(path.join(dir,'inventory.json'), JSON.stringify(result,null,1));
for(const [k,v] of Object.entries(result)){
  const size=Array.isArray(v)?v.length:(v&&typeof v==='object'&&!v.raw?Object.keys(v).length:'raw');
  console.log(' ', k, Array.isArray(v)?`array(${size})`:`${size}`);
}
"""
r = subprocess.run(["node", "-e", script, str(out), *literals.keys()], capture_output=True, text=True, timeout=60)
print(r.stdout)
if r.returncode:
    print("STDERR:", r.stderr[:2000])
