# Authentication, Subscription Architecture, and Entitlements

## 1. Authentication Infrastructure

LineMate implements client authentication via **Google Firebase Authentication**:
- Module: `firebase.js` (Firebase Web SDK v9/v10 compat).
- Auth Methods Supported:
  1. Email & Password (`signInWithEmailAndPassword`, `createUserWithEmailAndPassword`).
  2. Google OAuth (`GoogleAuthProvider`, popup and redirect flow).
  3. Password Reset (`sendPasswordResetEmail`).
  4. Email Verification (`sendEmailVerification`).
- Session Management: Firebase automatically stores the JWT ID token in browser IndexedDB/LocalStorage, refreshing tokens every 60 minutes.

---

## 2. Entitlements & Access Levels

User authorization across LineMate is governed by numeric `accessLevel` integers defined in `constants.js`:

```javascript
export const ACCESS_LEVEL_SUPERUSER = 0;
export const ACCESS_LEVEL_FREE = 1;
export const ACCESS_LEVEL_TRIAL = 2;
export const ACCESS_LEVEL_PAID = 3;
```

### 2.1 Access Level Mapping:
| Level | Name | Description | Client Capabilities | Backend Rights |
| :---: | :--- | :--- | :--- | :--- |
| `0` | **SUPERUSER** | Internal staff / admins | Unlocks all features, debug menus, `/generate-trend`, internal tooltips | Full access to all endpoints, bypasses rate limits |
| `1` | **FREE** | Registered free / guest user | Basic Home dashboard, preview of top 5 trends, Last 5/10 workstation, main lines | Standard endpoints only; blocked from `with/without` queries |
| `2` | **TRIAL** | Active 7-day free trial | Unlocks all Linemate+ features without payment upfront | Full access matching PAID tier |
| `3` | **PAID** | Active Linemate+ subscriber | Unlimited trends, full Cheatsheets, With/Without teammate filter, alternate lines, betslip scanning | Full access verified via Firebase Custom Claims / Stripe webhook |

### 2.2 Entitlement Enforcement:
- **Client-Side Gating**: Evaluated via `hasPremiumAccess(userAttributes)`. If false, controls render padlock icons or trigger the `PricingPopup.jsx` modal upon interaction.
- **Backend Gating**: When a user submits requests to premium endpoints (e.g. `withoutPlayerIds=...` or `/api/nfl/v1/trends/straights?limit=50`), the backend inspects the `Authorization: Bearer <token>` header, verifies the user's Stripe subscription status, and truncates results to 5 items if the user is not `PAID` or `TRIAL`.

---

## 3. Subscription & Billing Integration

Web payments are processed via **Stripe Billing**:
- Function: `getStripeCheckoutSessionUrl(API_HOST, token, planKey)`.
- Customers click "Start Free Trial" or "Upgrade", which requests a Stripe Checkout session from the LineMate backend. The user is redirected to Stripe's hosted checkout page.
- Upon completion, Stripe webhooks update Firebase Custom Claims, setting `userAttributes.accessLevel = 3`.
- Subscription management and cancellations are handled via Stripe's self-serve portal: `openStripeBillingPortal(API_HOST, token)`.
- **Mobile Subscriptions**: In the iOS App Store and Google Play Store, subscriptions are managed via native store billing (StoreKit 2 / Google Play Billing) and reconciled to Firebase using RevenueCat or an internal receipt validator.

---

## 4. Pricing Tiers & Commercial Strategy

Extracted from `pages/Pricing.jsx`:
- **Free Tier**: \$0
- **Monthly Linemate+**: **\$14.99 USD / month**
- **Annual Linemate+**: **\$149.99 USD / year** (equivalent to \$12.50/month, ~17% annual savings).
- **Trial Period**: 7-day free trial with credit card required at checkout.

---

## 5. PitchLab Commercial & Subscription Recommendations

LineMate's pricing model is unsuited for Latin America:
- **Pricing Barrier**: \$14.99 USD represents ~\$300 MXN per month, which is prohibitively high for casual Mexican sports bettors.
- **Payment Method Limitations**: Stripe card checkout excludes millions of unbanked Mexican bettors who prefer OXXO Pay, SPEI bank transfers, or Mercado Pago.

### PitchLab Tiered Pricing Strategy for Mexico & LATAM:
| Tier | Price (MXN) | Price (USD) | Key Features |
| :--- | :--- | :--- | :--- |
| **Free / Explorer** | \$0 | \$0 | Daily matchup schedules, top 3 trends, basic Last 5/10 game logs, Caliente odds. |
| **Pro / Analista** | **\$149 MXN / mo** | ~\$7.50 USD | Unlimited trends, full workstation, with/without teammate filters, full cheatsheets, Caliente vs Codere odds comparison. |
| **Quant / Elite** | **\$299 MXN / mo** | ~\$15.00 USD | Full PitchLab predictive model projections, simulated probability distributions, SGP correlation engine, steam/CLV line movement alerts, OCR betslip scanner. |

### Localized Payment Gateways:
Integrate **Stripe Mexico** with native support for **OXXO Pay** and **SPEI**, alongside credit/debit cards and Mercado Pago.
