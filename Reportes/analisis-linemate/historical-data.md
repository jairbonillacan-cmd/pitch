# Historical Data Depth, Coverage, and Temporal Analysis

## 1. Observable Historical Depth

Our empirical testing of LineMate's API (`scripts/test-workstation-params.mjs`) revealed clear boundaries regarding how much historical data the platform stores, serves, and utilizes for trends.

### 1.1 Temporal Bounds:
- **Active Operational Window**: **3 NFL Seasons** (Current Season plus 2 prior seasons).
  - Explicitly configured in `getBaseWorkstationQueryParams`:
    ```javascript
    } else if (normalizedTimeframe === "matchup" || normalizedTimeframe === "head to head") {
        queryParams['opponent'] = opponent;
        queryParams['timeframe'] = `RANGE_${currentSeason - 2}_${currentSeason}`;
    }
    ```
  - For the 2026 NFL season, the query parameter is `timeframe=RANGE_2024_2026`.
- **Game Sample Counts**:
  - `timeframe=LAST_5` -> Exactly 5 most recent regular season/playoff games.
  - `timeframe=LAST_10` -> Exactly 10 most recent games.
  - `timeframe=LAST_20` -> Exactly 20 most recent games.
  - `timeframe=RANGE_2024_2026&limit=500` -> Up to 35-50 career games for active players (e.g. 35 games returned for Breece Hall who was drafted in 2022 and missed part of his rookie year with an ACL tear).
- **Retired Players**: Retired players (e.g. Tom Brady, Drew Brees) do not appear in active search or trends feeds. Their historical logs are archived and inaccessible via public client routes.

---

## 2. Ingestion Timestamps & Latency

LineMate records several timestamp layers across its entities:
1. **`timestamp` on Games**: Scheduled start time in UTC (ISO-8601, e.g. `2026-11-08T18:00:00.000Z`).
2. **`timestamp` on Trends**: The exact time the trend calculation was evaluated and written to the cache (e.g. `2026-11-08T19:48:26.922Z`).
3. **Live Odds Observation Window**:
   - Odds updates are ingested continuously during pre-game hours.
   - Stale threshold: Odds timestamps older than 15 minutes trigger a client-side re-fetch or warning badge.

---

## 3. Data Integrity & Edge Case Handling

Through testing and source code analysis, we verified how LineMate handles complex historical scenarios:

### 3.1 Did Not Play (DNP) & Inactive Games:
- **Observation**: If a player is inactive (e.g. injury or healthy scratch), the game is **completely excluded** from the player's `games` array returned by `/api/nfl/v4/players/:id/games`.
- **Effect on Hit Rate**: The denominator in `hitPercentage = hits / games.length * 100` only counts games where the player actually logged at least one official snap/stat.
- **Limitation**: Games where a player played only 1 or 2 snaps before getting injured are **not** excluded. Their 0-yard stat counts as a full game, artificially depressing the hit rate.

### 3.2 Mid-Season Team Trades:
- When a player changes teams mid-season (e.g. Christian McCaffrey traded from CAR to SF), LineMate preserves the historical game logs under the original team code (`currentTeam: "CAR"`), while linking the player profile to the new active team (`teamCode: "SF"`).
- Hit rate calculations over `LAST_10` seamlessly aggregate games across both teams.

### 3.3 Postponed & Canceled Games:
- Games marked `status: "POSTPONED"` or `"CANCELED"` carry zero cumulative stats and are excluded from the game log calculation pool.

---

## 4. Historical Odds Intelligence: The Major Void

One of the most consequential findings of this investigation is that **LineMate does not expose historical odds movements to users**.
- **What LineMate Stores**: Current live odds, and a static `opening` odds field (which is frequently `null` in API responses).
- **What is Missing**:
  1. Line movement time series (how a prop moved from 62.5 to 66.5 throughout the week).
  2. Closing Line Value (CLV) benchmarks (comparing the bet line against the final closing price before kickoff).
  3. Historical odds backtesting (evaluating whether betting 100% hit rate trends at stated odds yielded positive expected value or was -EV due to heavy juice like -145).

---

## 5. PitchLab Historical Engine Architecture

PitchLab should build a truly historical, reproducible sports database:
1. **10+ Year Historical Archive**: Ingest complete NFL game logs back to 2015, enabling deep trend analysis (e.g. "How do dome teams perform in freezing outdoor conditions in December?").
2. **Temporal Odds Snapshots (Time-Series DB)**: Use TimescaleDB or ClickHouse to store every line change with second-level timestamps.
3. **Historical "Time-Machine" Replay**: Allow users to travel back to any historical game date and see exactly what the stats, rankings, and odds looked like *at that exact moment in time*, enabling true zero-lookahead backtesting.
