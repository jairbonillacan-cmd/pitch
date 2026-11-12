# Data Provenance, Timestamps & Provider Candidates — AztecaVet

> **Target:** `https://aztecavet.com/`  
> **Investigation Focus:** Data Extraction, Integrity Audit, Frozen Timestamps, Commercial Sports API Evaluation  
> **Classification:** [OBSERVADO] / [INFERIDO] / [RECONSTRUIDO]  
> **Data Inventory:** [`dataset_inventory.json`](<REPO_ROOT>/research/aztecavet/evidence/javascript/dataset_inventory.json)  

---

## 1. Inventory of Embedded Datasets

All datasets in AztecaVet are statically declared in JavaScript literals inside the Base64 sports payloads. None are retrieved over the network.

| Dataset Entity | Sport / League | Record Count | Attributes & Schema Structure |
|---|---|---|---|
| **Teams (`TD`)** | Football (PL, LL, MX, SA, BL, L1, OT) | **115 teams** | Code, Name, League, GF (25-26), GC (25-26), GP (25-26), Phase 26-27 `[GF, GC, PJ]`, Flags (`e` estimated, `n` no data, `p` promoted), Competitions. |
| **Fixtures (`DD`)** | Football (5 Leagues) | **183 matches** | Home, Away, Kickoff Time (CST), Reference Odds, Match Notes. 29 Upcoming (MX: 9, LL: 10, PL: 10) + 154 Audited. |
| **Injuries (`NW`)** | Football | **215 records** | ID, Team Code, Player Name (Position), Role (`gf` attack, `ga` defense), Impact ($\Delta \text{goals}$), Status (0 available, 0.5 doubtful, 1 out), Source Note, Date. |
| **Teams (`T`)** | NHL | **32 franchises** | Code, Full Name, GF (2025-26), GA (2025-26). (STL flagged as `0, 0` "SIN DATO"). |
| **Results (`R`)** | NHL | **224 games** | Home, Away, Home Score, Away Score (accumulated games of 2026-27 season). |
| **Calendar (`D`)** | NHL | **61 games** | 9 calendar days (Nov 6–13, 2026), including SEA vs CAR in Helsinki (Nov 12). |
| **News / Injuries (`N`)** | NHL | **88 records** | Skaters and starting goaltenders with goal impact, status, source citations, and date. |
| **Teams (`T`)** | MLB | **8 teams** | Playoff teams: Atlanta, Cleveland, White Sox, Dodgers, Brewers, Yankees, Padres, Rays. RS/G, RA/G, Bullpen ERA. |
| **Pitchers (`PL`)** | MLB | **29 pitchers** | ID, Team, Name, Season ERA, Innings Pitched (IP). |
| **Batters (`BT`)** | MLB | **29 batters** | ID, Team, Name, Run Impact per game, Out status, Postseason narrative note. |
| **Postseason Timeline** | MLB | **17 games** | ALDS Game 4 through World Series Game 5 (Milwaukee Brewers champion 4-1 over Tampa Bay Rays). |

---

## 2. Timestamp & Freshness Analysis

A critical objective of this audit was determining whether AztecaVet maintains automated background synchronization. The evidence proves conclusively that **the data is static and frozen**:

1. **Effective Data Cutoff Date:** **November 6, 2026.**
   - All football injuries and team standings cite sources dated between October 10 and November 6, 2026.
   - NHL accumulated results end on November 5, 2026.
   - MLB season is explicitly documented as concluded: "MIL campeón 4-1 · temporada terminada".
2. **Superficial Real-Time Illusion:**
   - The header clock (`#clk`) updates every 20 seconds, but merely calls `new Date().toLocaleTimeString("es-MX")`. It displays the visitor's local system time, not live data latency.
   - The label **"ACTUALIZADO AL 6 NOV 2026"** is a hardcoded static string in the HTML.
   - The real-time analysis terminal ("Sincronizando...", "Escaneando mercados...") is an animated `setTimeout` chain that plays for theatrical effect; the calculations are completed instantaneously upon opening the tile.

---

## 3. Data Source Attribution & Scraping Signatures

By analyzing the source notes in `NW` (football) and `N` (hockey), we identified the real-world journalistic and statistical sources used to compile the data:

- **Football Sources:** UEFA Official match previews, ESPN, TUDN, Sports Mole, Fantasy Premier League (FPL) official injury lists, RotoWire, FutMercado, Excélsior, ClaroSports, FútbolFantasy, Comuniate, Comunio, okdiario, The False 9.
- **NHL Sources:** NHL.com Status Reports, TSN (Bob McKenzie / Pierre LeBrun reports), DailyFaceoff (starting goalies), DobberHockey, CBS Sports, Boston.com.
- **MLB Sources:** MLB.com, MLB Trade Rumors, Baseball-Reference, Fox Sports.

**Analytical Deduction:** The author compiled this dataset through a mixture of automated scraping of fantasy/injury portals (e.g. DailyFaceoff and FútbolFantasy) and manual curation of notable headlines (e.g. "Hellebuyck traspasado a NJ el 23 oct", "Dylan Larkin suspendido sin sueldo", "Vinícius sanción de 4 partidos").

---

## 4. Evaluation of Commercial Sports API Providers for PitchLab

To build a fully automated, legally licensed enterprise platform in PitchLab, we evaluated candidate sports data providers:

| Provider | Sport Coverage | Historical Depth | Update Latency | Pricing Tier | Commercial Rights & Model Training | Recommended PitchLab Fit |
|---|---|---|---|---|---|---|
| **Sportradar** | Global Football, NHL, MLB, NBA, NFL | 15+ years | Sub-second ($<200\text{ms}$) live feeds | Enterprise ($3,000–$15,000+/mo) | Full B2B redistribution rights, odds integration, certified sports data | **Primary for Institutional Tier** |
| **API-Football (API-Sports)** | 900+ Football leagues, MLS, Liga MX | 10+ years | 15–30 seconds | Developer ($39–$199/mo) | Permitted in commercial apps; no raw redistribution of live streams | **Primary for PitchLab MVP Football** |
| **The-Odds-API** | Global sports odds (40+ bookmakers) | 3+ years | 15 seconds to 1 minute | Scalable ($0–$250/mo) | Permits EV calculations, odds comparison displays, bet slip assistance | **Primary for Real-Time Bookmaker Odds** |
| **Opta (Stats Perform)** | Football xG, advanced spatial telemetry | 20+ years | Real-time | Enterprise ($5,000+/mo) | Proprietary metrics (xG, xA, sequences); heavy licensing restrictions | Secondary (Future Deep Analytics) |
| **MLB Stats API (Official)** | Comprehensive MLB / MiLB | 100+ years | Official real-time | Free / Partner terms | Extensive data via public endpoints (requires caching & compliance) | **Primary for PitchLab Baseball** |
| **NHL API (Official Web)** | Complete NHL play-by-play | 30+ years | Official real-time | Free / Partner terms | Official live shifts, goalie tracking, shot locations | **Primary for PitchLab Hockey** |

---

## 5. Architectural Recommendations for PitchLab

1. **Hybrid Ingestion Architecture:**
   - **Low-Cost Tier:** API-Football + Official MLB/NHL APIs for baseline fixtures, rosters, and box scores.
   - **Odds Engine:** The-Odds-API polling Pinnacle, Bet365, Caliente, and Circa Sports every 30 seconds for live market comparison.
2. **Automated Injury Scraper & LLM Extraction Pipeline:**
   - Deploy automated headless workers monitoring team beat writers, press conferences, and official league injury reports.
   - Process unstructured text with Gemini 1.5 Flash to automatically extract:
     `{ player, team, position, status: "out" | "doubtful", projected_impact: float }`.
3. **Point-in-Time Data Lake:**
   - Store all raw provider payloads in an immutable S3/MinIO bucket with nanosecond timestamps to allow precise backtesting without lookahead bias.
