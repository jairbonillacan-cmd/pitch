"""Unit tests for RosettaStatiskicks evidence and identifier integration."""

import os
import unittest
from pathlib import Path

# Ensure prediction-lab research root is on sys.path
import sys
research_root = Path(__file__).resolve().parents[2]
if str(research_root) not in sys.path:
    sys.path.insert(0, str(research_root))

from etl.rosetta_statiskicks import (
    RosettaStatiskicks,
    get_rosetta,
    resolve_league,
    get_division_code,
    get_opta_competition_uuid,
    get_api_football_league_id,
    get_active_tmcl,
    resolve_team,
    normalize_team_name,
    get_opta_attribute,
    list_attributes_by_category,
    is_lower_better,
    is_higher_better,
    extract_rolling_xg_series,
    extract_profile_percentiles,
)


class TestRosettaLeagueResolution(unittest.TestCase):
    """Test resolution across Opta UUIDs, API-Football IDs, and division codes."""

    def setUp(self):
        self.rosetta = get_rosetta()

    def test_total_leagues_count(self):
        """Verify that exactly 40 leagues are loaded and indexed."""
        leagues = self.rosetta.list_leagues()
        self.assertEqual(len(leagues), 40)
        for lg in leagues:
            self.assertIn("opta_competition_uuid", lg)
            self.assertIn("name", lg)
            self.assertIn(len(lg["opta_competition_uuid"]), (24, 25))

    def test_twenty_core_divisions_mapping(self):
        """Verify the 20 primary division code to API-Football and Opta mappings."""
        expected_mappings = [
            (39, "E0", "2kwbbcootiqqgmrzs6o5inle5", "Premier League"),
            (40, "E1", "7ntvbsyq31jnzoqoa8850b9b8", "Championship"),
            (140, "SP1", "34pl8szyvrbwcmfkuocjm3r6t", "Primera División"),
            (141, "SP2", "3is4bkgf3loxv9qfg3hm8zfqb", "Segunda División"),
            (135, "I1", "1r097lpxe0xn03ihb7wi98kao", "Serie A"),
            (136, "I2", "8ey0ww2zsosdmwr8ehsorh6t7", "Serie B"),
            (78, "D1", "6by3h89i2eykc341oz7lv1ddd", "Bundesliga"),
            (79, "D2", "722fdbecxzcq9788l6jqclzlw", "2. Bundesliga"),
            (61, "F1", "dm5ka0os1e3dxcp3vh05kmp33", "Ligue 1"),
            (62, "F2", None, "Ligue 2"),
            (88, "N1", "akmkihra9ruad09ljapsm84b3", "Eredivisie"),
            (94, "P1", "8yi6ejjd1zudcqtbn07haahg6", "Primeira Liga"),
            (144, "B1", "4zwgbb66rif2spcoeeol2motx", "First Division A"),
            (203, "T1", "482ofyysbdbeoxauk19yg7tdt", "Süper Lig"),
            (197, "G1", "c0r21rtokgnbtc0o2rldjmkxu", "Super League 1"),
            (179, "SC0", "e21cf135btr8t3upw0vl6n6x0", "Premiership"),
            (262, "MEX", "2hsidwomhjsaaytdy9u5niyi4", "Liga MX"),
            (128, "ARG", "581t4mywybx21wcpmpykhyzr3", "Liga Profesional Argentina"),
            (71, "BRA", "scf9p4y91yjvqvg5jndxzhxj", "Serie A"),
            (253, "USA", "287tckirbfj9nb8ar2k9r60vn", "MLS"),
        ]

        for api_id, div_code, opta_uuid, name in expected_mappings:
            # 1. Test get_division_code by API ID
            self.assertEqual(get_division_code(api_id), div_code, f"Failed div code for api_id {api_id}")

            # 2. Test reverse lookup by division code
            lg_by_div = resolve_league(div_code)
            if lg_by_div is not None:
                self.assertEqual(lg_by_div["api_football_league_id"], api_id)
                if opta_uuid:
                    self.assertEqual(lg_by_div["opta_competition_uuid"], opta_uuid)

            # 3. Test lookup by Opta UUID
            if opta_uuid:
                lg_by_opta = resolve_league(opta_uuid)
                self.assertIsNotNone(lg_by_opta, f"Failed lookup by opta_uuid {opta_uuid}")
                self.assertEqual(lg_by_opta["api_football_league_id"], api_id)
                self.assertEqual(get_division_code(opta_uuid), div_code)

    def test_tournament_calendar_tmcl_resolution(self):
        """Verify active tournamentCalendar (season_tmcl) UUID resolution."""
        # Liga MX 2026/2027
        lg_mx = resolve_league("9zum4nxferygj8bb0ldcavxn8")
        self.assertIsNotNone(lg_mx)
        self.assertEqual(lg_mx["opta_competition_uuid"], "2hsidwomhjsaaytdy9u5niyi4")
        self.assertEqual(lg_mx["division_code"], "MEX")
        self.assertEqual(lg_mx["api_football_league_id"], 262)
        self.assertEqual(get_division_code("9zum4nxferygj8bb0ldcavxn8"), "MEX")

        # Liga MX 2025/2026
        lg_mx_prev = resolve_league("aegyls91smdw9kipjgbsu8tn8")
        self.assertIsNotNone(lg_mx_prev)
        self.assertEqual(lg_mx_prev["opta_competition_uuid"], "2hsidwomhjsaaytdy9u5niyi4")

        # MLS 2026
        lg_mls = resolve_league("6i6n0jkbh9zzij6s8htfjh2j8")
        self.assertIsNotNone(lg_mls)
        self.assertEqual(lg_mls["opta_competition_uuid"], "287tckirbfj9nb8ar2k9r60vn")
        self.assertEqual(lg_mls["division_code"], "USA")

        # Reverse get_active_tmcl
        self.assertEqual(get_active_tmcl("MEX"), "9zum4nxferygj8bb0ldcavxn8")

    def test_invalid_league_handling(self):
        """Verify that unknown identifiers return None gracefully."""
        self.assertIsNone(resolve_league("non_existent_uuid_1234567"))
        self.assertIsNone(resolve_league(9999999))
        self.assertIsNone(resolve_league(None))
        self.assertIsNone(get_division_code(None))


class TestRosettaTeamResolution(unittest.TestCase):
    """Test team entity resolution across Opta UUIDs, API-Football IDs, and names."""

    def setUp(self):
        self.rosetta = get_rosetta()

    def test_total_teams_count(self):
        """Verify that exactly 19 teams are loaded and indexed."""
        teams = self.rosetta.list_teams()
        self.assertEqual(len(teams), 19)

    def test_team_america_resolution(self):
        """Test resolution of Club América by all aliases and identifiers."""
        opta_uuid = "eu8c408f59yx7egaqossbv25e"
        api_id = 2287

        # By UUID
        t1 = resolve_team(opta_uuid)
        self.assertIsNotNone(t1)
        self.assertEqual(t1["slug"], "club-america")
        self.assertEqual(t1["api_football_team_id"], api_id)

        # By API-Football ID
        t2 = resolve_team(api_id)
        self.assertIsNotNone(t2)
        self.assertEqual(t2["opta_team_uuid"], opta_uuid)

        # By string API ID
        t3 = resolve_team(str(api_id))
        self.assertEqual(t3["slug"], "club-america")

        # By slug
        t4 = resolve_team("club-america")
        self.assertEqual(t4["opta_team_uuid"], opta_uuid)

        # By common aliases
        for alias in ["Club América", "América", "America", "CF America", "Aguilas"]:
            t_alias = resolve_team(alias)
            self.assertIsNotNone(t_alias, f"Failed resolving alias '{alias}'")
            self.assertEqual(t_alias["slug"], "club-america")

    def test_pumas_and_guadalajara_resolution(self):
        """Test resolution of Pumas UNAM and Chivas Guadalajara."""
        # Pumas
        pumas = resolve_team("pumas-unam")
        self.assertEqual(pumas["api_football_team_id"], 2286)
        self.assertEqual(pumas["opta_team_uuid"], "ayabrorjqa1bj7jk1fdqu1t57")
        self.assertEqual(resolve_team("UNAM")["slug"], "pumas-unam")

        # Guadalajara / Chivas
        chivas = resolve_team("Chivas")
        self.assertIsNotNone(chivas)
        self.assertEqual(chivas["slug"], "guadalajara")
        self.assertEqual(chivas["api_football_team_id"], 2278)
        self.assertEqual(chivas["opta_team_uuid"], "e603sojy77s4u0ypqds2v2a1g")

    def test_inter_miami_resolution(self):
        """Test MLS club Inter Miami CF resolution."""
        miami = resolve_team("Inter Miami")
        self.assertIsNotNone(miami)
        self.assertEqual(miami["slug"], "inter-miami")
        self.assertEqual(miami["api_football_team_id"], 9568)
        self.assertEqual(miami["opta_team_uuid"], "7a7uyvix8axi28h7d3bwl4tbe")

    def test_normalization_helper(self):
        """Test normalize_team_name helper."""
        self.assertEqual(normalize_team_name("Club América"), "club-america")
        self.assertEqual(normalize_team_name("Chivas"), "guadalajara")
        self.assertEqual(normalize_team_name("Inter Miami"), "inter-miami")


class TestRosettaAttributesCatalog(unittest.TestCase):
    """Test Opta 177 attributes catalog and polarity classification."""

    def setUp(self):
        self.rosetta = get_rosetta()

    def test_categories_and_count(self):
        """Verify catalog contains 13 categories and all 177 attributes."""
        cats = self.rosetta.list_categories()
        self.assertEqual(len(cats), 13)
        self.assertIn("Finalización", cats)
        self.assertIn("Creación", cats)
        self.assertIn("Defensa", cats)
        self.assertIn("Portero", cats)
        self.assertIn("Disciplina", cats)

        total_attrs = sum(len(self.rosetta.list_attributes_by_category(c)) for c in cats)
        self.assertEqual(total_attrs, 177)

    def test_attribute_lookup(self):
        """Test attribute retrieval by key, label, and normalized slug."""
        # By exact English key
        a1 = get_opta_attribute("Expected Assists")
        self.assertIsNotNone(a1)
        self.assertEqual(a1["label"], "Asistencias esperadas (xA)")
        self.assertEqual(a1["category"], "Creación")
        self.assertTrue(a1["higher_is_better"])
        self.assertFalse(a1["lower_is_better"])

        # By Spanish label
        a2 = get_opta_attribute("Asistencias esperadas (xA)")
        self.assertEqual(a2["key"], "Expected Assists")

        # By slug
        a3 = get_opta_attribute("expected_assists")
        self.assertEqual(a3["key"], "Expected Assists")

    def test_polarity_classification(self):
        """Verify polarity classification for positive vs negative metrics."""
        # Lower is better (defensive, errors, cards, fouls, PPDA)
        lower_cases = [
            "PPDA",
            "ppda",
            "Errors Leading to Goal",
            "errorleadtogoal",
            "Total Fouls Conceded",
            "fouls_per_match",
            "Yellow Cards",
            "yellow_cards_per_match",
            "Straight Red Cards",
            "red_cards_per_match",
            "Penalties Conceded",
            "penalties_conceded",
            "Expected Goals Conceded",
            "open_play_expected_goals_conceded",
            "goals_conceded_per_match",
            "Own Goal Scored",
            "own_goals_conceded",
            "Tackles Lost",
            "Possession Loss Rate",
            "possession_loss_rate",
            "counter_exposure",
        ]
        for metric in lower_cases:
            self.assertTrue(is_lower_better(metric), f"Expected {metric} to be lower_is_better")
            self.assertFalse(is_higher_better(metric), f"Expected {metric} NOT to be higher_is_better")

        # Higher is better (attacking, creation, passing, goalkeeping saves)
        higher_cases = [
            "Goals",
            "goals_per_match",
            "Expected Assists",
            "expected_goals_openplay",
            "expected_threat",
            "Passes Completed",
            "pass_accuracy",
            "Aerial Duels Won",
            "aerial_duels_won",
            "Recoveries",
            "recoveries_per_match",
            "Interceptions",
            "interceptions_per_match",
            "Clean Sheets",
            "clean_sheet_rate",
            "skore",
        ]
        for metric in higher_cases:
            self.assertTrue(is_higher_better(metric), f"Expected {metric} to be higher_is_better")
            self.assertFalse(is_lower_better(metric), f"Expected {metric} NOT to be lower_is_better")


class TestRosettaRollingXG(unittest.TestCase):
    """Test rolling xG series and manager changes extraction."""

    def test_series_extraction(self):
        res = extract_rolling_xg_series()
        self.assertEqual(res["status"], "ready")
        self.assertEqual(res["window"], 5)
        self.assertEqual(res["matches_count"], 54)
        self.assertEqual(res["first_season"], "2025/2026")

        # Coach changes
        coach_changes = res["coach_changes"]
        self.assertEqual(len(coach_changes), 1)
        self.assertEqual(coach_changes[0]["index"], 38)
        self.assertEqual(coach_changes[0]["manager"], "Guillermo Almada")

        # Stints
        stints = {s["manager"]: s for s in res["stints"]}
        self.assertIn("André Jardine", stints)
        self.assertIn("Guillermo Almada", stints)
        self.assertEqual(stints["André Jardine"]["matches"], 37)
        self.assertEqual(stints["Guillermo Almada"]["matches"], 16)
        self.assertGreater(stints["Guillermo Almada"]["mean_xg"], 0.0)


class TestRosettaProfilePercentiles(unittest.TestCase):
    """Test 7-axis team performance percentiles extraction."""

    def test_profile_extraction(self):
        res = extract_profile_percentiles()
        self.assertEqual(res["status"], "ready")
        self.assertTrue(res["available"])
        self.assertEqual(res["sample"]["population"], 18)

        # Core 7 Axes
        core_7 = res["core_7_axes"]
        self.assertEqual(len(core_7), 7)
        expected_axes = [
            "finalizacion",
            "generacion",
            "progresion",
            "circulacion",
            "solidez_defensiva",
            "duelos",
            "recuperacion",
        ]
        for ax in expected_axes:
            self.assertIn(ax, core_7)
            self.assertIn("mean_percentile", core_7[ax])
            self.assertGreaterEqual(core_7[ax]["mean_percentile"], 0.0)
            self.assertLessEqual(core_7[ax]["mean_percentile"], 100.0)

        # Default 7 traits from attribute charts
        default_7 = res["default_7_traits"]
        self.assertEqual(len(default_7), 7)
        self.assertIn("expected_goals_openplay", default_7)
        self.assertIn("expected_assists", default_7)
        self.assertIn("expected_threat", default_7)
        self.assertIn("possession_percentage", default_7)
        self.assertIn("ppda", default_7)
        self.assertIn("open_play_expected_goals_conceded", default_7)
        self.assertIn("aerial_duels_won", default_7)

        # Verify PPDA polarity in default traits
        self.assertTrue(default_7["ppda"]["lower_is_better"])

        # Tactical identity phases
        phases = res["phases"]
        self.assertEqual(len(phases), 4)
        total_traits = sum(len(p.get("traits", [])) for p in phases)
        self.assertEqual(total_traits, 10)


if __name__ == "__main__":
    unittest.main()
