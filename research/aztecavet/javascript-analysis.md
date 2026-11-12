# JavaScript Deep Codebase & AST Disassembly — AztecaVet

> **Target:** `https://aztecavet.com/`  
> **Investigation Focus:** AST Parsing, Function Signatures, Decompiled Algorithms, State Management  
> **Classification:** [OBSERVADO] / [INFERIDO] / [RECONSTRUIDO]  
> **Analyzed Files:** [`shell_app.js`](<REPO_ROOT>/research/aztecavet/evidence/javascript/shell_app.js), [`ai_assistant.js`](<REPO_ROOT>/research/aztecavet/evidence/javascript/ai_assistant.js)  

---

## 1. Abstract Syntax Tree (AST) & Structural Metrics

Using REA static analysis engine (`analyze_javascript_application`):

- **Script Block 1 (`inline_1.js` / `shell_app.js`):**
  - **Raw Size:** 785,916 bytes.
  - **AST Node Count:** 12,488 nodes parsed cleanly (0 syntax errors).
  - **Function Declarations & Expressions:** 48 functions.
  - **Identified Identifier Families:**
    - `request` family: **0 occurrences** (confirms zero `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`).
    - `storage` family: **4 occurrences** (`localStorage.getItem`, `localStorage.setItem` for key `"azteca_av"`).
    - `crypto` / `math` family: **34 occurrences** (`Math.pow`, `Math.exp`, `Math.acos`, `Math.sqrt`).

- **Script Block 2 (`inline_2.js` / `ai_assistant.js`):**
  - **Raw Size:** 4,039 bytes.
  - **AST Node Count:** 214 nodes.
  - **Function Declarations:** 8 functions (`pageDoc`, `pageText`, `ctx`, `local`, `open`, `ask`, plus event handlers).

---

## 2. Core Functional Modules in `shell_app.js`

### 2.1 Base64 Decompression & Module Injection (`dec` & `openSport`)
The sports sub-applications are stored as compressed Base64 strings inside the literal object `PAGES = { fb: "...", nhl: "...", mlb: "..." }`.

```javascript
// Base64 to UTF-8 String Decoder
function dec(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

// Sub-Sport Mounting Routine
function openSport(i) {
  const s = SP[i];
  if (!s) return;
  SPOPEN = true;
  
  // 1. Decode Base64 HTML blob
  let h = dec(PAGES[s.pg]);
  
  // 2. Inject startup league configuration
  h = h.replace("<head>", `<head><script>window.__START=${JSON.stringify(s.c)}<\/script>`);
  
  // 3. Inject directly into iframe srcdoc
  const f = $("fr");
  f.srcdoc = h;
  f.classList.remove("hide");
  $("hintbar").classList.add("sp");
  document.body.style.overflow = "hidden";
}
```

**Key Architectural Insights:**
1. Using `srcdoc` avoids cross-origin restrictions; the iframe runs with origin `https://aztecavet.com`.
2. Memory is automatically reclaimed by V8 when `f.srcdoc = ""` is assigned on `closeSport()`.
3. Injected `window.__START` instructs `fb.html` which of the 5 soccer tournaments to activate on mount.

---

### 2.2 Global State Architecture: The `AV` Object

All user state across the session is centralized in a single global mutable object `AV`:

```javascript
const AV = {
  cfg: {
    start: 1000,   // Initial bankroll balance (default: $1,000 MXN)
    th: 0.60       // Probability threshold for 10% stake sizing (55%, 60%, 65%, 70%)
  },
  odds: {},        // Map of user-written odds: { "FB:MX:...|h": 2.15, ... } (max 800 keys)
  slip: [],        // Active betting slip legs: [ { k, gk, sp, m, l, p, d, t } ]
  bets: [],        // Bet history records: [ { id, ts, legs, p, d, stake, u, st } ]
  ovr: "",         // Manual parlay payout multiplier override
  u: null,         // Calculated stake unit % (5 or 10)
  tab: "b",        // Active modal tab ("b" = boleto, "h" = historial, "c" = config)
  db: null,        // WebMCP database reference (window.claude.use)
  base: null,      // WebMCP database path ("data/users/<userId>")
  ready: false,    // Synchronization status
  arm: null        // Bet ID pending deletion confirmation ("¿Borrar?")
};
```

### 2.3 Persistence Engine (`lsSave` & `lsLoad`)
```javascript
function lsSave() {
  try {
    localStorage.setItem("azteca_av", JSON.stringify({
      cfg: AV.cfg,
      odds: AV.odds,
      slip: AV.slip,
      bets: AV.bets
    }));
  } catch (e) {
    // Graceful error trap for quota exceeded or private browsing
  }
}

function lsLoad() {
  try {
    const j = JSON.parse(localStorage.getItem("azteca_av") || "null");
    if (j) {
      Object.assign(AV.cfg, j.cfg || {});
      AV.odds = j.odds || {};
      AV.slip = j.slip || [];
      AV.bets = j.bets || [];
    }
  } catch (e) {}
}
```

---

### 2.4 Mathematical Utilities & Conversion Primitives

```javascript
// Currency Formatter (Mexican Pesos)
const money = v => (v < 0 ? "-" : "") + "$" + Math.abs(Math.round(v)).toLocaleString("es-MX");

// Percentage Formatter
const pct = v => (v * 100).toFixed(1) + "%";

// Multi-Format Odds Parser (Decimal & American)
const decO = s => {
  const v = parseFloat(String(s == null ? "" : s).replace(",", "."));
  if (isNaN(v)) return null;
  // American odds (|v| >= 100): +150 -> 2.50; -200 -> 1.50
  if (Math.abs(v) >= 100) return v > 0 ? 1 + v / 100 : 1 + 100 / -v;
  // Decimal odds (must be strictly > 1.0)
  return v > 1 ? v : null;
};

// HTML Escaping Utility for XSS Prevention
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;"
}[c]));
```

---

## 3. Disassembly of `inline_2.js` (AI Assistant)

### 3.1 DOM Text Extractor (`pageText`)
```javascript
function pageDoc() {
  const f = $("fr");
  if (!f || f.classList.contains("hide")) return null;
  try {
    return f.contentDocument && f.contentDocument.body ? f.contentDocument : null;
  } catch (e) {
    return null;
  }
}

function pageText() {
  const d = pageDoc();
  if (!d) return "";
  // Normalizes multiple whitespaces, truncates strictly to 9,000 characters
  return (d.body.innerText || "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, 9000);
}
```

### 3.2 Heuristic Fallback Search (`local`)
When operating in a standard web browser (without `window.claude`), queries are evaluated via client-side regex rules:

```javascript
function local(q) {
  const t = q.toLowerCase(), d = pageDoc();
  if (!d) return "Abre un deporte (Fútbol, NHL o MLB) y te respondo con los picks y datos de esa pantalla.";
  
  // Rule 1: Extract Pick of the Day element
  const pdx = d.getElementById("pdx");
  if (/pick|mejor/.test(t) && pdx && pdx.innerText.trim()) {
    return pdx.innerText.trim().replace(/\n{2,}/g, "\n");
  }
  
  // Rule 2: Extract Formula / Model explanation block
  if (/f[oó]rmula|decide|c[oó]mo (funciona|calcula|piensa)/.test(t)) {
    const n = d.querySelector(".note");
    if (n) return n.innerText.trim();
  }
  
  // Rule 3: Fuzzy keyword matching against lines of page text
  const L = pageText().split("\n");
  const words = t.split(/[^a-záéíóúñ0-9]+/).filter(x => x.length > 3);
  const hits = L.filter(l => words.some(w => l.toLowerCase().includes(w))).slice(0, 6);
  
  return hits.length 
    ? hits.join("\n") 
    : "No encuentro eso en esta pantalla. Prueba con el nombre de un equipo o cambia de día.";
}
```

---

## 4. Architectural Evaluation for PitchLab

| Capability | AztecaVet Implementation | PitchLab Production Standard |
|---|---|---|
| **Code Modularity** | Single monolithic bundled file | Clean TypeScript/Vite modular architecture with tree-shaking |
| **State Management** | Global mutable singleton (`AV`) | Pinia / Redux Toolkit with immutable state transitions and schema validation |
| **Data Transport** | Base64 strings decoded via `atob` | High-efficiency JSON / Protocol Buffers streamed over WebSockets/SSE |
| **Security Handling** | Client-side plaintext equality | Zero client secrets; server-side authentication with signed tokens |
| **Math Integrity** | Client-side floating-point math | `decimal.js` / BigNumber for monetary balances; double precision for odds |
