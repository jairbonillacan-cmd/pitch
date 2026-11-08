# NFL Player Props Catalog & Market Architecture

## 1. Catalog of Available NFL Player Props

LineMate indexes a wide array of NFL player prop markets, categorized by player position and offensive/defensive phase. The master mapping is declared in `linemate-react-common/src/constants.js` under `PLAYER_BET_TYPES` and `PLAYER_BET_TYPE_ID_TO_NAME`.

### 1.1 Quarterback Props (Passing & Rushing)
| Market ID | Public Display Name | Stat Field in CumulativeStats | Units | Typical Line Range |
| :--- | :--- | :--- | :--- | :--- |
| `PASSING_YARDS` | Passing Yards | `passingYards` | Yards | 195.5 – 285.5 |
| `PASSING_TOUCHDOWNS` | Passing Touchdowns | `passingTouchdowns` | Touchdowns | 1.5 (Juiced -130/+110) |
| `PASSING_ATTEMPTS` | Pass Attempts | `passingAttempts` | Attempts | 28.5 – 38.5 |
| `PASSING_COMPLETIONS`| Pass Completions | `passingCompletions` | Completions | 18.5 – 25.5 |
| `PASSING_INTERCEPTIONS`| Interceptions Thrown | `interceptions` | Interceptions | 0.5 |
| `LONGEST_PASS` | Longest Completion | `longestCompletion` | Yards | 33.5 – 39.5 |
| `PASSING_YARDS_1Q` | 1Q Passing Yards | `passingYards1q` | Yards | 44.5 – 59.5 |
| `PASSING_PLUS_RUSHING`| Pass + Rush Yards | `passingYards + rushingYards`| Yards | 230.5 – 310.5 |

### 1.2 Running Back Props (Rushing & Receiving)
| Market ID | Public Display Name | Stat Field in CumulativeStats | Units | Typical Line Range |
| :--- | :--- | :--- | :--- | :--- |
| `RUSHING_YARDS` | Rushing Yards | `rushingYards` | Yards | 42.5 – 88.5 |
| `RUSHING_ATTEMPTS` | Rush Attempts | `rushingAttempts` | Carries | 10.5 – 18.5 |
| `RUSHING_TOUCHDOWNS` | Rushing Touchdowns | `rushingTouchdowns` | Touchdowns | 0.5 |
| `LONGEST_RUSH` | Longest Rush | `longestRun` | Yards | 13.5 – 18.5 |
| `RUSHING_YARDS_1Q` | 1Q Rushing Yards | `rushingYards1q` | Yards | 11.5 – 18.5 |
| `RUSHING_PLUS_RECEIVING`| Rush + Rec Yards | `rushingYards + receivingYards`| Yards | 65.5 – 115.5 |

### 1.3 Wide Receiver & Tight End Props
| Market ID | Public Display Name | Stat Field in CumulativeStats | Units | Typical Line Range |
| :--- | :--- | :--- | :--- | :--- |
| `RECEIVING_YARDS` | Receiving Yards | `receivingYards` | Yards | 35.5 – 84.5 |
| `RECEPTIONS` | Receptions | `receptions` | Catches | 3.5 – 7.5 |
| `RECEIVING_TOUCHDOWNS`| Receiving Touchdowns | `receivingTouchdowns` | Touchdowns | 0.5 |
| `LONGEST_RECEPTION` | Longest Reception | `longestReception` | Yards | 18.5 – 27.5 |
| `RECEIVING_YARDS_1Q` | 1Q Receiving Yards | `receivingYards1q` | Yards | 9.5 – 19.5 |
| `ANYTIME_TOUCHDOWN` | Anytime Touchdown Scorer | `rushingTouchdowns + receivingTouchdowns > 0` | Event (Yes/No) | -150 to +450 |
| `FIRST_TOUCHDOWN` | First Touchdown Scorer | First score event | Event (Yes) | +400 to +1800 |

### 1.4 Kicking Props
| Market ID | Public Display Name | Stat Field in CumulativeStats | Units | Typical Line Range |
| :--- | :--- | :--- | :--- | :--- |
| `FIELD_GOALS_MADE` | Field Goals Made | `fieldGoalsMade` | FGs | 1.5 |
| `KICKING_POINTS` | Kicking Points | `pointsKicked` | Points | 6.5 – 8.5 |
| `EXTRA_POINTS_MADE` | Extra Points Made | `extraPointsMade` | XPs | 2.5 |

---

## 2. Main Lines vs Alternate Lines

LineMate distinguishes between **Main Lines** and **Alternate Lines**:
1. **Main Lines (`lineTypes=MAIN`)**:
   - The consensus sportsbook line where odds are balanced closest to even money (-110 / -110, or within -135 to +115).
   - This is the line displayed by default on the Props screener and workstation.
2. **Alternate Lines (`lineTypes=ALTERNATE`)**:
   - Skewed lines offered by sportsbooks for ladder betting or conservative parlays.
   - Examples:
     - Main line: Breece Hall Over 64.5 Rush Yards (-115).
     - Alternate line: Breece Hall 20+ Rush Yards (-650) or 80+ Rush Yards (+185).
   - LineMate features an entire dedicated Cheatsheet for "100% Alternate Lines" (e.g. "J. Dobbins 6+ Rush Att in 20/20 games").
   - **Crucial Note**: These alternate lines often carry massive implied odds (-400 to -1200) where a single loss wipes out multiple winning bets. LineMate highlights the 100% frequency without warning users about negative expected value.

---

## 3. PitchLab Canonical Props Engine Architecture

PitchLab should establish a standardized, highly scalable props data engine:
1. **Unified Schema**: Every prop line follows a typed tuple:
   `(PlayerId, MarketId, Line, Direction, BookmakerId, Price, Timestamp)`.
2. **Dynamic Ladder Generation**: PitchLab should allow users to view the entire probability curve across every available line (e.g. 40+, 50+, 60+, 70+, 80+ yards), comparing empirical hit rate against model projection and implied market price.
3. **Kelly Criterion Edge Calculator**: For every prop line, PitchLab should compute:
   $$\text{Edge} = P_{\text{model}} - P_{\text{implied\_fair}}$$
   and recommend optimal stake sizing via Fractional Kelly.
