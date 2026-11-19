# ADR-049: Integración aditiva de Spacetime Suite v5.1 hacia la UI y puente SGP / En Vivo

- **Estado:** Aceptada
- **Fecha:** 2026-11-19
- **Contexto relacionado:** ADR-027 (`@pitchlab/spacetime`), ADR-034 (`Cortex IA`), ADR-035 (rendimiento RSC / bundle), ADR-043 (expansión +37 ligas y árbitros), ADR-048 (tira activa y calibración)

## Contexto

Con la sincronización de **PitchLab Spacetime Suite v5.1** desde `origin/prediction-lab` (`d6dfed5`) en `@pitchlab/spacetime`, el monorepo incorporó 35 módulos TypeScript y 94 artefactos JSON (`23` divisiones / `605` clubes, `839` perfiles arbitrales Empirical Bayes, bandas epistémicas conformales Venn-Abers al `90 %`, micro-mercados HGB-Poisson + tarjetas rojas y puntos por tarjeta, Pago Anticipado exacto + motor In-Play DP, Cópula Student-t QMC para SGP con auditor de sobrecargo de casa, NFL Minkowski v5, Multideporte v4 y guardrail narrativo anti-alucinación).

Sin embargo, la aplicación web seguía consumiendo únicamente `v3.2` (`live_matchday_v3_snapshot.json`, limitado a 6 ligas de fútbol + NFL), aproximando los SGPs con `0.95^k` en cliente y dejando sin bandas de confianza, micro-mercados causales, pago anticipado ni probabilidades dinámicas en vivo a la mayoría de las 57 competencias.

Adicionalmente, [candidate_registry_v5_1.json](file:///C:/Users/T490s/.gemini/antigravity/worktrees/PitchLab/gemini_dos_setup/packages/spacetime/data/candidate_registry_v5_1.json) mantiene `production_activated: false` y los 11 artefactos congelados `v3.0/v3.1/v3.2` deben permanecer inalterados.

## Decisión

1. **Capa aditiva en servidor (`apps/web/src/server/spacetime-v5.ts`), cero peso extra en el bundle cliente:**
   - `@pitchlab/ui` sigue desacoplado de `@pitchlab/spacetime` (no empaqueta los JSON del motor en el navegador).
   - `loadGameDetail()` en `apps/web/src/server/platform-data.ts` ejecuta `buildMatchDetailV5()` en servidor (`< 1.2 ms`/partido, `0` red, protegido por Cero-Fuga) **sin sobrescribir** las filas ya emitidas por `v3.2`:
     - Agrega bandas epistémicas al `90 %` (`EpistemicBandView`), Pago Anticipado (`EarlyPayoutSummaryView`), micro-mercados causales (córners, amarillas, faltas, remates, remates a puerta, tarjeta roja `Over 0.5`, puntos por tarjeta `Booking Points` y mitades `1T/2T`), especiales NFL (`Overtime`, margen exacto `±3`) y Multideporte (`MLB F5`, `NHL Puck Line -1.5 / OT`, `NBA`).
     - Cruza el árbitro real del partido contra los `839` perfiles de `official_priors_v5_1.json` (soportando nombres completos e iniciales).
     - Emite un `MatchOutlookSummary` de respaldo cuando el partido pertenece a ligas fuera de `v3.2` (p. ej. MLS, Brasileirão, Argentina, Championship, MLB, NHL, NBA).
2. **SGP con Cópula Student-t en servidor (`POST /api/parlays/sgp`):**
   - Nuevo endpoint con validación estricta de factores/rangos y limitación por tasa (`checkEndpointRateLimit`), respaldado por `evaluateStudentTSameGameParlayV5()`.
   - `parlay-engine.ts` reemplaza el multiplicador fijo `0.95^k` por estimación direccional inmediata y el componente `<SgpCopulaAuditCard>` muestra la correlación exacta de la cópula y el **Auditor de margen oculto SGP** cuando el socio captura el momio total de su casa.
3. **Probabilidad en vivo minuto a minuto (`LiveMatchDetail.inPlayWinProb`):**
   - `apps/web/src/server/live.ts` calcula `evaluateLiveInPlaySoccerV5()` (DP exacto de 484 estados) usando minuto, marcador y tarjetas rojas reales de los incidentes en curso, renderizado en `<LiveWinProbBar>` dentro de `LiveMatchCenter`.
4. **Doble guardrail anti-alucinación para Cortex IA:**
   - `apps/web/src/server/cortex.ts` audita toda respuesta de OpenRouter con `validateNarrativeAgainstFactSheet()` (`v5.1`) además de `validateCortexText()`, y `CoreMatchViews` usa `verifiedSummaryEs` (`compileDeterministicVerifiedSummaryEs`) como respaldo determinista instantáneo (US\$0) cuando no existe resumen IA cacheado.
5. **Componentes atómicos curados en `@pitchlab/ui` con stories en oscuro/claro y 375 px:**
   - `<EpistemicBandStrip>`, `<EarlyPayoutStrip>`, `<SgpCopulaAuditCard>` y `<LiveWinProbBar>` con `spacetime-v5.stories.tsx`.

## Alternativas descartadas

- **Importar `@pitchlab/spacetime/v5` directamente en `@pitchlab/ui`:** descartado porque inflaría el JS del cliente con artefactos JSON de modelos y rompería la frontera Cero-Fuga / ADR-035.
- **Reemplazar `v3.2` directamente en el 1X2 principal antes de validar en producción:** descartado porque `v5.1` está en estado `candidate` (`production_activated: false`); integrarlo de forma aditiva permite medirlo y entregar valor inmediato sin romper gobernanza.

## Consecuencias

- Todas las ligas de expansión (23 divisiones + copas + MLB/NHL/NBA/NFL) ganan bandas de confianza al 90 %, pago anticipado, micro-mercados causales y panorama 4-Param en la ficha del partido.
- Los parlays del mismo partido reflejan dependencia real (positiva vs negativa) y exponen sobrecargos abusivos de casas (`severe_sgp_tax`).
- Se mantiene la separación limpia para que la siguiente fase («de la UI/ingesta al motor» en `prediction-lab`) inyecte datos vivos de Bzzoiro/Neon directamente en los artefactos y calibración `v5.x`.
