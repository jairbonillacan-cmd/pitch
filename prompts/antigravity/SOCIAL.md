# Prompt · Comunidad nueva de PitchLab (para Opus en Antigravity)

Copia todo lo que está debajo de la línea.

---

Vas a rehacer el **contenido** de Comunidad (`/app/social`) tal como está en el lienzo de diseño. Tiene que verse y comportarse igual que el lienzo en escritorio y en móvil, en tema oscuro y claro. **La barra superior y el sidebar del club no se tocan.** Sin cifras inventadas y sin backend nuevo.

Si ya implementaste el perfil con `prompts/antigravity/PROFILE.md`, reutiliza `profile-stats.ts` (`rankAnalysts`, `profileRecord`), `VerifiedSeal` y el estilo de pestañas subrayadas. Si no existe todavía, créalos aquí con la misma forma que pide ese prompt.

## 0. Lee esto antes de escribir código, en este orden

1. `AGENTS.md`, `apps/web/PRODUCT.md`, `docs/design/DESIGN_SYSTEM.md`, `docs/design/UI_LIBRARIES.md`, `docs/design/RESPONSIVE_RULES.md` y `docs/design/INTERACTION_PATTERNS.md`. Carga el skill `dataviz` antes de tocar las barras de consenso.
2. **El diseño:** `design/canvas/social/README.md`, luego `Main.dc.html` y `Mobile.dc.html` (Para ti) y una mesa de trabajo por pestaña: `Siguiendo.dc.html`, `Consenso.dc.html` y `Ranking.dc.html`, cada una con su versión `…Mobile.dc.html`. Lee también las notas `decisiones`, `brief`, `nSiguiendo`, `nConsenso` y `nRanking` de `canvas.json`. **Las mesas de cada pestaña mandan sobre la versión simple de esa pestaña que hay en `Main.dc.html`.** Si una nota del lienzo choca con este prompt, manda este prompt.
3. El código actual:
   - `packages/ui/src/platform/club/SocialAndTipstarViews.tsx`, `SocialVipClubView`:
     - pestañas Feed, Consenso y Ranking, más un filtro aparte Todos/Siguiendo;
     - `copiedCounts` con números inventados;
     - `handleCopyPostToJournal`, que arma un pick sintético con el primer pick del partido;
     - `rankedAnalysts`, con factores multiplicados a mano;
     - una tabla con ROI e «IC 95 %».
   - `packages/ui/src/platform/platform-provider.tsx`: `publishSocialPost`, `addSocialComment`, `toggleSocialLike`, `sealPickToJournal` y `blockedSpamAttempts` (el filtro de spam y enlaces).
   - `packages/ui/src/platform/types.ts`: `SocialPost`, `SocialComment`, `JournalEntry` y `MatchPick`.
   - `apps/web/app/app/social/page.tsx`: la ruta (no cambia su forma).
   - `packages/ui/src/platform/components/MaestroPrimitives.tsx`: `ExampleNotice`, `UserBadges` y los íconos.

Antes de editar, escribe un plan corto: qué archivos cambias, qué compartes con el perfil y cómo quitas cada número inventado.

## 1. Decisiones ya tomadas (no las discutas)

- **Sin texto de relleno.** El encabezado es solo «Comunidad», sin subtítulo. Nada de frases de ánimo, moralejas ni explicaciones obvias; los estados vacíos dicen qué pasa y qué hacer, en una línea. Los textos de ejemplo hablan con datos: momio, momio justo y probabilidad.
- **Copy prohibido:** «Socios VIP», «Radar Contrarian», «sobrepaga», «ROI», «IC 95 %», «Kelly», «sellar/sellado», «gana/ganó». El saldo es «Saldo», en unidades, y es público (decisión del fundador del 11 nov).
- **Cuatro pestañas subrayadas:** Para ti · Siguiendo · Consenso · Ranking. El filtro Todos/Siguiendo desaparece: ahora es pestaña.
- **Sello de verificado** junto al nombre de los tipstars verificados, igual que en el perfil.
- **Vidrio falso refinado** y prohibidos `backdrop-filter` y `filter: blur`.
- **Perfiles de ejemplo marcados «Ejemplo»** hasta que existan cuentas.

## 2. Qué construir

### 2.1 Pick adjunto de verdad

- Agrega a `SocialPost` un campo opcional `pick` con `pickId`, `gameId`, `label`, `units`, `userDecimal`, `fairDecimal`, `modelProbability` y `status` (`"open" | "won" | "lost"`).
- `publishSocialPost` lo llena con el pick elegido en «Adjuntar pick», y lo registra en el journal con `sealPickToJournal`. En la UI ese verbo se llama «registrar».
- `handleCopyPostToJournal` copia **ese** pick. Si la publicación no trae `pick`, el botón «Copiar a mi bitácora» no aparece. Borra el pick sintético.
- Borra `copiedCounts`. No se muestra cuántos copiaron hasta tener el dato real.
- Las publicaciones de ejemplo de `INITIAL_SOCIAL_POSTS` reciben su `pick` coherente con el dataset, y su texto se reescribe con datos como en el lienzo.

### 2.2 Para ti y Siguiendo (escritorio: 2 columnas, contenido + 320 px)

- **Publicar** (`.glass-lens .glass-ring`):
  - avatar y `textarea` con `<label>` oculta y placeholder «¿Qué pick tienes y por qué?»;
  - debajo, el pick adjunto en una ficha (logo de liga, mercado, partido y unidades) con un botón para quitarlo;
  - fila inferior: «Adjuntar pick», el segmento «Del modelo / Propio» y «Publicar».
  - «Adjuntar pick» abre un selector de partidos próximos y sus picks: HeroUI Popover o Drawer en móvil, con búsqueda.
  - Los errores (vacío, enlaces, spam) van debajo, con `aria-live`.
- **Publicación:**
  - Encabezado: avatar, nombre + sello, «@handle · saldo · hace N min» y «Seguir/Siguiendo» con `aria-pressed`. El nombre y el avatar llevan a `/app/u/{handle}`.
  - Texto.
  - Ficha del pick, si hay: emblemas, «mercado · unidades», «liga · hora · momio · justo · modelo %» y el estado (círculo vacío «Abierto», punto verde «Cumplido · +Nu», punto rojo «No se cumplió · −Nu»). Momios en el formato elegido (`formatOddsValue`).
  - Acciones: Me gusta (`toggleSocialLike`, corazón SVG que se rellena, `aria-pressed`), Comentarios (abre el hilo), Copiar a mi bitácora (solo con `pick`) y Compartir.
  - Debajo, el primer comentario y «Ver los N comentarios». El hilo completo y el campo para responder se abren en su lugar.
- **Siguiendo** (mesa `Siguiendo.dc.html`):
  - arriba, una tira con los avatares de quienes sigues, «Sigues a N · X tipstars, Y socios» y «Administrar»;
  - filtros Todos · Tipstars · Socios · Con pick abierto;
  - el feed solo con publicaciones de quienes sigues;
  - en la columna derecha, «Picks abiertos · próximos» (picks abiertos de quienes sigues, ordenados por la hora del partido y agrupados por pick, con los nombres de quién lo tiene) y «Para seguir» (3 del ranking a quienes no sigues, con Seguir).
  - En móvil, los avatares van en una fila, los filtros en chips con scroll y los picks abiertos en una tira horizontal antes del feed.
  - Vacío: «Aún no sigues a nadie.» con las sugerencias.
- **Columna derecha** (desaparece a 980 px o menos):
  - **Tu {mes}:** puesto, saldo, picks y la distancia al top 10 en unidades (de `rankAnalysts`), con «Ver mi perfil». Si no apareces: «Registra 20 picks para entrar al ranking».
  - **Top de {mes}:** los primeros 5 con avatar, nombre y saldo, y «Ver ranking» que cambia de pestaña.
  - **Más comentado hoy:** el partido con más publicaciones hoy, con las barras Socios y Modelo del resultado más elegido, y «Ver consenso».
  - **Invita a un amigo:** «7 días para él, +15 días para ti», enlace a `/app/account`.

### 2.3 Consenso

- Por partido próximo con **al menos 10 picks de socios**:
  - % de socios = picks publicados de ese resultado entre los picks del partido;
  - % del modelo = la `p` del dataset para el mismo resultado.
- Tarjeta: partido con emblemas y «liga · hora · N picks de socios»; dos barras alineadas, Socios en `--pl-brand` y Modelo en `--pl-text-secondary`, con su % a la derecha; y una línea con la diferencia: «Los socios ven a {equipo} {N} pts más probable que el modelo» (o «menos probable»). Si la diferencia es menor a 3 pts: «Socios y modelo coinciden en {equipo}».
- Ordena por diferencia absoluta, de mayor a menor.
- **Como en la mesa `Consenso.dc.html`:**
  - filtros por liga y un selector de orden (Mayor diferencia · Más picks · Próximos);
  - el partido con mayor diferencia va destacado arriba, con sus resultados (local, empate y visita; en NFL, los dos) en tarjetas con barras Socios vs Modelo;
  - el resto va en una lista con columnas Partido · Más elegido por socios · Socios · Modelo · Diferencia · Picks;
  - la diferencia va en una ficha con signo: contorno `--pl-brand` si es de 10 pts o más, texto atenuado si es menor a 3;
  - nota al pie: «Socios: % de picks publicados por resultado. Modelo: probabilidad del partido. Solo partidos con 10 picks o más.»
- Sin partidos que lleguen al mínimo: «Todavía no hay partidos con 10 picks de socios.»

### 2.4 Ranking

- Segmentos «Últimos 30 días / Temporada» y «Por saldo / Por ventaja contra el cierre».
- Tabla real (`<table>`, `<caption>` oculta y `scope="col"`) con #, Analista (avatar, nombre + sello, «rol · especialidad»), Saldo, Cumplidos %, Contra el cierre y Picks. Dentro de un contenedor con `overflow-x: auto`.
- **Tu fila** se resalta con `--pl-brand` al 8 % y aparece al final con tu puesto real si quedas fuera de los visibles.
- Nota única debajo: «Mínimo 20 picks cerrados.»
- Usa `rankAnalysts()` con ventanas reales: filtra por fecha, sin `windowFactor` ni `clvBoost`. Si los perfiles de ejemplo no tienen picks con fecha, deja sus cifras de temporada y en 30 días muéstralos solo si tienen datos.
- **Como en la mesa `Ranking.dc.html`:**
  - orden por Saldo, Contra el cierre o Cumplidos;
  - **podio** de los 3 primeros en tarjetas de vidrio (el 1.º al centro, más alto y con borde destacado): puesto, avatar, nombre + sello (solo si es tipstar), saldo grande, cumplidos, contra el cierre, picks y Seguir;
  - tabla del 4.º en adelante;
  - tu fila al final con «Te faltan N u para el top 10».
- **Móvil:** el podio en fila de 3, la lista del 4.º en adelante (puesto, avatar, nombre, «N % cumplidos · N picks» y saldo) y tu fila fija abajo, sobre la lista.

### 2.5 Móvil (por debajo de 640 px)

- Una columna.
- «Comparte un pick…» es una fila de vidrio con avatar y «Publicar»; al tocarla abre el editor en un Drawer de HeroUI.
- Debajo, «Top de {mes}» como carrusel horizontal de tarjetas de 112 px (avatar, nombre corto y saldo) que llevan al perfil.
- Publicaciones sin tarjeta alrededor, separadas por líneas, con acciones de 44 px.
- Sin columna derecha. Sin scroll horizontal de la página: solo se desplaza el carrusel.

### 2.6 Visitante

Un solo aviso de vidrio: «La comunidad es para socios.» con «Probar 7 días gratis» a `/signup`. El feed no se muestra.

## 3. Reglas de implementación

- **Solo tokens `--pl-*`.** Cero hex fuera de `packages/tokens`.
- **Componentes existentes primero:** `LeagueBadge`, `TeamBadge`, `ExampleNotice`, `MaestroIcon`, HeroUI (Popover, Drawer, TextArea) y `ClubWorkspaceShell` sin cambios.
- **Accesibilidad WCAG 2.2 AA:**
  - pestañas WAI-ARIA con flechas, Inicio y Fin, y la activa en `?tab=`;
  - `<label>` en el editor;
  - objetivos de 44 px en móvil;
  - contraste 4.5:1 en metadatos de 12 px;
  - los estados del pick siempre con texto.
- **Rendimiento:** el feed se pagina de 20 en 20 con «Ver más» (sin scroll infinito); los cálculos de consenso y ranking van en `useMemo` sobre funciones puras y probadas.
- **Movimiento:** solo la entrada del panel al cambiar de pestaña; nada con `prefers-reduced-motion`.
- No toques header, sidebar, perfil, landing, login ni registro, salvo para compartir helpers sin cambiar cómo se ven.

## 4. Verificación (obligatoria antes de decir que terminaste)

1. `pnpm typecheck`, `pnpm lint` y `pnpm test`, en verde. Agrega pruebas de:
   - el cálculo de consenso (mínimo de 10 picks, signo y redondeo de la diferencia, orden);
   - `rankAnalysts` con ventanas reales;
   - que «Copiar a mi bitácora» copie el pick exacto de la publicación.
2. `pnpm --filter @pitchlab/web build` y `pnpm e2e`, todo en verde. Agrega a la prueba 3, después de entrar con el PIN:
   - visitar `/app/social`;
   - publicar con un pick adjunto y ver la publicación arriba;
   - dar Me gusta;
   - cambiar a Ranking con el teclado;
   - pasar axe (WCAG 2 A y AA) sin violaciones.
3. **Capturas** de las 4 pestañas comparadas con el lienzo: 1440×900 y 1280×720 en escritorio, 375×667 y 390×844 en móvil, en tema oscuro y claro, más el estado de visitante.
4. A mano:
   - publicar vacío, con enlace y con spam (errores);
   - quitar el pick adjunto;
   - copiar a bitácora;
   - comentar;
   - Seguir y ver el efecto en Siguiendo;
   - `?tab=consenso` en la URL;
   - consenso sin partidos que lleguen al mínimo.
5. `grep` en lo que tocaste: «VIP», «Contrarian», «sobrepaga», «ROI», «IC 95», «Kelly», «sellad», «ganó», `copiedCounts`, `windowFactor`, `backdrop-filter`, `filter: blur`.
6. Agrega la entrada **SOCIAL-2** a `docs/execution/PROJECT_STATE.md` con qué cambió y qué quedó pendiente.

## 5. Terminado significa

- `/app/social` igual al lienzo en los cuatro tamaños y los dos temas, sin números inventados, con el ranking y el consenso calculados.
- Pruebas y E2E en verde.
- **No hagas commit ni push.** Entrega un resumen con capturas y archivos tocados, y deja señalados estos pendientes para el fundador:
  - Guardar en el servidor publicaciones, me gusta, comentarios y seguidos (hoy viven en el navegador).
  - Moderación: reportar publicaciones y bloquear usuarios.
  - Si «Siguiendo» debe incluir también a los tipstars que el usuario no sigue pero que publican picks gratis.
