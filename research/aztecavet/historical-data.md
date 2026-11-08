# Historical Data Architecture & Backtesting Systems — AztecaVet

> **Target:** `https://aztecavet.com/`  
> **Investigation Focus:** Retrospective Audits, Data Longevity, Lookahead Bias, Historical Warehouse Design  
> **Classification:** [OBSERVADO] / [INFERIDO] / [RECONSTRUIDO]  
> **Related Files:** [`football_engine.js`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/javascript/football_engine.js), [`nhl_engine.js`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/javascript/nhl_engine.js), [`mlb_engine.js`](file:///c:/Users/jairb/Desktop/Proyectos/Pitch%20Lab/research/aztecavet/evidence/javascript/mlb_engine.js)  

---

## 1. AztecaVet's Approach: The "Auditoría" (Audit) Pattern

AztecaVet possesses **no database, no historical time-series engine, and no archival query system**. To demonstrate credibility to users, the application implements a lightweight client-side **retrospective audit pattern**:

```mermaid
sequenceDiagram
    participant Code as Embedded JS Array (DD / AUD / D)
    participant Model as model(home, away, league, isAudit = true)
    participant DOM as Rendered Match Card

    Code->>Model: Passes match teams + final score [sc0, sc1]
    Note over Model: In audit mode, injuries (NW) are bypassed (au = true)<br/>to prevent using post-match injury knowledge.
    Model->>Model: Computes Pythagoras, Log5, Poisson shares, Best Pick
    Model->>DOM: Compares model.pick.f(sc0, sc1)
    alt Model Pick condition is satisfied
        DOM-->>DOM: Renders Pick + Green Checkmark (✓)
    else Model Pick condition fails
        DOM-->>DOM: Renders Pick + Red Cross (✗)
    end
```

### Empirical Implementation across Sports:

1. **Football (`fb.html`):**
   - Past jornadas (e.g. Jornadas 13, 14, 15 of Liga MX; Jornadas 9, 10, 11 of La Liga) are encoded as score tuples: `["SAN", "NEC", 1, 0]`.
   - The function `aud(arr)` marks `g.aud = true` and `g.sc = [g[2], g[3]]`.
   - When evaluating an audited fixture, `inj(t, r, au)` returns the raw team rate without daily injury adjustments, recognizing that injury notes reflect only the active game day.
   - Summarizes overall accuracy: e.g. "Pick del modelo: 9/17 ✓".

2. **NHL (`nhl.html`):**
   - November 5 audit (11 games) computes two separate retrospective hit rates:
     - **Confidence Pick:** Evaluates whether the top pick hit (`hit / total`).
     - **Moneyline Favorite:** Evaluates whether the pure ML favorite won outright (`mlh / total`).
   - Specifically records overtime (`OT`) and shootout (`SO`) outcomes: `["NJ", "STL", "6:00 PM · OT", null, [5, 4]]`.

3. **MLB (`mlb.html`):**
   - Retrospective chronicle of 17 postseason games from October 8 to October 28, 2026.
   - Evaluates whether the moneyline or run line favorite covered the outcome.

---

## 2. Scientific & Statistical Limitations of the Audit Pattern

While visually compelling, AztecaVet's audit mechanism exhibits significant scientific flaws:

1. **Survivorship & Selection Bias:**
   - Only selected recent jornadas are audited. Users cannot inspect older rounds or full previous seasons.
2. **Fixed Parameter Overfitting:**
   - The model constants ($E = 1.7$ in soccer, $E = 2.15$ in NHL, $SD = 4.2426$ in MLB) may have been calibrated directly against the audited games, introducing in-sample overfitting.
3. **Absence of Closing Line Value (CLV):**
   - The audit measures only binary win/loss ($✓ / ✗$). It does not record the historical closing odds, making it impossible to calculate real monetary ROI or quantify whether the model beat the market spread.
4. **No Feature Time-Travel:**
   - The team ratings (`gf`, `gc`, `gp`) used in football audits reflect the full accumulated table as of November 6, rather than the true state of the table on October 20 when the match was played. This constitutes **lookahead data leakage**.

---

## 3. PitchLab Historical Data Warehouse Architecture

To enable quantitative researchers and institutional bettors to validate models rigorously, PitchLab will build a **true point-in-time historical data warehouse**:

```mermaid
flowchart TD
    subgraph Data Sources
        Feed1["Sportradar Historical Feed"]
        Feed2["The-Odds-API Historical Archive"]
        Feed3["Pinnacle Historical Lines"]
    end

    subgraph ETL & Lakehouse
        Feed1 & Feed2 & Feed3 --> ETL["Data Pipeline Worker<br/>(Apache Arrow / Polars)"]
        ETL --> S3Lake["Object Storage (MinIO / S3)<br/>Parquet Lakehouse partitioned by:<br/>sport / league / season / date"]
    end

    subgraph Relational & Time-Series Engine
        S3Lake --> TimeScale["TimescaleDB / PostgreSQL<br/>- Hypertable: market_ticks<br/>- Hypertable: player_boxscores<br/>- Point-in-time snapshots (As-Of Joins)"]
    end

    subgraph Quant Research & Backtesting
        TimeScale --> Backtest["PitchLab Vectorized Backtesting Engine<br/>(Rust / Python Polars)"]
        Backtest --> Metrics["Performance Metrics:<br/>- Closing Line Value (CLV)<br/>- Sharpe & Sortino Ratio<br/>- Max Drawdown Duration<br/>- Fractional Kelly Growth Curves"]
    end
```

### Essential Capabilities for PitchLab:
1. **As-Of Joins (Zero Data Leakage):**
   - Every historical fixture joins only with team ratings and player availability timestamps recorded prior to the scheduled kickoff time:
     ```sql
     SELECT m.*, r.rating 
     FROM matches m
     ASOF JOIN team_ratings r 
       ON m.team_id = r.team_id 
      AND r.timestamp <= m.kickoff_time;
     ```
2. **Closing Line Value (CLV) Benchmarking:**
   - Automatically tracks whether PitchLab's model price beat the final closing price at Pinnacle/Circa. Consistently beating CLV is the mathematical prerequisite for long-term sports betting profitability.
3. **Monte Carlo Walk-Forward Backtesting:**
   - Simulates 10,000 portfolio paths across 5,000 historical games under various fractional Kelly multipliers ($0.25\times, 0.50\times$) to establish confidence intervals on maximum drawdown.
