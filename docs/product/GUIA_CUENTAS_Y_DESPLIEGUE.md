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
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM` | Resend | 5 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud | 6 |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare | 7 |

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

   Debe terminar sin errores. Si después hay migraciones nuevas, se corre el mismo comando.

## Paso 4 · Encender las cuentas (Better Auth)

En Vercel, agrega:

- `BETTER_AUTH_SECRET`: un secreto nuevo.
- `BETTER_AUTH_URL`: `https://pitchlab.mx`, sin `/` al final.
- `PITCHLAB_ADMIN_EMAILS`: tu correo. Si son varios, sepáralos con comas.

Con `DATABASE_URL` y `BETTER_AUTH_SECRET` ya puestas, la app cambia sola a cuentas reales. El PIN sigue funcionando para los socios. **No hagas Redeploy hasta terminar el paso 5:** en producción la app no arranca el inicio de sesión sin `RESEND_API_KEY`.

## Paso 5 · Resend (el correo con el enlace para entrar)

1. Entra a <https://resend.com> y crea tu cuenta (plan gratis: 3,000 correos al mes).
2. Abre **Domains → Add Domain**, escribe `pitchlab.mx` y elige la región **North Virginia (us-east-1)**.
3. Resend muestra 3 o 4 registros (`MX` y `TXT` para `send`, `TXT` para `resend._domainkey` y, opcional, `_dmarc`). Créalos en el mismo DNS del paso 2, copiando nombre y valor tal cual.
4. Regresa a Resend y da clic en **Verify DNS Records**. Espera a que diga **Verified**.
5. Abre **API Keys → Create API Key**, con nombre `pitchlab-produccion`, permiso **Sending access** y dominio `pitchlab.mx`. **Cópiala en ese momento**: no se vuelve a mostrar.
6. En Vercel, agrega:
   - `RESEND_API_KEY`: la clave que copiaste.
   - `AUTH_EMAIL_FROM`: `PitchLab <acceso@pitchlab.mx>`
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

## Después (cuando decidas cobrar)

- Pasar a **Vercel Pro**: Hobby es solo para uso no comercial.
- **Stripe MX:**
  - precios de $299 al mes y $2,390 al año → `STRIPE_PRICE_MONTHLY` y `STRIPE_PRICE_ANNUAL`;
  - webhook a `https://pitchlab.mx/api/webhooks/stripe` → `STRIPE_WEBHOOK_SECRET`;
  - `STRIPE_SECRET_KEY`.
- **Connect** para tipstars → `STRIPE_CONNECT_WEBHOOK_SECRET` y `CRON_SECRET`.
- **Facturapi** → `FACTURAPI_KEY`, cuando definas con el contador quién factura.
- **Upstash Redis** (opcional y gratis) → `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN`, para que el límite de intentos del PIN funcione en todas las instancias.
