# Patrones de interacción y movimiento

> **Propósito:** cómo se comporta cada interacción aprobada en D1. La implementación debe reproducir estos tiempos y estados.
> **Referencia viva:** `design/d1/assets/*.js`. **Consumidores:** agentes de UI y QA.

## 1. Movimiento global

| Elemento | Animación | Duración / curva |
|---|---|---|
| Entrada de página (hero, encabezado de liga) | Fade + `translateY(16px)` escalonado (0, 60, 120, 180, 260 ms) | 640 ms `--ease-out` |
| Revelado al hacer scroll (`.reveal`) | Fade + `translateY(12px)` con IntersectionObserver (umbral 0.15), escalonado de 60–90 ms | 520 ms |
| Trayectoria del hero | `stroke-dashoffset` de 1400 → 0, una vez | 2.4 s |
| Mascota | Flotación de ±8 px | 6 s en bucle (2.4 s en la traza de cálculo) |
| Barras de probabilidad | Ancho de 0 → valor, escalonado de 25 ms | 700 ms |
| Porcentajes | Conteo de 0 → valor (ease-out cúbico) | 650 ms |
| Tarjeta de partido (hover) | Sube 3 px más sombra; «Analizar →» aparece | 180 ms |
| Botón primario (hover) | Anillo `--glow` de 4 px y la flecha avanza 3 px | 120 ms |
| Barra flotante | Entra desde −12 px; se compacta (60 → 54 px) tras 24 px de scroll | 600 / 180 ms |
| Indicadores de frescura y beta | Pulso de opacidad | 2.4 s en bucle |
| Cambio de tema | Transición de fondo y color | 180 ms |

**Movimiento reducido** (`prefers-reduced-motion`): sin desplazamientos ni bucles, sin traza de cálculo (se muestra el resultado) y sin conteos (valor final directo). Todo sigue siendo legible.

## 2. Análisis de partido (modal con traza de cálculo)

1. **Clic en una tarjeta:**
   - Se abre `<dialog>` modal: el fondo se oscurece y se desenfoca (180 ms) y la ventana pasa de `translateY(12px) scale(.975)` a su lugar (240 ms).
   - La URL cambia a `#liga/partido`.
2. **Traza de cálculo** (solo si el partido no ha terminado y no hay movimiento reducido):
   - Radar con su tableta, el título «Calculando {local} vs {visitante}» y una barra de progreso.
   - **6 pasos con valores reales**, uno cada 230 ms: sincronización con su hora de corte, fuerza de ataque y defensa, ajuste por localía y muestra, proyección, escenarios evaluados y mercados listos.
   - Cada paso entra con un spinner y pasa a check al llegar el siguiente. Debajo hay un esqueleto de tabla.
   - «Saltar →» termina la traza de inmediato.
   - Si el partido ya se calculó en la sesión, la traza dura 70 ms por paso.
   - **Los pasos nunca nombran proveedores ni algoritmos** (FD-16).
3. **Resultado:**
   - Encabezado del partido (emblemas, proyección y barra 1X2).
   - La tabla de mercados se anima (barras más conteo). La fila líder de cada grupo va en Pulso y la de «Resultado» lleva la etiqueta «Favorito».
   - A la derecha: marcador más probable, «Compara con tu cuota» y factores del modelo.
   - Pie: «Modelo PitchLab · en validación», hora de corte y «No garantiza resultados».
4. **Interacción en el resultado:**
   - Clic, Enter o Espacio en una fila la selecciona (`aria-pressed`) y actualiza la comparación sin volver a animar la tabla.
   - La cuota acepta decimal (2.10) o americana (+110 / −150) y muestra la probabilidad implícita y la diferencia en puntos porcentuales. **No se guarda.**
5. **Cierre:** con ×, clic fuera o Escape. Anima la salida (200 ms), restablece la URL a `#liga` y devuelve el foco a la tarjeta de origen.
6. **Foco:** al abrir y al cambiar de fase, el foco va a la ventana (`tabindex="-1"`), sin anillo visible en ella.
7. **Partido finalizado:** sin traza. Muestra el marcador final, la proyección previa y la etiqueta «Análisis publicado antes del partido · sin cambios».

## 3. Acceso a la beta (PIN)

1. «Entrar a la beta» (en el login, la landing o crear cuenta con `#beta`) abre el diálogo del PIN: Radar, «Beta privada», «Código de acceso», 4 casillas y teclado 3×4 (1–9, borrar todo, 0, borrar un dígito).
2. **Entrada:** clic o teclado físico (dígitos y Retroceso). La tecla se hunde (scale .92). La casilla se llena con un rombo (180 ms). La casilla activa lleva el anillo `--glow`. Un `role="status"` anuncia «N de 4 dígitos».
3. **Al completar los 4 dígitos** se valida:
   - **Error:** sacudida de 420 ms y casillas en rojo con «Ese código no es. Revisa con quien te invitó.»; se limpia a los 650 ms.
   - **5 errores:** teclado deshabilitado 30 s.
   - **Éxito:** casillas en verde, Radar salta, «Listo. Bienvenido a PitchLab.», barra de progreso de 900 ms y redirección a `next` (por defecto el panel, conservando la liga pedida).
4. **Producción** (FD-17): la validación ocurre en el servidor (`PREVIEW_ACCESS_CODE`), con cookie HttpOnly firmada y límite de intentos por IP. El prototipo compara un hash en el navegador solo como vitrina.
5. **Panel protegido:** sin acceso redirige a `login.html?next=…`. «Salir» borra el acceso.

## 4. Navegación y filtros

- **Barra flotante (sitio):** el enlace de la sección visible se marca con un rombo debajo. En móvil solo quedan logo, tema y «Entrar» (o también «Crear cuenta» desde 480 px).
- **Selector de liga (panel):** cambia `#liga`, resetea el filtro de día y vuelve a renderizar el encabezado (con la mascota de la liga) y las tarjetas (con entrada escalonada). Las ligas «Pronto» quedan deshabilitadas.
- **Filtro de día:** chips con contador, pegajosos bajo el header. «Toda la jornada/semana» por defecto.
- **Demo de la landing («Con PitchLab»):** 3 partidos en chips. Al elegir uno se muestra una traza corta (5 pasos, 130 ms) y luego la tabla con barras.

## 5. Formularios bloqueados (login y crear cuenta)

- `fieldset disabled` con opacidad .55 y cursor `not-allowed`. Un aviso informativo explica cuándo abren. El CTA activo de la página es «Entrar a la beta».
- La fecha de nacimiento y la casilla de 18+ ya están en el diseño (cumplimiento C-07), aunque deshabilitadas.

## 6. Estados vacíos y de error

- **Vacío:** Radar (`radar`), una frase y una acción («Ver toda la jornada»).
- **Sin acceso a crypto** (abrir el prototipo por `file://`): mensaje para abrirlo desde el servidor.
- **Errores de datos (implementación):** `ErrorState` con reintento, sin cifras inventadas.
