# Prompt NN — <Nombre de la sección>

> Plantilla oficial para los prompts de PitchLab (F5). Cada prompt es **autocontenido**: el agente que lo recibe no conoce la conversación donde se generó. Reemplaza todo lo que esté entre `<…>`. No borres secciones. Si una no aplica, explica por qué en una línea. Validación: `scripts/lint-prompts.mjs` (`docs/execution/QUALITY_GATES.md` §4).
>
> **Metadatos:** ID `<NN>` · Wave `<W#>` · Ficha `docs/product/SECTION_INDEX.md#<NN>` · Depende de `<IDs/PRs>` · Rama `feat/<NN>-<slug>`

---

## A. Rol

Eres <especialidad concreta, p. ej. «ingeniero frontend senior responsable de la sección Game Center de PitchLab»>. Respondes por <alcance>, dentro del ownership de la sección M.

## B. Contexto

PitchLab (https://pitchlab.mx) es un laboratorio de investigación deportiva por suscripción, México primero: datos con licencia, histórico, cuotas con hora y fuente, modelos con calibración publicada y una comunidad verificable. **No acepta apuestas, no recomienda apostar ni da premios por acertar.** Antes de escribir código, lee en este orden:

1. `docs/PITCHLAB_MASTER_PLAN.md`
2. `docs/execution/PROJECT_STATE.md`
3. `docs/product/SECTION_INDEX.md` (ficha <NN>)
4. `docs/architecture/SHARED_CONTRACTS.md`
5. `docs/architecture/FRONTEND_ARCHITECTURE.md`
6. `docs/execution/AGENT_OWNERSHIP.md`
7. `docs/execution/QUALITY_GATES.md`
8. <documentos específicos: p. ej. `DATA_ARCHITECTURE.md` §3.2, `SOCIAL_ARCHITECTURE.md`>

## C. Marca

Fuente oficial: `C:\Users\jairb\Desktop\Proyectos\Pitch Lab\pitchlab-brand` (en el repo: `pitchlab-brand/`). Usa los tokens de `packages/tokens` (generados de `brand-tokens.css`), los componentes de Storybook y las reglas de `pitchlab-brand/PITCHLAB_BRAND_HANDOFF.md` (sección «Aplicación en producto»). Emblemas solo vía `TeamBadge` y `LeagueBadge`. No crees colores, tipografías ni logos.

## D. Objetivo

<Qué problema resuelve, para quién y qué acción permite. Copia y concreta la ficha.>

## E. Rutas

<Rutas exactas de `ROUTE_MAP.md`, con parámetros de segmento y de query que la sección lee y escribe.>

## F. Diseño

- **Layout por breakpoint:** <estructura en 375 / 768 / 1200 / 1440>
- **Jerarquía:** <qué se ve primero, qué después>
- **Componentes existentes que se usan:** <lista con el enlace a su story>
- **Componentes nuevos** (solo si no existen): <nombre, propósito, props y estados>
- **Tablas y gráficas:** <columnas con prioridad móvil y tipo de gráfica con su resumen accesible>
- **Estados:** loading, empty, error, stale, locked y demo, con su copy exacto
- **Movimiento:** <qué anima, con qué token y comportamiento reducido>

## G. Interacciones

| Control | Acción | Efecto en la URL o los datos | Resultado visible |
|---|---|---|---|
| <…> | <…> | <…> | <…> |

## H. Datos

- **Contratos:** <tipos de `packages/contracts` que consume y produce>
- **Fuentes:** <repositorios y endpoints de `/api/v1`, con la feature de entitlement que exigen>
- **Frescura:** <SLA y cuándo pasa a stale>

## I. Fixtures

<Seeds demo en `packages/db/seeds/demo/` o fixtures de Storybook, con IDs `demo_` y `provenance: 'demo'`. Indica qué casos cubren: vacío, error, datos largos y valores extremos.>

## J. Responsive

<Reglas específicas para móvil (bottom sheet, columnas prioritarias, gráficas simplificadas) y tablet.>

## K. Accesibilidad

<Landmarks, orden de foco, roles y aria específicos, alternativas textuales de gráficas y anuncios de `role="status"`.>

## L. Dependencias

<Componentes, contratos, tablas y PRs que deben existir antes. Si falta algo, **no lo construyas fuera de tu ownership**: anótalo en el handoff.>

## M. Ownership (puedes modificar)

```text
<globs exactos según AGENT_OWNERSHIP.md>
```

## N. Restricciones (no puedes modificar)

- `packages/contracts/**`, `packages/ui/**`, `packages/sports-ui/**`, `packages/charts/**`, `packages/tokens/**`, `packages/db/**` (salvo que M lo indique), shells y layouts raíz.
- Lo que pertenece a otras secciones.
- <otras restricciones de la sección>

## O. Pruebas

- **Unit:** <qué funciones y casos>
- **Stories e interacción:** <componentes nuevos>
- **E2E:** <journeys de `USER_JOURNEYS.md` y casos negativos>
- **Visual:** <vistas a capturar>

## P. Criterios de aceptación

1. <criterio medible>
2. <…>
3. Gates de `QUALITY_GATES.md` §1 en verde y checklist §2 completo.

## Q. Entregables

PR `feat/<NN>-<slug>` con el código, los tests, las stories, las capturas en 375 y 1440 px y las cadenas en `messages/es-MX/<slug>.json`.

## R. Handoff

Al terminar, agrega tu entrada en `docs/execution/PROJECT_STATE.md` con el formato de `AGENT_EXECUTION_PLAN.md` §4: hecho, no hecho, pedidos a otros owners, decisiones, riesgos y cómo probarlo.
