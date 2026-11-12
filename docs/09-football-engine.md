# 09 — Motor de FÚTBOL de AztecaVet: informe técnico de reconstrucción

**Fecha:** 2026-11-08 · **Fuente investigada:** https://aztecavet.com/ (acceso autorizado por el propietario, clave [REDACTED_PIN]) · **Método:** REA + análisis del bundle público decodificado (`aztecavet-analysis/`) + oráculo verbatim + paridad sobre 242 partidos.
**Implementación:** `src/domain/aztecavet/football.ts` · **Oráculo:** `reference/aztecavet/football-ref.mjs` · **Pruebas:** `tests/domain/aztecavet-parity.test.ts`, `aztecavet-experiments.test.ts` · **Evidencia:** `evidence/statistical-tests/aztecavet-experiments.json`, capturas REA en `evidence/screenshots/`.

---

## 1. Procedencia de los datos (OBSERVADO)

| Dato | Origen observado | Evidencia |
|---|---|---|
| Equipos (115): código, liga, GF/GC/PJ 2025-26, tabla parcial 2026-27 | **Embebido** en el bundle (constante `TD` de fb.html; sin red) | REA: familia `request` = 0 relaciones; runtime solo `GET /` |
| Calendario/auditorías (242 juegos en 5 torneos) | Embebido (`DD`, horas CST) | REA ev_cab4b9f5, session2.json |
| Bajas y sanciones (215) | Embebidas (`NW`) **con cita periodística y fecha** por entrada (SI, Sports Mole, Yahoo Sports, UEFA, TUDN, ESPN, FutMercado, Excélsior, ClaroSports, RotoWire, FPL…) | lectura del bundle; nota del original lista ~40 fuentes |
| Cuotas reales | **Ninguna**: no hay API de cuotas. El usuario escribe sus cuotas y el motor calcula EV | el bundle no contiene proveedores de momios |
| Frecuencia de actualización | **Estática**: snapshot "DATOS AL 6 NOV 2026" horneado en el HTML; el reloj es client-side | INFORME-PROFUNDO §8 |

**Transformaciones previas al cálculo (OBSERVADO):** `est(gd)=[55+gd/2,55−gd/2]` estima GF/GC por diferencia de goles para equipos marcados "ESTIMADO"; los "SIN DATO" usan el promedio de liga; los "ASCENDIDO" carecen de datos de primera división. La fase 2026-27 se integra con **peso ×3** (`F+=3·cur0; G+=3·cur2`).

**DESCONOCIDO:** el origen aguas arriba de los datos embebidos (quién los compila y con qué periodicidad real). El pipeline observable empieza en el bundle.

## 2. Arquitectura del motor (OBSERVADO)

**100% en el navegador.** No hay backend, API ni modelo precalculado: `model()` se ejecuta en el cliente dentro del iframe (srcdoc) por partido. REA confirma 0 llamadas de red y el cálculo corre en `requestAnimationFrame`-independiente al renderizar la tarjeta. El procesamiento es local y síncrono (µs por partido).

## 3. Variables, fórmulas y reglas (OBSERVADO — transcritas del bundle)

**Constantes exactas:** `LG0={PL:1.45,LL:1.35,MX:1.51,SA:1.21,BL:1.62,L1:1.41,OT:1.40}` · `STR={PL:1,LL:.98,BL:.96,SA:.96,L1:.92,MX:.8,OT:.85}` · `LGU=1.45` · `E=1.7` · `HFA=.54` · `SHR=.85` · `DRAW=.28` · `DCO=.42` · `K=6` · `NG=14` · `rho=−.14 (MX) / −.08 (resto)` · `CMIN=.35` · `EVMIN=.04`.

**Pipeline confirmado:**

1. **Tasa de equipo (shrink bayesiano):** `rs=(GF+K·LG)/(PJ+K)`; con fase actual: `F+=3·cur0; G+=3·cur1; G+=3·cur2` antes del shrink.
2. **Escala Copa (solo UCL/UEL):** `rs'=rs/lg·s·LGU`, `ra'=ra/lg/s·LGU` con `s=STR[liga]`.
3. **Bajas:** por jugador `x` con `st>0` del equipo `t`: si `r="gf"` → `rs−=i·st`; si `r="ga"` → `ra+=i·st`; piso 0.3. En auditorías (`au=true`) no se aplican.
4. **Pitágoras:** `py(t)=rs^1.7/(rs^1.7+ra^1.7)` → `x=py(H), y=py(A)`.
5. **Log5 + localía + shrink:** `pn=(x−xy)/(x+y−2xy)`; `o=pn/(1−pn)·(.54/.46)`; `share=.5+.85·(o/(1+o)−.5)`.
6. **Goles proyectados:** `lh0=H.rs·A.ra/LG`, `la0=A.rs·H.ra/LG`; **tilt por bisección** (16 iteraciones sobre ±1.5 en espacio log): multiplica `exp(m)`/`exp(−m)` hasta que el share condicional Poisson iguale `share`.
7. **Distribución de marcadores:** Poisson 0..13 con **corrección Dixon-Coles τ**: `ρ00=1−lh·la·ρ`, `ρ01=1+lh·ρ`, `ρ10=1+la·ρ`, `ρ11=1−ρ` (ρ=−.14 Liga MX, −.08 resto).
8. **18 mercados base:** 1X2 (w/d/l), O/U línea (`line=half(tot)`, nunca entera), favorito −1.5 / perdedor +1.5 (p→m2h/m2a), DC 1X/X2/12, O/U 1.5, O/U 3.5, totales por equipo (`lH=half(lh)`), ambos anotan `(1−e^−lh)(1−e^−la)`.
9. **Pick jerárquico:** dominio (mejor ataque Y defensa) con p≥.42 → "GANA · DOMINA…"; dominio cerrado → DC; favorito ≥.5 → "FAVORITO (sin dominio total)"; DC ≥.65 → "OPCIÓN MÁS SEGURA"; si nada → Under 3.5. Empate ≥28% sobre ganador directo → DC ("EMPATE PROBABLE"). DC sola que paga poco → **DC+Over 1.5** si la probabilidad conjunta condicional ≥.42 ("DOBLE OPORTUNIDAD + GOLES").
10. **Combinada condicional "FAVORITO CLARO · GANA + GOLES"** (`COMBOS`): si favorito ≥62% y empate <28% → la combinada **reemplaza al pick**: Over 2.5 si `tot≥2.6` o GF/juego del favorito ≥3; si no Over 1.5. Probabilidad por matriz conjunta condicionada: `P(fav)·P(B|fav)` con empates repartidos (`cmbOT`). Umbral `.35`.
11. **Valor (fase 6 del prompt):** EV = p·cuota−1 con cuota decimal **o americana** (`|v|≥100 → 1+v/100 / 1+100/−v`); sizing binario **5%/10%** (10% si p≥th, th configurable .55–.70, default .60); **EV≥+4%** obligatorio o "NO APOSTAR". `noVig` calcula probabilidades sin margen por grupos complementarios y muestra "Margen casa X: y%".
12. **PICK DEL DÍA / PARLAY:** scoring `sin valor→−1; con valor→2+p; p<.55→−.5; p>.72→.72−2(p−.72)`; parlay de mercados 60–80% con cuota de respaldo `1/(p·1.05)` (×1.10 si combinada).

**Hipotético/DESCONOCIDO:** nada del cálculo; todo el pipeline es observable. Único elemento no observable: el puente `window.claude` del hosting (afecta a la persistencia del boleto, no al motor).

## 4. Ingeniería inversa de resultados (experimentos controlados)

Evidencia completa en `evidence/statistical-tests/aztecavet-experiments.json` (9 experimentos). Resumen:

- **E1 (UI viva):** NEC–TIJ → "TIJ gana 47.9%", proyección 1.2–1.7 — **idéntico** a la captura REA de Liga MX. ATL–SAN → combinada "Empate o SAN + Over 1.5" **51.1%** — idéntico.
- **E2 (cuota):** con p=0.4785 fija, cuotas 1.50/1.90/2.05/2.20 → EV −28.2%/−9.1%/−1.9%/+5.3% → sizing 0/0/0/5% y `bestOf` solo dispara con EV≥+4%. Confirma los umbrales EVMIN=.04 y th=.60.
- **E3 (baja):** SLP–JUA con Madson (JUA, gf, 0.04) fuera→disponible→fuera: prob. de JUA **0.2023→0.2109→0.2023** (+0.86 pp). Determinismo verificado (restauración exacta).
- **E4 (backtest propio del sitio, MX J15):** Pick del modelo **8/9**, favorito sin empate **6/7** — contadores que la UI muestra en el header de auditoría.
- **E5 (paridad estructural):** La Liga J11 completa — **máx Δ prob vs oráculo verbatim = 0**.

## 5. Validación (requisito 7)

- **Paridad total:** 242 partidos (29 próximos + 213 auditorías) × mercados/pick/etiquetas/razones/líneas — **ε<1e-9, en la práctica Δ=0** contra el oráculo extraído verbatim del bundle (324 tests).
- **Backtesting sin filtración:** las auditorías del propio bundle comparan el pick pre-juego (solo datos 2025-26, `useCur=false`, sin bajas) contra marcadores finales; el motor reconstruido reproduce los contadores. No se usaron datos posteriores a cada jornada para calibrar nada: **no hay calibración ajustable en el original** (constantes fijas).
- **Calibración (Brier) del pick de confianza en auditorías:** calculada como métrica informativa en las evidencias NHL/MLB; el original no la muestra.
- **Límites:** la auditoría usa "solo con datos de la temporada pasada (sin la tabla 2026-27). Muestra pequeña" — el propio sitio advierte sesgo de muestra.

## 6. Trazabilidad (requisito 8)

| Componente | Nivel |
|---|---|
| Datos embebidos y sus transformaciones (est/cur/peso ×3) | **OBSERVADO** |
| Pipeline matemático completo (constantes, fórmulas, reglas de pick, combinadas, noVig, valor) | **OBSERVADO** |
| Ejecución client-side sin red | **OBSERVADO** (REA: 0 requests) |
| Valores de UI (47.9%, 51.1%, contadores de auditoría) | **OBSERVADO** (capturas REA + experimentos E1/E4) |
| Procedencia aguas arriba de los datos embebidos | **DESCONOCIDO** |
| Puente `window.claude` del hosting (persistencia del boleto; no afecta al motor) | **DESCONOCIDO** (solo su contrato público) |
| Reexpresión en TypeScript (`football.ts`) | **RECONSTRUIDO** con paridad demostrada (no "aproximación": equivalencia exacta en ε<1e-9 sobre todas las entradas del bundle) |

## 7. Diferencias respecto al motor original

**En el cálculo: ninguna.** Las fórmulas fueron observadas directamente en el código cliente (no son privadas ni de servidor) y la implementación limpia pasa 324 tests de paridad con Δ=0 sobre los 242 partidos y 5 torneos. Las únicas diferencias del rebuild completo son deliberadas y ajenas al motor: (1) el gate de acceso se valida server-side en nuestra reconstrucción (el original compara "[REDACTED_PIN]" client-side), y (2) la capa de UI es un port organizado en módulos. En cuanto al motor estadístico, la reconstrucción es **exacta** en el dominio observado; cualquier comportamiento ante datos que el bundle no contiene (equipos/ligas nuevos) está fuera del dominio observable y queda como DESCONOCIDO.
