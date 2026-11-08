# Mathematical Specification of the Hit Rate Engine

## 1. Engine Purpose & Definition

The Hit Rate Engine is the mathematical core of LineMate. It computes the historical frequency with which a participant (player or team) achieved or exceeded a specified numeric betting threshold over a selected sample of games.

---

## 2. Mathematical Formulation

LineMate's observable calculation is implemented in `linemate-react-common/src/betting-utils.js` within `buildTrendsData`.

### 2.1 The Observable Formula:
For a given player, statistical category \(S\), threshold line \(L\), direction \(D \in \{\text{over}, \text{under}\}\), and sample of games \(G = \{g_1, g_2, \dots, g_n\}\):

1. **Numerator (\(\text{Hits}\))**:
   $$\text{Hits} = \sum_{i=1}^{n} \mathbb{I}(g_i, L, D)$$
   where:
   $$\mathbb{I}(g_i, L, \text{over}) = \begin{cases} 1 & \text{if } S(g_i) > L \\ 0 & \text{otherwise} \end{cases}$$
   $$\mathbb{I}(g_i, L, \text{under}) = \begin{cases} 1 & \text{if } S(g_i) < L \\ 0 & \text{otherwise} \end{cases}$$

2. **Pushes (\(\text{Push}\))**:
   $$\text{Push} = \sum_{i=1}^{n} \mathbb{I}_{\text{push}}(g_i, L) = \sum_{i=1}^{n} \begin{cases} 1 & \text{if } S(g_i) = L \\ 0 & \text{otherwise} \end{cases}$$

3. **Misses (\(\text{Misses}\))**:
   $$\text{Misses} = n - \text{Hits} - \text{Push}$$

4. **Hit Rate Percentage**:
   $$\text{Hit Rate (\%)} = \text{round}\left( \frac{\text{Hits}}{n} \times 100, 1 \right)$$

5. **Miss Rate Percentage**:
   $$\text{Miss Rate (\%)} = \text{round}\left( \frac{\text{Misses}}{n} \times 100, 1 \right)$$

6. **Sample Mean (\(\text{Average}\))**:
   $$\text{Average} = \text{round}\left( \frac{1}{n} \sum_{i=1}^{n} S(g_i), 1 \right)$$

---

## 3. Critical Analytical Findings & Push Distortion

In standard sports betting mechanics, when an outcome pushes (e.g. rushing yards = exactly 60 on a 60.0 line), the bettor's stake is refunded in full. The wager is voided.

### The LineMate Distortion:
LineMate calculates:
$$\text{Hit Rate} = \frac{\text{Hits}}{n}$$
Because pushes are included in the denominator \(n\), a push is mathematically treated as a loss in the hit rate percentage!

#### Concrete Empirical Proof:
Suppose a player has the following 10 games for Passing Touchdowns on a 2.0 integer line:
- Values: `[3, 2, 2, 4, 1, 3, 2, 0, 3, 2]`
- Over 2.0 Hits: `4` (games with 3, 4, 3, 3)
- Pushes (value = 2.0): `4` (stake refunded)
- Misses (value < 2.0): `2` (games with 1, 0)
- Total games \(n\): `10`

LineMate reports:
- $\text{Hits}: 4/10$
- $\text{Hit Rate}: 40.0\%$
- $\text{Miss Rate}: 20.0\%$
- $\text{Average}: 2.3$

However, for a sports bettor, 4 of the 10 bets were refunded. Only 6 bets were decisive. Among decisive bets:
$$\text{Decisive Hit Rate} = \frac{\text{Hits}}{\text{Hits} + \text{Misses}} = \frac{4}{4 + 2} = \frac{4}{6} = 66.7\%!$$
LineMate's reported 40.0% creates an inaccurate perception of negative performance when the decisive win rate was actually 66.7%!

---

## 4. Half-Point Lines vs Integer Lines

- **Half-Point Lines (e.g. 9.5, 64.5, 0.5)**:
  - $\text{Push} = 0$ always (since NFL yards and touchdowns are integers).
  - In half-point lines, $\text{Hit Rate} + \text{Miss Rate} = 100.0\%$.
- **Integer Lines (e.g. 1.0, 2.0, 14.0)**:
  - Frequent pushes occur (especially in TD props or reception props).
  - LineMate's display leaves an unexplained gap between Hit Rate and 100%.

---

## 5. Automated Verification in PitchLab

Our test suite (`tests/linemate_mathematical_validation.test.ts`) verified these edge cases with 100% precision:
```typescript
it('validates LineMate push handling where pushes remain in denominator', () => {
  const games = [
    { value: 12 }, { value: 14 }, { value: 10 }, { value: 8 }, { value: 15 },
    { value: 11 }, { value: 16 }, { value: 7 }, { value: 13 }, { value: 19 }
  ];
  const res = computeLineMateHitRate(games, 10, 'over');
  expect(res.hits).toBe(7);
  expect(res.pushes).toBe(1);
  expect(res.misses).toBe(2);
  expect(res.sampleSize).toBe(10);
  expect(res.hitRate).toBe(70.0);
  expect(res.missRate).toBe(20.0);
  expect(res.pushRate).toBe(10.0);
});
```

---

## 6. PitchLab Superior Hit Rate Engine Design

PitchLab will implement an enhanced, transparent dual-metric engine:
1. **Raw Hit Rate**: $\frac{\text{Hits}}{\text{Total Games}} \times 100$
2. **Decisive Hit Rate (Refund-Adjusted)**: $\frac{\text{Hits}}{\text{Hits} + \text{Misses}} \times 100$
3. **Push Rate**: $\frac{\text{Pushes}}{\text{Total Games}} \times 100$
4. **ROI Backtest**: Calculate actual unit profit/loss if $100 had been wagered on each game at historical closing odds.
