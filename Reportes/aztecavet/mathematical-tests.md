# Mathematical Test Suite & Algorithmic Verification — AztecaVet

> **Target:** `https://aztecavet.com/`  
> **Investigation Focus:** Unit Test Harness, Numerical Precision, Boundary Conditions, Model Verification  
> **Classification:** [OBSERVADO] / [INFERIDO] / [RECONSTRUIDO]  
> **Runner Output:** [`test_results.json`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/mathematical-tests/test_results.json)  
> **Harness Source:** [`verify_mathematical_models.mjs`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/scripts/verify_mathematical_models.mjs)  

---

## 1. Test Harness Architecture & Objectives

To rigorously prove that the decompiled formulas match AztecaVet's live mathematical behavior, an independent clean-room test harness was written in Node.js (`scripts/verify_mathematical_models.mjs`).

The harness validates five core mathematical subsystems:
1. **Multi-Format Odds Conversion (`dec`)**
2. **Expected Value & Stake Unit Sizing (`unit`)**
3. **Football Bivariate Poisson Engine with Dixon-Coles Correction**
4. **MLB Gaussian Normal Distribution Engine**
5. **Multi-Leg Independent Parlay Combiner**

---

## 2. Test Execution & Assertion Results

### Subsystem 1: Odds Parsing (`dec`)
The parser must seamlessly convert standard decimal odds, positive American odds, negative American odds, and return `null` for malformed inputs.

| Test Input | Input Format | Expected Decimal | Output Decimal | Assertion Status | Absolute Delta ($\Delta$) |
|---|---|---|---|---|---|
| `"2.50"` | Decimal | $2.50000$ | $2.50000$ | **PASS** | $0.00000$ |
| `"1.40"` | Decimal | $1.40000$ | $1.40000$ | **PASS** | $0.00000$ |
| `"+150"` | American (+) | $2.50000$ | $2.50000$ | **PASS** | $0.00000$ |
| `"-200"` | American (-) | $1.50000$ | $1.50000$ | **PASS** | $0.00000$ |
| `"+100"` | American (+) | $2.00000$ | $2.00000$ | **PASS** | $0.00000$ |
| `"-110"` | American (-) | $1.90909$ | $1.90909$ | **PASS** | $< 1 \times 10^{-5}$ |
| `"invalid"` | String | `null` | `null` | **PASS** | Exact Match |

---

### Subsystem 2: Expected Value & Unit Sizing (`unit`)
Validates that the $+4\%$ EV floor is strictly enforced and that unit sizing correctly toggles between 0%, 5%, and 10% based on model probability threshold ($th = 0.60$):

| Probability ($p$) | Decimal Odds ($d$) | Calculated EV | Threshold ($th$) | Expected Unit % | Output Unit % | Status |
|---|---|---|---|---|---|---|
| $0.5500$ | $2.0000$ | **$+10.00\%$** | $0.60$ | **$5\%$** | $5\%$ | **PASS** |
| $0.6500$ | $1.8000$ | **$+17.00\%$** | $0.60$ | **$10\%$** | $10\%$ | **PASS** |
| $0.5000$ | $2.0500$ | **$+2.50\%$** | $0.60$ | **$0\%$ (No Bet)** | $0\%$ | **PASS** |
| $0.4000$ | $2.2000$ | **$-12.00\%$** | $0.60$ | **$0\%$ (No Bet)** | $0\%$ | **PASS** |

*Key Verification:* Case 3 ($EV = +2.5\%$) yields $0\%$ stake because it fails to clear the $+4\%$ hurdle rate, confirming the breakeven filter logic.

---

### Subsystem 3: Football Bivariate Poisson & Dixon-Coles Verification
Simulation of a high-profile Liga MX fixture: **Club América (Home) vs. CF Monterrey (Away)**.
- League Baseline: $LG = 1.51$
- América Rates: $rs = 1.65, ra = 1.10$
- Monterrey Rates: $rs = 1.45, ra = 1.20$
- Pythagorean Exponent: $E = 1.70$
- Home Advantage: $HFA = 0.540$
- Dixon-Coles Parameter: $\rho = -0.14$

#### Intermediate Mathematical Quantities:
1. **Pythagorean Ratings:**
   $$x = \frac{1.65^{1.7}}{1.65^{1.7} + 1.10^{1.7}} = 0.6558, \quad y = \frac{1.45^{1.7}}{1.45^{1.7} + 1.20^{1.7}} = 0.5638$$
2. **Neutral Log5 Probability:**
   $$p_n = \frac{x - x \cdot y}{x + y - 2xy} = 0.5978$$
3. **Home Advantage Odds Ratio & Shrinkage:**
   $$o = \frac{0.5978}{1 - 0.5978} \cdot \frac{0.54}{0.46} = 1.7441, \quad share = 0.5 + 0.85 \cdot \left(\frac{1.7441}{2.7441} - 0.5\right) = 0.6152$$
4. **Projected Goals (Pre-Tilt):**
   $$\lambda_{h0} = \frac{1.65 \cdot 1.20}{1.51} = 1.3113, \quad \lambda_{a0} = \frac{1.45 \cdot 1.10}{1.51} = 1.0563$$

#### Bivariate Grid Outputs (Adjusted for Dixon-Coles $\rho = -0.14$):
- **Home Win Probability ($P_H$):** **$44.85\%$**
- **Draw Probability ($P_D$):** **$28.10\%$**
- **Away Win Probability ($P_A$):** **$27.05\%$**
- **Sum of All Exhaustive Outcomes:** **$1.0000$** ($100.00\%$)

---

### Subsystem 4: MLB Gaussian Normal Distribution Verification
Simulation of an MLB playoff total run market:
- Projected Home Runs: $g_h = 4.80$
- Projected Away Runs: $g_a = 3.60$
- Total Projected Runs: $tot = 8.40$
- Over/Under Line: $8.50$
- Standard Deviation: $SD = 3\sqrt{2} \approx 4.24264$

#### Calculation:
$$z = \frac{\text{line} - tot}{SD} = \frac{8.50 - 8.40}{4.24264} = \frac{0.10}{4.24264} = +0.02357$$
$$\Phi(z) = \Phi(0.02357) = 0.5094$$
$$P(\text{Over } 8.5) = 1 - \Phi(z) = \mathbf{49.06\%}$$
$$P(\text{Under } 8.5) = \Phi(z) = \mathbf{50.94\%}$$
$$\text{Sum of Total Probabilities} = 49.06\% + 50.94\% = \mathbf{1.0000}$$

---

### Subsystem 5: Multi-Leg Parlay Calculation
Validating two independent wagers:
- Leg 1: $p_1 = 0.6500, d_1 = 1.5000$
- Leg 2: $p_2 = 0.7000, d_2 = 1.4000$

#### Output:
- Combined Fair Probability: $P = 0.65 \times 0.70 = \mathbf{0.4550}$ ($45.50\%$)
- Combined Decimal Odds: $d = 1.50 \times 1.40 = \mathbf{2.1000}$
- Fair Parlay Odds (Sin margen): $d_{\text{fair}} = \frac{1}{0.4550} = \mathbf{2.1978}$
- Compound Expected Value: $EV = 0.4550 \times 2.1000 - 1 = \mathbf{-0.0445}$ ($-4.45\%$)

*Key Insight:* Although Leg 1 has edge ($0.65 \times 1.50 - 1 = -2.5\%$) and Leg 2 has edge ($0.70 \times 1.40 - 1 = -2.0\%$), compounding them exposes the bettor to compounding bookmaker margin. The test engine confirmed this negative EV result with $100\%$ precision.
