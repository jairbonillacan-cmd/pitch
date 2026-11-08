# 04 — Inventario de componentes
- **lock**: canvas intro (partículas/ondas/ticker), pad numérico, dots, plate con shake.
- **bento/lgrid cards** (`bc`): tilt 3D con --mx/--my/--rx/--ry, glow, hover-sound (rate-limit 250ms).
- **emblem()**: escudo SVG con gradiente por equipo.
- **game card** (`card`/`tile`): cabecera (equipos, hora, línea DK), pick chip, mercados agrupados GR.
- **market row** (`row`): botón + / ✓ (addBtn), etiqueta, cuota justa (1/p), barra de prob, %, ✓/✗ en audit,
  input de cuota + EV + % bank (stakeBox), "casa N%" (noVig).
- **pick del día**: estrella, badge MÁS PROBABLE, prob + cuota default ≈ (1/(p·1.05)), fórmula explicada, ANALIZAR ▸.
- **topPanel**: resultados auditados (W-L), parlay seguro, parlay arriesgado (cuota≈5).
- **parlays**: PLW (3 de p≥.60), PLR (p≥.52, cuota total 3–7 hacia 5), LEG con odds por pierna.
- **barras DINERO**: dobles (boletos azul/ámbar, dinero azul oscuro/naranja), leyenda, tags.
- **props row**: avatar mascota (sana/vendada), # camiseta, línea, prob, input línea/cuota.
- **boleto**: legs con cuota editable, warn correlación (mismo gk), resumen (prob, justa, casa, EV, sizing),
  botones 5%/10%, REGISTRAR/VACIAR; historial con stats + calibración + BRK (ROI liga/tipo).
- **toast** (2.2s), **IA chat** (chips + mensajes u/a/th), **feed lesiones** con select+impacto.
- **simulador**: selects, tile, canvas robot decode (26→1px, 2.6s, ease 1−(1−p)^2.2), líneas SVG, SALTAR.
