# 18 — Informe técnico del motor NFL (touchiq.com.mx)

**Alcance:** motor de predicciones NFL · **Fecha del análisis:** 2026-11-08 · datos de la app congelados al 7 nov 2026.
**Disciplina de evidencia:** OBSERVADO (verificado en pantalla/código/ejecución) · INFERIDO (deducido, sin confirmación directa) · DESCONOCIDO.

## 1. Procedencia de los datos

| Variable | Proveedor citado por el propio código | Frecuencia | Transformación |
|---|---|---|---|
| Resultados de temporada `R` (121 juegos) | sin cita (cosecha propia del autor) | semanal (INFERIDO del formato "Datos al 7 nov") | array [visitante, local, ptsV, ptsL] |
| Baseline de equipo `T` (PF/PA) | Pro-Football-Reference | por temporada (2025 congelado) | totales de temporada → /17 por juego dentro de build() |
| Lesiones `N` (154) | NFL.com, Yahoo, CBS Sports — fecha y fuente por renglón (ej. "NFL.com, reporte del viernes 6 nov") | 2–3×/semana (reportes miércoles/viernes citados) | impacto en puntos (i) × estatus (st: 0/.25/.5/1) |
| Defensas `DF` | "(Pro-Football-Reference, al 19 oct)" | semanal | [JJ, pts, ydsPase, ydsTierra] permitidos por juego |
| Props `PJ` | PFR al 19 oct + reportes de equipo por jugador | semanal | promedios por juego por estadística |
| Números de camiseta `JN` | "(rosters de CBS Sports, 20 oct)" | por temporada | mapa equipo\|jugador → # |
| Splits de apuestas `MONEY` | "DraftKings Sportsbook (DK Network, «Betting Splits»)" con timestamp "sáb 7 nov 2026, 2:08–3:41 PM CDMX" | 1–2×/semana (INFERIDO) | % boletos y % dinero por lado/mercado |
| Calendario `D` | sin cita (calendario oficial transcrito) | semanal | días + horas + sedes (Madrid, Londres `NEUT`) |
| Auditoría `AUD` | marcadores oficiales + picks pre-partido | tras cada jornada | [h,a,pts,pts] + pk con flag ✓/✗ |

**No hay API ni endpoints:** Evidence REA ev_7d2fef6c muestra **0 requests de red** durante la operación.
Toda la obtención es el trabajo manual del autor; la app consume una instantánea embebida.
`ed` (overrides manuales de PF/PA) existe en el código y está **vacío** (OBSERVADO).

## 2. Arquitectura del motor

**OBSERVADO: 100% en el navegador.** No hay backend de predicción, ni API externa, ni
precalculos servidos: las probabilidades se computan en el cliente al renderizar cada vista
(`model0` por juego/tile, `rebuild()` al cargar). Comprobaciones: 0 requests (REA CDP), el
motor extraído corre offline sin red y reproduce la UI al decimal, y el bundle contiene las
fórmulas completas. El único servicio "externo" potencial es el puente `window.claude`
(persistencia/LLM), ausente en la web pública.

## 3. Algoritmos y fórmulas (todas OBSERVADAS del JS público)

Constantes: `E=2.37 · HFA=.55 · K=6 · SDM=13.4 · SDT=13.3 · SDP=9.5 · LGPF=395 · NEUT={JAX-PHI, JAX-HOU}`.

1. **Fuerza de equipo** (`build`): mezcla del baseline 2025 con 2026 mediante `w=n/(n+6)`:
   `rs = (PF2025/17)·(1−w) + (PF2026/juego)·w`; `LG = Σrs/32`.
2. **Lesiones** (`eff`): `d = impacto×estatus`; ofensa ("gf") resta a `rs`, defensa ("ga") suma a `ra`; piso 8 pts.
3. **Núcleo** (`model0`): Pitágoras `py = rs^2.37/(rs^2.37+ra^2.37)` → Log5 `pn=(x−xy)/(x+y−2xy)` →
   localía como odds-ratio `o=odds(pn)·(.55/.45)` → `pH=o/(1+o)` (0.50 en Londres).
4. **Puntos**: `tot = rsH·raA/LG + rsA·raH/LG`; margen `mu = 13.4·Φ⁻¹(pH)` (Φ de Abramowitz-Stegun,
   Φ⁻¹ por bisección); líneas `spread=half|mu| (≥1.5)`, `total=half(tot)`, team totals `half(lh/la)`.
5. **Probabilidades de mercado** (colas normales): `p(cover L)=1−Φ((L−|mu|)/13.4)`,
   `p(over)=1−Φ((line−tot)/13.3)`, team totals σ=9.5; alt lines −3.5/−7.5 con la misma curva.
6. **Pick por juego**: pF≥72% → favorito por el margen que da ~62% ("FAVORITO CLARO · GANA POR N O MÁS");
   58–72% → ML ("ML · FAVORITO" o "ML · DOMINA EN OFENSIVA Y DEFENSIVA" si `dom`);
   pF<58% → no-favorito +margen al ~65% ("JUEGO PAREJO · PUNTOS AL NO FAVORITO").
7. **Pick del día/parlays (80/20)** — comentario del autor en el código:
   `PCONS(p)=.5+.85(p−.5)`; `SC=.8·p+.2·(PCONS(p)·cuota)`; cuota ≥1.40 (QMIN); p≤.85;
   +0.05 si es el mejor EV del juego. Parlay seguro: 3 mejores de p≥.60; arriesgado: p≥.52,
   cuota total ∈[3,7] más cercana a 5.
8. **Cuota default**: `1/(p·1.05)` (×1.10 en combinadas) — por eso el pick card muestra "≈ 1.40".
9. **EV**: `p·cuota−1`; sizing `10%` (p≥0.60 y EV>0) / `5%` (EV>0) / `0` "No apostar".
10. **noVig**: `pᵢ=(1/dᵢ)/Σ(1/dⱼ)`, margen `Σ−1` — para "casa N%" junto a la cuota justa.
11. **Combinadas cb_** (matemática presente, UI desactivada con `CMB(){return ""}`):
    convolución de distribuciones de puntos con **empates repartidos 50/50** (sin push);
    `P(fav y B)=P(fav)·P(B|fav)` condicional desde la matriz.
12. **Props**: `shr=(tot+pr·2)/(JJ+2)` (freno 2 juegos al promedio de posición);
    `fct=1+.5(v/lg−1)` (defensa rival, mitad del exceso; lg: 220 ydsP/110 ydsT/23.1 pts);
    TD Poisson `1−e^(−μ)`, recepciones `1−poisCDF(⌊L⌋,μ)`, yardas normal; `safeAlt`→P(over)≈0.68.
13. **Valor**: sólo entra al pick/parlay lo que paga ≥1.40; el modelo nunca usa las líneas DK
    como entrada (MONEY es contraste informativo).

## 4. Ingeniería inversa de resultados (pruebas controladas)

**Verificación batch (motor reconstruido vs ORIGINAL ejecutado en paralelo):**
- **14 juegos del calendario × 15 mercados + pick + etiqueta: Δmáx = 0.000e+0 (identidad bit a bit).**
- Dorados de UI viva: WAS@LAR "LAR gana (ML) 67.8% ≈1.40" · LAC@HOU "HOU 66.2% ≈1.44" ·
  SEA−3.5 66.2% · IND +5.5 65.5% · chip "IA: gana CIN 56%" (motor 56.2%) · etiquetas idénticas.

**Sensibilidad (una variable a la vez, motor reconstruido):**
| Experimento | Resultado |
|---|---|
| Lesiones on/off | WAS@LAR Δ+2.2 pp · MIA@DET Δ+2.1 pp · **NO@CLE Δ+15.0 pp** (3 ajustes) · SF@LV Δ−2.3 pp |
| Cuota → EV (LAR 67.8%) | 1.40→−5.1% · 1.47→−0.3% · **1.53→+3.7%** ("tiene valor si tu casa paga 1.53 o más" — texto exacto del pick card) · 1.60→+8.5% |
| Sizing | 10% solo si p≥0.60 y EV>0; si no 5%; EV≤0 → "No apostar" (break-even mostrado: 1/p) |
| Campo neutral | JAX@HOU (Londres) usa HFA=0.50 → pH 71.6% |

## 5. Pipeline de predicción (etapas confirmadas vs hipotéticas)

```
[Fuentes humanas: PFR/CBS/Yahoo/NFL.com/DK] → [transcripción manual a arrays]      ← OBSERVADO (citas+formato)
   → [embed en JS / instantánea]                                                   ← OBSERVADO
   → build() fuerza de equipos (freno K=6)                                          ← OBSERVADO
   → eff() ajuste por lesiones                                                      ← OBSERVADO
   → model0(): Pitágoras→Log5→localía→puntos→curvas normales                        ← OBSERVADO
   → mercados + pick (bandas 72/58) → 80/20 para pick del día/parlays               ← OBSERVADO
   → EV con cuota del usuario → sizing 5/10% → UI                                   ← OBSERVADO
   → auditoría con SA (sin el juego, sin lesiones) ✓/✗                              ← OBSERVADO
   → [calibración sistemática del modelo: NO EXISTE en el código]                   ← OBSERVADO (ausencia)
```
No hay etapa hipotética necesaria: el pipeline completo es cliente y fue reconstruido.
Única etapa no observable: la **cosecha manual** (no deja rastro en el artefacto).

## 6. Reproducción

Implementación independiente en TypeScript: `src/domain/engine-nfl.ts` (+ `stats.ts`,
`betting.ts`, `props.ts`), con los datos extraídos a `src/data/*.json`. El motor original
**no es privado** (todo vive en el JS público), por lo que la reproducción alcanza
**equivalencia exacta** en lo implementado y probado — no una aproximación:
`Δmáx = 0` en 14 juegos × 15 mercados frente al original ejecutado.

## 7. Validación

- **Identidad algorítmica**: 24 tests dorados + batch 14×15 mercados → Δ=0 (misma aritmética,
  mismo orden de operaciones, mismos datos). Ver `tests/domain/golden.test.ts` y `batch-verify.test.ts`.
- **Backtesting del original** (sin filtración, usando su propio mecanismo): el registro
  auditado NFL "1-0" (pick pre-partido "JAX −8.5" ✓ vs 10-33) se reproduce: el pick almacenado
  corresponde al estado pre-partido (72.9% ≥72% → margen −8.5); hoy, sin las lesiones de
  entonces, el motor da −4.5 — el original lo declara: "Modo auditoría · sin reporte de lesiones".
- **Calibración estadística formal** (Brier/log loss a escala): NO es posible con este artefacto —
  sólo existe 1 pick NFL auditado; el histórico de picks no está embebido. DESCONOCIDO/documentado.
- Coherencia interna adicional: ∑mercados complementarios ≈1 (ML h + ML a = 1 por construcción);
  cuota justa 1/p; EV consistente con el texto de UI ("1.53 o más").

## 8. Trazabilidad y diferencias respecto al original

| Componente | Estado | Diferencia |
|---|---|---|
| build/eff/model0/mercados/pick | OBSERVADO | **Ninguna (Δ=0)** |
| 80/20, parlays, QMIN | OBSERVADO (comentario incluido) | Ninguna en fórmula; PLC/PLR completos pendientes de test batch |
| Props (fórmulas) | OBSERVADO | Ninguna; el editor de líneas (PLINE) y el panel UI son parte del módulo UI pendiente |
| Auditoría | OBSERVADO | Ninguna |
| Datos | OBSERVADO (instantánea 7 nov) | La reconstrucción congela la instantánea; la cosecha semanal es manual |
| Assets/UX | — | No forman parte del motor; se reconstruirán con equivalentes propios |
| No determinable | — | Proceso humano de transcripción (frecuencia exacta, criterios de impacto) |

**Conclusión**: el motor NFL de TOUCH IQ es un modelo Pitágoras-Log5 con ajuste de localía,
lesiones y curvas normales, más una capa de valor (80/20, EV, sizing). La reconstrucción en
`src/domain/` es **algorítmicamente idéntica** en todo lo implementado y probado (Δ=0 frente
al original); lo único no reproducible es el flujo humano de actualización de datos.
