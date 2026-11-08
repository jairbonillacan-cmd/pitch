# Sportsbook & DFS Coverage Ecosystem

## 1. Catalog of Supported Sportsbooks & Platforms

Through inspection of `SPORTSBOOKS_CONFIG` in `linemate-react-common/src/constants.js` and live payload responses, LineMate integrates with **19 distinct operators** across sportsbooks, daily fantasy sports (DFS) pick'em platforms, betting exchanges, and event contract markets.

### 1.1 Master Sportsbook Matrix:
| Operator Key | Brand Name | Category | Primary Markets | Deeplinking Supported |
| :--- | :--- | :--- | :--- | :--- |
| `draftkings` | DraftKings Sportsbook | US Commercial Book | US / Ontario | Yes (`outcomeId`) |
| `fanduel` | FanDuel Sportsbook | US Commercial Book | US / Ontario | Yes (`selectionId`, `marketId`) |
| `caesars` | Caesars Sportsbook | US Commercial Book | US / Ontario | Yes (`selectionId`) |
| `betrivers` | BetRivers (Rush Street) | US Commercial Book | US / Ontario | Yes |
| `bet365` | Bet365 | Global / US Book | Global / NJ / OH / CO | Yes (`selectionId`) |
| `unibet` | Unibet (Kindred) | Commercial Book | US / Europe | Yes |
| `williamhill`| William Hill | Commercial Book | Nevada / Europe | Yes |
| `hardrock` | Hard Rock Bet | Monopolistic (Florida) | FL / NJ / OH | Yes |
| `fanatics` | Fanatics Sportsbook | US Commercial Book | US (Multi-state) | Yes |
| `prizepicks` | PrizePicks | DFS / Pick'em | US (30+ states) | Yes |
| `underdog` | Underdog Fantasy | DFS / Pick'em | US (30+ states) | Yes |
| `betrpicks` | Betr Picks (Jake Paul) | DFS / Micro-betting | US (Multi-state) | Yes |
| `prophetx` | ProphetX | Sports Betting Exchange | US (Sweepstakes model)| Yes |
| `novig` | Novig | Commission-free Exchange| US (Peer-to-peer) | Yes |
| `kalshi` | Kalshi Trading | CFTC Event Contract Exch| Nationwide US | Yes (`ticker`) |
| `bet99` | BET99 | Canadian Commercial Book| Canada | Yes |
| `thescore` | theScore Bet (Penn) | Canadian Commercial Book| Ontario | Yes |
| `prolineplus` | PROLINE+ (OLG) | Canadian Lottery Book | Ontario | Yes |
| `betano` | Betano (Kaizen Gaming) | International Book | Ontario / Brazil / Europe| Yes |

---

## 2. Localization & Preference Resolution

In `components/App.jsx`, LineMate executes a dynamic localization algorithm:
```javascript
updatedState.localizedCountryProviders = 
  previousState.configuration?.localizedFeatures?.preferredProvidersV2?.[response.country.code] || [];
```
1. **Country & Region Detection**: `fetchCurrentLocation` identifies the user's IP (e.g. `country: "US"`, `region: "NY"`).
2. **Provider Prioritization**:
   - In New York: DraftKings, FanDuel, Caesars, BetRivers.
   - In Florida: Hard Rock Bet (sole legal operator).
   - In Ontario: Bet99, theScore Bet, Proline+, Betano, FanDuel, DraftKings.
   - In Texas/California (Non-sportsbook states): PrizePicks, Underdog Fantasy, Kalshi.
   - In Mexico / International: Bet365, William Hill.

---

## 3. Affiliate Monetization & Legal Disclosures

LineMate operates as an affiliate marketing publisher:
- When a user clicks an odds pill (e.g. DraftKings `-115`), `getBetslipLinks` dispatches a request to `/api/betslip/v1/operatorLinks`.
- The backend appends LineMate's affiliate tracking query parameters (e.g. `?affiliateId=linemate&campaign=nfl_props`).
- LineMate receives Cost Per Acquisition (CPA) bounties ($150 - $300 per depositing user) or net revenue share (20-30% of user net gaming revenue).
- Regulatory Disclosures: LineMate carries full Responsible Gambling notices (`responsible-gambling-page.js`) and 1-800-GAMBLER helplines as mandated by US state gaming commissions.

---

## 4. Critical Gap & Strategy for PitchLab Mexico / LATAM

LineMate has virtually **zero** coverage of the Mexican regulated sports betting ecosystem.
- None of the top Mexican operators are integrated:
  1. **Caliente.mx** (Commanding >60% of the Mexican sports betting market).
  2. **Codere.mx** (Major retail and digital presence).
  3. **Betcris** (Official NFL Mexico sponsor).
  4. **Novibet México**.
  5. **1xBet México**.

### PitchLab Strategy:
PitchLab will build the **first comprehensive Mexican odds comparison and props engine**:
1. Direct scraping and B2B API feeds for **Caliente.mx** and **Codere.mx**.
2. Dual-market presentation: Mexican books displayed in Mexican Pesos (MXN) alongside global books (Bet365, Pinnacle).
3. Compliance with Mexican gambling regulations governed by SEGOB (Secretaría de Gobernación / Dirección General de Juegos y Sorteos).
