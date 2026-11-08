# D1 · Revisión de diseño base (landing + panel)

> **Propósito:** presentar al fundador los prototipos del diseño base para elegir una dirección antes de implementar (pre-MVP y prompt 00).
> **Estado:** ⏳ pendiente de aprobación · **Fecha:** 2026-11-08
> **Prototipos:** `design/d1/` (HTML estático con los tokens oficiales; abrir con un servidor local desde la raíz del repo: `python -m http.server 4173` → `http://localhost:4173/design/d1/landing.html`)

## 1. Lectura del producto

Laboratorio de investigación deportiva para fans analíticos en México. Lenguaje preciso y oscuro (marca GPT: Tinta, Pizarra, Pulso), con una densidad media-alta de datos. Toma como referencia la consistencia de las herramientas de análisis y no la estética de casa de apuestas.

## 2. Qué incluye

| Archivo | Qué muestra |
|---|---|
| `landing.html` | Hero con un análisis real en contexto (datos de ejemplo etiquetados), ligas de la beta con estado, metodología («qué ves en cada análisis» y la fórmula del modelo de referencia), «lo que no vas a encontrar», cierre y footer con las 7 redes, avisos y atribución |
| `panel-a.html` | **Propuesta A (recomendada):** sidebar deporte → liga, lista densa de partidos por día y el análisis fijo a la derecha |
| `panel-b.html` | **Propuesta B:** partidos como tarjetas en cuadrícula y el análisis en un panel lateral que se abre encima |

Las dos propuestas del panel comparten:

- El análisis con proyección, la tabla de mercados (probabilidad, barra y cuota justa) y la comparación con la cuota del usuario (implícita y diferencia en puntos, «no se guarda»).
- Los factores del modelo, la etiqueta «Modelo de referencia · en validación», la frescura con su fuente y los partidos finalizados con su análisis previo sin cambios.
- Los emblemas propios (Liga MX y Premier League) y el fallback para NFL.

## 3. Propuestas del panel

| | A · Lista + análisis lado a lado | B · Tarjetas + panel lateral |
|---|---|---|
| Idea | Estación de trabajo: se recorren los partidos sin perder el análisis | Vitrina: los partidos son el protagonista y el análisis se consulta bajo demanda |
| Beneficio | Comparar partidos es inmediato. Cabe más información (3 resultados, proyección). Escala a Game Center, cuotas y props sin cambiar de modelo mental. | Más visual y familiar en la primera visita. Encaja con una audiencia casual. |
| Costo | Más denso en la primera impresión | Cada análisis cubre la lista. Comparar requiere abrir y cerrar. Escala peor a vistas de investigación. |
| Móvil | Lista y hoja de análisis a pantalla completa (igual en ambas) | Igual |
| Recomendación | ✅ Recomendada: coincide con la propuesta de valor (investigar, comparar) y con la arquitectura (Game Center) | Alternativa válida para un público más casual |

## 4. Verificación hecha

- Navegación completa: liga → filtro por día → partido → análisis → comparación con cuota, con el estado en la URL (`#liga/partido`).
- Breakpoints: 390, 1024, 1280 y 1440 px. Sin scroll horizontal (`scrollWidth = innerWidth`). En la propuesta A, el análisis queda al lado desde 1200 px y como hoja deslizable por debajo.
- Teclado: filas de mercado operables con Enter o Espacio. El panel o la hoja se cierra con Escape y devuelve el foco al disparador. Foco visible con el anillo Pulso.
- Sin errores de consola.
- **No verificado:** axe y Lighthouse automatizados (se ejecutan en la implementación, `QUALITY_GATES.md`), ni lector de pantalla real.

## 5. Decisiones de diseño (contrato propuesto)

- **Colores:** solo los tokens de marca. Pulso solo en el CTA primario, el foco y la selección. Series: modelo en Índigo claro y visitante en Eco. El empate va en gris (Arista firme).
- **Tipografía:** Inter, con la escala de la marca. Números tabulares en todas las cifras. Horas en formato de 24 h (es-MX).
- **Densidad:** filas de 44 px. Barras de probabilidad de 8 px. Mini barra 1X2 de 6 px en la lista.
- **Superficies:** Tinta de fondo, Órbita en la navegación, Pizarra en los paneles y Umbral más sombra solo en overlays.
- **Movimiento:** solo el panel o la hoja (240 ms con la curva de marca). Nada decorativo. Se respeta el movimiento reducido.
- **Anti-defaults** (evitados a propósito):
  - Sin robots, mascotas ni «analizando en tiempo real».
  - Sin «pick del día», parlays, montos ni porcentaje del bank.
  - Sin gradientes decorativos, hero vacío ni tarjetas de features en 3 columnas.
  - Sin marquee promocional.

## 6. Pendiente tras la aprobación

1. Promover el contrato elegido a `docs/design/DESIGN_SYSTEM.md`, `INTERACTION_PATTERNS.md` y `RESPONSIVE_RULES.md`.
2. Implementar en el pre-MVP (`docs/product/PRE_MVP.md` §9, paso 6) con componentes y stories reales.
3. Datos reales en lugar de los de ejemplo (`proto.js` está marcado como datos de ejemplo de principio a fin).
