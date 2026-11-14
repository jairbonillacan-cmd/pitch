"""Presupuesto de créditos de The Odds API para operar dentro del plan gratuito (500 créditos/mes)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
from typing import Any, Mapping

WORKTREE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKTREE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKTREE_ROOT))

from scrapers.cadence_scheduler import CadenceScheduler  # noqa: E402
from scrapers.sources import (  # noqa: E402
    BUDGET_LEDGER_FILENAME,
    CleanScraplingHttpTransport,
    HttpResponseData,
    OddsApiBudget,
    OddsApiBudgetConfig,
    PerSourceRateLimiter,
    TheOddsApiAdapter,
)

ENV = {"THE_ODDS_API_KEY": "unit_test_key"}
NOW = datetime(2026, 11, 13, 12, 0, 0, tzinfo=timezone.utc)
EVENT = {
    "id": "epl_1",
    "home_team": "Arsenal FC",
    "away_team": "Chelsea FC",
    "commence_time": "2026-11-14T15:00:00Z",
    "bookmakers": [
        {
            "key": "pinnacle",
            "markets": [
                {
                    "key": "h2h",
                    "outcomes": [
                        {"name": "Arsenal FC", "price": 2.1},
                        {"name": "Draw", "price": 3.4},
                        {"name": "Chelsea FC", "price": 3.6},
                    ],
                }
            ],
        }
    ],
}


class FakeApi:
    """Transporte simulado que registra cada llamada y devuelve partidos solo para las ligas indicadas."""

    def __init__(self, leagues_with_games: set[str] | None = None, remaining: int = 400) -> None:
        self.leagues_with_games = leagues_with_games
        self.remaining = remaining
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def _has_games(self, url: str) -> bool:
        if self.leagues_with_games is None:
            return True
        return any(f"/sports/{k}/" in url for k in self.leagues_with_games)

    def __call__(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        params: Mapping[str, Any] | None,
        json_body: Any | None,
    ) -> HttpResponseData:
        self.calls.append((url, dict(params or {})))
        body = [EVENT] if self._has_games(url) else []
        hdrs: dict[str, str] = {}
        if url.endswith("/odds"):
            cost = len(str(params["markets"]).split(",")) * len(str(params["regions"]).split(","))
            self.remaining -= cost
            hdrs = {"x-requests-remaining": str(self.remaining), "x-requests-last": str(cost)}
        return HttpResponseData(url=url, status=200, headers=hdrs, body=json.dumps(body).encode("utf-8"))

    def odds_calls(self) -> list[tuple[str, dict[str, Any]]]:
        return [c for c in self.calls if c[0].endswith("/odds")]


def make_adapter(api: FakeApi, tmp_path: Path, env: Mapping[str, str] = ENV, **kwargs: Any) -> TheOddsApiAdapter:
    transport = CleanScraplingHttpTransport(
        rate_limiter=PerSourceRateLimiter(1000.0, sleep_fn=lambda _: None),
        sleep_fn=lambda _: None,
        low_level_requester=api,
    )
    return TheOddsApiAdapter(
        env=env, transport=transport, budget_path=tmp_path / BUDGET_LEDGER_FILENAME, **kwargs
    )


def test_defaults_cost_one_credit_per_league_and_skip_leagues_without_games(tmp_path: Path) -> None:
    api = FakeApi(leagues_with_games={"soccer_epl"})
    adapter = make_adapter(api, tmp_path)

    rows = adapter.fetch_snapshots(sports=("football", "nfl"), captured_at=NOW)

    assert adapter.credits_per_call == 1
    assert [c[0].rsplit("/", 2)[-2] for c in api.odds_calls()] == ["soccer_epl"]
    _, params = api.odds_calls()[0]
    assert params["regions"] == "eu" and params["markets"] == "h2h"
    assert {r["book"] for r in rows} == {"pinnacle"}
    report = adapter.last_budget_report
    assert report["leagues_fetched"] == ["soccer_epl"]
    assert report["leagues_skipped"]["soccer_mexico_ligamx"] == "sin_partidos_en_ventana"
    assert report["month_credits_used"] == 1


def test_daily_allowance_spreads_remaining_month() -> None:
    budget = OddsApiBudget(config=OddsApiBudgetConfig())
    # 13 nov: quedan 18 días; (500 - 25) / 18
    assert abs(budget.daily_allowance(NOW) - 475 / 18) < 1e-9
    budget.record("soccer_epl", 10, NOW - timedelta(days=1), remaining=None)
    assert abs(budget.daily_allowance(NOW) - 465 / 18) < 1e-9


def test_min_interval_between_captures_of_same_league(tmp_path: Path) -> None:
    api = FakeApi(leagues_with_games={"soccer_epl"})
    adapter = make_adapter(api, tmp_path)

    adapter.fetch_snapshots(sports=("football",), captured_at=NOW)
    adapter.fetch_snapshots(sports=("football",), captured_at=NOW + timedelta(minutes=60))
    assert adapter.last_budget_report["leagues_skipped"]["soccer_epl"] == "intervalo_minimo"
    adapter.fetch_snapshots(sports=("football",), captured_at=NOW + timedelta(minutes=181))

    assert len(api.odds_calls()) == 2


def test_daily_cap_stops_spending(tmp_path: Path) -> None:
    last_day = datetime(2026, 11, 30, 12, 0, 0, tzinfo=timezone.utc)
    ledger = tmp_path / BUDGET_LEDGER_FILENAME
    ledger.write_text(json.dumps({"month": "2026-11", "credits_used": 470, "by_day": {"2026-11-29": 470}}))
    api = FakeApi()
    adapter = make_adapter(api, tmp_path)

    adapter.fetch_snapshots(sports=("football", "nfl"), captured_at=last_day)

    # (500 - 25 - 470) / 1 día = 5 créditos -> 5 de las 8 ligas
    assert len(api.odds_calls()) == 5
    skipped = adapter.last_budget_report["leagues_skipped"]
    assert sorted(set(skipped.values())) == ["tope_diario"] and len(skipped) == 3
    assert json.loads(ledger.read_text())["credits_used"] == 475


def test_reserve_from_api_header_blocks_calls(tmp_path: Path) -> None:
    api = FakeApi(remaining=26)
    adapter = make_adapter(api, tmp_path)

    adapter.fetch_snapshots(sports=("football",), captured_at=NOW)

    assert len(api.odds_calls()) == 1
    assert set(adapter.last_budget_report["leagues_skipped"].values()) == {"reserva_mensual"}


def test_ledger_persists_and_resets_on_new_month(tmp_path: Path) -> None:
    path = tmp_path / BUDGET_LEDGER_FILENAME
    budget = OddsApiBudget.load(OddsApiBudgetConfig(), path)
    budget.record("soccer_epl", 3, NOW, remaining=497)
    budget.save()

    reloaded = OddsApiBudget.load(OddsApiBudgetConfig(), path)
    assert reloaded.credits_used == 3 and reloaded.remaining_header == 497
    december = datetime(2026, 12, 1, 9, 0, 0, tzinfo=timezone.utc)
    assert abs(reloaded.daily_allowance(december) - 475 / 31) < 1e-9
    assert reloaded.credits_used == 0


def test_env_overrides_paid_plan_and_league_filter(tmp_path: Path) -> None:
    env = {
        **ENV,
        "THE_ODDS_API_MONTHLY_CREDITS": "0",
        "THE_ODDS_API_MIN_INTERVAL_MINUTES": "0",
        "THE_ODDS_API_MARKETS": "h2h,totals",
        "THE_ODDS_API_LEAGUES": "soccer_mexico_ligamx,americanfootball_nfl",
    }
    api = FakeApi()
    adapter = make_adapter(api, tmp_path, env=env)

    assert adapter.budget_config.monthly_credits is None
    assert adapter.credits_per_call == 2
    adapter.fetch_snapshots(sports=("football", "nfl"), captured_at=NOW)
    adapter.fetch_snapshots(sports=("football", "nfl"), captured_at=NOW + timedelta(minutes=3))

    leagues = [c[0].rsplit("/", 2)[-2] for c in api.odds_calls()]
    assert leagues == ["soccer_mexico_ligamx", "americanfootball_nfl"] * 2


def test_scheduler_stores_ledger_in_output_dir(tmp_path: Path) -> None:
    adapter = TheOddsApiAdapter(env=ENV)
    CadenceScheduler(output_dir=tmp_path, env=ENV, adapters=[adapter])

    assert adapter.budget_path == tmp_path / BUDGET_LEDGER_FILENAME
