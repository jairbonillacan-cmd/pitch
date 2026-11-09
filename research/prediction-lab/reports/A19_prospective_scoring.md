# A19 — Scoring prospectivo de los fixtures pre-registrados

**Implementación:** orquestador (ciclo 6). **Datos:** `artifacts/FIXTURES/predictions_20261109T100153Z.csv`
(`sha256 0a28484d…`, pre-registrado), resultados publicados después en
`data/raw/2627_update/*.csv` (17 divisiones, descargados 2026-11-09 10:47 UTC).

---

## 1. Qué se evalúa y con qué caveat

El ciclo 5 generó 150 predicciones de fixtures del 6–9 nov 2026 y las pre-registró por hash.
En este ciclo, la fuente publicó los resultados y se pueden puntuar **sin reentrenar ni tocar el
modelo**. De los 150, **146** tienen resultado (4 sin publicar, probablemente aplazados).

**Caveat de honestidad:** las predicciones se generaron el 2026-11-09 a las 10:43 UTC, cuando la
fuente aún no contenía estos resultados, pero **los partidos ya se habían jugado** horas antes. Esto
es una evaluación **out-of-sample del pipeline** (el modelo nunca vio estos partidos), no un
pronóstico en tiempo real. Para un test realmente prospectivo habría que predecir antes del kickoff
(ver `PREREGISTRATION_CYCLE2.md`).

## 2. Resultados (146 partidos, mismas cuotas del snapshot)

| Sistema | Log-loss | Brier | RPS | Accuracy | ECE |
|---|---:|---:|---:|---:|---:|
| **modelo** (`motor_a_logistic_v1`) | 0,93943 | 0,55435 | 0,19320 | 0,5479 | 0,1104 |
| **mercado** (de-vig power B365) | **0,91407** | **0,53849** | **0,18610** | **0,5616** | **0,0655** |

Δlog-loss modelo − mercado = **+0,02536** [+0,00585; +0,04434], 99,4 % de remuestras en contra
(bootstrap pareado por división, B=2.000). El mercado vuelve a ganar.

Por división: el modelo gana en E0 (0,896 vs 0,940) y D2/SP2; pierde en el resto, sobre todo en
E1 (1,19 vs 1,14), F1 (1,00 vs 0,90) y SC0 (1,01 vs 0,94). Con 5–12 partidos por celda, las
diferencias por división son ruido y no se interpretan individualmente.

## 3. Lectura

1. **Se confirma la conclusión principal con datos nuevos**: el motor deportivo no bate al mercado
   (+0,025 en 146 partidos, coherente con +0,020 de test).
2. **Alerta de calibración:** el ECE del modelo (0,110) duplica el del mercado (0,066) y está muy
   por encima del ECE histórico (0,011 en test). Con 146 partidos el ECE es ruidoso, pero junto a la
   monitorización live (log-loss 1,027 vs 1,010 de val) sugiere **ligera sobreconfianza en 2026/27**.
   No se cambia el modelo; se registra como señal para el ciclo de calibración.
3. **El pipeline funciona de punta a punta**: estado → features (paridad 300/300) → predicción →
   scoring, sin intervención manual y con pre-registro verificable.

## 4. Limitaciones

- 4 fixtures sin resultado publicado; 10 excluidos por división no entrenada (SC2/SC3).
- Timing: predicciones posteriores al kickoff (ver §1).
- El mercado comparado es el B365 del snapshot (apertura/cierre no distinguible).
- Muestra pequeña por división; solo se interpreta el agregado.

## 5. Reproducibilidad

```bash
cd research/prediction-lab
# resultados publicados (descarga del ciclo 6)
for d in B1 D1 D2 E0 E1 F1 F2 G1 I1 I2 N1 P1 SC0 SC1 SP1 SP2 T1; do
  curl -sSL -o data/raw/2627_update/$d.csv "https://www.football-data.co.uk/mmz4281/2627/$d.csv"; done
./.venv/bin/python pipeline/score_fixtures.py
# -> artifacts/FIXTURES/SCORE_20261109T100153Z.json y REPORT_SCORE_*.md
```
