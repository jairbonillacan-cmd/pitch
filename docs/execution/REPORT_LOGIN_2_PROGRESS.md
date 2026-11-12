# Reporte de avance · LOGIN-2 (`/login` desde el lienzo)

- **Fecha:** 2026-11-11
- **Rama:** `gemini-reestructura`
- **Estado:** Implementación completa + `typecheck`, `lint` y pruebas unitarias (10/10 paquetes) en verde. Pendiente únicamente concluir el `next build` final, correr `pnpm e2e` y ejecutar las capturas comparativas con `apps/web/scripts/verify-login.mjs`.

---

## 1. Qué se implementó

1. **Tokens de atmósfera y formulario (`@pitchlab/tokens`):**
   - `packages/tokens/scripts/generate.mjs` y `packages/tokens/tests/tokens.test.ts` (más artefactos regenerados `dist/tokens.css`, `dist/theme.css` y `src/tokens.generated.ts`).
   - Se agregaron `--pl-orb-rose` (oscuro y claro) para la cuarta luz radial arriba a la izquierda, `--pl-auth-beam`, `--pl-auth-lens`, `--pl-auth-pane`, `--pl-auth-field`, `--pl-auth-field-hover` y los cuatro colores del isotipo de Google (`--pl-google-blue`, `--pl-google-green`, `--pl-google-yellow`, `--pl-google-red`). Cero literales hexadecimales fuera de `packages/tokens`.

2. **Datos reales de servidor para la vista previa (`apps/web`):**
   - `apps/web/src/server/public-site-data.ts`: se exportó `selectHeroMainCards` y se agregó `loadLoginPreviewData()`, que construye las tarjetas con `buildHeroLeagueCards` sobre los snapshots vigentes y devuelve `{ primaryCard, secondaryCard }` (partido principal + siguiente partido de otra liga, con momio justo `1/p` en americano; `null` si no hay datos vigentes, sin inventar partidos).
   - `apps/web/app/login/page.tsx`: lee `next`, `ref`, `invite` y `code` de `searchParams`, carga en paralelo `loadPublicPlatformState()` y `loadLoginPreviewData()`, renderiza `<LoginPreviewPanel />` en el servidor y lo pasa por `previewSlot` a `<AuthSurfaceV4 mode="login" nextPath={nextPath} ... />` importado desde `@pitchlab/ui` (aprovechando `optimizePackageImports` y enviando `games: []` al cliente para no duplicar payload RSC).

3. **Componentes de UI (`@pitchlab/ui`):**
   - `packages/ui/src/platform/public/LoginPreviewPanel.tsx` *(Server Component, sin `"use client"`)*: panel derecho `.glass-card.glass-ring` con luces propias violeta/verde, eyebrow «Hoy en PitchLab», título «Lo más probable, con su momio justo.», tarjeta destacada `.glass-lens.glass-ring.glass-ring--featured` (`LeagueBadge`, `TeamBadge`, `ProbSplit` con corte a 45° y favorito en `--pl-success`), segunda fila compacta de otra liga y nota al pie.
   - `packages/ui/src/platform/public/LoginSurfaceV4.tsx` *(`"use client"`)*:
     - Un solo árbol DOM adaptable a escritorio (`Main.dc.html`) y móvil (`Mobile.dc.html`) para mantener exactamente **un `<h1>`**, **un `<form>`** y **un `.btn-beta`** en toda la página (evitando violaciones de modo estricto en Playwright E2E 2 y 3).
     - **Estado Correo (por defecto):** campo `type="email"` (`autoComplete="email"`, `inputMode="email"`, `16px` en iOS), botón blanco único «Enviarme el enlace» (ocupado con `aria-busy` y «Enviando…») y texto de vigencia de 15 minutos. Con `accountsEnabled`, llama a `requestLoginMagicLink(correo, nextPath)`; en beta, abre `openBetaPin(nextPath)`.
     - **Estado Contraseña:** construido completo (mostrar/ocultar de 44 px con `aria-label` dinámico, «¿La olvidaste?» y «Entrar sin contraseña») detrás de `passwordSignInEnabled = false`, apagado mientras Better Auth no tenga `emailAndPassword`.
     - **Estado «Revisa tu correo»:** ícono de correo en vidrio, correo en negritas, «Reenviar» con tope de 1 envío cada 30 s (cuenta regresiva y `disabled`) y «Usar otro correo».
     - **Google y Apple:** SVG inline con `aria-hidden="true"`; con cuentas llaman a `startLoginSocialSignIn`, y en beta muestran el aviso informativo y abren `openBetaPin(nextPath)`.
     - **Referido / invitación (`?ref=` / `?invite=` / `initialPromoCode`):** aviso `.glass-card` arriba del título («{CÓDIGO} aplicado: 7 días gratis, sin tarjeta»), sin campo vacío de código.
     - **PIN de socio:** enlace en el pie con clase `.btn-beta` («¿Eres socio? Entra con tu PIN») conectado a `openBetaPin(nextPath)` y `<BetaPinModal />` intacto en sus selectores (`.pin-dialog`, `button.pin-key[data-pin-digit]`, `.pin-feedback.error`).
     - **Validación accesible:** errores debajo del campo con `aria-live="polite"` y `aria-describedby` para correo vacío, formato inválido, dominio temporal (`isDisposableEmailDomain`) y fallo de envío.
   - `packages/ui/src/platform/public/AuthAndOnboardingSurfaces.tsx` y `packages/ui/src/platform/index.ts`: `AuthSurfaceV4` delega `mode === "login"` a `LoginSurfaceV4` y mantiene `mode === "signup"` intacto.

4. **Estilos, atmósfera y responsive (`apps/web/app/pitchlab-v4.css`):**
   - Clases `.pl-stage.pl-auth`, `.pl-auth-atmo` (4 luces radiales con tokens, a mitad de intensidad en `[data-theme="light"]`), `.pl-auth-beam` (dos haces diagonales y retícula con máscara radial) y `.pl-auth-grain`, con **cero** uso de filtros de desenfoque CSS.
   - Columna centrada de `1040 px`, hoja `.glass-lens.glass-ring` en dos columnas iguales, colapso limpio debajo de `900 px` (se oculta la vista previa y la hoja queda en `460 px`), ocultamiento del segundo partido debajo de `760 px` de alto, y adaptación móvil fluida en `≤ 640 px` con `min-height: 100dvh` y espacios `clamp(..., Nvh, ...)` para caber sin scroll vertical desde `667 px` de alto (`375×667` y `390×844`) y sin scroll horizontal desde `320 px`.
   - Entrada suave `.pl-auth-fade` (`300 ms`, opacidad + `6 px`) desactivada con `prefers-reduced-motion: reduce`, y refinamiento visual de `.pin-dialog` para armonizar vidrio y tipografía.

5. **Stories, pruebas y script de verificación:**
   - `packages/ui/src/platform/login-v4.stories.tsx`: 7 stories (Correo oscuro/claro, Revisa tu correo oscuro/claro, Referido aplicado, Contraseña tras bandera y Sin vista previa).
   - `packages/ui/tests/login-v4.test.tsx` (4 pruebas SSR/estados) y `apps/web/tests/login-preview.test.ts` (2 pruebas con snapshots reales).
   - `apps/web/scripts/verify-login.mjs`: script automatizado de Playwright + `@axe-core/playwright` para generar las capturas en `1440×900`, `1280×720`, `375×667` y `390×844` (oscuro y claro), verificar `scrollWidth <= innerWidth` (incluyendo `320 px`, `430 px`, `820 px`), verificar cero scroll vertical en `375×667` y `390×844`, validar WCAG 2.2 AA con Axe y probar todos los flujos interactivos (errores, `?ref=`, foco con `Tab`, PIN `9999` / `2026` → `?next=/app/premier-league`, enlace mágico simulado, tope de 30 s en «Reenviar» y «Usar otro correo»).

---

## 2. Qué ya quedó verificado

- `pnpm typecheck`: **OK** en los 10 paquetes del monorepo (`0` errores TypeScript).
- `pnpm lint` y `node scripts/lint-codebase.mjs`: **OK** (`0` colores hex fuera de `packages/tokens`, `0` bloques `catch` vacíos).
- **Pruebas unitarias en verde (10/10 paquetes):**
  - `@pitchlab/tokens` (`3/3`), `@pitchlab/contracts` (`4/4`), `@pitchlab/sports-assets` (`3/3`), `@pitchlab/spacetime` (`97/97`), `@pitchlab/models` (`41/41`), `@pitchlab/engines-reference` (`394/394`), `@pitchlab/ingest` (`114/114`, `1` omitida), `@pitchlab/ui` (`22/22`, incluidas las 4 nuevas de `login-v4.test.tsx`), `@pitchlab/db` (`15/15`) y `@pitchlab/web` (`39/39`, incluidas las 2 nuevas de `login-preview.test.ts`).
- **Auditoría de copy y estilos prohibidos:** `0` apariciones de términos ni filtros prohibidos en todos los archivos nuevos y líneas añadidas.

---

## 3. En qué nos quedamos (pasos exactos al retomar)

El proceso se detuvo justo cuando arrancaba el `next build` definitivo tras corregir la importación de `@pitchlab/ui` en `apps/web/app/login/page.tsx` para respetar el presupuesto de First Load JS (`≤ 326 kB`).

Al retomar en cualquier equipo:

1. **Compilar producción y confirmar peso de `/login` (`≤ 326 kB`):**
   ```bash
   pnpm --filter @pitchlab/web build
   ```
2. **Correr la suite E2E oficial (confirmando pruebas 2 y 3 de PIN intactas):**
   ```bash
   pnpm e2e
   ```
3. **Generar capturas y correr la verificación interactiva + Axe WCAG 2.2 AA:**
   Levantar dos servidores sobre el build de producción (puerto `3121` en modo beta normal y puerto `3122` con `DATABASE_URL` + `BETTER_AUTH_SECRET` simulados para probar el estado «Revisa tu correo» y su cuenta regresiva de 30 s) y ejecutar:
   ```bash
   node apps/web/scripts/verify-login.mjs
   ```
   Revisar visualmente los PNG generados en `test-results/screenshots/login-2/` frente a `design/canvas/login/Main.dc.html` y `design/canvas/login/Mobile.dc.html`, ajustar cualquier detalle fino si hiciera falta y cerrar `LOGIN-2` en `docs/execution/PROJECT_STATE.md`.

---

## 4. Decisiones pendientes para el fundador

1. **¿Se habilita correo + contraseña en Better Auth?** Hasta entonces, el estado Contraseña queda apagado (`passwordSignInEnabled = false`).
2. **¿El acceso con PIN se retira cuando existan cuentas, o se queda para socios?**
