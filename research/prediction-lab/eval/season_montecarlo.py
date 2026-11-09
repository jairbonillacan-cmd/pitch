#!/usr/bin/env python3
"""PitchLab Season Monte Carlo & Playoff Projection Engine (A10 / v2).

Evaluates and backtests season projections against ground-truth league finishes.
Simulates remaining fixtures over N iterations (e.g. 10,000) using 1X2 probabilities
(Dixon-Coles, Motor A, or Elo) to generate:
1. Projected Standings Summary (Statiskicks Proyección tab equivalent):
   - xPts (exact analytical expected points)
   - simulatedMeanPoints (empirical Monte Carlo average points)
   - projectedRank (expected finishing position)
   - modeRank (most likely finishing position)
   - pSuperlider (P(Rank = 1))
   - pDirectPlayoff (P(Rank <= topDirect))
   - pPlayIn (P(playInStart <= Rank <= playInEnd))
   - pRelegation (P(Rank > N - relegationSpots))
   - pChampion (P(Champion): Rank 1 in European leagues or Liguilla knockout winner in Liga MX)
2. N x N Doubly Stochastic Rank Probability Matrix:
   - For every team i and rank k, P(Rank_i = k+1).
   - Rows and columns strictly sum to 1.0.

Fully vectorized with NumPy, reproducible with fixed seeds, and benchmarked against
real-world seasons in `data/processed/features.parquet` (e.g. Premier League E0 or LaLiga SP1).
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass, field
import math
from pathlib import Path
import sys
import time

import numpy as np
import pandas as pd


@dataclass
class TeamStanding:
    team_id: str
    team_name: str
    points: int = 0
    played: int = 0
    won: int = 0
    drawn: int = 0
    lost: int = 0
    goals_for: int = 0
    goals_against: int = 0
    goal_difference: int = 0
    elo_rating: float = 1500.0


@dataclass
class ScheduledFixture:
    fixture_id: str
    home_team_id: str
    away_team_id: str
    round_no: int = 0
    p_home: float = 0.44
    p_draw: float = 0.26
    p_away: float = 0.30
    lambda_home: float = 1.3
    lambda_away: float = 1.1


@dataclass
class LeagueFormatConfig:
    format: str = "standard"  # "standard" or "ligamx"
    top_direct: int = 4
    play_in_start: int = 7
    play_in_end: int = 10
    relegation_spots: int = 3
    playoff_bracket_size: int = 8
    playoff_higher_seed_advances_on_tie: bool = True


@dataclass
class TeamProjectionSummary:
    team_id: str
    team_name: str
    current_points: int
    current_rank: int
    xpts: float
    simulated_mean_points: float
    projected_rank: float
    mode_rank: int
    p_superlider: float
    p_direct_playoff: float
    p_play_in: float
    p_relegation: float
    p_champion: float
    rank_distribution: list[float] = field(default_factory=list)


@dataclass
class SeasonMonteCarloResult:
    iterations: int
    elapsed_ms: float
    teams: list[TeamProjectionSummary]
    rank_matrix: np.ndarray  # N x N doubly stochastic matrix


# ---------------------------------------------------------------------------
# Standings & Analytical xPts
# ---------------------------------------------------------------------------


def compute_standings_from_matches(matches_df: pd.DataFrame) -> dict[str, TeamStanding]:
    """Computes league standings from a DataFrame of completed matches."""
    standings: dict[str, TeamStanding] = {}

    for _, row in matches_df.iterrows():
        h = str(row["home_team"])
        a = str(row["away_team"])
        hg = int(row["home_goals"])
        ag = int(row["away_goals"])

        for team_name in (h, a):
            if team_name not in standings:
                standings[team_name] = TeamStanding(
                    team_id=team_name,
                    team_name=team_name,
                )

        st_h = standings[h]
        st_a = standings[a]

        st_h.played += 1
        st_a.played += 1
        st_h.goals_for += hg
        st_h.goals_against += ag
        st_a.goals_for += ag
        st_a.goals_against += hg
        st_h.goal_difference = st_h.goals_for - st_h.goals_against
        st_a.goal_difference = st_a.goals_for - st_a.goals_against

        if "elo_home" in row and pd.notna(row["elo_home"]):
            st_h.elo_rating = float(row["elo_home"])
        if "elo_away" in row and pd.notna(row["elo_away"]):
            st_a.elo_rating = float(row["elo_away"])

        if hg > ag:
            st_h.won += 1
            st_h.points += 3
            st_a.lost += 1
        elif hg == ag:
            st_h.drawn += 1
            st_h.points += 1
            st_a.drawn += 1
            st_a.points += 1
        else:
            st_a.won += 1
            st_a.points += 3
            st_h.lost += 1

    return standings


def compute_analytical_xpts(
    standings: list[TeamStanding],
    fixtures: list[ScheduledFixture],
) -> dict[str, float]:
    """Computes exact analytical expected points (xPts) for each team."""
    xpts_map: dict[str, float] = {t.team_id: float(t.points) for t in standings}

    for fix in fixtures:
        tot = fix.p_home + fix.p_draw + fix.p_away
        if tot <= 0:
            ph, pd_, pa = 0.44, 0.26, 0.30
        else:
            ph = fix.p_home / tot
            pd_ = fix.p_draw / tot
            pa = fix.p_away / tot

        h_exp = 3.0 * ph + 1.0 * pd_
        a_exp = 3.0 * pa + 1.0 * pd_

        if fix.home_team_id in xpts_map:
            xpts_map[fix.home_team_id] += h_exp
        if fix.away_team_id in xpts_map:
            xpts_map[fix.away_team_id] += a_exp

    return xpts_map


# ---------------------------------------------------------------------------
# Vectorized Monte Carlo Simulator
# ---------------------------------------------------------------------------


def simulate_season_mc(
    standings: list[TeamStanding],
    fixtures: list[ScheduledFixture],
    format_config: LeagueFormatConfig | None = None,
    iterations: int = 10_000,
    seed: int = 42,
) -> SeasonMonteCarloResult:
    """Vectorized Monte Carlo season simulation over N iterations."""
    t0 = time.perf_counter()

    if format_config is None:
        format_config = LeagueFormatConfig()

    N = len(standings)
    if N == 0:
        return SeasonMonteCarloResult(
            iterations=0,
            elapsed_ms=0.0,
            teams=[],
            rank_matrix=np.empty((0, 0)),
        )

    team_id_to_idx = {t.team_id: i for i, t in enumerate(standings)}
    initial_points = np.array([t.points for t in standings], dtype=np.int32)
    initial_gd = np.array([t.goal_difference for t in standings], dtype=np.int32)
    initial_gf = np.array([t.goals_for for t in standings], dtype=np.int32)
    elo_ratings = np.array([t.elo_rating for t in standings], dtype=np.float64)

    # Sort initial standings for current_rank
    sorted_init = sorted(
        standings,
        key=lambda t: (t.points, t.goal_difference, t.goals_for),
        reverse=True,
    )
    current_rank_map = {t.team_id: r + 1 for r, t in enumerate(sorted_init)}

    analytical_xpts_map = compute_analytical_xpts(standings, fixtures)

    M = len(fixtures)
    rng = np.random.default_rng(seed)

    # If no remaining fixtures, standings are already final
    if M == 0:
        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        rank_matrix = np.zeros((N, N), dtype=np.float64)
        for r, t in enumerate(sorted_init):
            idx = team_id_to_idx[t.team_id]
            rank_matrix[idx, r] = 1.0

        summaries = []
        for i, t in enumerate(standings):
            curr_r = current_rank_map[t.team_id]
            p_champ = 1.0 if curr_r == 1 else 0.0
            summaries.append(
                TeamProjectionSummary(
                    team_id=t.team_id,
                    team_name=t.team_name,
                    current_points=t.points,
                    current_rank=curr_r,
                    xpts=float(t.points),
                    simulated_mean_points=float(t.points),
                    projected_rank=float(curr_r),
                    mode_rank=curr_r,
                    p_superlider=p_champ,
                    p_direct_playoff=1.0 if curr_r <= format_config.top_direct else 0.0,
                    p_play_in=(
                        1.0
                        if format_config.play_in_start <= curr_r <= format_config.play_in_end
                        else 0.0
                    ),
                    p_relegation=(
                        1.0
                        if format_config.relegation_spots > 0
                        and curr_r > N - format_config.relegation_spots
                        else 0.0
                    ),
                    p_champion=p_champ,
                    rank_distribution=rank_matrix[i].tolist(),
                )
            )
        summaries.sort(key=lambda s: s.projected_rank)
        return SeasonMonteCarloResult(
            iterations=iterations,
            elapsed_ms=elapsed_ms,
            teams=summaries,
            rank_matrix=rank_matrix,
        )

    # Pre-extract fixture arrays
    fix_h = np.array([team_id_to_idx[f.home_team_id] for f in fixtures], dtype=np.int32)
    fix_a = np.array([team_id_to_idx[f.away_team_id] for f in fixtures], dtype=np.int32)
    fix_ph = np.array([f.p_home for f in fixtures], dtype=np.float64)
    fix_pd = np.array([f.p_draw for f in fixtures], dtype=np.float64)
    fix_pa = np.array([f.p_away for f in fixtures], dtype=np.float64)

    # Normalize fixture probabilities
    totals = fix_ph + fix_pd + fix_pa
    totals[totals <= 0] = 1.0
    fix_ph /= totals
    fix_pd /= totals
    fix_pa /= totals
    fix_thresh_h = fix_ph
    fix_thresh_d = fix_ph + fix_pd

    # Vectorized outcome simulation for all iterations: shape (iterations, M)
    u = rng.random(size=(iterations, M))
    home_win = u < fix_thresh_h
    draw = (u >= fix_thresh_h) & (u < fix_thresh_d)
    away_win = u >= fix_thresh_d

    # Accumulate simulated points, GD, and GF: shape (iterations, N)
    sim_pts = np.tile(initial_points, (iterations, 1))
    sim_gd = np.tile(initial_gd, (iterations, 1))
    sim_gf = np.tile(initial_gf, (iterations, 1))

    # Add points and goal margins per fixture
    # Points: H win (+3 H, +0 A), Draw (+1 H, +1 A), A win (+0 H, +3 A)
    for j in range(M):
        h = fix_h[j]
        a = fix_a[j]
        hw = home_win[:, j]
        dr = draw[:, j]
        aw = away_win[:, j]

        sim_pts[:, h] += hw * 3 + dr * 1
        sim_pts[:, a] += aw * 3 + dr * 1

        sim_gd[:, h] += hw * 1 - aw * 1
        sim_gd[:, a] += aw * 1 - hw * 1

        sim_gf[:, h] += hw * 2 + dr * 1 + aw * 1
        sim_gf[:, a] += aw * 2 + dr * 1 + hw * 1

    # Composite score for lexicographic sorting: points * 1e6 + gd * 1e3 + gf + tiebreaker
    tiebreakers = rng.random(size=(iterations, N))
    sort_keys = (
        sim_pts.astype(np.float64) * 1e6
        + sim_gd.astype(np.float64) * 1e3
        + sim_gf.astype(np.float64)
        + tiebreakers
    )

    # table_order[iter, rank] is team index ranked at position `rank` (0 = 1st, 1 = 2nd...)
    table_order = np.argsort(-sort_keys, axis=1)

    # Rank matrix: shape (N, N), counts how many times team i finished at rank k
    # We invert table_order: team_ranks[iter, team_idx] = rank (0..N-1)
    team_ranks = np.empty_like(table_order)
    rows = np.arange(iterations)[:, None]
    team_ranks[rows, table_order] = np.arange(N)[None, :]

    rank_matrix = np.zeros((N, N), dtype=np.float64)
    for i in range(N):
        counts = np.bincount(team_ranks[:, i], minlength=N)
        rank_matrix[i, :] = counts / iterations

    # Calculate champion count
    champion_counts = np.zeros(N, dtype=np.int32)
    is_ligamx = format_config.format == "ligamx"

    if is_ligamx and N >= 10:
        # Simulate Liga MX Play-In & Liguilla knockout bracket for each iteration
        top_direct = format_config.top_direct
        adv_tie = format_config.playoff_higher_seed_advances_on_tie

        for it in range(iterations):
            order = table_order[it]
            s7, s8, s9, s10 = order[6], order[7], order[8], order[9]

            # Play-In Match 1: 7 vs 8 (higher seed 7 has tiebreaker)
            d1 = elo_ratings[s7] - elo_ratings[s8] + (50.0 if adv_tie else 0.0)
            p1 = 1.0 / (1.0 + 10.0 ** (-d1 / 400.0))
            w1 = s7 if rng.random() < p1 else s8
            l1 = s8 if w1 == s7 else s7
            q_seed7 = w1

            # Play-In Match 2: 9 vs 10
            d2 = elo_ratings[s9] - elo_ratings[s10] + (50.0 if adv_tie else 0.0)
            p2 = 1.0 / (1.0 + 10.0 ** (-d2 / 400.0))
            w2 = s9 if rng.random() < p2 else s10

            # Play-In Match 3: l1 vs w2
            d3 = elo_ratings[l1] - elo_ratings[w2] + (50.0 if adv_tie else 0.0)
            p3 = 1.0 / (1.0 + 10.0 ** (-d3 / 400.0))
            q_seed8 = l1 if rng.random() < p3 else w2

            q_teams = [
                order[0], order[1], order[2], order[3],
                order[4], order[5], q_seed7, q_seed8,
            ]
            reg_rank = {team: r + 1 for r, team in enumerate(order)}

            # Quarterfinals: 1v8, 2v7, 3v6, 4v5
            semi_teams = []
            for tA, tB in [(q_teams[0], q_teams[7]), (q_teams[1], q_teams[6]),
                           (q_teams[2], q_teams[5]), (q_teams[3], q_teams[4])]:
                rA, rB = reg_rank[tA], reg_rank[tB]
                delta = elo_ratings[tA] - elo_ratings[tB] + (50.0 if adv_tie and rA < rB else -50.0)
                pA = 1.0 / (1.0 + 10.0 ** (-delta / 400.0))
                semi_teams.append(tA if rng.random() < pA else tB)

            # Re-seed semifinals by regular season rank
            semi_teams.sort(key=lambda t: reg_rank[t])

            # Semifinals: Best vs Worst, 2nd vs 3rd
            final_teams = []
            for tA, tB in [(semi_teams[0], semi_teams[3]), (semi_teams[1], semi_teams[2])]:
                rA, rB = reg_rank[tA], reg_rank[tB]
                delta = elo_ratings[tA] - elo_ratings[tB] + (50.0 if adv_tie and rA < rB else -50.0)
                pA = 1.0 / (1.0 + 10.0 ** (-delta / 400.0))
                final_teams.append(tA if rng.random() < pA else tB)

            # Final: no seed advantage in Liga MX final
            tA, tB = final_teams[0], final_teams[1]
            delta = elo_ratings[tA] - elo_ratings[tB]
            pA = 1.0 / (1.0 + 10.0 ** (-delta / 400.0))
            champ = tA if rng.random() < pA else tB
            champion_counts[champ] += 1
    else:
        # Standard European league: 1st place in standings is champion
        first_place_teams = table_order[:, 0]
        champ_bincount = np.bincount(first_place_teams, minlength=N)
        champion_counts = champ_bincount

    # Compute summaries
    top_direct = format_config.top_direct
    p_in_start = format_config.play_in_start
    p_in_end = format_config.play_in_end
    releg_spots = format_config.relegation_spots

    sim_mean_pts = sim_pts.mean(axis=0)
    sim_mean_rank = (team_ranks + 1).mean(axis=0)

    summaries = []
    for i, t in enumerate(standings):
        dist = rank_matrix[i, :].tolist()
        mode_r = int(np.argmax(rank_matrix[i, :])) + 1

        p_super = rank_matrix[i, 0]
        p_dir = float(np.sum(rank_matrix[i, :top_direct]))
        p_play = (
            float(np.sum(rank_matrix[i, p_in_start - 1 : p_in_end]))
            if p_in_start > 0 and p_in_end >= p_in_start
            else 0.0
        )
        p_rel = (
            float(np.sum(rank_matrix[i, N - releg_spots :]))
            if releg_spots > 0
            else 0.0
        )
        p_champ = float(champion_counts[i] / iterations)

        summaries.append(
            TeamProjectionSummary(
                team_id=t.team_id,
                team_name=t.team_name,
                current_points=t.points,
                current_rank=current_rank_map[t.team_id],
                xpts=analytical_xpts_map.get(t.team_id, float(t.points)),
                simulated_mean_points=float(sim_mean_pts[i]),
                projected_rank=float(sim_mean_rank[i]),
                mode_rank=mode_r,
                p_superlider=p_super,
                p_direct_playoff=p_dir,
                p_play_in=p_play,
                p_relegation=p_rel,
                p_champion=p_champ,
                rank_distribution=dist,
            )
        )

    summaries.sort(key=lambda s: s.projected_rank)
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    return SeasonMonteCarloResult(
        iterations=iterations,
        elapsed_ms=elapsed_ms,
        teams=summaries,
        rank_matrix=rank_matrix,
    )


# ---------------------------------------------------------------------------
# Backtesting & Evaluation against Ground Truth
# ---------------------------------------------------------------------------


def backtest_midseason(
    parquet_path: Path | str,
    div: str = "E0",
    season: str = "2023/24",
    cutoff_round: int = 28,
    iterations: int = 10_000,
    seed: int = 42,
) -> dict[str, object]:
    """Runs a retrospective mid-season backtest on historical league data."""
    path = Path(parquet_path)
    if not path.is_file():
        raise FileNotFoundError(f"Dataset no encontrado en {path}")

    # Load match records for this league and season
    cols = [
        "div", "season", "match_date", "home_team", "away_team",
        "home_goals", "away_goals", "result",
        "dc_prob_h", "dc_prob_d", "dc_prob_a",
        "elo_home", "elo_away",
    ]
    df = pd.read_parquet(path, columns=cols)
    league_df = df[(df["div"] == div) & (df["season"] == season)].copy()

    if len(league_df) == 0:
        raise ValueError(f"No se encontraron partidos para div={div}, season={season}")

    league_df = league_df.sort_values(by=["match_date", "home_team"]).reset_index(drop=True)

    # Ground truth final table after all matches
    final_standings = compute_standings_from_matches(league_df)
    sorted_final = sorted(
        final_standings.values(),
        key=lambda t: (t.points, t.goal_difference, t.goals_for),
        reverse=True,
    )
    ground_truth_rank = {t.team_id: r + 1 for r, t in enumerate(sorted_final)}
    ground_truth_pts = {t.team_id: t.points for t in sorted_final}

    # Split matches at cutoff: each team playing ~cutoff_round matches
    # In a 20-team league (E0), 28 rounds = 280 matches; in an 18-team league, 18*28/2
    teams_all = sorted(set(league_df["home_team"].unique()) | set(league_df["away_team"].unique()))
    num_teams = len(teams_all)
    matches_per_round = num_teams // 2
    cutoff_match_idx = min(len(league_df), cutoff_round * matches_per_round)

    past_matches = league_df.iloc[:cutoff_match_idx]
    future_matches = league_df.iloc[cutoff_match_idx:]

    mid_standings_map = compute_standings_from_matches(past_matches)
    for team_id in teams_all:
        if team_id not in mid_standings_map:
            mid_standings_map[team_id] = TeamStanding(team_id=team_id, team_name=team_id)

    mid_standings_list = [mid_standings_map[tid] for tid in sorted(teams_all)]

    scheduled_fixtures: list[ScheduledFixture] = []
    for idx, row in future_matches.iterrows():
        ph = float(row["dc_prob_h"]) if pd.notna(row["dc_prob_h"]) else 0.44
        pd_ = float(row["dc_prob_d"]) if pd.notna(row["dc_prob_d"]) else 0.26
        pa = float(row["dc_prob_a"]) if pd.notna(row["dc_prob_a"]) else 0.30
        scheduled_fixtures.append(
            ScheduledFixture(
                fixture_id=f"fix_{idx}",
                home_team_id=str(row["home_team"]),
                away_team_id=str(row["away_team"]),
                p_home=ph,
                p_draw=pd_,
                p_away=pa,
            )
        )

    # Format configuration
    top_direct = 4 if div in ("E0", "SP1", "D1", "I1") else 6
    releg_spots = 3 if div in ("E0", "SP1", "I1") else (2 if div == "D1" else 0)
    fmt = "ligamx" if div == "MEX" else "standard"

    format_config = LeagueFormatConfig(
        format=fmt,
        top_direct=top_direct,
        relegation_spots=releg_spots,
    )

    # Run Monte Carlo simulation
    sim_result = simulate_season_mc(
        standings=mid_standings_list,
        fixtures=scheduled_fixtures,
        format_config=format_config,
        iterations=iterations,
        seed=seed,
    )

    # Evaluate against ground truth
    xpts_errors = []
    rank_errors = []
    actual_ranks = []
    proj_ranks = []

    brier_champ_sum = 0.0
    brier_top4_sum = 0.0
    brier_releg_sum = 0.0

    eval_rows = []
    for team in sim_result.teams:
        act_rank = ground_truth_rank[team.team_id]
        act_pts = ground_truth_pts[team.team_id]
        proj_r = team.projected_rank
        xpts = team.xpts

        xpts_err = abs(xpts - act_pts)
        rank_err = abs(proj_r - act_rank)

        xpts_errors.append(xpts_err)
        rank_errors.append(rank_err)
        actual_ranks.append(act_rank)
        proj_ranks.append(proj_r)

        # Brier scores
        is_champ = 1.0 if act_rank == 1 else 0.0
        is_top4 = 1.0 if act_rank <= top_direct else 0.0
        is_releg = 1.0 if act_rank > num_teams - releg_spots else 0.0

        brier_champ_sum += (team.p_champion - is_champ) ** 2
        brier_top4_sum += (team.p_direct_playoff - is_top4) ** 2
        brier_releg_sum += (team.p_relegation - is_releg) ** 2

        eval_rows.append({
            "team": team.team_name,
            "mid_pts": team.current_points,
            "xpts": round(xpts, 1),
            "sim_pts": round(team.simulated_mean_points, 1),
            "act_pts": act_pts,
            "act_rank": act_rank,
            "proj_rank": round(proj_r, 1),
            "p_superlider": round(team.p_superlider * 100, 1),
            "p_top4": round(team.p_direct_playoff * 100, 1),
            "p_releg": round(team.p_relegation * 100, 1),
            "p_champ": round(team.p_champion * 100, 1),
        })

    # Metrics
    xpts_mae = float(np.mean(xpts_errors))
    xpts_rmse = float(np.sqrt(np.mean(np.array(xpts_errors) ** 2)))
    rank_mae = float(np.mean(rank_errors))

    # Spearman rank correlation
    rank_cov = np.cov(actual_ranks, proj_ranks)[0, 1]
    rank_std = np.std(actual_ranks) * np.std(proj_ranks)
    spearman_corr = float(rank_cov / rank_std) if rank_std > 0 else 1.0

    brier_champ = float(brier_champ_sum / num_teams)
    brier_top4 = float(brier_top4_sum / num_teams)
    brier_releg = float(brier_releg_sum / num_teams) if releg_spots > 0 else 0.0

    # Doubly stochastic verification
    row_sums = sim_result.rank_matrix.sum(axis=1)
    col_sums = sim_result.rank_matrix.sum(axis=0)
    is_doubly_stochastic = bool(
        np.allclose(row_sums, 1.0, atol=1e-6) and np.allclose(col_sums, 1.0, atol=1e-6)
    )

    report_dict = {
        "div": div,
        "season": season,
        "cutoff_round": cutoff_round,
        "matches_played": len(past_matches),
        "matches_remaining": len(future_matches),
        "iterations": iterations,
        "elapsed_ms": sim_result.elapsed_ms,
        "is_doubly_stochastic": is_doubly_stochastic,
        "xpts_mae": round(xpts_mae, 3),
        "xpts_rmse": round(xpts_rmse, 3),
        "rank_mae": round(rank_mae, 3),
        "spearman_corr": round(spearman_corr, 3),
        "brier_champion": round(brier_champ, 4),
        "brier_top4": round(brier_top4, 4),
        "brier_relegation": round(brier_releg, 4),
        "table": eval_rows,
    }

    return report_dict


def print_backtest_report(report: dict[str, object]) -> None:
    """Pretty prints the projection and backtest evaluation report."""
    div = report["div"]
    season = report["season"]
    cutoff = report["cutoff_round"]
    iters = report["iterations"]
    elapsed = report["elapsed_ms"]

    print("=" * 86)
    print(f" PitchLab Season Monte Carlo Projection · {div} ({season}) · Jornada {cutoff}")
    print(f" {iters:,} simulaciones en {elapsed:.1f}ms | Doble estocástica: {report['is_doubly_stochastic']}")
    print("=" * 86)

    header = f"{'# Pos':<6} {'Equipo':<18} {'Pts Mid':<8} {'xPts':<8} {'Pts Act':<8} {'Pos Proy':<9} {'Pos Act':<8} {'Superlider':<11} {'Top 4':<8} {'Descenso':<9}"
    print(header)
    print("-" * 86)

    table: list[dict] = report["table"]  # type: ignore
    for r in sorted(table, key=lambda x: x["proj_rank"]):
        line = (
            f"{r['act_rank']:<6} "
            f"{r['team']:<18} "
            f"{r['mid_pts']:<8} "
            f"{r['xpts']:<8.1f} "
            f"{r['act_pts']:<8} "
            f"{r['proj_rank']:<9.1f} "
            f"{r['act_rank']:<8} "
            f"{r['p_superlider']:>5.1f}%     "
            f"{r['p_top4']:>5.1f}%  "
            f"{r['p_releg']:>5.1f}%"
        )
        print(line)

    print("-" * 86)
    print(f" Métricas de Validación vs Resultado Real:")
    print(f"   • xPts MAE (error medio puntos):       {report['xpts_mae']} pts")
    print(f"   • xPts RMSE:                          {report['xpts_rmse']} pts")
    print(f"   • Error medio de posición (Rank MAE): {report['rank_mae']} posiciones")
    print(f"   • Correlación de Spearman (ranking):  {report['spearman_corr']:+.3f}")
    print(f"   • Brier Score Campeón:                {report['brier_champion']}")
    print(f"   • Brier Score Top 4:                  {report['brier_top4']}")
    print(f"   • Brier Score Descenso:               {report['brier_relegation']}")
    print("=" * 86)


# ---------------------------------------------------------------------------
# Self-Test / CLI Entrypoint
# ---------------------------------------------------------------------------


def run_self_test() -> None:
    """Validates Monte Carlo engine invariants and runs real league backtest."""
    print("[MonteCarlo] Iniciando auto-test del motor estocástico de proyecciones...")

    # 1. Test purely synthetic league with analytical invariants
    t1 = TeamStanding("T1", "Alpha FC", points=50, goal_difference=20, goals_for=40)
    t2 = TeamStanding("T2", "Beta FC", points=48, goal_difference=15, goals_for=35)
    t3 = TeamStanding("T3", "Gamma FC", points=42, goal_difference=5, goals_for=25)
    t4 = TeamStanding("T4", "Delta FC", points=30, goal_difference=-5, goals_for=20)
    standings = [t1, t2, t3, t4]

    fixtures = [
        ScheduledFixture("f1", "T1", "T2", p_home=0.50, p_draw=0.28, p_away=0.22),
        ScheduledFixture("f2", "T3", "T4", p_home=0.55, p_draw=0.25, p_away=0.20),
    ]

    res = simulate_season_mc(standings, fixtures, iterations=10_000, seed=123)
    assert res.iterations == 10_000, "Iterations mismatch"
    assert res.elapsed_ms < 50.0, f"Simulación demasiado lenta: {res.elapsed_ms}ms"

    # Doubly stochastic invariant
    assert np.allclose(res.rank_matrix.sum(axis=1), 1.0, atol=1e-6), "Row sums must be 1.0"
    assert np.allclose(res.rank_matrix.sum(axis=0), 1.0, atol=1e-6), "Col sums must be 1.0"

    # Analytical xPts agreement
    for team in res.teams:
        diff = abs(team.simulated_mean_points - team.xpts)
        assert diff < 0.05, f"xPts diff too large: {diff} for {team.team_name}"

    print(" ✓ Invariantes matemáticos verificados (Doble estocástica y xPts analytical agreement)")

    # 2. Backtest against features.parquet
    candidates = [
        Path("research/prediction-lab/data/processed/features.parquet"),
        Path(__file__).resolve().parent.parent / "data" / "processed" / "features.parquet",
        Path("data/processed/features.parquet"),
    ]
    parquet_path = next((p for p in candidates if p.is_file()), None)

    if parquet_path:
        print(f" ✓ Parquet encontrado en {parquet_path}. Ejecutando backtest Premier League E0 (2023/24)...")
        report = backtest_midseason(
            parquet_path=parquet_path,
            div="E0",
            season="2023/24",
            cutoff_round=28,
            iterations=10_000,
            seed=42,
        )
        print_backtest_report(report)

        assert report["is_doubly_stochastic"] is True
        assert report["xpts_mae"] < 6.0, f"MAE unexpected: {report['xpts_mae']}"
        assert report["spearman_corr"] > 0.85, f"Spearman corr too low: {report['spearman_corr']}"
        print(" ✓ Backtest completado exitosamente con alta precisión y calibración!")
    else:
        print(" [Aviso] features.parquet no encontrado en rutas esperadas; omitiendo backtest sobre dataset.")

    print("\n[OK] Todos los tests del motor Monte Carlo completados con éxito.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PitchLab Season Monte Carlo Engine")
    parser.add_argument("--test", action="store_true", help="Run self-test suite")
    parser.add_argument("--div", default="E0", help="Division code (e.g. E0, SP1, MEX)")
    parser.add_argument("--season", default="2023/24", help="Season (e.g. 2023/24)")
    parser.add_argument("--cutoff", type=int, default=28, help="Cutoff matchday/round")
    parser.add_argument("--iterations", type=int, default=10_000, help="Number of Monte Carlo simulations")
    parser.add_argument("--seed", type=int, default=42, help="PRNG seed")
    parser.add_argument("--parquet", default="", help="Path to features.parquet")

    args = parser.parse_args()

    if args.test or len(sys.argv) == 1:
        run_self_test()
    else:
        parquet_file = args.parquet or "research/prediction-lab/data/processed/features.parquet"
        rep = backtest_midseason(
            parquet_path=parquet_file,
            div=args.div,
            season=args.season,
            cutoff_round=args.cutoff,
            iterations=args.iterations,
            seed=args.seed,
        )
        print_backtest_report(rep)
