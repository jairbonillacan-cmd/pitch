# Mathematical Verification, Test Matrices, and Formula Proofs

## 1. Overview & Verification Strategy

To guarantee scientific rigor and mathematical precision, our team constructed a reproducible automated test suite (`tests/linemate_mathematical_validation.test.ts` and `research/linemate/evidence/functional-tests/linemate_mathematical_validation.test.ts`) using **Vitest**.

The suite empirically validates:
1. Hit rate calculation under 100%, 50%, and 0% conditions.
2. Push handling and denominator distortion.
3. Over vs Under market direction inversion.
4. American, Decimal, and Implied Probability conversions.
5. Vig removal and true fair probability extraction.
6. Opponent defensive ranking ordering.

All 8 tests pass with 100% success rate in 2ms.

---

## 2. Test Execution Matrix

| Test ID | Test Description | Input Data Sample | Expected Output | Observed Output | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| `MATH-01` | 100% Hit Rate (No Pushes) | 5 games: `[12, 15, 10, 18, 22]`, Line: `9.5`, Over | `hits: 5`, `pushes: 0`, `hitRate: 100.0%`, `avg: 15.4` | Exactly matches | **PASSED** |
| `MATH-02` | 0% Hit Rate | 5 games: `[2, 4, 3, 5, 1]`, Line: `5.5`, Over | `hits: 0`, `misses: 5`, `hitRate: 0.0%`, `missRate: 100.0%` | Exactly matches | **PASSED** |
| `MATH-03` | LineMate Push Retained in Denominator | 10 games: `[12, 14, 10, 8, 15, 11, 16, 7, 13, 19]`, Line: `10.0`, Over | `hits: 7`, `pushes: 1`, `misses: 2`, `hitRate: 70.0%`, `pushRate: 10.0%` | Exactly matches | **PASSED** |
| `MATH-04` | PitchLab Refund-Adjusted Hit Rate | Same 10 games with 1 push | `hitRateRaw: 70.0%`, `hitRateAdjusted: 77.8%` (7 hits / 9 decisive) | Exactly matches | **PASSED** |
| `MATH-05` | Under Markets Direction | 5 games: `[0, 0, 1, 0, 2]`, Line: `0.5`, Under | `hits: 3` (zeros), `misses: 2`, `hitRate: 60.0%` | Exactly matches | **PASSED** |
| `MATH-06` | Odds Conversions (American to Decimal/Prob) | `-110`, `+150`, `-200` | `-110 -> 1.9091 (52.38%)`<br>`+150 -> 2.5000 (40.00%)`<br>`-200 -> 1.5000 (66.67%)` | Exactly matches | **PASSED** |
| `MATH-07` | Vig Removal & Fair Probability | `-110` / `-110` standard two-way market | `rawOver: 0.5238`, `rawUnder: 0.5238`, `vig: 4.76%`, `fairOver: 0.5000`, `fairUnder: 0.5000` | Exactly matches | **PASSED** |
| `MATH-08` | Opponent Defensive Ranking | 4 teams allowed yards: `DEN: 180.2`, `KC: 210.5`, `DAL: 245.0`, `CIN: 265.8` | `DEN: Rank 1`, `KC: Rank 2`, `DAL: Rank 3`, `CIN: Rank 4` | Exactly matches | **PASSED** |

---

## 3. Mathematical Proof of Formulas

### 3.1 LineMate Observable Formula:
$$\text{HitRate}_{\text{LineMate}} = \frac{\sum_{i=1}^{n} \mathbb{I}(s_i > L)}{n} \times 100$$
Where:
- $n = \text{total games played in sample}$.
- Pushes ($s_i = L$) yield $\mathbb{I} = 0$, but remain part of $n$.

### 3.2 PitchLab Decisive Hit Rate Formula:
$$\text{HitRate}_{\text{Decisive}} = \frac{\sum_{i=1}^{n} \mathbb{I}(s_i > L)}{n - \sum_{i=1}^{n} \mathbb{I}(s_i = L)} \times 100$$
This eliminates refunded push wagers from the denominator, aligning the calculation with actual betting ROI.

### 3.3 Two-Way Vig Removal (Proportional Method):
Given American odds $O_1, O_2$:
$$P_1 = \text{implied\_prob}(O_1), \quad P_2 = \text{implied\_prob}(O_2)$$
$$\text{Overround } S = P_1 + P_2$$
$$P_{1, \text{fair}} = \frac{P_1}{S}, \quad P_{2, \text{fair}} = \frac{P_2}{S}$$
$$\text{Vig Percentage } = (S - 1) \times 100$$

---

## 4. Test Execution Output Log

```text
 RUN  v2.1.9 <REPO_ROOT>

 ✓ tests/linemate_mathematical_validation.test.ts (8 tests) 2ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  13:57:07
   Duration  358ms (transform 43ms, setup 0ms, collect 43ms, tests 2ms, environment 0ms, prepare 100ms)
```
The test suite is committed and archived in `research/linemate/evidence/functional-tests/`.
