# Prompt · Landing nueva de PitchLab (para Opus en Antigravity)

Copia todo lo que está debajo de la línea.

---

Vas a implementar la landing nueva de PitchLab tal como está en el lienzo de diseño. El resultado debe verse y comportarse igual que el lienzo en escritorio y en móvil, en tema oscuro y claro, usando los tokens y componentes que ya existen en el repo. No inventes datos ni secciones.

## 0. Lee esto antes de escribir código, en este orden

1. `AGENTS.md`: reglas de diseño del repo.
2. `apps/web/PRODUCT.md`: audiencia y lo que no se puede inventar.
3. `docs/design/DESIGN_SYSTEM.md` y `docs/design/UI_LIBRARIES.md`.
4. **El diseño:** `design/canvas/landing/README.md`, luego `design/canvas/landing/Main.dc.html` (escritorio), `Mobile.dc.html` (móvil) y las `notes` de `canvas.json` («Qué cambia y por qué», brief y mapa del sitio). El README trae la tabla de imágenes y la de colores → tokens.
5. El código actual: `packages/ui/src/platform/public/LandingSurface.tsx`, `apps/web/app/page.tsx`, `apps/web/app/pitchlab-v4.css` (vidrio en `.glass-*`, barra 1X2 en `.pl-stage .psplit`), `packages/ui/src/platform/spacetime-catalog.ts` (`SPACETIME_ENGINES`, `SPACETIME_METRICS_HEADLINE`, `PRECISION_BUCKETS`, `MEMBERSHIP_SPEC`), `packages/ui/src/sports.tsx` (`ProbSplit`) y `apps/web/src/server/platform-data.ts` (`loadPublicPlatformState`, `loadFinishedGames`).
6. Las pruebas que tocan la landing: `apps/web/e2e/pre-mvp.spec.ts` (pruebas 1, 2 y 4).

Antes de editar, escribe un plan corto: qué archivos cambias, qué componentes reutilizas y qué rutas creas.

## 1. Decisiones del fundador (ya tomadas, no las discutas)

- **Los motores se nombran.** Tachyon, Singularity, Minkowski, Geodesic y Cortex IA son el argumento para que nos prefieran. Esto reemplaza la parte de FD-16 que prohibía nombrar algoritmos: actualiza `DESIGN_SYSTEM.md` §7, `PRODUCT.md` y `docs/design/GUIA_RECREACION_GPT.md` §2. Los **proveedores de datos** siguen sin nombrarse nunca.
- **Sin promesas de rendimiento:** fuera «ROI +1.35 %», Kelly, «Por qué ganamos», «más seguro», «gana», «cobra» y «Sellar».
- **Una sola oferta:** «7 días gratis, sin tarjeta». Desaparece «Primer mes gratis».
- **Un solo plan:** Pase PitchLab Ultra. El precio sale de `MEMBERSHIP_SPEC` ($299 al mes, $2,390 al año); no lo escribas a mano.
- **Cada entrada del menú es su propia página.** La landing resume cada sección y enlaza a su página.
- **El vidrio es el falso del club:** `.glass-lens`, `.glass-card`, `.glass-ring`, `.glass-ring--featured` y `.glass-pill-bar`. Prohibido `backdrop-filter`.

## 2. Qué construir

### 2.1 Landing (`/`), en este orden (ver `Main.dc.html`)

1. **Barra:** `.glass-pill-bar` + `.glass-ring`, con logo, Cómo funciona · Motores · Resultados · Parlays · Comunidad · Precio, botón de tema, «Entrar» y un CTA primario «Probar 7 días». **Quita** de la vista pública el simulador de rol (Visitante/Suscriptor/Tipster/Admin) y el selector Momio/Decimal. El simulador puede seguir existiendo para preview, pero nunca visible en `/`.
2. **Hero:**
   - **Izquierda:** eyebrow de ligas; h1 «Lo más probable de cada partido, con su momio justo.»; lede; CTA primario «Probar 7 días gratis» y secundario «Ver partidos de hoy»; la línea «Sin tarjeta · cancela cuando quieras · solo mayores de 18».
   - **Derecha, tarjeta del partido** (`.glass-lens` + `.glass-ring--featured`):
     - selector de liga: botones con `aria-pressed` o el SegmentedControl de Astryx;
     - partido con emblemas y fecha;
     - bloque «Lo más probable» con la cifra grande en `--pl-success`;
     - barra 1X2 con corte a 45° y el favorito en verde (reutiliza `ProbSplit`/`.psplit`);
     - «Otros mercados» con tres filas;
     - campo **«Tu momio»**. Acepta americano (−200, +150) o decimal (1.50) y muestra la probabilidad implícita y la diferencia en puntos («Tu momio paga más / menos que el justo: ±X.X pts»), con `aria-live="polite"`. No guarda nada.
   - **Fondo:** orbes de atmósfera estáticos (`--pl-orb-*`) y la retícula `.fieldgrid` enmascarada.
   - **Datos:** los partidos salen del dataset. «Lo más probable» es el resultado con mayor `p` del grupo h2h y el momio justo es `1/p`, en americano y decimal. En el lienzo solo Liga MX y NFL son reales; Premier y LaLiga eran ilustrativos.
3. **Cómo se lee:** tres columnas numeradas 01 · 02 · 03 (probabilidad, momio justo, tu momio contra el justo) y el enlace «Ver cómo funciona, paso a paso →» a `/como-funciona`.
4. **Motores:**
   - h2 «Cinco motores. Cada uno probado con partidos que no vio.» y tres cifras de cabecera.
   - Una fila por motor: inicial en una píldora de vidrio, nombre y versión, rol, qué lee y su prueba (cifra grande + contexto).
   - Debajo, la tabla «PitchLab contra un tipster típico» (`<table>` real con `<caption>` y `scope`) y el recuadro de Cortex IA con un resumen de ejemplo y «Conoce los motores →» a `/motores`.
   - **Todas las cifras salen de `SPACETIME_ENGINES` y `SPACETIME_METRICS_HEADLINE`:** no las dupliques. Si falta un campo para mostrarlas así, agrégalo al catálogo. Pie con «El acierto pasado no garantiza resultados.»
5. **Historial íntegro:**
   - h2 «Lo que falló también se queda.»
   - Los últimos 4 resultados reales de `loadFinishedGames()`, con «Se cumplió» o «No se cumplió». Cada estado lleva texto e ícono, nunca solo color.
   - Una tarjeta de calibración desde `PRECISION_BUCKETS`: barra «anunciado» y hueco punteado «Real: se publica con los primeros picks auditados». No inventes el real.
   - Enlace a `/resultados`.
6. **Parlays y comunidad:** dos paneles. Al de comunidad dale `id="comunidad"` para el ancla del menú.
   - **Parlay:** dos selecciones, una tercera bloqueada «Choca con …» y la probabilidad combinada con su momio justo. Si el motor de parlays del club ya calcula la correlación, úsalo; si no, rotula el panel «Ejemplo».
   - **Comunidad:** un post de tipster de `TIPSTER_CREATORS` / `INITIAL_SOCIAL_POSTS`, marcado «Ejemplo».
   - Enlaces a `/parlays` y `/comunidad`.
7. **Precio:**
   - Texto a la izquierda y una tarjeta `.glass-lens` + `.glass-ring--featured` a la derecha.
   - Conmutador Mensual / Anual con `aria-pressed`. El signo «$» va más chico y fuera del centrado.
   - Cuatro funciones y el CTA «Empezar 7 días gratis».
   - Los referidos en una sola línea; el resto del programa va en `/precio`.
   - Enlace «Ver todo lo que incluye →».
8. **Preguntas frecuentes:** cuatro, con `<details>`/`<summary>` o HeroUI Accordion; textos exactos del lienzo.
9. **Cierre:** «Lee el juego con datos.», CTA y Radar edición `soccer` decorativa (`alt=""`), con halo y flotación solo si no hay movimiento reducido.
10. **Pie legal:** «Información para decidir, no una garantía. PitchLab no acepta apuestas. Solo mayores de 18.» y enlaces legales.

**Un solo CTA primario (blanco) por región.** El resto, botón secundario o enlace con flecha.

### 2.2 Páginas del menú

Convierte cada sección en un componente con dos variantes: `"teaser"` (la de la landing) y `"page"` (completa). Cada página usa la misma barra (enlace activo con `aria-current="page"`), el mismo pie y el mismo vidrio. Están dibujadas solo como teasers; la versión de página amplía con datos que **ya existen**, sin inventar:

| Ruta | Contenido |
|---|---|
| `/como-funciona` | Los 3 números, «Tu momio» y un ejemplo por cada liga con datos |
| `/motores` | Los 5 motores completos desde `SPACETIME_ENGINES`, las cifras de cabecera, la comparativa y la calibración. Reemplaza lo que hoy muestra `/tecnologia` |
| `/resultados` | Todos los terminados de `loadFinishedGames()`, filtrables por liga |
| `/parlays` | Cómo funciona el armador y los choques lógicos, con CTA a `/app/parlays` |
| `/comunidad` | Feed de muestra marcado «Ejemplo», tipsters verificados y cómo aplicar como tipster |
| `/precio` | El pase completo, mensual/anual, referidos (`MEMBERSHIP_SPEC`), CFDI y preguntas |

- **Redirecciones permanentes:** `/metodologia` y `/tecnologia` → `/motores`; `/pricing` → `/precio`. Actualiza los enlaces internos que apunten a ellas.
- **Rutas que se quedan:** si una ruta del menú ya existe con otro nombre y su contenido sirve, reutilízalo en lugar de duplicarlo.

## 3. Reglas de implementación

- **Colores:** solo tokens `--pl-*`. Cero hex fuera de `packages/tokens`; el linter lo bloquea. Usa la tabla de `design/canvas/landing/README.md`. El tema claro sale de los mismos tokens con `data-theme="light"`.
- **Componentes:** primero `@pitchlab/ui` (`BrandLogo`, `TeamBadge`, `LeagueBadge`, `Mascot`, `ProbSplit`, `ThemeToggle`); HeroUI para controles y Astryx para el selector segmentado. Nada de rutas de emblemas a mano.
- **Números:** cifras con `tabular-nums` (clase `.num`) y formato es-MX: «72.3 %», horas en 24 h y el signo menos tipográfico «−261».
- **Rendimiento:**
  - Nada de `backdrop-filter` y orbes estáticos.
  - En móvil, sin animaciones decorativas.
  - Las secciones bajo el pliegue con `content-visibility: auto`.
  - Cada página carga solo los datos que muestra.
  - No subas el JS de la landing: lo interactivo («Tu momio», liga y periodo) son islas cliente pequeñas; el resto, Server Components.
- **Accesibilidad (WCAG 2.2 AA):**
  - Objetivos táctiles de 44 px y foco visible con `--pl-brand`.
  - `aria-pressed` en los conmutadores y `aria-label` en la barra 1X2 con los tres valores.
  - Contraste verificado en los dos temas.
  - Movimiento reducido respetado.
- **Responsive:** a 375 px todo apila en una columna sin scroll horizontal. Sigue `Mobile.dc.html`: el menú se vuelve un botón y la tabla comparativa hace scroll dentro de su caja.

## 4. Cómo verificar (todo debe pasar antes de terminar)

1. `pnpm typecheck`, `pnpm lint` y `pnpm test`.
2. Actualiza las E2E de `apps/web/e2e/pre-mvp.spec.ts` a los textos y rutas nuevos (prueba 1 landing, 2 rutas públicas y redirecciones, 4 sin scroll horizontal) y córrelas contra un build de producción.
3. Levanta la app y compara con el lienzo a 1440 y 375 px, en oscuro y en claro. Toma capturas de cada sección y revisa sección por sección contra `Main.dc.html` y `Mobile.dc.html`: orden, textos, jerarquía, espaciado, vidrio y estados.
4. Prueba a mano:
   - **«Tu momio»:** −200, +150, 1.50, vacío y «abc» (debe pedir un momio válido).
   - **Cambio de liga y conmutador Mensual / Anual.**
   - **Navegación por teclado** de toda la página.
   - **Enlaces:** cada uno del menú abre su página y `/tecnologia` redirige a `/motores`.
5. Busca en el código que no quede en la vista pública: «Primer mes gratis», «ROI», «Kelly», «Por qué ganamos», «más seguro», «Sellar» ni el simulador de rol.
6. Agrega a `docs/execution/PROJECT_STATE.md` una entrada «LANDING-2» con lo hecho, lo pendiente y las capturas.

## 5. Terminado significa

- La landing coincide con el lienzo en los dos temas y los dos anchos.
- Las 6 páginas existen y enlazan bien.
- Todas las cifras salen del catálogo o del dataset.
- Las pruebas pasan y la documentación de FD-16 quedó actualizada.

No hagas commit ni push. Al final entrega un resumen con:
- los archivos cambiados;
- las capturas;
- cualquier decisión que tomaste por tu cuenta;
- lo que no pudiste verificar.

**Pendientes para el fundador (no los resuelvas tú, déjalos señalados):**
- `PRODUCT.md` aún menciona Pro $199 / Elite $399.
- Hay que confirmar que la cifra de 16,126 partidos de prueba es publicable.
