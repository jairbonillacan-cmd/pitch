# Evidence Register & Epistemic Audit Ledger

## 1. Classification Methodology

In accordance with strict reverse engineering principles, every finding, claim, and specification in this report is categorized into one of four epistemic tiers:
- **OBSERVADO [OBS]**: Directly observed, inspected, or executed in live network traffic, DOM captures, or extracted production source code.
- **INFERIDO [INF]**: Logically deduced from observed behavior, naming conventions, or configuration parameters, but where the internal server implementation remains private.
- **RECONSTRUIDO [REC]**: Reconstructed mathematically or architecturally to reproduce identical behavior in an independent clean-room environment.
- **DESCONOCIDO [DES]**: Explicitly unobserved, inaccessible, or proprietary to LineMate's private server infrastructure.

---

## 2. Master Evidence Ledger

| Item ID | Classification | Subsystem | Finding / Claim | Observable Reference / Evidence Source |
| :---: | :---: | :--- | :--- | :--- |
| `EV-01` | **OBSERVADO** | Frontend | Unminified Source Map v3 deployed in production (`main.1f0201a8.js.map`, 11.8 MB). | `research/linemate/evidence/javascript/main.1f0201a8.js.map` |
| `EV-02` | **OBSERVADO** | Frontend | 377 proprietary React/JSX/JS files extracted into clean source tree. | `research/linemate/evidence/javascript/extracted_src/` |
| `EV-03` | **OBSERVADO** | Data Source | Primary stats provider is Sportradar AG (`SRID: sr:player:1692915`, `sr:competitor:4427`, `sr:match:71516008`). | Live API payloads in `network-schemas/upcoming_sample.json` & `player_record_breece_hall.json` |
| `EV-04` | **OBSERVADO** | Data Source | Sleeper Fantasy API integrated for player mapping (`sleeperId: "8155"`). | `network-schemas/trends_straights_sample.json` |
| `EV-05` | **OBSERVADO** | Data Source | Prediction market integration powered by Kalshi order book API (`ticker: "KXNFLTD-26NOV08DALIND-INDDJONES17-1"`). | `network-schemas/player_markets_sample.json` |
| `EV-06` | **OBSERVADO** | Mathematics | Hit rate formula is `hits / games.length * 100`, retaining pushes in the denominator. | `linemate-react-common/src/betting-utils.js` (lines 115-173) |
| `EV-07` | **OBSERVADO** | Mathematics | Opponent rank sorts 32 teams by allowed stats per game in ASC/DESC order. | `linemate-react-common/src/util.js` (lines 965-998) |
| `EV-08` | **OBSERVADO** | Architecture | Access levels governed by integers `0 = SUPERUSER, 1 = FREE, 2 = TRIAL, 3 = PAID`. | `linemate-react-common/src/constants.js` (lines 11147-11150) |
| `EV-09` | **OBSERVADO** | Architecture | Web subscriptions processed via Stripe Billing (`getStripeCheckoutSessionUrl`, `openStripeBillingPortal`). | `pages/Pricing.jsx` |
| `EV-10` | **OBSERVADO** | Architecture | Historical game queries support `LAST_5`, `LAST_10`, `LAST_20`, `SEASON`, `RANGE_2024_2026`. | Live API execution in `scripts/test-workstation-params.mjs` |
| `EV-11` | **OBSERVADO** | Frontend | Interactive charts rendered using `@nivo/bar` (`ResponsiveBar`) with spring animations. | `components/HitRateChart.jsx` |
| `EV-12` | **OBSERVADO** | Mobile | Responsive layout adapts via media queries `< 768px` (mobile) and `> 1024px` (desktop). | Live screenshot captures in `evidence/screenshots/` |
| `EV-13` | **OBSERVADO** | Feature | OCR image scanning endpoint for betting slips (`POST /api/betslip/v1/analyzeImage`). | `components/BetslipImportZone.jsx` |
| `EV-14` | **OBSERVADO** | Modeling | Trends Engine is 100% descriptive historical frequency filtering; zero predictive models exist. | Code inspection across all 377 extracted application files |
| `EV-15` | **INFERIDO** | Backend | Microservices running on Google Cloud Platform Cloud Run / GKE behind Cloud Load Balancing. | Observed `x-cloud-trace-context` response headers and GCP IP blocks |
| `EV-16` | **INFERIDO** | Odds Ingestion | Odds aggregated via B2B feed (Don Best / The Odds API) supplemented by custom websocket consumers. | Structured `operatorData` with selection IDs across 19 bookmakers |
| `EV-17` | **INFERIDO** | Database | Backend database is PostgreSQL or MongoDB with Redis caching layer for precomputed trends. | JSON serialization patterns and sub-50ms response times for large trend lists |
| `EV-18` | **RECONSTRUIDO** | Core Engine | Independent TypeScript hit rate engine and vig removal calculator created and passing tests. | `tests/linemate_mathematical_validation.test.ts` (8/8 passed) |
| `EV-19` | **RECONSTRUIDO** | Data Model | Canonical NFL TypeScript interfaces and JSON schemas authored for PitchLab. | `evidence/data-models/pitchlab_nfl_models.ts` |
| `EV-20` | **DESCONOCIDO** | Backend | Exact server-side Redis cache TTLs and cron scheduling intervals for trends regeneration. | Private server infrastructure (not visible from client HTTP headers) |
| `EV-21` | **DESCONOCIDO** | Commercial | Exact revenue split and CPA agreements negotiated between LineMate and DraftKings / FanDuel. | Private commercial B2B contracts |
