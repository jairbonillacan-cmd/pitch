# Estrategia de integración

> **Propósito:** cómo entra el trabajo de muchos agentes a `main` sin romper nada.
> **Consumidores:** todos los agentes, el revisor y el fundador.
> **Fecha:** 2026-11-08

## 1. Ramas y worktrees

- `main` siempre es desplegable (producción). Está protegida: solo entra vía PR con la CI en verde.
- **Una rama por prompt:** `feat/<id>-<slug>` (por ejemplo, `feat/12-game-center`). Las de plataforma usan `platform/<owner>-<tema>`.
- **Cada sesión de agente trabaja en su propio git worktree** (o sesión con worktree aislado), a partir de la punta de `main`, nunca de la rama de otro agente.
- Las ramas viven poco: ≤ 3 días o ≤ ~800 líneas de diff. Si un prompt es más grande, el agente lo parte en PRs encadenados (`feat/12a-…`, `feat/12b-…`).

## 2. Orden de merge dentro de una wave

1. **Plataforma primero:** contratos, componentes y tablas que la wave necesita (los PRs de los owners de §1 de `AGENT_OWNERSHIP.md`).
2. **Secciones** en paralelo, cada una con rebase sobre `main` antes del merge.
3. **Cierre de wave:** un PR de integración del owner de arquitectura que corre los E2E de la wave completa, actualiza `PROJECT_STATE.md` y etiqueta `wave-N-done`.

## 3. Pull requests

**Plantilla obligatoria** (`.github/pull_request_template.md`, F4):

- Prompt o ID de la sección y el enlace al prompt.
- Qué cambia y qué **no** cambia (fuera de alcance).
- Capturas en 375 y 1440 px de cada vista nueva (o el enlace a las stories).
- Checklist de `QUALITY_GATES.md` §2 marcado.
- Contratos o tablas tocados (o «ninguno»).
- Handoff (sección R del prompt): resumen, pendientes y decisiones.

**Revisión:** la CI (automática) más una revisión del owner de arquitectura o del fundador. Los cambios a contratos, auth, billing y social requieren revisión adicional de seguridad (checklist `SECURITY.md` §2).

## 4. Entornos de prueba por PR

- Preview de Vercel por PR con un **branch de Neon** creado por la CI (`pr-<n>`), migrado y con seeds demo. Se borra al cerrar el PR.
- Storybook del PR publicado como artefacto con su enlace en el PR.

## 5. Cambios de contrato y de esquema

| Cambio | Procedimiento |
|---|---|
| Contrato aditivo | PR del owner de contratos y merge antes de la sección que lo usa |
| Contrato que rompe | `SHARED_CONTRACTS.md` §12: etiqueta, consumidores afectados y migración en el mismo PR |
| Migración de DB aditiva | PR del owner de Datos con la migración y el seed. Se aplica en el preview. |
| Migración destructiva | Etiqueta `migration-approved`, plan de rollback y ventana de despliegue |

## 6. Conflictos y bloqueos

- Si dos prompts necesitan el mismo archivo, **se serializan**: el segundo espera el merge del primero. Lo decide el owner de arquitectura y no los agentes.
- Si un agente descubre que su sección necesita algo fuera de su ownership, **no improvisa**: deja el pendiente en el handoff y, si bloquea, pide al owner el cambio mínimo.
- Los feature flags (PostHog) permiten mergear trabajo incompleto apagado, nunca visible a usuarios.

## 7. Releases

- **Despliegue continuo:** cada merge a `main` despliega a producción, con el código nuevo detrás de un flag si no está listo.
- Los flags legales (`SECURITY.md` §4) solo los cambia el fundador.
- **Rollback:** promover el deploy anterior en Vercel. Si hubo migración, se aplica la migración inversa preparada en el PR.
