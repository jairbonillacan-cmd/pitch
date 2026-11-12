# Reglas responsive

> **Propósito:** cómo se adapta cada superficie aprobada. Lo verificado en D1 está a 390, 1024, 1280 y 1440 px, sin scroll horizontal (`scrollWidth === innerWidth`).
> **Consumidores:** agentes de UI y QA (snapshots en 375 / 768 / 1200 / 1440, `QUALITY_GATES.md`).

## 1. Breakpoints

| Rango | Columnas y márgenes (marca) | Notas |
|---|---|---|
| < 480 | 4 col · margen 16 | Teléfonos chicos: «Crear cuenta» sale de la barra; formularios a 1 columna |
| 480–767 | 4 col · margen 16 | Teléfonos |
| 768–1023 | 8 col · margen 24 | Tablet vertical |
| 1024–1199 | 8 col · margen 24 | Tablet horizontal o laptop chica |
| ≥ 1200 | 12 col · margen 32 · máximo 1440 | Escritorio |

La tipografía usa la escala móvil de los tokens por debajo de 768 px. Nunca se usan tamaños de fuente que dependan del viewport.

## 2. Por superficie

| Superficie | ≥ 1024 | 768–1023 | < 768 |
|---|---|---|---|
| **Barra flotante** | Logo, 4 enlaces, tema, Entrar y Crear cuenta | Sin enlaces (< 900 px) | Altura de 54 px, márgenes de 12 px; sin «Crear cuenta» bajo 480 px |
| **Hero** | 2 columnas: texto y escenario (Radar con tarjeta flotante) | 1 columna; escenario de 440 px | Apilado: texto, CTAs a ancho flexible, Radar de 230 px y tarjeta a ancho completo encimada 64 px |
| **Sin / Con** | 2 columnas (.85 / 1.15) | 1 columna | 1 columna; chips de partidos en **fila deslizable**; escudo visitante arriba del nombre |
| **Un sábado cualquiera** | Hora · riel · texto · mini panel | Igual | Hora (48 px) · riel · texto, con el mini panel debajo del texto |
| **Ligas** | 3 tarjetas + columna «Pronto» | 2 columnas; «Pronto» a 2 columnas | 1 columna; tarjetas de 220 px con Radar de 190 px |
| **El modelo** | 3 tarjetas | 3 tarjetas | Filas horizontales compactas (cifra de 96 px + texto) |
| **Compromiso** | 4 columnas | 2 columnas | 1 columna |
| **Cierre** | Texto + Radar de 240 px | Igual | Texto + Radar de 110 px a un lado |
| **Footer** | Marca + 3 columnas | Marca + 2 columnas | Marca a ancho completo + 2 columnas |
| **Login / Crear cuenta** | Visual + tarjeta (520 px) | 1 columna; visual de 200 px después de la tarjeta | Igual; filas de 2 campos pasan a 1 columna bajo 480 px |
| **PIN** | Ventana de 380 px | Igual | Igual; teclas de 64 px bajo 380 px; sin texto de teclado físico en pantallas táctiles |
| **Panel: encabezado de liga** | Emblema, título y mascota de liga (170 px) | Igual | Sin mascota; frescura y etiquetas en línea |
| **Panel: tarjetas** | Cuadrícula `auto-fill` con mínimo de 300 px | Igual | 1 columna |
| **Modal de análisis** | Ventana de 960 px, 2 columnas (tabla / lateral) | 1 columna desde 899 px | Pantalla completa (entra desde abajo); barra 1X2 de 96 px; marcador de 28 px; equipos en columna |
| **Tablas de mercado** | Barra al 36 % del ancho | Igual | Barra al 22 %; «Favorito» debajo del nombre |

## 3. Reglas generales

1. Objetivos táctiles de al menos 44 px (`--layout-touch`). Las teclas del PIN miden 64–72 px.
2. Las filas horizontales (ligas, días y partidos de la demo) se deslizan con scrollbar oculta y nunca envuelven en varias líneas desordenadas.
3. Los nombres de equipos se envuelven o se apilan bajo el emblema; nunca se cortan con «…» en el análisis.
4. Ningún elemento decorativo (mascota, retícula, trayectoria) puede provocar scroll horizontal (`overflow: hidden` en su contenedor).
5. Los inputs llevan `width: 100%` y `min-width: 0` dentro de cuadrículas, para evitar desbordes (lección de crear cuenta en D1).
6. Los diálogos ocupan la pantalla completa en móvil y respetan el área segura.
