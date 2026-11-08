# Application Pages, Views & Navigation Graph — AztecaVet

> **Target:** `https://aztecavet.com/`  
> **Investigation Focus:** Full Application Inventory, DOM States, Navigation Topology, Iframe Messaging  
> **Classification:** [OBSERVADO] / [INFERIDO] / [RECONSTRUIDO]  
> **Supporting Evidence:** Screenshots `01_initial_gate.png` through `18_after_reload_gate.png`  

---

## 1. Global Navigation Architecture

AztecaVet is built upon a **hierarchical two-tier frame architecture**:
1. **Host Shell (Tier 1):** Manages the Gate (`#lock`), the Home Dashboard (`#app`), the Football Level-2 tournament picker (`#s2`), the Slide-over Boleto/Bankroll Modal (`#slipv`), and the Slide-over AI Assistant Panel (`#aip`).
2. **Sub-Sport Embedded iframes (Tier 2):** When a sport is selected, its pre-rendered Base64 HTML string is decoded and injected as `srcdoc` into `#fr`. The iframe executes independently on the same origin and communicates with the host shell exclusively via `window.postMessage`.

```mermaid
flowchart TD
    G1["Screen 01: Gate Stage 1<br/>(Intro Canvas & 3D Ball)"] -->|Click or Keypress after 900ms| G2["Screen 02: Gate Stage 2<br/>(Numeric Pad #pad)"]
    G2 -->|Passcode == '[REDACTED_AUTH_CODE]'| H["Screen 03: Home Dashboard<br/>(#app - Bento Grid)"]
    
    H -->|Click 'Fútbol' (data-go='fb')| F2["Screen 04: Football Level 2<br/>(#s2 - 5 Tournament Picker)"]
    H -->|Click 'NHL' (data-go='4')| NHL["Screen 10: NHL Dashboard<br/>(iframe #fr with nhl.html)"]
    H -->|Click 'MLB' (data-go='5')| MLB["Screen 11: MLB Dashboard<br/>(iframe #fr with mlb.html)"]
    
    F2 -->|Select Liga MX (data-i='0')| F_MX["Screen 05: Liga MX Dashboard<br/>(iframe #fr with fb.html - MX)"]
    F2 -->|Select La Liga (data-i='1')| F_LL["Screen 06: La Liga Dashboard<br/>(iframe #fr with fb.html - LL)"]
    F2 -->|Select Premier League (data-i='2')| F_PL["Screen 07: Premier League Dashboard<br/>(iframe #fr with fb.html - PL)"]
    F2 -->|Select Champions League (data-i='3')| F_UCL["Screen 08: Champions League Dashboard<br/>(iframe #fr with fb.html - UCL)"]
    F2 -->|Select Europa League (data-i='6')| F_UEL["Screen 09: Europa League Dashboard<br/>(iframe #fr with fb.html - UEL)"]
    
    F_MX & F_LL & F_PL & F_UCL & F_UEL & NHL & MLB -->|Click Game Tile (data-open)| DET["Screen 16: Match Analysis Overlay<br/>(#ov - Detailed Probability Sheet)"]
    
    H & F2 & F_MX & F_LL & F_PL & F_UCL & F_UEL & NHL & MLB -->|Click #slipb (Boleto Bar)| SLIP["Boleto / Bankroll Modal (#slipv)"]
    SLIP -->|Tab 'B'| S_B["Screen 12: Active Slip Tab<br/>(Parlay Math & Stakes)"]
    SLIP -->|Tab 'H'| S_H["Screen 13: History Tab<br/>(Resolved Bets & Calibration)"]
    SLIP -->|Tab 'C'| S_C["Screen 14: Bankroll Config Tab<br/>(Capital & Threshold Settings)"]
    
    H & F2 & F_MX & F_LL & F_PL & F_UCL & F_UEL & NHL & MLB -->|Click #aib (AI Bubble)| AI["Screen 15: AI Assistant Panel<br/>(#aip - Local / Sample Chat)"]
    
    F_MX & F_LL & F_PL & F_UCL & F_UEL & NHL & MLB -->|Click #hback (Back Button)| H
```

---

## 2. Complete Screen Inventory

### Screen 01: Intro Gate (Stage 1)
- **Screen ID:** `SCR-01`
- **Nombre:** Intro & Gate Stage 1
- **Ruta:** `/` (Initial DOM state)
- **Estado:** `#lock` visible, `#stg1` active, `#stg2` hidden, `#app` hidden.
- **Componente principal:** `#lock` container with `#cv` (Canvas 2D starfield) and `#ballc1` (Canvas 2D icosahedral soccer ball).
- **Componentes secundarios:** Subtitle "AZTECA VET · INTELIGENCIA DEPORTIVA", pulsating hint "TOCA PARA CONTINUAR".
- **Interacciones:** Any click, touch, or keystroke after 900 ms advances to Stage 2 (`goStage2()`). Interacting before 900 ms is ignored.
- **Datos mostrados:** Brand title, animated visual canvas elements.
- **Cálculos:** Ray-traced icosahedron vertex rotation in requestAnimationFrame loop.
- **Solicitudes:** None.
- **Persistencia:** None.
- **Responsive:** Fullscreen, Canvas resizes dynamically to viewport aspect ratio.
- **Evidencia:** Screenshot [`01_initial_gate.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/01_initial_gate.png).

---

### Screen 02: Gate Passcode Keypad (Stage 2)
- **Screen ID:** `SCR-02`
- **Nombre:** Gate Stage 2 Keypad
- **Ruta:** `/` (Stage 2 DOM state)
- **Estado:** `#lock` visible, `#stg1` hidden, `#stg2` active.
- **Componente principal:** `#pad` virtual keypad (12 buttons: digits `0-9`, backspace `⌫`, and spacer).
- **Componentes secundarios:** `#dots` indicator (4 circular indicators), `#msg` feedback label.
- **Interacciones:** Clicking virtual keys or typing physical numbers 0-9 / Backspace.
- **Datos mostrados:** Empty/filled dot status, "CÓDIGO INCORRECTO" or "ACCESO CONCEDIDO".
- **Cálculos:** String length check (`buf.length === 4`), strict equality against `"[REDACTED_AUTH_CODE]"`.
- **Solicitudes:** None.
- **Persistencia:** None.
- **Responsive:** Centered keypad dialog (max-width 320px).
- **Evidencia:** Screenshots [`02_pad_open.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/02_pad_open.png), [`03_code_fail.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/03_code_fail.png), [`04_code_success.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/04_code_success.png).

---

### Screen 03: Home Dashboard (Bento Grid)
- **Screen ID:** `SCR-03`
- **Nombre:** Home Dashboard
- **Ruta:** `/` (`#app` active)
- **Estado:** `#app` unhidden, `#lock` removed (`display: none`), `#fr` hidden.
- **Componente principal:** `#bento` grid displaying sports cards: Fútbol (featured double-wide card), NHL card, MLB card.
- **Componentes secundarios:** Header with live clock `#clk`, Audio toggle `#snd`, Explore button `#explore`, Sun Stone SVG illustration, floating AI button `#aib`, fixed bottom Boleto bar `#slipb`.
- **Interacciones:** Card hover with 3D perspective tilt; clicks on sport cards; toggle audio; click Boleto bar; click AI button.
- **Datos mostrados:** Game counts ("29 partidos próximos", "5 hoy"), sport metadata, Mexican CST clock.
- **Cálculos:** Tilt angle based on pointer coordinates; live clock minute ticker; WebAudio ambient sound loop.
- **Solicitudes:** None.
- **Persistencia:** Audio toggle state in runtime memory.
- **Responsive:** CSS Grid switches from 3 columns (Desktop) to single-column stacked cards (Mobile).
- **Evidencia:** Screenshots [`05_home_unlocked.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/05_home_unlocked.png), [`06_home_bento_grid.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/06_home_bento_grid.png).

---

### Screen 04: Football Level-2 Tournament Selector
- **Screen ID:** `SCR-04`
- **Nombre:** Football Tournament Selector (Level 2)
- **Ruta:** `/` (`#s2` active, `#s1` hidden)
- **Estado:** Level-1 bento grid transitions out; `#s2` displays list of 5 soccer tournaments.
- **Componente principal:** `#s2` tournament list containing chips and entry cards for:
  1. Liga MX (`data-i="0"`)
  2. La Liga (`data-i="1"`)
  3. Premier League (`data-i="2"`)
  4. Champions League (`data-i="3"`)
  5. Europa League (`data-i="6"`)
- **Componentes secundarios:** Back button `#bk2` to return to Level 1.
- **Interacciones:** Click any tournament card to launch iframe; click back button to return to Level 1.
- **Datos mostrados:** Tournament name, country/confederation, round subtitle, game count, audit status.
- **Cálculos:** None (pre-rendered metadata in `SP[]`).
- **Solicitudes:** None.
- **Persistencia:** None.
- **Responsive:** Vertical stack list, optimized for touch.
- **Evidencia:** Screenshot [`07_football_tournaments_menu.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/07_football_tournaments_menu.png).

---

### Screens 05–09: Football Dashboards (Liga MX, La Liga, Premier, UCL, UEL)
- **Screen ID:** `SCR-05` (Liga MX), `SCR-06` (La Liga), `SCR-07` (Premier League), `SCR-08` (UCL), `SCR-09` (UEL)
- **Nombre:** Football League Dashboard
- **Ruta:** Sub-application mounted in iframe `#fr` via `srcdoc`
- **Estado:** Host `#app` hides background; `#fr` takes full viewport; `#hintbar` active with `#hback` button.
- **Componente principal:** Main view with day chips (`#days`), match tiles (`#games`), simulation matchup (`#sim`), Pick of the Day banner (`#pdx`), Parlay of the Day banner (`#pldx`).
- **Componentes secundarios:** Navigation tabs (Partidos, Simulador, Bajas, Equipos), News/injury drawer (`#feed`), League Standings & Ratings Table (`#tbl`).
- **Interacciones:** Switch days; open match detail overlay; modify injury status dropdowns (Disponible, Dudoso, Fuera); simulate custom matchups; add picks to slip; enter bookmaker odds.
- **Datos mostrados:** Matchups, CST kickoff times, projected goal distributions, model win probabilities, Dixon-Coles corrected Poisson shares, player injuries with source citations.
- **Cálculos:** Real-time Poisson distribution, Log5 win share, bisection tilt, Dixon-Coles tau matrix, Pick scoring algorithm, EV and unit sizing.
- **Solicitudes:** None (all fixtures and teams embedded).
- **Persistencia:** Odd inputs and slip items communicated to host shell via `postMessage`.
- **Responsive:** Fluid CSS layout with light theme (`--c1: #0e7a46`, white background).
- **Evidencia:** Screenshots [`08_ligamx_dashboard.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/08_ligamx_dashboard.png), [`09_ligamx_frame_content.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/09_ligamx_frame_content.png).

---

### Screen 10: NHL Dashboard
- **Screen ID:** `SCR-10`
- **Nombre:** NHL Dashboard
- **Ruta:** Mounted in iframe `#fr` via `srcdoc` (`nhl.html`)
- **Estado:** Active when selecting NHL from Home.
- **Componente principal:** Daily match tiles (`#games`) across 9 calendar days (Nov 6–13) + Audit day (Nov 5).
- **Componentes secundarios:** Daily Power Ranking panel (`#topp`), News/Injury feed with 88 player entries (`#feed`), 32-team standings table with 2025-26 and 2026-27 records (`#tbl`), Simulation matchup selector (`#sim`).
- **Interacciones:** Change active day; open match detail; adjust goalie/skater injury impact; enter odds; toggle 60-min regulation vs OT markets.
- **Datos mostrados:** Projected goals, Moneyline win probability, Puck Line $\pm1.5$, Over/Under totals, 60-minute regulation 1X2, goalie starting confirmations.
- **Cálculos:** Team ratings with 30% recent form weighting (`FORMW`), Poisson goal distribution up to 22 goals, Over consistency validation (`OVR`).
- **Solicitudes:** None.
- **Persistencia:** Communicates odds and slip additions via `postMessage`.
- **Responsive:** Single/multi-column cards responsive to container width.
- **Evidencia:** Screenshot [`11_nhl_dashboard.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/11_nhl_dashboard.png).

---

### Screen 11: MLB Dashboard
- **Screen ID:** `SCR-11`
- **Nombre:** MLB Dashboard
- **Ruta:** Mounted in iframe `#fr` via `srcdoc` (`mlb.html`)
- **Estado:** Active when selecting MLB from Home.
- **Componente principal:** Playoff timeline (17 postseason games: ALDS, NLCS, ALCS, World Series).
- **Componentes secundarios:** Starting pitcher dropdown selectors (29 pitchers with ERA/IP), Key batter injury list (29 batters), Custom simulation card (MIL vs LAD default).
- **Interacciones:** Select starting pitchers to adjust team Runs Allowed; inspect historical playoff game audits; add markets to slip.
- **Datos mostrados:** Projected runs, Moneyline win probability, Run Line $\pm1.5$, Over/Under, World Series audit outcomes.
- **Cálculos:** Bayesian starting pitcher regression, Normal Gaussian distribution for Over/Under and Run Line.
- **Solicitudes:** None.
- **Persistencia:** Communicates selections via `postMessage`.
- **Responsive:** Centered card feed.
- **Evidencia:** Screenshot [`12_mlb_dashboard.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/12_mlb_dashboard.png).

---

### Screen 12: Boleto Modal (Active Slip Tab)
- **Screen ID:** `SCR-12`
- **Nombre:** Boleto Modal — Tab Boleto
- **Ruta:** Slide-over modal `#slipv` (Tab `b`)
- **Estado:** `#slipv` unhidden; `#spb` tab content active.
- **Componente principal:** Selection list (`AV.slip`) displaying selected markets, match names, fair odds, and entered odds.
- **Componentes secundarios:** Single vs Parlay summary box; Combined probability; Fair parlay odds; Bookmaker payout multiplier (`ovr`); Correlation warning banner; "Registrar apuesta" button.
- **Interacciones:** Remove leg; override parlay odds; register bet into history; switch tabs (Historial, Bankroll).
- **Datos mostrados:** Leg details, odds, combined probability, potential net profit.
- **Cálculos:** $\prod p_i$, $\prod d_i$, potential return based on 5% or 10% unit sizing.
- **Solicitudes:** None (optional WebMCP `window.claude.use("db")` if running in container).
- **Persistencia:** Saved to `localStorage["azteca_av"]`.
- **Responsive:** Slide-over drawer on desktop; full-width modal on mobile.
- **Evidencia:** Screenshot [`13_slip_tab_boleto.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/13_slip_tab_boleto.png).

---

### Screen 13: Historial Modal (Bets History Tab)
- **Screen ID:** `SCR-13`
- **Nombre:** Boleto Modal — Tab Historial
- **Ruta:** Slide-over modal `#slipv` (Tab `h`)
- **Estado:** `#sph` tab content active.
- **Componente principal:** Chronological list of registered bets (`AV.bets`).
- **Componentes secundarios:** Status action buttons (Won `✓ Ganó`, Lost `✗ Perdió`, Void `Nula`, `Deshacer`, `Borrar`); Performance metrics summary (Bankroll, Net Profit, ROI %, Growth %); Calibration score ($|\text{Model } P - \text{Real } W|$); Breakdown by League and Bet Type (`BRK()`).
- **Interacciones:** Mark bet status; delete bet; inspect calibration stats.
- **Datos mostrados:** Bet timestamp, stake, odds, leg breakdown, net return, ROI.
- **Cálculos:** Net profit summation, ROI calculation, calibration delta, subgroup aggregation.
- **Solicitudes:** None.
- **Persistencia:** Saved to `localStorage["azteca_av"]`.
- **Responsive:** Fluid scrollable list.
- **Evidencia:** Screenshot [`14_slip_tab_historial.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/14_slip_tab_historial.png).

---

### Screen 14: Bankroll Config Modal (Settings Tab)
- **Screen ID:** `SCR-14`
- **Nombre:** Boleto Modal — Tab Bankroll
- **Ruta:** Slide-over modal `#slipv` (Tab `c`)
- **Estado:** `#spc` tab content active.
- **Componente principal:** Configuration fields:
  - Initial Bankroll input (`#cfst`, default $1,000 MXN)
  - 10% Threshold dropdown (`#cfth`: 55%, 60%, 65%, 70%)
- **Componentes secundarios:** Explanatory guide explaining the binary 5% vs 10% sizing rule and the EV $+4\%$ floor requirement; Storage indicator ("solo en este navegador" vs "en tu cuenta").
- **Interacciones:** Edit starting capital; change 10% confidence threshold.
- **Datos mostrados:** Current recalculated bankroll, threshold options.
- **Cálculos:** Dynamic re-computation of `curBank() = start + profit`.
- **Solicitudes:** None.
- **Persistencia:** Saved to `localStorage["azteca_av"]`.
- **Responsive:** Form layout.
- **Evidencia:** Screenshot [`15_slip_tab_bankroll.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/15_slip_tab_bankroll.png).

---

### Screen 15: AI Assistant Panel
- **Screen ID:** `SCR-15`
- **Nombre:** AI Assistant Panel
- **Ruta:** Slide-over panel `#aip`
- **Estado:** `#aip.hidden = false`.
- **Componente principal:** Conversation thread `#aim` containing user bubbles (`.am.u`) and assistant bubbles (`.am.a`).
- **Componentes secundarios:** Quick query chips `#aic` ("Mejor pick de hoy", "Bajas importantes", "¿Cómo decide la IA?", "Resumen de esta pantalla"); Text input `#aiq` with submit button; Attribution footer `#aisrc`.
- **Interacciones:** Type questions; click query chips; close with close button `#aix` or Escape key.
- **Datos mostrados:** Assistant responses, attribution note ("Modo local: responde con los datos de esta pantalla").
- **Cálculos:** Local regex keyword parsing against active iframe text (max 9,000 characters).
- **Solicitudes:** None (fallback mode); `claude.use("sample")` if available in container.
- **Persistencia:** Thread retained in memory until page reload.
- **Responsive:** Slide-over right drawer (max-width 420px).
- **Evidencia:** Screenshots [`16_ai_home_open.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/16_ai_home_open.png), [`17_ai_home_answer.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/17_ai_home_answer.png), [`09_ai_inside_ligamx.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/09_ai_inside_ligamx.png), [`10_ai_inside_ligamx_answer.png`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/screenshots/10_ai_inside_ligamx_answer.png).

---

### Screen 16: Match Analysis Detail Overlay (Inside Sport)
- **Screen ID:** `SCR-16`
- **Nombre:** Match Analysis Detail Overlay
- **Ruta:** Mounted inside iframe `#fr` (`#ov` container)
- **Estado:** Active when user clicks "ANALIZAR ▸" on any match tile.
- **Componente principal:** Match detail card (`card()`) featuring:
  - Header: Team names, competition, kickoff time, projected goals/runs.
  - Probability table: Every available betting market with fair odds, model probability bar, bookmaker odds input field, EV indicator, and stake recommendation.
  - Combos section: "FAVORITO CLARO · GANA + GOLES" Bet Builder card.
  - Key factors: Active player injuries, bookmaker overround margins (`noVig`), dominance indicators.
- **Componentes secundarios:** Real-time theatrical analysis terminal (robot animation with blinking eyes, radar ring, 10-line simulation log, "SALTAR" button).
- **Interacciones:** Enter bookmaker odds; click '+' to add market to slip; expand details tag for additional markets; dismiss overlay with close button `#ovx`.
- **Datos mostrados:** All 18 football markets, 15 hockey markets, or 6 baseball markets.
- **Cálculos:** Full statistical model recalculation, EV calculation against user-entered odds, No-Vig overround removal.
- **Solicitudes:** None.
- **Persistencia:** Odd changes posted to parent shell via `postMessage`.
- **Responsive:** Modal overlay with internal scrolling.
- **Evidencia:** Observed in `fb_readable.js` (`lines()`, `card()`), `nhl_readable.js`, `mlb_readable.js`.

---

## 3. Inter-Frame Communication Protocol (`postMessage`)

Because the shell and the sports sub-applications run in separate frame contexts, they communicate across a lightweight postMessage bridge:

```mermaid
sequenceDiagram
    participant Shell as Host Shell (inline_1.js)
    participant Iframe as Sport Frame (#fr)

    Note over Shell,Iframe: Host decodes Base64 HTML and sets #fr.srcdoc
    Iframe->>Shell: postMessage({ av: "ready" })
    Shell->>Iframe: postMessage({ av: "cfg", bank: curBank(), th: AV.cfg.th, odds: AV.odds, inSlip: [...] })
    
    opt User enters an odd in match card
        Iframe->>Shell: postMessage({ av: "odd", k: "FB:MX:Vie 6 nov:NEC-TIJ|h", v: "2.10" })
        Shell->>Shell: AV.odds[k] = v; lsSave();
    end

    opt User clicks '+' to add selection to Boleto
        Iframe->>Shell: postMessage({ av: "add", pk: { k, gk, sp, m, l, p, d, t } })
        Shell->>Shell: Toggles selection in AV.slip; lsSave();
        Shell->>Iframe: postMessage({ av: "cfg", inSlip: [...] })
    end

    opt User clicks Home / Back in iframe
        Iframe->>Shell: postMessage("home")
        Shell->>Shell: closeSport() -> hides #fr
    end
```

### Registered Key Formats:
- Football: `"FB:<comp>:<date>:<home>-<away>|<market_id>"` (e.g. `"FB:MX:Vie 6 nov:NEC-TIJ|h"`)
- NHL: `"NHL:<date>:<home>-<away>|<market_id>"` (e.g. `"NHL:Vie 6 nov:BUF-CBJ|mlh"`)
- MLB: `"MLB:<date>:<home>-<away>:<series>|<market_id>"` (e.g. `"MLB:23 oct:MIL-TB:Serie Mundial|h"`)
