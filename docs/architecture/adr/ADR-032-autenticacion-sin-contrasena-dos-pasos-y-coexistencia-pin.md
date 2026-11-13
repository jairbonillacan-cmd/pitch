---
status: accepted
date: 2026-11-13
updates:
  - ADR-010
  - ADR-025
---

# ADR-032: Autenticación sin contraseña en dos pasos, coexistencia con PIN de beta (`getViewerAccess`) y Turnstile condicional

- **Estado:** Aceptada (`accepted`). Actualiza y concreta [ADR-010](ADR-010-autenticacion-con-better-auth.md) y [ADR-025](ADR-025-zero-leak-subscription-tipster-referrals.md).
- **Fecha:** 2026-11-13 (implementada en `LOGIN-2`, `SIGNUP-2` y `CUENTAS-1`: `apps/web/src/server/auth.ts`, `viewer-access.ts`, `signup.ts`, `apps/web/middleware.ts` y `packages/ui/src/platform/public/`).

## Contexto

[ADR-010](ADR-010-autenticacion-con-better-auth.md) contemplaba un paquete separado `packages/auth` con correo y contraseña, OAuth, enlace mágico y 2FA obligatorio desde el inicio. Al llevar cuentas reales a código junto con los nuevos lienzos de `/login` y `/signup` y la guía operativa para el fundador (`docs/product/GUIA_CUENTAS_Y_DESPLIEGUE.md`), aparecieron cuatro restricciones prácticas:

1. Habilitar contraseñas en el lanzamiento obliga a mantener flujos de recuperación, hashing y soporte de contraseñas olvidadas, además de no probar posesión del buzón antes de otorgar los 7 días sin tarjeta.
2. En el flujo OAuth (Google/Apple) o de enlace mágico, el proveedor autentica la identidad *antes* de conocer si la persona es mayor de 18 años o aceptó Términos y Aviso de privacidad vigentes (`LFPDPPP`).
3. El acceso con PIN (`pl_beta`) debe seguir funcionando para socios y para la suite E2E sin variables externas, mientras el fundador activa Neon, Resend, Google y Turnstile paso a paso.
4. Si Cloudflare Turnstile se exige en el servidor cuando falta la clave pública en el cliente (o viceversa), el inicio de sesión por correo queda bloqueado por completo.

## Decisión

1. **Better Auth integrado en `apps/web/src/server/auth.ts` con encendido condicional:**
   - `getAuth()` se activa únicamente cuando existen `DATABASE_URL` y `BETTER_AUTH_SECRET`; sin ellas devuelve `null` y toda la plataforma opera en modo beta por PIN sin errores. En `NODE_ENV === "production"` con cuentas activas, `RESEND_API_KEY` es obligatoria (en desarrollo se imprime el enlace en consola).
   - Al crearse un `auth_user`, un `databaseHook` ejecuta `linkProfile()` para enlazar o crear el registro en `users` por correo en minúsculas y asignarle un código único `SOCIO-XXXXXX`.
2. **Acceso 100 % sin contraseña en lanzamiento (`passwordSignInEnabled = false`):**
   - Métodos activos: **enlace mágico por correo** (vigencia de 15 min vía Resend HTTP API y tope de reenvío de `30 s` en cliente) y **Google OAuth** (con **Apple Sign-In** listo para encenderse al cargar sus credenciales). La vista de contraseña en `LoginSurfaceV4` permanece apagada tras `passwordSignInEnabled = false`.
   - Los administradores se resuelven por lista explícita `PITCHLAB_ADMIN_EMAILS` sin requerir un paquete extra de 2FA en el arranque.
3. **Registro en dos pasos y compuerta legal +18 (`SignupSurfaceV4` + `POST /api/me/signup`):**
   - **Paso 1:** selección de vía (Google, Apple o correo validado contra `isDisposableEmailDomain` y canonicalizado con `normalizeTrialEmail` antes de tocar el servidor) y lectura silenciosa de `?code=` / `?ref=` / `?invite=` sin campo manual de cupón.
   - **Paso 2:** captura de fecha de nacimiento (`Día / Mes / Año`) y consentimientos versionados (`termsVersion` obligatorio; analítica y novedades opcionales desmarcados por defecto). Si la edad calculada es `< 18` años, se rechaza en cliente y servidor **sin guardar datos personales**.
   -Al confirmar (`POST /api/me/signup`, migración `0004`), se persisten `is_adult`, `birth_date` y consentimientos, se otorga de forma idempotente la prueba de 7 días una sola vez por correo canónico SHA-256 (`trial_fingerprints`) y se registra la atribución en `referral_grants` (`trial_started`).
4. **Doble llave en `middleware.ts` y `getViewerAccess()` (`apps/web/src/server/viewer-access.ts`):**
   - `middleware.ts` hace el filtro rápido de `/app/**` dejando pasar tanto la cookie firmada `pl_beta` como la cookie de sesión de Better Auth.
   - `getViewerAccess()` (memorizada por petición con `React.cache()`) valida en servidor: (a) cookie `pl_beta` válida → acceso completo; o (b) sesión Better Auth activa: si `!signupCompleted`, redirige a `/signup?paso=2&via=cuenta`; si completó el paso 2, otorga `fullAccess` solo con `hasActivePaseTotal` vigente o correo en `PITCHLAB_ADMIN_EMAILS`. Cerrar sesión limpia ambas llaves.
5. **Turnstile simétrico (`NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`):** el plugin `captcha` de Better Auth sobre `/sign-in/magic-link` solo se monta cuando **ambas** variables están definidas, evitando bloqueos por configuración parcial.

## Qué actualiza

- **ADR-010:** sustituye `packages/auth` por `apps/web/src/server/auth.ts`, apaga correo+contraseña en el lanzamiento (`passwordSignInEnabled = false`) y usa `PITCHLAB_ADMIN_EMAILS` + doble llave con `pl_beta` durante la transición.
- **ADR-025:** elimina el campo manual de código promocional en `/login` y `/signup` a favor de atribución limpia por parámetro URL (`?code=` / `?ref=`).

## Alternativas descartadas

- **Formulario único largo con contraseña en `/signup`:** mayor abandono móvil y carga innecesaria de gestión de contraseñas cuando el enlace mágico ya verifica el correo.
- **Retirar de inmediato el PIN `pl_beta` al escribir el código de cuentas:** rompería el acceso actual de socios y las pruebas E2E antes de que el fundador cargue secretos productivos en Vercel y Neon.
- **Guardar en base de datos intentos de registro de menores de 18 años:** descartado por minimización de datos y cumplimiento legal.

## Consecuencias

- El código de cuentas vive desplegado en la rama principal sin afectar el modo PIN hasta que se declaren `DATABASE_URL`, `BETTER_AUTH_SECRET` y `RESEND_API_KEY`.
- Cualquier cuenta autenticada vía Google/Apple que aún no tenga `birth_date` y `terms_accepted_at` es reconducida automáticamente al paso 2 antes de entrar a `/app`.
