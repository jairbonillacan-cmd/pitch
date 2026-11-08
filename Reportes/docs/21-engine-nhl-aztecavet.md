# 10 — Motor de NHL de AztecaVet: informe técnico de reconstrucción

**Fecha:** 2026-11-08 · **Fuente:** https://aztecavet.com/ (autorización del propietario) · **Implementación:** `src/domain/aztecavet/hockey.ts` · **Oráculo:** `reference/aztecavet/hockey-ref.mjs` · **Pruebas:** parity NHL (61 juegos + sim) · **Evidencia:** `evidence/statistical-tests/aztecavet-experiments.json` (E1-NHL, E4-NHL).

---

## 1. Procedencia de los datos (OBSERVADO)

| Dato | Origen | Detalle |
|---|---|---|
| 32 equipos, GF/GA 2025-26 (82 juegos) | Embebido (`T`) — STL con 0/0 = "SIN DATO" | sin red (REA: 0 requests) |
| 224 resultados 2026-27 + 11 de auditoría | Embebidos (`R`, `AUD`) — juego a juego en orden | |
| 88 noticias/lesiones con impacto | Embebidas (`N`) con fuente y fecha (NHL.com, DailyFaceoff, DobberHockey, TSN, RotoWire, CBS…) | incluyen **traspasos** como evento de fuerza (Hellebuyck→NJ modelado con impacto 0.35 al equipo que lo pierde) |
| Horarios 6–13 nov (61 juegos, incl. Helsinki 11:00 AM) | Embebidos (`D`) | |
| Cuotas | No hay proveedor; el usuario escribe cuotas | |

**Transformación previa clave (OBSERVADO):** `build()` mezcla el promedio de la temporada 2026-27 con el prior de 25-26 mediante **freno bayesiano `w=n/(n+15)`**; prior = `250/82 ≈ 3.05` goles/juego para equipos sin dato. Encima, una **redefinición de `build`** añade **forma reciente**: los últimos 5 juegos de un equipo con ≥7 disputados pesan **30%** (`FORMW=.3`) en rs/ra, y expone `f5`.

**Dos tablas coexistentes:** `S=build(R.concat(AUD))` (temporada completa, para días futuros) y `SA=build(R)` (solo previo al 5 nov, para auditorías). Las auditorías usan SA y **sin noticias del día** (`nn=true`).

## 2. Arquitectura (OBSERVADO)

Idéntica al fútbol: cálculo 100% client-side por partido, sin red ni backend. REA y el análisis del bundle no muestran API ni Workers.

## 3. Variables, fórmulas y reglas (OBSERVADO)

**Constantes:** `E=2.15` · `HFA=.525` · `K=15` · `SHR=.85` · `NG=22` · `FORMW=.3` · `CMIN=.40` · prior 250/82.

**Pipeline confirmado:**

1. **Fuerza efectiva (`eff`):** rs/ra de la tabla (`S` o `SA`); por noticia `x` con `st>0` del equipo: `gf → rs−=i·st`, `ga → ra+=i·st` (**impacto en goles/juego**; porteros 0.25–0.40: Shesterkin .40, Hellebuyck .35, Ullmark .30, Gustavsson .25); piso 1.5. Devuelve `nt` (notas aplicadas) que la UI lista como badges.
2. **Pitágoras hockey:** `py=rs^2.15/(rs^2.15+ra^2.15)`.
3. **Log5 + localía .525 + shrink .85** → `pH` (prob. de victoria del local **incluyendo OT/SO**, sin corrección de empate: el hockey no necesita Dixon-Coles porque OT absorbe los empates a 60').
4. **Goles:** `lh=H.rs·A.ra/LG`, `la=A.rs·H.ra/LG` (LG = promedio de liga calculado `sum(rs)/32`).
5. **Rejilla Poisson 0..21** sin τ → w/d/l a 60 min, m2h/m2a (±2).
6. **15 mercados:** ML local/visitante, ±1.5, O/U `line=half(tot)`, **"60 min"** (1X2 reglamentario w/d/l), totales por equipo, ambos anotan.
7. **Pick jerárquico:** dominio (mejor ataque y defensa) con ML≥.52 → "ML · DOMINA…"; si `max(pH,1−pH)≥.58` → "ML FAVORITO (sin dominio total)"; si no → la **más segura** de [dog +1.5, Over, Under] ("SIN VENTAJA CLARA · opción más segura").
8. **Combinada condicional:** favorito ≥65% → Over **5.5 si tot≥5.8** (si no 4.5) condicionado a `P(fav)·P(B|fav)` con empates repartidos a 60'; **filtro de consistencia `OVR(fc,L)≥.5`** (% histórico de juegos del favorito que superaron la línea). Umbral .40.
9. **Valor/sizing:** mismas reglas del shell (EV≥+4%, 5%/10%, noVig con grupos ML/±1.5/total/60min/totales/BTTS).
10. **PICK DEL DÍA NHL:** mismo scoring que fútbol pero solo sobre el día actual; mercados elegibles de parlay: `mlh,mla,plf,pld,ov,un` entre 60–80%.

**DESCONOCIDO:** nada del cálculo.

## 4. Ingeniería inversa de resultados (experimentos)

- **E1 (UI viva):** MIN–SJ → "MIN gana + Over 5.5" **41.4%** (combinada favorito claro) · BUF–CBJ → **CBJ +1.5 74.9%** ("SIN VENTAJA CLARA · opción más segura") · CGY–ANA → **ANA gana (ML) 58.5%** — los tres valores **idénticos** a la captura REA del ranking del día.
- **E2 (heredada del shell):** umbrales EV≥+4% / 5%/10% compartidos.
- **E4 (backtest propio del sitio, 5 nov):** sobre los 11 juegos auditados — Pick de confianza **8/11**, Ganador ML **9/11**, **Brier = 0.236** (métrica informativa; el original no la muestra). El header de la app muestra estos contadores con la nota "Calculado solo con datos previos al 12 oct y sin noticias del día".
- **Paridad:** 61 juegos del calendario (50 futuros + 11 auditoría) + simulador COL@CAR — ε<1e-9 vs oráculo (incluidos `pH`, `lh/la`, etiquetas y las notas aplicadas).

## 5. Validación (requisito 7)

- Paridad exacta total vs oráculo (tests).
- Backtest con los datos que el propio bundle publica para el 5 nov, usando **SA** (tabla sin la auditoría: sin filtración temporal) y `nn=true` (sin noticias del día) — exactamente las condiciones que declara la UI.
- Brier medio del pick de confianza: 0.236 (43 juegos de las auditorías combinadas NHL+MLB: 0.2523 en MLB se reporta en su informe).

## 6. Trazabilidad

| Componente | Nivel |
|---|---|
| Datos, transformaciones (build/forma/OVR), pipeline y reglas | **OBSERVADO** |
| Valores de UI (41.4/74.9/58.5, contadores 8/11 · 9/11) | **OBSERVADO** (capturas + E1/E4) |
| Impactos individuales de lesiones (i=0.02–0.4) | **OBSERVADO** como constantes del bundle; su **fundamento** (por qué .35 a Hellebuyck) es decisión editorial del autor — **DESCONOCIDO** |
| Puente de hosting (`window.claude`) | **DESCONOCIDO** (no afecta al motor) |
| Reexpresión TS (`hockey.ts`) | **RECONSTRUIDO** con paridad exacta demostrada |

## 7. Diferencias respecto al motor original

**Ninguna en el cálculo observable.** Paridad ε<1e-9 en los 61 juegos + simulador y reproducción exacta de los valores de UI. La reconstrucción del motor es **exacta** en el dominio observable; el resto es idéntico al informe de fútbol (gate server-side como mejora deliberada del rebuild; origen aguas arriba de los datos DESCONOCIDO).
