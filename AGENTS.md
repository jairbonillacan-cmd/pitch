# PitchLab · instrucciones para agentes

Estado y siguiente paso del proyecto: `docs/execution/PROJECT_STATE.md`.

## Diseño (siempre que toques UI)

Toda pantalla, componente, estilo, landing o demo visual de PitchLab sigue estas reglas, en cada sesión:

- **Estándar *curado*:** diseño al nivel de las apps nativas de Apple, con la identidad de PitchLab. Los principios y la definición de terminado están en `docs/design/UI_LIBRARIES.md` §1 y §5.
- **Reglas de la marca:** `docs/design/DESIGN_SYSTEM.md`, `INTERACTION_PATTERNS.md` y `RESPONSIVE_RULES.md` mandan sobre cualquier librería o skill. Producto y audiencia: `apps/web/PRODUCT.md`.
- **Librerías:** HeroUI v3 (solo la parte gratuita), Astryx (Meta) y shadcn/ui conviven sobre los tokens de `@pitchlab/tokens`. Antes de elegir o estilizar un componente, lee `docs/design/UI_LIBRARIES.md`. La documentación de cada componente de Astryx sale de su CLI: `pnpm --filter @pitchlab/ui astryx component <Nombre>`.
- **Storybook** (`pnpm storybook`) es la fuente visual: cada componente nace o cambia con sus stories en tema oscuro y claro.
- **Landing, `/app` (Inicio), Login, Crear cuenta o Planes (`/precio`, con redirección 308 desde `/plans` y `/pricing`):** sigue `docs/design/GUIA_RECREACION_GPT.md`, con la referencia del lienzo en `design/canvas/app/`. El mapa completo de rutas vive en `docs/architecture/ROUTE_MAP.md`.
- **Skills de diseño**, cárgalos antes de escribir código:
  - `stageshow`: UI simulada del producto para la landing, heroes, tarjetas de features y demos animadas.
  - `prototype`: explorar una pantalla o flujo antes de construirlo.
  - `modern-web-guidance`: guía obligatoria para HTML/CSS, modales, tablas, accesibilidad y web APIs en cliente.

## Servidor en vivo y ciclo de validación

- **Servidor de desarrollo siempre en puerto libre `> 6000` (prohibido `localhost:3000` y `pnpm dev` directo):**
  - Elige un puerto libre arriba de `6000` (evita `6006` de Storybook; p. ej. `6400`, `7200` o `9990`).
  - Levanta el servidor en segundo plano (`IsDaemon: true`) con su directorio aislado en `.gitignore` (`.next-*/`) y URL de auth alineada al puerto:
    `BETTER_AUTH_URL=http://localhost:<puerto> PITCHLAB_DIST_DIR=.next-<puerto>-dev pnpm --filter @pitchlab/web exec next dev --port <puerto>`
  - Comparte al usuario el enlace exacto (`http://localhost:<puerto>`) y el PIN beta vigente (`PITCHLAB_BETA_CODE`, `2026` en desarrollo) y mantén ese proceso vivo sin reiniciarlo ni pisar su `distDir` mientras iteran.
- **Iteración rápida entre cambios (cero suites pesadas a mitad de la jornada):**
  - Valida cada ajuste en segundos únicamente con `pnpm --filter <paquete> typecheck`, guardrails rápidos (`node scripts/lint-codebase.mjs`, `node scripts/check-no-demo-prod.mjs`) o un archivo puntual de `vitest` si cambiaste lógica de cálculo.
  - No ejecutes `pnpm e2e`, `pnpm build`, `pnpm build-storybook` ni `pnpm test` completo mientras se itera.
- **Cierre de jornada (solo por petición explícita del usuario):**
  - Corre la batería completa (`pnpm test`, `pnpm build`, `pnpm build-storybook` y `pnpm e2e`, en secuencia sin contención de archivos) únicamente cuando el usuario pida cerrar o validar la jornada final.
