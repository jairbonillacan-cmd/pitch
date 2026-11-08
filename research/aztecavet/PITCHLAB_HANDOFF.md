# PITCHLAB MASTER HANDOFF — AZTECA VET INTEL & RECONSTRUCTION BLUEPRINT

> **Target Application:** `https://aztecavet.com/`  
> **Authorized Access Passcode:** `[REDACTED_AUTH_CODE]` (Verified Session)  
> **Investigation Group:** Senior Quantitative Systems, Security & Full-Stack Reverse Engineering Team  
> **Destination Superapp:** **PitchLab**  
> **Classification:** Comprehensive Technical Audit & Intellectual Property Handoff  
> **Date:** November 8, 2026  

---

## 1. Executive Summary & Verification Ledger

This master handoff document consolidates the complete reverse engineering of **AZTECA VET** and translates its verified findings into actionable engineering specifications for **PitchLab**. 

Every finding presented herein has been verified through live browser CDP telemetry, static AST disassembly of public JavaScript bundles, and empirical mathematical simulation.

---

## 2. Exhaustive Responses to the 17 Handoff Questions

### 1. Qué funcionalidades comprobadas tiene AztecaVet
AztecaVet possesses the following directly observed and verified functional modules:
- **Client-Side Passcode Gate:** 2-stage lock screen (`#stg1` $\to$ `#stg2`) comparing user input against `CODE = "[REDACTED_AUTH_CODE]"`.
- **Home Navigation Dashboard:** Responsive Bento Grid organizing three sports modules, live Mexican CST clock (`#clk`), audio mute toggle (`#snd`), and smooth-scroll explore trigger (`#explore`).
- **Football Module (5 Tournaments):** Liga MX, La Liga, Premier League, UEFA Champions League, and UEFA Europa League. Includes daily schedule tabs, match tiles, deep analysis sheet, team standings table, editable player injury drawer, and a head-to-head simulation matchup tool.
- **NHL Module:** 32-team coverage across 9 calendar days, daily power rankings, 88-player news/injury drawer, editable stats table, and simulation card.
- **MLB Module:** 2026 Postseason retrospective timeline (17 games), starting pitcher ERA/IP dropdown overrides, key batter absences, and simulation card.
- **Betting Slip ("Mi Boleto"):** Slide-over drawer supporting single bets and multi-leg parlays, odds input, fair price calculation, and correlation warning alerts.
- **Betting History ("Historial"):** Full tracking of committed wagers with status toggles (Won, Lost, Void, Undo, Delete), real-time ROI %, hit rate, and calibration delta diagnostics.
- **Bankroll Manager ("Bankroll"):** Capital balance tracker (`curBank`), 10% threshold selector, and binary stake unit calculator (0%, 5%, 10%).
- **AI Assistant Panel:** Slide-over conversational interface with pre-built query chips and contextual regex search over rendered DOM text.
- **Procedural Graphics & Audio:** Per-pixel ray-traced 3D soccer ball on Canvas 2D, procedural Aztec Sun Stone SVG, and an A4 pentatonic WebAudio software synthesizer.

---

### 2. Cómo están estructurados sus tres deportes
The sports modules are compiled into three standalone HTML sub-applications:
- `fb.html` (173 KB): A unified engine housing all 5 football tournaments. Switches active competition via `window.__START = <comp_code>`.
- `nhl.html` (151 KB): A unified engine covering all 32 NHL franchises and 224 accumulated games of the 2026-27 season.
- `mlb.html` (136 KB): A specialized postseason engine covering 8 playoff teams and 17 games from the 2026 Major League Baseball playoffs.

Each module is encoded as a Base64 string in `PAGES{}` inside `inline_1.js`. When a user selects a sport from the Home screen, the host shell decodes the string (`atob` + `TextDecoder`), injects configuration parameters into the `<head>`, and mounts it inside an iframe (`#fr`) via `srcdoc`. The iframe communicates back to the parent shell exclusively via `postMessage`.

---

### 3. Qué motores estadísticos pueden identificarse
AztecaVet employs a classic sabermetric/statistical modeling hierarchy across all three sports:
1. **Bayesian Shrinkage Baseline:** Regresses team offensive and defensive rates against the league mean:
   $$rs = \frac{GF + K \cdot LG}{GP + K}, \quad ra = \frac{GA + K \cdot LG}{GP + K}$$
2. **Pythagorean Expectation:** Converts scoring rates into expected win percentages:
   $$x = \frac{rs^E}{rs^E + ra^E}$$
3. **Log5 Head-to-Head Odds Ratio:** Models neutral matchup probability combined with home field advantage ($HFA$) and shrinkage toward parity ($SHR$).
4. **Distribution Models:**
   - **Football & NHL:** Discrete bivariate Poisson distribution with goal expectation parameters $(\lambda_h, \lambda_a)$.
   - **MLB:** Continuous Gaussian Normal Distribution with variance $SD = 3\sqrt{2} \approx 4.24264$.

---

### 4. Qué fórmulas se recuperaron del cliente
Every mathematical formula in AztecaVet was completely recovered in plaintext from the unminified client scripts:

#### A. Multi-Format Odds Parsing:
$$d = \begin{cases} 
1 + \frac{V}{100} & \text{if } V \ge +100 \\ 
1 + \frac{100}{|V|} & \text{if } V \le -100 \\ 
v & \text{if } v > 1.0 \text{ (Decimal)} 
\end{cases}$$

#### B. Expected Value & Fair Odds:
$$d_{\text{fair}} = \frac{1}{p_{\text{model}}}, \quad \mathbf{EV} = p_{\text{model}} \cdot d_{\text{bookmaker}} - 1$$

#### C. Football Bisection Tilt (`tilt`):
Solves for $m \in [-1.5, 1.5]$ across 16 iterations such that:
$$\frac{\sum_{i > j} \text{Pois}(i; \lambda_h e^m) \text{Pois}(j; \lambda_a e^{-m})}{\sum_{i \ne j} \text{Pois}(i; \lambda_h e^m) \text{Pois}(j; \lambda_a e^{-m})} = \text{share}$$

#### D. Dixon-Coles Low-Score Correction:
$$\tau(i, j) = \begin{cases} 
1 - \lambda_h \lambda_a \rho & (0, 0) \\ 
1 + \lambda_a \rho & (0, 1) \\ 
1 + \lambda_h \rho & (1, 0) \\ 
1 - \rho & (1, 1) \\ 
1 & \text{otherwise} 
\end{cases} \quad (\rho = -0.14 \text{ MX}, \, -0.08 \text{ Europe})$$

#### E. Starting Pitcher Regression (MLB):
$$\text{ERA}_{\text{reg}} = \frac{\text{ERA}_{\text{starter}} \cdot \text{IP} + \text{ERA}_{\text{corps}} \cdot 80}{\text{IP} + 80}, \quad f = 1 + 0.55 \cdot \left(\frac{\text{ERA}_{\text{reg}}}{\text{ERA}_{\text{corps}}} - 1\right)$$

#### F. Normal Cumulative Distribution Function Approximation:
$$\Phi(x) = 1 - d \cdot t \cdot (0.31938 - 0.35656 t + 1.78148 t^2 - 1.82126 t^3 + 1.33027 t^4)$$
where $t = \frac{1}{1 + 0.2316419 |x|}$ and $d = \frac{1}{\sqrt{2\pi}} e^{-x^2/2}$.

---

### 5. Qué algoritmos son privados o desconocidos
Because AztecaVet runs 100% of its runtime logic in the client bundle, **zero runtime prediction algorithms are private or hidden on a server**. 
The only unknown elements are pre-deployment historical processes:
- The exact build script that consolidated the sub-pages into Base64 strings.
- The web scraping scripts used prior to November 6 to harvest journalistic injury notes.
- Whether Dixon-Coles $\rho = -0.14$ was estimated via Maximum Likelihood Estimation over past Liga MX seasons or manually chosen.

---

### 6. Qué entradas y salidas son observables
- **Observable Inputs:**
  - Team baseline statistics (goals for, goals against, games played).
  - 332 player injury/news records (position, impact $\Delta$, availability status $0, 0.5, 1$).
  - Starting pitcher ERA and IP selections.
  - User-written bookmaker decimal/American odds.
  - User initial bankroll capital and 10% confidence threshold ($th$).
- **Observable Outputs:**
  - Exact decimal probabilities for 18 soccer markets, 15 hockey markets, and 6 baseball markets.
  - Model fair prices ($1/p$).
  - Positive EV percentages ($EV \ge +4\%$) and "SIN VALOR · NO APOSTAR" warnings.
  - Binary stake recommendations (5% vs. 10% of bankroll).
  - "FAVORITO CLARO · GANA + GOLES" Bet Builder combinations.
  - Net profit, ROI %, bankroll growth %, and model calibration error.

---

### 7. De dónde parecen provenir los datos
The data reflects real-world sports reporting dated up to **November 6, 2026**:
- Team standings and results align perfectly with real-world 2025-26 end-of-season tables and 2026-27 early season standings.
- Injury descriptions explicitly cite legitimate sports media: UEFA official previews, ESPN, TUDN, Sports Mole, Fantasy Premier League, RotoWire, FutMercado, Excélsior, ClaroSports, FútbolFantasy, Comuniate, Comunio, okdiario, and The False 9.
- Hockey news records recent transactions, including Connor Hellebuyck's trade to New Jersey on October 23, 2026, and Dylan Larkin's team suspension on October 29.
- Baseball records Milwaukee's World Series 4-1 victory over Tampa Bay on October 28, 2026.

---

### 8. Qué proveedores pueden confirmarse
**Zero commercial B2B API providers (e.g. Sportradar, Stats Perform) are connected to the live deployment.**
The data was collected by the author through automated scraping and manual curation of public fantasy football websites and sports news portals prior to November 6, 2026, and frozen into static literal arrays.

---

### 9. Qué históricos están disponibles
- **True Historical Database:** **None.** There is no database or time-series lakehouse.
- **Embedded Retrospective Audits:**
  - Football: 154 audited past matches across the 5 competitions with real final scores.
  - NHL: 11 audited games from November 5, 2026, with OT/SO flags.
  - MLB: 17 audited postseason games from the 2026 playoffs.

---

### 10. Cómo se actualizan los datos según evidencia
**The live deployment has zero automated data updates.**
- There are no background `fetch` requests, no WebSockets, and no polling routines.
- The ticking clock updates local time only via `new Date()`.
- The real-time analysis terminal is a theatrical `setTimeout` animation.
- Any update to data requires a developer to manually edit source code, run a consolidation script, and deploy a new HTML bundle to Netlify Edge.

---

### 11. Qué arquitectura de IA puede identificarse
The AI Assistant operates under a dual architecture:
1. **Container Bridge Mode (`window.claude.use`):** If running in specific Claude container wrappers, it streams responses from Claude using an embedded system prompt.
2. **Public Browser Mode (Live on Netlify):** In standard web browsers, `window.claude` is undefined. The assistant executes a **purely local regular expression scanner**:
   - Queries matching "pick" or "mejor" extract the `#pdx` DOM node.
   - Queries matching "fórmula" or "decide" extract the `.note` DOM node.
   - Other queries tokenize words and return lines from up to 9,000 characters of iframe DOM text.
   - Zero LLM, zero OpenAI/Anthropic network calls.

---

### 12. Qué capacidades de boleto, historial y bankroll existen
- **Boleto:** Multi-sport selection toggle, single vs. parlay return math, compound odds, manual payout override, and intra-game correlation warning alerts.
- **Historial:** Full lifecycle state machine (`pending` $\to$ `won` / `lost` / `void` / `undo` / `delete`), cumulative P&L, ROI %, and empirical calibration score ($|\Delta| < 4\%$).
- **Bankroll:** Capital balance tracking with a $\$0$ floor, dynamic 5% / 10% unit sizing, and $+4\%$ EV hurdle rate.
- **Persistence:** Saved locally in `localStorage["azteca_av"]`.

---

### 13. Qué limitaciones presenta
1. Statically frozen data requiring manual redeployment.
2. Insecure client-side plaintext gate (`[REDACTED_AUTH_CODE]`) with zero authentication tokens or persistence.
3. High risk of ruin caused by aggressive 10% flat unit compounding.
4. Heuristic regex AI assistant lacking reasoning or memory.
5. Monolithic 1.22 MB single-file architecture that prevents scalability.
6. Lookahead data leakage in retrospective audit calculations.

---

### 14. Qué mejoras puede implementar PitchLab
1. Cloud-native microservices architecture with real-time streaming data ingestion.
2. Server-side quantitative modeling with Bivariate Poisson with Covariates (BPS) and Statcast sabermetrics.
3. Institutional Fractional Kelly allocator ($0.25\times$) with dynamic drawdown dampening.
4. Genuine conversational AI Co-Pilot powered by LangGraph, TimescaleDB RAG tools, and streaming SSE.
5. Enterprise authentication (OAuth2/JWT) and multi-currency bankroll accounting.

---

### 15. Qué motores independientes deben diseñarse
PitchLab must implement a unified polymorphic quantitative engine:
- `FootballEngine`: Bivariate Poisson + dynamic Dixon-Coles MLE + xG possession vectors.
- `HockeyEngine`: Poisson + recent form moving average + goaltender xGSA leverage + 60-min regulation vs. OT modeling.
- `BaseballEngine`: Statcast Normal Distribution + 80-IP Empirical Bayes pitcher regression + park/weather factors.
- `SGP_CopulaEngine`: Gaussian / Clayton Copula to price correlated Same-Game Parlays.
- `KellyPortfolioEngine`: Quadratic programming solver allocating capital across simultaneous overlapping bets.

---

### 16. Qué proveedores legales podrían alimentarlos
- **Primary Tier (MVP):** **API-Football** ($39–$199/mo) for soccer + **The-Odds-API** ($49–$250/mo) for real-time bookmaker lines + **Official MLB / NHL Web APIs** (free/compliance caching).
- **Institutional Tier:** **Sportradar** or **Stats Perform (Opta)** for low-latency live telemetry, official tracking data, and certified B2B commercial redistribution rights.

---

### 17. Qué pruebas permitirían validar modelos propios
1. **Closing Line Value (CLV) Benchmarking:** Track whether PitchLab's fair prices consistently beat the closing lines at Pinnacle/Circa across 5,000+ historical fixtures.
2. **Point-in-Time Walk-Forward Backtesting:** Enforce strict As-Of joins in TimescaleDB to prove profitability without lookahead leakage.
3. **Brier Score & Calibration Curves:** Measure reliability of probability outputs ($|\Delta| < 0.02$).
4. **Monte Carlo Drawdown Stress-Testing:** Simulate 10,000 equity paths under Quarter-Kelly sizing to guarantee maximum drawdown remains $<25\%$ with $99\%$ statistical confidence.

---

## 3. Comprehensive Synthesis & Capability Matrix

| Capacidad | Evidencia Observada | Limitación en AztecaVet | Oportunidad PitchLab | Prioridad |
|---|---|---|---|---|
| **Acceso y Autenticación** | `const CODE = "[REDACTED_AUTH_CODE]"` en texto plano; pad virtual de 12 teclas; animación shake/warp. | Cosmético; sin tokens, sin cookies, sin persistencia al recargar; bypass trivial en consola. | OAuth2 / OIDC, JWT de 15m con rotación en cookies HttpOnly, sesiones Redis, RBAC (Free/Pro/Inst). | **ALTA** |
| **Infraestructura y Red** | Netlify Edge CDN; 1 único HTML de 1.22 MB; 0 llamadas fetch/XHR/WS tras carga inicial. | Incapaz de actualizar datos en vivo; monólito pesado para móviles; sin analítica ni telemetría. | Microservicios en FastAPI / Go, Docker / Kubernetes, WebSockets para odds en vivo, CDN para assets estáticos. | **ALTA** |
| **Ingesta de Datos Deportivos** | Literales JS con 115 equipos de fútbol, 32 NHL, 8 MLB, 332 noticias de bajas al 6 nov 2026. | Estático; congelado en el tiempo; requiere redeploy manual para cualquier actualización. | Pipelines automáticos con API-Football, The-Odds-API y Sportradar; ingestion workers en Redis Streams. | **CRÍTICA** |
| **Motor de Fútbol** | Pitágoras $E=1.7$, Log5 ($HFA=0.54$, $SHR=0.85$), tilt bisección, Poisson + Dixon-Coles ($\rho=-0.14$). | Parámetros estáticos; sin xG real; sin tracking en vivo; 5 ligas fijas. | Bivariate Poisson with Covariates (BPS), MLE dinámico, integración de xG/xA de Opta, 50+ ligas mundiales. | **CRÍTICA** |
| **Motor de NHL** | Pitágoras $E=2.15$, $HFA=0.525$, K=15, 30% form weight, penalización severa a bajas de porteros. | Solo 224 juegos; sin datos de special teams (PP/PK); Poisson sin considerar goles a puerta vacía (EN). | xGSA para porteros, modelado de portería vacía en últimos 2 minutos, Poisson compuesto para 60m vs OT. | **ALTA** |
| **Motor de MLB** | Distribución Normal Gaussiana ($SD=4.2426$), regresión de abridores a 80 IP, bajas de bateadores clave. | Restringido a 8 equipos de playoffs 2026; sin factores climáticos/estadio; sin bullpen dinámico. | Métricas Statcast completas (xwOBA, FIP, Barrel%), factores de parque y clima (viento/humedad), temporada regular. | **ALTA** |
| **Valor Esperado y Filtro** | $EV = p \cdot d - 1$; umbral $EV \ge +4\%$ para recomendar; cuota mínima $1.04/p$. | Requiere que el usuario escriba la cuota a mano; no compara casas automáticamente. | Line Shopping automatizado contra 40+ casas de apuestas; alertas automáticas de valor vía WebSocket. | **CRÍTICA** |
| **Gestión de Bankroll y Sizing** | Sizing binario: 10% si $p \ge th$, 5% si $p < th$; recálculo dinámico de capital. | Riesgo de ruina extremo (10% fijo destruye el bank en 5 derrotas); matemática flotante IEEE 754. | Fractional Kelly ($0.25\times$), limitador dinámico de drawdown ($>15\%$), aritmética de precisión con Decimal.js. | **CRÍTICA** |
| **Boleto y Parlays** | Toggle de selecciones, parlay $P = \prod p_i$, override de cuota, alerta de correlación básica. | Asume independencia estricta; no soporta Same-Game Parlays correlacionados; sin round-robin. | Motor de cópulas gaussianas para SGPs verdaderos, generador de combinadas round-robin, cálculo de cashout. | **MEDIA** |
| **Historial y Calibración** | Registro `{id, ts, legs, p, d, stake, u, st}`, cálculo de ROI %, calibración ($|\Delta| < 4\%$), desglose `BRK`. | Marcado manual de apuestas (el usuario debe decir si ganó); sin sincronización multi-dispositivo real. | Liquidación automática de apuestas vía feeds en vivo, libro de doble entrada inmutable, curva de equity en tiempo real. | **MEDIA** |
| **Asistente "IA"** | Panel `#aip`; en navegador común es regex local sobre 9,000 caracteres de texto del iframe. | Sin razonamiento; sin LLM real; no contesta preguntas semánticas; contexto limitado a 9,000 chars. | Co-Pilot agéntico en LangGraph con herramientas SQL en TimescaleDB, streaming SSE, RAG sobre noticias de reporteros. | **ALTA** |
| **Diseño y Audio** | Balón 3D ray-traced en Canvas 2D; Piedra del Sol SVG; sintetizador WebAudio escala pentatónica. | Choque visual entre shell oscuro y dashboards blancos; staging teatral de 4s para cálculos de 2ms. | UI institucional unificada (Dark/Light mode), gráficos de distribución interactivos, sonido háptico moderno. | **MEDIA** |
| **Datos Históricos y Auditoría** | Sección "Auditoría" con marcadores fijos $✓/✗$; sin base de datos histórica. | Sesgo de supervivencia; data leakage (ratings de nov 6 usados en juegos de oct); sin closing line value. | Data Lakehouse en S3/Parquet particionado por temporada, TimescaleDB con As-Of joins, backtester vectorizado. | **ALTA** |

---

## 4. Final Handoff Sign-Off

The reverse engineering of AztecaVet is complete. All 25 required documentation files and supporting evidence artifacts (18 high-resolution screenshots, browser traces, AST dumps, mathematical test harnesses, and network schemas) are fully archived in `research/aztecavet/`.

**With these architectural blueprints, mathematical specifications, and empirical benchmarks in hand, the PitchLab engineering team possesses everything necessary to build a commercially superior, institutional-grade quantitative sports superapp.**
