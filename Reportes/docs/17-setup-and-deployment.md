# 17 — Setup y despliegue
```bash
npm install
npm test        # vitest: 24 tests dorados del dominio
npm run dev     # vite (cuando la UI esté conectada)
npm run build   # tsc --noEmit + vite build
npm run extract # re-extrae datasets del original (requiere touchiq-analysis/)
```
Despliegue objetivo: estático (Netlify) — el build de Vite genera dist/.
Referencia viva del original: touchiq-analysis/ (index.html 2.4 MB, páginas decodificadas,
Evidence REA ev_2464afc9 y ev_7d2fef6c, harness engine-nfl.js).
Estado de reanudación: docs/12-implementation-plan.md (módulos 6–15 pendientes).
