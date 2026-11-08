# 11 — Arquitectura de la reconstrucción
```
src/
  domain/   ← REGLAS PURAS (sin DOM): stats, engine-nfl, engine-ncaa, props, betting, types
  data/     ← Data Access: JSON extraído (instantánea 7 nov 2026) + loader tipado
  shell/    ← lock, audio, home, nav, slip (estado+persistencia), bridge postMessage, ai
  pages/    ← nfl.ts, ncaa.ts (render de tableros, contratos idénticos al original)
  styles/   ← tokens y hojas por módulo
tests/domain/ ← tests dorados (24) + unitarios
```
Justificación del stack (criterio del prompt §9): **Vite + TypeScript estricto + Vitest, vanilla DOM**.
El original no usa framework (evidencia §6); React/Next añadiría distorsión de paridad y
dependencias injustificadas. Capas separadas: dominio 100% navegable sin navegador (tests lo prueban).
Protocolo shell↔página: el reconstruction usa el MISMO contrato postMessage (§5 del blueprint).
Nota: la reconstrucción es módulo a módulo código propio derivado del comportamiento observable;
no es una copia del archivo original.
