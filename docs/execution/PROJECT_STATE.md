# Estado del proyecto PitchLab

> **Propósito:** que cualquier sesión retome el trabajo sin reconstruir el contexto. Se actualiza al cerrar cada fase.
> **Última actualización:** 2026-11-08 · **Rama:** `plan/architecture-v2`

## Estado actual

**Fase F0 (auditoría y canonicalización): parcial.** No hay código de producto. El repo todavía contiene el clon de TouchIQ (Vite + `src/domain` con 24 tests dorados), que se archivará en F4.

## Documentos creados

| Documento | Fase | Estado |
|---|---|---|
| `docs/PITCHLAB_MASTER_PLAN.md` | — | v2, aprobado |
| `docs/DIRECTIVE_CHANGELOG.md` | — | Completo |
| `docs/brand/BRAND_AUDIT.md` | F0 | Completo |
| `docs/brand/ASSET_MANIFEST.md` | F0 | Completo |
| `docs/research/REA_REPORT_INVENTORY.md` | F0 | Completo (inventario, hallazgos transversales y triage) |
| `docs/execution/FOUNDER_DECISIONS.md` | F1 | Iniciado (12 decisiones, 5 abiertas) |
| `docs/execution/PROJECT_STATE.md` | — | Vivo |

## Decisiones tomadas

- La arquitectura va antes que los prompts (F0→F4 antes de F5).
- Stack del §3 del plan maestro (las ADRs formales se escriben en F3).
- URLs con la Opción A (un solo origen, pitchlab.mx).
- `Reportes/` es la carpeta canónica de investigación.
- Emblemas: la fuente es `pitchlab-brand/football/<edición>/`, con un fallback neutro.

## Pendiente (en orden)

1. **F0 restante:**
   - `docs/research/COMPETITIVE_FEATURE_MATRIX.md`
   - `DATA_SOURCE_FINDINGS.md`
   - `PREDICTION_ENGINE_FINDINGS.md`
   - `UX_FINDINGS.md` (incluida la revisión de Draftea)
2. **F1:** spike de datos y licencias, `docs/architecture/COMPLIANCE_REGISTER.md` y modelo de costos de 100, 1k y 10k usuarios.
3. **F2:** product blueprint, `ROUTE_MAP.md` y `SECTION_INDEX.md` (38 fichas).
4. **F3:** ADRs y documentos de arquitectura.
5. **⛔ Gate:** el fundador confirma FD-01…FD-06 antes de F4 (F4 reestructura el repo).
6. **F4:** walking skeleton. **F5:** prompts. **F6:** ejecución multiagente.

## Bloqueos

- FD-02 (presupuesto de datos) y FD-06 (pasarela) condicionan el cierre de F3.
- Falta el archivo Inter WOFF2 en el paquete de marca (se resuelve en F4).

## Cambios del fundador sin commit (no incluidos en los commits del plan)

- `pitchlab-brand/PITCHLAB_BRAND_HANDOFF.md` y `README.md` (sección de identificadores de ligas)
- `pitchlab-brand/football/` (sin seguimiento en git), `pitchlab-brand.zip` y los ZIP de emblemas
