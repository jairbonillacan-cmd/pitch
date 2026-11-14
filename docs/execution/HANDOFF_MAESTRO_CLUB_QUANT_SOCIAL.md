# Handoff Maestro · Club `/app`, Motores Quant, Parlays SGP, Comunidad VIP, Portal Tipster y Admin

> **Actualización 2026-11-11 (ADR-027):** este documento es de la entrega de Gemini del 10 nov. Desde entonces los motores son **Spacetime Suite v3.0** (`packages/spacetime`), la UI ya no muestra momios, bajas ni cifras sin fuente (`+358,400`, `+12.4M`, `69.6 %`, `0.009 ECE` quedaron retiradas), el contenido de demostración lleva la etiqueta «Ejemplo» y las herramientas de preview no usan el PIN en el cliente. El estado vigente está en [`docs/execution/PROJECT_STATE.md`](./PROJECT_STATE.md) y [ADR-027](../architecture/adr/ADR-027-spacetime-v3-datos-verificables-y-herramientas-de-preview.md).

- **Fecha:** 2026-11-10
- **Rama activa:** `gemini-reestructura`
- **Referencia visual y funcional canónica:** `design/prototipo-maestro/prototipo-maestro-pitchlab.html`
- **Alcance de este documento:** Shell autenticado del Club (`/app/*`), tarjetas y filas de partido, vistas de Jornada y Estudio de 5 Picks, laboratorio cuantitativo (`Parlays SGP`, `Props Lab`, `Momios`), Comunidad VIP, Portal Tipster, Bitácora/Historial, Cuenta (`Referidos +15d` y `CFDI 4.0`), Consola Founder Admin y modales nativos `<dialog>` Top-Layer.

---

## 1. Qué se hizo (Shell `/app`, Partidos, Quant, Parlays SGP, Comunidad VIP, Portal Tipster, Cuenta y Admin)

Se completó la evolución visual y funcional 1:1 hacia la física *Smoked Glass* + orbes radiales (`<LensGlowOrbs>`) + iconografía vectorial (`<MaestroIcon>`) del **Prototipo Maestro PitchLab**, respetando estrictamente `0` literales hexadecimales fuera de `@pitchlab/tokens` y `0` filtraciones de términos internos/proveedores (`FD-16`).

### 1.1 Shell del Club, Tarjetas de Partido y Barra Rápida de 11 Vistas
- **`packages/ui/src/platform/components/ShellChrome.tsx`:**
  - **Club Topbar (`ClubWorkspaceShell`) y Header Público (`PublicHeaderV4` / `PublicGlassHeader`):** Logo hacia `/`, botón de búsqueda inline (`Buscar partido, liga o @socio...` + atajo `<kbd>⌘K</kbd>` con `aria-label="Buscar"`), `<RoleSwitcherPill compact />`, campana de alertas 60m con badge no leído `2`, `OddsFormatSegment` (`Momio` / `Decimal`), `<ThemeToggle shape="pill" />`, chip de perfil verificado `@jair +6.1u` (o `@sofia_nfl +18.4u` en rol `tipster`) enlazado a `/app/u/sofia_nfl`, y botón `Salir` (`/api/beta/logout`).
  - **Left Rail colapsable en 4 grupos exactos:**
    1. *Spacetime Club*: `Jornada` (`/app`), `Multi-Picks hoy` (`/app/picks`), `Armar Parlays` (`/app/parlays` + contador de selecciones), `Comunidad VIP` (`/app/social` + punto verde en vivo), `Mi bitácora` (`/app/lab` + `journal.length`).
    2. *Motores & Labs*: `Tecnología & Precisión` (`/app/tech`), `Player Props Lab` (`/app/props`), `Momios & Geodesic` (`/app/momios`), `Resultados cerrados` (`/app/historial`).
    3. *Crecimiento*: `Portal Tipster` (`/app/tipster` + badge `1/sem`), `Referidos (+15d)` (`/app/account`), `Admin Founder` (`/app/admin`).
    4. *7 Ligas*: Las 7 ligas activas (`dataset.leagues`) con `<LeagueBadge>` y conteo de encuentros próximos.
  - **Mobile Bottom Dock de 5 ítems + Cajón Móvil:** Barra inferior fija (`.mobile-dock`) con `Jornada`, `Picks`, `Parlays`, `VIP` y `Referidos`, más diálogo `Todos los módulos` en pantallas pequeñas.
  - **Barra Flotante Colapsable de 11 Vistas (`FloatingQuickJumpBar` dentro de `AtmosphereStage`):** Permite saltar entre las 11 vistas clave (`1. Landing` → `11. Admin`) desde superficies públicas o `/app/*`. Cuando el visitante navega con dataset redactado (`rawDataset.isServerRedactedForVisitor === true`) hacia cualquier ruta `/app*`, ejecuta automáticamente `submitBetaPin("2026", targetHref)` para desbloquear la sesión de vista previa sin fricción.
- **`packages/ui/src/platform/components/MatchTicketCard.tsx`:**
  - **`MatchTicketCard`:** Orbes de club (`<LensGlowOrbs primaryColor secondaryColor subtle />`) en tarjetas destacadas, escudos sobre `<CrestPedestal>` con color primario real de `getTeamColors(league, slug)`, píldora de marcador proyectado (`Proy. X.X – Y.Y` cuando está desbloqueado; `Proy. reservada` para visitante), motor corto + `Conf. XX`, barra `<ProbSplit>`, perforación `.ticket-perf`, marca de agua dinámica por sesión (`pl-watermark`) y acciones `+ Parlay` / `Sellar` / `Radiografía (5)`.
  - **`MultiPickRow`:** Estado redactado Cero-Fuga (`[data-locked-pick]`) frente a estado desbloqueado (`[data-unlocked-pick]`), insignias de `Pick Abierto del Día` / `Pick Semanal @sofia_nfl`, soporte de recálculo en vivo `userDecimalOverride` (actualiza `Justa / Tu momio` y `Tu ventaja` en puntos) y disparo directo a Parlay, Compositor o Boleto Compartible.

### 1.2 Vistas Nucleares de Partidos y Radiografía (`packages/ui/src/platform/club/CoreMatchViews.tsx`)
- **`JornadaClubView` (`/app`):**
  - **Spotlight asimétrico `7/5` (`lg:grid-cols-12`):** Columna `7` con lente `.glass-lens` destacado, `<LensGlowOrbs>` de los clubes local/visitante, mosaico `<CalendarSquare>` (`.sq-box` con mes abreviado y día), `<CrestPedestal size="lg">`, marcador proyectado, `<ProbSplit>`, `<NoticeCard tone="cortex">` (`PitchLab Cortex IA · Síntesis Ejecutiva Pre-Partido`) y los 2 primeros picks compactos. Columna `5` con **Auto-Armador Rápido 1-Clic** en 3 perfiles (`Conservador`, `Medio`, `Arriesgado`) + lista **Top 3 Picks Principales de la Jornada**.
  - Filtro rápido por competición (`Todas`, `Mis Ligas`, y cada una de las 7 ligas) + cartelera de 3 columnas sincronizada con el aura atmosférica al pasar el cursor (`setAuraFromGame`).
- **`MultiPicksClubView` (`/app/picks`):**
  - Barra interactiva **Geodesic v1.0 `"Probar tu momio"`** (`#picks-live-odds-input` con presets `-110`, `+105`, `1.95` y `parseUserOdds` americano/decimal) que recalcula probabilidad implícita y ventaja EV en tiempo real sobre todos los picks visibles, combinada con filtros de riesgo (`Todos`, `Escudo Conservador`, `Balanceado Medio`, `Cuota Alta · Valor`), selector de liga y toggle `Prob. ≥ 62 %`.
- **`LeagueHubClubView` (`/app/[league]`):**
  - Cabecera `.glass-lens` con `<LensGlowOrbs subtle />` y `<CrestPedestal>` (`#panel-league-name`), chips de día (`#day-chips .day-chip`), grillas separadas de encuentros próximos y cerrados `FT`, y tabla oficial de posiciones (`.standings-block` / `table.standings`).
- **`MatchStudioClubView` (`/app/[league]/games/[gameId]`):**
  - Cabecera `[data-match-studio]` con orbes de club, botón de vigilancia `Activar alerta 60m` y watermark de sesión.
  - **Fila de Inteligencia Pre-Partido en 3 columnas:** 1) *Síntesis Ejecutiva · PitchLab Cortex IA* + claves tácticas, 2) *Alineaciones y Bajas 60m* (`Confirmado XI` / `Baja` / `Duda`), y 3) *¿Dónde está el dinero?* (participación de flujo vs probabilidad del modelo).
  - **4 pestañas internas (`[data-section-tab]`):**
    - `picks` (`[data-picks]`): Diseño `7/5` con los **5 ángulos cuantitativos del partido** (incluyendo botón `Usar como mi Pick Abierto Semanal` para rol `tipster`/`admin`) + panel lateral en vivo **Debate de Suscriptores** con `<StackedAvatars>`, formulario conectado a `publishSocialPost` y bloqueo anti-links.
    - `mercados`: Matriz completa sin vig (`Geodesic v1.0`) con píldoras de grupo (`Todos`, `Resultado`, `Totales`, `Ambos Anotan / Hándicap`, `Doble Oportunidad`), probador de momio en vivo (`#studio-market-odds-input`) y botón `+ Sellar` por fila.
    - `contexto`: Factores tácticos, días de descanso previos e historial directo (`headToHead`).
    - `dinero` (`[data-market-pulse]`): Comparativa limpia de flujo de mercado vs modelo Spacetime sin exponer proveedores terceros.

### 1.3 Parlays SGP, Props Lab y Explorador de Momios (`packages/ui/src/platform/club/ParlayAndQuantViews.tsx`)
- **`ParlayBuilderClubView` (`/app/parlays`):**
  - **Auto-Armador Cuantitativo en 4 pasos numerados:** `1. Ligas`, `2. Riesgo`, `3. Selecciones 2–6` (pills + stepper `− / +`) y `4. SGP (Mismo Partido)` con `<Switch>` HeroUI + CTA `[data-generate-parlay]`.
  - **Catálogo manual con bloqueador explícito de contradicciones:** Evalúa `checkParlayCompatibility` en vivo y rotula el motivo exacto de bloqueo (`Mismo partido — activa SGP`, `Mercado contradictorio`, `Máx. 2 SGP por partido`).
  - **Boleto Combinado PitchLab (sticky perforado):** Stepper de unidades (`0.50u–5.00u`), input opcional de cuota total de casa (`#parlay-book-odds-input`), aviso `<NoticeCard>` cuando hay correlación SGP activa, 4 métricas (`Prob. Conjunta Real`, `Momio Combinado`, `Justa Geodesic`, `Retorno`) y botones `Exportar boleto` / `Sellar Parlay`.
- **`PropsLabClubView` (`/app/props`):**
  - Tarjetas `[data-prop-card]` con `<LensGlowOrbs primaryColor={teamColor} subtle />` y `<CrestPedestal>`, scrubber de línea alternativa `− / +` (`[data-prop-line]`) con reset instantáneo `Base`, gráfica de barras `L10` / `L5` coloreada según acierto frente a la línea activa, probabilidades Over/Under dinámicas (`evaluatePropLineProbability`), calculadora Geodesic por tarjeta (`Tu momio Over`) y sellado en 1 clic (`sealPickToJournal`).
- **`MomiosExplorerClubView` (`/app/momios`):**
  - Tabla comparativa con filtro por liga y toggle `Solo Ventaja Positiva`, mostrando `Apertura`, `Actual Casa` con insignias de movimiento de línea (`↓ dinero entra` / `↑ valor`), `Justa Geodesic`, `Ventaja` en puntos y acciones rápidas `+ Parlay` / `Sellar`.

### 1.4 Comunidad VIP, Portal Tipster, Bitácora, Cuenta y Admin (`SocialAndTipsterViews.tsx`, `LedgerAccountAdminViews.tsx`, `PlatformOverlays.tsx`)
- **`SocialVipClubView` (`/app/social` en `SocialAndTipsterViews.tsx`):**
  - Cabecera con `<StackedAvatars>` y `.seg-well` de 3 pestañas: `Boletos & Debate`, `Consenso vs. Suite` y `Ranking CLV (IC 95 %)`.
  - **Feed en 2 columnas (`8/4`):** Compositor `.glass-lens` con selector de partido, toggle de origen (`Spacetime Suite` | `Bitácora Propia`) y filtro anti-links (`t.me`, `wa.me`, URLs) que despliega `p[role="alert"]` e incrementa `blockedSpamAttempts`; tarjetas de boleto con `.ticket-perf`, botón `+ Llevar a mi bitácora`, contador `Útil` (`flame`) e hilos de comentarios inline; sidebar sticky con `<NoticeCard>` Zero-Noise, vista rápida Top CLV (`/app/u/[handle]`) y `<GlassActionRow>` de Referidos `+15d`.
  - **Consenso vs. Suite y Ranking CLV:** Barras duales de probabilidad con badge `Convergencia Suite + VIP` / `Divergencia Contrarian`, y tabla IC 95 % con selectores `Temporada` / `30 días` y `CLV Medio` / `Unidades` (elegibilidad `≥ 30 picks`, cero premios monetarios).
- **`TipsterPortalClubView` (`/app/tipster` en `SocialAndTipsterViews.tsx`):**
  - 4 mosaicos KPI (`SOFIA5`, `38 socios`, `$2,840 MXN`, `1 / 1 disp.`), configurador `.glass-lens` en 4 pasos (`Pick Oficial Spacetime Suite` vs `Pick Propio de mi Bitácora`, partido, elección de 1 de los 5 picks dejando los otros 4 cerrados, y tesis social), botón `Generar Boleto 4:5 / 9:16 con mi Código →`, vista previa viva `.share-ticket-card` (`Post 4:5` / `Story 9:16` con `CÓDIGO: SOFIA5 · 5 DÍAS GRATIS`), y simulador nativo `<TopLayerModalDialog>` **`Simular vista visitante (/p/sofia-sem)`** (muestra 1 pick abierto + 4 hermanos blindados).
- **`LedgerAccountAdminViews.tsx`:**
  - **`HistorialClubView` (`/app/historial`):** Tira pública de 4 KPIs de auditoría (`Encuentros liquidados FT`, `Picks principales cumplidos`, `Desviación de calibración ECE 0.009`, `0 editados · 0 picks editados o borrados`) + filtros `Todos` / `Cumplidos` / `No cumplidos` y liga.
  - **`BitacoraClubView` (`/app/lab`):** 4 lentes KPI (`Balance en unidades`, `CLV Promedio`, `Acierto resuelto`, `En vigilancia 60m`), `Compartir Récord 4:5 / 9:16`, `Exportar Bitácora CSV`, `<Switch>` `Mostrar mi récord en perfil VIP`, tabla inmutable de boletos sellados y módulo `Partidos en Vigilancia 60m` (`+ 60m`).
  - **`AnalystProfileClubView` (`/app/u/[handle]`):** Resuelve Tipsters (`sofia_nfl`, `carlos_quant`, `diego_tactico`) y socios (`jair`, `jair_founder`, `socio_pl`) con hero `.glass-lens`, 4 métricas verificadas y feed auditado.
  - **`AccountReferralsClubView` (`/app/account`):** 4 pestañas `.seg-well`: 1) `Referidos (+15 días)` activa por defecto (mantiene `[data-referrals-card]`, `[data-referral-friends]`, `[data-referral-days]`, `[data-simulate-referral]` visibles en el primer render + **Barra de Progreso Embajador 5 amigos** para `+30d extra`); 2) `Pase Total` (`$299 MXN` mensual vs `$2,390 MXN` anual); 3) `Preferencias` (simulador de unidad base `$100`–`$1,000 MXN`, perfil de riesgo, ligas prioritarias y `<Switch>` `Modo Pausa Social`); 4) `CFDI 4.0` (RFC, CP Fiscal, Razón Social y regímenes SAT `601`, `612`, `626`, `605`).
  - **`FounderAdminClubView` (`/app/admin`):** Lente destacado con `<Switch>` **Mes 1 Lanzamiento Sin Tarjeta (`$0 OAuth`) vs Mes 2 Verificación `$0.00 MXN`**, 4 KPIs operativos (watermarks `100 %`, spam bloqueado, referidos activos, partidos en snapshot), tabla emisora de códigos promocionales Tipster (`25 %` comisión / `5d` gratis) y telemetría de los 5 motores `Spacetime Suite v2.1` con botón interactivo `Ejecutar reentrenamiento post-jornada`.
- **`PlatformOverlays.tsx`:**
  - **`TopLayerModalDialog`:** Basado en `<dialog closedby="any">` nativo con `showModal()` en Top-Layer y guard `e.target !== dialog` para light-dismiss seguro.
  - Modales globales conectados en `AtmosphereStage`: `ParlayFloatingDock` (`[data-parlay-dock]`), `PickComposerModal` (toggle `Cuota observada` / `Manual`, presets `Justa` / `Mercado` / `Valor +5%`, stepper `0.25u–5.0u`, badge `CLV / EV` en vivo y `Sellar en Bitácora`), `ShareTicketModal` (`4:5 Feed` / `9:16 Stories` con `canRevealPickOnShare` que encripta selecciones pre-kickoff salvo `FT` o promo semanal Tipster), `AlertsDrawer` (`AlertsModal`), `CommandPaletteModal` (`⌘K` sobre partidos, 7 ligas, Tipsters y las 12 vistas del Club), `BetaPinModal`, `RoleSimulatorBar` y `ToastViewport`.

---

## 2. Dónde nos quedamos

### 2.1 Hidratación SSR de Snapshots vs Estado Cliente en `PlatformProvider`
- **Frontera SSR Cero-Fuga (`apps/web/src/server/platform-data.ts`):**
  - `buildServerRawPlatformDataset()` ensambla los snapshots reales de las 7 ligas (`PRODUCT_LEAGUES`) mediante `buildPlatformDataset`.
  - `loadPublicPlatformState()` valida la cookie firmada de sesión (`verifyBetaCookieToken`); si no existe sesión activa, aplica `redactDatasetForVisitor` en el servidor antes de serializar props a React (dejando únicamente 1 Pick Abierto del Día en `/` y 1 Pick Semanal en `/p/[slug]`).
  - `loadClubPlatformState()` alimenta todas las rutas `/app/*` (protegidas además por `apps/web/middleware.ts`).
- **Persistencia actual en `PlatformProvider` (`packages/ui/src/platform/platform-provider.tsx`):**
  - **Persistido en `window.localStorage`:**
    - `pl-odds-fmt` (`"american"` | `"decimal"`)
    - `pl-risk-pref` (`"conservador"` | `"medio"` | `"arriesgado"`)
    - `pl-fav-leagues` (arreglo JSON de `LeagueId`)
    - `pl-month1-nocard` (`"1"` Mes 1 sin tarjeta | `"0"` Mes 2 tarjeta `$0 MXN`)
    - `pl-sim-role` (`"visitor"` | `"member"` | `"tipster"` | `"admin"`, cuando `allowRoleSimulation` está activo)
  - **Estado reactivo en memoria de sesión (listo para conectarse a F4 Postgres):**
    - `journal` (sembrado determinísticamente desde partidos `FT`/`NS` vía `seedInitialJournal` + nuevos sellados de picks, props, parlays o copias desde Comunidad VIP; exportable en CSV real con `Blob`).
    - `parlayLegs`, `allowSgp`, `parlayStakeUnits` y `parlaySummary` (`computeParlaySummary`).
    - `socialPosts` (`INITIAL_SOCIAL_POSTS`), `blockedSpamAttempts`, `watchlistGameIds`, `referralPaidFriends`, `tipsterWeeklyPickOrigin` y `selectedTipsterPickId`, además de controles locales en `AccountReferralsClubView` (datos `CFDI 4.0`, unidad base MXN, pausa social) y `FounderAdminClubView` (`promoRows`).

### 2.2 Selectores E2E y Compuertas Estáticas Verificadas
- **Contratos `data-*` y ARIA preservados al 100 % para Playwright (`apps/web/e2e/pre-mvp.spec.ts` y `apps/web/e2e/app-home.spec.ts`):**
  - Partidos y Estudio: `#panel-league-name`, `#day-chips`, `.day-chip`, `.standings-block`, `table.standings`, `[data-game-card]`, `[data-locked-pick]`, `[data-unlocked-pick]`, `[data-match-studio]`, `[data-section-tab]`, `[data-picks]`, `[data-market-pulse]`, `.league-tab[data-league]`.
  - Quant, Comunidad y Crecimiento: `[data-generate-parlay]`, `[data-parlay-dock]`, `[data-prop-card]`, `[data-prop-line]`, `p[role="alert"]` en filtro anti-spam, `[data-share-ticket]`, `[data-referrals-card]`, `[data-referral-friends]`, `[data-referral-days]`, `[data-simulate-referral]`, `.pin-dialog`, `button.pin-key[data-pin-digit]` y `[data-quick-jump-bar]`.
- **Estado de verificación técnica:**
  - `pnpm --filter @pitchlab/ui typecheck`, `pnpm --filter @pitchlab/ui test` y `node scripts/lint-codebase.mjs` pasan con **0 errores** (`0` colores hex fuera de `packages/tokens` y `0` bloques `catch` vacíos).
  - **Nota importante de corte de sesión:** La corrida en vivo de Chromium E2E y auditoría visual cuadro por cuadro sobre `http://localhost:8787` se pausó por indicación directa del fundador para cerrar la sesión actual, subir todo a `gemini-reestructura` y retomar desde casa con Claude.

---

## 3. Qué falta (Checklist accionable para la sesión en casa con Claude)

### Bloque A · Verificación E2E en vivo y Paridad Visual 1:1 (Prioridad inmediata al abrir en casa)
- [ ] Levantar o reutilizar el servidor con `PREVIEW_ACCESS_CODE=2026` y ejecutar `pnpm e2e` (`playwright test` sobre `apps/web/e2e/pre-mvp.spec.ts` y `apps/web/e2e/app-home.spec.ts`), confirmando **0 violaciones `@axe-core/playwright` (WCAG 2.1 AA)** en temas oscuro y claro y **0 desborde horizontal** de `375px` a `1440px`.
- [ ] Abrir lado a lado `design/prototipo-maestro/prototipo-maestro-pitchlab.html` y `http://localhost:8787` (usando la barra flotante `11 Vistas Maestro` con auto-unlock PIN `2026`) para inspeccionar micro-detalles visuales en las rutas `/app`, `/app/picks`, `/app/[league]`, `/app/[league]/games/[gameId]`, `/app/parlays`, `/app/props`, `/app/momios`, `/app/social`, `/app/tipster`, `/app/historial`, `/app/lab`, `/app/u/sofia_nfl`, `/app/account` y `/app/admin`, así como todos los `<dialog>` de `PlatformOverlays.tsx`.

### Bloque B · Descarga Real PNG / WebP del Boleto Compartible (`4:5` y `9:16`)
- [ ] Reemplazar el toast simulado de `handleDownloadTicket` en `ShareTicketModal` (`packages/ui/src/platform/components/PlatformOverlays.tsx`) y el botón `Descargar PNG` en `TipsterPortalClubView` (`packages/ui/src/platform/club/SocialAndTipsterViews.tsx`) por rasterización real en cliente (Canvas 2D / SVG `foreignObject` o `modern-screenshot` sin dependencias pesadas) o ruta OG/Satori en resoluciones exactas **`1080×1350` (`4:5 Feed`)** y **`1080×1920` (`9:16 Stories`)**.
- [ ] Garantizar que el PNG/WebP exportado preserve el logo oficial oscuro, los orbes de club, el watermark de sesión (`PL-XXXX`), el código promocional (`SOFIA5` o referido socio) y la regla `canRevealPickOnShare` (selección encriptada antes del kickoff salvo Pick Abierto Semanal de Tipster o partido finalizado `FT`).

### Bloque C · Persistencia Backend e Integraciones de Fase F4 (Postgres / Drizzle + Pagos + Fiscal)
- [ ] **`sealed_picks`:** Tabla inmutable en Postgres/Drizzle con hash SHA-256 pre-kickoff, bloqueo estricto de edición/borrado tras el inicio, liquidación automática contra marcadores `FT` y cálculo auditado de `CLV` contra cuota de cierre Geodesic.
- [ ] **`parlays`:** Persistencia de combinadas de 2 a 6 selecciones (`legs`, factor de correlación SGP aplicado, cuota observada vs cuota justa y unidades simuladas).
- [ ] **`social_posts` y comentarios:** Persistencia de hilos de Comunidad VIP y Debate del Partido con validación anti-links en servidor (`containsExternalLink`), hidratación del récord verificado (`CLV` / unidades con `≥ 30` picks para el Leaderboard IC 95 %) y respeto al `Modo Pausa Social`.
- [ ] **`referrals`:** Ledger transaccional de Referidos Doble Vía (`7d gratis + 30 % off` al invitado; acreditación bilateral automática de `+15 días` al liquidarse la 1.ª factura pagada; bono `+30 días` e insignia Embajador al 5.º amigo pagado).
- [ ] **`tipster_codes` y asignaciones semanales:** Persistencia del cupo `1 / 1` Pick Abierto Semanal por creador (`/p/[slug]`), atribución de códigos de `5 días gratis` (`SOFIA5`, etc.) y libro mayor del `25 %` de comisión recurrente.
- [ ] **`cfdi_profiles`, Stripe MX y Facturapi CFDI 4.0:** Tabla fiscal (`RFC`, `CP Fiscal`, `Razón Social`, régimen SAT `601`/`612`/`626`/`605`), integración de Stripe MX Checkout/Billing gobernada por la bandera `month1NoCardMode` (Mes 1 OAuth sin tarjeta + huella anti-abuso `$0` vs Mes 2 `SetupIntent` `$0.00 MXN`) y webhooks de timbrado automático PDF + XML vía Facturapi.
