# Prompt · Login nuevo de PitchLab (para Opus en Antigravity)

Copia todo lo que está debajo de la línea.

---

Vas a implementar el `/login` nuevo de PitchLab tal como está en el lienzo de diseño. Tiene que verse y comportarse igual que el lienzo en escritorio y en móvil, en tema oscuro y claro, con los tokens y componentes que ya existen. Sin datos inventados, sin backend nuevo y sin romper el acceso con PIN.

## 0. Lee esto antes de escribir código, en este orden

1. `AGENTS.md`, `apps/web/PRODUCT.md`, `docs/design/DESIGN_SYSTEM.md`, `docs/design/UI_LIBRARIES.md`, `docs/design/RESPONSIVE_RULES.md` y `docs/design/INTERACTION_PATTERNS.md`.
2. **El diseño:** `design/canvas/login/README.md`, luego `Main.dc.html` (escritorio, interactivo), `Mobile.dc.html` (móvil) y las `notes` de `canvas.json`. El README trae la tabla de imágenes y la de colores → tokens. Si una nota del lienzo choca con este prompt, manda este prompt.
3. El código actual:
   - `apps/web/app/login/page.tsx` (no cambia su forma: sigue pasando `mode="login"` y `nextPath`).
   - `packages/ui/src/platform/public/AuthAndOnboardingSurfaces.tsx`: `AuthSurfaceV4` sirve **login y signup**; `requestMagicLink` y `startSocialSignIn` ya llaman a Better Auth.
   - `apps/web/src/server/auth.ts`: hay enlace mágico, Google y Apple. **No hay correo + contraseña.**
   - `packages/ui/src/platform/components/PlatformOverlays.tsx`: el diálogo `.pin-dialog` con su teclado (`button.pin-key[data-pin-digit]`) y `openBetaPin` / `submitBetaPin` de `usePlatform()`.
   - `apps/web/app/pitchlab-v4.css`: vidrio falso (`.glass-lens`, `.glass-card`, `.glass-ring`, `.glass-ring--featured`) y barra 1X2.
   - `packages/ui/src/sports.tsx` (`ProbSplit`, `TeamBadge`, `LeagueBadge`) y `packages/ui/src/primitives` (`BrandLogo`).
   - `apps/web/src/server/public-site-data.ts` (`buildHeroLeagueCards`, `selectHeroMainCards`): de ahí salen los partidos del panel derecho.
4. Las pruebas: `apps/web/e2e/pre-mvp.spec.ts`, pruebas 2 y 3. Dependen de `.btn-beta`, `.pin-dialog`, `button.pin-key[data-pin-digit]` y `.pin-feedback.error` con «Código incorrecto».

Antes de editar, escribe un plan corto: qué archivos cambias, qué componentes reutilizas y cómo mantienes vivas las E2E 2 y 3.

## 1. Decisiones ya tomadas (no las discutas)

- **Una sola tarea: entrar.** Fuera de `/login`: las pestañas «Prueba / Código» y «PIN Socio», el campo de código de referido, las fichas de nombres (SOFIAS, JAIR…), la casilla de mayoría de edad y la tarjeta «Pase PitchLab Ultra». La edad se pide al crear cuenta.
- **Sin mascota.** Ni Radar ni ninguna otra en el login.
- **Un solo botón primario (blanco)** por estado. El morado es marca, no acción.
- **Vidrio falso del club, refinado.** Prohibido `backdrop-filter` y `filter: blur` en esta pantalla: las luces de color son solo degradados.
- **Copy exacto del lienzo.** «Entra a PitchLab», «Lo más probable de cada partido, con su momio justo.», «o con tu correo», «Entrar sin contraseña», «Revisa tu correo», «¿No tienes cuenta? Crear cuenta», «7 días gratis, sin tarjeta», «¿Eres socio? Entra con tu PIN», «Solo mayores de 18. PitchLab no acepta apuestas.» Nada de «gana», «cobra», ROI ni promesas.
- **`/signup` no se toca en esta tarea.** Si `AuthSurfaceV4` se vuelve difícil de compartir, separa el login en su propio componente (`LoginSurfaceV4`) y deja `mode="signup"` como está.

## 2. Qué construir

### 2.1 Escritorio (`Main.dc.html`)

- **Fondo con atmósfera:** cuatro luces radiales (violeta arriba a la derecha, verde abajo a la izquierda, azul abajo a la derecha, rosa tenue arriba a la izquierda), dos haces diagonales y una retícula que se desvanece al centro. Clases nuevas `.pl-auth-atmo`, `.pl-auth-beam`, `.pl-auth-grain` en `pitchlab-v4.css`, con tokens. En tema claro, las mismas luces a la mitad de intensidad.
- **Una columna de 1040 px centrada** para barra, hoja y pie.
  - Barra: `BrandLogo` horizontal a la izquierda y «Volver al inicio» a la derecha (enlace a `/`). No uses la barra pública con menú: aquí distrae.
  - **Hoja de vidrio** (`.glass-lens .glass-ring`, radio 32 px, 10 px de margen interior), en dos columnas iguales con `grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr))`:
    - **Izquierda, formulario** (máx. 360 px, centrado). Título y frase centrados; Google y Apple lado a lado; separador; formulario; enlace secundario; «Crear cuenta» con «7 días gratis, sin tarjeta» debajo.
    - **Derecha, vista previa** (`.glass-card .glass-ring`, radio 24 px, con su propia luz violeta y verde): eyebrow «Hoy en PitchLab», título «Lo más probable, con su momio justo.», la tarjeta del partido principal y una fila compacta con un segundo partido de otra liga. Nota al pie: «Probabilidades de los motores de PitchLab. Tú comparas con el momio de tu casa y decides.»
  - Pie: aviso legal a la izquierda y «¿Eres socio? Entra con tu PIN» a la derecha.
- **Tarjeta del partido** (`.glass-lens .glass-ring--featured`): liga y jornada con `LeagueBadge`, fecha; equipos con `TeamBadge`; «Lo más probable» con el resultado, «Momio justo» en americano y la probabilidad grande en `--pl-success`; barra 1X2 con `ProbSplit` (favorito en verde, corte a 45°).
- **Datos reales, nunca escritos a mano:** usa `buildHeroLeagueCards` + `selectHeroMainCards` en el servidor (agrega un loader en `public-site-data.ts` y pásalo desde `app/login/page.tsx`). Partido principal: la primera tarjeta. Segundo: la siguiente de otra liga. Momio justo = 1/p en americano, con el mismo helper que la landing. Sin datos, la vista previa no se muestra (no inventes un partido).

### 2.2 Móvil (`Mobile.dc.html`)

- Fluido: ancho 100 %, contenido de máx. 420 px con al menos 16 px por lado, `min-height: 100dvh`.
- Arriba, una flecha de 44 px para volver (izquierda) y el logo centrado. Debajo, título y frase centrados. Luego **el formulario dentro de una hoja de vidrio** a todo el ancho y, bajo ella, «Crear cuenta» y la oferta. Al pie, el PIN y el aviso legal.
- Sin vista previa del partido en móvil.
- **Cero scroll horizontal** de 320 a 430 px de ancho. En alturas de 667 px o más **todo cabe sin scroll vertical**: los espacios verticales usan `clamp(…, Nvh, …)` como en el lienzo y se compactan por debajo de 700 px de alto.

### 2.3 Estados y comportamiento

El lienzo dibuja cuatro estados. En código, quedan así:

| Estado | Qué se ve | Qué hace |
|---|---|---|
| **Correo (por defecto)** | Campo Correo y botón «Enviarme el enlace». Debajo, en texto: «Te mandamos un enlace para entrar sin contraseña. Vence en 15 minutos.» | Con cuentas activas (`accountsEnabled`): `requestMagicLink(correo, nextPath)` → estado «Revisa tu correo». En beta (sin cuentas): `openBetaPin(nextPath)`, como hoy. |
| **Contraseña** | El campo Contraseña con «¿La olvidaste?» y mostrar/ocultar, y el enlace «Entrar sin contraseña» para volver al de correo. | **No existe en el backend.** Constrúyelo detrás de una bandera (`passwordSignInEnabled`, en `false`) y no lo muestres mientras esté apagada; no agregues `emailAndPassword` a Better Auth. Repórtalo al final como decisión del fundador. |
| **Revisa tu correo** | Ícono de correo en vidrio, «Revisa tu correo», el correo escrito en negritas, «Reenviar» y «Usar otro correo». | Reenviar vuelve a llamar a `requestMagicLink` con un tope de 1 cada 30 s (botón deshabilitado con cuenta regresiva). |
| **PIN de socio** | El diálogo `.pin-dialog` de siempre. | El enlace del pie lleva la clase `btn-beta` y llama a `openBetaPin(nextPath)`. No reemplaces el teclado por las 4 casillas del lienzo: las E2E 2 y 3 dependen de él. Ajusta solo el vidrio y la tipografía del diálogo para que combine. |

- **Google y Apple:** con cuentas, `startSocialSignIn`. En beta, el aviso de siempre («El acceso con Google llega con las cuentas…») y `openBetaPin`.
- **Errores** debajo del campo, con `aria-live="polite"` y `aria-describedby`: correo vacío o inválido, correo temporal (`isDisposableEmailDomain`), fallo de envío.
- **Referido o invitación** (`?ref=` / `?invite=` / `initialPromoCode`): un aviso arriba del título en `.glass-card` («{CÓDIGO} aplicado: 7 días gratis, sin tarjeta»). Sin campo vacío para escribir códigos.
- **Mientras se envía:** botón con estado ocupado (`aria-busy`, texto «Enviando…»), sin doble envío.
- El correo usa `type="email"`, `autocomplete="email"` e `inputmode="email"`; el campo de 16 px para que iOS no haga zoom.

## 3. Reglas de implementación

- **Solo tokens `--pl-*`.** Cero hex fuera de `packages/tokens`. Si falta el rosa de las luces, agrégalo como `--pl-orb-rose` en `packages/tokens` (oscuro y claro).
- **Componentes existentes primero:** `BrandLogo`, `TeamBadge`, `LeagueBadge`, `ProbSplit`, los botones de `@pitchlab/ui`, HeroUI para campos si ya se usa en auth. Iconos de `MaestroIcon` o del set del repo; los logos de Google y Apple como SVG inline con `aria-hidden`.
- **Accesibilidad WCAG 2.2 AA:** `<label>` real en cada campo, objetivos de 44 px, foco visible con `--pl-brand`, contraste 4.5:1 en textos de 11–13 px, mostrar/ocultar contraseña con `aria-label` que cambia, `h1` único por estado.
- **Movimiento:** solo la entrada suave de cada estado (opacidad + 6 px, 300 ms). Con `prefers-reduced-motion`, nada.
- **Rendimiento:** la página no puede cargar más JS que hoy. La vista previa es de servidor; solo el formulario es cliente.
- **Responsive:** sin scroll horizontal en ningún ancho. Debajo de 900 px de ancho la vista previa se oculta y la hoja queda de 460 px. Debajo de 760 px de alto se oculta la segunda fila de partido.
- No toques `/signup`, `/app` ni la landing salvo lo que se nombra aquí.

## 4. Verificación (obligatoria antes de decir que terminaste)

1. `pnpm typecheck`, `pnpm lint` y `pnpm test`, en verde.
2. Build de producción y E2E contra él: `pnpm --filter @pitchlab/web build` y luego `pnpm e2e` (pruebas 2 y 3 sin cambios en sus selectores; si cambias algo del flujo de PIN que las afecte, para y dilo).
3. **Capturas** de `/login` comparadas con el lienzo: 1440×900 y 1280×720 en escritorio, 375×667 y 390×844 en móvil, en tema oscuro y claro. En cada una confirma: nada se corta, no hay scroll horizontal, y en 375×667 y 390×844 tampoco hay scroll vertical.
4. A mano: correo vacío, correo inválido, correo temporal, envío del enlace (con cuentas simuladas), «Reenviar» con su tope, PIN incorrecto (9999) y PIN correcto (2026) que lleva a `nextPath`, `?next=/app/premier-league`, tabulador por toda la página y lector de pantalla en los errores.
5. `grep` de copy prohibido en lo que tocaste: «gana», «cobra», «ROI», «Kelly», «Primer mes gratis», «Sellar», `backdrop-filter`, `filter: blur`.
6. Agrega la entrada **LOGIN-2** a `docs/execution/PROJECT_STATE.md` con qué cambió y qué quedó pendiente.

## 5. Terminado significa

- `/login` igual al lienzo en los cuatro tamaños y los dos temas, con datos reales en la vista previa.
- E2E 2 y 3 en verde con el PIN de siempre.
- **No hagas commit ni push.** Entrega un resumen con las capturas, los archivos tocados y estas decisiones pendientes para el fundador:
  - ¿Se habilita correo + contraseña en Better Auth? Hasta entonces, el estado Contraseña queda apagado.
  - ¿El acceso con PIN se retira cuando existan cuentas, o se queda para socios?
