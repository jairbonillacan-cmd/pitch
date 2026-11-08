# D1 · Revisión de diseño base (landing + panel)

> **Propósito:** prototipos del diseño base para aprobación del fundador antes de implementar (pre-MVP y prompt 00).
> **Estado:** iteración 4 · ⏳ pendiente de aprobación final · **Fecha:** 2026-11-08
> **Prototipos:** `design/d1/landing.html`, `login.html`, `signup.html` y `panel.html` (el panel pide el código de socio). Abrir con un servidor desde la raíz del repo: `python -m http.server 4173` → `http://localhost:4173/design/d1/landing.html`.

## 0. Iteración 4

| Pedido | Resolución |
|---|---|
| Quitar «datos de ejemplo» y poner «Beta cerrada» | ✅ Las etiquetas de ejemplo ahora dicen «Beta cerrada» (hero, demo y encabezado del panel). Nota: en el prototipo los números siguen siendo ilustrativos; en el pre-MVP serán reales. |
| Reglas que nos blinden sin hablar mal de nosotros | ✅ Ahora es «Nuestro compromiso · Claros desde el inicio»: *Información para decidir* (la decisión es tuya), *No somos casa de apuestas* (no recibimos apuestas ni manejamos dinero), *Historial íntegro* (se publica antes del partido y queda tal cual) y *Solo mayores de 18* (moderación). Se quitó «Todo con fecha». |
| Que todo se vea muy bien en móvil | ✅ Revisión de las 4 páginas a 390 px: hero apilado con Radar visible, partidos de la demo en una fila deslizable, escudo visitante arriba del nombre, recorrido y tarjetas del modelo compactos, cierre con Radar a un lado, footer en 2 columnas, login y crear cuenta con un bloque visual compacto, se corrigió un desbordamiento horizontal en crear cuenta (campo de fecha) y se ocultó el texto del teclado físico en pantallas táctiles. Verificado sin scroll horizontal en landing, login, crear cuenta y panel. |

## 0b. Iteración 3 (decisiones del fundador)

| Pedido | Resolución |
|---|---|
| Login y crear cuenta, bloqueados por ahora | ✅ `login.html` y `signup.html` con los formularios deshabilitados y el aviso «las cuentas abren pronto». |
| «Entrar a la beta» con PIN | ✅ Teclado de 4 dígitos con Radar, casillas con rombo de marca, soporte de teclado físico y animaciones de pulsación, error (sacudida en rojo) y éxito (verde, barra y redirección al panel en la liga pedida). Máximo 5 intentos y bloqueo de 30 s. El panel redirige al login si no hay acceso y tiene «Salir». **Prototipo:** el código se compara por hash en el navegador solo para la vitrina; en producción se valida en el servidor (FD-17). |
| Landing inspirada en la barra flotante de Hubly | ✅ Barra flotante tipo píldora (se compacta al hacer scroll y marca la sección activa) con «Entrar» y «Crear cuenta». Encabezados de sección centrados con eyebrow. Narrativa «Sin PitchLab / Con PitchLab» (chat de grupo frente a la demo interactiva), «Un sábado cualquiera» con horas y «El modelo». Textos más cortos y concretos. |
| No mostrar fuentes ni el motor | ✅ Se quitaron de la UI los proveedores y los nombres de algoritmos. La traza de cálculo muestra pasos reales, pero genéricos («fuerza de ataque y defensa», «proyección de goles», «evaluando 121 marcadores»). Etiqueta «Modelo PitchLab · en validación». La atribución de licencias va en «Créditos y licencias» (FD-16). **No** se menciona ML ni IA hasta que el modelo los use. |
| Scrollbars mejores | ✅ Delgadas, con degradado Pulso y extremos redondeados, en los dos temas. |
| Barras de probabilidad con estilo PitchLab y favorito claro | ✅ Barra con marcas al 25/50/75 % y relleno con **corte a 45°** (motivo del isotipo). El favorito de cada grupo va en Pulso con la cifra en negritas y la etiqueta «Favorito»; el resto queda atenuado. La barra 1X2 ahora resalta solo el segmento líder, con separadores en diagonal. |

## 1. Decisiones del fundador (iteración 2)

| Pedido | Resolución |
|---|---|
| Panel con tarjetas (propuesta B) | ✅ Adoptado. Se eliminó la propuesta A. |
| Al hacer clic, animación de recopilar datos y calcular | ✅ Traza de cálculo **con los valores reales de cada paso** (fuente y hora, tasas de ataque y defensa, regresión, goles o puntos esperados, distribución y mercados), con barra de progreso y esqueleto de la tabla. Dura ~1.5 s la primera vez y ~0.5 s si ya se calculó en la sesión. Se puede saltar («Saltar») y se omite con `prefers-reduced-motion` o en partidos finalizados. |
| Modal de ventana en lugar del panel lateral | ✅ `<dialog>` nativo centrado (máximo 960 px). Entra con fade y escala. Cierra con ×, clic fuera o Escape, y el foco vuelve a la tarjeta. En móvil ocupa la pantalla completa. |
| Versión oscura y clara | ✅ Botón de tema en el header. Respeta la preferencia del sistema y la recuerda. El oscuro usa los tokens oficiales. El claro es una **propuesta derivada de la marca** (Iris + Tinta sobre Blanco y Hielo). Contraste verificado: texto 18.9 / 9.5 / 5.9:1, Iris 7.5:1, contornos 3.6:1. |
| Mejores animaciones en toda la página | ✅ Entrada escalonada del hero, trayectoria «Campo de corte» que se dibuja, Radar flotando, tarjetas que aparecen al hacer scroll, barras que crecen y porcentajes que cuentan, hover con elevación y flechas que avanzan, pulso en los indicadores de frescura. Todo se apaga con movimiento reducido. |
| Mejor landing y menos texto | ✅ Rehecha: hero con una línea de propuesta, «Escoge tu liga» con la mascota de cada liga, demo interactiva «Así se lee un partido», 4 «Reglas de la casa» de una línea cada una y un cierre corto. Se quitaron los párrafos explicativos. |
| Mascota donde haga falta | ✅ Radar (`pitchlab-brand/mascot/web/`): con tableta en el hero, en la traza de cálculo y en los estados vacíos; con el uniforme de cada liga en las tarjetas de liga y en el encabezado del panel; con la edición de fútbol en el cierre. |

Además se integraron los **emblemas de NFL** que entregó GPT (`pitchlab-brand/american-football/nfl-2026/`). Ya no hace falta el fallback para NFL.

## 2. Verificación hecha

- **Landing:** 1440 px y 390 px, en tema oscuro y claro. Sin scroll horizontal ni errores de consola.
- **Panel:** cambio de liga, filtro por día, clic → traza → análisis, filas de mercado y comparación con cuota (`+120` → implícita y diferencia), cierre con Escape y devolución del foco. Probado en 1440 px oscuro y claro y en 390 px.
- **Ajustes hechos tras revisar:** espaciado de los pasos, foco al abrir el modal (va a la ventana, no al botón ×), la tabla ya no se estira en el modal, la barra 1X2 se ajusta en móvil y el CTA del header móvil tiene nombre accesible.
- **No verificado:** axe y Lighthouse automatizados, lector de pantalla real y Safari iOS. Quedan para la implementación (`QUALITY_GATES.md`).

## 3. Contrato de diseño propuesto (a promover a `DESIGN_SYSTEM.md` al aprobar)

- **Temas:** oscuro por defecto según la marca; claro opcional. Todos los colores salen de tokens (se agregan `--on-primary` y `--glow` como tokens derivados).
- **Movimiento:** entradas de 520 ms con desplazamiento de 12 px y escalonado de 60–90 ms, modal de 240 ms, hover de 120 ms, todo con `--ease-out`. Barras de 700 ms y conteos de 650 ms. Traza de cálculo de 230 ms por paso (70 ms al repetir).
- **Mascota:** Radar con tableta para estados de sistema (calculando, vacío); edición de la liga en contextos de liga; tamaño de 160–520 px; siempre decorativa (`alt=""`) y nunca tapando datos.
- **Anti-defaults:** sin «LIVE» ni «tiempo real» sobre datos estáticos, sin «pick del día», montos ni porcentaje del bank, sin gradientes decorativos (el único brillo es el halo detrás de Radar, por legibilidad sobre fondo oscuro).

## 4. Pendiente tras la aprobación

1. Promover el contrato a `docs/design/DESIGN_SYSTEM.md`, `INTERACTION_PATTERNS.md` y `RESPONSIVE_RULES.md`.
2. Validar con la marca la paleta del tema claro y los tokens nuevos (`--on-primary`, `--glow`).
3. Implementar en el pre-MVP (`PRE_MVP.md` §9, paso 6) con datos reales.
