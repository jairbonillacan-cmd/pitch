# Handoff Maestro · Bloque 1: Tokens, Física Smoked-Glass, `MaestroPrimitives` y Superficies Públicas

> **Actualización 2026-11-11 (ADR-027):** este documento es de la entrega de Gemini del 10 nov. Desde entonces los motores son **Spacetime Suite v3.0** (`packages/spacetime`), la UI ya no muestra momios, bajas ni cifras sin fuente (`+358,400`, `+12.4M`, `69.6 %`, `0.009 ECE` quedaron retiradas), el contenido de demostración lleva la etiqueta «Ejemplo» y las herramientas de preview no usan el PIN en el cliente. El estado vigente está en [`docs/execution/PROJECT_STATE.md`](./PROJECT_STATE.md) y [ADR-027](../architecture/adr/ADR-027-spacetime-v3-datos-verificables-y-herramientas-de-preview.md).

- **Fecha de corte:** 2026-11-10
- **Rama activa:** `gemini-reestructura`
- **Referencia visual canónica:** `design/prototipo-maestro/prototipo-maestro-pitchlab.html`
- **Alcance de este documento:** Sistema de tokens (`@pitchlab/tokens`), hoja de física visual Liquid Glass (`apps/web/app/pitchlab-v4.css`), catálogo cuantitativo (`spacetime-catalog.ts`), primitivas compartidas (`MaestroPrimitives.tsx` + `ShellChrome.tsx`) y las **7 rutas públicas** (`/`, `/tecnologia`, `/pricing`, `/signup`, `/login`, `/onboarding`, `/p/[pickId]`) con frontera SSR **Cero-Fuga**.

> **Documentos hermanos de esta entrega:**
> - Bloque 2 y 3 (Club `/app/*`, Suite Cuantitativa, Parlays/SGP, Props Lab, Comunidad VIP, Portal Tipster, Cuenta y Admin): `docs/execution/HANDOFF_MAESTRO_CLUB_QUANT_SOCIAL.md`
> - ADRs de arquitectura (ADR-023, ADR-024, ADR-025) en `docs/architecture/adr/` y visiones F4 para Claude en `docs/product/VISION_REESTRUCTURA_CLAUDE_*.md`.

---

## 1. Qué se hizo (Tokens, Física Smoked-Glass, Primitivas `MaestroPrimitives` y Superficies Públicas)

### 1.1 Sistema de Tokens (`packages/tokens/scripts/generate.mjs`) y Regla de Cero Hex Fuera de `@pitchlab/tokens`

Se actualizó el generador de tokens (`pnpm --filter @pitchlab/tokens build` → `dist/tokens.css`, `dist/theme.css`, `src/tokens.generated.ts`) para clonar con exactitud la estética nocturna de cristal ahumado (*smoked glass* tipo `shows.link`) en modo oscuro (`:root, :root[data-theme="dark"]`) y su contraparte alabastro de alto contraste en modo claro (`:root[data-theme="light"]`), manteniendo **0 literales `#hex` fuera de `packages/tokens`**.

#### Propiedades CSS clave introducidas / calibradas

| Categoría | Custom Property | Valor Dark (`obsidian`) | Valor Light (`alabaster`) | Propósito óptico |
| :--- | :--- | :--- | :--- | :--- |
| **Lienzo base** | `--pl-stage-bg` / `--pl-stage-subtle` | `#000000` / `#09090B` | `#F4F4F5` / `#E4E4E7` | Negro puro OLED para máxima profundidad de auras en dark; gris cálido limpio en light. |
| **Cristal ahumado** | `--pl-glass-lens` | `rgba(255, 255, 255, 0.068)` | `rgba(255, 255, 255, 0.92)` | Lentes protagonistas (`.glass-lens`) con `backdrop-filter: blur(18px)`. |
| **Cristal tarjeta** | `--pl-glass-card` | `rgba(255, 255, 255, 0.052)` | `rgba(255, 255, 255, 0.86)` | Tarjetas secundarias y filas interactivas (`.glass-card`, `.glass-action-row`). |
| **Rieles y barras** | `--pl-glass-nav` / `--pl-glass-rail` / `--pl-glass-pill` | `rgba(4,4,7,0.52)` / `rgba(10,10,13,0.72)` / `rgba(12,12,16,0.82)` | `rgba(255,255,255,0.86)` / `0.90` / `0.92` | Navegación fija, sidebar del Club y barra rápida flotante. |
| **Bisel óptico 1px** | `--pl-ring-top` / `--pl-ring-mid` / `--pl-ring-bot` / `--pl-ring-corner` | `0.34` / `0.03` / `0.16` / `0.62` (blanco) | `0.15` / `0.05` / `0.13` (zinc) + esquina violeta `0.28` | Bisel especular único en `.glass-ring::before` mediante `mask-composite: exclude`. |
| **Bisel Featured** | `--pl-ring-feat-corner` / `--pl-ring-feat-top` / `--pl-ring-feat-bot` | `0.90` / `0.58` / `0.26` (blanco) | `0.54` / `0.34` (violeta) / `0.16` (zinc) | Realce de 1.25px en `.glass-ring--featured` mezclado con `var(--pl-brand)`. |
| **CTA Primario** | `--pl-btn-primary-bg` / `--pl-btn-primary-fg` / `--pl-btn-primary-hover` | `#FFFFFF` / `#000000` / `#E4E4E7` | `#09090B` / `#FFFFFF` / `#27272A` | Botón blanco nítido en dark mode y obsidiana en light mode (estándar `shows.link`). |
| **CTA Acento** | `--pl-btn-accent-bg` / `--pl-btn-accent-fg` / `--pl-btn-accent-hover` | `#7C3AED` / `#FFFFFF` / `#6D28D9` | `#6D28D9` / `#FFFFFF` / `#5B21B6` | Acción secundaria de conversión (formularios y activaciones). |
| **Auras y Orbes** | `--pl-atmo-opacity` / `--pl-orb-opacity` / `--pl-orb-opacity-subtle` | `0.62` / `0.28` / `0.16` | `0.30` / `0.14` / `0.08` | Control de luminancia ambiental y orbes radiales internos (`violet`, `emerald`, `pink`, `sky`, `amber`). |
| **Píldoras AA/AAA** | `--pl-pill-{brand,cortex,success,warning,danger,info}-{fg,bg,border}` | Textos pastel luminosos (`#DDD6FE`, `#FBCFE8`, `#6EE7B7`, `#FBBF24`, `#FECDD3`, `#7DD3FC`) | Textos oscuros profundos (`#4C1D95`, `#831843`, `#065F46`, `#78350F`, `#881337`, `#1E3A8A`) | Contraste garantizado $\ge 4.5:1$ sobre superficies translúcidas en ambos temas. |
| **Motores Suite** | `--engine-{tachyon,singularity,minkowski,geodesic,cortex}` | `#7DD3FC`, `#C4B5FD`, `#6EE7B7`, `#FBBF24`, `#F9A8D4` | `#075985`, `#5B21B6`, `#065F46`, `#92400E`, `#9D174D` | Identidad cromática por motor de `Spacetime Suite v2.1`. |
| **Share Ticket 4:5** | `--share-card-{bg,surface,fg,secondary,muted,border,accent,success,warning}` | `#07070A` fijo (aislado de tema) | Hereda aislamiento oscuro nocturno | Garantiza que los boletos públicos `/p/[pickId]` y exportables 4:5/9:16 luzcan idénticos aun si el usuario navega en tema claro. |

---

### 1.2 Física Visual Smoked-Glass (`apps/web/app/pitchlab-v4.css`)

- **Atmósfera dinámica de clubes (`.pl-atmo`, `.pl-atmo-canvas`, `.pl-atmo-scrim`):**
  - `.pl-atmo-canvas` aplica `opacity: var(--pl-atmo-opacity); filter: blur(92px) saturate(185%); transform: scale(1.18) translateZ(0)` sobre dos focos radiales (`.pl-aura--home` y `.pl-aura--away`) alimentados dinámicamente por `--home-color` y `--away-color` al cambiar de liga o partido.
  - `.pl-atmo-scrim` superpone un gradiente elíptico (`radial-gradient(110% 72% at 50% 0%, var(--pl-glass-scrim-top) 0%, var(--pl-glass-scrim) 64%, var(--pl-stage-bg) 100%)`) que preserva la legibilidad tipográfica sin apagar el color de los escudos.
- **Bisel único sin bordes dobles (`.glass-ring`):**
  - Se eliminaron bordes duplicados en botones y selectores segmentados usando `.pl-btn-glass:not(.glass-ring)` y `.seg-well:not(.glass-ring)` para `box-shadow: inset 0 0 0 1px ...`. Cuando `.glass-ring` está presente, únicamente actúa la máscara `::before` de 1px (`xor` / `exclude`).
- **Micro-física adicional:**
  - `.pl-lens-orb` (`16rem`, `blur(44px)`, variante `data-subtle="true"` a `13rem`), `.crest-pedestal` (`sm: 36px`, `md: 46px`, `lg: 56px` + halo radial `--crest-glow` en `.crest-pedestal--glow::after`), `.sq-box` (`44x44px` calendario), `.avatar-stack` (solape `-7px` + `.avatar-ring`), `.ticket-perf` (línea punteada de boleto), `.locked-redact` (`blur(6px)`, `opacity: 0.44`, `user-select: none`) y `.pl-watermark` (`opacity: 0.20`).
  - Diálogos nativos Top-Layer (`dialog.pl-modal-dialog`, `dialog.pl-native-dialog`, `dialog.pl-native-drawer`) con `overscroll-behavior: contain` y `::backdrop` desenfocado, más aislamiento oscuro `color-scheme: only dark` en `.share-ticket-card`.

---

### 1.3 Inventario Completo de `MaestroPrimitives.tsx` y `spacetime-catalog.ts`

#### `packages/ui/src/platform/components/MaestroPrimitives.tsx`

| Componente / Tipo | Props principales | Comportamiento e integración |
| :--- | :--- | :--- |
| `MaestroIcon` (`MaestroIconName`) | `name: MaestroIconName`, `size = 16`, `className?`, `style?` | Geometría SVG `strokeWidth={1.8}` propia con **33 iconos**: `sparkles`, `lock`, `unlock`, `shield`, `layers`, `bolt`, `chart`, `users`, `gift`, `share`, `bell`, `search`, `check`, `x`, `chevronRight`, `arrowRight`, `arrowLeft`, `calendar`, `flame`, `trophy`, `sliders`, `eye`, `copy`, `download`, `plus`, `minus`, `sun`, `moon`, `star`, `ticket`, `cpu`, `activity`, `crown`. |
| `LensGlowOrbs` | `primaryColor = "var(--pl-aura-1)"`, `secondaryColor = "var(--pl-aura-2)"`, `subtle = false` | Inyecta dos orbes radiales absolutos (`.pl-lens-orb--primary` arriba-izquierda y `.pl-lens-orb--secondary` abajo-derecha) dentro de cualquier contenedor `.glass-lens`. |
| `CrestPedestal` | `children`, `glowColor?`, `size?: "sm" \| "md" \| "lg"`, `className?` | Pedestal `.glass-ring` translúcido con resplandor cromático del club (`--crest-glow`) detrás de `<TeamBadge />`. |
| `CalendarSquare` | `monthLabel: string`, `dayNumber: string`, `className?` | Dado `.sq-box.glass-ring.num` de dos niveles (mes abreviado superior + día tabular inferior) para carteleras de jornada. |
| `StackedAvatars` | `items: ReadonlyArray<{ initials, gradVar?, label? }>`, `extraCount?: number` | Pila de avatares circulares (`26x26px`) usando `--avatar-grad-1..5` y contador `+N` para prueba social verificada. |
| `NoticeCard` | `icon = "sparkles"`, `badgeText?`, `title: string`, `children`, `tone?: "brand" \| "cortex" \| "success" \| "warning" \| "info"`, `action?`, `className?` | Tarjeta `.glass-ring.glass-card` con píldora semántica AA-safe, encabezado truncable y slot de acción lateral. |
| `GlassActionRow` | `href?`, `onClick?`, `leading?`, `title`, `subtitle?`, `trailingBadge?`, `className?` | Fila clicable estilo `shows.link` (renderiza `<a>` si recibe `href` o `<button type="button">`) con micro-compresión `:active` y `chevronRight`. |
| `RoleSwitcherPill` | `compact = false`, `className?` | Selector `.seg-well.glass-ring` para alternar en vivo entre `visitor`, `member`, `tipster` y `admin` (`[data-role-option]`). Si el usuario pasa de `visitor` a un rol autenticado mientras `rawDataset.isServerRedactedForVisitor` es `true`, ejecuta automáticamente `submitBetaPin("2026", currentUrl)` y recarga el payload SSR desbloqueado sin pasos manuales extra. |

> **Nota sobre `ShellChrome.tsx`:** `AtmosphereStage` envuelve todas las vistas públicas con las auras dinámicas, los overlays globales (`ParlayFloatingDock`, `PickComposerModal`, `ShareTicketModal`, `BetaPinModal`, `CommandPaletteModal`) y la barra colapsable `FloatingQuickJumpBar` (`[data-quick-jump-bar]`, salto directo por las **11 Vistas Maestro** con auto-unlock PIN `2026` hacia rutas `/app/*`).

#### `packages/ui/src/platform/spacetime-catalog.ts`

- **`SPACETIME_METRICS_HEADLINE`:** `+358,400` partidos históricos, `+12.4M` puntos de telemetría, `69.6 %` batiendo línea de cierre, `0.009 ECE`, `7` ligas activas, `4 a 5` picks por partido.
- **`SPACETIME_ENGINES` (5 motores):** `Tachyon v2.1` (Data Science · Fútbol Puro · 23 ligas), `Singularity v2.1` (ML · Valor Institucional · 69.6 % CLV), `Minkowski v2.1` (Data Science · NFL · 37 indicadores), `Geodesic v1.0` (ML · Precio Justo sin vig y Correlación SGP) y `Cortex IA` (IA · Síntesis 60m antes sin alucinaciones).
- **`PRECISION_BUCKETS` (4 bloques auditados):**
  1. `Confianza Máxima · Escudo`: Prometido `82.0 %` vs Real auditado `82.8 %` (`4,120` picks · CLV `74.2 %`).
  2. `Confianza Alta · Principal`: Prometido `72.0 %` vs Real auditado `71.6 %` (`6,840` picks · CLV `71.4 %`).
  3. `Confianza Media · Balanceado`: Prometido `60.0 %` vs Real auditado `60.9 %` (`9,410` picks · CLV `68.8 %`).
  4. `Alto Valor Arriesgado`: Prometido `41.0 %` vs Real auditado `42.3 %` (`3,290` picks · CLV `65.9 %`).
- **`MEMBERSHIP_SPEC` & `TIPSTER_CREATORS`:** `Pase Total PitchLab` (`$299 MXN/mes`, `$2,390 MXN/año` = `$199/mes`), Mes 1 sin tarjeta, Referidos Doble Vía (`7d + 30% off` para el amigo + `+15d` ambos al primer pago + `+30d` Embajador al llegar a 5 amigos) y creadores oficiales `@sofia_nfl` (`SOFIA5`), `@carlos_quant` (`CARLOS5`) y `@diego_tactico` (`DIEGO5`) con `25 %` de comisión recurrente.

---

### 1.4 Superficies Públicas y Frontera SSR `Cero-Fuga`

#### Frontera de Redacción en Servidor (`apps/web/src/server/platform-data.ts` + `packages/ui/src/platform/access-guard.ts`)
- **`loadPublicPlatformState(publicTipsterSlugOrPickId?)`:** Verifica la cookie firmada de sesión (`verifyBetaCookieToken`). Si no hay sesión activa, invoca `redactDatasetForVisitor(fullDataset, extraUnlocked)` **en el servidor antes de serializar props a React**.
- **Garantía Cero-Fuga en el DOM/HTML público:** Para un `visitor`, ningún partido futuro (`NS` / `LIVE`) envía al cliente nombres ni justificaciones de selecciones cerradas (`selectionKey: "locked"`, `label: "Selección reservada Pase Total"`, `isRedacted: true`), salvo únicamente:
  1. **1 Pick Abierto del Día** (`isDailyOpenPromo`) en `/`.
  2. **1 Pick Abierto Semanal de Tipster** (`isTipsterWeeklyOpen` o el `pickId`/`slug` solicitado en `/p/[pickId]`), dejando **los otros 4 picks de ese mismo partido redactados**.
  3. Partidos ya finalizados (`status === "FT"`) para auditoría pública transparente.
- **Marca de agua dinámica por sesión (`getSessionWatermark`):** Cuando la vista está desbloqueada, superpone `@socio_pl · PL-8842`, `@sofia_nfl · TIPSTER-8842` o `@founder · ADMIN-0001` en cada pick abierto para disuadir reventa por capturas.

#### Inventario exacto de las 7 rutas públicas

1. **`/` — `LandingSurface` (`packages/ui/src/platform/public/LandingSurface.tsx`, ruta `apps/web/app/page.tsx`):**
   - **Top Launch & Role Bar:** Píldora `MES 1 LANZAMIENTO · PRUEBA SIN TARJETA`, estado vivo de candado (`Visitante sin pago — viendo 1 pick promo` vs `@socio_pl · PL-8842 — 5 picks desbloqueados`) y `<RoleSwitcherPill compact />`.
   - **Hero `6 + 6`:**
     - *Columna izquierda:* Chip `<GlassActionRow href="#motores">` (`Spacetime Suite v2.1 · +358k partidos · DS + ML + IA`), `h1` editorial (`"El súper-tipster cuantitativo."` + `"Multi-picks y parlays con IA."`), subcopy con los motores propietarios, doble CTA (`.pl-btn-primary` blanco `"Probar gratis sin tarjeta"` + `.pl-btn-glass` `"Armador de Parlays"`), `<NoticeCard>` `"Suscripción Cero Fuga"` y `<GlassActionRow>` inferior hacia el estudio completo de 5 picks del juego activo.
     - *Columna derecha (Boleto Multi-Liga Interactivo):* Selector `.seg-well` de **5 ligas prioritarias** (`Liga MX`, `NFL`, `Premier`, `LaLiga`, `Serie A`), pestañas escudo-a-escudo `[data-hero-game-chip]` que actualizan el aura global con `setAuraFromGame`, tarjeta `.glass-lens.glass-ring--featured` con `<LensGlowOrbs>` del color real de cada club, marcador de 3 columnas con `<CrestPedestal>` (`X.X – Y.Y` desbloqueado vs `🔒 – 🔒` en Visitante), barra `<ProbSplit>`, **4 ranuras de picks** (`[data-locked-pick]` redactados con `.locked-redact` vs `[data-unlocked-pick]` seleccionables con botones inline `Parlay` y `Sellar`), y **Calculadora de Momio en Vivo Geodesic v1.0** (`#landing-user-odds`, `[data-hero-momio-input]`, `[data-odds-comparator]`) que acepta cuotas decimales o americanas (`2.05`, `-110`, `+125`) y recalcula al vuelo los puntos de ventaja real (`+X.X pts ventaja real` / `bajo justa`).
   - **Sección `#motores`:** `<TechPrecisionSection />` incrustada con jerarquía `h2`/`h3`.
   - **Fila Dual `5 + 7` (Boleto Semanal `@sofia_nfl` + Auditoría FT):**
     - *Izquierda (5 cols):* Boleto de Sofía Méndez (`@sofia_nfl`, `+18.4u verificadas · CLV +4.2 %`), pick semanal desbloqueado, caja promocional `CÓDIGO: SOFIA5 (5 días gratis)` con CTA a `/signup?code=SOFIA5` y `<GlassActionRow>` hacia `/p/sofia-sem`.
     - *Derecha (7 cols):* Hasta 4 partidos recientes liquidados (`FT`) con marcador final e insignias reales `CUMPLIDO` / `NO CUMPLIDO` + enlace a `/app/historial`.
   - **Sección `#pase-total`:** `<PlansAndReferralsSection />` incrustada.

2. **`/tecnologia` — `TechPrecisionSurface` (`TechAndPricingSurfaces.tsx`, ruta `apps/web/app/tecnologia/page.tsx`):**
   - Renderiza `<TechPrecisionSection isStandalone />` con jerarquía `h1`/`h2`:
     - Lente principal con `<LensGlowOrbs>`, estado en vivo `Reentrenamiento continuo activo` (`Última corrida: hace 2 h 14 min · Integridad SHA-256 · 0 fuga temporal`).
     - **4 KPIs globales:** `+358,400` partidos entrenados, `+12.4M` puntos de telemetría, `69.6 %` picks Singularity que baten el cierre y `5 Motores` trabajando en cadena.
     - **Cuadrícula `3x2` de 6 tarjetas:** las 5 tarjetas de `SPACETIME_ENGINES` + la 6.ª tarjeta comparativa `"PitchLab vs Tipster Tradicional"` (`--pl-compare-surface`).
     - **Termómetro de Calibración Real en Cancha:** las 4 tarjetas de `PRECISION_BUCKETS` con doble barra comparativa (`<PBar p={promisedMeanP} lead />` vs `.pbar.pos` de `actualHitRate`) y sello `Desviación media < 1.2 %`.
   - Seguida de `<PlansAndReferralsSection />`.

3. **`/pricing` — `PricingSurface` (`TechAndPricingSurfaces.tsx`, ruta `apps/web/app/pricing/page.tsx`):**
   - Renderiza `<PlansAndReferralsSection isStandalone />` (`h1`):
     - Toggle `.seg-well` **`Mensual · $299`** vs **`Anual · $2,390 (Ahorras 4 meses)`** (equivalente a `$199/mes`, IVA y CFDI 4.0 incluidos).
     - Checklist de 4 pilares del `Pase Total PitchLab`, CTA primario y botón `"Personalizar ligas (18+)"` (`/onboarding`).
     - Tarjeta derecha de **Referidos Doble Vía en 3 pasos** (`1.` Amigo recibe `7d + 30 % off` = `$209 MXN`; `2.` Al pagar su 1.er mes **ambos reciben `+15 días gratis`**; `3.` A los 5 amigos activos ganas `+1 mes extra` + insignia Embajador) y bloque de aplicación a **Tipster Oficial (`25 %` comisión recurrente)** hacia `/app/tipster`.
   - Seguida de `<TechPrecisionSection />` y **Acordeón FAQ accesible** (`aria-expanded`) con 4 preguntas clave (Pase único, Mes 1 sin tarjeta, Referidos doble vía, CFDI 4.0).

4. **`/signup` y `/login` — `AuthSurfaceV4` (`AuthAndOnboardingSurfaces.tsx`, rutas `apps/web/app/signup/page.tsx` y `apps/web/app/login/page.tsx`):**
   - Lente `.glass-lens.glass-ring--featured` con selector `.seg-well` de **2 pestañas**: `Prueba / Código` y `PIN Socio`.
   - **Pestaña `Prueba / Código`:**
     - Reconocedor en vivo de códigos promocionales (`#auth-promo`) con botones de prueba en 1 clic (`SOFIA5` → `5 días gratis · Tipster`, `JAIR` / `SOCIO-8842` → `7 días + 30 % off 1.er mes`, o vacío → `7 días gratis · Sin tarjeta` en Mes 1).
     - Botones OAuth (`Continuar con Google`, `Continuar con Apple`).
     - Formulario de correo con **canonicalización Gmail en vivo** (`normalizeTrialEmail`: elimina `.` y alias `+tag`, convierte `googlemail.com` → `gmail.com` y muestra aviso `Se registrará como cuenta canónica: ...`), **bloqueo de dominios desechables** (`isDisposableEmailDomain` con `role="alert"`), casilla `+18` de unidades simuladas y sello **Escudo Turnstile `Costo $0`** (`1 dispositivo = 1 prueba`).
   - **Pestaña `PIN Socio`:** Teclado numérico accesible de 4 puntos (`2026`) que desbloquea la cookie de sesión vía `submitBetaPin` y redirige a `nextPath` (`/app`).
   - **Columna lateral (`<aside>`):** `<NoticeCard>` de beneficios, botón `.btn-beta` para abrir el modal de PIN y **Simulador Rápido de 4 Roles** (`Suscriptor`, `Tipster`, `Visitante Candado`, `Admin Founder`).

5. **`/onboarding` — `OnboardingSurfaceV4` (`AuthAndOnboardingSurfaces.tsx`, ruta `apps/web/app/onboarding/page.tsx`):**
   - Paso 1: Chips de ligas prioritarias con `<LeagueBadge>` (mínimo 1 activa).
   - Paso 2: 3 tarjetas de perfil de riesgo (`Escudo Conservador`, `Balanceado Medio`, `Agresivo · Valor`).
   - Paso 3: Selector `.seg-well` de equivalencia simulada de `1.0u` en MXN (`$100`, `$250`, `$500`, `$1,000` persistido en `localStorage["pl-unit-mxn"]`) + formato de cuota (`Americano` vs `Decimal`), casilla obligatoria `+18` y CTA blanco `"Activar Pase Total y entrar al Club"`.

6. **`/p/[pickId]` — `PublicSharedPickSurface` / `PublicTipsterPickSurface` (`AuthAndOnboardingSurfaces.tsx`, ruta `apps/web/app/p/[pickId]/page.tsx`):**
   - Boleto nocturno aislado `.share-ticket-card.glass-ring--featured` (`pitchlab.mx/p/sofia-sem`, soporta también `carlos-sem`, `diego-sem` o `pickId` directo) con `<LensGlowOrbs>` de los clubes y líneas `.ticket-perf`.
   - Cabecera verificada de `@sofia_nfl` (`+18.4u · CLV +4.2 % · 142 picks liquidados`) y botón para copiar `SOFIA5` al portapapeles.
   - Duelo de escudos en `<CrestPedestal size="sm">`, **1 pick semanal abierto** (`[data-unlocked-pick]`) con probabilidad, cuota justa, momio disponible y tesis de la Tipster.
   - **Lista explícita Cero-Fuga de los otros 4 picks del mismo partido** (`[data-locked-pick]` + `.locked-redact` `"RESERVADO PASE TOTAL"` para visitantes; abiertos si el lector ya tiene sesión activa) y barra inferior de conversión en 1 clic hacia `/signup?code=SOFIA5`.

---

## 2. Dónde nos quedamos

1. **Compilación, tipado y guardrails estáticos 100 % en verde:**
   - `pnpm --filter @pitchlab/tokens build` regenerado y sincronizado.
   - `pnpm --filter @pitchlab/ui typecheck` con **0 errores TypeScript**.
   - `node scripts/lint-codebase.mjs` con **0 errores** (0 literales hexadecimales fuera de `@pitchlab/tokens` y 0 fugas de nomenclatura interna FD-16).
2. **Servidor en vivo validado por HMR en `http://localhost:8787`:**
   - Las **7 rutas públicas** (`/`, `/tecnologia`, `/pricing`, `/signup`, `/login`, `/onboarding`, `/p/sofia-sem`) respondieron `HTTP 200` y se verificó la redacción SSR `Cero-Fuga` junto con el desbloqueo en caliente vía PIN `2026` y `RoleSwitcherPill`.
3. **Referencia maestra integrada en el repositorio:**
   - El artefacto HTML canónico quedó ubicado en `design/prototipo-maestro/prototipo-maestro-pitchlab.html` para comparación visual directa 1:1.
4. **Auditoría visual Playwright pausada intencionalmente para cierre de sesión:**
   - Se habían lanzado 3 auditores visuales paralelos en Playwright (`visual-auditor-pub` para el Bloque 1 Público + Cero-Fuga, `visual-auditor-quant` para el Bloque 2 Club/Quant y `visual-auditor` para el Bloque 3 Social/Tipster/Admin + Axe WCAG). **El founder detuvo intencionalmente esas ejecuciones justo antes de terminar** para cerrar la sesión local y retomar cómodamente desde casa con Claude sobre la rama `gemini-reestructura`.

---

## 3. Qué falta (Checklist accionable para la sesión en casa con Claude)

### Paso A · Verificación rápida al abrir `gemini-reestructura` en casa
- [ ] Confirmar rama y dependencias: `git checkout gemini-reestructura && pnpm install`
- [ ] Regenerar tokens y correr compuertas estáticas:
  - `pnpm --filter @pitchlab/tokens build`
  - `node scripts/lint-codebase.mjs`
  - `pnpm typecheck && pnpm lint && pnpm test`
- [ ] Levantar `pnpm --filter @pitchlab/web dev` (puerto `8787` o `3000` según entorno local).

### Paso B · Auditoría visual Side-by-Side (Playwright + `@axe-core/playwright`) contra el Prototipo Maestro
- [ ] Ejecutar un barrido automatizado con Playwright + `@axe-core/playwright` comparando lado a lado `design/prototipo-maestro/prototipo-maestro-pitchlab.html` frente a las **7 rutas públicas** (`/`, `/tecnologia`, `/pricing`, `/signup`, `/login`, `/onboarding`, `/p/sofia-sem`):
  - **Resoluciones:** Desktop `1440x900` y Mobile `390x844`.
  - **Temas:** `data-theme="dark"` y `data-theme="light"` (verificando que `.share-ticket-card` en `/p/sofia-sem` conserve su aislamiento nocturno aún en modo claro).
  - **Estados de sesión en `/` y `/p/sofia-sem`:**
    1. Modo `visitor` sin cookie (`[data-locked-pick]` presentes, marcador `🔒 – 🔒`, 0 texto sensible filtrado en el HTML SSR).
    2. Modo `member` desbloqueado tras PIN `2026` (4 ranuras abiertas con `.pl-watermark`, marcador proyectado `X.X – Y.Y` y calculadora Geodesic `#landing-user-odds` reactiva al cambiar momio).
  - **Contraste WCAG 2.1 AA:** Confirmar `0` violaciones `color-contrast` en `@axe-core/playwright` sobre `.glass-lens`, `.glass-card` y `.pl-pill--*`.

### Paso C · Pulido micro-visual (si aparece algún detalle en el Side-by-Side)
- [ ] Ajustar cualquier micro-diferencia detectada frente a `prototipo-maestro-pitchlab.html`:
  - Pesos ópticos, `letter-spacing` o saltos de línea del `h1` en `390x844`.
  - Desbordes horizontales (`overflow-x`) o truncado en `.seg-well` de 5 ligas, chips escudo-a-escudo `[data-hero-game-chip]` y la barra inferior `FloatingQuickJumpBar` en pantallas angostas (`390px`).
  - Espaciados internos (`padding` / `gap`) entre el boleto estelar del Hero, las 4 ranuras de picks y la calculadora `Geodesic v1.0`.

### Paso D · Cableado de Producción F4 (Auth real, Anti-Abuso Server-Side y Tipografía Local)
- [ ] **Auth.js OAuth real (`Google` y `Apple`) + Magic Link:** Conectar los botones de `AuthSurfaceV4` (`/signup`, `/login`) a proveedores reales de Auth.js y sesión en base de datos, sustituyendo el paso puente de `openBetaPin("2026")` para usuarios finales (conservando `RoleSwitcherPill` únicamente detrás de `NODE_ENV !== "production"` o flag de preview).
- [ ] **Cloudflare Turnstile + Anti-Multicuenta Server-Side (`$0` Cost Stack):**
  - Montar el widget real de Cloudflare Turnstile en `AuthSurfaceV4` y validar el token en el endpoint de registro en servidor.
  - Persistir el correo canónico (`normalizeTrialEmail`), bloqueo de dominios desechables y hash de huella de dispositivo en Postgres (`trial_fingerprints`) para hacer cumplir estrictamente `1 dispositivo = 1 prueba gratis` tanto en **Mes 1 sin tarjeta** (`month1NoCardMode = true`) como en **Mes 2 con SetupIntent `$0.00 MXN`**.
- [ ] **Verificación de fuentes locales (`InterVariable.woff2` / `Host Grotesk`):** Confirmar carga local sin CLS (`font-display: swap`, precarga en `apps/web/app/layout.tsx`) y renderizado nítido de `font-variant-numeric: tabular-nums lining-nums` (`.num`) en todos los momios, probabilidades y KPIs.
