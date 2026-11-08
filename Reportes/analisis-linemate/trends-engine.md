# Trends Engine Architecture, Triggers & Heuristics

## 1. Engine Architecture & Signal Taxonomy

LineMate's Trends Engine scans scheduled NFL games and generates a stream of noteworthy historical occurrences ("Trends").

### 1.1 Signal Categories (`SIGNAL_OPTION_KEYS`):
- `RECENT_FORM`: Prop hit in \(k\) of last \(n\) games (e.g. "Hit in 16 of last 16 games").
- `HEAD_TO_HEAD`: Prop hit against current opponent in recent meetings (e.g. "Hit in 2 of last 2 games vs CIN").
- `HOME_SPLIT`: Prop hit in home games (e.g. "Hit in 5 of last 5 home games").
- `AWAY_SPLIT`: Prop hit in away games (e.g. "Hit in 8 of last 8 away games").
- `INJURY_IMPACT`: Prop hit in games where a specific teammate was sidelined.
- `OPPONENT_RANK`: Prop faces a defense ranked bottom-5 in the league for that stat.
- `WEATHER`: High wind or freezing temperature context impacting totals.

---

## 2. Trend Generation & Ranking Algorithm

Trends are precomputed periodically by LineMate's backend and exposed via:
`GET /api/:league/v1/trends/straights?limit=20&sortBySignals=RECENT_FORM...`

### 2.1 Generation Criteria:
To qualify as an active trend, an outcome must meet minimum heuristic thresholds:
1. **Hit Rate Threshold**: The prop must have hit in at least 70% of the evaluated sample (\(\ge 70\%\)), with priority given to 100% streaks.
2. **Minimum Game Count**: At least 3 games in the evaluated timeframe.
3. **Active Line Availability**: A licensed bookmaker must be currently offering an active market line for that player.

### 2.2 Ranking & Ordering Logic:
When returning trends, LineMate orders results by:
1. **Hit Rate Percentage**: Descending (100% trends appear first).
2. **Consecutive Streak Length**: Among 100% trends, 16/16 ranks higher than 10/10, which ranks higher than 5/5.
3. **Signal Count Multiplier**: Trends that satisfy multiple signals simultaneously (e.g. 100% Recent Form + 100% H2H + 100% Split + Top Matchup) receive an elevated composite score.
4. **Market Popularity**: Major markets (Passing Yards, Rushing Yards, Anytime TD) receive precedence over niche markets (Longest Field Goal).

---

## 3. The Distinction Between Descriptive Trends and Expected Value (EV)

The user prompt explicitly commands:
> "No confundir un sistema de tendencias históricas con un modelo de predicción probabilística. Debes determinar qué funciones son simples cálculos sobre datos históricos y cuáles generan auténticas estimaciones futuras."

### 3.1 Mathematical Demarcation:
- **What a LineMate Trend Is**: A **descriptive historical summary**. It answers: *"In the last \(N\) games, did \(X > L\)? Yes, 10 out of 10 times."*
- **What a LineMate Trend Is NOT**: A **probabilistic forecast**. It does **not** answer: *"What is the true probability that \(X > L\) this Sunday?"*

### 3.2 The Hot-Hand & Small-Sample Fallacies in LineMate:
1. **Small Sample Noise**: Highlighting a trend like `"Hit in 1 of last 1 games vs DAL (100%)"` or `"Hit in 3 of last 3 home games (100%)"` is statistically meaningless. In an 18-week NFL season with high variance, streaks of 3 or 4 games happen purely by random chance.
2. **Market Pricing Exploitation**: If a running back has hit Over 12.5 rush yards in 10 consecutive games, sportsbooks adjust by either raising the line (e.g. to 16.5) or severely juicing the odds (e.g. -165). Betting a 100% historical trend at -165 requires an implied win rate of 62.3% just to break even; if true forward probability is only 55%, the bettor has a negative expected value (-EV) despite the 100% historical streak!

---

## 4. PitchLab Trends 2.0 Engine Blueprint

PitchLab will re-invent the trends engine by integrating true quantitative edge metrics:
1. **Expected Value Tagging**: For every trend, display the **True Model EV**:
   $$\text{EV} = (P_{\text{model}} \times \text{Net Profit}) - ((1 - P_{\text{model}}) \times \text{Stake})$$
   Highlight trends only when \(\text{EV} > 0\).
2. **Streak Regression Modeling**: Automatically calculate the expected mean-reversion decay rate for streaks exceeding 8 games.
3. **Sample Confidence Rating**: Attach a 1-to-5 star statistical significance score based on sample size and p-value.
