# LineMate Page Inventory & Route Catalog

## 1. Overview

This document catalogs every distinct page, view, modal, and route discovered across the LineMate web application (`linemate.io`), based on live REA browsing captures and reverse engineered routing definitions extracted from `components/App.jsx`.

---

## 2. Master Route Table

| Route Pattern | View Name | Module / Component | Access Tier | Observable Data & Capabilities |
| :--- | :--- | :--- | :--- | :--- |
| `/:league` (e.g. `/nfl`) | Home Dashboard | `pages/Home.jsx` | Public / Free | Matchup cards, Week indicator, Trending parlays carousel, 100% Club Cheatsheets preview, Linemate+ feature banners. |
| `/:league/trends` | Trends Explorer | `pages/Trends.jsx` | Public (Preview) / Premium (Full) | Straight trends (Player & Team), SGP Trends, Cross-Game Parlays. Filterable by Market, Line Type, Timeframe, Signal. |
| `/:league/tools/props` | Props Research Workstation | `pages/Props.jsx` | Public (Preview) / Premium (Full) | Multi-stat player props screener, hit rate rankings, sportsbook odds comparison, line toggles. |
| `/:league/profile/:teamCode/:playerId` | Player Workstation Profile | `components/ProfileWorkstation.jsx` | Free (Basic) / Premium (With/Without) | Deep-dive player workstation: interactive Nivo bar chart, line scrubber, home/away splits, opponent history, game logs. |
| `/:league/players/:playerId` | Player SEO Profile | `components/StatsProfile.jsx` | Public | High-level seasonal player stat averages, active trends feed, and historical game records. |
| `/:league/summary/:gameID` | Game Summary & Matchup | `pages/GameSummary.jsx` | Public | Head-to-head game breakdown, team records, injury report, weather conditions, venue details, and opening odds. |
| `/:league/cheatsheets/:prop` | Prop Cheatsheet | `pages/Cheatsheet.jsx` | Public (Top 5) / Premium (All) | Curated feeds of 100% hit rate props (Recent Form, Versus Opponent, Alternate Lines, 1st Quarter, Unders Only). |
| `/:league/tools/opponent-defensive-rank`| Defensive Matchup Rankings | `pages/OpponentDefensiveRank.jsx` | Public (Preview) / Premium (Full) | 32-team defensive rankings by prop category (Passing, Rushing, Receiving Allowed). Highlights Top 5 and Bottom 5. |
| `/:league/tools/injury-impact` | Injury Impact Explorer | `pages/InjuryImpact.jsx` | Premium (Linemate+) | Hit rates and performance splits of players when specific injured teammates are sidelined. |
| `/:league/tools/weather-report` | Weather Report | `pages/WeatherReport.jsx` | Public | Stadium weather conditions (temperature, wind speed, wind direction: In-to-Out, Crosswind, precipitation). |
| `/:league/tools/starting-lineups` | Starting Lineups | `pages/StartingLineups.jsx` | Public | Projected and confirmed starting lineups, depth charts, inactive listings. |
| `/:league/tools/stats` | League Leaderboard | `pages/Leaderboard.jsx` | Public | Statistical leaders by sport category (Passing yards, Rushing yards, Touchdowns, Sacks). |
| `/:league/tools/standings` | Standings | `pages/Standings.jsx` | Public | Division and conference standings, win/loss records, point differentials, home/away records. |
| `/:league/prediction-markets/:tool` | Prediction Markets Hub | `pages/PredictionMarkets.jsx` | Public / Geo-fenced | Kalshi & Polymarket order books: Most Volume, Largest Trades, Biggest Movers, Market Split. |
| `/:league/tools/chat` | AI Sports Chat | `pages/SportsChat.jsx` | Premium / Beta | Natural language query assistant for sports stats and player props. |
| `/pricing` & `/paywall` | Pricing & Subscription | `pages/Pricing.jsx` | Public | Tier comparison (Free vs Annual vs Monthly), Stripe checkout triggers, feature checklist. |
| `/login` & `/signup` | Authentication | `pages/Login.jsx`, `Signup.jsx` | Public | Email/password, Google OAuth, password reset, Firebase Auth integration. |
| `/bonuses` | Sportsbook Offers | `pages/Bonuses.jsx` | Public | Geo-targeted sportsbook deposit bonuses, promo codes, and affiliate tracking links. |
| `/download` & `/download-w2a` | App Store Downloads | `pages/Download.jsx` | Public | App Store and Google Play badges, smart app banner redirections, QR codes. |
| `/glossary` | Betting Glossary | `glossary.js` | Public | Educational definitions of betting terminology (Vig, Moneyline, Spread, Total, Alternate, Push). |

---

## 3. Deep-Dive Page Profiles

### 3.1 Home Dashboard (`/:league`)
- **Page ID**: `PAGE_HOME`
- **URL**: `https://linemate.io/nfl`
- **Access Level**: Public (Freemium)
- **Primary Components**:
  - `NavigationBar`: Sport switcher (NFL, NBA, MLB, NHL, EPL, etc.), Search trigger, Theme toggle, Auth buttons.
  - `home-page-matchup-wrapper`: Carousel of weekly matchups displaying team logos, 3-letter codes, game time, and status.
  - `trending-today-section`: Trending parlays of the day.
  - `hpc-section-padding`: Cheatsheets carousel featuring 7 cards:
    1. 100% Recent Form
    2. 100% Versus Opponent
    3. 100% Alternate Lines
    4. 100% 1st Quarter
    5. 100% Home/Away Games
    6. 100% Team Form
    7. 100% Unders Only
  - `advanced-tools-section`: Previews for Injury Impact and Opponent Rank with Linemate+ upgrade CTA.
  - `home-sidebar-trending`: Top 3 most bet on and most searched props with real-time odds.

### 3.2 Trends Explorer (`/:league/trends`)
- **Page ID**: `PAGE_TRENDS`
- **URL**: `https://linemate.io/nfl/trends`
- **Access Level**: Freemium (first 5-10 rows public, remaining locked behind paywall)
- **Primary Components**:
  - Sub-navigation Tabs: `Player Trends`, `Team Trends`, `Same Game Parlays`, `Cross Game Parlays`.
  - Filter Bar:
    - Market selector dropdown (`Passing Yards`, `Rushing Yards`, `Receptions`, etc.).
    - Line Type toggle (`Main` vs `Alternate`).
    - Outcome toggle (`Over`, `Under`).
    - Signal filter (`Recent Form`, `Head to Head`, `Home Split`, `Away Split`, `Injury Impact`, `Opponent Rank`, `Weather`).
  - Feed Cards (`TrendContent.jsx`): Each card displays player photo/team badge, line, odds, sportsbook logo, primary hit record badge ("Hit in 16 of last 16 games - 100%"), secondary split badges, and quick-add to betslip button.

### 3.3 Player Workstation (`/:league/profile/:teamCode/:playerId`)
- **Page ID**: `PAGE_WORKSTATION`
- **URL**: `https://linemate.io/nfl/profile/NYJ/b633d550-9ff2-4ae1-9528-4a65680e248d`
- **Access Level**: Freemium (Basic timeframes free; "With/Without Teammate" requires Linemate+)
- **Primary Components**:
  - `ProfileWorkstation` / `TrendsWorkstation.jsx`:
    - Header: Player photo, full name, position, jersey number, active opponent matchup.
    - Market Selector: Dropdown of all available prop markets for this player.
    - Interactive Scrubber: Adjust the numeric line (e.g. 9.5 -> 10.5 -> 11.5) to dynamically recompute hit rates.
    - Nivo Bar Chart (`HitRateChart.jsx`): Interactive bar chart where each bar is a chronological game, colored by team palette, opacity 1.0 if hit, 0.5 if missed, with a horizontal reference line at the prop value.
    - Summary Metrics Card (`HitRateChartInfo.jsx`):
      - Hit Rate percentage (e.g. 100.0%)
      - Record (e.g. 10/10)
      - Sample average (e.g. 16.4 rush attempts)
      - Home average vs Away average
    - Game Log Table (`GamelogDetails.jsx`): Chronological tabular breakdown of date, opponent, result (W/L), score, minutes/participation, and exact statistical value.
    - Supporting Stats Panel (`SupportingStats.jsx`): Relevant contextual statistics (e.g. Snap share %, Redzone attempts, Yards per carry).
