import duckdb
from pathlib import Path

REPO_ROOT = Path(".").resolve()
OUT_PARQUET = REPO_ROOT / "data" / "history" / "nfl-situational-features.parquet"
OUT_JSONL = REPO_ROOT / "data" / "history" / "nfl-situational-features.jsonl"

con = duckdb.connect()

print("Building NFL situational features dataset...")

con.execute(f"""
COPY (
    WITH base_games AS (
        SELECT DISTINCT
            game_id,
            'nfl:' || game_id AS id,
            season,
            game_type,
            week,
            CAST(gameday AS DATE) AS gameday,
            weekday,
            gametime,
            home_team AS home_team_abbr,
            away_team AS away_team_abbr,
            CAST(home_score AS INTEGER) AS home_score,
            CAST(away_score AS INTEGER) AS away_score,
            CAST(result AS FLOAT) AS result,
            CAST(total AS FLOAT) AS total_score,
            CAST(overtime AS INTEGER) AS overtime,
            location,
            CAST(spread_line AS FLOAT) AS spread_line,
            CAST(total_line AS FLOAT) AS total_line,
            TRY_CAST(home_moneyline AS FLOAT) AS home_moneyline,
            TRY_CAST(away_moneyline AS FLOAT) AS away_moneyline,
            CAST(div_game AS INTEGER) AS div_game,
            roof,
            surface,
            TRY_CAST(temp AS FLOAT) AS temp,
            TRY_CAST(wind AS FLOAT) AS wind,
            away_qb_id,
            home_qb_id,
            away_qb_name,
            home_qb_name,
            away_coach,
            home_coach,
            referee,
            stadium_id,
            stadium,
            TRY_CAST(away_rest AS INTEGER) AS away_rest,
            TRY_CAST(home_rest AS INTEGER) AS home_rest
        FROM 'data/history/raw/nflverse/games.csv'
        WHERE home_score IS NOT NULL 
          AND game_type IN ('REG', 'WC', 'DIV', 'CON', 'SB')
    ),

    -- Team game logs for rolling collective 4-game metrics
    team_games AS (
        SELECT 
            game_id,
            gameday,
            season,
            week,
            home_team_abbr AS team,
            'home' AS side,
            home_score AS pts_for,
            away_score AS pts_against
        FROM base_games
        UNION ALL
        SELECT 
            game_id,
            gameday,
            season,
            week,
            away_team_abbr AS team,
            'away' AS side,
            away_score AS pts_for,
            home_score AS pts_against
        FROM base_games
    ),

    team_rolling AS (
        SELECT 
            game_id,
            team,
            side,
            gameday,
            AVG(pts_for) OVER (
                PARTITION BY team 
                ORDER BY gameday, game_id 
                ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING
            ) AS rolling4_pts_for,
            AVG(pts_against) OVER (
                PARTITION BY team 
                ORDER BY gameday, game_id 
                ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING
            ) AS rolling4_pts_against,
            COUNT(pts_for) OVER (
                PARTITION BY team 
                ORDER BY gameday, game_id 
                ROWS BETWEEN 4 PRECEDING AND 1 PRECEDING
            ) AS rolling4_game_count
        FROM team_games
    ),

    -- QB passing stats weekly from stats_player_week (covering 1999 to 2026)
    qb_weekly AS (
        SELECT 
            player_id,
            season,
            week,
            COALESCE(passing_epa, 0.0) AS passing_epa,
            COALESCE(attempts, 0) AS attempts,
            COALESCE(completions, 0) AS completions,
            COALESCE(passing_yards, 0) AS passing_yards,
            COALESCE(passing_tds, 0) AS passing_tds,
            COALESCE(passing_interceptions, 0) AS interceptions
        FROM read_parquet('data/history/raw/nflverse/stats_player/stats_player_week_*.parquet')
        WHERE attempts > 0
    ),

    qb_by_week AS (
        SELECT 
            player_id,
            season,
            week,
            SUM(passing_epa) AS week_epa,
            SUM(attempts) AS week_attempts,
            SUM(completions) AS week_completions,
            SUM(passing_yards) AS week_yards,
            SUM(passing_tds) AS week_tds,
            SUM(interceptions) AS week_ints
        FROM qb_weekly
        GROUP BY player_id, season, week
    ),

    -- Causal as-of CTE for QB career passing history prior to each game
    game_qbs AS (
        SELECT game_id, season, week, home_qb_id AS qb_id, 'home' AS side
        FROM base_games
        WHERE home_qb_id IS NOT NULL
        UNION ALL
        SELECT game_id, season, week, away_qb_id AS qb_id, 'away' AS side
        FROM base_games
        WHERE away_qb_id IS NOT NULL
    ),

    game_qb_prior AS (
        SELECT 
            gq.game_id,
            gq.side,
            COALESCE(SUM(qw.week_attempts), 0) AS prior_attempts,
            COALESCE(SUM(qw.week_epa), 0.0) AS prior_epa,
            COALESCE(SUM(qw.week_yards), 0) AS prior_yards
        FROM game_qbs gq
        LEFT JOIN qb_by_week qw 
          ON gq.qb_id = qw.player_id 
         AND (qw.season < gq.season OR (qw.season = gq.season AND qw.week < gq.week))
        GROUP BY gq.game_id, gq.side
    )

    SELECT 
        bg.game_id,
        bg.id,
        bg.season,
        bg.game_type,
        bg.week,
        bg.gameday,
        bg.weekday,
        bg.gametime,
        bg.home_team_abbr,
        bg.away_team_abbr,
        bg.home_score,
        bg.away_score,
        bg.result,
        bg.total_score,
        bg.overtime,
        bg.location,
        bg.div_game,
        bg.spread_line,
        bg.total_line,
        bg.home_moneyline,
        bg.away_moneyline,
        -- Implied probabilities
        ROUND(
            CASE 
                WHEN bg.home_moneyline IS NOT NULL AND bg.away_moneyline IS NOT NULL THEN
                    CASE WHEN bg.home_moneyline < 0 THEN (-bg.home_moneyline)/(-bg.home_moneyline + 100.0)
                         ELSE 100.0/(bg.home_moneyline + 100.0) END /
                    (
                        (CASE WHEN bg.home_moneyline < 0 THEN (-bg.home_moneyline)/(-bg.home_moneyline + 100.0) ELSE 100.0/(bg.home_moneyline + 100.0) END) +
                        (CASE WHEN bg.away_moneyline < 0 THEN (-bg.away_moneyline)/(-bg.away_moneyline + 100.0) ELSE 100.0/(bg.away_moneyline + 100.0) END)
                    )
                ELSE NULL 
            END,
            4
        ) AS implied_prob_home,
        ROUND(
            CASE 
                WHEN bg.home_moneyline IS NOT NULL AND bg.away_moneyline IS NOT NULL THEN
                    CASE WHEN bg.away_moneyline < 0 THEN (-bg.away_moneyline)/(-bg.away_moneyline + 100.0)
                         ELSE 100.0/(bg.away_moneyline + 100.0) END /
                    (
                        (CASE WHEN bg.home_moneyline < 0 THEN (-bg.home_moneyline)/(-bg.home_moneyline + 100.0) ELSE 100.0/(bg.home_moneyline + 100.0) END) +
                        (CASE WHEN bg.away_moneyline < 0 THEN (-bg.away_moneyline)/(-bg.away_moneyline + 100.0) ELSE 100.0/(bg.away_moneyline + 100.0) END)
                    )
                ELSE NULL 
            END,
            4
        ) AS implied_prob_away,

        -- Rest and Schedule Situations
        bg.home_rest,
        bg.away_rest,
        (bg.home_rest - bg.away_rest) AS rest_diff,
        CASE WHEN bg.home_rest >= 10 THEN 1 ELSE 0 END AS home_post_bye,
        CASE WHEN bg.away_rest >= 10 THEN 1 ELSE 0 END AS away_post_bye,

        -- Weather & Environment
        bg.roof,
        bg.surface,
        bg.temp,
        bg.wind,
        CASE WHEN bg.roof IN ('dome', 'closed') THEN 1 ELSE 0 END AS is_dome,
        CASE WHEN bg.roof = 'outdoors' THEN 1 ELSE 0 END AS is_outdoors,
        CASE WHEN bg.temp IS NOT NULL AND bg.temp <= 32 THEN 1 ELSE 0 END AS is_cold,
        CASE WHEN bg.wind IS NOT NULL AND bg.wind >= 15 THEN 1 ELSE 0 END AS is_windy,
        bg.stadium_id,
        bg.stadium,
        bg.referee,
        bg.home_coach,
        bg.away_coach,

        -- Collective Rolling 4-Game Metrics (as-of)
        ROUND(h_roll.rolling4_pts_for, 2) AS home_rolling4_pts_for,
        ROUND(h_roll.rolling4_pts_against, 2) AS home_rolling4_pts_against,
        ROUND(h_roll.rolling4_pts_for - h_roll.rolling4_pts_against, 2) AS home_rolling4_net_pts,
        h_roll.rolling4_game_count AS home_rolling4_game_count,

        ROUND(a_roll.rolling4_pts_for, 2) AS away_rolling4_pts_for,
        ROUND(a_roll.rolling4_pts_against, 2) AS away_rolling4_pts_against,
        ROUND(a_roll.rolling4_pts_for - a_roll.rolling4_pts_against, 2) AS away_rolling4_net_pts,
        a_roll.rolling4_game_count AS away_rolling4_game_count,

        ROUND(h_roll.rolling4_pts_for - a_roll.rolling4_pts_for, 2) AS rolling4_pts_for_diff,
        ROUND(h_roll.rolling4_pts_against - a_roll.rolling4_pts_against, 2) AS rolling4_pts_against_diff,
        ROUND((h_roll.rolling4_pts_for - h_roll.rolling4_pts_against) - (a_roll.rolling4_pts_for - a_roll.rolling4_pts_against), 2) AS rolling4_net_diff,

        -- Quarterbacks & Bayesian Shrinkage (M = 150 attempts, League Prior = 0.04 EPA/att)
        bg.home_qb_id,
        bg.home_qb_name,
        COALESCE(h_qb.prior_attempts, 0) AS home_qb_prior_attempts,
        ROUND(COALESCE(h_qb.prior_epa, 0.0), 2) AS home_qb_prior_epa,
        CASE WHEN COALESCE(h_qb.prior_attempts, 0) > 0 
             THEN ROUND(h_qb.prior_epa / h_qb.prior_attempts, 4) 
             ELSE NULL END AS home_qb_prior_epa_per_att,
        ROUND(
            (COALESCE(h_qb.prior_attempts, 0) * (CASE WHEN COALESCE(h_qb.prior_attempts, 0) > 0 THEN h_qb.prior_epa / h_qb.prior_attempts ELSE 0.04 END) + 150.0 * 0.04) 
            / (COALESCE(h_qb.prior_attempts, 0) + 150.0), 
            4
        ) AS home_qb_shrunk_epa_per_att,

        bg.away_qb_id,
        bg.away_qb_name,
        COALESCE(a_qb.prior_attempts, 0) AS away_qb_prior_attempts,
        ROUND(COALESCE(a_qb.prior_epa, 0.0), 2) AS away_qb_prior_epa,
        CASE WHEN COALESCE(a_qb.prior_attempts, 0) > 0 
             THEN ROUND(a_qb.prior_epa / a_qb.prior_attempts, 4) 
             ELSE NULL END AS away_qb_prior_epa_per_att,
        ROUND(
            (COALESCE(a_qb.prior_attempts, 0) * (CASE WHEN COALESCE(a_qb.prior_attempts, 0) > 0 THEN a_qb.prior_epa / a_qb.prior_attempts ELSE 0.04 END) + 150.0 * 0.04) 
            / (COALESCE(a_qb.prior_attempts, 0) + 150.0), 
            4
        ) AS away_qb_shrunk_epa_per_att,

        ROUND(
            (
                (COALESCE(h_qb.prior_attempts, 0) * (CASE WHEN COALESCE(h_qb.prior_attempts, 0) > 0 THEN h_qb.prior_epa / h_qb.prior_attempts ELSE 0.04 END) + 150.0 * 0.04) 
                / (COALESCE(h_qb.prior_attempts, 0) + 150.0)
            ) - (
                (COALESCE(a_qb.prior_attempts, 0) * (CASE WHEN COALESCE(a_qb.prior_attempts, 0) > 0 THEN a_qb.prior_epa / a_qb.prior_attempts ELSE 0.04 END) + 150.0 * 0.04) 
                / (COALESCE(a_qb.prior_attempts, 0) + 150.0)
            ),
            4
        ) AS qb_shrunk_epa_diff

    FROM base_games bg
    LEFT JOIN team_rolling h_roll ON bg.game_id = h_roll.game_id AND h_roll.side = 'home'
    LEFT JOIN team_rolling a_roll ON bg.game_id = a_roll.game_id AND a_roll.side = 'away'
    LEFT JOIN game_qb_prior h_qb ON bg.game_id = h_qb.game_id AND h_qb.side = 'home'
    LEFT JOIN game_qb_prior a_qb ON bg.game_id = a_qb.game_id AND a_qb.side = 'away'
    ORDER BY bg.gameday, bg.game_id
) TO '{str(OUT_PARQUET).replace(chr(92), "/")}' (FORMAT PARQUET)
""")

print("Successfully written Parquet to", OUT_PARQUET)

print("Exporting mirror JSONL dataset...")
OUT_JSONL.parent.mkdir(parents=True, exist_ok=True)
con.execute(f"COPY (SELECT * FROM '{str(OUT_PARQUET).replace(chr(92), '/')}') TO '{str(OUT_JSONL).replace(chr(92), '/')}' (FORMAT JSON)")
print("Successfully written JSONL to", OUT_JSONL)

count_parquet = con.execute(f"SELECT count(*) FROM '{str(OUT_PARQUET).replace(chr(92), '/')}'").fetchone()[0]
count_jsonl = con.execute(f"SELECT count(*) FROM read_json_auto('{str(OUT_JSONL).replace(chr(92), '/')}')").fetchone()[0]
print(f"Parquet total rows: {count_parquet}")
print(f"JSONL total rows: {count_jsonl}")
