# Guía · Cuentas reales y PitchLab en pitchlab.mx

> **Para:** el fundador, paso a paso y sin experiencia previa.
> **Fecha:** 2026-11-12 · **Rama:** `gemini-reestructura`
> **Regla:** las claves solo las pegas tú, en Vercel y en tu terminal. Nunca en el chat, en el repo ni en capturas.

## Qué hace ya el código

- **Entrar con cuenta:** correo con enlace mágico y Google; Apple queda listo para después.
- **Registro en dos pasos:** el paso 2 guarda en la base la fecha de nacimiento, la mayoría de edad y los consentimientos con su versión.
- **Prueba de 7 días sin tarjeta:** se da una sola vez por correo. `ana.lopez+1@gmail.com` cuenta igual que `analopez@gmail.com`.
- **Referidos:** si llegó con `?code=`, la persona queda ligada a quien la invitó.
- **Acceso a `/app`:**
  - Entran el PIN de la beta (como hoy) y las cuentas que completaron el registro y tienen el Pase vigente.
  - Quien no terminó el paso 2 regresa a él.
  - Los correos de `PITCHLAB_ADMIN_EMAILS` siempre entran.
- **Turnstile:** protege el envío del enlace mágico contra robots. Es invisible y solo aparece si Cloudflare duda.

## Resumen de variables

| Variable | De dónde sale | Paso |
|---|---|---|
| `PITCHLAB_BETA_CODE` | La inventas tú (4 dígitos) | 1 |
| `PITCHLAB_COOKIE_SECRET` | Secreto generado | 1 |
| `FOOTBALL_DATA_API_KEY` | football-data.org | 1 |
| `DATABASE_URL` | Neon | 3 |
| `BETTER_AUTH_SECRET` | Secreto generado | 4 |
| `BETTER_AUTH_URL` | `https://pitchlab.mx` | 4 |
| `PITCHLAB_ADMIN_EMAILS` | Tu correo | 4 |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, `EMAIL_FROM`, `PITCHLAB_SUPPORT_EMAIL` | Resend | 5 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud | 6 |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare | 7 |
| `BLOB_READ_WRITE_TOKEN` | Vercel (**Storage → Blob**, opcional) | Foto de perfil |

**Cómo generar un secreto:** en una terminal dentro de la carpeta del proyecto, corre:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copia lo que imprime y pégalo directo en Vercel. Usa uno distinto para cada variable.

**Cómo agregar una variable en Vercel:**
1. Entra a tu proyecto y abre **Settings → Environment Variables**.
2. Escribe el nombre (*Key*) y el valor (*Value*). Marca **Production** y **Preview**.
3. Da clic en **Save**.
4. Los cambios se aplican en el siguiente despliegue: ve a **Deployments**, abre el menú **⋯** del más reciente y elige **Redeploy**.

## Paso 1 · Vercel (publicar con el PIN)

1. Entra a <https://vercel.com/signup>, elige **Hobby** y entra con **Continue with GitHub**, con la cuenta dueña del repo `pitch`.
2. Da clic en **Add New… → Project** y, junto al repo `pitch`, en **Import**. Si no aparece, usa **Adjust GitHub App Permissions** y dale acceso al repo.
3. En **Configure Project**:
   - **Framework Preset:** Next.js.
   - **Root Directory:** da clic en **Edit** y elige `apps/web`.
   - **Build and Output Settings:** activa **Override** en *Build Command* y escribe `cd ../.. && pnpm build`. En *Install Command* escribe `pnpm install`.
   - **Environment Variables:** agrega `PITCHLAB_BETA_CODE`, `PITCHLAB_COOKIE_SECRET` y, si ya la tienes, `FOOTBALL_DATA_API_KEY` (es gratis en <https://www.football-data.org/client/register>).
4. Da clic en **Deploy**. Tarda unos minutos y al final te da una dirección `….vercel.app`.
5. Abre **Settings → Git** (en algunas cuentas es **Settings → Environments → Production**) y pon como rama de producción `gemini-reestructura`. Cuando se lleve a `main` con un PR, la cambias a `main`.

## Paso 2 · El dominio pitchlab.mx

1. En Vercel abre **Settings → Domains**, escribe `pitchlab.mx` y da clic en **Add**. Acepta la opción recomendada, que agrega también `www.pitchlab.mx` y lo redirige.
2. Vercel muestra los registros que faltan, casi siempre:
   - Un registro `A` con nombre `@` y valor `76.76.21.21`.
   - Un registro `CNAME` con nombre `www` y valor `cname.vercel-dns.com`.
   - **Usa los valores exactos que te muestre Vercel**, no los de esta guía.
3. Entra a donde compraste el dominio (Akky, GoDaddy, Namecheap, Cloudflare…), busca **DNS** o **Zona DNS** y crea esos dos registros. Si ya había un `A` en `@`, edítalo en vez de duplicarlo.
4. Si el DNS está en Cloudflare, deja esos dos registros con la nube **gris** (*DNS only*).
5. Espera de 5 minutos a unas horas. Cuando Vercel muestre **Valid Configuration**, `https://pitchlab.mx` ya funciona con candado.

## Paso 3 · Neon (la base de datos)

1. Entra a <https://neon.tech> y elige **Sign up** con GitHub. El plan gratis alcanza.
2. Crea un proyecto con nombre `pitchlab`, región **AWS US East (N. Virginia)** (la misma de Vercel) y la versión de Postgres que venga por defecto.
3. En el panel, da clic en **Connect**. Deja activado **Connection pooling** y copia la cadena completa, la que empieza con `postgresql://`.
4. En Vercel, agrega `DATABASE_URL` con esa cadena. **Todavía no hagas Redeploy.**
5. Crea las tablas una sola vez. En PowerShell, dentro de la carpeta del proyecto (cambia el texto entre comillas por tu cadena):

   ```powershell
   $env:DATABASE_URL="postgresql://…"; pnpm --filter @pitchlab/db migrate
   ```

   Debe terminar sin errores. Para los siguientes deploys usa el paso **Antes de cada deploy** de abajo.

### Antes de cada deploy (migrar primero, desplegar después)

Siempre sigue este orden cuando haya cambios de base de datos: **primero migrar producción y después desplegar en Vercel**, porque el código nuevo espera encontrar las columnas y tablas nuevas apenas arranca.

1. En PowerShell, dentro de la carpeta del proyecto (con `neon login` activo), corre:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/migrate-prod.ps1
   ```

2. El script consulta la rama `main` de Neon sin mostrar la cadena de conexión y enlista qué archivos de `packages/db/migrations` faltan frente a `drizzle.__drizzle_migrations` (hoy en producción faltan `0005_perfil_y_conexion_x`, `0006_correos_programados`, `0007_comunidad`, `0008_notificaciones`, `0009_moderacion_comunidad` y `0010_avatar_perfil`). Si ya está al día, avisa y termina sin tocar nada.
3. Revisa la lista, escribe `MIGRAR` (en mayúsculas) para confirmar y espera el mensaje verde `Migraciones aplicadas en produccion (rama main).`.
4. Recién cuando la migración termine sin errores, haz `git push` o **Deploy / Redeploy** en Vercel.

## Paso 4 · Encender las cuentas (Better Auth)

En Vercel, agrega:

- `BETTER_AUTH_SECRET`: un secreto nuevo.
- `BETTER_AUTH_URL`: `https://pitchlab.mx`, sin `/` al final.
- `PITCHLAB_ADMIN_EMAILS`: tu correo. Si son varios, sepáralos con comas.

Con `DATABASE_URL` y `BETTER_AUTH_SECRET` ya puestas, la app cambia sola a cuentas reales. El PIN sigue funcionando para los socios. **No hagas Redeploy hasta terminar el paso 5:** en producción la app no arranca el inicio de sesión sin `RESEND_API_KEY`.

## Paso 5 · Resend (el correo con el enlace para entrar)

1. Entra a <https://resend.com> y crea tu cuenta (plan gratis: 3,000 correos al mes).
2. Abre **Domains → Add Domain**, escribe `pitchlab.mx` y elige la región **North Virginia (us-east-1)**. Si el DNS está en Cloudflare, usa **Auto configure** para que Resend cree los registros solo.
3. Resend muestra 3 o 4 registros (`MX` y `TXT` para `send`, `TXT` para `resend._domainkey` y, opcional, `_dmarc`). Créalos en el mismo DNS del paso 2, copiando nombre y valor tal cual.
4. Regresa a Resend y da clic en **Verify DNS Records**. Espera a que diga **Verified**.
5. Abre **API Keys → Create API Key**, con nombre `pitchlab-produccion`, permiso **Sending access** y dominio `pitchlab.mx`. **Cópiala en ese momento**: no se vuelve a mostrar.
6. En Vercel, agrega:
   - `RESEND_API_KEY`: la clave que copiaste.
   - `AUTH_EMAIL_FROM`: `PitchLab <acceso@pitchlab.mx>`
   - `EMAIL_FROM`: `PitchLab <hola@pitchlab.mx>` (bienvenida y avisos de la prueba)
   - `PITCHLAB_SUPPORT_EMAIL`: el correo al que responde la gente y que sale en el pie de cada correo.
7. Ahora sí, haz **Redeploy**.

## Paso 6 · Entrar con Google

1. Entra a <https://console.cloud.google.com> con tu cuenta de Google. Arriba a la izquierda, abre el selector de proyecto, elige **New Project**, ponle `PitchLab` y da clic en **Create**.
2. Busca **Google Auth Platform**, que antes se llamaba *OAuth consent screen*, y da clic en **Get started**:
   - Nombre de la app: `PitchLab`. Correo de soporte: el tuyo.
   - **Audience:** External.
   - Contacto: tu correo. Acepta la política y da clic en **Create**.
3. En **Branding**:
   - Página de inicio: `https://pitchlab.mx`
   - Privacidad: `https://pitchlab.mx/legal/privacidad`
   - Términos: `https://pitchlab.mx/legal/terminos`
   - Dominio autorizado: `pitchlab.mx`
   - **No subas logo**: subirlo obliga a una revisión de Google que tarda semanas.
4. En **Clients**, da clic en **Create client** y elige el tipo **Web application**, con nombre `PitchLab web`:
   - **Authorized JavaScript origins:** `https://pitchlab.mx`
   - **Authorized redirect URIs:** `https://pitchlab.mx/api/auth/callback/google` (y, para probar en tu PC, `http://localhost:3000/api/auth/callback/google`).
   - Da clic en **Create** y copia el **Client ID** y el **Client secret**.
5. En **Audience**, da clic en **Publish app**. Sin esto, solo entran los correos de prueba.
6. En Vercel, agrega `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, y haz **Redeploy**.

Apple queda para después: pide el Apple Developer Program (US$99 al año) y su secreto caduca cada 6 meses. Mientras tanto, el botón de Apple avisa que todavía no está disponible.

## Paso 7 · Cloudflare Turnstile (anti-robots)

1. Entra a <https://dash.cloudflare.com/sign-up> y crea una cuenta gratis. No hace falta mover el dominio a Cloudflare.
2. En el menú, abre **Turnstile → Add widget**:
   - Nombre: `PitchLab`.
   - **Hostnames:** `pitchlab.mx` (y `localhost` si quieres probar en tu PC).
   - **Widget mode:** Managed.
   - Da clic en **Create**.
3. Copia la **Site Key** y la **Secret Key**.
4. En Vercel, agrega las dos (**van las dos o ninguna**) y haz **Redeploy**:
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: la Site Key.
   - `TURNSTILE_SECRET_KEY`: la Secret Key.

## Paso 8 · Probar de punta a punta

1. Abre `https://pitchlab.mx/signup` en una ventana privada.
2. Prueba con correo:
   - Escribe tu correo, pon tu fecha de nacimiento y acepta los términos.
   - Abre el correo **Tu acceso a PitchLab** y da clic en **Entrar a PitchLab**.
   - En `/onboarding` debe aparecer «Tu prueba de 7 días ya está activa.». Termina y entra a `/app`.
3. Prueba con Google en otra ventana privada: elige Google, completa el paso 2 y entra.
4. Revisa en Neon (**Tables → users**) que aparezcan tus registros con `is_adult` en `true` y su `birth_date`.

**Si algo falla:** en Vercel abre **Deployments**, elige el más reciente y luego **Logs**. Ahí aparece el error; cópialo al chat, pero **tapa cualquier clave** antes.

## Foto de perfil (Vercel Blob)

La foto de perfil de cada socio (`POST /api/me/avatar`) se recorta a un cuadrado de 256 px y se guarda en **Vercel Blob**. Mientras no exista `BLOB_READ_WRITE_TOKEN`, el botón en «Editar perfil» muestra **«Pronto»** y el resto del perfil sigue usando las iniciales.

1. En Vercel, entra al proyecto `pitchlab` y abre la pestaña **Storage** (en algunas vistas está en el menú lateral de tu equipo como **Storage → Create Database / Store**).
2. Elige **Blob** (*Serverless Object Storage*), ponle nombre `pitchlab-avatars` y selecciona acceso **Public** (las fotos de perfil se muestran en Comunidad y perfiles públicos).
3. Conecta el store al proyecto `pitchlab` marcando **Production** y **Preview**. Vercel crea y guarda sola la variable `BLOB_READ_WRITE_TOKEN` en **Settings → Environment Variables**.
4. Asegúrate de haber corrido antes `scripts/migrate-prod.ps1` (incluye `0010_avatar_perfil`, que agrega `users.avatar_url`) y haz **Redeploy** en **Deployments** para que la app tome la variable.
5. Si quieres probar la subida en tu PC (`9990`), copia el token de desarrollo desde el panel del Blob Store a `.env.9990.local` como `BLOB_READ_WRITE_TOKEN=…` (nunca al repo).

## Conectar X

1. Crea una app en el portal de desarrolladores de X. En su configuración de autenticación, habilita OAuth 2.0, elige **Web App** y selecciona permisos de solo lectura. [Documentación de OAuth 2.0 de X](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code)
2. Registra estas dos URLs de callback.
   - `https://pitchlab.mx/api/auth/callback/twitter`
   - `http://localhost:9990/api/auth/callback/twitter`
3. Guarda el Client ID y el Client Secret como `TWITTER_CLIENT_ID` y `TWITTER_CLIENT_SECRET` en Vercel y en `.env.9990.local`. El botón muestra «Pronto» hasta que existan ambas variables.
4. Antes del próximo deploy, aplica la migración `0005_perfil_y_conexion_x` a producción y prueba «Conectar X» en el 9990 con las claves reales. Confirma que el usuario que devuelve X aparece en el perfil público y desaparece al desconectar. El proveedor solo se habilita para vincularlo desde una sesión de PitchLab.

## Después (cuando decidas cobrar)

- Pasar a **Vercel Pro**: Hobby es solo para uso no comercial.
- **Stripe MX:**
  - precios de $299 al mes y $2,390 al año → `STRIPE_PRICE_MONTHLY` y `STRIPE_PRICE_ANNUAL`;
  - webhook a `https://pitchlab.mx/api/webhooks/stripe` → `STRIPE_WEBHOOK_SECRET`;
  - `STRIPE_SECRET_KEY`.
- **Connect** para tipsters → `STRIPE_CONNECT_WEBHOOK_SECRET` y `CRON_SECRET`.
- **Facturapi** → `FACTURAPI_KEY`, cuando definas con el contador quién factura.
- **Upstash Redis** (opcional y gratis) → `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`, para que el límite de intentos del PIN funcione en todas las instancias.
