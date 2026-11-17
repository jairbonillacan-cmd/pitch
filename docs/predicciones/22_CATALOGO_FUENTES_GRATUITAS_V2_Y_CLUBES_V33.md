# 22 — Catálogo de Fuentes Gratuitas (Olas 1 y 2), `Meridian v2.0 / v3.0` y `Tachyon v3.3 / v3.4 Live-Complete` (`EXP_V33`–`EXP_V36`)

**Experimentos:** `EXP_V33` / `EXP_V35` (Selecciones) y `EXP_V34` / `EXP_V36` (Clubes) · **Fecha:** `2026-11-17` · **Corte sellado respetado:** `match_date < 2025-02-02` (`HOLDOUT_CUT_ISO = "2025-02-02T17:30:00Z"`).

---

## 1. Auditoría Legal, de Procedencia y Empírica de 11 Fuentes Gratuitas (`OBSERVADO`)

| Fuente gratuita | Licencia verificada | Cobertura / Volumen | Veredicto científico (`VAL` + Bootstrap `mulberry32`) |
|---|---|---|---|
| `martj42/international_results` (`results`, `shootouts`, `former_names`, `goalscorers`) | `CC0 1.0 Universal` | `49,071` partidos + `47,914` goles minuto a minuto | **Aceptada (`Meridian v1.0 -> v2.0`):** `npG`, *time-in-lead* minuto a minuto y diversidad de goleadores. |
| `dcaribou/transfermarkt-datasets` (`players` + `player_valuations`) | `CC0 1.0 Universal` | `50,149` jugadores, `656,301` valuaciones `2000–2026` | **Aceptada (`significativa`):** pool nacional Top-23 (`ΔLL = -0.00232` en selecciones) y valor relativo de plantilla en clubes (`ΔLL = -0.00093`). |
| `dcaribou/transfermarkt-datasets` (`games` + `club_games`) | `CC0 1.0 Universal` | `88,958` partidos con entrenadores y copas `CL/EL/ECL/FAC/DFB/CDR/CIT/FRC` | **Aceptada (`significativa`):** historial `PAE` de entrenadores + **fatiga oculta entre semana por Champions/Copas** (`2..5d < match_date`, `ΔLL = -0.00109` vs `v3.0`). |
| `dcaribou/transfermarkt-datasets` (`appearances.csv.gz`) | `CC0 1.0 Universal` | `1,894,350` apariciones jugador-partido (`2012–2026`) | **Aceptada (`significativa` en clubes):** valor real del XI alineado y detector de merma por lesiones (`realized_xi / top11_roster`, `ΔLL = -0.00099` vs `v3.0`); en selecciones aporta minutos en copas élite (`Meridian v3.0`). |
| `dcaribou/transfermarkt-datasets` (`transfers.csv.gz`) | `CC0 1.0 Universal` | `154,155` fichajes `< 2025-02-02` (cesiones futuras `>= match_date` filtradas) | **Mayor ganancia en Ola 2 de Clubes (`significativa`):** flujo neto de talento e inversión `120d` detecta *fire sales* veraniegos y refuerzos de ascenso antes de que Elo reaccione (`ΔLL = -0.00129` vs `v3.0`). |
| `statsbomb/open-data` (`season_id = 27`, Big-5 `2015/2016`) | *StatsBomb Public Data User Agreement* (`< 2020`) | `180` partidos / `360` actuaciones de equipo | **Resuelve tarea pendiente `P1-1`** ([`03_FUENTES_DATOS_GRATUITOS.md`](03_FUENTES_DATOS_GRATUITOS.md)): $R^2 = 0.5289$ (local) / $0.4848$ (visita). |
| `datasets/population` + `datasets/gdp` (Banco Mundial / OKFN) | `ODC-PDDL-1.0` / `CC-BY-4.0` | Series globales rezagadas `Year <= match_year - 1` | **Aceptada en `VAL 2010..2019` (`Meridian v3.0`):** baja `2010–24 LL` a `0.89488` (`"no significativa"` vs `v2.0`; `v2.0` se retiene por defecto para `2026`). |
| `xgabora/Club-Football-Match-Data` (`EloRatings.csv`) | `MIT License` | `273,972` registros `ClubElo` (`2000–2026`) | Auditada y cacheada con SHA-256 (`features.parquet` ya tenía `100%` cobertura en `clubelo_diff`). |
| `Open-Meteo Historical Archive` (ERA5 diario) | `CC-BY 4.0` | Top sedes (`HTTP 429` respetado sin reintentos agresivos) | **Descartada en `VAL`:** `0.900252 > 0.899523` frente a `thermal_climate_adv` determinista. |
| Columnas internas extra `matches.parquet` (`reds`, `HTGD`, `referee`) | Propia | `182,562` partidos locales | **Descartadas en `VAL <= 2023`:** colineales con las `113` features de `Tachyon v3.0`. |
| `Dato-Futbol/fifa-ranking` y `Oscar343/soccer-dataset` | **Bloqueadas en auditoría legal** | `Dato-Futbol` sin `LICENSE` (`404`); `Oscar343` redistribuye `API-Football` | **Excluidas antes de ingesta** para preservar higiene legal `100%` limpia. |

---

## 2. Avance Decisivo en Fútbol de Clubes (`EXP_V34` + `EXP_V36`, `n = 68,638` partidos `< 2025-02-02`)

Evaluación anual estricta fuera de muestra (`2016..2024`, `< 2025-02-02`, `23` divisiones, `1,000` réplicas bootstrap `mulberry32`, semilla `20261111`):

| Modelo / Variante | Cols Base | Cobertura Viva | `Log-Loss` `[IC 95%]` | `Brier` | `RPS` | `ECE` | `ΔLL vs Tachyon v3.0 (113)` `[IC 95%]` | Significancia |
|---|---:|---:|---|---:|---:|---:|---|---|
| `v3_0_live_38_of_113` (`service.ts` actual) | `113` | `33.6%` (`low_coverage`) | `1.01550` `[1.01269, 1.01841]` | `0.60825` | `0.20750` | `0.00679` | `+0.00555` `[+0.00454, +0.00654]` | `significativa` (degradación) |
| `v3_0_full_113` (`PitchLab Tachyon v3.0`) | `113` | *(solo offline)* | `1.00995` `[1.00676, 1.01332]` | `0.60457` | `0.20588` | `0.00731` | `+0.00000` `[+0.00000, +0.00000]` | Referencia base |
| `tachyon_v3_3_candidate` (Ola 1: `+P1-1 + TM6`) | `120` | *(parcial)* | `1.00904` `[1.00580, 1.01254]` | `0.60390` | `0.20554` | `0.00774` | `-0.00091` `[-0.00133, -0.00052]` | `significativa` |
| `v3_3 + W2_Cup` (fatiga Champions/Copas `2..5d`) | `122` | *(parcial)* | `1.00886` `[1.00565, 1.01232]` | `0.60378` | `0.20547` | `0.00806` | `-0.00109` `[-0.00159, -0.00066]` | `significativa` |
| `v3_3 + W2_XI` (XI real € + merma lesiones) | `123` | *(parcial)* | `1.00896` `[1.00570, 1.01245]` | `0.60384` | `0.20549` | `0.00756` | `-0.00099` `[-0.00142, -0.00057]` | `significativa` |
| `v3_3 + W2_Transfers` (flujo fichajes `120d`) | `122` | *(parcial)* | `1.00865` `[1.00543, 1.01215]` | `0.60364` | `0.20541` | `0.00804` | `-0.00129` `[-0.00176, -0.00087]` | `significativa` |
| **`tachyon_v3_4_candidate` (`113 + 14 Open`)** | **`127`** | *(offline)* | **`1.00845` `[1.00511, 1.01193]`** | **`0.60348`** | **`0.20531`** | **`0.00818`** | **`-0.00150` `[-0.00202, -0.00100]`** | **`significativa` (`-0.00059` vs `v3.3`)** |
| **`tachyon_v3_4_live_complete` (`LIVE_38 + 14 Open`)** | **`52`** | **`100.0%` (`ok`)** | **`1.00794` `[1.00475, 1.01149]`** | **`0.60321`** | **`0.20525`** | **`0.00470`** | **`-0.00200` `[-0.00272, -0.00131]`** | **`significativa` (`-0.00756` vs `v3.0 Live`!)** |

### Por qué `PitchLab Tachyon v3.4 Live-Complete` (`52` base cols) supera incluso al modelo de `127` cols
1. **Eliminación simultánea de multicolinealidad y de sesgo entrenamiento-inferencia:** las `75` variables offline de caja rodante de `Tachyon v3.0` introducían sobreajuste entre ligas heterogéneas y obligaban a imputar medianas en vivo (`LL = 1.01550`). Al conservar únicamente las **`38` señales estructurales vivas** (`Elo`, `ClubElo`, `Dixon-Coles`, `xGD`, `PPDA`, `Altitud ISA`, `Descanso`) más las **`14` variables abiertas ortogonales** (`StatsBomb P1-1` + `Transfermarkt CC0` de plantilla, ascendidos, entrenador, fatiga UEFA/Copas, XI real/lesiones y mercado de fichajes), el modelo logra:
   - **`LL = 1.00794`** (mejora **`-0.00756 [-0.00853, -0.00658]` (`significativa`)** frente al modo vivo actual `38/113` y **`-0.00200 [-0.00272, -0.00131]` (`significativa`)** frente al histórico `113/113`).
   - **Calibración `ECE = 0.00470 [0.00300, 0.00725]`** (reducción del `35.7%` en error de calibración respecto a `0.00731` en `Tachyon v3.0`).
   - **Cobertura en vivo `52 / 52 = 100.0%` (`dataQuality.flag = "ok"`)** en `< 0.1 ms` mediante [`club_free_open_state_v3_4.json`](../../src/data/prediction/club_free_open_state_v3_4.json) (`608` clubes activos).
2. **Comparación honesta frente al Cierre de Pinnacle (`n = 68,491`, `LL = 0.99466`):** `v3.4` recorta **`-0.00151 [-0.00201, -0.00098]` (`significativa`)** de la brecha frente a Pinnacle respecto a `v3.0`; al seguir detrás del cierre líquido sin margen, todos los artefactos mantienen `"status": "candidate"` y `"production_activated": false`.

---

## 3. Inventario de Artefactos y Hashes `SHA-256` (`EXP_V34` / `EXP_V36`)

| Ruta | Rol | `SHA-256` |
|---|---|---|
| [`src/data/prediction/model_club_v3_4_live_candidate.json`](../../src/data/prediction/model_club_v3_4_live_candidate.json) | **`PitchLab Tachyon v3.4 Live-Complete`** (`52` base + `23` `div_levels` = `75`, `LL = 1.00794`, `ECE = 0.00470`) | `804d78c3ccd91c73645550ab3e75464d923803c9c6fb68b95a28c6e74d81d7ae` |
| [`src/data/prediction/club_free_open_state_v3_4.json`](../../src/data/prediction/club_free_open_state_v3_4.json) | Estado causal vivo (`608` clubes en `23` divisiones) para cobertura `52/52 = 100%` en TypeScript | `f350f339b152c7a5af30eabc50e3e51fec40709b31eaa85502efb37ea7849f51` |
| [`src/data/prediction/club_v3_4_live_snapshot.json`](../../src/data/prediction/club_v3_4_live_snapshot.json) | `200` partidos `< 2025-02-02` para verificación de paridad `< 1e-12` en `v3.4 Live-Complete` | `9d821da04e00f458ff9a42c12a93677ea08f79cb308181babbc84abede691389` |
| [`src/data/prediction/model_club_v3_4_candidate.json`](../../src/data/prediction/model_club_v3_4_candidate.json) | `PitchLab Tachyon v3.4 Candidate` (`127` base + `23` `div_levels` = `150`, `LL = 1.00845`) | `efb1e1f046e7470579bab28199129437e622b8cdb26684b0908fafa2da1cacf8` |
| [`src/data/prediction/club_v3_4_snapshot.json`](../../src/data/prediction/club_v3_4_snapshot.json) | `200` partidos `< 2025-02-02` para verificación de paridad `< 1e-12` en `v3.4 Candidate` | `22dc92243a59ca8bc147a82018e956975385f401e68a5a4cf05677c511938587` |
| [`src/data/prediction/model_club_v3_3_candidate.json`](../../src/data/prediction/model_club_v3_3_candidate.json) | `PitchLab Tachyon v3.3 Candidate` (`120` base + `23` `div_levels` = `143`, `LL = 1.00904`) | `adb71e7a92b576a2b4c731e1119daf20bd55ae5e0ab8f9126b44d7288828bc25` |
| [`src/data/prediction/club_v3_3_snapshot.json`](../../src/data/prediction/club_v3_3_snapshot.json) | `200` partidos `< 2025-02-02` para paridad `< 1e-12` en `v3.3 Candidate` | `c35fc4a5b9195c80063cd5d8921433504ae53d8c500049bd71c89b5a438ab1c7` |
| [`src/data/prediction/model_motor_a.json`](../../src/data/prediction/model_motor_a.json) | Artefacto congelado `Tachyon v3.0` (**inmutable**) | `3c72967eddc79bb71ca7fcae40bf21aae760269dc62b43cf2b2db7eeacfceec9` |
| [`src/data/prediction/production_segments_v3_1.json`](../../src/data/prediction/production_segments_v3_1.json) | Segmentos de producción congelados `v3.1/v3.2` (**inmutable**) | `0bc03bbff96a5d82a1a7858e1e8623bf7bfdb250c546d2773a71d56ed9ada9bc` |

---

## 4. Reproducibilidad

```powershell
$env:PYTHONDONTWRITEBYTECODE='1'
.\research\prediction-lab\.venv\Scripts\python.exe -B research/prediction-lab/experiments/EXP_V34_club_free_data/run_club_v3_4_experiment.py
.\research\prediction-lab\.venv\Scripts\python.exe -B research/prediction-lab/experiments/EXP_V34_club_free_data/export_club_live_state_v3_4.py
.\research\prediction-lab\.venv\Scripts\python.exe -B -m pytest research/prediction-lab/experiments/EXP_V34_club_free_data -v
npx.cmd vitest run tests/prediction/club_v3_3.test.ts
```
