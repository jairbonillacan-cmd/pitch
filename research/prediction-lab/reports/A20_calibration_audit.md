# A20 — Auditoría de calibración de los fixtures (y corrección de una lectura previa)

**Implementación:** orquestador (ciclo 7). **Objetivo:** verificar si la "sobreconfianza" sugerida
por el ECE 0,110 de los 146 fixtures era real y si una temperatura ajustada fuera de muestra la
corregía.

---

## 1. Qué se hizo

1. Se aplicó a las 146 predicciones la temperatura **T=1,0766** ajustada en el ciclo 4 con
   predicciones walk-forward ≤2022 (independiente de los fixtures).
2. Se compararon log-loss y ECE con bootstrap (2.000 remuestras, semilla 20261109).
3. Se inspeccionaron los bins de calibración y se calculó el IC95 % del ECE.

## 2. Resultados

| Variante | Log-loss | Brier | ECE | Accuracy |
|---|---:|---:|---:|---:|
| sin calibrar | **0,93943** | **0,55435** | 0,1104 | 0,5479 |
| temperatura T=1,0766 | 0,94442 | 0,55760 | 0,0991 | 0,5479 |

Δlog-loss (cal − base) = **+0,00501** [+0,00108; +0,00900], 99,1 % en contra.
ΔECE = −0,0093 [−0,0400; +0,0213], **no significativo**.

**IC95 % del ECE:** modelo **[0,072; 0,188]** (media bootstrap 0,128); mercado **[0,046; 0,152]**
(media 0,092). Los intervalos se solapan ampliamente.

### Bins (5 bins, solo confianza de la clase predicha)

| Bin | n | confianza media | acierto | gap |
|---|---:|---:|---:|---:|
| 0,2–0,4 | 30 | 0,381 | 0,367 | −0,015 |
| 0,4–0,6 | 88 | 0,480 | 0,511 | +0,031 |
| **0,6–0,8** | **24** | **0,683** | **0,833** | **+0,151** |
| 0,8–1,0 | 4 | 0,842 | 1,000 | +0,158 |

## 3. Corrección de la lectura previa

En el cierre del ciclo 6 escribí que el ECE 0,110 indicaba **"sobreconfianza en 2026/27"**. Los
datos de este ciclo muestran lo contrario en el tramo que domina el error: el modelo está
**infraconfiado** cuando da 0,68 de probabilidad (acierta 0,83). La temperatura >1 (que aplana las
probabilidades) **empeora** el log-loss justamente por eso.

Además, el ECE con 146 partidos tiene un IC95 % de [0,072; 0,188]: la diferencia con el 0,011 del
test **no es interpretable como deriva estable**. El "0,011 vs 0,110" era una comparación de un
estadístico ruidoso en una muestra pequeña.

## 4. Decisión

- **No se aplica ninguna capa de calibración.** La temperatura no transfiere a los fixtures
  (empeora log-loss, no mejora ECE de forma significativa).
- **No se declara deriva de calibración** con esta evidencia. Se mantiene la monitorización
  (`monitoring_live`) y se exigirá un mínimo de partidos para repetir el análisis con potencia.
  Escalando el error estándar del ECE (≈0,0296 con n=146, i.i.d.): para un IC95 % de ±0,02 se
  necesitan ≈**1.300 partidos**; para ±0,01, ≈**5.000**. La temporada completa (≈8.000) basta para
  el segundo umbral.
- R-25 se reclasifica: de "sobreconfianza" a "ECE ruidoso en muestras pequeñas; sin evidencia de
  deriva".

## 5. Limitaciones

- 146 partidos; 24 en el bin 0,6–0,8. Potencia muy baja.
- El ECE depende del binning y de la clase predicha; se reporta como diagnóstico, no como métrica
  principal.
- La temperatura se ajustó con un modelo walk-forward distinto del artefacto desplegado (que usa
  todas las temporadas ≤2026/27); la transferencia no es perfecta.

## 6. Reproducibilidad

```bash
cd research/prediction-lab
./.venv/bin/python pipeline/experiment_calibration_fixtures.py
# -> artifacts/FIXTURES/calibration_fixtures.json
```
