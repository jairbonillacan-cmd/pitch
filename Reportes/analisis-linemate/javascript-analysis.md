# JavaScript Bundle & Codebase Deconstruction

## 1. Bundle Inventory & Source Map Extraction

During our REA CDP inspection of `https://linemate.io/nfl`, the production HTML revealed the following primary bundle references:
```html
<script defer="defer" src="/static/js/main.1f0201a8.js"></script>
<link href="/static/css/main.f806c574.css" rel="stylesheet">
```

Crucially, the production web server had not disabled or firewalled source map requests. Querying `https://linemate.io/static/js/main.1f0201a8.js.map` returned an unminified, complete Source Map v3 artifact:
- **Source Map File Size**: **11,790,158 bytes (11.8 MB)**.
- **Total Sources Declared**: 1,589 source files.
- **Application Files Extracted**: **377 proprietary source files** (located under `src/components`, `src/pages`, `src/hooks`, and `src/linemate-react-common`).
- **Third-Party Libraries**: 1,198 vendor packages (Nivo, D3, React-Spring, Lodash, Braze, Amplitude, Swiper, Firebase, Sentry).

The unpacked source code has been permanently archived in:
`research/linemate/evidence/javascript/extracted_src/`.

---

## 2. Shared Business Logic: `linemate-react-common`

A major architectural finding is that LineMate abstracts its core analytical models, odds calculations, and betting normalization rules into an internal shared library: `linemate-react-common`. This package is shared across LineMate's Web SPA, iOS app (React Native / Capacitor / Swift bridge), and Android app.

### 2.1 File Structure of `linemate-react-common/src/`:
- `constants.js` (15,294 lines): Master repository of all sports definitions, market IDs, betting types, team colors, default situations, and feature flags.
- `betting-utils.js` (1,986 lines): Calculation routines for hit rates, workstation game filtering, market mapping, line conversions, and betslip formatting.
- `util.js` (3,119 lines): General utilities, odds formatting (American/Decimal/Fractional), vig calculation, deep link generation, player name parsing, and access level gating (`hasPremiumAccess`, `isFreeUser`, `isPaidUser`).
- `filter-config.js`: Definitions of filter dropdowns, option keys, and signal categories.
- `gameday-utils.js`: Schedule normalization, game time formatting, and team lookup dictionaries.
- `network-utils.js`: Fetch proxies, global request headers, and retry logic.
- `core-utils.js`: Dictionary manipulation, key swapping, and deep cloning.

---

## 3. Analysis of Critical Functions

### 3.1 Hit Rate & Split Calculation (`buildTrendsData`)
Located at lines 115-173 of `betting-utils.js`:
```javascript
export function buildTrendsData(league, type, games, betType, lineValue, marketId) {
    var hits = 0;
    var push = 0;
    var total = 0;
    var homeTotal = 0;
    var awayTotal = 0;
    var homeGames = 0;
    var awayGames = 0;
    games.forEach((game) => {
        const gameValue = typeof marketId === "undefined" 
            ? getGameLineValue(league, type, game, betType) 
            : getGameLineValueById(league, type, game, marketId);
        total += gameValue;
        if (game.isHome) {
            homeGames++;
            homeTotal += gameValue;
        } else {
            awayGames++;
            awayTotal += gameValue;
        }
        if (gameValue === lineValue) {
            push++;
        } else if (typeof marketId === "undefined" && 
                    ((gameValue > lineValue && !betType.endsWith(SPREAD_MARKET_NAME)) || 
                    (betType.endsWith(SPREAD_MARKET_NAME) && gameValue < lineValue))) {
            hits++;
        } else if (typeof marketId !== "undefined" && 
                    ((gameValue > lineValue && !marketId.startsWith(SPREAD_MARKET_ID)) || 
                    (marketId.startsWith(SPREAD_MARKET_ID) && gameValue < lineValue))) {
            hits++;
        }
    });

    var result = {
        hits: hits,
        push: push
    };
    if (games.length > 0) {
        result['resultAverage'] = decimalPrecision(total / games.length, 1);
        result['hitPercentage'] = decimalPrecision(hits / games.length * 100, 1);
        result['missPercentage'] = decimalPrecision((games.length - hits - push) / games.length * 100, 1);
    } else {
        result['resultAverage'] = 0;
        result['hitPercentage'] = 0;
        result['missPercentage'] = 0;
    }
    // ... Home and Away averages computed identically
    return result;
}
```

#### Mathematical Properties Verified:
1. **Handling of Pushes**: In lines 135-136, `gameValue === lineValue` increments `push`. In line 154, `hitPercentage` is computed strictly as `hits / games.length * 100`. Therefore, pushes reduce the displayed hit rate.
2. **Handling of Spreads**: In lines 139 and 143, spread markets are inverted: for a team to cover a negative spread (e.g. -3.5), `gameValue < lineValue` is required, because `gameValue` represents the scoring margin against the opponent.
3. **Rounding**: All percentages and averages use `decimalPrecision(..., 1)`, rounding to exactly 1 decimal place.

### 3.2 Access Level Verification (`hasPremiumAccess`)
Located in `util.js`:
```javascript
export const ACCESS_LEVEL_SUPERUSER = 0;
export const ACCESS_LEVEL_FREE = 1;
export const ACCESS_LEVEL_TRIAL = 2;
export const ACCESS_LEVEL_PAID = 3;

export function hasPremiumAccess(userAttributes) {
  return isTrialUser(userAttributes) || isPaidUser(userAttributes) || isSuperUser(userAttributes);
}
```
Client controls check `hasPremiumAccess(this.context.userAttributes)` to disable dropdown options, show padlock icons, or open the Stripe checkout popup (`PricingPopup.jsx`).

---

## 4. Telemetry, Analytics & Third-Party SDKs

The source files reveal extensive user instrumentation:
1. **Amplitude Analytics (`analytics.js`)**: Tracks events such as `page_view`, `filter_changed`, `trend_clicked`, `workstation_line_adjusted`, `betslip_details_fetched`, `pricing_viewed`, and `trial_started`.
2. **Google Analytics & Tag Manager (GTAG)**: Basic web visitor traffic and conversion funnels.
3. **Braze Web SDK (`@braze/web-sdk`)**: CRM automation, in-app messaging, push notifications, and lifecycle emails.
4. **AppsFlyer**: Attribution tracking for web-to-app conversion (`DownloadW2A.jsx`).
5. **Sentry (`sentry.js`)**: Exception logging and error reporting.
6. **Vanilla CookieConsent (`vanilla-cookieconsent`)**: GDPR and CCPA compliance banner with Global Privacy Control (GPC) support.
