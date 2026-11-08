# AZTECA VET — Master Reverse Engineering & Technical Intelligence Report

> **Target Application:** `https://aztecavet.com/`  
> **Authorized Access Code:** Protected session via authorized client passcode  
> **Primary Analysis Tool:** REA (`rea-agents@6.8.0`), Playwright (Chromium/Edge CDP), Node.js v26.13.0  
> **Destination Project:** **PitchLab** (Next-generation Quantitative Sports Platform)  
> **Date of Investigation:** November 8, 2026  
> **Classification:** Comprehensive Technical Audit & Intellectual Property Handoff  

---

## 1. Executive Mission & Scope

This dossier represents the exhaustive, senior-level reverse engineering and systems architecture investigation of **AZTECA VET** (`https://aztecavet.com/`). The investigation was executed with a multi-disciplinary focus combining Reverse Engineering, Sports Data Engineering, Quantitative Modeling, Machine Learning, Full-Stack Architecture, QA Automation, and Cybersecurity.

The core objective is **not visual reproduction**, but rather the **complete decodification and mathematical verification** of:
1. Client-side authentication and session architecture.
2. Complete view inventory, state machines, and iframe messaging topologies.
3. Quantitative sports prediction engines (Football, NHL, MLB).
4. Probability distributions, odds conversions, and Expected Value (EV) algorithms.
5. Ticket (Slip), Bet History, and Bankroll capital allocation engines.
6. The "AI Assistant" system and its real execution boundaries.
7. Data provenance, timestamps, external dependencies, and real-time synchronization claims.
8. Transferable architectural blueprints and technical opportunities for **PitchLab**.

---

## 2. Directory Structure of Deliverables

All research documentation and supporting empirical evidence are organized in `research/aztecavet/`:

```text
research/aztecavet/
├── README.md                      # [THIS FILE] Project overview, navigation & reproduction guide
├── executive-summary.md           # High-level architecture, critical findings & strategic summary
├── authentication-flow.md         # In-depth analysis of the gate mechanism & security posture
├── pages-and-navigation.md        # Complete screen inventory, DOM states & navigation graph
├── frontend-analysis.md           # Bundle structure, rendering, animations, Canvas & WebAudio
├── javascript-analysis.md         # Disassembly of inline scripts, AST inspection & state management
├── network-and-apis.md            # CDP & Playwright network audit (0 external API requests confirmed)
├── data-provenance.md             # Data audit (teams, players, games, injuries, timestamps & providers)
├── historical-data.md             # Analysis of audit modes vs true historical database architectures
├── update-mechanisms.md           # Audit of real-time update claims vs baked static snapshots
├── prediction-pipeline.md         # End-to-end predictive pipeline (Hypothesis vs Reality)
├── football-engine.md             # Quantitative breakdown: Pythagoras, Log5, Dixon-Coles, Poisson (5 leagues)
├── nhl-engine.md                  # Quantitative breakdown: Goalies, Form Weight, Poisson, Over consistency
├── mlb-engine.md                  # Quantitative breakdown: Normal Distribution (SD 4.24), Pitcher ERA regression
├── engine-comparison.md           # Cross-sport comparative matrix & unified quantitative blueprint
├── probability-and-value.md       # Math formulas: EV (+4% edge), Fair Odds, No-Vig, Sizing (5%/10%)
├── ticket-system.md               # Slip mechanics, postMessage protocol, parlays & correlation checks
├── history.md                     # Bet tracking, state lifecycle, calibration metrics & persistence
├── bankroll.md                    # Capital management, ROI, Yield, Drawdown & decimal precision
├── ai-assistant.md                # AI Assistant audit (Local keyword match vs WebMCP) & PitchLab design
├── ux-and-design.md               # Piedra del Sol SVG, Ray-traced 3D ball, WebAudio synthesis & themes
├── mathematical-tests.md          # Numerical validation, sensitivity analysis & test runner results
├── evidence-register.md           # Rigorous evidence ledger (OBSERVADO, INFERIDO, RECONSTRUIDO, DESCONOCIDO)
├── unknowns-and-limitations.md    # Transparent documentation of unobservable variables & limits
├── pitchlab-opportunities.md      # Strategic differentiation roadmap for PitchLab
└── PITCHLAB_HANDOFF.md            # Comprehensive synthesis answering the 17 core handoff items

Evidence Artifacts:
research/aztecavet/evidence/
├── screenshots/                   # 18 high-resolution screenshots capturing every state and modal
├── browser-traces/                # CDP session logs, initial navigation traces & storage dumps
├── javascript/                    # Extracted and de-obfuscated client scripts & data inventories
├── network-schemas/               # Comprehensive network logs verifying 0 background API calls
├── interaction-tests/             # Automated Playwright test run results & assertions
└── mathematical-tests/            # Numerical test runner outputs & precision validation logs
```

---

## 3. Evidence Classification Standards

Every technical finding throughout this research is strictly tagged with its evidentiary basis:

- **`[OBSERVADO]`**: Directly observed and verified in the live application, CDP trace, or client bundle.
- **`[INFERIDO]`**: Statistically or structurally deduced from consistent indirect behavior with mathematical certainty.
- **`[RECONSTRUIDO]`**: Clean-room implementation created independently for PitchLab based on observed formulas.
- **`[DESCONOCIDO]`**: Unobservable implementation details that are acknowledged and documented rather than fabricated.

---

## 4. How to Reproduce the Findings

To re-run the live browser interaction suite and the mathematical test harnesses:

```bash
# 1. Run live interaction test against aztecavet.com
node scripts/comprehensive_test_live.mjs

# 2. Run mathematical validation suite
node scripts/verify_mathematical_models.mjs

# 3. Inspect captured evidence
Get-ChildItem research/aztecavet/evidence/screenshots/
Get-Content research/aztecavet/evidence/interaction-tests/interaction_results.json
Get-Content research/aztecavet/evidence/mathematical-tests/test_results.json
```
