# A29 — Reporte Prospectivo de Paper-Trading · Semana 1 (`v3.2`)

- **Corte prospectivo obligatorio:** `ts_pick > 2026-11-08T20:30:00Z` (`holdout_sealed` cerrado y consumido en `v3.1` — `OBSERVADO`).
- **Estado de `production_enabled` (`src/data/prediction/production_segments_v3_1.json`):** **`0 / 60` segmentos encendidos** (`SHA-256 = 0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc` — `OBSERVADO`).
- **PRNG y remuestreo bootstrap:** `mulberry32`, `n_resamples = 1000`, `seed = 20261111` (paridad IEEE-754 `< 1e-12` Python ↔ TypeScript).
- **Privacidad de banca (Regla §0.5):** `stake_u` y Quarter-Kelly viven exclusivamente en este ledger interno de investigación; `MatchOutlook` público permanece libre de stakes.

---

## 1. Cartera Prospectiva Real (`provenance: real`)

### 1.1 Progreso hacia la Puerta de Activación (`150` picks reales + `n_clv >= 15` por segmento)

| Criterio de Puerta (`§0.3` / `Ola 3`) | Valor Actual (`OBSERVADO`) | Umbral Requerido | Estado |
|---|---|---|---|
| Picks prospectivos reales (`ts_pick > 2026-11-08T20:30:00Z`) | **`0 / 150`** (`0.0%`) | `>= 150` | `PENDIENTE` |
| Picks reales con cierre sharp válido (`pinnacle` / `smarkets`) | **`0`** | `>= 15` por segmento candidato | `PENDIENTE` |
| Segmentos `liga::mercado` con `n_clv >= 15` e `IC 95% CLV% > 0` | **`0 / 60`** | `>= 1` segmento + puerta global | `0 / 60` (`production_enabled = false`) |

### 1.2 Diagnóstico de Captura Real en `B3` (`OBSERVADO`)

- **Directorio inspeccionado (solo lectura):** `../web-scraping/data/odds_timeseries` (`0` archivos `.jsonl` reales escritos).
- **Estado reportado por `health.json` (`B3`):** `capture_status = "prospective_capture_pending"`, `events_tracked = 0`, `total_rows_written = 0`, `calendar_upcoming_events_count = 66` (`OBSERVADO`).
- **Causa raíz verificada sin evasión anti-bot (`LEGAL_FUENTES_CUOTAS.md`):** las 2 fuentes aprobadas `api_only` (`betfair_exchange, the_odds_api`) carecen hoy de variables de entorno (`THE_ODDS_API_KEY`, `BETFAIR_APP_KEY`, `BETFAIR_SESSION_TOKEN`) en este entorno, y las 5 fuentes web directas (`pinnacle`, `smarkets`, `caliente`, `codere`, `action_network`) permanecen bloqueadas legalmente (`blocked_pending_owner_decision`, cero bypass de Cloudflare/ToS) (`OBSERVADO`).
- **Ledger prospectivo real:** `data/ledger/picks_v3_2_prospective.jsonl` inicializado limpiamente con `0` picks reales, `head_hash = 0000000000000000000000000000000000000000000000000000000000000000` (`OBSERVADO`).

### 1.3 Resumen Global — Cartera Real (`provenance: real`)

| Métrica | Estimación Puntual e IC 95% Bootstrap | Significancia | Etiqueta Epistémica |
|---|---|---|---|
| `n_picks` / `n_clv` / `n_settled` | `0` / `0` / `0` | `no significativa` | `OBSERVADO` |
| `CLV%` (vs cierre sharp sin margen) | N/A (`no significativa`, n=0) | `no significativa` | `OBSERVADO` |
| `CLV_prob` (puntos porcentuales) | N/A (`no significativa`, n=0) | `no significativa` | `OBSERVADO` |
| `ROI%` sobre unidades liquidadas | N/A (`no significativa`, n=0) | `no significativa` | `OBSERVADO` |
| `MaxDD` (drawdown máximo en `u`) | 0.0000u (IC 95%: N/A, n=0) | `no significativa` | `OBSERVADO` |

### 1.4 Desglose por Segmento — Cartera Real

- Sin picks reales emitidos en la Semana 1 (`0 / 60` segmentos con muestra prospectiva real — `OBSERVADO`).

---

## 2. Validación Funcional Extremo a Extremo sobre Fixture Sintético (`provenance: "synthetic"`)

> **ADVERTENCIA DE SEPARACIÓN ESTRICTA (`Regla §0.4`):** Todos los registros de esta sección provienen exclusivamente de `data/ledger/fixtures/synthetic_odds_timeseries_v3_2.jsonl` y están marcados línea por línea con `"provenance": "synthetic"` en `data/ledger/fixtures/picks_v3_2_synthetic_fixture.jsonl`. **Aportan `0` picks a la puerta de `150` picks reales y jamás habilitan `production_enabled`.** Su único propósito es demostrar operatividad causal extremo a extremo del motor.

### 2.1 Invariantes Verificados en el Fixture Sintético (`OBSERVADO`)

- **Registros encadenados SHA-256 (`pick` + `closing` + `settlement`):** `12` líneas (`4` picks llenados, `4` cierres sharp, `4` liquidaciones), `100%` con `"provenance": "synthetic"` (`12/12`).
- **`head_hash` criptográfico (idéntico en Python y TypeScript):** `eaea0bae54ca3d7fbca0f342f93463ad9b5bc8e821285c53ae24f264496243d6`.
- **Corte prospectivo:** evento histórico `ws:football:E0:20261108:chelsea:arsenal_legacy` (`2026-11-08T20:00:00Z <= 2026-11-08T20:30:00Z`) bloqueado al 100%.
- **Causalidad y `execution_delay = 2.0 min`:** ticks en `+1.0 min` (`b365` en `B1::1x2`) y `+1.25 min` (`draftkings` en `E0::totals`) ignorados en la decisión y rechazados como llenado prematuro; `E0::totals` queda no llenado (`unfilled_no_post_delay_tick`) al carecer de tick `>= +2.0 min`.
- **Prioridad de cierre sharp (`resolve_closing_odds`):** `pinnacle` en `B1::1x2` y `D2::1x2`; fallback automático a `smarkets` cuando `pinnacle` está ausente en `MEX::ah` y `SP1::1x2`.
- **Liquidación exacta post-partido:** `win` (`B1::1x2`, `D2::1x2`), `half_loss` en línea asiática `-0.25` con empate `1-1` (`MEX::ah`), y `loss` (`SP1::1x2`).

### 2.2 Métricas Globales del Fixture Sintético (`provenance: synthetic` — Muestra de Prueba Funcional)

| Métrica (`provenance: synthetic`) | Estimación Puntual e IC 95% Bootstrap | Significancia Estadística |
|---|---|---|
| `n_picks` / `n_clv` / `n_settled` | `4` / `4` / `4` | Muestra sintética (`n < 15`, no inferencial) |
| `CLV%` | +8.15% (IC 95%: [+4.85%, +10.51%], `significativa_positiva`) | `significativa_positiva` |
| `CLV_prob` | +3.83 pp (IC 95%: [+2.29, +4.83] pp, `significativa_positiva`) | `significativa_positiva` |
| `ROI%` | +22.84% (IC 95%: [-66.67%, +107.02%], `no significativa`) | `no significativa` |
| `MaxDD` | 1.0000u (IC 95%: [0.0000u, 4.0000u]) | `no significativa` |

### 2.3 Desglose por Segmento del Fixture Sintético (`provenance: synthetic`)

| Segmento | `n_picks` | `n_clv` | `CLV%` (IC 95%) | `CLV_prob` (IC 95%) | `ROI%` (IC 95%) | `MaxDD` |
|---|---:|---:|---|---|---|---|
| `B1::1x2` | 1 | 1 | +8.45% (IC 95%: [+8.45%, +8.45%], `no significativa`) | +4.19 pp (IC 95%: [+4.19, +4.19] pp, `no significativa`) | +102.00% (IC 95%: [+102.00%, +102.00%], `no significativa`) | 0.0000u (IC 95%: [0.0000u, 0.0000u]) |
| `D2::1x2` | 1 | 1 | +3.13% (IC 95%: [+3.13%, +3.13%], `no significativa`) | +1.49 pp (IC 95%: [+1.49, +1.49] pp, `no significativa`) | +110.00% (IC 95%: [+110.00%, +110.00%], `no significativa`) | 0.0000u (IC 95%: [0.0000u, 0.0000u]) |
| `MEX::ah` | 1 | 1 | +10.01% (IC 95%: [+10.01%, +10.01%], `no significativa`) | +4.96 pp (IC 95%: [+4.96, +4.96] pp, `no significativa`) | -50.00% (IC 95%: [-50.00%, -50.00%], `no significativa`) | 1.0000u (IC 95%: [1.0000u, 1.0000u]) |
| `SP1::1x2` | 1 | 1 | +11.01% (IC 95%: [+11.01%, +11.01%], `no significativa`) | +4.71 pp (IC 95%: [+4.71, +4.71] pp, `no significativa`) | -100.00% (IC 95%: [-100.00%, -100.00%], `no significativa`) | 1.0000u (IC 95%: [1.0000u, 1.0000u]) |

---

## 3. Trazabilidad, Hashes Congelados `v3.1` y Comandos Reproducibles

### 3.1 Hashes SHA-256 Verificados en Solo Lectura (`OBSERVADO`)

| Artefacto Congelado (`v3.1`) | SHA-256 (`OBSERVADO`) |
|---|---|
| `src/data/prediction/production_segments_v3_1.json` | `0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc` |
| `src/data/prediction/blend_weights_v3_1.json` | `b29d7a451f6011126997c122778b42ad3239c78337d17c5fa78d550f5c92739b` |
| `src/data/prediction/pick_policy_v3_1.json` | `2359c8f8822ea394a380202c04e0bcd010d1a3fae7c5c25b8c11ebe810bfb7d1` |
| `src/data/prediction/stale_lines_config.json` | `8bcb9c7be93270cde0cac2d58bc19f0381184dd2e769f358dd28334db2a05eac` |

### 3.2 Comandos Reproducibles

```powershell
Set-Location "C:\Users\T490s\Desktop\Proyectos\PitchLab\.worktrees\prediction-lab"
# 1) Corrida prospectiva real contra B3 (idempotente):
.\research\prediction-lab\.venv\Scripts\python.exe services/models/paper_trading.py --timeseries-dir ../web-scraping/data/odds_timeseries --ledger data/ledger/picks_v3_2_prospective.jsonl --provenance real --week 1
# 2) Corrida funcional extremo a extremo sobre fixture sintético separado (idempotente):
.\research\prediction-lab\.venv\Scripts\python.exe services/models/paper_trading.py --timeseries-dir data/ledger/fixtures/synthetic_odds_timeseries_v3_2.jsonl --model-probs data/ledger/fixtures/synthetic_model_probs_v3_2.json --results data/ledger/fixtures/synthetic_results_v3_2.json --ledger data/ledger/fixtures/picks_v3_2_synthetic_fixture.jsonl --provenance synthetic --settle --week 1
# 3) Verificación cruzada Python + TypeScript:
.\research\prediction-lab\.venv\Scripts\python.exe -m pytest services/models/test_paper_trading.py -v
npx vitest run tests/prediction/ledger_prospective.test.ts
```
