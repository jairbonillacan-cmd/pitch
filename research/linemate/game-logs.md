# Historical Game Logs & Boxscore Architecture

## 1. Game Log Entity Structure

The game log table in LineMate (`components/GamelogDetails.jsx`) displays the granular per-game statistical breakdown for each athlete.

### 1.1 Canonical Game Log Schema
Extracted from `research/linemate/evidence/network-schemas/player_games_breece_hall.json`:
```json
{
  "gameID": "20261102-HOU-NYJ",
  "timestamp": "2026-11-02T00:15:00.000Z",
  "season": 2026,
  "week": 9,
  "type": "REGULAR",
  "isHome": true,
  "home": true,
  "currentTeam": "NYJ",
  "currentTeamId": "2b4a534d-5950-4fff-8c15-5a81f247e652",
  "opposingTeam": "HOU",
  "opposingTeamId": "ff9b734c-3104-4ba2-8433-3f050d841095",
  "score": 21,
  "opposingScore": 13,
  "win": true,
  "loss": false,
  "tie": false,
  "cumulativeStats": {
    "rushingAttempts": 15,
    "rushingYards": 74,
    "rushingTouchdowns": 0,
    "longestRun": 12,
    "targets": 4,
    "receptions": 2,
    "receivingYards": 11,
    "rushingYards1q": 18,
    "rushingYards2q": 22,
    "rushingYards3q": 14,
    "rushingYards4q": 20
  }
}
```

---

## 2. Table Behaviors & UX Interactions

In `GamelogDetails.jsx`, each game log row exhibits several dynamic behaviors:
1. **Hit / Miss Visual Indicator**:
   - The cell displaying the active prop category is shaded:
     - **Green Badge**: If `stat > line` for OVER or `stat < line` for UNDER.
     - **Red Badge**: If `stat < line` for OVER or `stat > line` for UNDER.
     - **Yellow Badge**: If `stat === line` (Push).
2. **Contextual Opponent Badges**:
   - Displays whether the game was Home (`vs HOU`) or Away (`@ MIA`).
   - Final game outcome: `W 21-13` or `L 17-24`.
3. **Dynamic Supporting Columns**:
   - When the user selects "Rushing Yards", supporting columns show `Attempts`, `Yards per Attempt`, and `Longest Run`.
   - When the user selects "Passing Yards", columns dynamically shift to `Completions`, `Attempts`, `Comp %`, `TDs`, and `INTs`.

---

## 3. Data Integrity & Post-Game Adjustments

Official NFL statistics are occasionally audited and amended by the Elias Sports Bureau in the days following a game (e.g. converting a lateral pass into a rush or crediting a tackle to another player).
- **LineMate Handling**: LineMate ingests Sportradar post-game revision payloads. If a stat changes, the game log in the database is overwritten with the corrected value, and cached trends are regenerated.
- **Limitation**: LineMate does not maintain an immutable audit trail of what the stat was *at the time the sportsbook graded the bet*.

---

## 4. PitchLab Game Log Engine Architecture

PitchLab will engineer an institutional-grade boxscore system:
1. **Audit Versioning**: Every game log will store `originalStat`, `revisedStat`, `revisedAt`, and `eiasRevisionNote`.
2. **Advanced Metrics Integration**: Expand game logs to include NextGen Stats metrics (Speed reached in mph, Time to Throw, Expected Rushing Yards, Rush Yards Over Expected - RYOE).
3. **Direct Video Highlight Integration**: Embed 10-second NFL clip links or route chart graphics directly into the row, allowing the bettor to see how a player achieved their 74 rushing yards.
