# Probability, Value (EV), Odds & Sizing Mathematics — AztecaVet

> **Target:** `https://aztecavet.com/`  
> **Investigation Focus:** Odds Conversions, No-Vig Normalization, Expected Value, Stake Sizing, Kelly Comparison  
> **Classification:** [OBSERVADO] / [INFERIDO] / [RECONSTRUIDO]  
> **Test Verification:** [`test_results.json`](<REPO_ROOT>/research/aztecavet/evidence/mathematical-tests/test_results.json)  

---

## 1. Odds Formats & Parsing Engine

AztecaVet provides a flexible, internationalized odds parser (`dec()` in sports modules, `decO()` in shell):

```javascript
const dec = s => {
  const v = parseFloat(String(s == null ? "" : s).replace(",", "."));
  if (isNaN(v)) return null;
  // American Odds Format (|v| >= 100)
  if (Math.abs(v) >= 100) return v > 0 ? 1 + v / 100 : 1 + 100 / -v;
  // Decimal Odds Format (v > 1.0)
  return v > 1 ? v : null;
};
```

### Mathematical Definitions:
1. **Positive American Odds ($V \ge +100$):**
   $$d = 1 + \frac{V}{100}$$
   *Example:* $+150 \implies 1 + \frac{150}{100} = 2.50$.
2. **Negative American Odds ($V \le -100$):**
   $$d = 1 + \frac{100}{|V|}$$
   *Example:* $-200 \implies 1 + \frac{100}{200} = 1.50$.
3. **Decimal Odds ($d > 1.0$):** Accepted directly (e.g. `2.15`, with comma tolerance `2,15`).

---

## 2. Fair Odds & Bookmaker Overround (No-Vig)

Bookmakers build a profit margin (the "overround", "vig", or "juice") into their prices.

### 1. Implied Probability vs. Fair Odds:
$$\text{Implied Probability: } p_{\text{implied}} = \frac{1}{d_{\text{bookmaker}}}$$
$$\text{Model Fair Odds: } d_{\text{fair}} = \frac{1}{p_{\text{model}}}$$

### 2. Group Overround & Margin Extraction (`NV` / `noVig`):
For any complementary market group $G = \{ d_1, d_2, \dots, d_N \}$ (e.g. 1X2 in football, Moneyline in hockey, Over/Under):

$$\text{Overround Margin } M = \sum_{k=1}^N \frac{1}{d_k} - 1$$

In the match detail view, AztecaVet displays this transparently to the user:
```html
<span class="bd">Margen casa 1X2: 6.2%</span>
```

### 3. Fair Probability Clean Extraction:
When removing the bookmaker's margin proportionally:
$$p_{\text{clean}, k} = \frac{1 / d_k}{1 + M} = \frac{1 / d_k}{\sum_{i=1}^N 1 / d_i}$$

---

## 3. Expected Value (EV) Formulation

Expected Value measures the average expected percentage return per unit staked:

$$\mathbf{EV} = p_{\text{model}} \cdot d_{\text{bookmaker}} - 1$$

### Edge Filter Rule (`EVMIN = 0.04`):
The application enforces a **$+4\%$ mathematical advantage threshold**:
- If a user enters bookmaker odds such that $\mathbf{EV \ge +0.04}$ (+4%):
  The UI highlights the market in bright green:
  ```html
  <div class="pick v">
    <span>MEJOR VALOR · EV +14%</span>
    <div>América gana @ 2.10</div>
    <b>54.2%</b>
  </div>
  ```
- If all entered odds result in $EV < +0.04$:
  The UI triggers the **"SIN VALOR · NO APOSTAR"** status banner, warning the user:
  $$\text{Required Minimum Odd } d_{\text{min}} = \frac{1 + 0.04}{p_{\text{model}}} = \frac{1.04}{p_{\text{model}}}$$
  *"Ninguna cuota que escribiste le saca 4% de ventaja a la casa. Este pick solo vale si te pagan $d_{\text{min}}$ o más."*

---

## 4. Stake Sizing: AztecaVet Binary Staking vs. Kelly Criterion

### AztecaVet's Heuristic Binary Sizing:
AztecaVet avoids complex continuous formulas and implements a simplified, transparent two-tier sizing rule (`unit()`):

$$\text{Stake Unit } (u) = \begin{cases} 
0\% & \text{if } EV < +4\% \quad (\text{"NO APOSTAR"}) \\ 
10\% \text{ of Bankroll} & \text{if } EV \ge +4\% \land p_{\text{model}} \ge \text{threshold} \quad (\text{default threshold } = 0.60) \\ 
5\% \text{ of Bankroll} & \text{if } EV \ge +4\% \land p_{\text{model}} < \text{threshold} 
\end{cases}$$

### Comparison with the Kelly Criterion:
The mathematically optimal capital growth formula for independent wagers is the **Kelly Criterion**:

$$f^* = \frac{b \cdot p - q}{b} = \frac{(d - 1)p - (1 - p)}{d - 1} = \frac{p \cdot d - 1}{d - 1} = \frac{\mathbf{EV}}{d - 1}$$

| Metric | AztecaVet Binary Rule | Full Kelly Criterion ($1.0\times$) | Fractional Kelly ($0.25\times$) |
|---|---|---|---|
| **Simplicity** | Very High (Only 5% or 10%) | Low (Continuous fraction) | Moderate |
| **Edge Sensitivity** | None (Same stake for +5% EV or +30% EV) | High (Scales linearly with EV) | High |
| **Drawdown Risk** | **Extreme** (10 consecutive losses wipe $65\%$ of bank) | Severe (High volatility) | **Optimal (Low drawdown, high long-term CAGR)** |
| **Bankroll Protection** | Weak | Optimal asymptotic growth | **Institutional Standard** |

---

## 5. Multi-Leg Parlay Mathematics

When combining $M$ selections into a parlay ticket:

### 1. Independent Product Rule:
$$P_{\text{parlay}} = \prod_{i=1}^M p_i, \quad d_{\text{parlay}} = \prod_{i=1}^M d_i$$
$$\text{Fair Parlay Odds: } d_{\text{fair}} = \frac{1}{P_{\text{parlay}}}$$
$$\text{Parlay Expected Value: } EV_{\text{parlay}} = P_{\text{parlay}} \cdot d_{\text{parlay}} - 1$$

### 2. Intra-Match Correlation Alert:
The slip engine inspects game keys (`gk`). If two or more selections share the same `gk` (e.g. Barcelona win + Over 2.5 goals in the same match), the independent product is mathematically invalid. 

AztecaVet flags an explicit warning banner:
> **"ADVERTENCIA DE CORRELACIÓN:** Dos o más selecciones pertenecen al mismo partido. La probabilidad combinada calculada como producto simple puede estar artificialmente inflada o desinflada."

---

## 6. Numerical Validation Results

From automated test harness `scripts/verify_mathematical_models.mjs` ([`test_results.json`](<REPO_ROOT>/research/aztecavet/evidence/mathematical-tests/test_results.json)):

```json
{
  "odds_conversion_passed": 7,
  "odds_conversion_failed": 0,
  "ev_and_sizing_passed": 4,
  "ev_and_sizing_failed": 0,
  "football_simulation": {
    "prob_home_win": 0.4485,
    "prob_draw": 0.2810,
    "prob_away_win": 0.2705,
    "sum_probs": 1.0000
  },
  "mlb_normal_distribution": {
    "line": 8.5,
    "total_runs": 8.4,
    "prob_over": 0.4906,
    "prob_under": 0.5094
  }
}
```
*Result: 100% mathematical accuracy across all unit tests.*

---

## 7. PitchLab Institutional Sizing Upgrade

PitchLab will replace AztecaVet's fixed 5%/10% rule with an **Institutional Fractional Kelly Portfolio Engine**:
1. Default to **Quarter-Kelly ($0.25\times f^*$)** to protect users against model estimation errors.
2. Dynamic Bankroll Cap: Hard ceiling of $3.5\%$ of bankroll per individual wager.
3. Frank-Wolfe or Quadratic Programming solver for simultaneous overlapping bets.
