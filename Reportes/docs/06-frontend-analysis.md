# 06 — Análisis del frontend
**Stack (OBSERVADO):** vanilla JS ES2022+ minificado, sin framework ni bundler aparente, un solo HTML.
**Shell (script_0, 68 funciones mapeadas con offset — ver CLONE-BLUEPRINT.md §2):**
utilidades → HUD SVG → intro canvas → audio engine (AU/PENT) → lock (key/fail/success) →
tarjetas (emblem/bc/tilt) → home/nav (drawHome/lv1/lv2/openSport/closeSport) → boleto (AV + renderSlip + BRK).
**Página NFL (11 scripts):** s1 motor+render (44 fns), s0 puente AVX, s3 props, s4 avatares/feed,
s5 mascotas, s6 avatar helper, s7 video robot, s8 animaciones, s9 DINERO, s10 fix visibilidad.
**Página NCAA (3 scripts):** motor propio (conferencias) + render.
**Traza ejemplo (agregar al boleto):** click [data-add] → AVX.add(k) → postMessage{av:"add",pk} →
shell listener → AV.slip push/splice → save("slip") debounce 500ms → lsSave/AV.db → renderSlip()+pushCfg().
**Código muerto detectado:** window.__START (inyectado, 0 consumidores); CMB combinadas (return "").
