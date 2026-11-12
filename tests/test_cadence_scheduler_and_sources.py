"""Suite unitaria e integración de paridad para `cadence_scheduler.py` y `scrapers/sources/*` (`v3.2` · `B3`)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import random
import subprocess
import sys
from typing import Any, Mapping

import pytest

WORKTREE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKTREE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKTREE_ROOT))

from scrapers.cadence_scheduler import (  # noqa: E402
    CadenceScheduler,
    DEFAULT_STALE_LINES_CONFIG_PATH,
    append_validated_ticks_jsonl,
    classify_event_regime,
    load_all_timeseries_rows,
    load_cadence_regimes_readonly,
)
from scrapers.sources import (  # noqa: E402
    AUDITED_SOURCES_METADATA,
    AntiBotChallengeError,
    BetfairExchangeAdapter,
    CleanScraplingHttpTransport,
    CodereAdapter,
    ExponentialBackoffPolicy,
    HttpResponseData,
    MissingCredentialsError,
    PerSourceRateLimiter,
    RobotsDisallowedError,
    RobotsTxtPolicy,
    SmarketsApiV3Adapter,
    SourceBlockedError,
    TIMESERIES_JSONL_COLUMNS,
    TheOddsApiAdapter,
    build_active_source_adapters,
    build_all_registered_adapters,
    build_canonical_event_id,
    parse_betfair_catalogue_and_books,
    parse_codere_events_payload,
    parse_smarkets_v3_bundle,
    parse_the_odds_api_events,
    sha256_payload,
)

PREDICTION_LAB_ROOT = WORKTREE_ROOT.parent / "prediction-lab"
PREDICTION_LAB_PYTHON = PREDICTION_LAB_ROOT / "research" / "prediction-lab" / ".venv" / "Scripts" / "python.exe"


def test_load_cadence_regimes_readonly_and_boundaries() -> None:
    before_sha = hashlib.sha256(DEFAULT_STALE_LINES_CONFIG_PATH.read_bytes()).hexdigest()
    regimes, reported_sha = load_cadence_regimes_readonly(DEFAULT_STALE_LINES_CONFIG_PATH)
    after_sha = hashlib.sha256(DEFAULT_STALE_LINES_CONFIG_PATH.read_bytes()).hexdigest()

    assert before_sha == reported_sha == after_sha
    assert len(regimes) == 4

    r_t60, r_t44, r_t85, r_early = regimes
    assert r_t60.regime_id == "closing_decision_window_t_minus_60m"
    assert r_t60.max_interval_seconds == pytest.approx(221.15010424268056, rel=1e-9)
    assert r_t60.scheduled_interval_seconds <= 221.15010424268056

    assert r_t44.regime_id == "matchday_near_kickoff_q00_ws"
    assert r_t44.max_interval_seconds == pytest.approx(514.0530486595916, rel=1e-9)
    assert r_t44.scheduled_interval_seconds <= 514.0530486595916

    assert r_t85.regime_id == "matchday_window_q10_ws"
    assert r_t85.max_interval_seconds == pytest.approx(701.3157095395914, abs=1e-6)
    assert r_t85.scheduled_interval_seconds <= 701.3157095395914

    assert r_early.regime_id == "early_week_median_q50_ws"
    assert r_early.max_interval_seconds == pytest.approx(1824.2781278729526, rel=1e-9)
    assert r_early.scheduled_interval_seconds <= 1824.2781278729526

    assert classify_event_regime(-0.01, regimes) is None
    assert classify_event_regime(0.0, regimes) == r_t60
    assert classify_event_regime(60.0, regimes) == r_t60
    assert classify_event_regime(60.01, regimes) == r_t44
    assert classify_event_regime(262.4, regimes) == r_t44
    assert classify_event_regime(262.5, regimes) == r_t85
    assert classify_event_regime(509.9, regimes) == r_t85
    assert classify_event_regime(510.0, regimes) == r_early
    assert classify_event_regime(10000.0, regimes) == r_early


def test_legal_gate_blocks_all_forbidden_and_uncredentialed_sources(tmp_path: Path) -> None:
    by_id = {m.source_id: m for m in AUDITED_SOURCES_METADATA}
    assert set(by_id.keys()) == {
        "pinnacle",
        "smarkets",
        "caliente",
        "codere",
        "betfair_exchange",
        "the_odds_api",
        "action_network",
    }

    for blocked_id in ("pinnacle", "smarkets", "caliente", "codere", "action_network"):
        assert by_id[blocked_id].legal_status == "blocked_pending_owner_decision"
        assert not by_id[blocked_id].is_eligible_for_scheduler({"THE_ODDS_API_KEY": "k", "SMARKETS_SESSION_TOKEN": "s"})

    assert by_id["the_odds_api"].legal_status == "api_only"
    assert by_id["betfair_exchange"].legal_status == "api_only"

    # Sin credenciales en entorno -> 0 fuentes activas
    assert build_active_source_adapters(env={}) == []

    # Con THE_ODDS_API_KEY -> únicamente the_odds_api entra activa
    active_oa = build_active_source_adapters(env={"THE_ODDS_API_KEY": "valid_demo_key"})
    assert [a.metadata.source_id for a in active_oa] == ["the_odds_api"]

    # Con BETFAIR_APP_KEY + BETFAIR_SESSION_TOKEN -> betfair_exchange entra activa
    active_bf = build_active_source_adapters(
        env={"BETFAIR_APP_KEY": "app_k", "BETFAIR_SESSION_TOKEN": "sess_t"}
    )
    assert [a.metadata.source_id for a in active_bf] == ["betfair_exchange"]

    # Todos los adaptadores bloqueados lanzan SourceBlockedError sin tocar red
    all_adapters = build_all_registered_adapters(env={})
    for blocked_id in ("pinnacle", "smarkets", "caliente", "codere", "action_network"):
        with pytest.raises(SourceBlockedError):
            all_adapters[blocked_id].fetch_snapshots()

    # Inyectar manualmente un adaptador bloqueado a CadenceScheduler falla de inmediato
    with pytest.raises(SourceBlockedError):
        CadenceScheduler(output_dir=tmp_path, env={}, adapters=[CodereAdapter()])

    with pytest.raises(MissingCredentialsError):
        CadenceScheduler(output_dir=tmp_path, env={}, adapters=[TheOddsApiAdapter(env={})])


def test_robots_rate_limit_backoff_and_antibot_abort() -> None:
    # 1. Regla real observada en https://apuestas.codere.mx/robots.txt
    codere_robots = "User-agent: *\nDisallow: /\nAllow: /es_MX$\n"
    policy = RobotsTxtPolicy(codere_robots)
    assert policy.is_allowed("https://apuestas.codere.mx/es_MX") is True
    assert policy.is_allowed("https://apuestas.codere.mx/es_MX/overview") is False
    assert policy.is_allowed("https://apuestas.codere.mx/NavigationService/Home/GetSports") is False

    calls = 0

    def never_called(*_args: Any) -> HttpResponseData:
        nonlocal calls
        calls += 1
        return HttpResponseData(url="https://apuestas.codere.mx/es_MX/overview", status=200, headers={}, body=b"{}")

    transport_robots = CleanScraplingHttpTransport(robots_policy=policy, low_level_requester=never_called)
    with pytest.raises(RobotsDisallowedError):
        transport_robots.request("GET", "https://apuestas.codere.mx/es_MX/overview")
    assert calls == 0

    # 2. Rate limiter monotónico
    fake_now = 100.0
    slept_intervals: list[float] = []

    def clock() -> float:
        return fake_now

    def sleep_fn(sec: float) -> None:
        nonlocal fake_now
        slept_intervals.append(sec)
        fake_now += sec

    slept_intervals = []
    limiter = PerSourceRateLimiter(0.5, clock=clock, sleep_fn=sleep_fn)  # min_interval = 2.0s
    limiter.acquire()
    fake_now += 0.5
    limiter.acquire()
    assert len(slept_intervals) == 1
    assert slept_intervals[0] == pytest.approx(1.5, abs=1e-6)

    # 3. Backoff exponencial sobre 429/502 y éxito en intento 3
    seq_responses = [
        HttpResponseData(url="https://api.the-odds-api.com/v4/sports", status=429, headers={"Retry-After": "1.25"}, body=b"rate limit"),
        HttpResponseData(url="https://api.the-odds-api.com/v4/sports", status=502, headers={}, body=b"bad gateway"),
        HttpResponseData(url="https://api.the-odds-api.com/v4/sports", status=200, headers={}, body=b"[]"),
    ]
    backoff_sleeps: list[float] = []

    def seq_requester(*_args: Any) -> HttpResponseData:
        return seq_responses.pop(0)

    transport_retry = CleanScraplingHttpTransport(
        rate_limiter=PerSourceRateLimiter(1000.0, clock=clock, sleep_fn=lambda _: None),
        backoff_policy=ExponentialBackoffPolicy(base_delay_seconds=2.0, factor=2.0, max_retries=3, jitter_ratio=0.0),
        sleep_fn=lambda d: backoff_sleeps.append(d),
        low_level_requester=seq_requester,
        rng=random.Random(42),
    )
    ok_resp = transport_retry.request("GET", "https://api.the-odds-api.com/v4/sports")
    assert ok_resp.status == 200
    assert backoff_sleeps == [pytest.approx(1.25), pytest.approx(4.0)]

    # 4. Detención inmediata (0 reintentos) ante reto anti-bot Cloudflare / Smarkets Security Check
    cf_calls = 0

    def cf_challenge_requester(*_args: Any) -> HttpResponseData:
        nonlocal cf_calls
        cf_calls += 1
        return HttpResponseData(
            url="https://api.smarkets.com/v3/events/",
            status=403,
            headers={"server": "cloudflare", "cf-mitigated": "challenge"},
            body=b"<html><title>Smarkets - Security Check</title></html>",
        )

    transport_cf = CleanScraplingHttpTransport(
        rate_limiter=PerSourceRateLimiter(1000.0, clock=clock, sleep_fn=lambda _: None),
        sleep_fn=lambda _: None,
        low_level_requester=cf_challenge_requester,
    )
    with pytest.raises(AntiBotChallengeError):
        transport_cf.request("GET", "https://api.smarkets.com/v3/events/")
    assert cf_calls == 1


def test_canonical_event_id_determinism_across_books() -> None:
    # Liga MX: Club America vs Chivas == CF América vs CD Guadalajara
    eid_pin_mx = build_canonical_event_id(
        "soccer_mexico_ligamx", "MEX", "2026-11-14T23:00:00Z", "Club America", "Guadalajara"
    )
    eid_cod_mx = build_canonical_event_id(
        "football", "liga-mx", "2026-11-14T23:00:00.000Z", "CF América", "Chivas Guadalajara"
    )
    assert eid_pin_mx == eid_cod_mx == "ws:football:MEX:20261114:cf_america:cd_guadalajara"

    # EPL: Man City vs Spurs == Manchester City FC vs Tottenham Hotspur
    eid_epl_1 = build_canonical_event_id(
        "football", "E0", "2026-11-21T17:30:00Z", "Man City", "Spurs"
    )
    eid_epl_2 = build_canonical_event_id(
        "soccer", "england-premier-league", "2026-11-21T17:30:00+00:00", "Manchester City FC", "Tottenham Hotspur"
    )
    assert eid_epl_1 == eid_epl_2 == "ws:football:E0:20261121:manchester_city:tottenham_hotspur"

    # NFL: KC vs BUF == Kansas City Chiefs vs Buffalo Bills
    eid_nfl_1 = build_canonical_event_id("nfl", "NFL", "2026-11-15T21:25:00Z", "KC", "BUF")
    eid_nfl_2 = build_canonical_event_id(
        "americanfootball_nfl", "NFL", "2026-11-15T21:25:00Z", "Kansas City Chiefs", "Buffalo Bills"
    )
    assert eid_nfl_1 == eid_nfl_2 == "ws:nfl:NFL:20261115:kansas_city_chiefs:buffalo_bills"


def test_all_source_parsers_and_post_kickoff_discard() -> None:
    raw_sha = "a" * 64

    # 1. The Odds API (fútbol + post-kickoff descartado)
    oa_events = [
        {
            "id": "ev1",
            "home_team": "Club America",
            "away_team": "Cruz Azul",
            "commence_time": "2026-11-15T03:00:00Z",
            "bookmakers": [
                {
                    "key": "pinnacle",
                    "markets": [
                        {
                            "key": "h2h",
                            "outcomes": [
                                {"name": "Club America", "price": 2.05},
                                {"name": "Draw", "price": 3.45},
                                {"name": "Cruz Azul", "price": 3.80},
                            ],
                        },
                        {
                            "key": "spreads",
                            "outcomes": [
                                {"name": "Club America", "point": -0.5, "price": 2.05},
                                {"name": "Cruz Azul", "point": 0.5, "price": 1.87},
                            ],
                        },
                        {
                            "key": "totals",
                            "outcomes": [
                                {"name": "Over", "point": 2.5, "price": 1.92},
                                {"name": "Under", "point": 2.5, "price": 1.98},
                            ],
                        },
                    ],
                }
            ],
        },
        # Evento ya iniciado (ts_captured > ts_event_start) -> debe descartarse por completo
        {
            "id": "ev_past",
            "home_team": "Toluca",
            "away_team": "Monterrey",
            "commence_time": "2026-11-12T12:00:00Z",
            "bookmakers": [
                {
                    "key": "pinnacle",
                    "markets": [
                        {
                            "key": "h2h",
                            "outcomes": [
                                {"name": "Toluca", "price": 2.10},
                                {"name": "Draw", "price": 3.30},
                                {"name": "Monterrey", "price": 3.50},
                            ],
                        }
                    ],
                }
            ],
        },
    ]
    oa_rows = parse_the_odds_api_events(
        oa_events,
        sport="football",
        league="MEX",
        captured_at_iso="2026-11-12T15:00:00Z",
        raw_sha256=raw_sha,
    )
    assert len(oa_rows) == 7
    assert all(r["event_id"] == "ws:football:MEX:20261115:cf_america:cd_cruz_azul" for r in oa_rows)
    ah_rows = [r for r in oa_rows if r["market"] == "ah"]
    assert len(ah_rows) == 2
    assert {r["line"] for r in ah_rows} == {-0.5}

    # 2. Smarkets API v3 bundle (uniendo events + markets + contracts + quotes)
    sm_rows = parse_smarkets_v3_bundle(
        events=[
            {
                "id": "9001",
                "name": "CF América vs CD Cruz Azul",
                "type": "football_match",
                "state": "upcoming",
                "full_slug": "/sport/football/mexico-liga-mx/2026/11/15/america-vs-cruz-azul",
                "start_datetime": "2026-11-15T03:00:00Z",
            }
        ],
        markets=[
            {"id": "m1", "event_id": "9001", "slug": "full-time-result", "name": "Full-time result"},
            {"id": "m2", "event_id": "9001", "slug": "over-under-2-5", "name": "Over/Under 2.5"},
        ],
        contracts=[
            {"id": "c1", "market_id": "m1", "slug": "home", "name": "CF América"},
            {"id": "c2", "market_id": "m1", "slug": "draw", "name": "Draw"},
            {"id": "c3", "market_id": "m1", "slug": "away", "name": "CD Cruz Azul"},
            {"id": "c4", "market_id": "m2", "slug": "over", "name": "Over 2.5"},
            {"id": "c5", "market_id": "m2", "slug": "under", "name": "Under 2.5"},
        ],
        quotes={
            "c1": {"offers": [{"price": 4854}]},  # 10000 / 4854 = 2.060157
            "c2": {"offers": [{"price": 2898}]},  # 10000 / 2898 = 3.450656
            "c3": {"offers": [{"price": 2631}]},  # 10000 / 2631 = 3.800836
            "c4": {"offers": [{"price": 5181}]},
            "c5": {"offers": [{"price": 5025}]},
        },
        captured_at_iso="2026-11-12T15:00:00Z",
        raw_sha256=raw_sha,
    )
    assert len(sm_rows) == 5
    # Exactamente el mismo event_id canónico entre The Odds API (Pinnacle) y Smarkets
    assert {r["event_id"] for r in sm_rows} == {"ws:football:MEX:20261115:cf_america:cd_cruz_azul"}
    assert {r["book"] for r in sm_rows} == {"smarkets"}

    # 3. Betfair Exchange API-NG
    bf_rows = parse_betfair_catalogue_and_books(
        catalogue=[
            {
                "marketId": "1.2345",
                "marketName": "Match Odds",
                "description": {"marketType": "MATCH_ODDS"},
                "event": {"name": "America v Cruz Azul", "openDate": "2026-11-15T03:00:00.000Z"},
                "competition": {"name": "Liga MX"},
                "runners": [
                    {"selectionId": 11, "runnerName": "Club America"},
                    {"selectionId": 12, "runnerName": "Cruz Azul"},
                    {"selectionId": 58805, "runnerName": "The Draw"},
                ],
            }
        ],
        market_books=[
            {
                "marketId": "1.2345",
                "inplay": False,
                "runners": [
                    {"selectionId": 11, "status": "ACTIVE", "ex": {"availableToBack": [{"price": 2.06, "size": 500}]}},
                    {"selectionId": 12, "status": "ACTIVE", "ex": {"availableToBack": [{"price": 3.85, "size": 310}]}},
                    {"selectionId": 58805, "status": "ACTIVE", "ex": {"availableToBack": [{"price": 3.45, "size": 420}]}},
                ],
            }
        ],
        sport="football",
        captured_at_iso="2026-11-12T15:00:00Z",
        raw_sha256=raw_sha,
    )
    assert len(bf_rows) == 3
    assert {r["event_id"] for r in bf_rows} == {"ws:football:MEX:20261115:cf_america:cd_cruz_azul"}

    # 4. Codere parser estructurado: extrae equipos y descarta tokens huérfanos sin partido
    cod_payload = {
        "Events": [
            {
                "HomeTeam": "Águilas del América",
                "AwayTeam": "CD Cruz Azul",
                "LeagueName": "Liga MX",
                "SportName": "Fútbol",
                "StartDate": "2026-11-15T03:00:00Z",
                "Games": [
                    {
                        "ShortName": "MRES",
                        "Name": "Resultado del partido",
                        "Results": [
                            {"Name": "1", "Odd": 1.98},
                            {"Name": "Empate", "Odd": 3.30},
                            {"Name": "2", "AmericanOdd": "+260"},
                        ],
                    }
                ],
            },
            # Token huérfano estilo Ola 2 sin equipos ni fecha -> debe ser ignorado
            {"Games": [{"ShortName": "MRES", "Results": [{"Name": "+240", "Odd": 3.40}]}]},
        ]
    }
    cod_rows = parse_codere_events_payload(
        cod_payload,
        captured_at_iso="2026-11-12T15:00:00Z",
        raw_sha256=raw_sha,
    )
    assert len(cod_rows) == 3
    assert {r["event_id"] for r in cod_rows} == {"ws:football:MEX:20261115:cf_america:cd_cruz_azul"}
    away_cod = next(r for r in cod_rows if r["selection"] == "away")
    assert away_cod["price_decimal"] == pytest.approx(3.60)


def test_loop_multitick_health_and_prediction_lab_validator(tmp_path: Path) -> None:
    """Verifica ciclo multi-tick en T-60m (en tmp_path), idempotencia, SLA de health.json y paridad TS/Python."""
    kickoff_dt = datetime(2026, 11, 15, 18, 0, 0, tzinfo=timezone.utc)
    # Empezamos en T-45m (dentro de [T-60m, T-0]) y avanzamos el reloj en cada sleep del scheduler
    current_dt = kickoff_dt - timedelta(minutes=45)

    def now_fn() -> datetime:
        return current_dt

    def sleep_fn(seconds: float) -> None:
        nonlocal current_dt
        current_dt = current_dt + timedelta(seconds=seconds)

    # Mock de transporte para TheOddsApiAdapter con cuotas de Pinnacle + Smarkets + Bet365
    tick_counter = 0

    def mock_requester(
        method: str,
        url: str,
        headers: Mapping[str, str],
        params: Mapping[str, Any] | None,
        json_body: Any | None,
    ) -> HttpResponseData:
        nonlocal tick_counter
        tick_counter += 1
        drift = 0.01 * (tick_counter % 3)
        if "soccer_epl" in url:
            body_obj = [
                {
                    "id": "epl_1",
                    "home_team": "Arsenal FC",
                    "away_team": "Chelsea FC",
                    "commence_time": "2026-11-15T18:00:00Z",
                    "bookmakers": [
                        {
                            "key": "pinnacle",
                            "markets": [
                                {
                                    "key": "h2h",
                                    "outcomes": [
                                        {"name": "Arsenal", "price": round(1.90 + drift, 4)},
                                        {"name": "Draw", "price": 3.60},
                                        {"name": "Chelsea", "price": 4.20},
                                    ],
                                }
                            ],
                        },
                        {
                            "key": "smarkets",
                            "markets": [
                                {
                                    "key": "h2h",
                                    "outcomes": [
                                        {"name": "Arsenal", "price": round(1.92 + drift, 4)},
                                        {"name": "Draw", "price": 3.65},
                                        {"name": "Chelsea", "price": 4.25},
                                    ],
                                }
                            ],
                        },
                        {
                            "key": "bet365",
                            "markets": [
                                {
                                    "key": "h2h",
                                    "outcomes": [
                                        {"name": "Arsenal", "price": 1.85},
                                        {"name": "Draw", "price": 3.50},
                                        {"name": "Chelsea", "price": 4.00},
                                    ],
                                }
                            ],
                        },
                    ],
                }
            ]
        elif "americanfootball_nfl" in url:
            body_obj = [
                {
                    "id": "nfl_1",
                    "home_team": "Buffalo Bills",
                    "away_team": "Kansas City Chiefs",
                    "commence_time": "2026-11-15T18:00:00Z",
                    "bookmakers": [
                        {
                            "key": "pinnacle",
                            "markets": [
                                {
                                    "key": "h2h",
                                    "outcomes": [
                                        {"name": "Buffalo Bills", "price": round(1.83 + drift, 4)},
                                        {"name": "Kansas City Chiefs", "price": 2.08},
                                    ],
                                },
                                {
                                    "key": "spreads",
                                    "outcomes": [
                                        {"name": "Buffalo Bills", "point": -2.5, "price": 1.95},
                                        {"name": "Kansas City Chiefs", "point": 2.5, "price": 1.95},
                                    ],
                                },
                            ],
                        }
                    ],
                }
            ]
        else:
            body_obj = []

        raw_bytes = json.dumps(body_obj).encode("utf-8")
        return HttpResponseData(url=url, status=200, headers={"x-requests-remaining": "490"}, body=raw_bytes)

    transport = CleanScraplingHttpTransport(
        rate_limiter=PerSourceRateLimiter(1000.0, sleep_fn=lambda _: None),
        sleep_fn=lambda _: None,
        low_level_requester=mock_requester,
    )
    env = {"THE_ODDS_API_KEY": "unit_test_key"}
    adapter = TheOddsApiAdapter(env=env, transport=transport)

    edge_fixture = tmp_path / "calendar.json"
    edge_fixture.write_text(
        json.dumps(
            {
                "records": [
                    {
                        "sport": "football",
                        "league": "epl",
                        "kickoff_utc": "2026-11-15T18:00:00Z",
                        "home_team": "Arsenal",
                        "away_team": "Chelsea",
                    },
                    {
                        "sport": "nfl",
                        "league": "nfl",
                        "kickoff_utc": "2026-11-15T18:00:00Z",
                        "home_team": "BUF",
                        "away_team": "KC",
                    },
                ]
            }
        ),
        encoding="utf-8",
    )

    out_dir = tmp_path / "odds_timeseries"
    scheduler = CadenceScheduler(
        output_dir=out_dir,
        env=env,
        adapters=[adapter],
        edge_matrix_path=edge_fixture,
        microstructure_path=None,
        now_fn=now_fn,
        sleep_fn=sleep_fn,
    )

    loop_res = scheduler.run_loop(max_duration_seconds=1000.0, max_cycles=3)
    assert loop_res["cycles_run"] == 3
    assert loop_res["capture_status"] == "ok"

    # Verificar idempotencia append-only al re-insertar las mismas filas
    stored = load_all_timeseries_rows(out_dir)
    assert len(stored) == 3 * (9 + 4)  # 3 ciclos * (9 fútbol + 4 NFL) = 39 filas
    for r in stored:
        assert tuple(r.keys()) == TIMESERIES_JSONL_COLUMNS

    reappend = append_validated_ticks_jsonl(stored, output_dir=out_dir)
    assert reappend["rows_appended"] == 0
    assert reappend["rows_already_present"] == len(stored)

    health = json.loads((out_dir / "health.json").read_text(encoding="utf-8"))
    assert health["capture_status"] == "ok"
    assert health["events_tracked"] == 2
    assert health["ticks_per_event"]["min"] == 3
    assert health["ticks_per_event"]["max"] == 3
    assert health["median_gap_minutes_by_regime"]["T-60m"] is not None
    assert health["median_gap_minutes_by_regime"]["T-60m"] <= 3.6858
    assert health["sharp_coverage"]["ratio"] == 1.0
    assert health["sharp_coverage"]["books"] == ["pinnacle", "smarkets"]

    # Validación cruzada contra `services/ingest/odds_snapshots.py` y `src/domain/prediction/odds.ts` en prediction-lab
    if PREDICTION_LAB_PYTHON.exists():
        py_check = subprocess.run(
            [
                str(PREDICTION_LAB_PYTHON),
                "-c",
                (
                    "import json, pathlib, sys; "
                    "sys.path.insert(0, str(pathlib.Path.cwd())); "
                    "from services.ingest.odds_snapshots import validate_and_deduplicate_snapshots, resolve_closing_odds; "
                    f"out_dir = pathlib.Path(r'{out_dir}'); "
                    "rows = [json.loads(ln) for p in out_dir.rglob('*.jsonl') for ln in p.read_text('utf-8').splitlines() if ln.strip()]; "
                    "df, st = validate_and_deduplicate_snapshots(rows); "
                    "cl = resolve_closing_odds(df); "
                    "assert st['n_missing_required'] == 0 and st['n_out_of_range'] == 0 and st['n_post_kickoff_discarded'] == 0 and st['n_duplicates_removed'] == 0; "
                    "assert st['n_valid'] == len(rows); "
                    "assert int((~cl['closing_missing']).sum()) == 3; "
                    "print(json.dumps(st))"
                ),
            ],
            cwd=str(PREDICTION_LAB_ROOT),
            capture_output=True,
            text=True,
            check=True,
        )
        py_stats = json.loads(py_check.stdout.strip())
        assert py_stats["n_valid"] == len(stored)

    vite_node_bin = PREDICTION_LAB_ROOT / "node_modules" / ".bin" / ("vite-node.cmd" if sys.platform == "win32" else "vite-node")
    if vite_node_bin.exists():
        ts_script = tmp_path / "validate_ts_odds.ts"
        ts_script.write_text(
            (
                "import fs from 'node:fs';\n"
                "import path from 'node:path';\n"
                f"import {{ validateAndDeduplicateSnapshots, resolveClosingSnapshots }} from {json.dumps(str((PREDICTION_LAB_ROOT / 'src' / 'domain' / 'prediction' / 'odds.ts').as_posix()))};\n"
                f"const root = {json.dumps(str(out_dir))};\n"
                "const rows: any[] = [];\n"
                "for (const sp of ['football', 'nfl']) {\n"
                "  const dir = path.join(root, sp);\n"
                "  if (!fs.existsSync(dir)) continue;\n"
                "  for (const f of fs.readdirSync(dir)) {\n"
                "    if (!f.endsWith('.jsonl')) continue;\n"
                "    for (const ln of fs.readFileSync(path.join(dir, f), 'utf8').split(/\\r?\\n/)) {\n"
                "      if (ln.trim()) rows.push(JSON.parse(ln));\n"
                "    }\n"
                "  }\n"
                "}\n"
                "const res = validateAndDeduplicateSnapshots(rows);\n"
                "const closing = resolveClosingSnapshots(res.rows);\n"
                "const resolvedCount = closing.filter((c) => !c.closing_missing).length;\n"
                "if (\n"
                "  res.stats.n_missing_required !== 0 ||\n"
                "  res.stats.n_out_of_range !== 0 ||\n"
                "  res.stats.n_post_kickoff_discarded !== 0 ||\n"
                "  res.stats.n_duplicates_removed !== 0 ||\n"
                "  res.stats.n_valid !== rows.length ||\n"
                "  resolvedCount !== 3\n"
                ") {\n"
                "  throw new Error('TS validation mismatch: ' + JSON.stringify({ stats: res.stats, resolvedCount }));\n"
                "}\n"
                "console.log(JSON.stringify({ stats: res.stats, resolvedCount }));\n"
            ),
            encoding="utf-8",
        )
        ts_check = subprocess.run(
            [str(vite_node_bin), str(ts_script)],
            cwd=str(PREDICTION_LAB_ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        assert ts_check.returncode == 0, f"vite-node TS check failed: {ts_check.stderr}\n{ts_check.stdout}"
        ts_out = json.loads(ts_check.stdout.strip().splitlines()[-1])
        assert ts_out["stats"]["n_valid"] == len(stored)
        assert ts_out["resolvedCount"] == 3


def test_real_workspace_health_and_existing_jsonl_contract() -> None:
    """Verifica que `data/odds_timeseries/health.json` y cualquier `.jsonl` real cumplan el contrato v3.2."""
    real_out_dir = WORKTREE_ROOT / "data" / "odds_timeseries"
    health_file = real_out_dir / "health.json"
    assert health_file.exists(), "data/odds_timeseries/health.json debe existir tras ejecutar el programador"

    health = json.loads(health_file.read_text(encoding="utf-8"))
    for req_key in (
        "generated_at_utc",
        "capture_status",
        "approved_sources",
        "blocked_sources",
        "events_tracked",
        "ticks_per_event",
        "median_gap_minutes_by_regime",
        "sharp_coverage",
        "notes",
    ):
        assert req_key in health

    assert health["capture_status"] in ("ok", "prospective_capture_pending", "blocked_no_approved_sharp")
    blocked_names = {b["source"] for b in health["blocked_sources"]}
    assert blocked_names == {"pinnacle", "smarkets", "caliente", "codere", "action_network"}

    real_rows = load_all_timeseries_rows(real_out_dir)
    for row in real_rows:
        assert tuple(row.keys()) == TIMESERIES_JSONL_COLUMNS
        assert row["source"] == "scraped_ws"
        assert 1.01 <= float(row["price_decimal"]) <= 1000.0

