# Unknowns, Limitations & Unobservable Systems — AztecaVet

> **Target:** `https://aztecavet.com/`  
> **Investigation Focus:** Methodological Rigor, Epistemic Boundaries, Unobservable Variables, Systemic Flaws  
> **Classification Framework:** `[DESCONOCIDO]`  

---

## 1. Explicit Register of Unknowns

In adherence to scientific reverse engineering standards, we explicitly document aspects of AztecaVet that cannot be directly observed from the public client-side deployment and must not be fabricated:

### Unknown U-01: Build Toolchain & Pre-Bundling Automation
- **Classification:** `[DESCONOCIDO]`
- **Unobservable Aspect:** The client delivers a single 1.22 MB HTML file where sub-pages are stored as Base64 strings. It is unknown whether this consolidation was performed via a custom Node.js script, a modified Vite plugin, a shell script utilizing `cat` and `base64`, or manual copy-pasting.
- **Why It Matters:** Knowing the build toolchain would clarify whether the author intended to automate daily builds or treats this as a one-off demonstration.

---

### Unknown U-02: Pre-November 6 Scraping Pipelines
- **Classification:** `[DESCONOCIDO]`
- **Unobservable Aspect:** We observe 332 detailed player injury and news records citing dozens of legitimate journalistic sources (UEFA, TSN, DailyFaceoff, Comuniate, FPL, okdiario). However, the software that scraped, parsed, or normalized these records before they were baked into the JavaScript arrays is completely unobservable.
- **Hypothesis:** A Python script (BeautifulSoup / Playwright) likely scraped injury portals on or before November 6, 2026, which was subsequently supplemented by manual editing for major headlines.

---

### Unknown U-03: Statistical Origin of Dixon-Coles Parameters
- **Classification:** `[DESCONOCIDO]`
- **Unobservable Aspect:** In football, the engine specifies $\rho = -0.14$ for Liga MX and $\rho = -0.08$ for other leagues. It is unknown whether the author:
  - Performed a formal Maximum Likelihood Estimation (MLE) over 10 years of Liga MX and European match scores, OR
  - Adopted standard values from academic literature (e.g. Dixon & Coles 1997, which proposed $\rho \approx -0.10$ to $-0.13$).
- **Impact on PitchLab:** PitchLab will not blindly copy $\rho = -0.14$; instead, PitchLab will run its own continuous MLE regression over 15 seasons of historical match data.

---

### Unknown U-04: Derivation of Player Injury Coefficients
- **Classification:** `[DESCONOCIDO]`
- **Unobservable Aspect:** In baseball, Shohei Ohtani is assigned an impact of $-0.50$ runs/game; in hockey, Igor Shesterkin is assigned $+0.40$ goals/game; in football, Rodri is assigned $-0.06$ goals/game. It is unknown whether these weights were calculated via Wins Above Replacement (WAR) / Expected Goals (xG) player contribution models or assigned heuristically based on subjective player stature.

---

### Unknown U-05: The Server-Side Implementation of `window.claude`
- **Classification:** `[DESCONOCIDO]`
- **Unobservable Aspect:** The code contains hooks attempting `window.claude.use("db")` and `window.claude.use("sample")`. In public production on Netlify Edge, these APIs are non-existent. The proprietary cloud infrastructure backing these hooks (which appear to simulate Firestore collections in certain agent containers) cannot be probed from the public web.

---

## 2. Systemic Architectural Limitations of AztecaVet

| Systemic Flaw | Observed Manifestation | Engineering Consequence |
|---|---|---|
| **Zero Live Data Telemetry** | Statically compiled data dated Nov 6, 2026. | Cannot track in-play scores, line movement, or late breaking lineup announcements. |
| **Monolithic Payload Barrier** | 1.22 MB single HTML document. | Adding additional sports (e.g. NBA, Tennis, NFL) or full-season archives would bloat the payload beyond practical mobile download limits. |
| **Fragile Security Posture** | Passcode `[REDACTED_AUTH_CODE]` in plaintext; DOM hidden with CSS. | Zero access control; zero user identity isolation; vulnerable to client tampering. |
| **Lookahead Bias in Audits** | Uses November 6 accumulated standings to audit October matches. | Fails statistical backtesting rigor; overstates historical model accuracy. |
| **Extreme Drawdown Risk** | Fixed 5% / 10% unit sizing with no fractional Kelly scaling. | 5 consecutive losses wipe $>40\%$ of bankroll; high probability of complete ruin over 200 bets. |
| **Heuristic Regex AI Fallback** | Slices 9,000 chars of DOM text and searches keywords. | Incapable of reasoning, calculating multi-sport cross-dependencies, or explaining variance. |
| **No In-Play / Micro-Markets** | Pre-game full match markets only. | Misses $70\%+$ of modern sports betting volume (live quarter/half betting, player props). |
