# Evidence & Traceability Register — AztecaVet

> **Target:** `https://aztecavet.com/`  
> **Investigation Focus:** Formal Evidence Ledger, Epistemic Rigor, Verification Methodologies  
> **Classification Framework:** `[OBSERVADO]`, `[INFERIDO]`, `[RECONSTRUIDO]`, `[DESCONOCIDO]`  

---

## 1. Traceability Ledger

### Finding F-01: Client-Side Passcode Authentication
- **Finding ID:** `F-01`
- **Área:** Authentication & Security Architecture
- **Descripción:** The application does not use server authentication, sessions, or tokens. Access is governed by a client-side JavaScript comparison against a hardcoded plaintext constant: `const CODE = "[REDACTED_AUTH_CODE]"`.
- **Evidencia:** `shell_app.js` (lines 223–270), Screenshots [`02_pad_open.png`](<REPO_ROOT>/research/aztecavet/evidence/screenshots/02_pad_open.png), [`03_code_fail.png`](<REPO_ROOT>/research/aztecavet/evidence/screenshots/03_code_fail.png), [`04_code_success.png`](<REPO_ROOT>/research/aztecavet/evidence/screenshots/04_code_success.png), [`18_after_reload_gate.png`](<REPO_ROOT>/research/aztecavet/evidence/screenshots/18_after_reload_gate.png).
- **Método:** Static AST deobfuscation, CDP keyboard event replay, browser cookie & storage inspection.
- **Nivel de confianza:** **`[OBSERVADO]` 100%**.
- **Limitaciones:** None. Directly observed and re-verified in live runtime.
- **Aplicación potencial a PitchLab:** Implement modern OAuth2/OIDC, Argon2id password hashing, and encrypted JWT tokens.

---

### Finding F-02: Zero Server Backend & 100% Static Delivery
- **Finding ID:** `F-02`
- **Área:** Infrastructure & Network Architecture
- **Descripción:** AztecaVet has zero dedicated backend services, databases, or microservices. It is hosted as a static asset on Netlify Edge CDN. During all live interactions, exactly zero network calls are initiated after the initial page load.
- **Evidencia:** Network log [`comprehensive_network_log.json`](<REPO_ROOT>/research/aztecavet/evidence/network-schemas/comprehensive_network_log.json) (4 entries total: initial `GET /`, reload `GET /`, zero other requests).
- **Método:** Playwright network interception, CDP session monitoring, HTTP response header analysis.
- **Nivel de confianza:** **`[OBSERVADO]` 100%**.
- **Limitaciones:** Cannot observe server-side build scripts used prior to Netlify deployment.
- **Aplicación potencial a PitchLab:** Deploy cloud-native microservices (FastAPI / Go / TimescaleDB) with WebSocket live odds streaming.

---

### Finding F-03: Single Monolithic HTML Bundle
- **Finding ID:** `F-03`
- **Área:** Frontend Architecture & Bundling
- **Descripción:** The entire application (HTML shell, CSS styling, 3 sports engines, 332 injury news records, SVG vector graphics, 3D Canvas ray-tracer, and WebAudio synthesizer) is packaged into a single HTML document of 1,219,472 bytes.
- **Evidencia:** Raw file `aztecavet.html` (426,821 bytes formatted), Netlify Edge response headers (`content-length: 739330` br).
- **Método:** Static AST inspection, byte counting, DOM node hierarchy audit.
- **Nivel de confianza:** **`[OBSERVADO]` 100%**.
- **Limitaciones:** Build toolchain (whether Webpack, Rollup, or custom Node script) is unobservable directly.
- **Aplicación potencial a PitchLab:** Modern modular Vite/TypeScript architecture with code-splitting and dynamic chunk loading.

---

### Finding F-04: Static Snapshot Data Frozen at Nov 6, 2026
- **Finding ID:** `F-04`
- **Área:** Sports Data Engineering & Provenance
- **Descripción:** All sports fixtures, standings, team scoring statistics, and player injuries are statically baked literal arrays with timestamps terminating on November 6, 2026. The header clock and "ACTUALIZADO" labels create a superficial illusion of live freshness.
- **Evidencia:** `dataset_inventory.json`, source notes in `football_engine.js` (`NW` array), `nhl_engine.js` (`N` array).
- **Método:** Literal extraction via node:vm sandbox, date parsing, journalistic source attribution.
- **Nivel de confianza:** **`[OBSERVADO]` 100%**.
- **Limitaciones:** Original web scraping scripts used by the author prior to November 6 are unobservable.
- **Aplicación potencial a PitchLab:** Live automated ETL pipelines with Sportradar, API-Football, and The-Odds-API.

---

### Finding F-05: Football Engine with Dixon-Coles Bivariate Poisson
- **Finding ID:** `F-05`
- **Área:** Quantitative Modeling (Football)
- **Descripción:** Football predictions across 5 tournaments utilize Pythagorean win expectation ($E = 1.7$), Log5 odds ratio ($HFA = 0.54$, $SHR = 0.85$), 16-step bisection tilt, and a $14 \times 14$ bivariate Poisson grid corrected with Dixon-Coles tau matrix ($\rho = -0.14$ for Liga MX, $\rho = -0.08$ for European leagues).
- **Evidencia:** `football_engine.js` (`model0()`, `tilt()`, `pois()`), test results [`test_results.json`](<REPO_ROOT>/research/aztecavet/evidence/mathematical-tests/test_results.json).
- **Método:** Clean-room mathematical reproduction, decompiled code analysis, numerical parity test.
- **Nivel de confianza:** **`[OBSERVADO]` 100%**.
- **Limitaciones:** Cannot observe whether the author calibrated $\rho = -0.14$ empirically or borrowed it from academic literature.
- **Aplicación potencial a PitchLab:** Upgrade to Bivariate Poisson with Covariates (BPS) and real-time xG integration.

---

### Finding F-06: NHL Engine with Goaltender Leverage & Form Weighting
- **Finding ID:** `F-06`
- **Área:** Quantitative Modeling (Hockey)
- **Descripción:** NHL predictions model 32 teams using Pythagorean exponent $E = 2.15$, $HFA = 0.525$, a 30% weighting for the last 5 games (`FORMW = 0.30`), and massive defensive penalties for missing starting goaltenders ($+0.25$ to $+0.40$ goals/game). Enforces an Over consistency guardrail ($OVR \ge 50\%$) before suggesting combos.
- **Evidencia:** `nhl_engine.js` (`build()`, `eff()`, `OVR()`, `model0()`), screenshot [`11_nhl_dashboard.png`](<REPO_ROOT>/research/aztecavet/evidence/screenshots/11_nhl_dashboard.png).
- **Método:** Static code analysis, mathematical unit tests.
- **Nivel de confianza:** **`[OBSERVADO]` 100%**.
- **Limitaciones:** None.
- **Aplicación potencial a PitchLab:** Add goalie Save Percentage above Expected (xGSA) and powerplay/penalty kill special teams metrics.

---

### Finding F-07: MLB Engine with Gaussian Normal Distribution
- **Finding ID:** `F-07`
- **Área:** Quantitative Modeling (Baseball)
- **Descripción:** Unlike football and hockey, MLB abandons Poisson in favor of a continuous Gaussian Normal Distribution with $SD = 3\sqrt{2} \approx 4.24264$. Starting pitchers are regressed against team bullpen ERA using an 80-inning Empirical Bayes weight.
- **Evidencia:** `mlb_engine.js` (`phi()`, `eff()`, `model0()`), test results [`test_results.json`](<REPO_ROOT>/research/aztecavet/evidence/mathematical-tests/test_results.json).
- **Método:** Decompilation of polynomial CDF approximation, parameter verification.
- **Nivel de confianza:** **`[OBSERVADO]` 100%**.
- **Limitaciones:** Scope is restricted to the 8 playoff teams of 2026.
- **Aplicación potencial a PitchLab:** Deploy full-season MLB sabermetrics (wOBA, FIP, xwOBA, park factors, weather/wind vectors).

---

### Finding F-08: Expected Value Floor (+4%) & Binary Staking
- **Finding ID:** `F-08`
- **Área:** Risk Management & Value Formulation
- **Descripción:** Wagers are evaluated via $EV = p \cdot d - 1$. A strict $+4\%$ floor ($EV \ge 0.04$) is enforced. Qualifying bets receive binary stakes: 10% of bankroll if $p \ge th$ (default 60%), otherwise 5%.
- **Evidencia:** `shell_app.js` (`unit()`, `bestOf()`), screenshot [`15_slip_tab_bankroll.png`](<REPO_ROOT>/research/aztecavet/evidence/screenshots/15_slip_tab_bankroll.png).
- **Método:** Unit testing, live UI inspection.
- **Nivel de confianza:** **`[OBSERVADO]` 100%**.
- **Limitaciones:** 10% flat unit allocation introduces severe drawdown risk.
- **Aplicación potencial a PitchLab:** Implement Fractional Kelly ($0.25\times$), drawdown-responsive dampening, and portfolio VaR caps.

---

### Finding F-09: Local Regex Heuristic AI Assistant
- **Finding ID:** `F-09`
- **Área:** AI Systems & Natural Language Processing
- **Descripción:** In standard web browsers, the AI assistant contacts zero external AI models. It executes synchronous regular expression searches over up to 9,000 characters of text extracted from the active iframe DOM.
- **Evidencia:** `ai_assistant.js` (`pageText()`, `local()`), Screenshots [`10_ai_inside_ligamx_answer.png`](<REPO_ROOT>/research/aztecavet/evidence/screenshots/10_ai_inside_ligamx_answer.png), [`17_ai_home_answer.png`](<REPO_ROOT>/research/aztecavet/evidence/screenshots/17_ai_home_answer.png).
- **Método:** Code analysis, live prompt submission during CDP session.
- **Nivel de confianza:** **`[OBSERVADO]` 100%**.
- **Limitaciones:** Cannot test `window.claude.use("sample")` in public browser because the container bridge is absent.
- **Aplicación potencial a PitchLab:** Deploy genuine LangGraph orchestrator with SQL tools, real-time sports search, and streaming LLM responses.

---

### Finding F-10: Procedural 3D Ray-Traced Ball & WebAudio Synthesizer
- **Finding ID:** `F-10`
- **Área:** UX, Audio & Computer Graphics
- **Descripción:** The application avoids external 3D libraries (Three.js) and audio files (.mp3/.wav). The soccer ball is ray-traced per pixel in Canvas 2D, and all audio (drums, flutes, conch, bells) is synthesized mathematically on the WebAudio API graph using an A4 Pentatonic scale.
- **Evidencia:** `shell_app.js` (`startBall()`, `initAudio()`, `huehuetl()`, `caracol()`).
- **Método:** Audio node graph tracing, Canvas 2D math disassembly.
- **Nivel de confianza:** **`[OBSERVADO]` 100%**.
- **Limitaciones:** Audio cannot start before user gesture due to browser autoplay policies.
- **Aplicación potencial a PitchLab:** High-performance, lightweight Canvas charts and subtle haptic sound design without external asset bloat.
