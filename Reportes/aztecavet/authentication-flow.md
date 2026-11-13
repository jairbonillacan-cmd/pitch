# Authentication & Access Control Flow — AztecaVet

> **Target:** `https://aztecavet.com/`  
> **Investigation Focus:** Security Architecture, Gate Mechanics, Session Persistence, Vulnerability Assessment  
> **Classification:** [OBSERVADO] / [INFERIDO] / [RECONSTRUIDO]  
> **Evidence Files:**  
> - Initial Gate: [`01_initial_gate.png`](<REPO_ROOT>/research/aztecavet/evidence/screenshots/01_initial_gate.png)  
> - Virtual Pad: [`02_pad_open.png`](<REPO_ROOT>/research/aztecavet/evidence/screenshots/02_pad_open.png)  
> - Incorrect Code Shake: [`03_code_fail.png`](<REPO_ROOT>/research/aztecavet/evidence/screenshots/03_code_fail.png)  
> - Access Granted Animation: [`04_code_success.png`](<REPO_ROOT>/research/aztecavet/evidence/screenshots/04_code_success.png)  
> - Unlocked Home: [`05_home_unlocked.png`](<REPO_ROOT>/research/aztecavet/evidence/screenshots/05_home_unlocked.png)  
> - Gate Reappearance on Reload: [`18_after_reload_gate.png`](<REPO_ROOT>/research/aztecavet/evidence/screenshots/18_after_reload_gate.png)  
> - Extracted Script: [`shell_app.js`](<REPO_ROOT>/research/aztecavet/evidence/javascript/shell_app.js#L222-L260)  

---

## 1. Architectural Overview of the Gate

AztecaVet presents a full-screen entry modal (`#lock`) upon landing. Contrary to conventional software-as-a-service (SaaS) applications, **there is no backend authentication endpoint, no credential database, and no cryptographic verification**. The gate is completely executed in client-side JavaScript.

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser as Browser DOM (#lock)
    participant JS as inline_1.js Runtime
    participant Net as Network (Netlify CDN)

    User->>Browser: Enters https://aztecavet.com/
    Browser->>Net: GET / (HTML 1.22 MB)
    Net-->>Browser: 200 OK (Brotli payload)
    Browser->>JS: Mounts DOM; stage = 1; #lock visible
    Note over Browser,JS: Canvas starfield & 3D ball spinning. Keystrokes blocked for 900ms.
    User->>Browser: Clicks #lock or presses any key (after 900ms)
    JS->>Browser: goStage2() -> transitions #stg1 to #stg2 (650ms portal sound)
    Browser->>User: Displays 12-key virtual pad (#pad) and dot indicators (#dots)
    
    alt User enters incorrect passcode (e.g., 1234)
        User->>Browser: Inputs 4 digits
        JS->>JS: buf.length === 4 -> buf === CODE ("[REDACTED_AUTH_CODE]") -> false
        JS->>Browser: fail() -> "CÓDIGO INCORRECTO", shake CSS, 220Hz dissonant chord
        JS->>Browser: Resets buffer and dots after 650ms
    else User enters authorized passcode ([REDACTED_AUTH_CODE])
        User->>Browser: Inputs 7, 7, 7, 9
        JS->>JS: buf.length === 4 -> buf === CODE ("[REDACTED_AUTH_CODE]") -> true
        JS->>Browser: success() -> "ACCESO CONCEDIDO", unlock chime chord, warp=1 animation
        JS->>Browser: Reveals #app (650ms), hides #lock (1800ms)
        JS->>Browser: Mounts Home view (drawHome(), clk(), reveals Boleto bar)
    end

    opt User refreshes page (F5 / reload)
        User->>Browser: Reloads page
        Browser->>JS: In-memory state reinitialized (stage = 1, buf = "")
        Note over Browser,JS: Zero cookies or localStorage auth tokens exist.
        Browser->>User: Displays Stage 1 Gate again (#lock)
    end
```

---

## 2. Decompiled Code Analysis

The gate implementation is located in `shell_app.js` (lines 222–275):

```javascript
/* ---------- intro: sonido, codigo, canvas ---------- */
const CODE = "[REDACTED_AUTH_CODE]", 
      dots = [...document.querySelectorAll("#dots i")], 
      msg = $("msg"), 
      pad = $("pad");

let buf = "", 
    stage = 1, 
    busy = false, 
    snd = true;

// Pad Construction: 10 digits + backspace + empty spacer
const padKeys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
pad.innerHTML = padKeys.map(k => 
  `<button type="button" class="${k==="" ? "sp" : ""}" data-k="${k}">${k}</button>`
).join("");

function key(k) {
  if (stage !== 2 || busy) return;
  if (k === "⌫") {
    buf = buf.slice(0, -1);
  } else if (/\d/.test(k) && buf.length < 4) {
    buf += k;
    keySound(+k); // Plays pentatonic note corresponding to digit
  }
  dots.forEach((d, i) => d.classList.toggle("on", i < buf.length));
  
  if (buf.length === 4) {
    busy = true;
    buf === CODE ? success() : fail();
  }
}

function fail() {
  msg.textContent = "CÓDIGO INCORRECTO";
  msg.className = "msg err";
  failSound(); // 220 Hz + 233.1 Hz dissonant chord
  dots.forEach(d => d.classList.add("shake"));
  setTimeout(() => {
    buf = "";
    dots.forEach(d => {
      d.classList.remove("on");
      d.classList.remove("shake");
    });
    msg.textContent = "";
    msg.className = "msg";
    busy = false;
  }, 650);
}

function success() {
  msg.textContent = "ACCESO CONCEDIDO";
  msg.className = "msg ok";
  unlockSound(); // Ascending 7-bell chime + 2 sub-bass drums
  intro.warp = 1; // Accelerates canvas starfield warp lines
  setTimeout(() => {
    $("app").classList.remove("hide");
    drawHome();
    clk();
    $("slipb").classList.remove("hide"); // Unhides bottom Boleto bar
  }, 650);
  setTimeout(() => {
    $("lock").classList.add("out");
    setTimeout(() => {
      $("lock").classList.add("hide");
      intro.stop();
    }, 900);
  }, 1800);
}
```

### Physical Keyboard Support
In addition to the virtual pad, a global keyboard listener intercepts keypresses:
```javascript
document.addEventListener("keydown", e => {
  if (stage === 1) {
    if (Date.now() - T0 > 900) goStage2();
    return;
  }
  if (stage === 2 && !busy) {
    if (e.key === "Backspace") key("⌫");
    else if (/^\d$/.test(e.key)) key(e.key);
  }
});
```

---

## 3. Session Persistence & Lifecycle Verification

Empirical verification conducted with Playwright and Edge DevTools yielded the following facts:

1. **Cookie Inspection:** `context.cookies()` returns `[]` (0 cookies). No session cookie or auth token is ever set.
2. **Local Storage Audit:** `localStorage` is completely empty upon landing and remains empty immediately after unlocking (`{}`).
3. **Storage Usage:** The key `azteca_av` is only written when the user interacts with the Betting Slip (`AV.slip`) or modifies bankroll settings (`AV.cfg`). It stores betting selections and bankroll balances, **not access authorization**.
4. **Browser Reload:** Reloading the page resets JavaScript execution memory. Because `stage` defaults to `1` and `buf` defaults to `""`, the lock screen `#lock` immediately re-renders.
5. **Tab Reopening:** Closing and reopening a tab requires re-entering `[REDACTED_AUTH_CODE]`.

---

## 4. Vestigial Gate Code in Embedded Sub-Pages

A remarkable architectural discovery is that **each embedded sports sub-application contains its own duplicate copy of the gate code**:

- `scripts/pages/fb.html` contains: `const CODE = "[REDACTED_AUTH_CODE]"` and the full keypad DOM.
- `scripts/pages/nhl.html` contains: `const CODE = "[REDACTED_AUTH_CODE]"` and the full keypad DOM.
- `scripts/pages/mlb.html` contains: `const CODE = "[REDACTED_AUTH_CODE]"` and the full keypad DOM.

### Why does this exist?
Each sport module was originally authored as an independent standalone HTML file. When combined into the single-file shell, the developer:
1. Embezzled each sub-page as a Base64 string inside `PAGES{}` in `inline_1.js`.
2. Injected a CSS override: `<style>#lock{display:none!important}</style>` into the sub-pages so their internal lock screens would remain invisible.
3. Injected `window.__START = <league_code>` to automatically mount the sport view without waiting for input.

---

## 5. Security & Risk Assessment

| Vector | Observed Condition | Security Implication |
|---|---|---|
| **Credential Storage** | Plaintext constant in public JS: `const CODE = "[REDACTED_AUTH_CODE]"` | **Critical.** Any user can view-source or search strings in DevTools to find the code. |
| **Authentication Enforcement** | Client-side DOM toggling (`class.remove("hide")`) | **Trivial Bypass.** A visitor can execute `$("lock").remove(); $("app").classList.remove("hide")` in the console to bypass the gate instantly. |
| **Rate Limiting / Lockout** | Uncapped attempts; 650 ms timeout on failure | **Vulnerable to Brute-Force.** A 4-digit numeric code ($10^4 = 10,000$ combinations) can be exhausted client-side in seconds. |
| **Data Confidentiality** | Sub-pages stored as Base64 in public payload | **No encryption.** Calling `atob(PAGES.fb)` yields the full sports data without passing the lock. |
| **Replay / Session Hijacking** | N/A (No sessions exist) | Session hijacking is impossible because there are no authenticated user sessions. |

---

## 6. PitchLab Authentication Architecture Blueprint

For PitchLab, the cosmetic gate will be replaced with an enterprise-grade Identity & Access Management (IAM) pipeline:

```mermaid
flowchart TD
    Client["PitchLab Client<br/>(Web / Mobile PWA)"] -->|HTTPS POST /auth/login| Gateway["API Gateway / Traefik"]
    Gateway -->|Rate Limit: 5 req/min| AuthSvc["PitchLab Auth Service<br/>(Go / FastAPI)"]
    AuthSvc -->|Argon2id Hash Verify| UserDB[(PostgreSQL Users)]
    AuthSvc -->|Issue Access Token (15m JWT)| Client
    AuthSvc -->|Set HttpOnly Secure SameSite Cookie| Client
    AuthSvc -->|Store Refresh Token Session| RedisSession[(Redis Session Store)]
    
    subgraph Resource Authorization
        Client -->|Bearer JWT Header| QuantEngine["PitchLab Quant Engines<br/>(Football / NHL / MLB)"]
        QuantEngine -->|Verify Scope & Tier| RBAC["RBAC Policy Engine<br/>(Free / Pro / Institutional)"]
    end
```

### Architectural Standards for PitchLab:
1. **Password Hashing:** `Argon2id` (memory-hard, resistant to GPU/ASIC attacks).
2. **Session Tokens:** Short-lived JWTs (15 minutes expiry) with cryptographic signature (`RS256` or `Ed25519`).
3. **Refresh Tokens:** Rotating refresh tokens stored in `HttpOnly`, `Secure`, `SameSite=Strict` cookies with revocation lists in Redis.
4. **Brute-Force Protection:** Distributed sliding-window rate limiting in Redis (5 failed attempts trigger exponential backoff and CAPTCHA).
5. **Tiered Access (RBAC):**
   - **Tier 1 (Free):** Baseline predictions, delayed odds, basic stats.
   - **Tier 2 (Pro):** Real-time injury models, EV $+4\%$ alerts, unlimited Bet Builder combos.
   - **Tier 3 (Institutional):** Raw API access, Monte Carlo simulation engines, Kelly portfolio allocator.
