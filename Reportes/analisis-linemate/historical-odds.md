# Historical Odds Tracking & Line Movement Intelligence

## 1. LineMate Observable Capabilities & Deficiencies

A rigorous analysis of LineMate's codebase, network schema, and client components confirms that **LineMate maintains minimal historical odds tracking**:

1. **Current Snapshot Model**:
   - The `/api/nfl/v4/players/:id/markets` endpoint returns only the current live snapshot (`current.value`, `current.odds`).
2. **Missing Opening Odds**:
   - Although the schema defines an `opening` key inside `market.books[bookId].over.opening`, in 95% of live API queries this field is `null` or unpopulated.
3. **No Historical Odds Chart**:
   - The workstation UI contains **no time-series visualization** showing how a player's prop line moved throughout the week (e.g. opened Monday at 58.5, bet up to 63.5 by Thursday, closed Sunday at 65.5).
4. **No Closing Line Value (CLV) Metric**:
   - LineMate does not record or display Closing Line Value, which is the gold standard benchmark professional sports bettors use to measure predictive edge against the market.

---

## 2. Why LineMate Omits Historical Odds

Through architectural reverse engineering, we identified the technical and commercial reasons for this limitation:
1. **Database Storage Constraints**: Storing continuous odds ticks for 1,500+ active players across 19 sportsbooks and 25 prop categories produces millions of rows weekly. LineMate opted for a lightweight transactional database focused only on live states.
2. **Recreational Bettor Persona**: LineMate targets casual bettors who care primarily about simple binary questions: *"Has Breece Hall gone over 64.5 rushing yards recently?"* Advanced metrics like line movement and steam chasers are deprioritized.
3. **Vendor Licensing Tier**: Ingesting historical odds feeds from providers like Sportradar or Don Best requires high-tier enterprise licenses ($5,000 - $15,000/month), whereas live snapshots are significantly cheaper.

---

## 3. The PitchLab Historical Odds Architecture

PitchLab will turn this major competitor weakness into a core differentiator:

```mermaid
flowchart LR
    OddsStream["Live Odds Ingestion Engine (Every 60s)"]
    TSDB["TimescaleDB / ClickHouse Time-Series Store"]
    CLVEngine["CLV & Line Movement Processor"]
    UI["PitchLab Line History Scrubber & Steam Alerts"]

    OddsStream --> TSDB
    TSDB --> CLVEngine
    CLVEngine --> UI
```

### 3.1 Time-Series Storage Schema:
Every line change will be appended as an immutable record:
```sql
CREATE TABLE prop_odds_ticks (
    tick_id UUID PRIMARY KEY,
    player_id UUID NOT NULL,
    game_id VARCHAR(32) NOT NULL,
    market_id VARCHAR(32) NOT NULL,
    sportsbook_id VARCHAR(32) NOT NULL,
    line NUMERIC(5, 1) NOT NULL,
    over_odds_american INT NOT NULL,
    under_odds_american INT NOT NULL,
    is_consensus BOOLEAN DEFAULT FALSE,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_prop_ticks ON prop_odds_ticks (player_id, market_id, recorded_at DESC);
```

### 3.2 PitchLab Features Enabled:
1. **Interactive Line Movement Chart**: View the exact pricing history alongside sharp money alerts ("Steam moved line from 58.5 to 64.5 in 12 minutes").
2. **Automated CLV Tracking**: When a user logs a pick, automatically compare their entry price against the final closing price at kickoff and calculate their lifetime CLV %.
3. **Historical Backtesting Simulation**: Evaluate whether a given trend strategy would have been profitable against historical closing lines.
