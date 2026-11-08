# Estado del proyecto PitchLab

> **Propósito:** que cualquier sesión retome el trabajo sin reconstruir el contexto. Se actualiza al cerrar cada fase.
> **Última actualización:** 2026-11-08 · **Rama:** `plan/architecture-v2`

## Estado actual

- **F0 (auditoría):** ✅ completa.
- **F1 (spikes y decisiones):** ✅ completa como investigación de escritorio. Las cotizaciones y la confirmación de términos dependen de que el fundador haga los contactos (FD-14).
- **Siguiente:** F2 (product blueprint).

No hay código de producto. El repo todavía contiene el clon de TouchIQ (Vite + `src/domain` con 24 tests dorados), que se archivará en F4.

## Documentos creados

| Documento | Fase | Estado |
|---|---|---|
| `docs/PITCHLAB_MASTER_PLAN.md` | — | v2 aprobado |
| `docs/DIRECTIVE_CHANGELOG.md` | — | Completo |
| `docs/brand/BRAND_AUDIT.md` | F0 | Completo |
| `docs/brand/ASSET_MANIFEST.md` | F0 | Completo |
| `docs/research/REA_REPORT_INVENTORY.md` | F0 | Completo |
| `docs/research/COMPETITIVE_FEATURE_MATRIX.md` | F0 | Completo (26 funcionalidades y benchmarks) |
| `docs/research/PREDICTION_ENGINE_FINDINGS.md` | F0 | Completo |
| `docs/research/UX_FINDINGS.md` | F0 | Completo (Draftea: solo la landing pública) |
| `docs/architecture/DATA_PROVIDER_MATRIX.md` | F1 | Completo (reemplaza `DATA_SOURCE_FINDINGS.md`: incluye la procedencia de datos de las referencias) |
| `docs/architecture/COMPLIANCE_REGISTER.md` | F1 | Completo (15 puntos) |
| `docs/product/COST_MODEL.md` | F1 | Completo (supuestos explícitos) |
| `docs/execution/FOUNDER_DECISIONS.md` | F1 | 14 decisiones |

## Hallazgos de F1 que cambian supuestos

- **Stripe** prohíbe los pronósticos deportivos *con premio monetario o material*, y admite excepciones con aprobación previa. Regla derivada: **ningún premio por acertar** (leaderboards sin premios).
- **Pinnacle** cerró su API pública el 23 de julio de 2025. El benchmark de mercado será el consenso sin vig de las casas con licencia.
- **Sportmonks no ofrece NFL** (el handoff de LineMate estaba equivocado).
- **Ningún proveedor confirma cuotas de Caliente o Codere MX.**
- Las APIs públicas de MLB y NHL no son aptas para uso comercial sin licencia.
- La **nueva LFPDPPP** está vigente desde el 21 de marzo de 2025.
- Una nueva Ley de Juegos y Sorteos está en preparación (SEGOB, octubre de 2026).

## Decisiones tomadas

- La arquitectura va antes que los prompts (F0→F4 antes de F5).
- Stack del §3 del plan maestro (las ADRs formales se escriben en F3).
- URLs con la Opción A (un solo origen, pitchlab.mx).
- `Reportes/` es la carpeta canónica de investigación.
- Emblemas: la fuente es `pitchlab-brand/football/<edición>/`, con un fallback neutro.
- Cero premios vinculados a pronósticos. Cero scraping. Cero afiliados en el MVP.

## Pendiente (en orden)

1. **F2:**
   - `PRODUCT_VISION.md`
   - Personas y journeys (referido→trial→pago y pick→share→seguidor)
   - `INFORMATION_ARCHITECTURE.md`
   - `ROUTE_MAP.md`
   - `SECTION_INDEX.md` (38 fichas)
   - `MVP_DEFINITION.md`
   - `ROADMAP.md`
2. **F3:**
   - ADRs del stack
   - `SYSTEM_ARCHITECTURE`
   - `DATA_ARCHITECTURE` / `HISTORICAL_STORAGE`
   - `PREDICTION_ARCHITECTURE`
   - `AUTH_BILLING_GROWTH`
   - `SOCIAL_ARCHITECTURE`
   - `AI_ARCHITECTURE`
   - `SECURITY`
   - `DEPLOYMENT`
3. **⛔ Gate:** el fundador confirma FD-01…FD-06 (y avanza en FD-14) antes de F4.
4. **F4:** walking skeleton. **F5:** prompts. **F6:** ejecución multiagente.

## Bloqueos

- FD-14: cotizaciones y términos de datos y pagos (los contactos comerciales los hace el fundador).
- Falta el archivo Inter WOFF2 en el paquete de marca (se resuelve en F4).

## Cambios del fundador sin commit (no incluidos en los commits del plan)

- `pitchlab-brand/PITCHLAB_BRAND_HANDOFF.md` y `README.md`
- `pitchlab-brand/football/` y `pitchlab-brand/social/instagram-lanzamiento/` (sin seguimiento)
- `pitchlab-brand.zip` y los ZIP de emblemas
