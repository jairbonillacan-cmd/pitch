# Prompt para Gemini · COMUNIDAD-2 (cerrar lo pendiente antes del deploy)

Copia todo lo que va debajo de la línea.

---

Eres el agente de desarrollo de PitchLab. Trabajas en el monorepo de `C:\Users\T490s\Desktop\Proyectos\PitchLab`, rama `gemini-reestructura`. Antes de tocar nada, lee `AGENTS.md`, `docs/execution/PROJECT_STATE.md` (entradas **COMUNIDAD-1**, **SESION-PERFIL** y **CUENTAS-1**) y `docs/product/GUIA_CUENTAS_Y_DESPLIEGUE.md`.

## 0. Reglas de trabajo compartido (obligatorias)

- **Trabaja en esa carpeta, no en un worktree nuevo.** Hay trabajo sin commit que solo existe ahí, y el fundador revisa tus cambios en vivo en `http://localhost:9990`.
- **El servidor del 9990 ya está corriendo** en modo desarrollo y recarga al guardar. No lo arranques ni lo detengas. Si se cae, avisa; el comando es `powershell -ExecutionPolicy Bypass -File scripts/local-9990.ps1`.
- **Cuentas de prueba.** El 9990 usa la rama de prueba `local-9990` de Neon. Los enlaces para entrar no llegan por correo: se escriben en `.local/9990.log`. Cuentas existentes:
  - `prueba.local@example.com` (`@prueba_local`)
  - `prueba.dos@example.com` (`@lupita_mx`)
  Para entrar, pide el enlace con `POST /api/auth/sign-in/magic-link` y abre la URL que aparece en el log.
- **Migraciones en la base de prueba:** solo con `scripts/migrate-9990.ps1`.
- **Producción no se toca.** Ni la base de producción (rama `main` de Neon) ni Vercel. Nada de push ni deploy: el fundador tiene un límite de deploys.
- **Claves:** no crees, pidas ni imprimas claves o cadenas de conexión. Si algo necesita una clave nueva, déjalo apagado sin ella, igual que X con «Pronto».
- **Diseño:** cada pantalla sigue `AGENTS.md` y `docs/design/` (estándar *curado*, tokens de `@pitchlab/tokens`, sin colores hex fuera de tokens, estados vacío, cargando y error, tema oscuro y claro, 390 px sin scroll horizontal). Los estilos de Comunidad van en `apps/web/app/community-social.css`.
- **Ignora** los cambios automáticos de `apps/web/next-env.d.ts` y `apps/web/tsconfig.json` que hace el servidor de desarrollo: no los incluyas en commits.
- **En esta PC las pruebas de la base fallan en paralelo.** Córrelas así: `cd packages/db; npx vitest run --no-file-parallelism --testTimeout=60000`. En web: `cd apps/web; npx vitest run tests --testTimeout=30000`.

## 1. Commit del trabajo pendiente (primero, antes de programar nada)

En la carpeta hay cambios sin commit de otra sesión, ya probados. Con todas las pruebas pasando, haz **dos commits locales** (sin push), con mensajes en español con formato convencional:

1. **`fix(ui): …`**, tres correcciones:
   - Al cambiar el @usuario en «Editar perfil», `AnalystProfileClubView.tsx` recarga la nueva dirección con `window.location.replace`.
   - Con sesión iniciada, el botón de `PublicHeaderV4` en `ShellChrome.tsx` dice «Ir a la app».
   - El título en `apps/web/app/layout.tsx` es el mismo de la landing.
2. **`feat(comunidad): …`**, todo lo de COMUNIDAD-1:
   - Base: migración `0007_comunidad`, `packages/db/src/social.ts` y su prueba.
   - Servidor: rutas `apps/web/app/api/social/**`, `apps/web/src/server/social.ts`, la prueba `apps/web/tests/social.test.ts` y el cambio en la página `/app/u/[handle]`.
   - Interfaz y contrato: `social-sync.ts` con su prueba, y los cambios en el proveedor, `CommunityClubView`, `community-ui`, `MaestroPrimitives`, `types.ts`, `contracts/profiles.ts` y `community-social.css`.
   - Documentación: `PROJECT_STATE.md` y la guía.

`AnalystProfileClubView.tsx` tiene cambios de los dos commits. Si no puedes separarlos limpio, mételos en el segundo y dilo en el mensaje del commit. Antes de cada commit, revisa con `git diff --staged` que no entre nada ajeno.

## 2. Migraciones de producción: dejarlas listas, NO aplicarlas

A producción le faltan `0005_perfil_y_conexion_x`, `0006_correos_programados` y `0007_comunidad`. Además, lo que construyas abajo traerá la `0008` y quizá más.

- Crea `scripts/migrate-prod.ps1`, copiando la forma de `scripts/migrate-9990.ps1`:
  1. Obtiene la cadena de la rama `main` con `neon connection-string main --project-id lively-cloud-08121218 --database-name neondb` sin imprimirla.
  2. Antes de migrar, lista las migraciones que faltan: compara la carpeta `packages/db/migrations` con la tabla `drizzle.__drizzle_migrations`, solo leyendo.
  3. Pide confirmación escribiendo `MIGRAR`.
  4. Corre `pnpm --filter @pitchlab/db migrate` y borra la variable al terminar.
- **No lo ejecutes.** Lo correrá el fundador justo antes del deploy.
- En `docs/product/GUIA_CUENTAS_Y_DESPLIEGUE.md`, reemplaza la nota de migraciones pendientes por un paso «Antes de cada deploy» que use ese script y diga en qué orden van las cosas: primero migrar, luego desplegar.

## 3. Avisos en la campana cuando te comentan o te siguen

Hoy la campana (`packages/ui/src/platform/notifications.ts` y `components/NotificationInbox.tsx`) solo deriva avisos de tus partidos y tu bitácora, sin servidor. Agrega avisos sociales reales:

- **Base:** migración `0008`, tabla `notifications`:
  - columnas: `id`, `user_id` (quien recibe), `kind` (`comment`, `follow` o `like`), `actor_user_id`, `post_id` opcional, `created_at` y `read_at`;
  - índice por `user_id` y `created_at`.
  - Funciones en `packages/db/src/social.ts` o en un archivo nuevo:
    - **Al comentar:** avisa al autor de la publicación, y no si te comentas a ti mismo.
    - **Al seguir:** avisa al seguido, y solo la primera vez, no cada vez que alguien sigue y deja de seguir.
    - **Al dar like:** agrupa los likes de una publicación en un solo aviso que se actualiza («A Ana y 3 más les gustó…»), o déjalos fuera y explícalo.
  - Pruebas con PGlite.
- **Rutas:**
  - `GET /api/me/notifications`: los últimos 50, con nombre y @usuario del actor y un extracto de la publicación.
  - `POST /api/me/notifications/read`: marca leídos todos o los ids que reciba.
- **Interfaz:** mezcla los avisos sociales con los actuales en la misma bandeja. Agrega un tipo nuevo (`comunidad`), con sus textos («@ana_mx comentó tu publicación», «@beto_nfl empezó a seguirte»).
  - Al tocar un aviso de comentario, lleva a la publicación. Al tocar uno de seguidor, lleva a su perfil.
  - El contador de no leídos incluye los sociales. Al abrir la bandeja se marcan leídos en el servidor.
  - Sin cuentas, la campana sigue igual que hoy.
  - Pide los avisos al cargar y al volver a la pestaña, sin sondeo constante.
- **Prueba en el 9990 con las dos cuentas:** una comenta y sigue a la otra, y la otra ve el contador y los avisos.

## 4. Reportar publicaciones y panel de moderación

Ya existen `social_posts.is_hidden_by_moderation`, `social_comments.is_hidden_by_moderation` y la tabla `social_moderation_logs`, además de `requireAdmin` (correos en `PITCHLAB_ADMIN_EMAILS`) y la página `/app/admin`.

- **Reportar:**
  - En el menú de cada publicación y comentario ajeno, agrega «Reportar», con motivos cortos: spam o enlaces, ofensivo, apuesta riesgosa o promesa de ganancias, otro.
  - Tabla `social_reports`: quién reporta, qué reporta, motivo, fecha y estado.
  - Un socio no puede reportar dos veces lo mismo, y hay límite de reportes por hora.
  - Con 3 reportes de personas distintas, la publicación se oculta sola mientras se revisa.
- **Panel:** una sección «Moderación» dentro de `/app/admin`.
  - Muestra la cola de reportes pendientes con el texto, el autor y los motivos.
  - Acciones: ocultar, restaurar y descartar el reporte, más «Pausar a este socio en Comunidad» con el campo existente `users.social_pause_enabled`.
  - Las publicaciones de un socio pausado no se muestran a los demás, y él no puede publicar ni comentar mientras dure la pausa.
  - Cada acción queda en `social_moderation_logs`. Todo pasa por `requireAdmin`.
- **Pruebas:** de base (umbral de 3, sin doble reporte, la pausa bloquea publicar) y de rutas (un no-admin recibe `403`).

## 5. «Ver más» contra el servidor

Hoy el feed trae las 50 más recientes, y «Ver más» en `CommunityClubView` solo muestra más de lo que ya está cargado. `listSocialFeed` ya acepta `before`.

- **Proveedor:** agrega `loadOlderSocialPosts()`.
  - Pide `/api/social/posts?before=<createdAtIso de la más vieja del servidor>&limit=30` y mezcla con `mergeSocialPosts(…, "extra")`.
  - Sabe cuándo ya no hay más.
- **Feed:** cuando se acaban las cargadas, «Ver más» pide al servidor.
  - Mientras carga, el botón dice «Cargando…»; cuando ya no hay nada, desaparece.
  - Las publicaciones de ejemplo siguen al final.
- Haz lo mismo en las pestañas «Siguiendo» (`following=1`) y Publicaciones del perfil (`author=`).
- **Prueba:** crea más de 50 publicaciones en la base de prueba con un script en tu scratchpad, no en el repo. Comprueba que no se repiten ni se saltan.

## 6. Foto de perfil

- **Almacenamiento:** Vercel Blob, con el paquete `@vercel/blob` (versión exacta, de hace más de dos semanas).
  - Ruta `POST /api/me/avatar` que recibe la imagen, revisa tipo (`jpeg`, `png`, `webp`) y tamaño (máximo 2 MB), y la reduce a un cuadrado de 256 px antes de subirla con `sharp`, si ya está en el repo, o la opción que menos peso agregue.
  - Guarda la URL en una columna nueva `users.avatar_url`, que va en la migración `0008` u otra.
  - `DELETE` la quita.
- **Sin `BLOB_READ_WRITE_TOKEN`:** el botón se ve como «Pronto», igual que X. Agrega la variable a `.env.example` con su comentario, y en la guía, los pasos para crear el Blob Store en Vercel. Ese paso lo hace el fundador.
- **Interfaz:**
  - En «Editar perfil», un control para elegir, ver la vista previa y quitar la foto.
  - El avatar se muestra en el encabezado, el menú de cuenta, el perfil, las publicaciones y los comentarios.
  - Si no hay foto, siguen las iniciales.
  - `viewerIdentity` y el feed (`ServerSocialPost`) deben traer la URL.
- **Para probar sin la clave:** separa la subida en una función que se pueda sustituir en las pruebas. No subas nada real.

## 7. Al terminar

- **Verificación completa:**
  - `pnpm typecheck`, `node scripts/lint-codebase.mjs` y las pruebas de `db`, `ui`, `contracts` y `web` (con los comandos de arriba).
  - Una compilación como la de Vercel en una carpeta aparte: `PITCHLAB_DIST_DIR=.next-deploycheck pnpm build`. Después borra `apps/web/.next-deploycheck` y revierte `tsconfig.json`.
- **Pruébalo en el 9990 con las dos cuentas**, a 1440 y 390 px y en tema oscuro y claro.
- **Documentación:** entrada **COMUNIDAD-2** en `docs/execution/PROJECT_STATE.md`, con lo hecho, cómo se verificó y lo pendiente. Actualiza la guía de despliegue: migraciones nuevas y la variable de Blob.
- **Commits locales** separados por tema (avisos, moderación, paginación, foto). **Sin push.**
- **Reporte final al fundador**, en español sencillo (es nuevo programando):
  - qué quedó;
  - qué probaste;
  - qué migraciones habrá que correr con `scripts/migrate-prod.ps1` antes del deploy;
  - qué variable nueva debe crear en Vercel y dónde;
  - qué no se pudo terminar.
