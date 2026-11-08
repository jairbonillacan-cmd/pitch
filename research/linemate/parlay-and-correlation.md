# Parlay Trends, Same Game Parlays (SGP), and Correlation Modeling

## 1. Overview of LineMate Parlay Capabilities

LineMate features two dedicated parlay tools:
1. **Same Game Parlays (`parlayType=SAME_GAME`)**: Multi-leg bets assembled from players within the same NFL game (e.g. Joe Burrow Over 2 Pass TDs + Ja'Marr Chase Anytime TD).
2. **Cross Game Parlays (`parlayType=CROSS_GAME`)**: Multi-leg bets assembled from players across different games kicking off on the same day.

---

## 2. Observable Assembly Logic & Correlation Reality

Based on live payloads extracted in `research/linemate/evidence/network-schemas/parlays_sgp_sample.json`:

### 2.1 The Assembly Heuristic:
LineMate pairs 2 to 3 straight trends together based on a simple heuristic criterion:
```text
"Each leg hit in at least 4 of last 5 games (80%)"
```
Or:
```text
"Each leg hit in 3 of last 3 home/away games (100%)"
```

### 2.2 The Absence of Mathematical Correlation:
LineMate **does not model correlations between events**.
- If Leg A has an 80% hit rate and Leg B has an 80% hit rate, LineMate displays both badges side by side.
- It does **not** calculate the joint probability \(P(A \cap B)\).
- It does **not** evaluate whether Leg A and Leg B positively correlate (e.g. QB Passing Yards and WR Receiving Yards have a strong positive correlation, \(r \approx 0.65\)) or negatively correlate (e.g. QB Pass Attempts and RB Rush Attempts often negatively correlate, \(r \approx -0.40\)).

### 2.3 The Sportsbook SGP Pricing Trap:
Sportsbooks (DraftKings, FanDuel) utilize complex copula algorithms to reduce the payout of positively correlated parlays.
- If an uneducated bettor sees two 80% hit rate legs and assumes the true probability is $0.80 \times 0.80 = 64\%$, while the sportsbook pays only +140 (implied 41.7%), the bettor may be taking on an excessive house edge.
- LineMate does not alert users to the sportsbook's correlation penalty or vig reduction.

---

## 3. Mathematical Foundations for PitchLab SGP Correlation Engine

PitchLab can deliver an industry-first, institutional-grade SGP modeling engine:

### 3.1 Empirical Covariance Matrix:
Model the empirical correlation between key NFL statistical pairs:

| Prop Pair | Typical Correlation (\(r\)) | Strategic Direction | Impact on Joint Probability |
| :--- | :--- | :--- | :--- |
| QB Passing Yards & WR1 Receiving Yards | **+0.60 to +0.72** | Over / Over | Joint prob significantly higher than independent product |
| QB Passing TDs & WR1 Anytime TD | **+0.55 to +0.65** | Over / Yes | Strong positive synergy |
| Team Spread (Favorite Covers) & RB Rush Yards | **+0.35 to +0.48** | Cover / Over | Leading teams run the ball in the 4th quarter |
| QB Pass Attempts & RB Rush Attempts | **-0.30 to -0.45** | Over / Under | Inversely related by offensive play-calling limits |
| WR1 Receiving Yards & WR2 Receiving Yards | **-0.10 to +0.15** | Neutral / Low | Target competition in low-volume offenses |

### 3.2 Gaussian & Clayton Copula Simulation:
Instead of assuming independence \(P(A, B) = P(A) \times P(B)\), PitchLab will use a **Bivariate Copula**:
$$C(u, v; \rho) = \Phi_{\rho}(\Phi^{-1}(u), \Phi^{-1}(v))$$
where \(\Phi_{\rho}\) is the standard bivariate normal distribution with correlation coefficient \(\rho\).

This allows PitchLab to simulate 10,000 game runs and output:
1. **True Joint Probability**: \(P_{\text{true}}(\text{Leg 1 } \cap \text{ Leg 2})\).
2. **Fair Parlay Odds**: The mathematically fair American/Decimal price without vig.
3. **Sportsbook Offered Odds**: The live price offered by DraftKings / FanDuel.
4. **Correlation Edge / Advantage**: Highlighting SGPs where the sportsbook has under-adjusted for correlation, providing a true +EV betting opportunity.
