# REPORTE COMPLETO — Ingeniería inversa y reconstrucción del motor de TOUCH IQ

**Sitio:** https://touchiq.com.mx/ · **Fecha del análisis:** 2026-11-08 · **Datos de la app congelados al 7 nov 2026**
**Herramienta principal:** REA — Reverse Engineer Anything (rea-agents@6.8.0 + skill v49)
**Autorización:** clave de acceso proporcionada por el usuario ([REDACTED_PIN]). Reconstrucción local independiente.

---

## Resumen ejecutivo

TOUCH IQ es una plataforma de estadística y picks de fútbol americano (NFL semana 9 y NCAA semana 10, temporada 2026) que opera **íntegramente en el navegador**: un único archivo HTML de 2.4 MB servido por Netlify, con **cero llamadas de red** en runtime (verificado con REA vía CDP, Evidence `ev_7d2fef6c`). Toda la información (resultados, lesiones con fuente y fecha, splits de DraftKings, estadísticas de jugadores) está transcrita a mano dentro del código, y **las probabilidades se calculan en vivo con fórmulas estadísticas explícitas**: Pitágoras → Log5 → ventaja de local → curvas normales, con una capa de valor esperado (EV), sizing de bankroll y un modelo de picks 80/20.

El motor fue **extraído, ejecutado offline y comparado contra el original en 46 juegos × 15 mercados (14 NFL + 32 NCAA), con desviación máxima Δ = 0.000e+0** — identidad algorítmica bit a bit en todo lo implementado y probado. La reconstrucción en TypeScript pasa 384/384 tests, incluyendo 24 tests dorados que reproducen los números exactos de la interfaz viva (WAS@LAR 67.8% ≈1.40, LAC@HOU 66.2%, SEA −3.5 66.2%, IND +5.5 65.5%, MICH ML 71.5%).

**Lo que esto no es:** no se recuperó código de servidor ni parámetros privados (no existen: todo es cliente); los assets gráficos del original no se reutilizan sin autorización; y el proceso humano de actualización semanal de datos no es reproducible desde el artefacto.

---

## 1. Qué es la aplicación (descubrimiento)

- **Pantallas**: intro synthwave con pad PIN (2 etapas, código "[REDACTED_PIN]") → home con robots → tableros NFL (7 pestañas: PARTIDOS, SIMULADOR, NOTICIAS, LESIONES, EQUIPOS, JUGADORES, 💰 DINERO) y NCAA (4 pestañas) → boleto/historial/bankroll → asistente de IA integrado.
- **Arquitectura**: shell + dos documentos HTML completos embebidos en base64 (`PAGES={nfl: 1.34 MB, ncaa: 97 KB}`) abiertos en iframes `srcdoc`, comunicándose por `postMessage` (`ready/cfg/odd/add/home`). Sin frameworks, sin backend, sin tracking.
- **Puente opcional `window.claude`** (`db`, `user`, `sample`): persistencia por usuario en BD y respuestas LLM del asistente; sin ese host (la web pública), todo cae a `localStorage["azteca_av"]`.
- **Código muerto detectado**: `window.__START` (inyectado, nunca leído) y las combinadas `cb_` (matemática de convolución presente, UI desactivada).

## 2. Procedencia de los datos (citada por el propio código)

| Dataset | Fuente citada | Frecuencia (inferida) |
|---|---|---|
| Resultados de temporada `R` (121) | cosecha propia del autor | semanal |
| Baseline de equipos `T` | Pro-Football-Reference | por temporada (2025) |
| Lesiones `N` (154) | NFL.com / Yahoo / CBS Sports — fecha por renglón | 2–3×/semana |
| Defensas `DF` y props `PJ` | "(Pro-Football-Reference, al 19 oct)" + reportes de equipo | semanal |
| Splits de apuestas `MONEY` | "DraftKings (DK Network, «Betting Splits»), sáb 7 nov 2026, 2:08–3:41 PM CDMX" | 1–2×/semana |
| Calendario `D` y auditoría `AUD` | calendario y marcadores oficiales + picks pre-partido | semanal / tras jornada |

**No hay API**: la "obtención" es el trabajo manual del autor; la app consume una instantánea embebida.

## 3. Motor NFL (informe completo en `18-engine-nfl-report.md`)

**Constantes:** E=2.37 · HFA=0.55 (Londres 0.50) · K=6 · SDM=13.4 · SDT=13.3 · SDP=9.5 · LGPF=395.

1. **Fuerza**: mezcla baseline 2025 con 2026, `w = n/(n+6)`.
2. **Lesiones**: impacto×estatus resta ofensa o suma defensa (piso 8 pts) — sensibilidad medida: hasta **+15 pp** (NO@CLE).
3. **Núcleo**: Pitágoras → Log5 → localía → `tot` proyectado → margen `mu = 13.4·Φ⁻¹(pH)`.
4. **Mercados** (15): ML, spread, total, team totals, alt lines −3.5/−7.5 — probabilidades por colas normales.
5. **Pick**: bandas 72%/58% → margen al 62% / ML / puntos al underdog al 65%.
6. **Pick del día y parlays (fórmula 80/20)**: `SC = 0.8·p + 0.2·(PCONS(p)·cuota)`, PCONS encoge 15% a 50%, cuota ≥ 1.40; parlay seguro (3 de p≥.60) y arriesgado (p≥.52, cuota total ≈5).
7. **Valor**: EV = p·cuota − 1; sizing 10%/5%/0; break-even mostrado al usuario (1/p); noVig para "casa N%".
8. **Auditoría**: picks pre-partido recalculados sin el juego y sin lesiones; ✓/✗ por mercado (registro NFL: 1-0).

**Validación**: Δ=0 en batch · dorados de UI exactos · EV LAR 67.8% cruza a positivo en **1.53** (el pick card lo dice literalmente) · auditoría BAL@JAX reproducida (pick "JAX −8.5" pre-partido ✓).

## 4. Motor NCAA (informe completo en `19-engine-ncaa-report.md`)

**Cuatro diferencias propias verificadas:**
1. `build()` con **promedios por juego + conferencia**: `rs=(avg·G+LGP·K+pts)/(G+K+n)`, K=3, y ajuste de fuerza de conferencia (`rs×cf, ra÷cf`; SEC/B1G/B12/ACC/IND=1, P12=.92, G5=.88).
2. **pH contraído hacia 50%**: `pH = .5 + SHR·(Log5+HFA − .5)` con SHR=.85 (el NFL lo usa directo).
3. Márgenes más dispersos: SDM=15.5, SDT=15, SDP=11.
4. **Regla del pick de 3 ramas sin capa 80/20 ni combinadas** ("los marcadores colegiales son muy disparejos"): dominante ≥52% / favorito ≥58% / mejor de {ML, +L, Over, Under}.

**Validación**: Δ=0 en batch (32 juegos) · dorado MICH ML **71.5%** = UI · registro auditado **4-1** (flags almacenados, OBSERVADO) · el replay con la instantánea actual da 2-3 → dependencia del dato-en-su-momento documentada (no contradicción).

## 5. Pipeline completo (todas las etapas OBSERVADAS)

```
[Cosecha humana: PFR/CBS/Yahoo/NFL.com/DK]  ← única etapa no observable
   → transcripción manual a arrays JS (con fuente y fecha citadas)
   → build() fuerza por equipo → eff() lesiones → model0() probabilidades
   → mercados y pick por juego → 80/20 pick del día/parlays (NFL)
   → EV con cuota del usuario → sizing 5/10% → interfaz
   → auditoría pre-partido (SA, sin lesiones) → registro ✓/✗
```

## 6. Resultados de las pruebas

| Suite | Resultado |
|---|---|
| Tests dorados del dominio (golden.test.ts) | 24/24 |
| Batch identidad NFL (vs original en paralelo) | Δ = 0.000e+0 |
| Batch identidad NCAA (vs original en paralelo) | Δ = 0.000e+0 |
| Suite total del proyecto | **384/384** |
| Sensibilidad (lesiones/EV/SHR/neutral) | consistente con la UI |

Correcciones que la verificación batch obligó a hacer en la reconstrucción (metodología funcionando): fórmula SHR del pH NCAA, regla del pick NCAA a 3 ramas (la inferencia inicial "umbral 55%" era incorrecta), y el array `AUD` NCAA faltante (alteraba la fuerza de 10 equipos).

## 7. Trazabilidad y limitaciones

- **OBSERVADO**: toda la lógica del motor, constantes, protocolo postMessage, datos con fuentes, registros auditados.
- **INFERIDO**: frecuencias exactas de actualización; flujo de cosecha humana.
- **DESCONOCIDO/no disponible**: instantáneas históricas (impiden backtesting formal tipo Brier/log loss más allá de los registros embebidos); el host que proveería `window.claude` en producción.
- **No recuperado ni afirmado**: código de servidor, parámetros privados de modelos (no existen — todo es cliente).
- **Ética**: assets gráficos del original (robots, mascotas, video) no se reutilizan sin autorización; la reconstrucción no procesa apuestas con dinero real (bankroll virtual, "referencia estadística, no consejo de apuesta").

## 8. Documentos que componen este reporte

| Archivo | Contenido |
|---|---|
| `00-REPORTE-COMPLETO.md` | este documento consolidado |
| `18-engine-nfl-report.md` | informe técnico del motor NFL (8 puntos metodológicos) |
| `19-engine-ncaa-report.md` | informe técnico del motor NCAA (8 puntos metodológicos) |
| `CLONE-BLUEPRINT.md` | especificación completa de reconstrucción (11 secciones + checklist) |

Referencias del proyecto: `docs/01–17` (descubrimiento, inventarios, arquitectura, paridad, pruebas, limitaciones) · `src/domain/` (motor reconstruido) · `tests/domain/` (golden + batch + sensibilidad) · `touchiq-analysis/` (artefacto original decodificado, Evidence REA `ev_2464afc9…` y `ev_7d2fef6c…`, harness del motor original).
