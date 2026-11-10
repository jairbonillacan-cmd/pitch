# ADR-022: Abstracción propietaria Spacetime Suite v2.1, derivación de 5 picks por partido y parlays correlacionados

- **Estado:** Aceptada (2026-11-10). Extiende ADR-009 y ADR-013.
- **Decisión del fundador:** bautizar públicamente los motores cuantitativos bajo la arquitectura propietaria *PitchLab Spacetime Suite v2.1* sin revelar fórmulas ni proveedores internos en la UI, generar de 4 a 5 picks estructurados por partido y habilitar parlays multi-liga y *Mismo Partido (SGP)* con ajuste de correlación y bloqueo de contradicciones.

## Contexto

Exponer en la interfaz comercial los nombres académicos de los estimadores subyacentes o las fuentes crudas de ingesta facilita que terceros repliquen la tubería y diluye el posicionamiento tecnológico de la marca (regla FD-16). Paralelamente, el usuario suscriptor espera más que una probabilidad 1X2 aislada: necesita una radiografía previa accionable, múltiples ángulos de entrada por encuentro según su aversión al riesgo y un armador de combinadas que impida errores matemáticos comunes (como mezclar selecciones mutuamente excluyentes o multiplicar probabilidades de un mismo partido como si fueran independientes).

## Decisión

1. **Identidad propietaria *PitchLab Spacetime Suite v2.1* (`packages/ui/src/platform/spacetime-catalog.ts`):**
   - Toda comunicación de producto presenta cinco motores especializados de Data Science, Machine Learning e Inteligencia Artificial entrenados y recalibrados continuamente sobre **+358,400 partidos históricos** y **+1.42M registros tácticos**:
     - **PitchLab Tachyon v2.1** (*Data Science & Simulación*) — goles/puntos esperados y marcadores probables en fútbol.
     - **PitchLab Minkowski v2.1** (*Machine Learning Táctico*) — eficiencia por jugada, trincheras y series en NFL.
     - **PitchLab Horizon v2.0** (*Calibración IA*) — verificación de precisión prometida vs. acierto real en cancha.
     - **PitchLab Geodesic v1.0** (* Inteligencia de Momios & Correlación*) — momio justo sin comisión (*de-vigging*), ventaja esperada y correlación SGP.
     - **PitchLab Cortex IA** (*Síntesis Pre-Partido 60m*) — radiografía ejecutiva previa, bajas e impacto de alineaciones confirmadas 60 minutos antes del inicio.
   - Los nombres internos de algoritmos y proveedores de datos quedan estrictamente prohibidos en el DOM comercial (validado automáticamente en Vitest y Playwright E2E) y se circunscriben únicamente a la atribución legal obligatoria en `/legal/creditos` y documentación interna de ingeniería.
2. **Derivación determinista de 5 ángulos por partido (`packages/ui/src/platform/match-picks-engine.ts`):**
   - A partir de las probabilidades reales de los snapshots (`data/snapshots/<liga>/latest.json`), cada partido produce cinco selecciones tipadas y etiquetadas con grupos de conflicto (`conflictGroup`): (1) *Pick Principal*, (2) *Escudo Conservador*, (3) *Línea de Totales*, (4) *Lectura Táctica* y (5) *Cuota Alta · Valor*, además de ~20 mercados calibrados y catálogo continuo para el *Player Props Lab*.
3. **Motor de Parlays y *Mismo Partido (SGP)* (`packages/ui/src/platform/parlay-engine.ts`):**
   - `checkParlayCompatibility` bloquea selecciones duplicadas o contradictorias dentro del mismo grupo de mercado (p. ej. *Más de 2.5* junto con *Menos de 2.5* o lados opuestos de resultado) y limita cada encuentro a 1 selección cuando SGP está desactivado o hasta 2 selecciones compatibles cuando SGP está activo.
   - `computeParlaySummary` aplica el factor de correlación *Geodesic v1.0* sobre pares del mismo partido antes de calcular la probabilidad conjunta real, el momio justo sin margen y el retorno proyectado en unidades simuladas (`0.5u–5.0u`).

## Alternativas descartadas

- **Mostrar un único pick «mejor valor» por partido:** insuficiente para socios con distintos perfiles de riesgo (conservador vs. cuota alta) y para nutrir el armador de parlays.
- **Multiplicar probabilidades marginales sin corrección en SGP:** sobreestima o subestima sistemáticamente la probabilidad conjunta cuando dos mercados pertenecen al mismo encuentro.
- **Exponer nombres de modelos estadísticos estándar en la UI:** contraviene FD-16 y resta diferenciación frente a competidores.

## Consecuencias

- Cualquier ajuste futuro en la tubería Python por lotes (ADR-009) mantiene intacta la interfaz pública siempre que emita el contrato de snapshot esperado por `buildPlatformDataset`.
- Las pruebas automatizadas (`packages/ui/tests/platform-v4.test.tsx` y `apps/web/e2e/pre-mvp.spec.ts`) fallan inmediatamente si algún término interno prohibido por FD-16 aparece en cualquier ruta pública o privada del producto.
