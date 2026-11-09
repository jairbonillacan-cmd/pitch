# Model card — `motor_a_logistic_v1` (fútbol) y `nfl_logistic_v1`

**Versión:** 1.0.0 · **Fecha:** 2026-11-09 · **Autor:** Orquestador (PitchLab Prediction Lab)
**Artefactos:** `src/data/prediction/model_motor_a.json` (`sha256 53fbde0f…f88ca0`),
`src/data/prediction/features_snapshot.json` (`bf174361…eccc6`),
`research/prediction-lab/artifacts/model_nfl/model_nfl.json`.

---

## 1. Qué hace

Predice las probabilidades de **victoria local / empate / victoria visitante** (fútbol) y
**H/T/A** (NFL) a partir de features deportivas pre-partido, mediante una **regresión logística
multinomial** con estandarización. La inferencia en TypeScript es pura (sin dependencias) y
reproduce a Python con `max|Δ| = 4,997×10⁻¹³` (600 comparaciones).

## 2. Uso previsto

- **Sí:** análisis estadístico, comparación con el mercado, monitorización de calibración, research.
- **No:** consejo de apuestas, decisiones con dinero real, ni presentar la salida como "probabilidad
  verdadera". El mercado de cierre fue mejor que el modelo en todos los cortes evaluados.

## 3. Datos de entrenamiento

| | Fútbol | NFL |
|---|---|---|
| Fuente | football-data.co.uk (465 CSV; **licencia no publicada**) | nflverse `games.csv` (**CC BY 4.0**) |
| Partidos | 182.410 (23 divisiones, 2000/01–2026/27) | 6.880 (≤2025, temporada regular + playoffs) |
| Features | 54 deportivas + 23 dummies de división | 22 numéricas + 2 dummies de superficie |
| Corte temporal | `match_date` estrictamente anterior; Elo pre-partido | regla estricta por `gameday`; semana anterior |

## 4. Rendimiento (fuera de muestra)

**Fútbol (test 2024/25 + 2025/26, 16.126 partidos):**

| Sistema | Log-loss | Brier | RPS | Accuracy | ECE |
|---|---:|---:|---:|---:|---:|
| `motor_a_logistic_v1` | 1,01802 | 0,60983 | 0,20820 | 0,4890 | 0,0112 |
| ensemble (alternativa) | 1,01652 | 0,60907 | 0,20789 | 0,4901 | 0,0047 |
| mercado cierre | **0,99770** | **0,59645** | **0,20203** | **0,5062** | 0,0063 |

**NFL (test 2020–2025, 1.615 partidos):** `nfl_logistic_v1` 0,65906 vs mercado 0,62655
(Δ +0,0322 [0,0262; 0,0382]).

## 5. Calibración

- Fútbol val: ECE 0,0112 (top-label); el empate está razonablemente calibrado (ECE 0,0092) pero el
  `argmax` casi nunca lo predice (sesgo estructural; no se corrige con umbrales).
- NFL: ECE 0,0166 en test; empates = 0,22 % de los partidos, clase casi inexistente.

## 6. Limitaciones conocidas

1. **El mercado gana** por 0,0188–0,0203 (fútbol) y 0,0322 (NFL): no hay *edge* demostrable.
2. **Sin xG histórico** con licencia clara; football-data solo añadió `HxG/AxG` en 2026/27.
3. **Licencia de football-data no publicada**; uso comercial NO CONFIRMADO. nflverse sí es CC BY 4.0.
4. Los priors de temporada anterior son exactos al 88,5 % (se probó corregirlos: no mejora,
   resultado negativo documentado).
5. La inferencia usa **features precalculadas en Python**; no es end-to-end desde fixtures.
6. `fallback_motor_a` no se persiste por partido en los artefactos de test.

## 7. Monitorización

- `pipeline/monitoring_report.py` → `artifacts/FINAL/monitoring_live.md` (2026/27 parcial).
- Señal de alarma: si el log-loss live del modelo supera en >0,02 el de `val`, revisar deriva.
- La promoción del ensemble está pre-registrada en `artifacts/PREREGISTRATION_CYCLE2.md`.

## 8. Reproducibilidad y versionado

- Semilla global `20261109`; artefactos con `created_at`, `dataset_sha256` y hashes en este card.
- Cambiar features o hiperparámetros exige nueva versión (`v1.x`) y nueva evaluación fuera de muestra;
  `test` no se reutiliza.
- El modelo se sirve desde `src/domain/prediction/engine.ts`; los tests `tests/prediction/` fijan
  la paridad con Python.
