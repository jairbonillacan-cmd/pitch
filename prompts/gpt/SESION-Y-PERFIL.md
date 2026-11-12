# Prompt · Sesión recordada, confirmación de correo y perfil real con X (para GPT/Codex)

Copia todo lo que está debajo de la línea.

---

Eres un agente de código que trabaja en el repo de PitchLab, en `<REPO_ROOT>`, rama `gemini-reestructura`. **No trabajas solo:** Claude y otra sesión editan esta misma carpeta al mismo tiempo, y todos vemos los cambios en el mismo servidor, `http://localhost:9990`. Sigue al pie de la letra las reglas de trabajo compartido (sección 1).

## 0. Lee esto antes de escribir código, en este orden

1. `AGENTS.md`, `apps/web/PRODUCT.md`, `docs/design/DESIGN_SYSTEM.md`, `docs/design/UI_LIBRARIES.md`, `docs/design/INTERACTION_PATTERNS.md` y `docs/design/RESPONSIVE_RULES.md`. Toda pantalla nueva sigue esas reglas, con stories de Storybook en tema oscuro y claro.
2. En `docs/execution/PROJECT_STATE.md`, la entrada **CUENTAS-1**. Ahí está cómo funcionan hoy las cuentas.
3. El código actual:
   - `apps/web/src/server/auth.ts`: Better Auth 1.7.19 con enlace mágico, Google, Apple y Turnstile (plugin `captcha`).
   - `apps/web/src/server/viewer-access.ts`: `getViewerAccess()` dice quién está viendo (PIN, cuenta o nadie), si completó el registro y si tiene el Pase.
   - `apps/web/middleware.ts` y `apps/web/app/app/layout.tsx`: la entrada a `/app`.
   - `packages/ui/src/platform/public/SignupSurfaceV4.tsx` (pasos `method`, `details` y `sent`, `flushSignupDetails`) y `LoginSurfaceV4.tsx` (`requestLoginMagicLink`, paso `sent`).
   - `packages/ui/src/platform/public/AuthAndOnboardingSurfaces.tsx`: `/onboarding`, que guarda el paso 2 en el servidor.
   - `packages/db/src/signup.ts`: `completeSignup`, reglas del @usuario (`checkHandleFormat`, `isHandleAvailable`) y `viewerProfile`.
   - `packages/db/src/schema.ts` (tabla `users` y tablas `auth_*`) y `packages/db/migrations/` (van hasta la `0004`).
   - `packages/ui/src/platform/club/AnalystProfileClubView.tsx`: perfil `/app/u/[handle]`. El botón «Editar perfil» hoy solo lleva a `/app/account`.
   - `packages/ui/src/platform/platform-provider.tsx`: `ViewerIdentity` y `ownHandleFor`.
   - `packages/ui/src/platform/public/LandingClientIslands.tsx`: la barra de la landing, con «Entrar» y «Probar 7 días».
4. La API de Better Auth **de la versión instalada**: `node_modules/.pnpm/better-auth@1.7.19*/node_modules/better-auth/dist`. Revisa los tipos de `magicLink` (`callbackURL`, `newUserCallbackURL`, `errorCallbackURL`), de `socialProviders.twitter`, de `account.accountLinking` y del endpoint `link-social`. No te guíes por memoria: si algo de este prompt no coincide con esa versión, manda la versión instalada. Dilo en tu resumen.

Antes de editar, escribe un plan corto: archivos que cambias, migración nueva, endpoints nuevos y cómo vas a probar cada punto en `localhost:9990`.

## 1. Reglas de trabajo compartido (obligatorias)

- **El servidor ya está corriendo** en `http://localhost:9990`, en modo desarrollo: recarga al guardar y usa cuentas reales sobre la rama de prueba `local-9990` de Neon. **No arranques otro servidor en el 9990 ni lo detengas.** Si no responde, arráncalo en su propia terminal con `powershell -ExecutionPolicy Bypass -File scripts/local-9990.ps1` y espera a que diga «Ready».
- **Enlaces para entrar:** en local no se mandan correos. El enlace mágico se escribe en `.local/9990.log`, en una línea que empieza con `[auth]`. Lee siempre el último.
- **Cuenta de prueba:** `prueba.local@example.com` (`@prueba_local`). Si necesitas más cuentas, usa correos `@example.com`. Nunca uses correos reales.
- **Base de datos:**
  - Genera migraciones con `pnpm --filter @pitchlab/db exec drizzle-kit generate --name <nombre>`. La siguiente es la `0005`.
  - Aplícalas **solo** a la rama de prueba con `powershell -ExecutionPolicy Bypass -File scripts/migrate-9990.ps1`.
  - **Nunca** migres producción, nunca toques la rama `main` de Neon y nunca leas, imprimas ni copies cadenas de conexión.
- **Claves:** no crees cuentas en servicios externos ni pegues claves. Si algo necesita una clave (X), deja el código listo, apagado sin la clave, y anota qué debe crear el fundador.
- **Archivos de otra sesión:** estos son de la sesión de notificaciones; no los toques:
  - `packages/ui/src/platform/components/NotificationInbox.tsx`
  - `packages/ui/src/platform/notifications.ts`
  - `packages/ui/src/platform/notifications.stories.tsx`
  - `packages/ui/tests/notifications.test.ts`
  - `packages/ui/src/platform/components/PlatformOverlays.tsx`

  Si necesitas CSS en `apps/web/app/pitchlab-v4.css`, agrégalo **al final**, en un bloque propio con el comentario `/* SESION-PERFIL */`, sin mover ni reescribir lo demás.
- **Ediciones pequeñas:** vuelve a leer cada archivo justo antes de editarlo (alguien pudo cambiarlo) y haz cambios puntuales. No reformatees archivos completos.
- **Ignora `apps/web/tsconfig.json` y `apps/web/next-env.d.ts`.** El servidor del 9990 los modifica solo. No los edites ni los incluyas en tus cambios.
- **No hagas commit, push ni deploy.** Hay un límite de despliegues y el fundador decide cuándo publicar.

## 2. Qué construir

### 2.1 Confirmar el correo regresa a «Confirma tu correo» y desde ahí continúa

Hoy el enlace mágico abre otra pestaña directo en `/onboarding` (registro) o en `next` (login), y la pestaña original se queda para siempre en «Confirma tu correo».

Queremos:
- **El enlace del correo lleva a la misma pantalla de confirmación**, en estado «Correo confirmado»:
  - Registro: `/signup?paso=confirmado`.
  - Login: `/login?paso=confirmado&next=<ruta>`.
  - Esa pantalla muestra una palomita, «Correo confirmado» y «Entrando…». Luego continúa sola:
    - En el registro, guarda el paso 2 (`flushSignupDetails`) y va a `/onboarding`.
    - En el login, va a `next` (validado con `sanitizeNextPath`).
    - Si a la cuenta le falta el paso 2, va a `/signup?paso=2&via=cuenta`.
- **La pestaña original también se actualiza sola.** Mientras muestra «Confirma tu correo»:
  - Escucha un `BroadcastChannel("pitchlab-auth")`; la pestaña que confirmó publica `{ type: "signed-in" }`.
  - Como respaldo, consulta la sesión cada 4 s mientras la pestaña está visible, y al volver a ella (`visibilitychange`), hasta 15 minutos.
  - Al detectar la sesión, hace lo mismo que la pestaña de confirmación.
  - Las dos pestañas pueden continuar. Lo que no puede pasar es guardar el paso 2 dos veces: `completeSignup` debe seguir siendo idempotente. Pruébalo.
- **Enlace vencido o inválido:** usa `errorCallbackURL` para volver a la misma pantalla con «Este enlace ya no sirve» y el botón «Mandar otro enlace». No muestres pantallas en blanco ni JSON.
- Accesibilidad:
  - el cambio de estado se anuncia con `aria-live`;
  - el foco pasa al título;
  - con `prefers-reduced-motion`, sin animación.

### 2.2 La sesión se recuerda

Si alguien ya entró, nunca debe volver a ver el formulario para entrar:
- **`/login` y el paso 1 de `/signup`:** si `getViewerAccess()` dice que hay sesión (cuenta o PIN), redirige desde el servidor:
  - con registro completo, a `next` saneado o a `/app`;
  - con cuenta a la que le falta el paso 2, a `/signup?paso=2&via=cuenta`.
  - Excepción: `/signup?paso=2…` y los estados `paso=confirmado` se siguen mostrando.
- **Landing (`/`) y las páginas públicas del menú:**
  - con sesión, «Entrar» cambia a **«Ir a la app»** → `/app`;
  - «Probar 7 días» → `/app`.
  - Para no hacer lenta la landing, en ese punto solo revisa si existe la cookie de sesión de Better Auth (`getSessionCookie` de `better-auth/cookies`) o la del PIN (`pl_beta`). Sin consultar la base: `/app` ya valida todo.
- **Cerrar sesión sigue funcionando:** después de salir, «Entrar» vuelve a aparecer.

### 2.3 «Editar perfil» edita el perfil real, con cuentas conectadas (X)

**Base (migración `0005`)**, en la tabla `users`:
- `bio` (`varchar(160)`, opcional);
- `x_username` (`text`, opcional);
- `x_linked_at` (`timestamptz`, opcional).

Nada más. La foto de perfil queda para después.

**API:**
- `GET /api/me/profile` y `PATCH /api/me/profile` (con sesión): nombre visible, @usuario y bio.
  - Mismas reglas del paso 2: `cleanDisplayName`, `checkHandleFormat` e `isHandleAvailable` (el propio cuenta como libre).
  - Bio de 0 a 160 caracteres. Sin enlaces en la bio: la misma regla de enlaces externos que Comunidad.
  - `409` si el @usuario está ocupado.
- `GET /api/u/[handle]` (público): solo nombre visible, @usuario, bio, `xUsername`, la fecha en que se unió y si es tipstar. **Nunca** correo, fecha de nacimiento ni consentimientos. `404` si no existe.
- Si alguien cambia de @usuario, `/app/u/<viejo>` responde 404. No hace falta redirigir.

**Conectar X:**
- Usa Better Auth: `socialProviders.twitter`, solo si existen `TWITTER_CLIENT_ID` y `TWITTER_CLIENT_SECRET`, y **solo para conectar**, no para crear cuentas ni para entrar.
  - Con X no se puede crear cuenta ni iniciar sesión: busca en la versión instalada la opción para desactivar el alta con ese proveedor.
  - Conectar usa el endpoint de vincular cuenta (`link-social`) con `account.accountLinking` habilitado y permitiendo un correo distinto, porque X no siempre da correo.
- Al conectar, guarda el @ de X en `users.x_username` y la fecha en `x_linked_at`. Al desconectar, bórralos y quita la cuenta vinculada.
- **Nunca** permitas escribir el @ de X a mano: solo cuenta lo que confirma X. Así nadie se hace pasar por otra persona.
- Sin las claves:
  - el botón «Conectar X» se ve desactivado, con la nota «Pronto»;
  - el endpoint responde `503`.

**Interfaz:**
- «Editar perfil» (en tu perfil `/app/u/<tú>`) abre una hoja:
  - Drawer de HeroUI en móvil y Modal en escritorio, según `UI_LIBRARIES.md`;
  - campos: Nombre, Usuario (con la misma revisión de «libre/ocupado» del registro) y Bio (con contador `n/160`);
  - sección **Cuentas conectadas** con X (logo, «Conectar» o «@usuario · Desconectar»);
  - botones «Guardar» y «Cancelar».
- Guardar actualiza la `ViewerIdentity` sin recargar la página. Si cambia el @usuario, la URL pasa a `/app/u/<nuevo>`.
- **El perfil `/app/u/[handle]` muestra los datos reales** (los propios y los de otros socios con cuenta, vía `/api/u/[handle]`):
  - nombre, @usuario y bio;
  - si tiene X, una ficha con el logo de X y `@usuario` que abre `https://x.com/<usuario>` en otra pestaña (`rel="noopener noreferrer"`).
  - Los perfiles de ejemplo (marcados «Ejemplo») se quedan como están.
- Copy sin relleno, en español de México; sin «VIP», «ROI» ni «gana».
- Solo tokens `--pl-*`, sin `backdrop-filter` ni `filter: blur`.
- Objetivos de 44 px en móvil y WCAG 2.2 AA.

## 3. Verificación (antes de decir que terminaste)

1. `pnpm --filter @pitchlab/db exec vitest run --pool=threads --no-file-parallelism`, y las pruebas de `@pitchlab/web` y `@pitchlab/ui` que toques, en verde. En esta PC las pruebas con PGlite en paralelo se pasan de tiempo: córrelas en serie. Agrega pruebas de:
   - perfil: validaciones, `409`, bio con enlace rechazada, y que `/api/u/[handle]` no expone correo ni fecha;
   - que guardar el paso 2 dos veces no duplica la prueba de 7 días;
   - la regla de «sesión ⇒ redirigir» de `/login` y `/signup`.
2. `pnpm --filter @pitchlab/web exec tsc --noEmit -p .`, igual en `@pitchlab/ui` y `@pitchlab/db`, y `node scripts/lint-codebase.mjs`, en verde.
3. **En `localhost:9990`**, a mano o con Playwright apuntando a ese puerto:
   - Registro con un correo nuevo `@example.com`. Deja abierta la pestaña de «Confirma tu correo» y abre el enlace del log en otra: las dos deben terminar dentro sin intervención.
   - Enlace vencido: el mensaje correcto y «Mandar otro enlace».
   - Con sesión, abrir `/`: debe decir «Ir a la app». Abrir `/login`: termina en `/app`.
   - Cerrar sesión: vuelve «Entrar».
   - Editar perfil:
     - cambiar nombre, @usuario y bio, y ver el cambio en la barra superior, en el perfil y en Comunidad;
     - intentar `@prueba_local` desde otra cuenta: «ocupado».
   - «Conectar X» desactivado con «Pronto» (no hay claves).
   - Capturas de la hoja de edición y del perfil en 1440 px y 390 px, en oscuro y en claro.
4. Actualiza `docs/execution/PROJECT_STATE.md` con la entrada **SESION-PERFIL** (qué cambió y qué quedó pendiente). En `docs/product/GUIA_CUENTAS_Y_DESPLIEGUE.md`, agrega una sección «Conectar X» con lo que debe hacer el fundador:
   - crear la app en el portal de desarrolladores de X, con OAuth 2.0 tipo Web App y permisos de solo lectura;
   - URLs de callback `https://pitchlab.mx/api/auth/callback/twitter` y `http://localhost:9990/api/auth/callback/twitter`;
   - variables `TWITTER_CLIENT_ID` y `TWITTER_CLIENT_SECRET` en Vercel y en `.env.9990.local`.

## 4. Terminado significa

- Las tres cosas funcionando en `localhost:9990`, con pruebas en verde y capturas.
- **Sin commit, push ni deploy.** Entrega un resumen con:
  - archivos tocados;
  - la migración nueva;
  - lo que el fundador debe hacer (claves de X);
  - un recordatorio: antes del próximo deploy hay que aplicar la migración `0005` a producción y probar «Conectar X» con las claves reales.
