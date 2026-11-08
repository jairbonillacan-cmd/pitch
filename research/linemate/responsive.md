# Responsive Behavior, Breakpoints, and Mobile Architecture

## 1. Responsive Viewport Strategy

LineMate was built as a multi-device platform, supporting desktop browsers, tablets, and smartphones, alongside native mobile apps distributed via the Apple App Store and Google Play Store.

### 1.1 Core Media Query Breakpoints:
Extracted from `components/App.scss` and `styles/breakpoints.scss`:
- **Mobile (`xs`, `sm`)**: `< 768px` (Optimized for 375px - 430px smartphone widths).
- **Tablet (`md`)**: `768px – 1024px` (iPad Mini, iPad Air, Android tablets).
- **Desktop (`lg`, `xl`)**: `> 1024px` (Laptops, 1080p, and 1440p desktop displays).

---

## 2. Adaptation Patterns Across Breakpoints

### 2.1 Navigation Bar Adaptation:
- **Desktop (`> 1024px`)**:
  - Full horizontal navigation bar (48px height).
  - Displays wordmark logo, league dropdown selector, text tabs (`Home`, `Trends`, `Tools ▾`), search button, theme toggle, and auth buttons (`Log in`, `Start free trial`).
- **Mobile (`< 768px`)**:
  - Center tabs and desktop login/signup buttons are hidden.
  - Hamburger menu icon (`assets/menu.svg`) appears on the right. Clicking opens a full-screen mobile navigation drawer.
  - Sport switcher remains accessible as a compact dropdown trigger.

### 2.2 Home Page Matchup Carousel:
- **Desktop**: Renders up to 5-6 matchup cards horizontally with Swiper navigation arrows.
- **Mobile**: Cards resize to `width: 85vw` with touch swipe gestures. Displays 1 card prominently with the edge of the next card visible to afford horizontal swiping.

### 2.3 Player Workstation & Charts:
- **Desktop**:
  - Side-by-side layout: Interactive Nivo Bar chart on the left, Summary metrics card (`HitRateChartInfo`) and quick-picks panel on the right.
  - Full 10-20 game bars visible with detailed X-axis date/opponent labels.
- **Mobile (`375px` Viewport)**:
  - Stacked layout: Bar chart sits on top; metrics card and supporting stats stack underneath.
  - X-axis labels truncate from `HOU (11/02/2026)` to `HOU` to prevent text collision.
  - Touch gestures allow panning across the chart.

### 2.4 Tabular Boxscores (`GamelogDetails`):
- **Desktop**: Full 10-column table showing Date, Opponent, Score, Result, Minutes, Targets, Receptions, Yards, TDs, Long.
- **Mobile**:
  - Horizontal scroll container (`overflow-x: auto; -webkit-overflow-scrolling: touch;`).
  - First column (Opponent / Date) is pinned (`position: sticky; left: 0; background: var(--color-surface-base); z-index: 2`) so the bettor can scroll secondary stats without losing player context.

---

## 3. Forensic Visual Artifacts

During our investigation, we captured high-resolution PNG screenshots across distinct viewports using REA `capture_browser_scenario` with Chromium:
- **Desktop (1280x720)**:
  - `research/linemate/evidence/screenshots/nfl_home.png`
  - `research/linemate/evidence/screenshots/nfl_trends.png`
  - `research/linemate/evidence/screenshots/nfl_props.png`
  - `research/linemate/evidence/screenshots/nfl_player_workstation.png`
  - `research/linemate/evidence/screenshots/pricing_page.png`
- **Mobile (375x812, deviceScaleFactor: 2 - iPhone X/12/13/14 format)**:
  - `research/linemate/evidence/screenshots/nfl_mobile_375.png`

---

## 4. PitchLab Mobile-First Architecture Blueprint

Over 75% of sports bets in Mexico and Latin America are placed on mobile devices (smartphones). PitchLab must be architected **mobile-first**:
1. **Bottom Sheet Filters**: Replace bulky dropdown menus with native mobile bottom sheets (using `@radix-ui/react-dialog` or `vaul`), enabling thumb-driven filter selection.
2. **Fixed Bottom Action Bar**: Pin a persistent quick-action bar at the bottom of the screen containing the active line, consensus odds, and a high-contrast "Add to Betslip" CTA.
3. **PWA (Progressive Web App) Capabilities**: Provide standalone PWA installation with offline caching, push notifications for injury alerts, and near-zero app store distribution friction.
