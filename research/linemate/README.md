# LineMate NFL Reverse Engineering & Architectural Blueprint for PitchLab

## 1. Overview & Project Mandate

This directory contains the exhaustive, empirical reverse engineering study of **LineMate** (specifically targeting the NFL platform at `https://linemate.io/nfl`), conducted by the Senior Engineering & Quantitative Analytics team for **PitchLab**.

The objective of this research is to deconstruct every layer of LineMate's architecture—client-side rendering, routing, state management, API topology, sports data provenance, player props structures, hit rate calculation engines, workstation filtering, odds aggregation, subscription gating, and descriptive trend vs. predictive modeling capabilities—to design a superior, proprietary sports intelligence platform for PitchLab.

---

## 2. Research Team & Methodology

The investigation was executed in accordance with strict reverse engineering principles:
- **Principal Reverse Engineering Engineer**: Instrumenting REA (`reverse-engineer-anything`), Playwright scenarios, Chrome DevTools Protocol, DOM snapshots, network payloads, and source map extraction.
- **Senior Frontend Architect**: Deconstructing the React 18 / SCSS / Nivo / Swiper client architecture, routing hierarchy, state propagation, and design system.
- **Senior Backend Architect**: Mapping REST endpoints, query parameters, payload contracts, rate-limiting, and caching layers.
- **Sports Data Engineer**: Uncovering upstream data providers (Sportradar, Opta, Sleeper), ID mapping strategies, and entity relationships.
- **Sports Analytics Researcher & Quantitative Analyst**: Reverse engineering mathematical formulas (`buildTrendsData`, `buildTeamPropRankings`), distinguishing descriptive hit rates from true probability distributions, and identifying statistical limitations.
- **Database Architect**: Modeling historical game logs, multi-sportsbook odds matrices, and temporal snapshots.
- **QA Automation & Security Engineer**: Validating mathematical behavior with automated unit test suites and evaluating licensing, privacy, and Mexican regulatory compliance.

---

## 3. Directory Structure

```text
research/linemate/
├── README.md                           # Master index and investigation guide
├── executive-summary.md                # High-level synthesis, key findings, and PitchLab roadmap
├── page-inventory.md                   # Complete inventory of all application routes, views, and access tiers
├── navigation-and-routing.md           # Client routing architecture, path resolution, and tab state
├── frontend-analysis.md                # Component tree, state management, CSS architecture, and rendering
├── javascript-analysis.md              # Deobfuscated JS/TS source code analysis, bundle layout, and libraries
├── network-and-apis.md                 # Complete REST API catalog, endpoints, schemas, and query parameters
├── data-provenance.md                  # Upstream data sources (Sportradar, Sleeper, Kalshi) and provider IDs
├── nfl-data-model.md                   # Canonical entities: Player, Team, Game, CumulativeStats, Markets
├── historical-data.md                  # Depth of historical records, game logs, and temporal bounds
├── player-props.md                     # NFL player props catalog, lines, outcomes, and market levels
├── hit-rate-engine.md                  # Mathematical formulation of hit rates, pushes, and sample windows
├── workstation.md                      # Detailed analysis workstation: filters, splits, with/without teammate
├── game-logs.md                        # Historical boxscores, participation, cumulative stats, and sorting
├── player-profiles.md                  # Player profile architecture, active game bindings, and prop cards
├── matchups.md                         # Opponent analysis, defensive rankings allowed, and matchup grades
├── trends-engine.md                    # Straight and parlay trends algorithms, signal triggers, and heuristics
├── parlay-and-correlation.md           # SGP & Cross-Game parlay assembly, correlation analysis vs independence
├── sportsbook-coverage.md              # Integrated bookmakers, DFS platforms, prediction markets, and priority
├── odds-and-markets.md                 # Odds formats, vig removal, price comparison, and operator deep links
├── historical-odds.md                  # Historical odds tracking capabilities, line movement, and gaps
├── prediction-vs-trends.md             # Rigorous demarcation: Descriptive trends vs. Probabilistic models
├── auth-and-subscriptions.md           # Firebase Auth, Stripe billing, access levels (0-3), and feature gating
├── ux-and-design.md                    # Visual system, typography, color tokens, and cognitive load audit
├── responsive.md                       # Desktop, tablet, and mobile responsiveness patterns
├── mathematical-tests.md               # Empirical verification, edge cases (0%, 50%, 100%, pushes), and tests
├── licensing-and-data-options.md       # B2B sports data providers, legal viability, and LATAM SaaS economics
├── evidence-register.md                # Audit ledger classifying findings: OBSERVADO, INFERIDO, RECONSTRUIDO
├── unknowns-and-limitations.md         # Documented limitations, unknowns, and bounded assumptions
├── pitchlab-opportunities.md           # Strategic product opportunities and architectural differentiators
└── PITCHLAB_HANDOFF.md                 # Definitive executive handoff document for product & engineering

evidence/
├── screenshots/                        # Live PNG captures across routes and viewports
├── browser-traces/                     # REA normalized browser scenario trace files
├── network-schemas/                    # Live JSON responses from LineMate API endpoints
├── javascript/                         # Bundles, full source map (11.8MB), and 377 extracted source files
├── data-models/                        # TypeScript definitions and JSON schema contracts
├── calculations/                       # Math verification tables and formulas
└── functional-tests/                   # Automated Vitest test suite running mathematical validations
```

---

## 4. Key Empirical Discoveries

1. **Full Source Map Availability**: LineMate's web production build deployed an unminified source map (`main.1f0201a8.js.map`, 11.8 MB), allowing 100% authenticated recovery of 377 original React/JSX/JS files, exact component names, calculation routines, and API endpoints.
2. **Upstream Data Provider Identified**: LineMate's backend relies directly on **Sportradar** for NFL schedule, game logs, competitor IDs (`SRID: sr:competitor:4427`), and player IDs (`SRID: sr:player:1692915`, `SRGUID`). Sleeper fantasy IDs (`sleeperId`) are also integrated for fantasy cross-referencing.
3. **No Predictive Modeling / Machine Learning Observable**: LineMate's "Trends", "Cheatsheets", and "Injury Impact" features are **100% empirical historical frequency filters**. For example:
   - "Recent Form 100%": Filter `games.slice(0, N).filter(g => g.stat > line)`.
   - "Injury Impact": Filter historical games `where teammate did not play` and compute sample frequency.
   - LineMate generates **zero** forward-looking probabilistic projections, distribution fits (Poisson/Negative Binomial), or market edge valuations. This presents a massive competitive opportunity for PitchLab.
4. **Push Handling in Denominator**: In `buildTrendsData`, LineMate's hit rate formula is `hits / games.length * 100`. Pushes are treated as non-hits in the numerator while staying in the denominator. A player with 7 hits, 1 push, and 2 misses is displayed as a 70.0% hit rate, even though a push is refunded in betting markets (where decisive hit rate is 7/9 = 77.8%).
5. **Multi-Book & Prediction Market Coverage**: LineMate aggregates standard sportsbooks (DraftKings, FanDuel, Caesars, BetMGM, Bet365, BetRivers, Unibet), DFS platforms (PrizePicks, Underdog, Betr), Canadian books (Bet99, Proline+), and innovative prediction market exchanges (**Kalshi** and **Novig**), including direct operator deep-linking.
6. **Feature Gating via Access Levels**: Client access is governed by integer levels: `0 = SUPERUSER`, `1 = FREE`, `2 = TRIAL`, `3 = PAID`. Freemium limits are implemented on both client UI and backend endpoints (`/api/nfl/v4/players/:id/record` vs `/games?withPlayerIds=...`).
