# Análisis de Datos Históricos, Auditoría Embebida y Backtesting

> **Evidencia Asociada:** Arrays `R` (Resultados) y `AUD` (Auditoría) en `page_nfl_s1.js` y `page_ncaa_s1.js`, tests de backtesting en `batch-verify.test.ts`  
> **Objetivo:** Evaluar la profundidad temporal de los datos en TouchIQ y la viabilidad de realizar backtesting formal  

---

## 1. El Alcance Temporal de los Datos en TouchIQ

`[OBSERVADO]` TouchIQ **no posee una base de datos histórica consultable ni ofrece series temporales navegables** de temporadas pasadas. La aplicación únicamente conserva la información indispensable para operar en la semana en curso (Semana 9 de NFL y Semana 10 de NCAA, temporada 2026).

### Inventario de Registros Embebidos
1. **NFL — Array `R` (121 resultados):**
   - Contiene los marcadores de las semanas 1 a 8 de la temporada 2026.
   - Formato por fila: `[visitante, local, ptsVisitante, ptsLocal]` (ej. `["BAL", "KC", 20, 27]`).
   - Propósito: Calcular el rendimiento de puntos anotados y permitidos en la temporada actual para la fórmula de fuerza (`build()`).
2. **NFL — Baseline `T` (Temporada 2025):**
   - No almacena los partidos de 2025 uno por uno, sino únicamente los totales agregados de puntos a favor y en contra divididos entre 17 juegos.
3. **NCAA — Array `R` (121 resultados seleccionados):**
   - Marcadores de juegos de las conferencias principales.
4. **Historial de Cuotas:**
   - **Inexistente.** No hay registro de cómo abrieron las cuotas ni cómo se movieron a lo largo de la semana. Solo existe el snapshot de DraftKings tomado el 7 de noviembre de 2026.

---

## 2. El Sistema de Auditoría Interna (`AUD`)

`[OBSERVADO]` TouchIQ cuenta con una pestaña o chip de "Resultados" (Auditoría) donde rinde cuentas de las predicciones emitidas en partidos ya concluidos de la jornada:

### Mecánica de la Auditoría en Código
El array `AUD` almacena juegos completados junto con la selección previa emitida por el modelo y un flag booleano de acierto:
```javascript
// En page_nfl_s1.js
const AUD = [
  ["JAX", "PHI", 23, 28, { pk: ["JAX +8.5", true] }] // Pick previo: JAX +8.5 cubrió (pierde por 5)
];

// En page_ncaa_s1.js
const AUD = [
  ["MASS", "BALL", 31, 30, { pk: ["MASS ML", true] }],
  ["SAC", "TOL", 17, 20, { pk: ["TOL ML", true] }],
  ["EMU", "CMU", 7, 35, { pk: ["EMU ML", false] }],
  ["FAU", "UTSA", 60, 29, { pk: ["FAU +1.5", true] }],
  ["SMU", "VT", 51, 28, { pk: ["SMU +1.5", true] }]
];
```

### Registro Oficial vs Replay Retrospectivo
- **En la Interfaz Viva:** La auditoría NCAA reporta un récord oficial de **4 aciertos y 1 fallo (4-1)**.
- **En el Replay Computacional con el Snapshot Actual:** Al ejecutar la función `model0` sobre esos mismos partidos desconectando el resultado del juego (`SA` - Sin Auditoría), el modelo reconstruido reproduce 2 de los 5 picks de forma idéntica, pero difiere en otros 2 (dando un resultado de 2-3).
- **Causa Demostrada:** Esto **no constituye un fraude ni una contradicción**. Los picks almacenados en `AUD` fueron generados por el autor a media semana (4 al 6 de noviembre) cuando los arrays de lesiones y resultados `R` eran más cortos. Al avanzar la semana y agregar más juegos a `R`, la fuerza estimada de los equipos cambió retrospectivamente.
- **Conclusión Técnica:** Al no existir instantáneas versionadas inmutables en una base de datos temporal, el artefacto no permite una reconstrucción histórica exacta fuera de los flags pregrabados.

---

## 3. Limitaciones para el Backtesting Formal

| Criterio de Backtesting | Estado en TouchIQ | Consecuencia Metodológica |
|---|---|---|
| **Puntaje Brier (Brier Score)** | No calculable de forma rigurosa | La muestra de auditoría embebida es de apenas 6 partidos (1 de NFL y 5 de NCAA), estadísticamente insuficiente. |
| **Pérdida Logarítmica (Log Loss)** | No calculable | Muestra insuficiente y falta de cuotas de cierre históricas. |
| **Prevención de Data Leakage (Filtración)** | Parcial | El autor intenta mitigar la filtración con el array `SA` que descuenta el partido analizado, pero los baselines y pesos ya incorporan información posterior. |
| **Backtesting Out-of-Sample** | Imposible en el cliente | No hay forma de congelar el estado del conocimiento a una fecha pasada sin un backend con versionado temporal. |

---

## 4. Estrategia de Series Temporales para PitchLab

PitchLab resolverá completamente este déficit mediante un **diseño de almacenamiento temporal inmutable (Event Sourcing / Bi-temporal Modeling)**:

1. **Tablas de Datos Bi-temporales en PostgreSQL:**
   - Cada cuota, lesión o resultado se almacena con dos marcas de tiempo:
     - `valid_time`: Momento en que el evento ocurrió en el mundo real.
     - `transaction_time`: Momento exacto en que PitchLab lo registró en la base de datos.
2. **Backtesting Replay Inmaculado:**
   - Un analista en PitchLab podrá solicitar: *"Ejecuta el modelo sobre la Semana 9 de la NFL usando estrictamente los datos disponibles el viernes 6 de noviembre a las 14:00 horas"*. El sistema reconstruirá el estado exacto de conocimiento en ese segundo, sin filtración alguna.
3. **Métricas de Calibración Públicas y Verificables:**
   - PitchLab publicará paneles automáticos de calibración (curvas de confiabilidad, Brier scores acumulados y ROI real verificado con timestamp criptográfico).
