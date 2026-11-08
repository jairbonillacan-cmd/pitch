# Odds Intelligence, Price Comparison, and Market Formatting

## 1. Supported Odds Formats & Transformations

LineMate natively formats all prices according to the user's localized preference:
- `american`: Standard US format (e.g. `-115`, `+140`).
- `decimal`: European/LATAM format (e.g. `1.87`, `2.40`).
- `fractional`: UK format (e.g. `20/23`, `7/5`).

The conversion routines are implemented in `linemate-react-common/src/util.js`:

```javascript
export function getFormattedLineValue(format, odds) {
    if (format === "decimal") {
        return odds.decimal.toFixed(2);
    } else if (format === "fractional") {
        return odds.fractional;
    } else {
        return odds.american > 0 ? `+${odds.american}` : `${odds.american}`;
    }
}
```

---

## 2. Bookmaker Price Comparison Logic

LineMate displays the "Best Available Odds" across integrated sportsbooks:
- For **OVER** bets: Scans all active bookmakers and selects the book offering the highest payout (e.g. +105 beats -110; -105 beats -120).
- For **UNDER** bets: Similarly selects the most favorable odds.
- If multiple sportsbooks offer the same best price, precedence is given according to the user's selected `preferredProviders` list, followed by the localized state tiering.

---

## 3. Vig / Overround Calculation & Fair Probability

In sports betting, sportsbooks include a built-in commission ("vig" or "overround").
For a two-way market (Over / Under):

$$\text{Implied Probability}_{\text{raw}} = \begin{cases} \frac{100}{\text{American} + 100} & \text{if American} > 0 \\ \frac{|\text{American}|}{|\text{American}| + 100} & \text{if American} < 0 \end{cases}$$

$$\text{Market Overround} = P_{\text{over, raw}} + P_{\text{under, raw}}$$

$$\text{Vig (\%)} = (\text{Market Overround} - 1) \times 100$$

### 3.1 Proportional Vig Removal:
To extract the true market consensus probability without vig:
$$P_{\text{over, fair}} = \frac{P_{\text{over, raw}}}{P_{\text{over, raw}} + P_{\text{under, raw}}}$$
$$P_{\text{under, fair}} = \frac{P_{\text{under, raw}}}{P_{\text{over, raw}} + P_{\text{under, raw}}}$$

### 3.2 Observable LineMate Behavior:
LineMate **does not remove vig** in its UI. It presents the raw American odds and calculates the raw hit rate, leaving recreational bettors blind to whether a -135 line is profitable in the long run.

---

## 4. PitchLab Market Intelligence Upgrade

PitchLab will incorporate an institutional-grade pricing intelligence layer:
1. **Automated Vig Strip**: Show fair "No-Vig" probabilities for every line.
2. **Arbitrage & Middle Finder**: Automatically scan Mexican (Caliente, Codere) and international books to detect arbitrage opportunities (e.g. Caliente Over 60.5 at +110, Bet365 Under 64.5 at -105 = Guaranteed Middle window).
3. **Pinnacle / Exchange Benchmark**: Use sharp books (Pinnacle) and liquid exchanges (Kalshi/Novig) as the truth source to evaluate recreational book pricing efficiency.
