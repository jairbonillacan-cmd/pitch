# A15 — ¿Aportan las variables EPA al motor NFL?

**Implementación:** orquestador (el subagente A15 descargó los 27 ficheros de `stats_team_week` y
quedó bloqueado construyendo features; el experimento se completó directamente).
**Fuente:** nflverse `stats_team_week` (release `stats_team`), **CC BY 4.0**. 27 CSV (1999–2025),
138 columnas, ~215 KB/año.

---

## 1. Qué se construyó

Por equipo-partido se define:

- `off_epa = passing_epa + rushing_epa` (EPA ofensivo del equipo en ese partido).
- `def_epa` = EPA ofensivo del **rival** en el mismo `game_id` (EPA permitido).

Y para cada partido de la semana **W**:

1. media de `off_epa`/`def_epa` de las semanas **< W** de la misma temporada;
2. si no hay semanas previas (inicio de temporada), media de la **temporada anterior completa**;
3. si no hay historia, 0 (media de liga tras estandarizar).

Features finales: `epa_off_home/away`, `epa_def_home/away`, `epa_net_home/away`, `epa_net_diff`.

**Verificación de causalidad (ejemplo real):** partido `2024_05_NO_KC` (KC local, semana 5). La
feature calculada para KC es `epa_off_att = 1,790030` y `epa_def_att = −2,012587`, exactamente la
media de sus semanas 1–4 (n=4). La semana 5 no entra. El test de viaje en el tiempo del laboratorio
de fútbol no se replicó aquí; esta comprobación puntual y la regla `week < W` son la evidencia.

## 2. Resultados (protocolo de A12: walk-forward, VAL 2010–2019, TEST 2020–2025)

| Partición | Sistema | n | Log-loss | Brier | Accuracy | ECE |
|---|---|---:|---:|---:|---:|---:|
| VAL | `logit` base | 2.560 | 0,64551 | 0,43952 | 0,6523 | 0,0131 |
| VAL | `logit + EPA` | 2.560 | **0,64508** | 0,43908 | 0,6480 | 0,0159 |
| TEST | `logit` base | 1.615 | 0,65917 | 0,45237 | 0,6291 | 0,0166 |
| TEST | `logit + EPA` | 1.615 | **0,65717** | 0,45057 | 0,6303 | 0,0174 |
| TEST | mercado (mismos partidos) | 1.615 | **0,63000** | — | — | — |

Bootstrap pareado (bloques = temporada, B=2.000):

| Comparación | Δlog-loss | IC95 % | frac Δ>0 |
|---|---:|---|---:|
| VAL: EPA − base | **−0,00043** | [−0,00231; +0,00145] | 0,323 |
| TEST: EPA − base | **−0,00199** | [−0,00503; +0,00095] | 0,089 |

## 3. Lectura

1. **EPA aporta una mejora pequeña y no significativa.** En test el punto estimado gana 0,002 de
   log-loss, pero el IC95 % cruza cero (91 % de remuestras a favor). No se puede declarar superior.
2. **No cierra la brecha con el mercado.** El mercado sigue 0,027 por delante en los mismos
   partidos (0,63000 vs 0,65717). La conclusión de A12 se mantiene.
3. **Riesgo de sobreajuste bajo pero real:** añadir 7 features a ~6.900 partidos de entrenamiento
   con C=0,003 apenas mueve la aguja; el ECE empeora ligeramente (0,0166 → 0,0174 en test).

**Decisión:** no se incorpora EPA al artefacto desplegado. Se documenta como línea de investigación
abierta (junto con DVOA, lesiones y alineaciones) para el ciclo 4, y se conserva el artefacto
`pred_epa.csv` para reproducir.

## 4. Limitaciones

- EPA de equipo-semana, no ajustado por rival más allá del `def_epa` del rival.
- Sin EPA por down/distancia, éxito por jugada ni lesiones.
- La verificación de causalidad es puntual (un partido) más la regla `week < W`; no se ejecutó el
  test de viaje en el tiempo completo.
- El mercado NFL se aproxima con moneylines de-vig y una tasa de empate fija del 0,2 %, no con un
  mercado 3-vías nativo.

## 5. Reproducibilidad

```bash
cd research/prediction-lab
# descarga (A15): data/nfl/raw/team_week/stats_team_week_<year>.csv + manifest
./.venv/bin/python models/nfl/epa_experiment.py
# artefactos: models/nfl/artifacts/{pred_base.csv,pred_epa.csv,epa_experiment.json}
```
