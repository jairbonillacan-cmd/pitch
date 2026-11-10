# PitchLab · Visión de Producto, Arquitectura y Handoff (`gemini-reestructura`)

> **Documento maestro para el Fundador y Claude (sesión de continuación en casa)**
> - **Rama activa:** `gemini-reestructura`
> - **Versión visual y funcional:** `v4.1` — Paridad 1:1 con `Prototipo Maestro PitchLab` ([`design/prototipo-maestro/prototipo-maestro-pitchlab.html`](../../design/prototipo-maestro/prototipo-maestro-pitchlab.html))
> - **Decisiones arquitectónicas asociadas:** `ADR-020` (Liquid Glass v4, tokens duales y `<dialog>` Top Layer), `ADR-021` (Cero-Fuga SSR, Pase Total único, Tipstars y Referidos), `ADR-022` (`Spacetime Suite v2.1`, multi-picks y parlays SGP) y `ADR-023` (Paridad 1:1 cristal ahumado `shows.link` y primitivas `MaestroPrimitives`).
> - **Estado operativo previo:** consultar también [`docs/execution/PROJECT_STATE.md`](../execution/PROJECT_STATE.md) y [`GLOSSARY.md`](../../GLOSSARY.md).

---

## §1. Visión Ejecutiva de la Re-Versión (`gemini-reestructura`)

En la re-versión `gemini-reestructura`, **PitchLab** deja atrás el enfoque de «tablero estadístico pasivo de 1X2» para consolidarse comercial y técnicamente como **«El Súper-Tipster Cuantitativo»**: un club privado de inteligencia deportiva por suscripción para México y Latinoamérica donde una cadena propietaria de **Data Science, Machine Learning e Inteligencia Artificial** hace el trabajo pesado que ningún tipster humano ni grupo de Telegram puede sostener con rigor auditable.

### Los 6 pilares del producto en `gemini-reestructura`

1. **Radiografía Pre-Partido Completa (`Match Studio` + `Vigilancia 60m`):** cada encuentro de las **7 ligas activas** (`Liga MX`, `Premier League`, `LaLiga`, `Bundesliga`, `Serie A`, `Ligue 1` y `NFL`) integra marcador proyectado, distribución de probabilidad, síntesis táctica ejecutiva de `PitchLab Cortex IA`, monitoreo de alineaciones y bajas **60 minutos antes del silbatazo** y lectura de flujo de liquidez (*¿Dónde está el dinero?*).
2. **4 a 5 Picks Estructurados por Encuentro (`Multi-Picks`):** en vez de forzar una sola selección por juego, el motor deriva hasta **5 ángulos tipados** según el perfil de riesgo del socio (*Pick Principal PitchLab*, *Escudo Conservador*, *Línea de Totales*, *Lectura Táctica* y *Cuota Alta · Valor*), todos con probabilidad real, cuota justa sin comisión y ventaja porcentual (`+Edge`).
3. **Armador Inteligente de Parlays & SGP (`2 a 6 selecciones`):** motor interactivo y automático que construye boletos combinados filtrando por ligas, aversión al riesgo (*Conservador*, *Medio*, *Arriesgado*) y número de patas, bloqueando contradicciones matemáticas y ajustando la probabilidad conjunta cuando se activa el modo **Mismo Partido (`SGP`)**.
4. **Comunidad VIP Auditada y Libre de Spam:** foro exclusivo para suscriptores activos y Tipstars Oficiales donde cada opinión exhibe el récord verificado en **unidades simuladas (`0.25u–5.0u`)** y **CLV** (*Closing Line Value*) del autor, bloqueando enlaces externos (`Telegram`, `WhatsApp`, `Discord`, URLs) y permitiendo modo de pausa social en 1 clic.
5. **Portal de Tipstars Oficiales (`/app/tipstar` + `/p/[pickId]`):** canal nativo de adquisición con creadores deportivos verificados que liberan exactamente **1 Pick Abierto a la semana** con boleto nocturno brandeado `4:5` / `9:16`, código promocional de **5 días gratis** y **25 % de comisión mensual recurrente**, manteniendo blindados los otros 4 picks del mismo partido.
6. **Referidos de Doble Vía Socio ↔ Socio (`/app/account`):** motor viral donde el amigo invitado recibe **7 días gratis + 30 % de descuento en su primer mes (`$209 MXN`)** y, al liquidarse su primer pago real, **ambos reciben `+15 días gratis` automáticos** (más bono e insignia **Embajador `+30 días extra`** al llegar a 5 amigos activos).

---

## §2. Identidad Tecnológica: `PitchLab Spacetime Suite v2.1` y Regla `FD-16`

Toda la comunicación pública y privada del producto presenta la tubería cuantitativa bajo el paraguas propietario **`PitchLab Spacetime Suite v2.1`** (definido canónicamente en [`packages/ui/src/platform/spacetime-catalog.ts`](../../packages/ui/src/platform/spacetime-catalog.ts)).

### 2.1 Los 5 Motores Propietarios

| Clave (`EngineKey`) | Nombre Público | Pilar | Dominio y Vectores | Token de Color | Función Específica y Cadencia |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `tachyon` | **`PitchLab Tachyon v2.1`** | Data Science | Fútbol Puro · 23 Ligas · 126 vectores | `var(--engine-tachyon)` | Entrenado **sin tocar cuotas de casas**. Modela ritmo ofensivo, peligro real generado, desgaste de calendario y fortaleza de plantel sobre `+358,400` partidos (`57.5 %` exactitud directa en `+294,000` juegos de liga). Recalibración automática post-jornada. |
| `singularity` | **`PitchLab Singularity v2.1`** | Machine Learning | Ensamble y Valor Institucional · Multi-mercado | `var(--engine-singularity)` | Cruza las proyecciones puras de `Tachyon` con el flujo mundial de liquidez y filtro anti-sesgo para detectar momios colgados fuera de precio real. Supera la línea de cierre en el **`69.6 %`** de las oportunidades (`+8.6M` vectores tácticos; corrida cada 45 min). |
| `minkowski` | **`PitchLab Minkowski v2.1`** | Data Science | Especialista NFL · 37 indicadores de emparrillado | `var(--engine-minkowski)` | Modela impacto individual de Quarterback titular vs. suplente, ajustes de Head Coach, ventaja de localía dinámica, semanas cortas y clima en estadios abiertos sobre `+64,400` juegos. Corte martes post-MNF y jueves pre-kickoff. |
| `geodesic` | **`PitchLab Geodesic v1.0`** | Machine Learning | De-vigging, Valor Esperado (`EV`) y Correlación `SGP` | `var(--engine-geodesic)` | Elimina la comisión oculta (*vig* / *overround*) de las casas para revelar la **cuota justa exacta**, calcular `+Edge` instantáneo frente al momio del usuario y aplicar el factor de correlación en parlays `SGP` sobre `+3.8M` instantáneas apertura → cierre. |
| `cortex` | **`PitchLab Cortex IA`** | Inteligencia Artificial | Síntesis Ejecutiva + Corte de Alineaciones `60m` + Calibración Horizon | `var(--engine-cortex)` | Agente de IA conectado **exclusivamente** a las matrices numéricas de `Spacetime Suite` (`0` alucinaciones). Redacta la radiografía ejecutiva previa y audita convocatorias y alineaciones confirmadas **60 min antes** del kickoff. |

### 2.2 Narrativa Cuantitativa y Termómetro de Calibración (`0.009 ECE`)

Los indicadores globales auditados (`SPACETIME_METRICS_HEADLINE`) respaldan la promesa de precisión sin jerga académica críptica:

- **`+358,400`** partidos históricos auditados en entrenamiento multi-temporada.
- **`+12.4M`** vectores y puntos de telemetría táctica y movimiento de liquidez.
- **`69.6 %`** de selecciones `Singularity` que superan la línea de cierre (*Closing Line Beat*).
- **`0.009 ECE`** (*Expected Calibration Error*) y desviación media `< 1.2 %` con **reentrenamiento continuo automático al cierre de cada jornada**.

En `/tecnologia`, en la portada `/` y en `/app/tech` se expone la auditoría histórica sobre **`23,660` predicciones cerradas** divididas en **4 cubetas de calibración (`PRECISION_BUCKETS`)**:

| ID Cubeta | Etiqueta Comercial | Probabilidad Declarada | Acierto Real en Cancha | Muestra Auditada | Bate Línea de Cierre | Mercados Típicos |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `shield` | **Confianza Máxima · Escudo** | **`82 %`** | **`82.8 %`** | `4,120` picks | `74.2 %` | Dobles oportunidades (`1X`/`X2`), hándicaps protegidos (`+7.5`) y líneas base. |
| `core` | **Confianza Alta · Principal** | **`72 %`** | **`71.6 %`** | `6,840` picks | `71.4 %` | Selecciones estelares de `Singularity v2.1` y `Minkowski v2.1`. |
| `balanced` | **Confianza Media · Balanceado** | **`60 %`** | **`60.9 %`** | `9,410` picks | `68.8 %` | Totales de goles/puntos (`Over`/`Under`), ambos anotan y spreads directos. |
| `value` | **Alto Valor Arriesgado** | **`41 %`** | **`42.3 %`** | `3,290` picks | `65.9 %` | Momios positivos altos donde el pago supera matemáticamente el riesgo real. |

### 2.3 Derivación de 4 a 5 Picks por Partido y Grupos de Conflicto

[`packages/ui/src/platform/match-picks-engine.ts`](../../packages/ui/src/platform/match-picks-engine.ts) transforma cada `MatchAnalysis` de los snapshots reales en 5 ángulos complementarios etiquetados con `PickConflictGroup` (`home_side`, `away_side`, `draw_side`, `over_total`, `under_total`, `btts_yes`, `btts_no`, `independent`):

1. **`principal` (*Pick Principal PitchLab* · riesgo `medio` · `1.5u`):** señal estructural primaria (`54 %–70 %`) generada por `Tachyon v2.1` (fútbol) o `Minkowski v2.1` (NFL).
2. **`conservador` (*Escudo Conservador* · riesgo `conservador` · `2.0u`):** alta probabilidad (`72 %–88 %`), ideal como ancla de parlay (doble oportunidad o spread protegido).
3. **`totales` (*Línea de Totales* · riesgo `medio` · `1.25u`):** ritmo goleador o total de puntos calibrado sobre goles/puntos proyectados.
4. **`tactico` (*Lectura Táctica* · riesgo `medio` · `1.0u`):** asimetría específica (ambos anotan, mitad con más acción o eficiencia situacional).
5. **`valor` (*Cuota Alta · Valor* · riesgo `arriesgado` · `0.75u`):** oportunidad de cuota positiva detectada por `Geodesic v1.0` + `Singularity v2.1`.

### 2.4 Regla Inquebrantable `FD-16` (Protección de Propiedad Intelectual)

Queda **estrictamente prohibido** renderizar en cualquier ruta comercial (DOM visible, etiquetas ARIA, títulos o textos de ayuda) los nombres académicos internos de los estimadores subyacentes o los proveedores crudos de datos gratuitos/comerciales.
- La atribución legal obligatoria vive **únicamente** en `/legal/creditos` y en la documentación interna de ingeniería (`docs/architecture/`).
- Tanto la suite unitaria (`packages/ui/tests/platform-v4.test.tsx`) como Playwright E2E (`apps/web/e2e/pre-mvp.spec.ts`) fallan automáticamente si aparece cualquier término interno prohibido por `FD-16`.

---

## §3. Modelo de Negocio, Seguridad `Cero-Fuga` y Motores de Crecimiento

### 3.1 Membresía Única: `Pase Total PitchLab` + Facturación `CFDI 4.0`

Siguiendo `ADR-021`, se eliminan por completo los planes escalonados o recortados (*Free / Pro / VIP*) para maximizar conversión y claridad comercial (`MEMBERSHIP_SPEC`):

- **Precio Mensual:** **`$299 MXN / mes`** (menos de `$10 MXN` al día, cancelación en 1 clic, IVA incluido).
- **Precio Anual:** **`$2,390 MXN / año`** (**`-33 %` de ahorro**, equivale a **`$199 MXN / mes`**, ahorra **4 meses completos**).
- **Facturación Fiscal Mexicana (`CFDI 4.0`):** módulo integrado en `/app/account` (pestaña `CFDI 4.0`) con captura de `RFC`, `Razón Social`, `Código Postal Fiscal` y selector de los 4 regímenes SAT más frecuentes:
  - `601 · General de Ley Personas Morales`
  - `612 · Personas Físicas con Actividades Empresariales`
  - `626 · Régimen Simplificado de Confianza (RESICO)`
  - `605 · Sueldos y Salarios`
- **Cumplimiento Regulatorio Estricto (Stripe MX / SEGOB):** PitchLab es un software de inteligencia deportiva por suscripción (**18+**). **No acepta apuestas, no capta fondos de juego y jamás otorga premios monetarios ni en especie por acertar pronósticos.** Toda la Bitácora (`/app/lab`) y el Ranking de la Comunidad (`/app/social`) operan exclusivamente en **unidades simuladas (`0.25u–5.0u`)** y **CLV contra cierre**.

### 3.2 Estrategia de Adquisición: Mes 1 Sin Tarjeta vs. Mes 2 Tarjeta `$0 MXN`

Para acelerar la tracción inicial sin incurrir en costos variables de SMS/WhatsApp OTP ni abrir la puerta a granjas de cuentas gratuitas, PitchLab implementa dos modos conmutables en caliente desde `/app/admin` (`month1NoCardMode`):

1. **Modo Lanzamiento Mes 1 (`7 días gratis SIN pedir tarjeta` · costo operativo `$0 MXN`):**
   - Registro en 1 clic obligatorio vía **OAuth (`Google` o `Apple`)**.
   - **Canonización estricta de correo (`normalizeTrialEmail` en `access-guard.ts`):** convierte `googlemail.com` → `gmail.com`, elimina todos los puntos en la parte local y recorta cualquier sufijo `+alias` (`j.a.i.r+promo2@gmail.com` → `jair@gmail.com`), neutralizando multicuentas con la misma bandeja.
   - **Bloqueo de correos temporales (`isDisposableEmailDomain`):** rechaza dominios desechables (`mailinator`, `tempmail`, `yopmail`, `10minutemail`, `guerrillamail`, etc.).
   - **Cloudflare Turnstile + Huella de Dispositivo:** validación anti-bot sin fricción y límite de 1 prueba gratuita por identidad/equipo.
2. **Modo Operación Continua Mes 2+ (`Prueba gratis con verificación bancaria $0.00 MXN`):**
   - Al desactivar el switch de Mes 1 en `/app/admin`, el flujo de alta solicita método de pago con pre-autorización de **`$0.00 MXN`** hoy (5 días gratis si viene con código de Tipstar o 7 días en alta directa/referido) y recordatorio transparente antes del primer cargo.

### 3.3 Arquitectura `Cero-Fuga` en Servidor (`platform-data.ts` + `access-guard.ts`)

PitchLab **nunca** oculta picks pagados usando únicamente `filter: blur()` sobre datos reales en el cliente. La redacción ocurre **en el servidor** antes de serializar el árbol de React Server Components (`loadPublicPlatformState` en [`apps/web/src/server/platform-data.ts`](../../apps/web/src/server/platform-data.ts) invocando `redactDatasetForVisitor` de [`packages/ui/src/platform/access-guard.ts`](../../packages/ui/src/platform/access-guard.ts)):

| Tipo de Contenido / Superficie | Visitante sin Sesión (`visitor`) | Socio Activo / Tipstar / Admin | Mecanismo Técnico de Blindaje |
| :--- | :--- | :--- | :--- |
| **Partidos finalizados (`status === "FT"`)** | **100 % Públicos y auditables** (marcador, 5 picks calificados `hit`/`miss`, probabilidades) | 100 % Visibles | Transparencia histórica inmutable; impulsa confianza en `/` y `/app/historial`. |
| **`Tecnología & Precisión` (`/tecnologia`)** | **100 % Pública** (5 motores + 4 cubetas `ECE`) | 100 % Visible (`/app/tech`) | Argumento central de conversión cuantitativa sin revelar fórmulas internas (`FD-16`). |
| **Pick Abierto del Día (`isDailyOpenPromo`)** | **1 único pick desbloqueado** en toda la jornada | Todos desbloqueados | Muestra valor real en la portada `/` manteniendo cerrados los otros 4 picks de ese partido. |
| **Pick Semanal de Tipstar (`/p/[pickId]`)** | **1 único pick desbloqueado** por enlace (ej. `/p/sofia-sem`) | Todos desbloqueados | `loadPublicPlatformState(pickId)` agrega solo ese `pick.id` a `extraUnlockedPickIds`; los otros 4 picks del encuentro viajan redactados. |
| **Resto de picks futuros (`NS` / `LIVE`)** | **Redactados en SSR** (`label: "Selección reservada Pase Total"`, `selectionKey: "locked"`) | **100 % Desbloqueados** (`4–5` por juego) | El texto real jamás llega al HTML ni al payload JSON hidratado de Next.js. |
| **Radiografía `Cortex IA`, Bajas `60m` y ~20 Mercados** | **Redactados en SSR** (`preGame.isRedacted = true`, `markets: []`) | **100 % Desbloqueados** | Evita extracción por scraping o inspección de DevTools. |
| **Parlays & SGP, Player Props Lab, Momios y Comunidad VIP** | Protegidos tras `middleware.ts` (`/app/*` → `/login`) y guardas de rol | **100 % Operativos** | `containsExternalLink` bloquea URLs, `t.me`, `wa.me`, `discord.gg` en debates. |
| **Boletos compartibles `4:5` / `9:16` pre-kickoff** | No disponible | **Selección sellada si `status !== "FT"`** (salvo promo semanal de `Tipstar`) | `canRevealPickOnShare` impide revender capturas antes del inicio + marca de agua dinámica por sesión (`getSessionWatermark`: `@socio_pl · PL-8842`). |

### 3.4 Portal de Tipstars Oficiales (`/app/tipstar` + `/p/sofia-sem`)

El programa de creadores convierte a analistas con audiencia en socios de distribución de PitchLab sin canibalizar la suscripción (`TIPSTAR_CREATORS`: `@sofia_nfl` / `SOFIA5`, `@carlos_quant` / `CARLOS5`, `@diego_tactico` / `DIEGO5`):

- **Cupo estricto de `1 Pick Abierto / semana`:** desde `/app/tipstar`, el creador elige si su pick gratuito semanal proviene directamente de **`Spacetime Suite`** (uno de los 5 picks de un partido próximo) o de su propia **`Bitácora` sellada**, añadiendo su tesis editorial de hasta 180 caracteres.
- **Boleto nocturno editorial `4:5` (Post) y `9:16` (Story):** exportable con estética oscura de estadio forzada, insignia verificada de unidades/CLV del Tipstar y llamado a la acción con su código personal.
- **Aterrizaje público sin fuga (`/p/sofia-sem`):** cualquier seguidor que abre el link en Instagram, X o TikTok ve el boleto abierto del Tipstar, constata que los **otros 4 picks del mismo partido están blindados** y puede canjear en 1 clic el código **`SOFIA5` (`5 días de Pase Total gratis`)**.
- **Economía alineada:** el Tipstar Oficial tiene su `Pase Total` incluido a `$0` y cobra **`25 %` de comisión mensual recurrente** mientras cada referido mantenga activa su suscripción.

### 3.5 Referidos de Doble Vía Socio ↔ Socio (`/app/account`)

Ubicado como pestaña principal por defecto en `/app/account` para maximizar visibilidad:

1. **Beneficio de entrada para el amigo invitado:** al registrarse con el link personal del socio (`https://pitchlab.mx/signup?ref=SOCIO-8842`), recibe **`7 días gratis` + `30 %` de descuento en su primer mes (`$209 MXN` en vez de `$299 MXN`)**.
2. **Disparador antifraude de recompensa bilateral:** los días de regalo **no** se acreditan por simple registro gratuito; únicamente cuando se procesa con éxito el **primer pago real** del invitado, **ambas cuentas (anfitrión e invitado) reciben automáticamente `+15 días gratis`** acumulados antes de su siguiente fecha de corte.
3. **Meta Embajador (`5 amigos activos`):** al alcanzar 5 referidos con pago verificado, el socio desbloquea la insignia **`Embajador PitchLab`** y recibe un bono extraordinario de **`+30 días gratis adicionales`** (1 mes completo extra sin costo, acumulando `105 días` totales en ese hito).

---

## §4. Sistema Visual Smoked-Glass `shows.link` (Paridad 1:1 con `Prototipo Maestro PitchLab`)

Toda la interfaz de `apps/web` y `packages/ui/src/platform/` implementa con fidelidad 1:1 la física óptica del artefacto canónico `Prototipo Maestro PitchLab` (`ADR-020` y `ADR-023`), gobernada desde [`packages/tokens/scripts/generate.mjs`](../../packages/tokens/scripts/generate.mjs) y [`apps/web/app/pitchlab-v4.css`](../../apps/web/app/pitchlab-v4.css):

- **Lienzo Obsidiana `#000000` por defecto + Tema Claro Alabastro `#F4F4F5`:** contraste verificado **WCAG 2.1 AA/AAA** en ambos esquemas. `ThemeToggle` aplica un atributo efímero `data-theme-switching="true"` para congelar transiciones durante el cambio de tema y evitar estados intermedios ilegibles. Tipografía `Host Grotesk` + `Inter` con dígitos tabulares `.num` (`tabular-nums lining-nums`).
- **Física real de cristal ahumado translúcido (cero grises opacos):** en lugar de tarjetas carbón sólidas, las lentes primarias usan `--pl-glass-lens: rgba(255, 255, 255, 0.068)` con `backdrop-filter: blur(18px)` y las tarjetas secundarias `--pl-glass-card: rgba(255, 255, 255, 0.052)` con `backdrop-filter: blur(14px)`, dejando respirar la luz cromática del fondo.
- **Atmósfera Dinámica + `<LensGlowOrbs>`:** `AtmosphereStage` proyecta dos auras globales (`blur(92px) saturate(185%)`) sincronizadas automáticamente con los colores oficiales de los clubes local y visitante (`--home-color`, `--away-color` desde `@pitchlab/sports-assets`), mientras que `<LensGlowOrbs>` inyecta orbes internos difuminados (`blur(44px)`) dentro de cada tarjeta destacada.
- **Bisel óptico `.glass-ring` sin bordes dobles:** el borde especular de `1px` (`1.25px` en `.glass-ring--featured`) se recorta mediante `mask-composite: exclude` (`-webkit-mask-composite: xor`) con brillos radiales en las esquinas superiores y `border: 0`. Ni `.seg-well` ni `.pl-btn-glass` añaden bordes `1px solid` superpuestos.
- **Jerarquía de CTAs y Boletos Perforados:** el botón primario `.pl-btn-primary` en modo oscuro es **blanco puro (`#FFFFFF`) con texto negro (`#000000`)** para máxima autoridad visual; los boletos usan divisor punteado `.ticket-perf`; y `.share-ticket-card` fuerza `color-scheme: only dark` con tokens `--share-card-*` para que los boletos `4:5` / `9:16` conserven siempre su estética nocturna aunque el usuario navegue en tema claro.
- **Módulo profundo `MaestroPrimitives.tsx` y `<TopLayerModalDialog>`:**
  - [`packages/ui/src/platform/components/MaestroPrimitives.tsx`](../../packages/ui/src/platform/components/MaestroPrimitives.tsx) centraliza los **33 iconos vectoriales** `MaestroIcon` (`strokeWidth={1.8}`), `LensGlowOrbs`, `CrestPedestal`, `CalendarSquare`, `StackedAvatars`, `NoticeCard`, `GlassActionRow` y `RoleSwitcherPill`.
  - [`TopLayerModalDialog`](../../packages/ui/src/platform/components/PlatformOverlays.tsx) monta un `<dialog>` HTML nativo en el *Top Layer* vía `dialog.showModal()`, soporte `closedby="any"` con respaldo por coordenadas y bloqueo de scroll puramente por CSS (`overscroll-behavior: contain` en `dialog:modal` y `dialog::backdrop`), **sin mutar jamás `overflow` en `<html>` ni `<body>`**.
- **Cero literales `#hex` fuera de `packages/tokens`:** regla verificada en cada corrida de `node scripts/lint-codebase.mjs` (junto con prohibición de bloques `catch {}` vacíos).

---

## §5. Mapa Completo de Rutas y Archivos en `apps/web` y `packages/ui/src/platform/`

### 5.1 Las 7 Rutas Públicas Principales (+ Redirecciones y Legales)

| # | Ruta en `apps/web` | Archivo App Router | Superficie en `@pitchlab/ui` | Equivalente en `prototipo-maestro-pitchlab.html` | Propósito y Regla de Datos |
| :-: | :--- | :--- | :--- | :--- | :--- |
| 1 | **`/`** | `apps/web/app/page.tsx` | `LandingSurface` (`public/LandingSurface.tsx`) | `renderLanding()` (L2004) | Portada comercial: hero interactivo multi-liga con 1 Pick Abierto del Día, bloque `Spacetime Suite v2.1`, Pick Semanal Tipstar, resultados `FT` y planes. Redactada en SSR si no hay sesión. |
| 2 | **`/tecnologia`** | `apps/web/app/tecnologia/page.tsx` | `TechPrecisionSurface` (`public/TechAndPricingSurfaces.tsx`) | `renderTechPublicPage()` (L1991) + `renderTechPrecisionSection()` (L1865) | Explicación profunda de los 5 motores propietarios y las 4 cubetas auditadas de calibración (`0.009 ECE`). (`/metodologia` redirige aquí). |
| 3 | **`/pricing`** | `apps/web/app/pricing/page.tsx` | `PricingSurface` (`public/TechAndPricingSurfaces.tsx`) | `renderPricingPage()` (L2640) + `renderPlansSection()` (L2361) | Comparativa mensual (`$299`) vs. anual (`$2,390`, `-33 %`), beneficios del Pase Total, Referidos Doble Vía y acceso al programa Tipstar. |
| 4 | **`/login`** | `apps/web/app/login/page.tsx` | `AuthSurfaceV4` (`public/AuthAndOnboardingSurfaces.tsx`) | `renderVipAccess()` (L2444) | Acceso de socios con OAuth Google/Apple, teclado PIN de vista previa (`2026` en dev) y preservación segura de `?next=/app/...`. |
| 5 | **`/signup`** | `apps/web/app/signup/page.tsx` | `AuthSurfaceV4` (`public/AuthAndOnboardingSurfaces.tsx`) | `renderVipAccess()` (L2444) | Alta sin fricción adaptada en vivo a Mes 1 (sin tarjeta + escudo `$0` anti-multicuentas) o Mes 2 (`$0 MXN` verificado) + canje de código `SOFIA5` / referido. |
| 6 | **`/onboarding`** | `apps/web/app/onboarding/page.tsx` | `OnboardingSurfaceV4` (`public/AuthAndOnboardingSurfaces.tsx`) | `renderOnboardingPage()` (L2556) | Flujo guiado en 3 pasos: (1) ligas prioritarias, (2) perfil de riesgo (`Conservador`/`Medio`/`Arriesgado`) y formato de momio, (3) confirmación `18+`. |
| 7 | **`/p/[pickId]`** | `apps/web/app/p/[pickId]/page.tsx` | `PublicSharedPickSurface` / `PublicTipstarPickSurface` (`public/AuthAndOnboardingSurfaces.tsx`) | Vista pública de `renderTipstarPortal()` (L4014) | Landing viral para redes (`/p/sofia-sem`, `/p/carlos-sem`, `/p/diego-sem`): libera solo ese pick semanal, mantiene blindados los otros 4 del juego y ofrece código de `5 días gratis`. |
| — | `/legal/*` | `apps/web/app/legal/{terminos,privacidad,juego-responsable,creditos}/page.tsx` | `LegalShell` (`apps/web/src/client/legal-shell.tsx`) | Pie legal 18+ | Términos, privacidad, juego responsable (`18+`, unidades simuladas) y créditos de datos (`FD-16`). |

### 5.2 Las 12 Vistas Operativas del Club en `/app` (+ Rutas Dinámicas y Complementarias)

Todas las rutas bajo `/app/**` están protegidas por [`apps/web/middleware.ts`](../../apps/web/middleware.ts) y envueltas por [`apps/web/app/app/layout.tsx`](../../apps/web/app/app/layout.tsx) (`loadClubPlatformState` + `ClubWorkspaceShell`).

| # | Ruta del Club | Archivo App Router | Componente en `@pitchlab/ui` | Equivalente en `prototipo-maestro-pitchlab.html` | Capacidad Principal |
| :-: | :--- | :--- | :--- | :--- | :--- |
| 1 | **`/app`** | `apps/web/app/app/page.tsx` | `JornadaClubView` (`club/CoreMatchViews.tsx`) | `renderJornadaCenter()` (L2956) | Centro de mando diario ordenado por ligas favoritas, partido estelar con síntesis `Cortex IA`, top picks del día y cartelera multi-liga. |
| 2 | **`/app/picks`** | `apps/web/app/app/picks/page.tsx` | `MultiPicksClubView` (`club/CoreMatchViews.tsx`) | `renderPicksRadar()` (L3129) | Radar filtrable de todos los multi-picks abiertos por perfil de riesgo, liga y confianza (`≥ 70 %`), con probador instantáneo de momio. |
| 3 | **`/app/[league]`** | `apps/web/app/app/[league]/page.tsx` | `LeagueHubClubView` (`club/CoreMatchViews.tsx`) | `renderLeagueHub()` (L3249) | Hub dedicado para cada una de las 7 ligas con pestañas de *Jornada*, *Resultados (`FT`)* y *Tabla de Posiciones*. |
| 4 | **`/app/[league]/games/[gameId]`** | `apps/web/app/app/[league]/games/[gameId]/page.tsx` | `MatchStudioClubView` (`club/CoreMatchViews.tsx`) | `renderMatchStudio()` (L3305) | Estudio profundo del partido: radiografía `Cortex IA` + alineaciones `60m` + flujo de dinero, los **5 picks del encuentro**, `~20` mercados, H2H y debate VIP. |
| 5 | **`/app/parlays`** | `apps/web/app/app/parlays/page.tsx` | `ParlayBuilderClubView` (`club/ParlayAndQuantViews.tsx`) | `renderParlaysView()` (L3680) | Auto-Armador Inteligente (`2–6` patas) + selector manual con bloqueo de contradicciones, switch `SGP` correlacionado y boleto lateral perforado. |
| 6 | **`/app/props`** | `apps/web/app/app/props/page.tsx` | `PropsLabClubView` (`club/ParlayAndQuantViews.tsx`) | `renderPropsLab()` (L4245) | Laboratorio interactivo de jugadores (NFL y Fútbol) con *scrubber* de línea paso a paso, gráfica de barras `L10`/`L5` y ventaja `Geodesic`. |
| 7 | **`/app/momios`** | `apps/web/app/app/momios/page.tsx` | `MomiosExplorerClubView` (`club/ParlayAndQuantViews.tsx`) | `renderMomiosExplorer()` (L4421) | Tabla institucional `Geodesic v1.0` comparando cuota justa sin comisión, línea de apertura, momio actual, dirección de dinero y `+Edge`. |
| 8 | **`/app/social`** | `apps/web/app/app/social/page.tsx` | `SocialVipClubView` (`club/SocialAndTipstarViews.tsx`) | `renderSocial()` (L4689) + `renderSocialPulse()` + `renderLeaderboardsSection()` | Comunidad VIP en 3 pestañas: *Boletos & Debate* (con filtro anti-spam), *Consenso Público vs. Suite* y *Ranking Auditado CLV / ROI IC 95 %*. |
| 9 | **`/app/tipstar`** | `apps/web/app/app/tipstar/page.tsx` | `TipstarPortalClubView` (`club/SocialAndTipstarViews.tsx`) | `renderTipstarPortal()` (L4014) | Consola de creadores: KPIs de código (`SOFIA5`) y comisiones (`25 %`), selector de origen (*Suite* vs. *Bitácora*) y exportador de boleto `4:5` / `9:16`. |
| 10 | **`/app/historial`** | `apps/web/app/app/historial/page.tsx` | `HistorialClubView` (`club/LedgerAccountAdminViews.tsx`) | `renderHistorial()` (L5138) | Archivo inmutable de todos los partidos liquidados `FT` con filtro de cumplidos / no cumplidos y tasa de acierto verificada (`0` picks editados). |
| 11 | **`/app/lab`** | `apps/web/app/app/lab/page.tsx` | `BitacoraClubView` (`club/LedgerAccountAdminViews.tsx`) | `renderLab()` (L5198) | Bitácora personal inmutable (picks, props y parlays), balance neto en unidades, `CLV` promedio, exportación `CSV` y partidos vigilados (`60m`). |
| 12 | **`/app/account`** | `apps/web/app/app/account/page.tsx` | `AccountReferralsClubView` (`club/LedgerAccountAdminViews.tsx`) | `renderAccount()` (L5427) | Gestión integral en 4 pestañas: *Referidos (`+15d` ambos + meta Embajador)*, *Pase Total (`$299`/`$2,390`)*, *Preferencias/Pausa Social* y *CFDI 4.0*. |
| +13 | **`/app/admin`** | `apps/web/app/app/admin/page.tsx` | `FounderAdminClubView` (`club/LedgerAccountAdminViews.tsx`) | `renderAdminPanel()` (L4515) | Consola operativa del Fundador: switch Mes 1 sin tarjeta vs. Mes 2 tarjeta `$0`, métricas anti-spam, gestión de códigos Tipstar y estado de los 5 motores. |
| +14 | **`/app/u/[handle]`** y **`/app/tech`** | `apps/web/app/app/u/[handle]/page.tsx` · `apps/web/app/app/tech/page.tsx` | `AnalystProfileClubView` · `ClubTechView` (`club/LedgerAccountAdminViews.tsx`) | `renderProfile()` (L5300) · `renderTechPrecisionSection()` | Perfil público/privado de cualquier analista o Tipstar (`@sofia_nfl`, `@carlos_quant`, `@jair`, `@socio_pl`) y vista interna de `Spacetime Suite`. |

### 5.3 Superposiciones Modales, Cromo y Motores de Plataforma

| Módulo / Archivo | Símbolos Clave | Rol en la Arquitectura |
| :--- | :--- | :--- |
| `packages/ui/src/platform/components/PlatformOverlays.tsx` | `TopLayerModalDialog`, `PickComposerModal`, `ShareTicketModal`, `AlertsDrawer`, `CommandPaletteModal` (`Cmd+K`), `BetaPinModal`, `ParlayFloatingDock`, `RoleSimulatorBar`, `ToastViewport` | Todas las capas superpuestas nativas `<dialog>` (`renderModals()` L5611, `renderCmdk()` L5882, `renderParlayDock()` L3974 y `renderProtoBar()` L5932 del prototipo HTML). |
| `packages/ui/src/platform/components/ShellChrome.tsx` | `AtmosphereStage`, `PublicHeaderV4`, `PublicFooterV4`, `ClubWorkspaceShell`, `OddsFormatSegment`, `FloatingQuickJumpBar` | Escenario atmosférico global, navegación superior/lateral responsiva y barra rápida colapsable de las 11 vistas maestras. |
| `packages/ui/src/platform/components/MatchTicketCard.tsx` | `MatchTicketCard`, `MultiPickRow` | Tarjeta perforada de partido (`renderMatchCard()` L2693) con marca de agua de sesión, barra `psplit` y acciones directas a Parlay y Bitácora. |
| `packages/ui/src/platform/match-picks-engine.ts` | `buildPlatformDataset` | Hidrata los snapshots de las 7 ligas y deriva de forma determinista los 5 picks por encuentro, ~20 mercados, props y radiografía `PreGameIntel`. |
| `packages/ui/src/platform/parlay-engine.ts` | `checkParlayCompatibility`, `computeParlaySummary`, `buildSmartAutoParlay` | Reglas de compatibilidad multi-partido y `SGP` (`≤ 6` selecciones, `≤ 2` del mismo partido sin contradicción) y factor de correlación `Geodesic v1.0`. |
| `packages/ui/src/platform/access-guard.ts` | `isPickUnlocked`, `isPreGameIntelUnlocked`, `canRevealPickOnShare`, `redactDatasetForVisitor`, `getSessionWatermark`, `containsExternalLink`, `normalizeTrialEmail`, `isDisposableEmailDomain` | Núcleo puro y testeado de seguridad `Cero-Fuga`, sellado de boletos, anti-spam y normalización anti-multicuentas `$0 MXN`. |
| `packages/ui/src/platform/platform-provider.tsx` | `PlatformProvider`, `usePlatform` | Orquestador de estado interactivo en cliente conectado a Next.js mediante `apps/web/src/client/platform-client-bridge.tsx`. |
| `apps/web/src/server/{platform-data,snapshots,beta-auth}.ts` | `loadPublicPlatformState`, `loadClubPlatformState`, `loadAllActiveLeagueSnapshots`, `verifyBetaCookieToken` | Carga con caché por `mtime` de `data/snapshots/<liga>/latest.json`, verificación HMAC constante de sesión y redacción `Cero-Fuga` en servidor. |

---

## §6. Frontera Actual (Real vs. Estado Simulado en Cliente) y Hoja de Ruta Accionable para Claude en Casa

Para que Claude retome el proyecto en casa con precisión quirúrgica y sin suposiciones erróneas, esta sección separa con total transparencia técnica **qué opera hoy con datos/código real de servidor** frente a **qué vive temporalmente como estado interactivo de cliente**.

### 6.1 Auditoría Honesta del Estado Actual en `gemini-reestructura`

#### Lo que YA es real y productivo hoy

1. **Ingesta y Snapshots Deportivos Reales (`data/snapshots/<liga>/latest.json`):** `apps/web/src/server/snapshots.ts` lee, valida con Zod (`LeagueSnapshotSchema` en `@pitchlab/contracts`) y cachea por `mtime` las 7 ligas activas, rechazando datos demo en producción (`assertNotDemoInProduction` + `scripts/check-no-demo-prod.mjs`).
2. **Motores Deterministas en TypeScript (`@pitchlab/ui`):** `match-picks-engine.ts` (5 picks por partido, calificación automática `hit`/`miss` contra marcadores finales reales, ~20 mercados y props), `parlay-engine.ts` (bloqueo de choques lógicos, auto-armador y correlación `SGP`) y `access-guard.ts` (canonización Gmail, bloqueo de dominios desechables, anti-spam, sellado de share cards) son funciones puras cubiertas por pruebas unitarias.
3. **Redacción `Cero-Fuga` en RSC / SSR (`platform-data.ts`):** en cualquier petición sin cookie válida `pl_beta`, el servidor redacta las selecciones no finalizadas antes de enviar HTML/JSON al navegador, liberando únicamente resultados `FT`, 1 pick promocional diario y el único pick semanal solicitado en `/p/[pickId]`.
4. **Compuerta de Sesión Firmada (`middleware.ts` + `beta-auth.ts`):** protección de `/app/**` mediante cookie `HttpOnly` firmada con `HMAC-SHA256` en tiempo constante (`verifyBetaCookieToken`), sanitización anti-*open-redirect* (`sanitizeNextPath`) y *rate limiting* compatible con Upstash Redis (`/api/beta/unlock` y `/api/beta/logout`).
5. **Sistema de Diseño v4.1 Completo y Verificado:** tokens duales generados desde `packages/tokens`, paridad visual 1:1 con `Prototipo Maestro PitchLab`, accesibilidad WCAG AA/AAA, diálogos `<dialog>` Top Layer, Storybook (`platform-v4.stories.tsx`) y suites Vitest + Playwright E2E en verde.

#### Lo que vive HOY en memoria / `localStorage` dentro de `PlatformProvider` (pendiente de persistir en BD)

| Dominio / Interacción | Estado Actual en `gemini-reestructura` | Dónde Vive Hoy |
| :--- | :--- | :--- |
| **Identidad de usuario y rol (`viewerRole`)** | Gate global por PIN de preview (`2026` en desarrollo; `PITCHLAB_BETA_CODE` en entorno) + selector interactivo de rol (`visitor`, `member`, `tipstar`, `admin`) para auditar vistas. | Cookie `pl_beta` + `localStorage["pl-sim-role"]` en `PlatformProvider`. |
| **Bitácora de picks, props y parlays (`journal`)** | Semilla inicial determinista sobre snapshots (`seedInitialJournal`) + sellado interactivo en sesión y descarga real de archivo `.csv`. Se reinicia al recargar la página. | `useState<JournalEntry[]>` en `PlatformProvider`. |
| **Comunidad VIP (`socialPosts`, likes, comentarios)** | Semilla `INITIAL_SOCIAL_POSTS` + publicación y comentarios en vivo con filtro anti-spam `containsExternalLink` funcionando en cliente. No persiste entre usuarios ni recargas. | `useState<SocialPost[]>` en `PlatformProvider`. |
| **Referidos Doble Vía y Modo Mes 1 Sin Tarjeta** | Contadores e interruptores interactivos (`referralPaidFriends`, botón *Simular 1.er pago*, switch `month1NoCardMode`, alta visual de códigos Tipstar en `/app/admin`). | `useState` + `localStorage["pl-month1-nocard"]` en `PlatformProvider`. |
| **Preferencias y Datos Fiscales `CFDI 4.0`** | Formato de momio (`pl-odds-fmt`), riesgo (`pl-risk-pref`) y ligas favoritas (`pl-fav-leagues`) persisten en navegador; formulario `CFDI 4.0` y watchlist `60m` viven en estado local. | `localStorage` y estado local en `AccountReferralsClubView`. |
| **Síntesis `Cortex IA` y Momios de Casas** | Derivados determinísticamente desde las probabilidades del snapshot en `match-picks-engine.ts` mientras se conecta el job de alineaciones `60m` y el feed continuo de líneas. | Calculados en memoria al construir `PlatformDataset`. |

---

### 6.2 Hoja de Ruta Priorizada para Construir con Claude en Casa (Orden Exacto Recomendado)

Cada bloque está diseñado como una unidad limpia y secuencial que Claude puede implementar sin rehacer ni un solo componente visual de `packages/ui/src/platform/`:

#### Prioridad 1 · Persistencia Relacional en Neon PostgreSQL + Drizzle ORM (`ADR-007`, `ADR-011`)
- **Objetivo:** crear el paquete `packages/db` (o `apps/web/src/server/db/`) con Drizzle ORM apuntando a Neon PostgreSQL y migrar el estado volátil de `PlatformProvider` a tablas transaccionales manteniendo intacta la interfaz `PlatformContextValue`.
- **Tablas exactas a modelar:**
  1. `users`: `id`, `email`, `canonical_email` (índice `UNIQUE` alimentado siempre por `normalizeTrialEmail`), `handle` (`UNIQUE`), `name`, `role` (`member` | `tipstar` | `admin`), `odds_format`, `risk_preference`, `favorite_leagues` (`jsonb`), `social_paused` (`boolean`), `watermark_code` (`PL-XXXX` único por usuario), `created_at`.
  2. `entitlement_grants`: libro mayor inmutable de tiempo de acceso (`id`, `user_id`, `source` enum: `'trial_month1' | 'trial_card0' | 'tipstar_code' | 'stripe_sub' | 'referral_bilateral_15d' | 'ambassador_bonus_30d' | 'admin_grant'`, `starts_at`, `ends_at`, `source_ref_id`). El acceso activo (`hasActiveEntitlement`) se resuelve verificando `EXISTS (SELECT 1 FROM entitlement_grants WHERE user_id = $1 AND ends_at > NOW())`.
  3. `journal_entries`: `id`, `user_id`, `game_id`, `pick_id`, `origin`, `pick_label`, `units` (`numeric(4,2)`), `user_decimal`, `fair_decimal`, `closing_decimal` (nullable hasta kickoff), `clv_pct`, `status` (`pending` | `won` | `lost`), `is_hidden_in_profile`, `note`, `sealed_at` (con restricción de servidor que rechaza sellar si `NOW() >= kickoff_utc`).
  4. `social_posts` y `social_comments`: con ejecución **en servidor** de `containsExternalLink()` e incremento persistente del contador de spam bloqueado para `/app/admin`.
  5. `tipstar_profiles` y `tipstar_codes`: `user_id`, `promo_code` (`SOFIA5`), `free_days` (`5`), `commission_pct` (`25`), `weekly_open_pick_id`, `weekly_open_origin` (`spacetime` | `bitacora`), `weekly_thesis`, `week_iso` (constraint `1` cambio/semana).
  6. `referrals` y `billing_profiles_cfdi`: seguimiento de `referrer_user_id` ↔ `referred_user_id`, estado `'signed_up' | 'first_payment_settled'`, y datos fiscales cifrados/validados (`rfc`, `razon_social`, `cp_fiscal`, `regimen_sat`).
  7. `platform_settings`: fila singleton con `month1_no_card_mode` (`boolean`) editable por el rol `admin` desde `/app/admin`.

#### Prioridad 2 · Autenticación Real con Better Auth + OAuth Google/Apple + Cloudflare Turnstile (`ADR-010`, `ADR-021`)
- **Objetivo:** reemplazar el gate temporal de PIN `2026` (`apps/web/src/server/beta-auth.ts` y `/api/beta/*`) por **Better Auth** integrado con Drizzle.
- **Criterios exactos de implementación:**
  - Habilitar proveedores OAuth `Google` y `Apple` en `/login` y `/signup`.
  - En el hook `before` de creación de cuenta en servidor: validar token de **Cloudflare Turnstile**, rechazar si `isDisposableEmailDomain(email)` es `true`, calcular `canonicalEmail = normalizeTrialEmail(email)` y verificar que no exista ya una concesión previa de prueba (`trial_month1` / `trial_card0`) asociada a ese `canonical_email` o huella de dispositivo.
  - Si `platform_settings.month1_no_card_mode === true`, insertar automáticamente un `entitlement_grant` de `7 días` (o `5 días` si trae `promo_code` de Tipstar) y redirigir a `/onboarding`.
  - Actualizar `apps/web/middleware.ts`, `loadPublicPlatformState` y `loadClubPlatformState` para resolver el `user` real, su `viewerRole` y su marca de agua única `PL-XXXX` desde la sesión de Better Auth.

#### Prioridad 3 · Stripe MX Checkout / Billing + Webhook Bilateral de Referidos, Comisiones Tipstar y CFDI 4.0 (`ADR-011`, `ADR-021`)
- **Objetivo:** conectar cobros recurrentes en pesos mexicanos y disparar las recompensas de crecimiento únicamente sobre ingresos reales liquidados.
- **Criterios exactos de implementación:**
  - Configurar en Stripe MX los dos precios del **Pase Total PitchLab**: mensual (`$299 MXN`) y anual (`$2,390 MXN`), más el cupón automático de invitado referido (`30 % off` el primer mes → `$209 MXN`).
  - Cuando `month1_no_card_mode === false` (Mes 2+), lanzar Stripe Checkout con `subscription_data.trial_period_days` (`7` o `5`) y `payment_method_collection: "always"` (cargo inicial `$0.00 MXN`).
  - En el webhook firmado `POST /api/webhooks/stripe` al recibir `invoice.paid` con `amount_paid > 0`:
    1. Extender `entitlement_grants` del socio por el periodo facturado (`+1 mes` o `+1 año`).
    2. **Si es el primer pago real de un usuario referido (`referrals.status === 'signed_up'`):** dentro de una misma transacción SQL idempotente, marcar `first_payment_settled`, insertar **dos filas `+15 días`** en `entitlement_grants` (una para `referred_user_id` y otra para `referrer_user_id`), contar los referidos pagados del anfitrión y, si llega exactamente a `5`, insertar la concesión adicional **`ambassador_bonus_30d` (`+30 días`)**.
    3. **Si el usuario tiene atribución a un `tipstar_code`:** registrar en `tipstar_commissions_ledger` el **`25 %` del ingreso neto cobrado** para liquidación mensual visible en `/app/tipstar` y `/app/admin`.
    4. **Si el socio guardó perfil en `CFDI 4.0`:** encolar timbrado automático (ej. Facturapi / Facturama) con su régimen SAT (`601`, `612`, `626`, `605`).

#### Prioridad 4 · Pipeline Automatizado de Snapshots, Momios Reales y Corte `60m` de Alineaciones hacia R2 / Neon (`ADR-008`, `ADR-009`, `ADR-013`)
- **Objetivo:** automatizar la actualización continua de las 7 ligas sin depender de archivos locales estáticos en el despliegue serverless.
- **Criterios exactos de implementación:**
  - Publicar los artefactos de `services/ingest` en **Cloudflare R2** y/o tablas de predicción en Neon, adaptando `apps/web/src/server/snapshots.ts` para leer desde R2/Neon en producción con fallback a `data/snapshots/` en desarrollo local.
  - Persistir instantáneas de cuotas (`apertura`, `actual`, `cierre` al silbatazo) para que `Geodesic v1.0` (`/app/momios`) y la liquidación automática de `journal_entries` calculen el **CLV real contra línea de cierre** al pasar cada partido a `FT`.
  - Programar el job **Vigilancia `60m`** (`T-60 min` antes de `kickoff_utc` de cada partido) que consulta convocatorias/bajas confirmadas, genera la síntesis estructurada de `PitchLab Cortex IA` vía OpenRouter (`ADR-013`, temperatura baja y anclada estrictamente al JSON del modelo sin violar `FD-16`) y notifica a los socios que marcaron el juego en su watchlist.

#### Prioridad 5 · Despliegue Productivo en Vercel y Compuertas de Entorno (`ADR-002`, `ADR-012`)
- **Objetivo:** publicar `pitchlab.mx` en Vercel con observabilidad completa y sin exponer controles de maqueta a usuarios finales.
- **Criterios exactos de implementación:**
  - Condicionar el renderizado de `FloatingQuickJumpBar` (`.pl-quick-jump-bar`), `RoleSwitcherPill` y `RoleSimulatorBar` a `process.env.NEXT_PUBLIC_ENABLE_MAESTRO_DEVTOOLS === "true"` (activo en desarrollo/staging para revisión del fundador, **apagado por defecto en producción**), asegurando también que `allowRoleSimulation` sea siempre `false` en producción salvo para cuentas con rol `admin` verificado en servidor.
  - Configurar variables de entorno productivas en Vercel (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `NEXT_PUBLIC_POSTHOG_KEY`, `SENTRY_DSN`).
  - Ejecutar la compuerta completa antes de promover a producción: `node scripts/check-no-demo-prod.mjs --prod`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` y `pnpm e2e`.
