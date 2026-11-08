# Matchup & Opponent Defensive Analysis

## 1. Opponent Analysis Methodology

LineMate evaluates opponent matchups through two primary mechanisms:
1. **Opponent Defensive Rank (`OPPONENT_RANK`)**: A 1-to-32 league ranking of how stingy or generous a defense is in allowing specific statistical categories.
2. **Head-to-Head History (`HEAD_TO_HEAD`)**: Historical performances of the individual player against that specific opponent over the past 3 seasons (`RANGE_2024_2026`).

---

## 2. Mathematical Formulation of Defensive Rankings

The defensive ranking algorithm was reverse engineered from `buildTeamPropRankings` in `linemate-react-common/src/util.js`:

```javascript
export function buildTeamPropRankings(teams, league) {
  var result = {};
  Object.keys(PLAYER_BET_TYPE_ID_TO_NAME[league]).map((propID) => {
      const propMapping = getPlayerPropDefensiveTeamStatPath[league](propID);
      const fields = propMapping.defensiveTeamFields;
      if (fields && fields.length > 0) {
        var localTeams = teams.map(a => ({...a}));
        localTeams.map((team) => {
            var value = 0;
            fields.map((field) => {
                value += getDictionaryValue(team, `${field}`);
            });
            team.propValue = value;
        });
        var teamRankMapping = {};
        orderListByField(localTeams, 'propValue', propMapping.defensiveSortingOrder);
        localTeams.map((team, index) => {
            teamRankMapping[team.code] = index + 1;
        });
        result[propID] = teamRankMapping;
      }
  });
  return result;
}
```

### 2.1 Ranking Logic:
1. For every prop category (e.g. `PASSING_YARDS`), extract the opponent's cumulative defensive stat allowed per game (`opposingDefensivePassingYards`).
2. Sort all 32 NFL teams by this metric in ascending order (`ASC`):
   - **Rank 1st**: Allows the fewest passing yards per game (Toughest defense).
   - **Rank 32nd**: Allows the most passing yards per game (Easiest / most favorable defense).
3. In `OpponentDefensiveRank.jsx`, LineMate highlights extreme matchups:
   ```javascript
   function shouldShowRank(rank, totalTeams) {
     return rank <= 5 || rank > totalTeams - 5;
   }
   ```
   - Teams ranked **1st to 5th** are classified as "Tough Matchups" (red/muted indicator).
   - Teams ranked **28th to 32nd** are classified as "Great Matchups" (green trophy icon: e.g. `"CIN is a good Receptions matchup (31st)"`).

---

## 3. Critical Analytical Limitations in LineMate

While simple to understand, LineMate's opponent ranking suffers from four major mathematical flaws:
1. **Unadjusted for Strength of Schedule (SOS)**: A defense that faced Patrick Mahomes, Lamar Jackson, and Josh Allen will look worse in total yards allowed than a defense that faced backup quarterbacks, regardless of actual defensive talent.
2. **Unadjusted for Pace / Play Volume**: Teams that play at an ultra-fast tempo experience more opponent snaps, inflating total yards allowed even if their per-play efficiency is elite.
3. **Personnel & Scheme Blindness**: The metric treats the defense as a monolithic static unit, ignoring whether a shutdown cornerback is injured or whether the defense plays predominantly Cover 3 vs Man-to-Man.
4. **Historical H2H Sample Size Issues**: Head-to-Head trends often cite `"Hit in 1 of last 1 games vs DAL (100%)"`. Highlighting 1-game samples as "100% Trends" is statistically invalid and misleads recreational users.

---

## 4. PitchLab Advanced Matchup Intelligence Architecture

PitchLab will deploy a vastly superior opponent analysis framework:
1. **DVOA & EPA/Play Allowed**: Integrate Expected Points Added per dropback/rush and Success Rate allowed rather than raw yards.
2. **Positional Defense vs Receiver Archetypes**: Track how defenses perform against specific receiver archetypes (Alpha X-receivers, Slot receivers, Tight Ends, pass-catching RBs).
3. **Coverage Scheme Modeling**: Map defense primary coverage shell (Cover 1, Cover 2, Cover 3, Quarters, Man) against the offensive coordinator's passing playbook efficiency.
4. **Sample Size Significance Guardrails**: Never display a 1-game or 2-game sample as a "100% Trend". Require a minimum of 4 games and compute Bayesian shrinkage towards the league mean.
