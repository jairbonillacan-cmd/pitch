"""
Comprehensive verification and integrity certification of all 5 generated datasets:
1. data/history/nfl-situational-features.parquet
2. data/history/nfl-situational-features.jsonl
3. data/history/research/liga-mx-enriched.jsonl
4. data/history/soccer-situational-features.parquet
5. data/history/soccer-situational-features.jsonl

Checks performed:
- Physical existence, size on disk (bytes and MB)
- Row and column counts, parquet vs jsonl parity
- Zero ID collisions across all datasets
- Zero null values in Liga MX shots (shotsHome, shotsAway)
- Bet365 odds validation (over25/under25 strictly when overUnder == 2.5)
- NFL QB career passing prior history recovery in 2025 and 2026 (resolving 0% issue)
"""

import duckdb
import json
import sys
from pathlib import Path

# Ensure UTF-8 output even on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

REPO_ROOT = Path(".").resolve()

DATASETS = [
    {
        "name": "NFL Situational Features (Parquet)",
        "path": REPO_ROOT / "data" / "history" / "nfl-situational-features.parquet",
        "format": "parquet",
        "domain": "nfl",
    },
    {
        "name": "NFL Situational Features (JSONL)",
        "path": REPO_ROOT / "data" / "history" / "nfl-situational-features.jsonl",
        "format": "jsonl",
        "domain": "nfl",
    },
    {
        "name": "Liga MX Enriched (JSONL)",
        "path": REPO_ROOT / "data" / "history" / "research" / "liga-mx-enriched.jsonl",
        "format": "jsonl",
        "domain": "liga-mx",
    },
    {
        "name": "European Soccer Situational (Parquet)",
        "path": REPO_ROOT / "data" / "history" / "soccer-situational-features.parquet",
        "format": "parquet",
        "domain": "soccer",
    },
    {
        "name": "European Soccer Situational (JSONL)",
        "path": REPO_ROOT / "data" / "history" / "soccer-situational-features.jsonl",
        "format": "jsonl",
        "domain": "soccer",
    },
]

con = duckdb.connect()

def run_verification():
    print("=" * 70)
    print("DATASET INTEGRITY & QUALITY AUDIT")
    print("=" * 70)

    results = {}
    all_passed = True

    # 1. File Inspection & Schema Metrics
    print("\n--- Phase 1: Physical File & Schema Inspection ---")
    for ds in DATASETS:
        p = ds["path"]
        name = ds["name"]
        fmt = ds["format"]
        exists = p.exists()
        size_bytes = p.stat().st_size if exists else 0
        size_mb = round(size_bytes / (1024 * 1024), 2)
        rel_path = str(p.relative_to(REPO_ROOT)).replace("\\", "/")

        if not exists:
            print(f"[MISSING] {name} at {rel_path}")
            all_passed = False
            results[name] = {"exists": False, "rel_path": rel_path}
            continue

        sql_path = str(p).replace("\\", "/")
        if fmt == "parquet":
            row_count = con.execute(f"SELECT count(*) FROM '{sql_path}'").fetchone()[0]
            cur = con.execute(f"SELECT * FROM '{sql_path}' LIMIT 1")
            cols = [c[0] for c in cur.description]
        else:
            row_count = con.execute(f"SELECT count(*) FROM read_json_auto('{sql_path}')").fetchone()[0]
            cur = con.execute(f"SELECT * FROM read_json_auto('{sql_path}') LIMIT 1")
            cols = [c[0] for c in cur.description]

        results[name] = {
            "exists": True,
            "rel_path": rel_path,
            "size_bytes": size_bytes,
            "size_mb": size_mb,
            "row_count": row_count,
            "col_count": len(cols),
            "columns": cols,
        }
        print(f"[OK] {name}: {row_count:,} rows, {len(cols)} cols, {size_mb} MB")

    # 2. Domain-Specific Deep Integrity Audits
    print("\n--- Phase 2: Domain Integrity Audits ---")

    # Liga MX Audit
    print("Checking Liga MX Dataset integrity...")
    lmx_path = str((REPO_ROOT / "data" / "history" / "research" / "liga-mx-enriched.jsonl")).replace("\\", "/")
    lmx_stats = con.execute(f"""
        SELECT 
            count(*) AS total,
            count(DISTINCT id) AS distinct_ids,
            count(CASE WHEN stats.shotsHome IS NULL THEN 1 END) AS null_shots_home,
            count(CASE WHEN stats.shotsAway IS NULL THEN 1 END) AS null_shots_away,
            count(CASE WHEN venue.altitude_m IS NOT NULL THEN 1 END) AS venues_with_alt,
            count(CASE WHEN odds.over25 IS NOT NULL THEN 1 END) AS odds_with_over25,
            count(CASE WHEN odds.under25 IS NOT NULL THEN 1 END) AS odds_with_under25,
            count(CASE WHEN odds.over25 IS NOT NULL AND odds.overUnder != 2.5 THEN 1 END) AS invalid_over25_lines,
            count(CASE WHEN odds.under25 IS NOT NULL AND odds.overUnder != 2.5 THEN 1 END) AS invalid_under25_lines,
            count(CASE WHEN odds.home IS NOT NULL AND odds.away IS NOT NULL THEN 1 END) AS odds_with_1x2,
            count(CASE WHEN attendance IS NOT NULL THEN 1 END) AS with_attendance,
            count(CASE WHEN stats.accuratePassesHome IS NOT NULL THEN 1 END) AS with_tactical_stats
        FROM read_json_auto('{lmx_path}')
    """).fetchone()

    lmx_total = lmx_stats[0]
    lmx_distinct_ids = lmx_stats[1]
    lmx_null_shots_h = lmx_stats[2]
    lmx_null_shots_a = lmx_stats[3]
    lmx_venues_alt = lmx_stats[4]
    lmx_odds_over25 = lmx_stats[5]
    lmx_odds_under25 = lmx_stats[6]
    lmx_invalid_over25 = lmx_stats[7]
    lmx_invalid_under25 = lmx_stats[8]
    lmx_odds_1x2 = lmx_stats[9]
    lmx_attendance = lmx_stats[10]
    lmx_tactical = lmx_stats[11]

    id_collisions = lmx_total - lmx_distinct_ids
    print(f"  Liga MX Total Matches: {lmx_total}")
    print(f"  Liga MX ID Collisions: {id_collisions} (Target: 0)")
    print(f"  Liga MX Shots Nulls: Home={lmx_null_shots_h}, Away={lmx_null_shots_a} (Target: 0)")
    print(f"  Liga MX Venues with Altitude: {lmx_venues_alt}/{lmx_total} ({round(lmx_venues_alt*100/lmx_total, 1)}%)")
    print(f"  Liga MX Valid Bet365 O/U 2.5 lines: over25={lmx_odds_over25}, under25={lmx_odds_under25}")
    print(f"  Liga MX Invalid non-2.5 lines: over25={lmx_invalid_over25}, under25={lmx_invalid_under25} (Target: 0)")
    print(f"  Liga MX 1X2 Odds: {lmx_odds_1x2}/{lmx_total} ({round(lmx_odds_1x2*100/lmx_total, 1)}%)")
    print(f"  Liga MX Attendance populated: {lmx_attendance}/{lmx_total} ({round(lmx_attendance*100/lmx_total, 1)}%)")
    print(f"  Liga MX Tactical Stats suite: {lmx_tactical}/{lmx_total} ({round(lmx_tactical*100/lmx_total, 1)}%)")

    if id_collisions > 0:
        print(f"[FAIL] Liga MX has {id_collisions} ID collisions!")
        all_passed = False
    else:
        print("[PASS] Liga MX 0 ID collisions verified.")

    if lmx_null_shots_h > 0 or lmx_null_shots_a > 0:
        print(f"[FAIL] Liga MX has null shots: home={lmx_null_shots_h}, away={lmx_null_shots_a}!")
        all_passed = False
    else:
        print("[PASS] Liga MX 0 shot nulls verified.")

    if lmx_venues_alt < lmx_total:
        print(f"[FAIL] Liga MX venues missing altitude: {lmx_total - lmx_venues_alt}!")
        all_passed = False
    else:
        print("[PASS] Liga MX 100% venue altitude coverage verified.")

    if lmx_invalid_over25 > 0 or lmx_invalid_under25 > 0:
        print(f"[FAIL] Liga MX invalid Bet365 O/U lines: over25={lmx_invalid_over25}, under25={lmx_invalid_under25}!")
        all_passed = False
    else:
        print("[PASS] Liga MX Bet365 O/U 2.5 line isolation certified.")

    if lmx_tactical < lmx_total:
        print(f"[FAIL] Liga MX tactical stats missing in {lmx_total - lmx_tactical} matches!")
        all_passed = False
    else:
        print("[PASS] Liga MX full tactical stats suite certified.")

    # NFL Situational Audit
    print("\nChecking NFL Situational Dataset integrity...")
    nfl_path = str((REPO_ROOT / "data" / "history" / "nfl-situational-features.parquet")).replace("\\", "/")
    nfl_qb_stats = con.execute(f"""
        SELECT 
            season,
            count(*) AS games,
            count(CASE WHEN home_qb_prior_attempts > 0 THEN 1 END) AS home_qbs_with_prior,
            count(CASE WHEN away_qb_prior_attempts > 0 THEN 1 END) AS away_qbs_with_prior,
            ROUND(avg(home_qb_prior_attempts), 1) AS avg_home_att,
            ROUND(avg(away_qb_prior_attempts), 1) AS avg_away_att,
            ROUND(avg(home_qb_shrunk_epa_per_att), 4) AS avg_home_shrunk_epa,
            ROUND(avg(away_qb_shrunk_epa_per_att), 4) AS avg_away_shrunk_epa
        FROM '{nfl_path}'
        WHERE season >= 2024
        GROUP BY season
        ORDER BY season
    """).fetchall()

    for s, games, h_priors, a_priors, h_att, a_att, h_epa, a_epa in nfl_qb_stats:
        h_cov = round(h_priors * 100.0 / games, 1)
        a_cov = round(a_priors * 100.0 / games, 1)
        print(f"  Season {s}: {games} games")
        print(f"    Home QBs with prior: {h_priors}/{games} ({h_cov}%), avg att={h_att}, avg shrunk EPA={h_epa}")
        print(f"    Away QBs with prior: {a_priors}/{games} ({a_cov}%), avg att={a_att}, avg shrunk EPA={a_epa}")
        if s in (2025, 2026) and (h_cov < 95.0 or a_cov < 95.0):
            print(f"[FAIL] Season {s} QB prior coverage is too low: home={h_cov}%, away={a_cov}% (expected >= 95%)!")
            all_passed = False
        elif s in (2025, 2026):
            print(f"[PASS] Season {s} QB passing history recovery certified (Home: {h_cov}%, Away: {a_cov}%).")

    # European Soccer Situational Audit
    print("\nChecking European Soccer Situational Dataset integrity...")
    soc_path = str((REPO_ROOT / "data" / "history" / "soccer-situational-features.parquet")).replace("\\", "/")
    soc_stats = con.execute(f"""
        SELECT 
            count(*) AS total,
            count(DISTINCT id) AS distinct_ids,
            count(CASE WHEN proxy_xg_home IS NOT NULL AND proxy_xg_away IS NOT NULL THEN 1 END) AS proxy_xg_populated,
            count(CASE WHEN home_rolling5_proxy_xg_for IS NOT NULL THEN 1 END) AS rolling_populated,
            count(CASE WHEN implied_prob_home IS NOT NULL AND (implied_prob_home < 0.0 OR implied_prob_home > 1.0) THEN 1 END) AS invalid_home_prob,
            count(CASE WHEN implied_prob_away IS NOT NULL AND (implied_prob_away < 0.0 OR implied_prob_away > 1.0) THEN 1 END) AS invalid_away_prob
        FROM '{soc_path}'
    """).fetchone()

    soc_total = soc_stats[0]
    soc_distinct_ids = soc_stats[1]
    soc_xg_pop = soc_stats[2]
    soc_roll_pop = soc_stats[3]
    soc_invalid_hp = soc_stats[4]
    soc_invalid_ap = soc_stats[5]

    soc_id_collisions = soc_total - soc_distinct_ids
    print(f"  European Soccer Total Matches: {soc_total}")
    print(f"  European Soccer ID Collisions: {soc_id_collisions} (Target: 0)")
    print(f"  Proxy xG Populated: {soc_xg_pop}/{soc_total} ({round(soc_xg_pop*100/soc_total, 1)}%)")
    print(f"  Rolling 5 Populated: {soc_roll_pop}/{soc_total} ({round(soc_roll_pop*100/soc_total, 1)}%)")
    print(f"  Invalid Implied Probs: home={soc_invalid_hp}, away={soc_invalid_ap} (Target: 0)")

    if soc_id_collisions > 0:
        print(f"[FAIL] European Soccer has {soc_id_collisions} ID collisions!")
        all_passed = False
    else:
        print("[PASS] European Soccer 0 ID collisions verified.")

    if soc_invalid_hp > 0 or soc_invalid_ap > 0:
        print(f"[FAIL] European Soccer has invalid implied probabilities outside [0, 1]!")
        all_passed = False
    else:
        print("[PASS] European Soccer implied probabilities validated.")

    # Parquet vs JSONL row and column parity
    print("\n--- Phase 3: Parquet vs JSONL Parity Audits ---")
    nfl_pq_rows = results["NFL Situational Features (Parquet)"]["row_count"]
    nfl_jl_rows = results["NFL Situational Features (JSONL)"]["row_count"]
    nfl_pq_cols = results["NFL Situational Features (Parquet)"]["col_count"]
    nfl_jl_cols = results["NFL Situational Features (JSONL)"]["col_count"]

    soc_pq_rows = results["European Soccer Situational (Parquet)"]["row_count"]
    soc_jl_rows = results["European Soccer Situational (JSONL)"]["row_count"]
    soc_pq_cols = results["European Soccer Situational (Parquet)"]["col_count"]
    soc_jl_cols = results["European Soccer Situational (JSONL)"]["col_count"]

    if nfl_pq_rows != nfl_jl_rows or nfl_pq_cols != nfl_jl_cols:
        print(f"[FAIL] NFL parity mismatch: rows ({nfl_pq_rows} vs {nfl_jl_rows}), cols ({nfl_pq_cols} vs {nfl_jl_cols})!")
        all_passed = False
    else:
        print(f"[PASS] NFL Parquet and JSONL full parity certified: {nfl_pq_rows:,} rows, {nfl_pq_cols} cols.")

    if soc_pq_rows != soc_jl_rows or soc_pq_cols != soc_jl_cols:
        print(f"[FAIL] Soccer parity mismatch: rows ({soc_pq_rows} vs {soc_jl_rows}), cols ({soc_pq_cols} vs {soc_jl_cols})!")
        all_passed = False
    else:
        print(f"[PASS] Soccer Parquet and JSONL full parity certified: {soc_pq_rows:,} rows, {soc_pq_cols} cols.")

    print("\n" + "=" * 70)
    if all_passed:
        print("FINAL CERTIFICATION: ALL 5 DATASETS FULLY VALIDATED AND INTEGRITY CERTIFIED (100% PASSED)")
        print("=" * 70)
        return 0
    else:
        print("FINAL CERTIFICATION: ONE OR MORE INTEGRITY CHECKS FAILED")
        print("=" * 70)
        return 1

if __name__ == "__main__":
    code = run_verification()
    sys.exit(code)
