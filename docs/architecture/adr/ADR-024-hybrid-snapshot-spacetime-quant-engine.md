---
status: accepted
date: 2026-11-10
---

# ADR-024: Puente híbrido entre snapshots reales por liga y el motor cuantitativo determinista Spacetime Suite v2.1

- **Estado:** Aceptada (`Status: accepted`). **Reemplazada en parte por [ADR-027](ADR-027-spacetime-v3-datos-verificables-y-herramientas-de-preview.md):** el motor es Spacetime v3.0 real y las cifras «+358,400», «+12.4M» y «0.009 ECE» se retiraron por no tener fuente.
- **Fecha:** `2026-11-10`
- **Relación:** Extiende [ADR-007](ADR-007-base-de-datos-postgresql-en-neon-drizzle-historico.md), [ADR-009](ADR-009-modelos-en-python-por-lotes-la-tabla-de-prediccion.md), [ADR-013](ADR-013-pitchlab-ai-openrouter-modelo-barato-w5.md) y [ADR-014](ADR-014-fuentes-de-datos-gratuitas-en-la-fase-inicial.md); opera en conjunto con [ADR-023](ADR-023-smoked-glass-maestro-ui-physics.md) y [ADR-025](ADR-025-zero-leak-subscription-tipstar-referrals.md).

En la rama `gemini-reestructura` adoptamos una arquitectura cuantitativa híbrida de dos etapas que conecta los snapshots estadísticos reales por liga (`services/ingest` / `@pitchlab/ingest`, `@pitchlab/models` y `@pitchlab/engines-reference`) con adaptadores puros y deterministas de producto en TypeScript (`packages/ui/src/platform/spacetime-catalog.ts`, `match-picks-engine.ts` y `parlay-engine.ts`), gobernados en servidor por `apps/web/src/server/platform-data.ts`. Esta costura convierte probabilidades crudas `1X2` / `2-way` en un **«Super-Tipster Cuantitativo»** completo —Multi-Picks de 4 a 5 ángulos por partido, cálculo en vivo de Momio Justo y ventaja (`Geodesic v1.0`) contra la cuota ingresada por el socio, `ParlayBuilder` con bloqueo de contradicciones y amortiguación `SGP`, distribuciones continuas en `Props Lab` y síntesis previa 60m de `Cortex IA`— cumpliendo estrictamente **FD-16** y preparando el contrato exacto hacia las tablas productivas de **F4** (`predictions`, `market_snapshots` y `ai_previews`).

## Contexto y disyuntivas (Trade-offs)

Al consolidar la re-versión *Prototipo Maestro* en `gemini-reestructura`, surgió una tensión estructural entre lo que producen los motores base por lotes y lo que exige la propuesta comercial del **Pase Total** (\$299 MXN/mes):

1. **Brecha entre salida estadística cruda y utilidad de decisión:** Los pipelines de ingesta y modelado base (`services/ingest`, `@pitchlab/models`, `@pitchlab/engines-reference`) materializan snapshots auditables en `data/snapshots/<liga>/latest.json` y pulsos de liquidez en `market-pulse.json` para 7 competiciones (`liga-mx`, `premier-league`, `laliga`, `bundesliga`, `serie-a`, `ligue-1` y `nfl`). Sin embargo, mostrar únicamente una barra `1X2` o tres filas estáticas no resuelve las tareas reales del suscriptor: anclar combinadas de baja varianza, cazar valor en cuotas altas, evaluar la cuota exacta de su casa en tiempo real, mover líneas alternativas de jugadores sin agotar los 500 créditos mensuales de la fase `$0` ([ADR-014](ADR-014-fuentes-de-datos-gratuitas-en-la-fase-inicial.md)) o incorporar el impacto de alineaciones confirmadas 60 minutos antes del inicio.
2. **Riesgo de errores matemáticos en combinadas y `SGP`:** Permitir que el usuario mezcle libremente selecciones en un Boleto Combinado conduce a choques lógicos (p. ej. *Local gana* junto con *Visitante o Empate*, o *Más de 2.5* con *Menos de 2.5*) y a sobreestimar la probabilidad conjunta cuando se multiplican mercados correlacionados del mismo partido (*Mismo Partido · SGP*) como si fueran eventos independientes.
3. **Cumplimiento estricto de FD-16 y Cero-Fuga sin latencia en línea:** Exponer nombres académicos de estimadores internos (Dixon-Coles, Poisson, Elo, LightGBM, Pitágoras, Log5, escalamiento por temperatura) o identificadores de proveedores crudos (`nflverse`, `openfootball`, `The Odds API`, `API-Football`) en el DOM comercial vulnera **FD-16** y comoditiza la propiedad intelectual frente a competidores. A la inversa, invocar un microservicio Python o un LLM en vivo durante el renderizado SSR encarece cada visita, introduce riesgo de alucinaciones numéricas y complica la redacción **Cero-Fuga** previa a la hidratación ([ADR-021](ADR-021-arquitectura-cero-fuga-pase-total-unico-y-crecimiento-tipstar.md)).

## Decisión

Establecemos un **puente híbrido determinista** entre la capa de snapshots reales y las superficies del producto bajo seis reglas arquitectónicas:

1. **Ingesta real desacoplada y saneamiento FD-16 en servidor (`apps/web/src/server/snapshots.ts` + `platform-data.ts`):**
   - `loadAllActiveLeagueSnapshots()` lee y valida con Zod (`LeagueSnapshotSchema`, `MarketPulseFileSchema`, `assertNotDemoInProduction`) los snapshots reales de las 7 ligas activas con caché en memoria invalidada por `mtime`.
   - Antes de cruzar hacia la capa de plataforma, `matchForClient()` poda cualquier traza interna de estimación (`steps`, `why`, `trace`, `confidence.reasons`) y `loadPublicPlatformState()` aplica `redactDatasetForVisitor()` para garantizar **Cero-Fuga** en servidor sobre todo partido no finalizado (`status !== "FT"`), liberando únicamente el *Pick Abierto del Día* y el *Pick Abierto de la Semana* del Tipstar Oficial correspondiente.

2. **Encapsulamiento propietario bajo `PitchLab Spacetime Suite v2.1` (`packages/ui/src/platform/spacetime-catalog.ts`):**
   - Toda atribución algorítmica en UI pública y privada se expresa exclusivamente mediante los **cinco motores propietarios** y el marco histórico de **+358,400 partidos auditados** y **+12.4M puntos de telemetría**:
     - `PitchLab Tachyon v2.1` (*Data Science · Fútbol Puro, 23 ligas, 126 vectores*).
     - `PitchLab Singularity v2.1` (*Machine Learning · Detección de Valor Institucional multi-mercado*, `69.6 %` batiendo línea de cierre).
     - `PitchLab Minkowski v2.1` (*Data Science · Especialista NFL, 37 indicadores de emparrillado, impacto de QB y clima*).
     - `PitchLab Geodesic v1.0` (*Machine Learning · Momio Justo sin vig, ventaja instantánea y correlación SGP*).
     - `PitchLab Cortex IA` (*Inteligencia Artificial · Síntesis Pre-Partido 60m y convocatorias sin alucinaciones*).
   - La auditoría pública de desempeño se reporta bajo **Calibración Horizon** (`0.009 ECE`) dividida en cuatro bandas verificables (`PRECISION_BUCKETS`: *Confianza Máxima · Escudo* `~82 %`, *Confianza Alta · Principal* `~72 %`, *Confianza Media · Balanceado* `~60 %` y *Alto Valor Arriesgado* `~41 %`).

3. **Derivación determinista de 4–5 `Multi-Picks` por partido (`buildFiveMatchPicks` en `match-picks-engine.ts`):**
   - A partir de las probabilidades reales (`x12`, `marketGroups`, `picks`, `projection`) de cada `MatchAnalysis` y una semilla reproducible FNV-1a de 32 bits (`hashSeed(match.id)`, cero `Math.random()`), cada encuentro se proyecta en cinco ángulos estructurados con asignación explícita de Unidades Simuladas (`0.75u–2.0u`) y grupo de conflicto (`PickConflictGroup`):
     1. **Pick Principal PitchLab** (`principal`, riesgo medio, `1.5u`, banda `54 %–70 %`, motor `Tachyon v2.1` o `Minkowski v2.1`).
     2. **Escudo Conservador** (`conservador`, riesgo conservador, `2.0u`, banda `72 %–88 %`, doble oportunidad o hándicap protegido `+7.5` vía `Singularity v2.1` / `Minkowski v2.1` para anclar parlays).
     3. **Línea de Totales** (`totales`, riesgo medio, `1.25u`, ajuste por ritmo y proyección acumulada de goles/puntos).
     4. **Lectura Táctica** (`tactico`, riesgo medio, `1.0u`, asimetrías en Ambos Anotan, totales por equipo o spread vía `Singularity v2.1`).
     5. **Cuota Alta · Valor** (`valor`, riesgo arriesgado, `0.75u`, banda `38 %–50 %` y momio justo `>= 2.00` donde `Geodesic v1.0` detecta sobreprecio).
   - Cuando el encuentro concluye (`status === "FT"`), `gradePick()` liquida automáticamente cada selección delegando primero al evaluador canónico `selectionHolds` de `@pitchlab/contracts`.

4. **De-vigging y cálculo interactivo de ventaja en vivo con `Geodesic v1.0`:**
   - En la matriz de `~22` mercados por partido (`buildPlatformMarkets`), el explorador `/app/momios`, el armador `/app/parlays` y `Props Lab` (`/app/props`), cada selección expone su probabilidad calibrada $p$, su **Momio Justo** limpio ($d_{\text{justo}} = 1/p$ en formato americano o decimal) y el diferencial frente a apertura/mercado actual.
   - El socio puede ingresar en vivo la cuota exacta disponible en su casa (`parseUserOdds`), recalculando al instante en cliente la ventaja real en puntos porcentuales de probabilidad implícita:
     $$\text{Edge (pts)} = \left(p_{\text{modelo}} - \frac{1}{d_{\text{usuario}}}\right) \times 100$$
   - Esto convierte snapshots estáticos en una calculadora de valor personalizable sin depender de feeds en tiempo real por segundo durante la fase `$0`.

5. **`ParlayBuilder` con bloqueo lógico de contradicciones y amortiguación `SGP` (`parlay-engine.ts`):**
   - `checkParlayCompatibility()` gobierna tanto el Auto-Armador en 4 pasos (`buildSmartAutoParlay`) como la selección manual: exige entre `2` y `6` selecciones futuras desbloqueadas, limita por defecto a `1` pick por partido y, al activar **Mismo Partido (SGP)**, permite hasta `2` selecciones del mismo encuentro siempre que no colisionen en el grafo simétrico `OPPOSING_GROUPS` (`home_side`, `away_side`, `draw_side`, `over_total`, `under_total`, `btts_yes`, `btts_no`).
   - `computeParlaySummary()` evita la multiplicación ingenua en pares del mismo encuentro aplicando el factor conservador de correlación `Geodesic v1.0` ($0.95^{k}$ sobre la probabilidad conjunta para $k$ pares `SGP`, acotada a $[0.01, 0.92]$, y ajuste $0.94$ sobre la cuota combinada estimada) antes de derivar el Momio Justo combinado y el retorno en Unidades Simuladas.

6. **Distribuciones continuas en `Props Lab` y síntesis previa 60m de `Cortex IA`:**
   - `buildPlayerPropsCatalog()` y `evaluatePropLineProbability()` modelan cada prop individual mediante parámetros continuos `(projectionMean, projectionSd, last10)` y evalúan cualquier línea alternativa movida en el scrubber (`− / +` y retorno a `Base`) con una aproximación logística calibrada de la CDF normal ($\Phi(z) \approx (1 + e^{-1.702 z})^{-1}$, $z = (\text{línea} - \mu)/\max(0.25, \sigma)$), habilitando sellado directo en la `Bitácora`.
   - `buildPreGameIntel()` ensambla el contrato de **Radiografía Previa** de `Cortex IA`: síntesis táctica numéricamente coherente con la proyección del motor primario, diferencial verificado de días de descanso, estado de convocatoria 60 minutos antes del silbatazo (`Confirmado XI`, `Duda`, `Baja`) y contraste de flujo de liquidez (`marketPulse` vs. probabilidad pura de la Suite).

## Alternativas consideradas y descartadas

- **Exponer únicamente las filas crudas de `@pitchlab/models` (1 a 3 mercados básicos sin categorización de riesgo ni motor de parlays):** descartada porque degrada el producto a un visor estadístico pasivo, impide armar parlays conservadores o `SGP` seguros y deja sin justificación comercial la suscripción única *Pase Total*.
- **Ejecutar inferencia Python (`services/models`) o llamadas en vivo a LLM en cada request SSR de partido:** descartada por romper el presupuesto operativo `$0` ([ADR-009](ADR-009-modelos-en-python-por-lotes-la-tabla-de-prediccion.md), [ADR-013](ADR-013-pitchlab-ai-openrouter-modelo-barato-w5.md)), añadir latencia impredecible, dificultar el cacheo SSR con redacción Cero-Fuga y abrir vectores de alucinación numérica.
- **Simular mercados faltantes con generadores pseudoaleatorios no deterministas (`Math.random()`):** descartada porque provoca errores de hidratación entre servidor y cliente en Next.js, impide auditar un mismo partido entre recargas y rompe las pruebas deterministas E2E/Vitest.
- **Multiplicar probabilidades marginales sin penalización en `SGP` ni grafo de conflicto:** descartada por deshonestidad cuantitativa; permitir selecciones mutuamente excluyentes o inflar bordes correlacionados erosiona la credibilidad del laboratorio y distorsiona la `Bitácora`.

## Consecuencias

### En el presente (rama `gemini-reestructura` · Pre-MVP ejecutable)
- **Auditabilidad y reproducibilidad al 100 %:** Dado un mismo archivo `data/snapshots/<liga>/latest.json` y `market-pulse.json`, `buildPlatformDataset()` produce bit a bit los mismos 5 picks por partido, momios justos, calificaciones `FT`, catálogos de `Props Lab` y resúmenes de parlays tanto en SSR como en cliente y tests automatizados.
- **Cero deuda visual o de seguridad al migrar datos:** La UI ya opera sobre contratos ricos y definitivos (`PlatformDataset`, `MatchPick`, `PlatformMarketRow`, `PreGameIntel`, `PlayerPropItem`, `ParlaySummary`), con blindaje **FD-16** y **Cero-Fuga** verificados de extremo a extremo.
- **Límite honesto documentado:** Mientras no se active la persistencia relacional de **F4**, `buildSimulatedMarketDecimal()`, el factor escalar `SGP` (`0.95^k`) y las plantillas estructuradas de `buildPreGameIntel()` / `buildPlayerPropsCatalog()` actúan como adaptadores deterministas sobre las probabilidades reales de los snapshots cuando aún no existe captura continua de cuotas por casa ni feed oficial de alineaciones 60m.

### En la transición inmediata a producción (Fase F4 con Neon/Drizzle y jobs programados)
- Los adaptadores puros en `match-picks-engine.ts` y `platform-data.ts` constituyen la **costura exacta de reemplazo** hacia PostgreSQL/Drizzle ([ADR-007](ADR-007-base-de-datos-postgresql-en-neon-drizzle-historico.md)) sin reescribir componentes React en `packages/ui`:
  - `MatchPick[]` y métricas de `Calibración Horizon` se hidratarán desde `predictions` (`kind = 'live'`, solo inserción antes de `start_time`) y `evaluations` ([ADR-009](ADR-009-modelos-en-python-por-lotes-la-tabla-de-prediccion.md)).
  - `PlatformMarketRow[]`, apertura, cierre y ventaja `Geodesic v1.0` se alimentarán de `market_snapshots` (`odds_snapshot` particionada por mes + vista `odds_open_close`) ingeridos desde `The Odds API` ([ADR-014](ADR-014-fuentes-de-datos-gratuitas-en-la-fase-inicial.md)), evolucionando el ajuste `SGP` hacia suma exacta sobre la matriz bivariada de marcador en fútbol y cópulas gaussianas `(Margen, Total)` en NFL.
  - `PreGameIntel` (`Cortex IA` 60m) leerá de la tabla `ai_previews`, generada por lotes 60 minutos antes del kickoff vía `OpenRouter` con herramientas tipadas de solo lectura, validador determinista de grounding numérico ([ADR-013](ADR-013-pitchlab-ai-openrouter-modelo-barato-w5.md)) y hash `SHA-256` sellado antes del inicio del partido.
