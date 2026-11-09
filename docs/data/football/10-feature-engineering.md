# 10 · Feature engineering para fútbol (con datos $0 reales)

> Principio rector (§13 de la directiva): todo feature usado para predecir un partido
> se calcula **solo con información disponible antes del instante de predicción**
> (`availableAt` de cada fila es la frontera). Ninguna estadística del partido a
> predecir entra; ninguna media de temporada completa para partidos de media temporada.
> **Fecha:** 2026-11-08.

## 1. Inventario honesto por nivel

| Nivel | Variable | Disponible con datos $0 | Nota |
|---|---|---|---|
| **A** (fundamentales) | Resultados, fechas, equipos, temporada, jornada, localía, goles | ✅ 34,168 partidos | Base de todo modelo reproducible |
| **A** | Sede neutral | ✅ (NFL; fútbol casi siempre false) | |
| **B** (enriquecidas) | Forma reciente, GF/GC rolling, splits local/visita, fuerza de calendario, descanso | ✅ **derivable** del corpus con ventana as-of | Sin costo de datos: se calculan de resultados anteriores |
| **B** | Tiros, posesión, corners, tarjetas, alineaciones, lesiones | ⛔ ninguna fuente gratuita licenciada | Se declara ausente; no se imputa |
| **C** (avanzadas) | xG, xA, event data, pressing | ⛔ | Bloqueado hasta fuente con licencia (`16-cost-comparison.md`) |
| **C** | Cuotas de apertura/cierre (mercado) | ◐ NFL: cierre real (research-only). Fútbol: snapshots The Odds API hacia adelante | El cierre observado **nunca** es input de un modelo que corre antes del partido |

## 2. Features v1 ya implicados por los modelos actuales

- **Dixon-Coles**: ataque/defensa por máxima verosimilitud ajustado por rival (cada gol
  pondera la calidad del contrario), decaimiento temporal exponencial (ξ=0.0019/día ≈
  ventana efectiva ~1 año), ventaja de local y ρ de marcadores bajos estimados de los
  datos, contracción bayesiana (4 pseudo-partidos) para equipos con poca exposición.
- **NFL ratings ridge**: ofensiva/defensa ajustada por rival con fuerza de calendario
  emergente, localía estimada de residuales, σ de margen/total de los propios residuales.

Estos features ya son as-of por diseño: cada jornada se ajusta con la ventana anterior
(verificado por el harness walk-forward de `13-validation-protocol.md`).

## 3. Features candidatas v2 (orden por valor esperado / costo)

1. **Splits local/visita separados** en el DC (hoy el ataque/defensa es único; la
   localía es un multiplicador global).
2. **Elo con margen** como covariable de respaldo para equipos recién ascendidos
   (el DC los trata con contracción; Elo arrastra información entre temporadas).
3. **Forma ponderada** (últimos 5-10 con decaimiento) y **días de descanso**: derivables
   hoy; validar su aporte en walk-forward antes de promoverlos.
4. **Interacción rival-específica de localía** (p. ej. altitud: Toluca, Ciudad de
   México) — derivable de la sede si se incorpora; baja prioridad.
5. **Calibración** (Platt/isotónica por mercado y por liga) — no es un feature pero es
   el siguiente salto de LogLoss esperable (`12-model-improvement-plan.md`).

## 4. Reglas anti-leakage que se aplican (y se prueban)

1. El feature del partido R se calcula con partidos con `date < R` (el harness agrupa
   por jornada y corta por fecha, no por índice).
2. Los parámetros de calibración se ajustan **fuera** del conjunto de prueba final.
3. El mercado (cuotas) entra solo si el snapshot es anterior al instante de predicción;
   el cierre observado se usa exclusivamente como **referencia de evaluación**.
4. Prueba automática propuesta (pendiente en el harness): un dataset que contenga
   cualquier fila con `availableAt > instante de predicción` usado como feature debe
   hacer fallar la corrida — rechazo explícito, no warning.

## 5. Horizontes: a evaluar, no a asumir

Los horizontes típicos (últimos 5/10/20, temporada anterior) se tratan como
hipótesis: cada uno se evalúa con el mismo protocolo walk-forward y se queda solo si
mejora LogLoss/Brier fuera de muestra con IC que no cruce 0. El decaimiento ξ del DC ya
aprendió su horizonte de los datos (por eso la ventana efectiva es ~1 año, no «10
partidos» por convenio).
