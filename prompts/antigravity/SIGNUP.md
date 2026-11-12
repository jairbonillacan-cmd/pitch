# Prompt · Crear cuenta nuevo de PitchLab (para Opus en Antigravity)

Copia todo lo que está debajo de la línea.

---

Vas a implementar el `/signup` nuevo de PitchLab tal como está en el lienzo de diseño. Tiene que verse y comportarse igual que el lienzo en escritorio y en móvil, en tema oscuro y claro, con los tokens y componentes que ya existen. Sin datos inventados, sin tablas ni migraciones nuevas y sin romper el acceso con PIN.

Si ya implementaste el login con `prompts/antigravity/LOGIN.md`, reutiliza todo lo que hiciste ahí: capas de luces, hoja de vidrio, campos, botones y vista previa. Si no, implementa primero lo compartido con la misma forma que pide ese prompt.

## 0. Lee esto antes de escribir código, en este orden

1. `AGENTS.md`, `apps/web/PRODUCT.md`, `docs/design/DESIGN_SYSTEM.md`, `docs/design/UI_LIBRARIES.md`, `docs/design/RESPONSIVE_RULES.md` y `docs/design/INTERACTION_PATTERNS.md`.
2. `docs/architecture/AUTH_BILLING_GROWTH.md` §1–3: edad, consentimientos y un trial por persona.
3. **El diseño:** `design/canvas/login/README.md`, luego `Signup.dc.html` (escritorio, interactivo, tres estados) y `SignupMobile.dc.html` (móvil), y las notas `signupDecisiones` y `signupBrief` de `canvas.json`. El README trae las tablas de imágenes y de colores → tokens. Los pasos 2 y 3 están en el mismo HTML, dentro de `<sc-if value="{{isStep2}}">` y `<sc-if value="{{isSent}}">`. Si una nota del lienzo choca con este prompt, manda este prompt.
4. El código actual:
   - `apps/web/app/signup/page.tsx`: pasa `mode="signup"` e `initialPromoCode` (de `?code=`).
   - `packages/ui/src/platform/public/AuthAndOnboardingSurfaces.tsx`: `AuthSurfaceV4` (login y signup), `describePromoBenefit`, `normalizeTrialEmail`, `isDisposableEmailDomain`, `requestMagicLink`, `startSocialSignIn`.
   - `apps/web/src/server/auth.ts`: hay enlace mágico, Google y Apple. **No hay contraseña.**
   - `packages/ui/src/platform/spacetime-catalog.ts` y `TIPSTAR_CREATORS`: el nombre de quien invita sale de ahí.
   - `apps/web/src/server/public-site-data.ts` (`buildHeroLeagueCards`, `selectHeroMainCards`): datos del panel derecho.
   - `apps/web/app/onboarding/page.tsx`: a donde lleva el enlace después de confirmar.
5. Las pruebas: `apps/web/e2e/pre-mvp.spec.ts`, prueba 2, el bloque «/signup: escudo anti-abuso». Hoy usa `#auth-promo`, `#auth-email`, `form.auth-form button[type='submit']`, `p[role='alert']` con «temporales» y que la página muestre el correo normalizado (`juanperez@gmail.com`). Además corre axe (WCAG 2 A y AA) sobre `/signup`.

Antes de editar, escribe un plan corto: qué archivos cambias, qué compartes con el login y cómo queda la prueba E2E 2.

## 1. Decisiones ya tomadas (no las discutas)

- **Dos pasos cortos**, no un formulario largo: 1) cómo entras; 2) edad y consentimientos. Después, «Confirma tu correo».
- **Sin contraseña.** El correo se confirma con un enlace y ahí empiezan los 7 días.
- **Sin campo para escribir códigos.** Fuera de `/signup`: el campo «Código de Tipstar o Referido», las fichas SOFIA5/JAIR, la casilla de edad suelta y la tarjeta «Pase PitchLab Ultra». El código llega por `?code=` y se muestra como aviso.
- **Sin mascota.** Un solo botón primario (blanco) por estado.
- **Vidrio falso del club, refinado.** Prohibidos `backdrop-filter` y `filter: blur`: las luces de color son solo degradados.
- **Copy exacto del lienzo:** «Crea tu cuenta», «7 días gratis, sin tarjeta. Al terminar decides si sigues.», «Sin contraseña: te mandamos un enlace para confirmar tu correo.», «Unos datos más», «Solo mayores de 18. Si no cumples la edad, no creamos la cuenta ni guardamos tus datos.», «Confirma tu correo», «Un periodo de prueba por persona.», «Solo mayores de 18. PitchLab no acepta apuestas.» Nada de «gana», «cobra», ROI, Kelly ni «Primer mes gratis».
- **`/login` no se toca en esta tarea**, salvo para extraer piezas compartidas sin cambiar cómo se ve.

## 2. Qué construir

### 2.1 Escritorio (`Signup.dc.html`)

- **Mismo marco que el login:** luces (espejadas: violeta arriba a la izquierda, verde abajo a la derecha, azul abajo a la izquierda, rosa arriba a la derecha), haces diagonales a 62°, retícula, columna de 1040 px centrada.
  - Barra: `BrandLogo` a la izquierda; «¿Ya tienes cuenta? Entrar» a la derecha (enlace a `/login`).
  - Pie: aviso legal a la izquierda; «Un periodo de prueba por persona.» a la derecha.
- **Hoja de vidrio** en dos columnas (`repeat(auto-fit, minmax(min(100%, 420px), 1fr))`):
  - **Izquierda, formulario** (máx. 360 px): aviso de invitación si aplica, barra de progreso de 2 tramos, «Paso N de 2» y el estado activo.
  - **Derecha, «Así se ve un partido»** (`.glass-card .glass-ring` con su luz): título «Compara su momio justo con el de tu casa.», la tarjeta del partido (`.glass-lens .glass-ring--featured`) con liga, equipos, `ProbSplit`, «Lo más probable» y su probabilidad, y tres celdas: **Momio justo**, **Tu momio** y **Diferencia**. Debajo, la lista de lo que incluye la prueba (3 renglones con palomita en `--pl-success`).
- **«Tu momio» de ejemplo calculado, no escrito:** toma el partido principal de `selectHeroMainCards`, su resultado más probable `p` y un momio de casa de ejemplo de **−200**. Implícita = 200/300; diferencia = (p − implícita) × 100 en puntos, con un decimal y signo. Usa los mismos helpers de momios que la landing. Si no hay datos, la vista previa no se muestra.

### 2.2 Móvil (`SignupMobile.dc.html`)

- Fluido: ancho 100 %, contenido de máx. 420 px con al menos 16 px por lado, `min-height: 100dvh`.
- Flecha de 44 px para volver a `/` y logo centrado; aviso de invitación; barra de progreso; título centrado; **el formulario de cada paso dentro de una hoja de vidrio**; al pie, «¿Ya tienes cuenta? Entrar» y el aviso legal.
- En el paso 2 los meses van abreviados (Ene, Feb…).
- Sin vista previa del partido en móvil.
- **Cero scroll horizontal** de 320 a 430 px. En 375×667 y 390×844 el paso 1 cabe sin scroll vertical. El paso 2 puede desplazarse un poco en 375×667, pero el botón «Crear cuenta» tiene que quedar visible al terminar de llenar.

### 2.3 Estados y comportamiento

| Estado | Qué se ve | Qué hace |
|---|---|---|
| **Paso 1 · cómo** | Google y Apple lado a lado, «o con tu correo», campo Correo (`id="auth-email"`), «Continuar». | Valida el correo (vacío, inválido, temporal con `isDisposableEmailDomain`) y pasa al paso 2 **sin llamar al servidor**. Google/Apple con cuentas: `startSocialSignIn(provider, "/onboarding")`; al volver sin fecha ni consentimientos, se muestra el paso 2 antes de `/onboarding`. En beta, Google/Apple muestran el aviso de siempre y van al paso 2 sin correo. |
| **Paso 2 · datos** | «Para {correo normalizado}» (de `normalizeTrialEmail`), fecha de nacimiento en 3 selectores (`autocomplete` `bday-day`/`bday-month`/`bday-year`), regla de edad, y 3 consentimientos: Términos y Aviso de privacidad (**Obligatorio**), Analítica anónima (**Opcional**), Novedades por correo (**Opcional**), estos dos desmarcados. «Crear cuenta» deshabilitado hasta tener fecha completa y términos aceptados. «Atrás». | Si la fecha da menos de 18 años: mensaje de error con `role="alert"`, no se envía nada y no se guarda nada. Con cuentas: `requestMagicLink(correo, "/onboarding")` → «Confirma tu correo». En beta: `openBetaPin("/onboarding")`, como hoy. |
| **Confirma tu correo** | Ícono de correo en vidrio, «Confirma tu correo», el correo en negritas, «Reenviar» y «Usar otro correo». | Reenviar, con un tope de 1 cada 30 s (cuenta regresiva en el botón). «Usar otro correo» vuelve al paso 1 con el campo vacío. |

- **Invitación:** si `initialPromoCode` coincide con el `promoCode` de un creador de `TIPSTAR_CREATORS`, el aviso dice «{Nombre} te invitó. Tus 7 días gratis ya están apartados.». Si el código es válido pero no tiene nombre, «{CÓDIGO} aplicado. Tus 7 días gratis ya están apartados.». Si no es válido, no se muestra nada (no inventes un error). Usa `describePromoBenefit` para decidir si es válido. Ponle `data-testid="invite-notice"`.
- **Edad y consentimientos sin backend nuevo:** hoy no hay tablas `consent`, `birth_date` ni `trial_claim` en `packages/db`. No crees migraciones. Valida la edad en el cliente, guarda el estado del paso 2 en un objeto tipado (`SignupDetails`: `birthDate`, `consents: { terms, analytics, marketing, version }`) y pásalo a una función `submitSignupDetails` que hoy solo lo deja en `sessionStorage` para `/onboarding`, con un comentario `// TODO(F4)` que apunte a `AUTH_BILLING_GROWTH.md` §1. Repórtalo al final como pendiente.
- **Errores** debajo del campo, con `aria-live="polite"` y `aria-describedby`. El de correo temporal conserva `role="alert"` y la palabra «temporales».
- **Mientras se envía:** botón ocupado (`aria-busy`, «Creando…»), sin doble envío.
- **Checkboxes** de 20 px dentro de una `<label>` de al menos 44 px de alto; el foco se ve con `--pl-brand`. Los selectores de fecha con su `aria-label` (Día, Mes, Año) dentro de un `<fieldset>` con `<legend>`.

### 2.4 La prueba E2E 2

Actualiza solo el bloque de `/signup` para el flujo nuevo, sin debilitarlo:

- `#auth-promo` ya no existe. En su lugar: `await expect(page.getByTestId("invite-notice")).toContainText("te invitó")`, o el texto del código si SOFIA5 no tiene nombre.
- Se queda igual: llenar `#auth-email` con `bot@mailinator.com`, enviar `form.auth-form` y esperar `p[role='alert']` con «temporales».
- Normalización: llena `Juan.Perez+promo@googlemail.com`, envía, y en el paso 2 espera `juanperez@gmail.com` en la página.
- axe sobre el paso 1 **y** sobre el paso 2, sin violaciones.

## 3. Reglas de implementación

- **Solo tokens `--pl-*`.** Cero hex fuera de `packages/tokens`.
- **Componentes existentes primero:** `BrandLogo`, `TeamBadge`, `LeagueBadge`, `ProbSplit`, los botones y campos de `@pitchlab/ui`. Los logos de Google y Apple, como SVG inline con `aria-hidden`.
- **Accesibilidad WCAG 2.2 AA:** `<label>` real en cada campo, objetivos de 44 px, contraste 4.5:1 incluso en las etiquetas «Obligatorio» y «Opcional» de 11 px, un `h1` por estado, y el foco pasa al `h1` al cambiar de paso.
- **Movimiento:** solo la entrada suave de cada paso (opacidad + 6 px, 300 ms). Con `prefers-reduced-motion`, nada.
- **Rendimiento:** la vista previa es de servidor; solo el formulario es cliente. No agregues dependencias.
- **Responsive:** debajo de 900 px de ancho la vista previa se oculta y la hoja queda de 460 px. Debajo de 760 px de alto se oculta la lista de lo que incluye la prueba.

## 4. Verificación (obligatoria antes de decir que terminaste)

1. `pnpm typecheck`, `pnpm lint` y `pnpm test`, en verde.
2. `pnpm --filter @pitchlab/web build` y luego `pnpm e2e`. Las pruebas 2 (con el bloque de `/signup` actualizado) y 3 en verde.
3. **Capturas** de `/signup` y `/signup?code=SOFIA5` en paso 1, paso 2 y «Confirma tu correo», comparadas con el lienzo: 1440×900 y 1280×720 en escritorio, 375×667 y 390×844 en móvil, en tema oscuro y claro. En cada una confirma que nada se corta y que no hay scroll horizontal.
4. A mano:
   - correo vacío, inválido y temporal;
   - fecha incompleta (botón deshabilitado);
   - una persona de 17 años (error, nada se envía);
   - términos sin marcar (botón deshabilitado);
   - «Atrás» conserva el correo;
   - «Reenviar» con su tope;
   - en beta, que el PIN 2026 lleve a `/onboarding`;
   - todo con teclado y con lector de pantalla en los errores.
5. `grep` de copy prohibido en lo que tocaste: «gana», «cobra», «ROI», «Kelly», «Primer mes gratis», «Sellar», `backdrop-filter`, `filter: blur`.
6. Agrega la entrada **SIGNUP-2** a `docs/execution/PROJECT_STATE.md` con qué cambió y qué quedó pendiente.

## 5. Terminado significa

- `/signup` igual al lienzo en los cuatro tamaños y los dos temas, con datos reales en la vista previa.
- E2E 2 y 3 en verde.
- **No hagas commit ni push.** Entrega un resumen con las capturas y los archivos tocados, y deja señalados estos pendientes para el fundador:
  - Guardar la fecha de nacimiento, los consentimientos con versión y el `trial_claim` (un trial por persona) cuando existan las tablas de F4.
  - Si al volver de Google o Apple el paso 2 se pide siempre o solo la primera vez.
