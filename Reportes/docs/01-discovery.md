# 01 — Discovery
**Objetivo:** touchiq.com.mx · **Herramienta:** REA (rea-agents@6.8.0 CLI + skill reverse-engineer-anything v49)
**Autorización:** clave de acceso proporcionada por el usuario (7779).

## Hallazgos estructurales (OBSERVADO)
- Aplicación de UN SOLO ARCHIVO: index.html de 2.4 MB servido por Netlify (HTTP/2, HSTS).
- 0 requests de red en runtime (Evidence REA ev_7d2fef6c: network.requests=0, storage vacío en perfil fresco).
- 3 scripts en el shell: script_0 (motor+datos, 2.05 MB), script_1 (trío de robots), script_2 (asistente IA).
- PAGES={nfl: 1.34 MB b64, ncaa: 97 KB b64} — documentos HTML completos embebidos, abiertos en iframe srcdoc.
- Cero frameworks (sin React/Vue/etc.); DOM y WebAudio escritos a mano; cero WebAssembly/workers.

## Herramientas ejecutadas
- REA analyze-javascript-application (Evidence ev_2464afc9, 14 fuentes) + inspect-analysis-view summary.
- REA inspect-web-page vía CDP (Chrome for Testing 156, puerto 9222, perfil aislado /tmp/rea-touchiq-profile).
- Navegación real con clave 7779 (IAB ZCode): lock→home→NFL(PARTIDOS/DINERO/SIMULADOR)→NCAA→boleto→IA.
- Motor original extraído y ejecutado offline (touchiq-analysis/engine/engine-nfl.js) — verificación 5/5.

## Limitaciones de herramientas
- `list-browser-targets` no existe en rea-agents@6.8.0 (nombre de repo main); el targetId se obtuvo del endpoint CDP (curl /json/list).
- Los motores nativos (Ghidra/Hopper) no aplican: no hay binarios; el objetivo es JS/HTML puro.
