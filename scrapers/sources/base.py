"""Primitivas legales, cliente HTTP sin evasión, backoff, rate-limit y normalización JSONL (`v3.2` · `B3`).

Cumple estrictamente:
- §0 Regla #4: Jamás inventar cuotas ni simular ticks.
- §0 Regla #7: Cero evasión anti-bot (`impersonate=None`, `stealthy_headers=False`, sin `solve_cloudflare`,
  respeto a `robots.txt`, detención inmediata ante `HTTP 403` o `CF-Mitigated: challenge`).
- §0 Regla #8: Compatibilidad exacta (`11 + 1` columnas) con `validateAndDeduplicateSnapshots` (`odds.ts`)
  y `validate_and_deduplicate_snapshots` (`odds_snapshots.py`).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import json
import math
import os
import random
import re
import time
from typing import Any, Callable, Literal, Mapping, Protocol, Sequence

from scrapling.fetchers import FetcherSession

from scrapers.sources.team_resolution import (
    SUPPORTED_TIMESERIES_SPORTS,
    format_utc_iso,
    parse_utc_datetime,
)

LegalStatus = Literal["ok", "api_only", "blocked_pending_owner_decision"]
SourceKind = Literal["sharp", "recreational", "aggregator"]

REQUIRED_ODDS_COLUMNS: tuple[str, ...] = (
    "event_id",
    "sport",
    "league",
    "market",
    "line",
    "selection",
    "book",
    "price_decimal",
    "ts_captured",
    "ts_event_start",
    "source",
)
TIMESERIES_JSONL_COLUMNS: tuple[str, ...] = REQUIRED_ODDS_COLUMNS + ("raw_sha256",)

MIN_PRICE_DECIMAL: float = 1.01
MAX_PRICE_DECIMAL: float = 1000.0

VALID_MARKETS_SELECTIONS: dict[str, frozenset[str]] = {
    "1x2": frozenset({"home", "draw", "away"}),
    "moneyline": frozenset({"home", "away"}),
    "ah": frozenset({"home", "away"}),
    "spread": frozenset({"home", "away"}),
    "totals": frozenset({"over", "under"}),
    "btts": frozenset({"yes", "no"}),
    "dnb": frozenset({"home", "away"}),
}

LINE_NULL_MARKETS: frozenset[str] = frozenset({"1x2", "moneyline", "btts", "dnb"})
LINE_REQUIRED_MARKETS: frozenset[str] = frozenset({"ah", "spread", "totals"})
SHARP_CANONICAL_BOOKS: frozenset[str] = frozenset({"pinnacle", "smarkets", "betfair_exchange"})

TRANSPARENT_USER_AGENT: str = "PitchLab-Research-Bot/1.0 (legal-odds-capture; non-evasive)"

_HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
_ANTIBOT_MARKERS: tuple[str, ...] = (
    "smarkets - security check",
    "<title>just a moment...</title>",
    "cf-browser-verification",
    "challenge-platform",
    "attention required! | cloudflare",
    "verify you are human",
)


class OddsSourceError(RuntimeError):
    """Error base de una fuente de cuotas."""


class SourceBlockedError(OddsSourceError):
    """La fuente está marcada `blocked_pending_owner_decision` en `LEGAL_FUENTES_CUOTAS.md`."""


class MissingCredentialsError(OddsSourceError):
    """La fuente `api_only` carece de las credenciales requeridas en el entorno."""


class AntiBotChallengeError(OddsSourceError):
    """El servidor respondió con un reto anti-bot (`403` / `CF-Mitigated: challenge`); jamás se evade."""


class RobotsDisallowedError(OddsSourceError):
    """La ruta solicitada está prohibida por `robots.txt`."""


class HttpSourceError(OddsSourceError):
    """Error HTTP transitorio o permanente al consultar un endpoint."""

    def __init__(self, status_code: int, url: str, message: str = "") -> None:
        super().__init__(f"HTTP {status_code} en {url}: {message}".strip())
        self.status_code = status_code
        self.url = url


@dataclass(frozen=True)
class HttpResponseData:
    """Respuesta HTTP cruda normalizada para transporte real o simulado en tests."""

    url: str
    status: int
    headers: Mapping[str, str]
    body: bytes

    @property
    def text(self) -> str:
        return self.body.decode("utf-8", errors="replace")

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.body).hexdigest()

    def json(self) -> Any:
        return json.loads(self.text)


class HttpTransportProtocol(Protocol):
    """Protocolo de transporte HTTP limpio (sin evasión anti-bot)."""

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str] | None = None,
        params: Mapping[str, Any] | None = None,
        json_body: Any | None = None,
    ) -> HttpResponseData: ...


@dataclass(frozen=True)
class RobotsRule:
    allow: bool
    pattern: str
    regex: re.Pattern[str]
    specificity: int


class RobotsTxtPolicy:
    """Evaluador determinista RFC 9309 de `robots.txt` (precedencia por longitud de patrón y `Allow` en empate)."""

    def __init__(self, raw_robots_txt: str, user_agent_token: str = "pitchlab-research-bot") -> None:
        self.raw_robots_txt = raw_robots_txt
        self.user_agent_token = user_agent_token.lower()
        self._rules: list[RobotsRule] = self._parse(raw_robots_txt, self.user_agent_token)

    @staticmethod
    def _compile_pattern(pattern: str) -> re.Pattern[str]:
        anchored_end = pattern.endswith("$")
        core = pattern[:-1] if anchored_end else pattern
        parts = [re.escape(chunk) for chunk in core.split("*")]
        expr = "^" + ".*".join(parts)
        if anchored_end:
            expr += "$"
        return re.compile(expr)

    @classmethod
    def _parse(cls, text: str, ua_token: str) -> list[RobotsRule]:
        specific_rules: list[RobotsRule] = []
        wildcard_rules: list[RobotsRule] = []

        current_agents: list[str] = []
        in_rule_section = False

        for raw_line in text.splitlines():
            line = raw_line.split("#", 1)[0].strip()
            if not line or ":" not in line:
                if not line:
                    in_rule_section = False
                continue
            field_name, value = [p.strip() for p in line.split(":", 1)]
            fname_low = field_name.lower()
            if fname_low == "user-agent":
                if in_rule_section:
                    current_agents = []
                    in_rule_section = False
                current_agents.append(value.lower())
            elif fname_low in ("allow", "disallow"):
                in_rule_section = True
                if not current_agents or not value:
                    # RFC 9309: `Disallow:` vacío permite todo
                    continue
                rule = RobotsRule(
                    allow=(fname_low == "allow"),
                    pattern=value,
                    regex=cls._compile_pattern(value),
                    specificity=len(value.replace("*", "")),
                )
                if any(ua_token in ag and ag != "*" for ag in current_agents):
                    specific_rules.append(rule)
                elif "*" in current_agents:
                    wildcard_rules.append(rule)

        return specific_rules if specific_rules else wildcard_rules

    def is_allowed(self, url_or_path: str) -> bool:
        path = url_or_path
        if "://" in path:
            after_scheme = path.split("://", 1)[1]
            slash_idx = after_scheme.find("/")
            path = after_scheme[slash_idx:] if slash_idx >= 0 else "/"
        if not path.startswith("/"):
            path = "/" + path

        matched = [r for r in self._rules if r.regex.search(path)]
        if not matched:
            return True
        # Precedencia RFC 9309: mayor longitud de coincidencia; en empate gana `Allow`
        matched.sort(key=lambda r: (r.specificity, 1 if r.allow else 0), reverse=True)
        return matched[0].allow


class PerSourceRateLimiter:
    """Limitador de tasa por fuente basado en intervalo mínimo monotónico."""

    def __init__(
        self,
        max_requests_per_second: float,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep_fn: Callable[[float], None] = time.sleep,
    ) -> None:
        if max_requests_per_second <= 0 or not math.isfinite(max_requests_per_second):
            raise ValueError(f"max_requests_per_second inválido: {max_requests_per_second}")
        self.max_requests_per_second = float(max_requests_per_second)
        self.min_interval_seconds = 1.0 / self.max_requests_per_second
        self._clock = clock
        self._sleep_fn = sleep_fn
        self._last_request_ts: float | None = None
        self.total_waits: int = 0
        self.total_slept_seconds: float = 0.0

    def acquire(self) -> float:
        now = self._clock()
        slept = 0.0
        if self._last_request_ts is not None:
            elapsed = now - self._last_request_ts
            remaining = self.min_interval_seconds - elapsed
            if remaining > 0:
                self._sleep_fn(remaining)
                slept = remaining
                self.total_waits += 1
                self.total_slept_seconds += remaining
                now = self._clock()
        self._last_request_ts = now
        return slept


@dataclass(frozen=True)
class ExponentialBackoffPolicy:
    """Política de backoff exponencial acotado para errores transitorios (`429` y `5xx`)."""

    base_delay_seconds: float = 1.5
    factor: float = 2.0
    max_delay_seconds: float = 60.0
    max_retries: int = 3
    jitter_ratio: float = 0.1

    def compute_delay(
        self,
        attempt: int,
        *,
        retry_after_header: str | None = None,
        rng: random.Random | None = None,
    ) -> float:
        if retry_after_header:
            try:
                ra = float(retry_after_header.strip())
                if math.isfinite(ra) and ra > 0:
                    return min(self.max_delay_seconds, ra)
            except ValueError:
                pass
        exp_val = min(self.max_delay_seconds, self.base_delay_seconds * (self.factor ** max(0, attempt)))
        if self.jitter_ratio <= 0:
            return exp_val
        jitter_gen = rng.uniform if rng is not None else random.uniform
        jitter = jitter_gen(0.0, exp_val * self.jitter_ratio)
        return min(self.max_delay_seconds, exp_val + jitter)


def detect_antibot_challenge(resp: HttpResponseData) -> str | None:
    """Detecta si una respuesta HTTP corresponde a un bloqueo/reto anti-bot (Cloudflare / Security Check)."""
    headers_low = {k.lower(): str(v) for k, v in resp.headers.items()}
    cf_mitigated = headers_low.get("cf-mitigated", "").strip().lower()
    if cf_mitigated == "challenge":
        return f"Cabecera CF-Mitigated=challenge en {resp.url} (HTTP {resp.status})"
    if resp.status in (403, 503):
        snippet_low = resp.text[:4096].lower()
        for marker in _ANTIBOT_MARKERS:
            if marker in snippet_low:
                return f"Reto anti-bot detectado ({marker!r}) en {resp.url} (HTTP {resp.status})"
    return None


class CleanScraplingHttpTransport:
    """Transporte HTTP honesto y sin evasión anti-bot usando `FetcherSession(impersonate=None, stealthy_headers=False)`."""

    def __init__(
        self,
        *,
        rate_limiter: PerSourceRateLimiter | None = None,
        backoff_policy: ExponentialBackoffPolicy | None = None,
        robots_policy: RobotsTxtPolicy | None = None,
        timeout_seconds: float = 15.0,
        sleep_fn: Callable[[float], None] = time.sleep,
        low_level_requester: Callable[[str, str, Mapping[str, str], Mapping[str, Any] | None, Any | None], HttpResponseData]
        | None = None,
        rng: random.Random | None = None,
    ) -> None:
        self.rate_limiter = rate_limiter or PerSourceRateLimiter(1.0, sleep_fn=sleep_fn)
        self.backoff_policy = backoff_policy or ExponentialBackoffPolicy()
        self.robots_policy = robots_policy
        self.timeout_seconds = timeout_seconds
        self._sleep_fn = sleep_fn
        self._low_level_requester = low_level_requester
        self._rng = rng
        self.request_log: list[dict[str, Any]] = []

    @staticmethod
    def _build_url_with_params(url: str, params: Mapping[str, Any] | None) -> str:
        if not params:
            return url
        parts: list[str] = []
        for k, v in params.items():
            if v is None:
                continue
            if isinstance(v, (list, tuple)):
                for item in v:
                    parts.append(f"{k}={item}")
            else:
                parts.append(f"{k}={v}")
        if not parts:
            return url
        sep = "&" if "?" in url else "?"
        return url + sep + "&".join(parts)

    def _default_scrapling_call(
        self,
        method: str,
        url: str,
        headers: Mapping[str, str],
        params: Mapping[str, Any] | None,
        json_body: Any | None,
    ) -> HttpResponseData:
        full_url = self._build_url_with_params(url, params)
        with FetcherSession(
            impersonate=None,
            stealthy_headers=False,
            headers=dict(headers),
            timeout=self.timeout_seconds,
            retries=1,
        ) as session:
            m_upper = method.upper()
            if m_upper == "GET":
                raw_resp = session.get(full_url)
            elif m_upper == "POST":
                payload_str = json.dumps(json_body) if json_body is not None else ""
                raw_resp = session.post(full_url, data=payload_str)
            else:
                raise ValueError(f"Método HTTP no soportado: {method}")
            body_bytes = bytes(getattr(raw_resp, "body", b"") or b"")
            hdrs = {str(k): str(v) for k, v in (getattr(raw_resp, "headers", {}) or {}).items()}
            return HttpResponseData(
                url=full_url,
                status=int(getattr(raw_resp, "status", 0) or 0),
                headers=hdrs,
                body=body_bytes,
            )

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Mapping[str, str] | None = None,
        params: Mapping[str, Any] | None = None,
        json_body: Any | None = None,
    ) -> HttpResponseData:
        if self.robots_policy is not None and not self.robots_policy.is_allowed(url):
            raise RobotsDisallowedError(f"Bloqueado por robots.txt: {url}")

        merged_headers: dict[str, str] = {
            "User-Agent": TRANSPARENT_USER_AGENT,
            "Accept": "application/json",
        }
        if json_body is not None:
            merged_headers["Content-Type"] = "application/json"
        if headers:
            merged_headers.update(headers)

        requester = self._low_level_requester or self._default_scrapling_call
        attempt = 0

        while True:
            self.rate_limiter.acquire()
            resp = requester(method, url, merged_headers, params, json_body)
            self.request_log.append(
                {
                    "method": method.upper(),
                    "url": resp.url,
                    "status": resp.status,
                    "attempt": attempt,
                }
            )

            # 1. Jamás evadir ni reintentar retos anti-bot o errores de credenciales
            challenge_msg = detect_antibot_challenge(resp)
            if challenge_msg is not None:
                raise AntiBotChallengeError(challenge_msg)

            if resp.status == 401:
                raise MissingCredentialsError(f"HTTP 401 no autorizado en {resp.url}: {resp.text[:200]}")

            if resp.status == 403:
                raise AntiBotChallengeError(
                    f"HTTP 403 acceso denegado en {resp.url} (detención inmediata sin evasión)"
                )

            if 200 <= resp.status < 300:
                return resp

            # 2. Reintentar únicamente `429` y `5xx` con backoff exponencial
            if resp.status in (429, 500, 502, 503, 504) and attempt < self.backoff_policy.max_retries:
                hdrs_low = {k.lower(): v for k, v in resp.headers.items()}
                retry_after = hdrs_low.get("retry-after")
                delay = self.backoff_policy.compute_delay(
                    attempt,
                    retry_after_header=retry_after,
                    rng=self._rng,
                )
                self._sleep_fn(delay)
                attempt += 1
                continue

            raise HttpSourceError(resp.status, resp.url, resp.text[:240])


@dataclass(frozen=True)
class SourceMetadata:
    """Metadatos auditados de cada fuente en `docs/LEGAL_FUENTES_CUOTAS.md`."""

    source_id: str
    display_name: str
    kind: SourceKind
    legal_status: LegalStatus
    official_api: bool
    required_env_vars: tuple[str, ...] = ()
    requires_antibot_evasion: bool = False
    rate_limit_rps: float = 0.5
    legal_reason: str = ""
    inspected_endpoints: tuple[str, ...] = ()

    def credentials_present(self, env: Mapping[str, str] | None = None) -> bool:
        if not self.required_env_vars:
            return True
        env_map = os.environ if env is None else env
        return all(bool(str(env_map.get(var, "")).strip()) for var in self.required_env_vars)

    def is_eligible_for_scheduler(self, env: Mapping[str, str] | None = None) -> bool:
        if self.legal_status == "blocked_pending_owner_decision":
            return False
        if self.requires_antibot_evasion:
            return False
        return self.credentials_present(env)


def american_to_decimal(american: Any) -> float | None:
    """Convierte cuota americana (`+150`, `-110`) a cuota decimal sin inventar valores."""
    if american is None or isinstance(american, bool):
        return None
    try:
        val = float(american)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(val) or abs(val) < 100.0:
        return None
    if val > 0:
        return round(1.0 + (val / 100.0), 6)
    return round(1.0 + (100.0 / abs(val)), 6)


def normalize_line_value(line: Any) -> float | None:
    """Normaliza `line` colapsando `None`/`NaN`/`±Inf` a `None` y `-0.0` a `0.0`."""
    if line is None or isinstance(line, bool):
        return None
    try:
        val = float(line)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(val):
        return None
    return 0.0 if val == 0.0 else val


def sha256_payload(raw_payload: bytes | str | Mapping[str, Any] | Sequence[Any]) -> str:
    """Calcula SHA-256 hex (64 minúsculas) determinista del payload crudo."""
    if isinstance(raw_payload, bytes):
        data = raw_payload
    elif isinstance(raw_payload, str):
        data = raw_payload.encode("utf-8")
    else:
        data = json.dumps(raw_payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(data).hexdigest()


@dataclass
class TickNormalizationStats:
    n_input: int = 0
    n_missing_or_invalid: int = 0
    n_out_of_range: int = 0
    n_post_kickoff_discarded: int = 0
    n_duplicates_removed: int = 0
    n_valid: int = 0

    def to_dict(self) -> dict[str, int]:
        return {
            "n_input": self.n_input,
            "n_missing_or_invalid": self.n_missing_or_invalid,
            "n_out_of_range": self.n_out_of_range,
            "n_post_kickoff_discarded": self.n_post_kickoff_discarded,
            "n_duplicates_removed": self.n_duplicates_removed,
            "n_valid": self.n_valid,
        }


def validate_and_normalize_tick_rows(
    candidate_rows: Sequence[Mapping[str, Any]],
    *,
    allowed_books: frozenset[str] | None = None,
) -> tuple[list[dict[str, Any]], TickNormalizationStats]:
    """Valida y normaliza filas al esquema `11 + 1` del contrato `CONTRACT_ODDS_TIMESERIES.md`.

    Descarta estrictamente:
    - Filas con columnas faltantes, deportes fuera de `{"football", "nfl"}` o `raw_sha256` inválido.
    - Cuotas fuera de `[1.01, 1000.0]`.
    - Capturas post-kickoff (`ts_captured > ts_event_start`).
    - Duplicados exactos de `(event_id, market, line, selection, book, ts_captured, source)`.
    """
    stats = TickNormalizationStats(n_input=len(candidate_rows))
    seen_keys: set[tuple[Any, ...]] = set()
    valid_rows: list[dict[str, Any]] = []

    for raw in candidate_rows:
        if not isinstance(raw, Mapping):
            stats.n_missing_or_invalid += 1
            continue

        event_id = str(raw.get("event_id") or "").strip()
        sport = str(raw.get("sport") or "").strip().lower()
        league = str(raw.get("league") or "").strip()
        market = str(raw.get("market") or "").strip().lower()
        selection = str(raw.get("selection") or "").strip().lower()
        book = str(raw.get("book") or "").strip().lower()
        source = str(raw.get("source") or "scraped_ws").strip()
        raw_sha = str(raw.get("raw_sha256") or "").strip().lower()

        if (
            not event_id
            or sport not in SUPPORTED_TIMESERIES_SPORTS
            or not league
            or market not in VALID_MARKETS_SELECTIONS
            or selection not in VALID_MARKETS_SELECTIONS[market]
            or not book
            or source != "scraped_ws"
            or not _HEX64_RE.fullmatch(raw_sha)
        ):
            stats.n_missing_or_invalid += 1
            continue

        if allowed_books is not None and book not in allowed_books:
            stats.n_missing_or_invalid += 1
            continue

        line_norm = normalize_line_value(raw.get("line"))
        if market in LINE_NULL_MARKETS:
            if line_norm is not None:
                stats.n_missing_or_invalid += 1
                continue
        elif market in LINE_REQUIRED_MARKETS and line_norm is None:
            stats.n_missing_or_invalid += 1
            continue

        dt_cap = parse_utc_datetime(raw.get("ts_captured"))
        dt_start = parse_utc_datetime(raw.get("ts_event_start"))
        if dt_cap is None or dt_start is None:
            stats.n_missing_or_invalid += 1
            continue

        price_raw = raw.get("price_decimal")
        if price_raw is None or isinstance(price_raw, bool):
            stats.n_out_of_range += 1
            continue
        try:
            price_dec = float(price_raw)
        except (TypeError, ValueError):
            stats.n_out_of_range += 1
            continue
        if not math.isfinite(price_dec) or not (MIN_PRICE_DECIMAL <= price_dec <= MAX_PRICE_DECIMAL):
            stats.n_out_of_range += 1
            continue

        if dt_cap > dt_start:
            stats.n_post_kickoff_discarded += 1
            continue

        ts_cap_iso = format_utc_iso(dt_cap)
        ts_start_iso = format_utc_iso(dt_start)

        dedup_key = (
            event_id,
            market,
            line_norm,
            selection,
            book,
            int(dt_cap.timestamp() * 1000),
            source,
        )
        if dedup_key in seen_keys:
            stats.n_duplicates_removed += 1
            continue
        seen_keys.add(dedup_key)

        valid_rows.append(
            {
                "event_id": event_id,
                "sport": sport,
                "league": league,
                "market": market,
                "line": line_norm,
                "selection": selection,
                "book": book,
                "price_decimal": price_dec,
                "ts_captured": ts_cap_iso,
                "ts_event_start": ts_start_iso,
                "source": "scraped_ws",
                "raw_sha256": raw_sha,
            }
        )

    stats.n_valid = len(valid_rows)
    return valid_rows, stats


class OddsSourceAdapter(Protocol):
    """Interfaz uniforme de los adaptadores modulares en `scrapers/sources/`."""

    metadata: SourceMetadata

    def fetch_snapshots(
        self,
        *,
        sports: Sequence[str] = ("football", "nfl"),
        captured_at: datetime | None = None,
    ) -> list[dict[str, Any]]: ...
