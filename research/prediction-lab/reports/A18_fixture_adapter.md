# A18 — Del fixture a la predicción: adaptador end-to-end

**Implementación:** orquestador (ciclo 5). Cierra el último hueco funcional del motor: hoy el
modelo consume un vector de features precalculado; no existía código que, dado un partido futuro,
construyera ese vector desde el histórico.

**Artefactos:** `pipeline/fixture_features.py` (features desde estado), `pipeline/predict_fixtures.py`
(predicción + mercado), `artifacts/FIXTURES/REPORT_20261109T100153Z.md`,
`artifacts/FIXTURES/predictions_20261109T100153Z.csv`.

---

## 1. Método

1. **Estado de equipos** a partir de los partidos ya jugados (`matches.parquet`): Elo post-partido,
   ventanas r5/r10/EWM, descanso, congestión, priors de temporada y priors de liga.
2. **Features del fixture**: se aplican las mismas definiciones de `features/build_features.py`
   (Elo con regresión entre temporadas y reinicio si cambia la división, ventanas post-partido,
   `season_match_no` contado por localía — igual que Python, `days_rest` desde el último partido,
   `season_progress` con calendario fijo).
3. **Predicción**: artefacto `motor_a_logistic_v1` (imputer mediana → scaler → softmax).
4. **Mercado**: de-vig power de las cuotas B365 del mismo snapshot (A13).

## 2. Validación de paridad (lo importante)

Para 300 partidos históricos se reconstruye el estado **solo con partidos anteriores**, se calculan
las 54 features y se comparan con `features.parquet`:

| Comprobación | Resultado |
|---|---|
| Partidos muestreados (semilla 20261109) | 300 |
| Features idénticas (≤1e-9, NaN≡NaN) | **300/300 (100 %)** |
| Diferencias | 0 |

Esto demuestra que el adaptador reproduce exactamente la ingeniería de features del entrenamiento,
incluidos casos límite (primer partido de un equipo, cambios de división, arranque de temporada).
La primera iteración falló en 28/30 casos (prefijos `h_` vs `home_`, conteo por localía, ventana de
14 días); los errores se corrigieron y quedan documentados en el historial de la sesión.

## 3. Predicción de fixtures reales (out-of-sample)

Snapshot `odds_20261109T100153Z.csv`: 160 fixtures del 6–9 nov 2026, **ninguno presente** en
`matches.parquet` (corte de datos: 6-nov). Se predicen 150; se excluyen 10 de SC2/SC3 porque esas
divisiones no están en el entrenamiento.

| Métrica | Valor |
|---|---:|
| Fixtures predichos | **150** |
| Con mercado en el mismo snapshot | 150/150 |
| `predictions_sha256` (pre-registro) | `0a28484d…2678e3` |
| Diferencia media abs. modelo−mercado (H/D/A) | **5,0 / 2,6 / 4,8 pp** |
| Diferencia máxima | 17,2 / 11,4 / 20,0 pp |

**Interpretación honesta:** estas diferencias **no son señales de valor**. El mercado bate al modelo
por ~0,020 de log-loss en test; una discrepancia grande es más probablemente error del modelo. El
valor del artefacto es doble: (a) demuestra el pipeline completo (fixtures → features → predicción)
y (b) deja un **conjunto prospectivo pre-registrado** (hash del CSV) que podrá puntuarse cuando la
fuente publique los resultados, sin tocar el `test` ya consumido.

## 4. Limitaciones

1. El adaptador vive en Python; la inferencia TS sigue consumiendo vectores precalculados. Para
   producción habría que portar `fixture_features` a TS o publicar el vector desde el backend.
2. Solo fútbol. NFL tiene su propio pipeline (A12/A14) sin adaptador de fixtures.
3. Los nombres de equipo del feed requieren alias (`canonical_team`); un equipo desconocido cae a
   medianas y se marca en `known_home/known_away`.
4. Las 150 predicciones usan cuotas B365 del snapshot; no se comparan todavía con resultados.
5. El estado se reconstruye desde cero en cada ejecución (coste O(partidos)); para producción
   conviene un feature store incremental.

## 5. Reproducibilidad

```bash
cd research/prediction-lab
./.venv/bin/python pipeline/fixture_features.py --validate 300   # paridad 300/300
./.venv/bin/python pipeline/predict_fixtures.py                 # 150 fixtures + mercado
```
