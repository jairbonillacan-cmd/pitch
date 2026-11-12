# CONTRACT_XI_PUBLISHED — Contrato de captura legal y anti-fuga de XI confirmado en `T-60m` (`v3.2`)

> **Propietario:** Agente `B7` (`b7-xi`, Ola 3 de `PREDLAB-V3.2`).
> **Alcance:** Instrumentación prospectiva y validación offline en `walk_forward_dev` (`< 2025-02-02T17:30:00Z`) para la hipótesis de ajuste pre-partido con alineaciones oficiales confirmadas (`computeLineupAvailabilityDelta` + `predictMotorAWithAvailability` en `src/domain/prediction/engine.ts:473-634`).
> **Estado en producción:** `production_activated: false` (`production_enabled = 0/60`). Hipótesis no probada pendiente de captura prospectiva real de `ts_xi_published` + serie multi-tick de cuotas (`<= 3.69 min`).

---

## 1. Rutas canónicas y fronteras de escritura

Todo el código, artefactos y datos de este contrato residen exclusivamente dentro de `research/prediction-lab/experiments/EXP_V32_xi/`:

- **Especificación contractual:**
  `research/prediction-lab/experiments/EXP_V32_xi/CONTRACT_XI_PUBLISHED.md`
- **Validador contractual + Colector legal CLI (`--dry-run`, `--once`):**
  `research/prediction-lab/experiments/EXP_V32_xi/xi_collector.py`
- **Experimento walk-forward (`walk_forward_dev`) y estudio de sensibilidad:**
  `research/prediction-lab/experiments/EXP_V32_xi/run_exp_v32_xi.py`
- **Suite de pruebas (paridad TS↔Python `< 1e-12`, anti-fuga, holdout sellado y fuentes legales):**
  `research/prediction-lab/experiments/EXP_V32_xi/test_exp_v32_xi.py`
- **Almacén append-only de alineaciones confirmadas (cuando existan capturas reales legales):**
  `research/prediction-lab/experiments/EXP_V32_xi/data/xi_snapshots.jsonl`
- **Estado y salud de captura del colector:**
  `research/prediction-lab/experiments/EXP_V32_xi/data/xi_health.json`
- **Registro aislado de ensayos walk-forward (sin colisión con `holdout_trial_registry.jsonl`):**
  `research/prediction-lab/experiments/EXP_V32_xi/trial_registry_xi.jsonl`
- **Configuración de cadencia (leída en estricto modo solo lectura):**
  `src/data/prediction/stale_lines_config.json` (`SHA-256 = 8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac`)

---

## 2. Esquema exacto JSONL append-only (`ConfirmedXIRecord`)

Cada línea de `xi_snapshots.jsonl` es un objeto JSON inmutable con los **12 campos obligatorios** siguientes (más metadatos opcionales de trazabilidad causal):

| Campo | Tipo JSON | Regla de validación estricta (`validate_xi_record`) |
|---|---|---|
| `event_id` | `string` | No vacío. En captura prospectiva usa el identificador canónico `ws:football:<league>:<YYYYMMDD>:<home_slug>:<away_slug>` (`CONTRACT_ODDS_TIMESERIES.md` §2) para cruzar 1:1 con ticks de cuotas en `T-60m`. |
| `league` | `string` | Código canónico de competición no vacío (`"E0"`, `"SP1"`, `"D1"`, `"I1"`, `"F1"`, `"MEX"`, `"UCL"`, `"USA"`, etc.). |
| `kickoff_utc` | `string` | Timestamp UTC ISO-8601 con zona explícita y precisión al segundo (`YYYY-MM-DDTHH:MM:SSZ`) del inicio programado del partido. |
| `ts_xi_published` | `string` | Timestamp UTC ISO-8601 exacto al segundo de publicación oficial del XI confirmado. **Prohibido fabricarlo** a partir de `kickoff_utc - 60m` o rellenarlo hacia atrás (ver §3.3). |
| `ts_captured` | `string` | Timestamp UTC ISO-8601 exacto al segundo en que `xi_collector.py` recibió los bytes HTTP del proveedor legal. |
| `lead_minutes_to_kickoff` | `number` | Flotante finito igual a `(kickoff_utc - ts_captured).total_seconds() / 60.0` (tolerancia `<= 1e-4` min frente a los timestamps declarados) y estrictamente `> 0.0`. |
| `home_starting_xi` | `array` | Lista de **exactamente `11` titulares únicos** del equipo local. Cada elemento es un objeto `{player_id, player_name, position?, shirt_number?}` o identificador canónico `string` no vacío, sin duplicados dentro del once. |
| `away_starting_xi` | `array` | Lista de **exactamente `11` titulares únicos** del equipo visitante con las mismas invariantes de unicidad y no vacuidad. |
| `home_missing_key_starters` | `array` | Lista (`>= 0` elementos, sin duplicados) de titulares habituales / piezas clave ausentes del once local (`{player_id, player_name, reason?, market_value_share?}` o `string` canónico). `[]` cuando no faltan titulares clave. |
| `away_missing_key_starters` | `array` | Lista (`>= 0` elementos, sin duplicados) de titulares habituales / piezas clave ausentes del once visitante. |
| `source` | `string` | Identificador canónico en `XI_LEGAL_SOURCES_REGISTRY` con estado `"ok"` o `"api_only"` habilitado. Cualquier fuente con estado `"blocked_pending_owner_decision"` o desconocida dispara `XISourceBlockedError`. |
| `raw_sha256` | `string` | Digest SHA-256 hexadecimal en minúsculas (`64` caracteres `[0-9a-f]{64}`) calculado sobre los bytes crudos exactos de la respuesta HTTP de origen. |

### Campos opcionales de trazabilidad causal
- `ts_xi_published_precision`: `"upstream_explicit" | "transition_poll_upper_bound"` — documenta si `ts_xi_published` provino de un campo explícito del API oficial o de la detección causal de transición entre dos sondeos consecutivos (`empty` en `t_{k-1}` $\to$ `11v11` en `t_k`, donde `ts_xi_published = t_k` actúa como cota superior conservadora libre de fuga).
- `home_availability_ctx` / `away_availability_ctx`: proyección opcional pre-calculada compatible con `TeamAvailabilityContext` (`src/domain/prediction/types.ts`), siempre verificada con valoraciones de plantilla estrictamente previas (`ts_valuation < ts_decision`).

### Regla de idempotencia append-only
- `append_xi_record_jsonl` verifica todas las líneas existentes antes de escribir y deduplica por clave compuesta `(event_id, source, raw_sha256)`.
- Si no existen capturas legales reales en una corrida (`--once` sin credenciales activas o fuera de ventana `T-60m`), **no se crean filas sintéticas ni archivos `.jsonl` vacíos**.

---

## 3. Guardia Anti-Fuga Estricta y Simulación de Ejecución (`2.0 min`)

### 3.1 Cadena causal de decisión (`validate_xi_anti_leakage` $\to$ `XILeakageError`)
Para utilizar un registro de XI confirmado en una decisión pre-partido en el instante `ts_decision`, el validador exige simultáneamente:

$$\texttt{ts\_xi\_published} \;\le\; \texttt{ts\_captured} \;\le\; \texttt{ts\_decision} - 2.0\text{ min} \;<\; \texttt{kickoff\_utc}$$

y además $\texttt{ts\_decision} < \texttt{kickoff\_utc}$:

1. **No-clarividencia de captura (`ts_xi_published <= ts_captured`):** rechaza cualquier registro donde el timestamp de publicación sea posterior a la recepción HTTP o carezca de zona UTC explícita.
2. **Colchón mínimo de ingestión y cómputo (`ts_captured <= ts_decision - 2.0 min`):** garantiza al menos `120.0` segundos reales entre la recepción del payload de alineación y la emisión de la señal en `ts_decision` (parseo, resolución de entidades de jugadores, cruce contra valores de plantilla históricos y evaluación de `predictMotorAWithAvailability`).
3. **Estrictamente pre-kickoff (`ts_decision < kickoff_utc`):** prohíbe cualquier evaluación una vez iniciado el encuentro; combinada con la regla 2 implica `ts_captured < kickoff_utc - 2.0 min`.

### 3.2 Retraso de ejecución en mercado (`execution_delay_minutes = 2.0`)
Emitida la decisión en `ts_decision` viendo únicamente cuotas con `ts_quote_captured <= ts_decision`:

$$\texttt{ts\_fill} \;\ge\; \texttt{ts\_decision} + 2.0\text{ min}, \qquad \texttt{ts\_fill} \;\le\; \texttt{kickoff\_utc}$$

- En datos multi-tick (`source == "scraped_ws"`), el precio ejecutado se resuelve con `backtest.resolve_execution_price(..., execution_delay_minutes=2.0)` tomando el **primer tick posterior** a `ts_decision + 2.0 min` y previo o igual a `kickoff_utc`. Todo tick en el intervalo abierto `(ts_decision, ts_decision + 2.0 min)` queda descartado.
- Por transitividad entre §3.1 y §3.2, una captura de XI solo puede producir un fill válido pre-partido si `ts_captured <= kickoff_utc - 4.0 min` (`2.0 min` de buffer de ingestión hasta `ts_decision` + `2.0 min` de retraso de ejecución hasta `ts_fill`).
- En datos históricos de 2 puntos (`source == "historical_fd"`, solo `open` y `close`), `ts_decision` ocurre en `open` (`~T-24h`), donde ningún XI oficial de `T-60m` se ha publicado aún (`ts_xi_published > ts_decision` $\implies$ bloqueado por §3.1), y la ejecución interpola `historical_delay_alpha = 0.05` sin tocar jamás `close` como precio tomado.

### 3.3 Prohibición de fabricar `ts_xi_published` en lecturas tardías
Si el colector arranca en frío en `T-25m` y un API oficial devuelve `startXI` **sin** incluir el timestamp exacto de publicación en su payload (`published_at` / `updated_at`), el colector **no** inventa `ts_xi_published = kickoff_utc - 60m`. Solo se acepta `ts_xi_published = ts_captured` (`transition_poll_upper_bound`) cuando existe evidencia local verificable de un sondeo previo vacío para ese mismo `(event_id, source)` dentro del intervalo máximo de cadencia (`<= 3.69 min`), o cuando `ts_captured` mismo cumple holgadamente `ts_captured <= ts_decision - 2.0 min` actuando como cota superior causal verdadera (`ts_xi_published_real <= ts_captured`).

---

## 4. Acoplamiento con Cadencia `T-60m` (`stale_lines_config.json`)

El colector lee en modo solo lectura `src/data/prediction/stale_lines_config.json` (`recommended_scraping_cadence.regimes`):

| Parámetro | Valor exacto (`stale_lines_config.json`) | Uso en `xi_collector.py` |
|---|---|---|
| `regime_id` | `"closing_decision_window_t_minus_60m"` | Ventana operativa de captura de XI y cuotas sharp/recreativas. |
| `horizon_minutes` | `60.0` min | Horizonte nominal de publicación oficial UEFA / Liga MX / Top-5 (`T-75m` a `T-55m`). |
| `recommended_interval_minutes` | `3.685835` min (`221.1501` s) | Cota máxima admisible entre sondeos consecutivos (`<= 3.69 min`). |
| `scheduled_interval_seconds` (`0.92x`) | `203.4581` s (`3.3910` min) | Intervalo programado de sondeo sincronizado con `cadence_scheduler.py` (`B3`). |
| `stale_edge_half_life_minutes` | `24.6894` min | Vida media empírica de convergencia recreativa tras movimiento sharp. |
| Ventana activa del colector XI | `[T-75.0 min, T-4.0 min]` | Comienza `15 min` antes de `T-60m` para observar el último sondeo vacío previo a la publicación oficial y corta en `T-4.0 min` (mínimo físico para `2m` ingestión + `2m` fill). |

---

## 5. Auditoría Legal de Fuentes de Alineaciones (`OBSERVADO`, `2026-11-12`)

Todas las pruebas de diagnóstico se ejecutaron con cliente estándar limpio (`Python urllib.request`, `User-Agent: PitchLab-Research-Bot/1.0`, **cero** `StealthyFetcher`, **cero** `solve_cloudflare`, **cero** rotación de huellas TLS/UA):

| `source_id` | Proveedor / Endpoint evaluado | Evidencia HTTP / `robots.txt` / ToS (`OBSERVADO`) | Soporte `ts_xi_published` | Credencial requerida | Estado legal |
|---|---|---|---|---|---|
| `api_football` | API-Football v3 (`https://v3.football.api-sports.io/fixtures/lineups`) | `HTTP 200` limpio (`cf-mitigated: ""`), API comercial documentada para consumo programático; cubre Liga MX (`262`), Top-5 europeas y UCL con `startXI` oficial (`11v11`). | Sin `updated_at` nativo en payload; requiere transición entre sondeos `<= 3.69 min` (`ts_captured` como cota superior causal). | `API_FOOTBALL_KEY` | `api_only` |
| `football_data_org` | football-data.org REST v4 (`https://api.football-data.org/v4/matches/{id}`) | `HTTP 200` limpio en `/v4/competitions`, `robots.txt` permite `User-agent: *` (solo restringe `dotbot`), API oficial documentada con `lineup` en planes habilitados (Top-5 + UCL). | Sin `published_at` nativo por cambio de XI; usa cota superior causal `ts_captured` en sondeo `<= 3.69 min`. | `FOOTBALL_DATA_API_KEY` | `api_only` |
| `espn_site_api` | ESPN undocumented site API (`site.api.espn.com/apis/site/v2/sports/soccer/.../summary`) | `GET` limpio con UA transparente de bot devuelve **`HTTP 403 Access Denied`** (`Server: AkamaiGHost`) tanto en `/robots.txt` como en `/scoreboard`; además Disney Terms of Use (`disneytermsofuse.com/english/`, §2.B.x) prohíben expresamente acceder o extraer datos mediante *"robot, spider, script, or other automated means, including... data mining or web scraping"*. | N/A (bloqueada) | Licencia comercial ESPN | `blocked_pending_owner_decision` |
| `sofascore` | SofaScore (`api.sofascore.com/api/v1/event/{id}/lineups`) | `GET` limpio sin navegador headless devuelve **`HTTP 403`** `{"error":{"code":403,"reason":"Forbidden"}}` (`Server: Varnish`); exige intercepción de navegador y contraviene ToS. | N/A (bloqueada) | Licencia B2B SofaScore | `blocked_pending_owner_decision` |
| `fotmob` | FotMob (`www.fotmob.com/api/matchDetails`) | `https://www.fotmob.com/robots.txt` (`HTTP 200`) declara expresamente **`User-agent: * / Disallow: /api/*`** (solo autoriza buscadores indexadores) y el endpoint interno exige cabecera anti-bot Turnstile `x-mas`. | N/A (bloqueada) | Acuerdo escrito FotMob | `blocked_pending_owner_decision` |
| `flashscore` | Flashscore (`www.flashscore.com`) | `https://www.flashscore.com/robots.txt` (`HTTP 200`) declara **`Disallow: /live/`**, **`Disallow: /scheduled/`**, **`Disallow: /finished/`**, **`Disallow: /draw/`** para `User-agent: *`, y sus ToS prohíben extracción automatizada. | N/A (bloqueada) | Feed comercial Livesport | `blocked_pending_owner_decision` |
| `rotowire_web` | RotoWire Soccer Lineups HTML (`www.rotowire.com/soccer/lineups.php`) | `https://www.rotowire.com/termsandconditions.php` (`HTTP 200`, **Artículo VI: Automated Access; No Scraping**) prohíbe literalmente *"web scraping, data mining, harvesting, crawling, spidering... robots, bots, crawlers, spiders, application programming interfaces not authorized by RotoWire"*; el feed autorizado requiere licencia en `/partner/` y el HTML carece de `ts_xi_published` al segundo. | N/A (bloqueada; si se contrata API `/partner/` pasaría a `api_only` bajo `ROTOWIRE_PARTNER_API_KEY`) | Contrato comercial `/partner/` | `blocked_pending_owner_decision` |

> **Estado actual en el entorno local (`OBSERVADO`):** Ninguna de las variables `API_FOOTBALL_KEY` ni `FOOTBALL_DATA_API_KEY` está definida hoy en el entorno (`0` credenciales activas). En consecuencia, `xi_collector.py --once` opera de forma limpia y determinista reportando `status = "idle_no_active_legal_credentials"`, `records_written = 0` y `fabricated_records = 0`.

---

## 6. Puente hacia `computeLineupAvailabilityDelta` y `predictMotorAWithAvailability`

Cuando un `ConfirmedXIRecord` supera `validate_xi_record` y `validate_xi_anti_leakage(..., ts_decision)` en `T-60m`:

1. **Cruce con plantilla histórica pre-partido (`ts_valuation < ts_decision`):**
   - `missing_market_value_ratio`: suma del peso de valor de mercado de los jugadores ausentes confirmados (`home_missing_key_starters` / bajas por lesión o sanción fuera de `starting_xi`), acotada en `[0.0, 0.60]`.
   - `effective_absences`: combinación ponderada (`DEFAULT_PROSPECTIVE_AVAILABILITY_PRIOR` congelado en `engine.ts:396-423`) acotada en `[0.0, 8.0]` por equipo y `[-6.0, +6.0]` en diferencia visitante-local.
   - `value_ratio_vs_league_median`: razón de valor de plantilla activa frente a la mediana de la liga, con log-ratio truncado en `[-2.0, +2.0]`.
2. **Desplazamiento acotado en espacio logit (`engine.ts:473-634`):**
   - `delta = clip(missing_value_term + squad_value_term + starter_absence_term, -0.35, +0.35)`.
   - `adjLogits = [logit_H + 0.5 * delta, logit_D + 0.0 * delta, logit_A - 0.5 * delta]`, seguido de `softmax3(adjLogits)`.
   - Si `delta == 0` (sin ausencias asimétricas o sin captura válida pre-`ts_decision - 2.0 min`), `predictMotorAWithAvailability(row, model, 0)` devuelve **exactamente** (`|Δ| == 0.0`) las probabilidades base de `predictMotorA(row, model)` (no-degradación estricta garantizada).
