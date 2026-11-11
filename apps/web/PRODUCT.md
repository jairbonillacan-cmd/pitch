# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Fan analítico (P1, núcleo):** 25–40 años en México, sigue NFL y Liga MX desde el móvil, revisa los partidos del fin de semana y a veces apuesta poco. Quiere entender rápido un partido y un prop en lenguaje claro.
- **Investigador serio (P2, núcleo):** escritorio, varias horas a la semana, compara líneas y lleva registro de su rendimiento. Quiere densidad, filtros, cuotas con hora, CLV y backtesting.
- **Creador / tipster (P3, crecimiento):** publica análisis en redes y quiere un historial verificable que no se pueda maquillar.
- **Fan de datos / fantasy (P4):** no apuesta; disfruta estadísticas, perfiles y comparadores.

## Product Purpose

PitchLab es el laboratorio de investigación deportiva en español para México: datos con licencia que se actualizan solos, probabilidades estimadas con su cuota justa, cuotas con hora y fuente, histórico «tal como se sabía antes del partido» y modelos que publican su calibración. Éxito: investigaciones completadas por usuario activo a la semana, retención W4/W8 y conversión de la prueba de 7 días a pago.

## Positioning

**Foco (fundador, 2026-11-09):** cada pantalla le dice al usuario qué es lo más probable según los datos, con su probabilidad y su cuota justa, para que lo compare con la cuota de su casa y lo considere al decidir su apuesta. Se informa; no se recomienda monto ni «pick seguro».

Frente a apps de picks con datos congelados y modelos opacos, y frente a herramientas estadounidenses sin idioma ni ligas locales: método visible (fuente, muestra, hora y calibración en cada cifra), histórico de cuotas propio desde el día 1, picks inmutables calificados por CLV y México primero (español, Liga MX, emblemas propios, MXN, IVA y CFDI). No es casa de apuestas ni vende picks.

## Operating Context

Se consulta antes de cada jornada: abrir la jornada, ver favoritos, abrir el análisis de un partido, comparar la cuota propia con la probabilidad del modelo. Móvil para P1, escritorio para P2. Ligas: NFL, Liga MX, Premier League como núcleo; LaLiga, Bundesliga, Serie A y Ligue 1 ya con datos; NHL, MLB y NCAAF después.

## Capabilities and Constraints

- Momento de la landing definitiva: **lanzamiento público** con cuentas, prueba gratis de 7 días sin tarjeta y un solo plan: **Pase PitchLab Ultra**.
- Precio confirmado (2026-11-11): **Pase PitchLab Ultra $299 MXN/mes o $2,390 MXN/año (ahorras 4 meses), IVA incluido y factura CFDI**, con prueba gratis de 7 días sin tarjeta (`MEMBERSHIP_SPEC`).
- Solo mayores de 18. Sin depósitos, sin apuestas, sin recomendaciones de monto, sin premios por acertar, sin afiliados en el MVP.
- **FD-16 (actualizado 2026-11-11):** los 5 motores propios (`Tachyon`, `Singularity`, `Minkowski`, `Geodesic` y `Cortex IA`) sí se nombran en la UI pública y del club; la UI nunca nombra proveedores de datos (`nflverse`, `openfootball`, `api-football`, `Polymarket`, `Kalshi`, `Understat`, `ESPN`) ni fórmulas internas crudas (`Poisson`, `Dixon-Coles`, `LightGBM`, `Platt`, `Pitágoras`, `Log5`).
- Predicciones públicas completas, backtesting, Replay e IA llegan después del MVP (W5); la landing no las promete como disponibles.

## Brand Commitments

- Nombre **PitchLab** (P y L mayúsculas). Eslogan: **Lee el juego con datos.**
- Identidad oficial en `pitchlab-brand/` (logotipo, isotipo «Campo de corte», paleta Pulso/Iris/Eco/Tinta, Inter). Contrato de UI en `docs/design/DESIGN_SYSTEM.md` y `docs/design/UI_LIBRARIES.md`.
- Voz: dato primero, luego contexto y luego acción; español de México; frases cortas; nunca «pick seguro», «gana» ni «cobra».
- Mascota **Radar**: detalle discreto (estados, cierre), nunca protagonista del hero en la landing definitiva.
- Estándar de calidad: diseño curado al nivel de las apps nativas de Apple, con la identidad de PitchLab. Librerías: HeroUI (gratis), Astryx y shadcn sobre los tokens (`docs/design/UI_LIBRARIES.md`).

## Evidence on Hand

- Partidos y probabilidades reales de los snapshots diarios (`data/snapshots/<liga>/latest.json`): 20 mercados por partido, cuota justa, forma y tabla.
- Emblemas de equipos y ligas (`pitchlab-brand/football/`, `apps/web/public/brand/`) y ediciones de la mascota.
- Precios confirmados (arriba).
- **No existen** y no se inventan: testimonios, número de usuarios, métricas de acierto o calibración publicadas, logos de prensa o socios, cifras de ganancias.

## Product Principles

1. Cada cifra lleva su método: fuente o muestra, hora y estado del modelo.
2. Informar para decidir, nunca empujar a apostar.
3. El historial es íntegro: lo publicado antes del partido no se edita.
4. México primero sin perder rigor internacional.
5. El dato manda; la interfaz se retira.

## Accessibility & Inclusion

WCAG 2.2 AA: contraste verificado en ambos temas, objetivos táctiles de 44 px, foco visible, movimiento reducido respetado, estados nunca solo por color, español con formato es-MX (porcentajes «55.8 %», horas en 24 h).
