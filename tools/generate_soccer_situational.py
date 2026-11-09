"""
Compile European soccer situational features dataset into parquet and mirror JSONL:
- In-game stats: shots, shots on target, off-target, SOT accuracy, conversion rate, corners, cards
- Empirical calibrated proxy xG (home, away, total, diff, overperformance)
- Anti-leakage as-of rolling 5-game metrics (goals, shots, SOT, proxy xG, corners)
- Rest days and calendar congestion flags (<= 3 days)
- Closing odds & vig-free implied probabilities

Target output:
  - data/history/soccer-situational-features.parquet
  - data/history/soccer-situational-features.jsonl
"""

import duckdb
from pathlib import Path

REPO_ROOT = Path(".").resolve()
OUT_PARQUET = REPO_ROOT / "data" / "history" / "soccer-situational-features.parquet"
OUT_JSONL = REPO_ROOT / "data" / "history" / "soccer-situational-features.jsonl"

con = duckdb.connect()

files = [
    "data/history/research/premier-league.jsonl",
    "data/history/research/la-liga.jsonl",
    "data/history/research/bundesliga.jsonl",
    "data/history/research/serie-a.jsonl",
    "data/history/research/ligue-1.jsonl",
]

print("Compiling European soccer situational features dataset...")

sql = f"""
COPY (
    WITH raw_games AS (
        SELECT 
            id,
            league,
            season,
            CAST(date AS DATE) AS match_date,
            homeTeam AS home_team,
            awayTeam AS away_team,
            CAST(homeScore AS INTEGER) AS home_score,
            CAST(awayScore AS INTEGER) AS away_score,
            (CAST(homeScore AS INTEGER) + CAST(awayScore AS INTEGER)) AS total_goals,
            (CAST(homeScore AS INTEGER) - CAST(awayScore AS INTEGER)) AS goal_diff,
            CASE 
                WHEN CAST(homeScore AS INTEGER) > CAST(awayScore AS INTEGER) THEN 'H'
                WHEN CAST(homeScore AS INTEGER) < CAST(awayScore AS INTEGER) THEN 'A'
                ELSE 'D'
            END AS result,
            
            TRY_CAST(stats.shotsHome AS INTEGER) AS shots_home,
            TRY_CAST(stats.shotsAway AS INTEGER) AS shots_away,
            TRY_CAST(stats.shotsOnTargetHome AS INTEGER) AS shots_on_target_home,
            TRY_CAST(stats.shotsOnTargetAway AS INTEGER) AS shots_on_target_away,
            TRY_CAST(stats.cornersHome AS INTEGER) AS corners_home,
            TRY_CAST(stats.cornersAway AS INTEGER) AS corners_away,
            TRY_CAST(stats.yellowHome AS INTEGER) AS yellow_home,
            TRY_CAST(stats.yellowAway AS INTEGER) AS yellow_away,
            TRY_CAST(stats.redHome AS INTEGER) AS red_home,
            TRY_CAST(stats.redAway AS INTEGER) AS red_away,

            TRY_CAST(odds.home AS FLOAT) AS odds_home,
            TRY_CAST(odds.draw AS FLOAT) AS odds_draw,
            TRY_CAST(odds.away AS FLOAT) AS odds_away,
            TRY_CAST(odds.over25 AS FLOAT) AS odds_over25,
            TRY_CAST(odds.under25 AS FLOAT) AS odds_under25,
            odds.bookmaker AS odds_bookmaker,
            odds.timing AS odds_timing
        FROM read_json_auto({files})
        WHERE stats IS NOT NULL AND stats.shotsHome IS NOT NULL
    ),

    games_with_proxy_xg AS (
        SELECT 
            *,
            (shots_home + shots_away) AS shots_total,
            (shots_on_target_home + shots_on_target_away) AS shots_on_target_total,
            GREATEST(shots_home - shots_on_target_home, 0) AS shots_off_target_home,
            GREATEST(shots_away - shots_on_target_away, 0) AS shots_off_target_away,
            CASE WHEN shots_home > 0 THEN ROUND(shots_on_target_home * 1.0 / shots_home, 4) ELSE NULL END AS average_sot_accuracy_home,
            CASE WHEN shots_away > 0 THEN ROUND(shots_on_target_away * 1.0 / shots_away, 4) ELSE NULL END AS average_sot_accuracy_away,
            CASE WHEN shots_on_target_home > 0 THEN ROUND(home_score * 1.0 / shots_on_target_home, 4) ELSE NULL END AS conversion_rate_home,
            CASE WHEN shots_on_target_away > 0 THEN ROUND(away_score * 1.0 / shots_on_target_away, 4) ELSE NULL END AS conversion_rate_away,
            (COALESCE(corners_home, 0) + COALESCE(corners_away, 0)) AS corners_total,
            
            -- Calibrated empirical proxy xG model (0.2731 * SOT + 0.035 * OffTarget)
            ROUND(0.2731 * shots_on_target_home + 0.035 * GREATEST(shots_home - shots_on_target_home, 0), 3) AS proxy_xg_home,
            ROUND(0.2731 * shots_on_target_away + 0.035 * GREATEST(shots_away - shots_on_target_away, 0), 3) AS proxy_xg_away
        FROM raw_games
    ),

    team_games AS (
        SELECT 
            id,
            match_date,
            league,
            season,
            home_team AS team,
            'home' AS side,
            home_score AS goals_for,
            away_score AS goals_against,
            shots_home AS shots_for,
            shots_away AS shots_against,
            shots_on_target_home AS sot_for,
            shots_on_target_away AS sot_against,
            corners_home AS corners_for,
            corners_away AS corners_against,
            proxy_xg_home AS proxy_xg_for,
            proxy_xg_away AS proxy_xg_against
        FROM games_with_proxy_xg
        UNION ALL
        SELECT 
            id,
            match_date,
            league,
            season,
            away_team AS team,
            'away' AS side,
            away_score AS goals_for,
            home_score AS goals_against,
            shots_away AS shots_for,
            shots_home AS shots_against,
            shots_on_target_away AS sot_for,
            shots_on_target_home AS sot_against,
            corners_away AS corners_for,
            corners_home AS corners_against,
            proxy_xg_away AS proxy_xg_for,
            proxy_xg_home AS proxy_xg_against
        FROM games_with_proxy_xg
    ),

    team_rolling AS (
        SELECT 
            id,
            team,
            side,
            match_date,
            date_diff('day', LAG(match_date) OVER (PARTITION BY team ORDER BY match_date, id), match_date) AS rest_days,
            AVG(goals_for) OVER (
                PARTITION BY team 
                ORDER BY match_date, id 
                ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
            ) AS rolling5_goals_for,
            AVG(goals_against) OVER (
                PARTITION BY team 
                ORDER BY match_date, id 
                ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
            ) AS rolling5_goals_against,
            AVG(shots_for) OVER (
                PARTITION BY team 
                ORDER BY match_date, id 
                ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
            ) AS rolling5_shots_for,
            AVG(shots_against) OVER (
                PARTITION BY team 
                ORDER BY match_date, id 
                ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
            ) AS rolling5_shots_against,
            AVG(sot_for) OVER (
                PARTITION BY team 
                ORDER BY match_date, id 
                ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
            ) AS rolling5_sot_for,
            AVG(sot_against) OVER (
                PARTITION BY team 
                ORDER BY match_date, id 
                ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
            ) AS rolling5_sot_against,
            AVG(proxy_xg_for) OVER (
                PARTITION BY team 
                ORDER BY match_date, id 
                ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
            ) AS rolling5_proxy_xg_for,
            AVG(proxy_xg_against) OVER (
                PARTITION BY team 
                ORDER BY match_date, id 
                ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
            ) AS rolling5_proxy_xg_against,
            AVG(corners_for) OVER (
                PARTITION BY team 
                ORDER BY match_date, id 
                ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
            ) AS rolling5_corners_for,
            AVG(corners_against) OVER (
                PARTITION BY team 
                ORDER BY match_date, id 
                ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
            ) AS rolling5_corners_against,
            COUNT(goals_for) OVER (
                PARTITION BY team 
                ORDER BY match_date, id 
                ROWS BETWEEN 5 PRECEDING AND 1 PRECEDING
            ) AS rolling5_matches_count
        FROM team_games
    )

    SELECT 
        g.id,
        g.league,
        g.season,
        g.match_date,
        g.home_team,
        g.away_team,
        g.home_score,
        g.away_score,
        g.total_goals,
        g.goal_diff,
        g.result,

        -- In-game Shots & Statistics
        g.shots_home,
        g.shots_away,
        g.shots_total,
        g.shots_on_target_home,
        g.shots_on_target_away,
        g.shots_on_target_total,
        g.shots_off_target_home,
        g.shots_off_target_away,
        g.average_sot_accuracy_home AS sot_accuracy_home,
        g.average_sot_accuracy_away AS sot_accuracy_away,
        g.conversion_rate_home,
        g.conversion_rate_away,
        g.corners_home,
        g.corners_away,
        g.corners_total,
        g.yellow_home,
        g.yellow_away,
        g.red_home,
        g.red_away,

        -- Empirical Proxy xG
        g.proxy_xg_home,
        g.proxy_xg_away,
        ROUND(g.proxy_xg_home + g.proxy_xg_away, 3) AS proxy_xg_total,
        ROUND(g.proxy_xg_home - g.proxy_xg_away, 3) AS proxy_xg_diff,
        ROUND(g.home_score - g.proxy_xg_home, 3) AS xg_overperformance_home,
        ROUND(g.away_score - g.proxy_xg_away, 3) AS xg_overperformance_away,

        -- Schedule & Rest Days
        h_roll.rest_days AS home_rest_days,
        a_roll.rest_days AS away_rest_days,
        (h_roll.rest_days - a_roll.rest_days) AS rest_diff_days,
        CASE WHEN h_roll.rest_days IS NOT NULL AND h_roll.rest_days <= 3 THEN 1 ELSE 0 END AS is_congested_home,
        CASE WHEN a_roll.rest_days IS NOT NULL AND a_roll.rest_days <= 3 THEN 1 ELSE 0 END AS is_congested_away,

        -- Rolling as-of Features (Strictly Anti-Leakage 5-Game Prior Window)
        ROUND(h_roll.rolling5_goals_for, 2) AS home_rolling5_goals_for,
        ROUND(h_roll.rolling5_goals_against, 2) AS home_rolling5_goals_against,
        ROUND(h_roll.rolling5_shots_for, 2) AS home_rolling5_shots_for,
        ROUND(h_roll.rolling5_shots_against, 2) AS home_rolling5_shots_against,
        ROUND(h_roll.rolling5_sot_for, 2) AS home_rolling5_sot_for,
        ROUND(h_roll.rolling5_sot_against, 2) AS home_rolling5_sot_against,
        ROUND(h_roll.rolling5_proxy_xg_for, 2) AS home_rolling5_proxy_xg_for,
        ROUND(h_roll.rolling5_proxy_xg_against, 2) AS home_rolling5_proxy_xg_against,
        ROUND(h_roll.rolling5_proxy_xg_for - h_roll.rolling5_proxy_xg_against, 2) AS home_rolling5_proxy_xg_net,
        ROUND(h_roll.rolling5_corners_for, 2) AS home_rolling5_corners_for,
        ROUND(h_roll.rolling5_corners_against, 2) AS home_rolling5_corners_against,
        h_roll.rolling5_matches_count AS home_rolling5_matches_count,

        ROUND(a_roll.rolling5_goals_for, 2) AS away_rolling5_goals_for,
        ROUND(a_roll.rolling5_goals_against, 2) AS away_rolling5_goals_against,
        ROUND(a_roll.rolling5_shots_for, 2) AS away_rolling5_shots_for,
        ROUND(a_roll.rolling5_shots_against, 2) AS away_rolling5_shots_against,
        ROUND(a_roll.rolling5_sot_for, 2) AS away_rolling5_sot_for,
        ROUND(a_roll.rolling5_sot_against, 2) AS away_rolling5_sot_against,
        ROUND(a_roll.rolling5_proxy_xg_for, 2) AS away_rolling5_proxy_xg_for,
        ROUND(a_roll.rolling5_proxy_xg_against, 2) AS away_rolling5_proxy_xg_against,
        ROUND(a_roll.rolling5_proxy_xg_for - a_roll.rolling5_proxy_xg_against, 2) AS away_rolling5_proxy_xg_net,
        ROUND(a_roll.rolling5_corners_for, 2) AS away_rolling5_corners_for,
        ROUND(a_roll.rolling5_corners_against, 2) AS away_rolling5_corners_against,
        a_roll.rolling5_matches_count AS away_rolling5_matches_count,

        ROUND((h_roll.rolling5_proxy_xg_for - h_roll.rolling5_proxy_xg_against) - 
              (a_roll.rolling5_proxy_xg_for - a_roll.rolling5_proxy_xg_against), 2) AS rolling5_proxy_xg_net_diff,

        -- Closing Odds & Vig-Free Market Probabilities
        g.odds_home,
        g.odds_draw,
        g.odds_away,
        g.odds_over25,
        g.odds_under25,
        g.odds_bookmaker,
        g.odds_timing,
        CASE 
            WHEN g.odds_home > 0 AND g.odds_draw > 0 AND g.odds_away > 0 THEN
                ROUND((1.0 / g.odds_home) / ((1.0 / g.odds_home) + (1.0 / g.odds_draw) + (1.0 / g.odds_away)), 4)
            ELSE NULL 
        END AS implied_prob_home,
        CASE 
            WHEN g.odds_home > 0 AND g.odds_draw > 0 AND g.odds_away > 0 THEN
                ROUND((1.0 / g.odds_draw) / ((1.0 / g.odds_home) + (1.0 / g.odds_draw) + (1.0 / g.odds_away)), 4)
            ELSE NULL 
        END AS implied_prob_draw,
        CASE 
            WHEN g.odds_home > 0 AND g.odds_draw > 0 AND g.odds_away > 0 THEN
                ROUND((1.0 / g.odds_away) / ((1.0 / g.odds_home) + (1.0 / g.odds_draw) + (1.0 / g.odds_away)), 4)
            ELSE NULL 
        END AS implied_prob_away

    FROM games_with_proxy_xg g
    LEFT JOIN team_rolling h_roll ON g.id = h_roll.id AND h_roll.side = 'home'
    LEFT JOIN team_rolling a_roll ON g.id = a_roll.id AND a_roll.side = 'away'
    ORDER BY g.match_date, g.id
) TO '{str(OUT_PARQUET).replace(chr(92), "/")}' (FORMAT PARQUET)
"""

con.execute(sql)
print("Successfully written Parquet to", OUT_PARQUET)

print("Exporting mirror JSONL dataset...")
OUT_JSONL.parent.mkdir(parents=True, exist_ok=True)
con.execute(f"COPY (SELECT * FROM '{str(OUT_PARQUET).replace(chr(92), '/')}') TO '{str(OUT_JSONL).replace(chr(92), '/')}' (FORMAT JSON)")
print("Successfully written JSONL to", OUT_JSONL)

count_parquet = con.execute(f"SELECT count(*) FROM '{str(OUT_PARQUET).replace(chr(92), '/')}'").fetchone()[0]
count_jsonl = con.execute(f"SELECT count(*) FROM read_json_auto('{str(OUT_JSONL).replace(chr(92), '/')}')").fetchone()[0]
print(f"Parquet total rows: {count_parquet}")
print(f"JSONL total rows: {count_jsonl}")
