# 11 — Motor de MLB de AztecaVet: informe técnico de reconstrucción

**Fecha:** 2026-11-08 · **Fuente:** https://aztecavet.com/ (autorización del propietario) · **Implementación:** `src/domain/aztecavet/baseball.ts` · **Oráculo:** `reference/aztecavet/baseball-ref.mjs` · **Pruebas:** parity MLB (17 juegos de postemporada + sim) · **Evidencia:** `evidence/statistical-tests/aztecavet-experiments.json` (E4-MLB, E4b).

---

## 1. Procedencia de los datos (OBSERVADO)

| Dato | Origen | Detalle |
|---|---|---|
| 8 equipos de playoffs, RS/RA por juego + ERA del bullpen | Embebido (`T`) | sin red |
| 29 abridores con ERA e IP (null = sin ERA verificado) | Embebido (`PL`) — incluye "(proyectado)", "(opener)", "(bullpen)" | |
| 29 bateadores clave con impacto carreras/juego | Embebido (`BT`) — Ohtani .50, Ramírez .35, Freeman .30, Caminero .30… | |
| Timeline completo de postemporada (17 juegos, 8–28 oct) | Embebido (`D`) con narrativa juego a juego (ALDS→Serie Mundial, MIL campeón 4-1) | sirve como datos de auditoría |
| Cuotas | No hay proveedor; el usuario escribe cuotas | |

**Nota (OBSERVADO):** la MLB está marcada "TEMPORADA TERMINADA" — no hay días futuros; la página existe como auditoría + **simulador con abridores seleccionables** (MIL vs LAD default, con spOpts por equipo).

## 2. Arquitectura (OBSERVADO)

Cálculo 100% client-side, sin red. Misma familia de motores (AVX compartida).

## 3. Variables, fórmulas y reglas (OBSERVADO)

**Constantes:** `LG=4.40` carreras · `EX=1.83` · `HFA=.54` · `SHR=.85` · `SD=3·√2 ≈ 4.2426` · `CMIN=.40` · priors de regresión: `IP_prior=80`, `factor=.55`.

**Pipeline confirmado:**

1. **Bateadores fuera:** `rs −= i` por jugador con `out=1` del equipo; nota "X fuera (−i R)".
2. **Ajuste del abridor (regresión bayesiana de ERA):**
   `ERA_reg = (ERA·IP + ERA_equipo·80)/(IP + 80)` · `f = 1 + .55·(ERA_reg/ERA_equipo − 1)` · `ra *= f`.
   Un abridor mejor que el promedio del equipo baja la carrera promedio recibida; el titularidad no confirmado se refleja en ERA/IP nulos o etiquetas "(proyectado)". Notas quedan como badges.
3. **Pitágoras béisbol:** `py=rs^1.83/(rs^1.83+ra^1.83)` → Log5 → localía .54 → shrink .85 → `pH`.
4. **Carreras proyectadas:** `gh=H.rs·A.ra/LG`, `ga=A.rs·H.ra/LG`; `line=half(tot)`.
5. **Distribución NORMAL (no Poisson):** Over/Under = `1−φ((line−tot)/SD)`; run line ±1.5 = `1−φ((1.5−dif)/SD)` con `dif` del favorito. **φ es la misma aproximación de Abramowitz-Stegun** que el módulo `stats.ts` del proyecto (misma constante 0.2316419).
6. **6 mercados:** ganador, O/U, ±1.5. **Pick = mercado de mayor probabilidad** (`pick=O.reduce(max)`), sin jerarquía de dominio.
7. **Combinada condicional:** favorito ≥65% → Over **7.5 si tot≥8** (si no 6.5), matriz condicional con empates repartidos (en béisbol el empate no existe; `cmbOT` se usa igualmente sobre la rejilla de carreras 0..25). Umbral .40.
8. **Auditorías:** `nn=true` → sin ajustes de bajas/abridores ("Modo auditoría · sin noticias del día" — usa solo RS/RA de temporada).
9. **Valor/sizing y PICK/parlay:** reglas del shell compartidas; MLB no ejecuta PICK DEL DÍA (temporada terminada).

**DESCONOCIDO:** nada del cálculo observable. Las métricas sugeridas por el prompt que **no** aparecen (y por tanto no se implementaron): FIP, WHIP, OPS/wOBA, descanso, estadio, clima.

## 4. Ingeniería inversa de resultados (experimentos)

- **E4 (backtest propio del sitio, 17 juegos de postemporada):** con las condiciones declaradas por la UI (modo auditoría: sin abridores ni jugadores clave), el motor reconstruido reproduce **exactamente** los contadores que la tarjeta de auditoría muestra en pantalla: **Pick del modelo 9/17 ✓ · Ganador por ML 11/17 ✓**.
- **E4b (tarjeta individual):** CWS@CLE (ALDS J4, final 5–9) → pick pre-juego **"CLE +1.5"** con **✓ 5–9** — idéntico a la primera tarjeta observada en la captura REA de la página MLB.
- **Proy por juego:** ej. CWS@CLE "Proy 4.5–4.2" en UI; MIL@LAD J1 "Misiorowski vs Skubal" con ajustes de abridor — reproducidos por paridad.
- **Paridad total:** los 17 juegos + simulador MIL@LAD **con abridores reales del original** (mis/sku) — ε<1e-9 vs oráculo, incluyendo `gh/ga/line/pH/notes`.

## 5. Validación (requisito 7)

- Paridad exacta vs oráculo (17 juegos, con y sin abridores).
- Backtest sin filtración: la auditoría corre con `nn=true` y datos `D` previos — condiciones declaradas por el propio sitio.
- **Brier medio del pick = 0.2523** sobre los 17 juegos (informativa; el original no la publica).
- Límite honesto: muestra de 17 juegos → los contadores de auditoría son estables por construcción pero la calibración a largo plazo no es evaluable con el material embebido.

## 6. Trazabilidad

| Componente | Nivel |
|---|---|
| Datos (equipos/abridores/bateadores/timeline), pipeline y reglas | **OBSERVADO** |
| Valores de UI (9/17, 11/17, "CLE +1.5", proys) | **OBSERVADO** (capturas REA + E4/E4b) |
| Impactos por bateador (.05–.50) y sensibilidades del abridor (.55, prior 80 IP) | **OBSERVADO** como constantes; su fundamentación editorial | **DESCONOCIDO** |
| Motivos por los que el autor eligió normal (y no Poisson) para carreras | **INFERIDO** (la normal con σ=3√2 es la elección clásica para totales de carreras; el original no lo documenta) |
| Reexpresión TS (`baseball.ts`) | **RECONSTRUIDO** con paridad exacta demostrada |

## 7. Diferencias respecto al motor original

**Ninguna en el cálculo observable.** Paridad ε<1e-9 sobre los 17 juegos de postemporada y el simulador con abridores; los contadores de auditoría y las tarjetas individuales coinciden carácter a carácter con la UI observada. Como en los otros deportes: el gate del rebuild es server-side (mejora deliberada) y el origen aguas arriba de los datos embebidos queda DESCONOCIDO. La reconstrucción del motor es **exacta** en su dominio observable — no una aproximación.
