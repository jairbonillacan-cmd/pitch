# ADR-044: Rediseño mobile-first de Perfil, Preferencias agrupadas, Tablas compactas (`<FormSquares>`), Calendario vivo y Consola Admin

- **Estado:** Aceptada
- **Fecha:** 2026-11-19
- **Contexto:** Tras revisar capturas reales del producto en móvil y escritorio, se identificaron seis áreas con fricción visual o redundancia estructural: (1) el bloque de `Insignias` ocupaba demasiado espacio en el cuerpo del perfil y existía duplicidad entre `Ver mi perfil` y `Mi récord`; (2) `Invitar amigos` aparecía tanto en el menú de perfil como antes de `Mi plan` en `Mi cuenta`; (3) `Preferencias` carecía de una entrada rápida agrupada para Idioma, Cuotas, Casas habituales, Soporte, Comunidad (Telegram), Legal, Cerrar sesión y Zona de peligro; (4) la tabla de clasificación mostraba mucho relleno vertical, recuadros grises de fondo en líderes y una cápsula gris detrás de `Últimas 5`, además de una pestaña `Equipos` redundante en ligas con tabla; (5) el calendario mensual saltaba a fechas a más de 30 días sin mostrar conteo/live por celda; y (6) la consola `/app/admin` necesitaba generación en lote de códigos de un solo uso con días configurables, bandeja de feedback/soporte/bajas y visor de auditoría.

## Decisión

1. **Cinco nuevos componentes atómicos en `@pitchlab/ui` (con stories en tema oscuro y claro en `atomic-club-v2.stories.tsx`):**
   - `<FormSquares>`: renderiza `Últimas 5` como cuadros redondeados independientes (`G` verde, `E` ámbar, `P` rojo) con contraste WCAG AA mediante los tokens `--pl-pill-*-bg/fg/border`, eliminando la cápsula gris anterior.
   - `<SettingsGroup>` y `<SettingsRow>`: filas agrupadas estilo nativo (`min-height: 54px`, objetivos táctiles `≥ 44 px`, separadores con sangría) para `Preferencias` y cuenta.
   - `<BadgePickerDialog>`: modal nativo `<dialog closedby="any">` (con respaldo `pointerdown`/`pointerup` y `overscroll-behavior: contain`) abierto desde el botón compacto `Insignias` junto a `<FeaturedBadgeRow>` en la cabecera del perfil, permitiendo elegir hasta 3 insignias destacadas en perfil propio.
   - `<LeagueCategorySheet>`: hoja inferior en móvil (`< 768 px`) / modal centrado en escritorio para explorar las 57 competencias agrupadas por región con búsqueda y filtro «Ver en pausa».
   - `<FeedbackSupportDialog>`: modal nativo para `Feedback e ideas`, `Contactar con soporte` (envío a `POST /api/me/feedback` → DB + correo), `Comunidad de Telegram` (`NEXT_PUBLIC_TELEGRAM_URL` o aviso honesto) y `Eliminar cuenta` (`POST /api/me/deletion-request`, enfocando primero el botón seguro `Cancelar`).
2. **Separación limpia de Perfil (`/app/u/[handle]`) vs. Mi récord (`/app/lab`), Menú y Cuenta (`/app/account`):**
   - El perfil propio elimina el bloque inline de `Insignias` y la pestaña duplicada `Estadísticas`, reemplazándola por un acceso directo limpio hacia `/app/lab` (espacio privado de bitácora, banca MXN y privacidad).
   - En `Mi cuenta`, el orden de pestañas pasa a ser **1. `Mi plan`** (por defecto), **2. `Invitar amigos`**, **3. `Preferencias`**. El menú desplegable de usuario retira `Invitar amigos` y la opción inactiva `Facturación`.
   - `PlanTab` y `InviteTab` reciben mejoras mobile-first (guía de 3 pasos SPEI, atajo `Canjear cupón`, franja de 3 beneficios en `Invitar amigos`).
   - `/app/historial` y `/app/momios` adoptan tarjetas KPI responsivas, filtros por ligas activas (30 días), etiquetas personales de casas (`Caliente`, `Codere`, `Bet365`, `Betcris`, `Novibet`, `Betway`, `Playdoit`, `Pinnacle`, desacopladas de fuentes y nunca presentes en URLs) y adición en 1 toque a Parlay.
3. **Clasificación compacta, pestaña `Equipos` inteligente y Calendario vivo:**
   - `.pl-st-row td` reduce su padding a `4px 6px`, elimina el fondo gris de `.pl-st-row.is-leader` y sustituye la cápsula gris por `<FormSquares size="sm" />`.
   - La pestaña `Equipos` se oculta automáticamente en ligas con tabla general (`standings.length > 0 && !isKnockoutCup`) y se conserva con tarjetas enriquecidas solo en copas de eliminación directa o torneos sin tabla.
   - El calendario mensual de `Inicio` muestra conteo de partidos y punto verde `En vivo` por día, distingue días solo con finalizados y acota el salto rápido «Próxima acción» a la ventana de 30 días.
4. **Endurecimiento y ampliación del Panel Admin (`/app/admin`):**
   - Protección en profundidad mantenida: `404` (`notFound()`) en servidor para cualquier usuario no admin en producción (`previewToolsEnabled` requiere `isAdmin` en `NODE_ENV === "production"`), y `requireAdmin` + CSRF + rate limit + `Cache-Control: no-store` en todas las rutas `/api/admin/*`.
   - Nuevas capacidades sobre la tabla inmutable `admin_audit_logs` (sin migración bloqueante): generador en lote de 1–50 cupones de 1 uso con días configurables (`POST /api/admin/coupons/batch`, copia en bloque y exportación CSV sanitizada; `maxRedemptions = 1` por defecto en el formulario individual), pestaña **Bandeja** (`GET`/`PATCH /api/admin/inbox` para Feedback, Soporte y Solicitudes de baja) y pestaña **Auditoría** (`GET /api/admin/audit`).

## Alternativas descartadas

- **Crear una tabla SQL separada para `support_messages` antes de validar volumen:** descartado para no bloquear el despliegue con nuevas migraciones; reutilizar `admin_audit_logs` con acciones tipadas (`member_feedback`, `member_support_contact`, `member_deletion_request`, `admin_inbox_resolved`) otorga trazabilidad inmutable inmediata.
- **Usar modales custom con `div` y bloqueo manual de scroll (`overflow: hidden` en `body`):** descartado por `modern-web-guidance` a favor de `<dialog closedby="any">` en el Top Layer con `overscroll-behavior: contain` y `backdrop` sin `backdrop-filter` (`ADR-035`).

## Consecuencias

- Mayor densidad informativa en móvil sin pérdida de objetivos táctiles (`≥ 44 px`), cero colores hex fuera de `packages/tokens` y cero `backdrop-filter`.
- La consola del fundador centraliza pagos SPEI, socios, lotes de cupones de 1 uso con quién los canjeó, moderación de Comunidad, bandeja de soporte/bajas y auditoría de seguridad en una sola ruta protegida.
