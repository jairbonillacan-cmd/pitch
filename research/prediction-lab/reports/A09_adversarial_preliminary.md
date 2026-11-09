# A09 — Auditoría adversarial preliminar de motores, tests y datos

**Worktree:** `/Users/jairbonilla/PitchLab-Prediction-Lab` · **Rama:** `prediction-lab` · **Commit:** `8424876` (2026-11-08)
**Fecha:** 2026-11-09 (America/Mexico_City) · **Alcance:** motores `src/domain/**`, tests `tests/**`, datos `src/data/*.json`, evidencia `evidence/statistical-tests/aztecavet-experiments.json`, docs `docs/09-11`.
**Restricciones cumplidas:** no se modificó `src/`, `tests/`, `docs/` ni git. Se ejecutó `npx vitest run`; el archivo de evidencia que la suite reescribe se restauró a la versión de `HEAD` (`git show HEAD:...`). Los cálculos independientes se hicieron con Python 3 y con sondas `vite-node` locales; no se consultaron fuentes externas de datos.
**Etiquetas:** **OBSERVADO** = salida de comando o línea de archivo; **INFERIDO** = consecuencia lógica explicitada. No hay afirmaciones de "podría ser".

---

## 0. Veredicto ejecutivo

**NO. Los motores actuales no pueden llamarse "motor de predicciones validado".** Son una reconstrucción de alta fidelidad —y verificable— de heurísticas de terceros; la fidelidad está demostrada, la validez predictiva no.

Hechos que sostienen el veredicto:

1. **Hay leakage real y localizado, no ubicuo.** Liga MX usa totales de la temporada en curso (`gp=15`, `cur=0`) para "predecir" partidos de esa misma temporada; al excluir el propio partido, el backtest MX J15 cae de **8/9 a 5/9**, y el agregado J13–J15 de **20/27 a 16/27** (R01). La NHL tiene las 11 auditorías dentro de `nhl-results.json`; `SA=build(R)` las incluye y `S=build(R.concat(AUD))` las cuenta dos veces: **8/11 → 7/11** picks y **9/11 → 7/11** ML (R02).
2. **La suite verde no verifica los backtests.** `batch-verify.test.ts` imprime **"BACKTEST-NCAA: 2-3 (UI observada: 4-1)"** y pasa porque no tiene ningún `expect`; además evalúa el ML del motor, no el pick almacenado `g.pk`. E4 fútbol sólo asserta `hit > 0`; E4 NHL `hit >= 0`; `sensitivity.test.ts` sólo hace `console.log` (R03).
3. **Paridad ≠ validación.** Los 324 tests comparan contra un oráculo extraído *verbatim* del mismo bundle, con las mismas constantes. Prueban que el port TS es fiel; no que las probabilidades sean correctas. Un bug fielmente reproducido (p. ej. `NOB`, R09) pasa paridad.
4. **En la única muestra etiquetada (213 auditorías), el modelo está descalibrado.** Empate medio predicho **25.90 %** vs observado **16.43 %** (z ≈ −3.16); 1X2 Brier **0.6010** vs climatología in-sample **0.6227** (BSS sólo **+3.48 %**); con ρ=0 el Brier baja a **0.5962** y el log-loss a **0.9990**; el ρ que maximiza verosimilitud es **positivo**, no −0.08/−0.14 (R05).
5. **Los mercados no son conjuntamente coherentes.** Over/Under y BTTS se calculan fuera de la matriz Poisson+τ: hasta **1.05 pp** en Over y **1.78 pp** en BTTS; las combinadas mezclan matriz independiente y τ (R06).

**Balance:** 3 hallazgos críticos, 9 altos, 6 medios y 3 bajos. Lo que sí es correcto se documenta en §2 para no fabricar problemas: la matriz 1X2 **sí suma 1** (error máximo 7.7×10⁻⁷), la corrección τ **no necesita renormalización** (preserva masa analíticamente), `noVig` y los mercados complementarios están bien, y la separación auditoría/resultados de NFL y NCAA no muestra solapamiento de arrays (aunque no hay fechas que lo demuestren).

---

## 1. Método

- Lectura completa de los cinco motores, `stats.ts`, `betting.ts`, `props.ts`, `picks.ts`, `bankroll.ts`, los seis tests de dominio, el test Linemate, los datos y la evidencia.
- `npx vitest run --reporter=dot`: **9 archivos, 416 tests, 416 passed** (incluye 3 copias del test Linemate; el dominio relevante son 392).
- Reimplementación independiente en Python del pipeline de fútbol (`base → rate → inj → Pitágoras → Log5 → HFA → tilt → Poisson+τ → pick`) para 242 partidos. Se validó contra los valores del motor: NEC–TIJ `lh=1.230903`, `la=1.742068`, pick TIJ `47.8517 %`; MX J15 `8/9`. Esa réplica se usó para masa, mercados, calibración y leakage.
- Sondas TypeScript con `vite-node` contra `FootballEngine`, `HockeyEngine` y `BaseballEngine` para el leakage MX/NHL, `NOB`, MLB y overrides. No se copiaron cifras de la UI ni del informe A01; las que coinciden se señalan.
- Los cálculos de calibración usan las **213 auditorías** de fútbol (27 MX, 30 LL, 30 PL, 54 UCL, 72 UEL). Limitaciones: no hay fecha por partido, los equipos se repiten, y la tasa de empate de la muestra es atípicamente baja (16.4 %; UCL 9.3 %). Por eso los IC se reportan como i.i.d. y se advierte que un bootstrap por equipo/liga los ampliaría.

---

## 2. Registro de riesgos priorizado

### 2.1 Críticos

| ID | Sev. | Hallazgo | Evidencia (archivo:línea / comando) | Impacto | Corrección propuesta |
|---|---|---|---|---|---|
| **R01** | **Crítico** | **Leakage Liga MX:** `base()` usa `t.gf/t.ga/t.gp` siempre; `au=true` sólo desactiva `cur` y bajas. Para MX, `gf/ga/gp` son la temporada 2026-27 en curso (15 PJ, `cur=0`), no la 2025-26. El "backtest" J15 usa el resultado del propio partido (y J13/J14 usan además jornadas posteriores). | `src/domain/aztecavet/football.ts:158-173` (usa `t.gf/ga/gp`; `useCur` sólo añade `cur`), `:200-201` (`!au`), `:184-196` (bajas off); `src/data/aztecavet-fb-teams.json:672-681` (SAN 21/20/15, `cur=0`), `:683-692` (NEC 16/28/15), `:507-516` (TOL 31/21/15); `tests/domain/aztecavet-experiments.test.ts:145-157` (`MX[3]`, `model(...,true)`, `8/9`). Comando: sonda `probe_fb_leak.ts` (excluye J15, J14+J15, J13+J14+J15 de los totales). | **8/9 → 5/9** en J15; J14 **5/9 → 4/9**; J13 7/9 → 7/9; agregado **20/27 → 16/27**. Cambios de pick de hasta **17.7 pp** (AME–TOL: `dco15` 61.0 % W → `h` 43.3 % L). Cualquier calibración/EV de MX está contaminada. | Totales point-in-time: restar el partido objetivo **y todos los posteriores**; guardar `match_date` y construir el estado con `date < kickoff`. Test de fuga: al eliminar el partido objetivo, las features pre-partido deben ser idénticas. |
| **R02** | **Crítico** | **Leakage NHL + doble conteo:** las 11 auditorías están en `nhl-results.json`; `SA=buildWithForm(R)` las incluye, y `S=buildWithForm(R.concat(AUD))` las suma dos veces. La documentación afirma que `SA` es "sin la auditoría". | `src/domain/aztecavet/hockey.ts:143-146` (`S=R.concat(AUD)`, `SA=R`), `:123-141` (forma con los últimos 5, incluido el partido auditado); `src/data/aztecavet-nhl-results.json:1281-1345` (bloque PIT…COL con los 11 resultados); `src/data/aztecavet-nhl-audit.json` (los mismos 11); `docs/10-nhl-engine.md:19` y `:54` ("SA=build(R)", "sin la auditoría"). Test: `tests/domain/aztecavet-experiments.test.ts:159-180` usa `nh.SA`. | Auditoría: **8/11 → 7/11** picks y **9/11 → 7/11** ML al excluir las 11. `S` tiene 235 partidos (470 team-games) donde sólo hay 224 únicos (448): 11 partidos duplicados para 22 equipos; pH de "Hoy" cambia hasta 0.56 pp (BUF–CBJ .5202 vs .5258). `OVR` también usa `R.concat(AUD)`. | Deduplicar por `match_id`; `SA` debe filtrar `date < audit_date`; `S` debe construirse de resultados únicos. Test: `SA ∩ AUD = ∅` y `n(S)=n(unique)`. |
| **R03** | **Crítico** | **Tests que no verifican lo que dicen:** el backtest NCAA imprime 2-3 frente al 4-1 observado y **pasa**; además usa el ML del motor (`pickSide = m.pH >= .5 ? g.h : g.a`) y no el pick almacenado `g.pk`, que sí daría 4-1. E4 fútbol sólo exige `hit > 0`; E4 NHL `hit >= 0`; `batch-verify` NFL/NCAA y `sensitivity` no tienen `expect`. | `tests/domain/batch-verify.test.ts:84-108` (sin `expect`; `stored` sólo se loguea en `:98`; `won` se calcula con `m.pH` en `:103-104`); `tests/domain/aztecavet-experiments.test.ts:156` (`toBeGreaterThan(0)`) y `:179` (`toBeGreaterThanOrEqual(0)`); `tests/domain/sensitivity.test.ts:10-35` (sólo logs); `tests/domain/batch-verify.test.ts:35-59,61-82` (sólo logs). `npx vitest run` → 416/416. | La suite verde no protege contra regresiones ni detecta el leakage R01/R02. El propio log contradice la afirmación "reproducir el registro 4-1" y nadie falla. | Convertir cada backtest en aserciones exactas de conteo/métrica; fallar si no coincide; test meta que exija ≥1 `expect` en tests de backtest; separar "paridad" de "validación". |

### 2.2 Altos

| ID | Sev. | Hallazgo | Evidencia | Impacto | Corrección |
|---|---|---|---|---|---|
| **R04** | Alto | **Paridad presentada como validación.** 324 tests comparan el port contra `reference/aztecavet/*.mjs`, código *verbatim* del bundle con las mismas constantes. La documentación usa esa paridad como "Validación (requisito 7)". | `tests/domain/aztecavet-parity.test.ts:59-70` (`EPS=1e-9`, compara `mine` vs `theirs`), `:72-97` (242 partidos); `reference/aztecavet/football-ref.mjs:1-14` (bundle verbatim); `docs/09-football-engine.md:57-59` ("Validación ... paridad total"); `src/domain/aztecavet/football.ts:1-10` (reconstrucción). | La fidelidad es real, pero no dice nada sobre log-loss, calibración o edge. Un modelo con ρ erróneo, `NOB` roto y leakage pasa los 324 tests. | Etiquetar como "fidelidad/transcripción"; reservar "validación" para métricas out-of-sample contra baseline/mercado; no contar paridad en el veredicto predictivo. |
| **R05** | Alto | **Descalibración y ρ no soportado.** En 213 auditorías: media predicha h/d/a = .3895/.2590/.3516 vs observada .4413/.1643/.3944; empate esperado 55.16, observado 35 (z = −3.16). Brier 1X2 .60104 vs climatología in-sample .62272 (BSS +3.48 %), log-loss 1.00722. Con ρ=0: Brier .59619, log-loss .99901. El ρ óptimo in-sample es positivo (+0.30 en la rejilla, frontera). | `src/domain/aztecavet/constants.ts:33-34` (ρ −0.14 MX / −0.08 resto); `src/domain/aztecavet/football.ts:216-222` (τ); cálculos §3.3. Diferencia Brier τ−ρ0 = +0.00486, IC95 % i.i.d. [+0.00183, +0.00789]; log-loss +0.00820 [+0.00282, +0.01358]. | El skill es marginal (BSS +3.48 %) y el término DC lo reduce; el empate está sobreestimado 9.5 pp. Los EVs y picks se construyen sobre probabilidades descalibradas. | Split temporal; estimar ρ (y el nivel de empate) en train; congelar; evaluar log-loss/RPS/Brier con bootstrap por bloques; no hardcodear ρ negativo. |
| **R06** | Alto | **Mercados incoherentes:** 1X2 sale de la matriz con τ; Over/Under y BTTS se calculan con Poisson independiente; las combinadas `cb_` usan matriz independiente con `pF` de τ. | `src/domain/aztecavet/football.ts:223-241` (matriz τ; `pO=over(tot,line)`, `bt=(1-e^-lh)(1-e^-la)`), `:291-319` (`dco15` sí usa τ), `:323-346` (`cmbBuild` con `P×Q` independiente). Cálculos §3.4. | `pO − P_matriz(over)` hasta **−1.049 pp** (GET–RVC, línea 1.5: .4955 vs .5060); `bt − P_matriz(BTTS)` hasta **−1.785 pp** (TIG–LEO: .5003 vs .5182); media abs(...) 4.3e−5 y 9.8e−3. Con cuota 1.9, 1.8 pp de p mueve el EV 3.4 pp y puede cruzar EVMIN=.04. | Derivar **todos** los mercados de una única matriz conjunta (o declarar explícitamente el modelo de totales y calibrarlo); test de identidades: `pO+pU=1`, `pBTTS+pNoBTTS=1`, `pO = Σ_{i+j>line} M_ij`. |
| **R07** | Alto | **El tilt de localía cambia el total de goles.** `tilt` multiplica `lh` por `e^m` y `la` por `e^-m`; el producto se conserva pero la suma no. El total post-tilt alimenta Over/Under y BTTS. Después, τ vuelve a mover el share condicional. | `src/domain/aztecavet/football.ts:63-74` (tilt), `:210` (aplica), `:233` (`line=half(tot)`), `:240-241`. Cálculo §3.5: cambio de total mínimo **−0.456** (UCL VIK–BMU 4.235→3.779), medio −0.0229, abs(...) medio .0265. Share final vs objetivo: hasta **1.079 pp** (MX CHI–NEC .7685 vs .7793); 240/242 partidos con abs(Δ)>1e−4; el solver independiente sí converge (≤2.0e−5). | Ajustar el ratio **manteniendo el total fijo**, o modelar home/away en un modelo bivariado; recalcular el objetivo tras τ; test: `lh+la` no debe cambiar al calibrar el share. |
| **R08** | Alto | **Parámetros duros sin estimación ni validación:** E=1.7, HFA=.54, K=6, SHR=.85, ρ, DRAW=.28, DCO=.42, CMIN=.35, EVMIN=.04, sizing 5/10 %. No hay artefacto de ajuste ni calibración; el repo lo admite ("constantes fijas"). | `src/domain/aztecavet/constants.ts:17-36` y `:78-93`; `src/domain/engine-nfl.ts:13-20`; `src/domain/engine-ncaa.ts:15-23`; `src/domain/aztecavet/baseball.ts:59-75`; `docs/09-football-engine.md:60`. | El objetivo de share condicional (HFA/SHR) no está claramente desviado: media 52.3 % vs observado 52.8 % (§3.6), pero no hay IC ni validación. ρ sí es dañino; DRAW/DCO/CMIN no tienen justificación y cambian picks. Sin calibración, "10 %" no tiene base. | Estimar en train y congelar; reportar sensibilidad; sustituir umbrales mágicos por reglas calibradas; documentar cada constante con fuente y fecha. |
| **R09** | Alto | **`NOB` está roto en los tres motores:** devuelve `true` ("SIN VALOR") si existe **cualquier** cuota válida, sin comprobar si `bestOf` encontró EV≥4 %. | `src/domain/aztecavet/football.ts:426-431`; `src/domain/aztecavet/hockey.ts:336-340`; `src/domain/aztecavet/baseball.ts:226-230`. Sonda: cuota visitante 2.50, p=.478517 → `bestOf` = `a`, EV **+0.1963**, `NOB` = **true**. `scorePick` devuelve −1 con `nob` (`picks.ts:28-29`). | Un juego con +19.6 % de EV se etiqueta "SIN VALOR"; se excluye del pick del día/parlay. Afecta fútbol, NHL y MLB. | `NOB` debe ser `bestOf(...) === null` (con cuotas presentes) o comprobar `ev >= EVMIN` en algún mercado; añadir test con cuota de valor. |
| **R10** | Alto | **EV/sizing/bankroll:** (a) 10 %/5 % fijos sin importar la magnitud del edge; (b) parlay del mismo partido multiplica probabilidades y cuotas como si fueran independientes (sólo avisa con `corr`); (c) `fairDefault` no es "justa": añade 5 %/10 % de margen y se usa como cuota de respaldo en parlays; (d) no hay cuotas históricas, así que el EV/ROI no es validable. | `src/domain/aztecavet/bankroll.ts:28-31` (unitOf), `:65-84` (`slipSummary`: `p` producto, `ev` producto, `corr` sólo booleano), `:86-111` (`registerBet` no bloquea correlación); `src/domain/aztecavet/picks.ts:33-65` (fallback), `:67-70` (`parlayOdds` producto); `src/domain/betting.ts:104-105` (`fairDefault`). | Ejemplo: dos legs del mismo partido, home .55 a 2.0 y away .55 a 2.0 → el código da p=.3025, d=4, EV=+.21 y sizing 5 % (p<.6); el resultado conjunto real es 0 (sucesos mutuamente excluyentes), EV=−1. El fallback 1/(p·1.05) inventa un precio que no existe. | Kelly fraccional con tope; bloquear o modelar correlación same-match; exigir cuota real para EV; separar "cuota justa" de "cuota de respaldo"; límites de stake. |
| **R11** | Alto | **Calidad/cobertura de datos:** los `est(gd)` del bundle son totales **fabricados** (55±gd/2) con `gp=38`; `fl='e'` se guarda pero nunca se usa. Los equipos `n` con 0 PJ se tratan como media de liga; el esquema no es uniforme: MX guarda la temporada actual en `gf/ga` (`cur=0`), PL/LL guardan 38 PJ previos + `cur`, UCL/UEL tienen equipos con 0 PJ. | `reference/aztecavet/football-ref.mjs:17` (`est`), `:20` (MUN `...est(19),38`); `src/data/aztecavet-fb-teams.json:93-102` (MUN 64.5/45.5/38, `fl='e'`); `src/domain/aztecavet/football.ts:17-27` (guarda `fl`), `:158-173` (no lo usa). Cálculo §3.7: 50/213 auditorías con H y A exactamente iguales; 126/213 son UCL/UEL sin datos de temporada actual; 4 partidos PL con ambos equipos en 1.45. | Las fuerzas de equipo no son observaciones homogéneas; parte del "modelo" es una prior sintética. El 59 % de la muestra de auditoría de fútbol no usa forma actual. La comparación entre ligas no es válida. | Separar `observed/estimated/missing`; no asignar 38 PJ a estimaciones; exigir mínimo de partidos; schema canónico; reporte de cobertura por liga/equipo. |
| **R12** | Alto | **Diseño de experimentos:** E4 fútbol usa 9 juegos (J15) de 213 auditorías; E4 NHL 11; E4 MLB 17; Brier se calcula sobre el **pick seleccionado**, no sobre la distribución; no hay IC, baseline ni test reservado; no hay pre-registro que justifique usar sólo J15. | `tests/domain/aztecavet-experiments.test.ts:145-157` (9), `:159-180` (11), `:182-203` (17), `:166-178` (Brier del pick); `docs/09:54` (8/9), `docs/10:48` (8/11), `docs/11:45` (9/17). Cálculos §3.8. | Pick fútbol 131/213 (61.5 %) con p media .5208; Brier .24244 vs constante .23677. NHL .2360 vs constante .1983; MLB .2523 vs constante .2491. Todos peores que un forecast constante a la tasa observada. La muestra pequeña y la selección de pick hacen que los conteos no sean evidencia. | Pre-registrar métricas y baseline; evaluar 1X2 completo (Brier multiclase/RPS/log-loss); usar las 213 auditorías; bootstrap por equipo/liga; holdout temporal; no reportar Brier de pick seleccionado como calibración. |

### 2.3 Medios

| ID | Sev. | Hallazgo | Evidencia | Impacto | Corrección |
|---|---|---|---|---|---|
| **R13** | Medio | **MLB: moneyline y run-line son dos modelos distintos.** `pH` viene de Log5 con SHR=.85; `pc` de una normal de margen con σ=3√2 y `df=gh−ga`. La probabilidad implícita `Φ(abs(df)/σ)` no coincide con `pF`. | `src/domain/aztecavet/baseball.ts:106-134` (`pH` :115, `df` :123, `pc` :124). Cálculo §3.9: diferencia máxima **3.64 pp** (TB–MIL: pH=.466, pF=.534, implícita=.570; 17/17 con abs(Δ)≈3 pp). | `plf/pld` y `h/a` no son coherentes; el `pick` es argmax sobre mercados inconsistentes. | Derivar todos los mercados de una sola distribución (normal bivariada o Poisson de carreras) o calibrar `df` para que `Φ(df/σ)=pF`. |
| **R14** | Medio | **MLB: el "pick del modelo" es casi siempre el mismo mercado.** `pick = argmax(O)` elige `pld` (underdog +1.5) en **14/17**; acierta **9/17**, por debajo del favorito ML (**11/17**). | `src/domain/aztecavet/baseball.ts:137`; sonda `probe_mlb.ts`: 14/17 `pld`, 9/17 pick, 11/17 ML, 9/17 home, 8/17 over; Brier .2523 vs constante .2491. | El 9/17 no mide habilidad de match-winner; es una estrategia de +1.5 con p≈.6. La conclusión "reproduce la UI" es cierta; la conclusión "valida el motor" no. | Evaluar ML y run-line por separado; comparar con "siempre favorito ML" y "siempre +1.5"; reportar n y IC. |
| **R15** | Medio | **τ produce probabilidades negativas con overrides permitidos.** `tau(0,1)=1+lh·ρ`; con ρ=−.14 se hace negativo si `lh>7.1429`. `setOverride` permite fijar GF/J arbitrario. | `src/domain/aztecavet/football.ts:142-147` (`setOverride`), `:217-222` (τ). Sonda: `setOverride('SAN',50,0.3)` → `lh=13.04`, `tau(0,1)=−0.825`; h+d+a suma **.569** y un mercado da `NaN`. Con los datos del bundle `max lh=2.603`, por lo que no ocurre en la instantánea. | Probabilidades inválidas/NaN si el usuario edita GF/GC; no hay validación de entrada. | Rechazar `lh ≥ 1/abs(ρ)`; truncar/renormalizar τ; validar overrides; test de propiedades (todas las p∈[0,1], suma 1). |
| **R16** | Medio | **Afirmaciones documentales falsas o no verificadas:** (a) `SA` "sin la auditoría" es falso (R02); (b) "solo datos 2025-26" en fútbol es falso para MX (R01); (c) "43 juegos" de auditorías NHL+MLB: 11+17=28; (d) paridad citada como validación (R04). | `docs/10-nhl-engine.md:19,54`; `docs/09-football-engine.md:57-60`; `docs/10-nhl-engine.md:55`; `docs/11-mlb-engine.md:53`. | Un revisor que confíe en los docs no verá el leakage ni la diferencia entre fidelidad y validez. | Corregir docs con `archivo:línea` y estado OBSERVADO/INFERIDO; eliminar "sin filtración" hasta que exista test que lo pruebe; arreglar la aritmética. |
| **R17** | Medio | **No hay fechas por partido ni orden verificable.** `nhl-results`, `nfl-results` y `ncaa-results` son `[home,away,score,score]` sin `match_date`; `buildWithForm` usa el orden del archivo para "últimos 5"; los fixtures usan etiquetas ("Vie 6 nov") sin año. `aztecavet-meta.json` dice 2026-11-06 y `src/data/index.ts` "7 nov 2026". | `src/data/aztecavet-nhl-results.json` (filas sin fecha), `src/data/nfl-results.json`, `src/data/ncaa-results.json`; `src/domain/aztecavet/hockey.ts:123-141` (slice(-5)); `src/data/aztecavet-meta.json:2`; `src/data/index.ts:52`. | El "point-in-time" no es verificable; la forma reciente puede usar partidos posteriores si el orden no es cronológico; no se puede reconstruir el estado pre-partido. | Añadir `match_id`, `match_date`, `kickoff`, `snapshot_id`; ordenar; joins as-of; test de monotonía; no usar el orden de un JSON como tiempo. |
| **R18** | Medio | **Detalles menores de métricas/formatos:** `safeAlt` normal no garantiza P≈.68 (fórmula heurística); `calibration` usa un umbral fijo de 4 pp con n≥30 sin IC; `dec` interpreta cualquier abs(v)≥100 como americana (una cuota decimal 100/150 se parsea como 2.0/2.5). | `src/domain/props.ts:92-103`; `src/domain/aztecavet/bankroll.ts:113-131`; `src/domain/stats.ts:50-54`. | Mensajes/ líneas alternativas engañosos; calibración UI sin incertidumbre; parser ambiguo en valores extremos. | Documentar `safeAlt` como heurística; añadir IC o n mínimo; separar parser decimal/americano o exigir prefijo. |

### 2.4 Bajos

| ID | Sev. | Hallazgo | Evidencia | Impacto | Corrección |
|---|---|---|---|---|---|
| **R19** | Bajo | **Tolerancia dorada inconsistente:** el header dice 1e-9, pero los valores de UI se comparan con 2 decimales (≈±0.005). | `tests/domain/golden.test.ts:4` (comentario 1e-9), `:57` (`toBeCloseTo(0.322, 2)`), `:96-97` (`toBeCloseTo(49.8, 1)`). | La "paridad dorada" no es exacta; no invalida la UI, pero exagera la precisión. | Etiquetar tolerancia real o usar valores exactos cuando se afirmen 1e-9. |
| **R20** | Bajo | **Conteo de tests inflado:** `npx vitest run` da 416 porque incluye 3 copias del test Linemate; el dominio relevante son 392. | Salida `npx vitest run`: 9 archivos, 416 tests; `tests/linemate_mathematical_validation.test.ts`; copias en `Reportes/` y `research/` (A01). | El número "416" no es 416 tests del motor. | `vitest.config` con `include` acotado; reportar 392/324 por separado. |
| **R21** | Bajo | **Snapshot con etiqueta de fecha distinta:** `dataDate` 2026-11-06 vs `DATA_AS_OF` "7 nov 2026"; no se observó mezcla material de partidos, pero no hay `snapshot_id` por fila. | `src/data/aztecavet-meta.json:2`; `src/data/index.ts:52`. | Reconstruir "qué se sabía" en una fecha es ambiguo; auditorías de un día pueden mezclar el día siguiente. | `snapshot_id`/`as_of` por fila y por artefacto; no mezclar snapshots. |

---

## 3. Verificaciones numéricas independientes

> **Validez de la réplica:** la implementación Python reproduce exactamente el motor en los puntos de control: NEC–TIJ `lh=1.2309033328660401`, `la=1.7420679081599488`, `w=.2550783977`, `d=.2664042916`, `l=.4785173053`; ATL–SAN `dco15`; MX J15 `8/9`; SLP–JUA `p_JUA=.2023` con la baja. Por tanto, las discrepancias de abajo no son errores de réplica.

### 3.1 Masa de la matriz 1X2, truncación y τ

Para los 242 partidos del bundle:

| Comprobación | Resultado |
|---|---|
| `w+d+l` (matriz τ, celdas 0..13) | mín `.9999992295`, máx `1.0000000000`, **máx abs(suma−1) = 7.705×10⁻⁷** |
| Cola fuera de la rejilla 0..13 | **máx 7.705×10⁻⁷** (la misma cifra; la matriz truncada suma 1−cola) |
| `lh` máximo / `la` máximo | 2.602884 / 2.633897 → todas las celdas τ positivas |
| Identidad analítica de τ | `E[τ] = 1 + ρ[−lh·la·P00 + lh·P01 + la·P10 − P11] = 1`, porque `P01=la·P00`, `P10=lh·P00`, `P11=lh·la·P00` |

**Conclusión:** **no hay un problema de normalización de τ**. La matriz no se renormaliza porque no lo necesita: preserva la masa exactamente; el único error es la cola truncada, 7.7×10⁻⁷. Los mercados 1X2 **sí suman 1** dentro de ese error. Cualquier acusación de "τ sin normalizar" sería un falso positivo.

**Lo que sí falla** no es la masa, sino (a) el valor de ρ, (b) que Over/BTTS no usan la matriz, y (c) que τ se aplica después del tilt (R05–R07).

### 3.2 Coherencia entre mercados

| Mercado | Diferencia frente a la matriz τ | Caso extremo |
|---|---|---|
| Over/Under | `pO − Σ_{i+j>line} M_ij`: mín **−1.049×10⁻²**, máx +7.7×10⁻⁷; media abs(...) 4.34×10⁻⁵ | GET–RVC (LL), total 1.664, línea 1.5: `.495529` vs `.506016` |
| BTTS | `bt − Σ_{i>0,j>0} M_ij`: mín **−1.785×10⁻²**, máx −5.51×10⁻³; media abs(...) 9.84×10⁻³ | TIG–LEO (MX): `.500320` vs `.518168` |
| Combinada `cb_` | `p_código − P_τ(fav gana ∧ over)`: hasta **−0.517 pp**; media abs(...) .479 pp; sólo 8 picks terminan en `cb_` | RMA–SEV (LL): `.423453` vs `.428628` |

Los pares complementarios sí suman 1 por construcción (`ov+un`, `by+bn`, `plf+pld`, `tho+thu`, `tao+tau`); el problema es **entre** grupos, no dentro de un grupo.

### 3.3 Calibración 1X2 en 213 auditorías

| Métrica | τ hardcodeado | ρ=0 | Climatología in-sample |
|---|---:|---:|---:|
| Brier multiclase | **0.60104** | **0.59619** | **0.62272** |
| Log-loss | **1.00722** | **0.99901** | **1.02469** |
| RPS | **0.22768** | **0.22687** | **0.24270** |
| Medias h/d/a | .3895/.2590/.3516 | .3991/.2396/.3613 | observadas .4413/.1643/.3944 |

- BSS del modelo vs climatología: **1 − .60104/.62272 = +3.48 %** (no 5.5 %; A01 usa otra definición de baseline; la conclusión —apenas mejor que la tasa base— no cambia).
- Empate: esperado **55.16**, observado **35**, **z = −3.16**. Home: 94 observados vs 82.95 esperados (z ≈ +1.5).
- Diferencia pareada τ vs ρ=0: Brier **+0.00486**, IC95 % i.i.d. **[+0.00183, +0.00789]**; log-loss **+0.00820**, **[+0.00282, +0.01358]**. Con dependencia por equipo/liga el IC sería más ancho, pero el signo no cambia.
- Rejilla de ρ (misma muestra, in-sample): log-loss mínimo en **ρ=+0.30** (frontera) = .98241; ρ=0 = .99901; ρ=−.08 = 1.00697; ρ=−.14 = 1.01378. Por liga, el óptimo es +0.03 (MX), +0.19 (LL), +0.19 (PL), +0.30 (UCL/UEL, frontera). **Ningún óptimo es negativo.**

Por liga:

| Liga | n | Empate obs. | Empate pred. | Brier τ | Brier ρ=0 |
|---|---:|---:|---:|---:|---:|
| MX | 27 | .222 | .269 | .5853 | .5812 |
| LL | 30 | .200 | .272 | .5818 | .5786 |
| PL | 30 | .200 | .264 | .6181 | .6151 |
| UCL | 54 | .093 | .245 | .5640 | .5565 |
| UEL | 72 | .167 | .258 | .6357 | .6310 |

**Advertencia:** la muestra tiene 16.4 % de empates (UCL 9.3 %), muy por debajo de lo típico (~25 %). O la muestra es atípica/sintética, o el modelo de empate está mal; en cualquiera de los dos casos, **la afirmación de calibración no está sostenida** y el ρ negativo no está validado. No se afirma que ρ negativo sea universalmente erróneo; se afirma que **en los datos del repo empeora**.

### 3.4 Leakage Liga MX: cuantificación

Se reconstruyó el estado "pre-jornada" restando de `gf/ga/gp` los resultados de la jornada objetivo y de todas las posteriores (J15; J14+J15; J13+J14+J15). El resto del motor (incluido `au=true`, sin bajas) se mantuvo.

| Jornada | Base (con fuga) | Pre-partido (sin fuga) | Δ |
|---|---:|---:|---:|
| J15 (9 juegos) | **8/9** | **5/9** | −3 aciertos |
| J14 (9) | 5/9 | 4/9 | −1 |
| J13 (9) | 7/9 | 7/9 | 0 |
| **Total 27** | **20/27 (74.1 %)** | **16/27 (59.3 %)** | **−4** |

Ejemplos de cambio de pick (no sólo de probabilidad):

- **AME–TOL (J15, 2-2):** base `dco15` **61.0 % W** → pre `h` **43.3 % L** (−17.7 pp).
- **JUA–QRO (J15, 3-1):** base `a` 49.6 % L → pre `a` 57.6 % L (−8.0 pp; el pick no cambia, la probabilidad sí).
- **LEO–TOL (J14, 1-1):** base `dco15` 55.3 % W → pre `a` 43.2 % L (−12.1 pp).
- **SLP–ATS (J15, 0-1):** base `u35` 61.2 % W → pre `dco15` 54.9 % L.

La evidencia de que los totales MX incluyen la temporada en curso: los 18 equipos MX tienen `gp=15` (QRO/MTY 14) y `cur=0`; el fixture es "Jornada 16". El código sólo usa `cur` si `useCur` y `cur` es truthy; para MX `cur=0`, así que `au=true` no excluye nada. **OBSERVADO** en datos/código; **INFERIDO** que los 15 PJ son la temporada 2026-27 hasta J15.

### 3.5 Leakage NHL y doble conteo

| Tabla / escenario | Picks | ML | Brier | p media |
|---|---:|---:|---:|---:|
| `SA=R` (incluye las 11) | **8/11** | **9/11** | .2360 | .5864 |
| `SA` excluyendo las 11 | **7/11** | **7/11** | .2291 | .6184 |

- `S=R+AUD`: suma de `n` de equipos = **470** team-games; único = **448** (224 partidos ×2); 11 partidos duplicados para 22 equipos. `S` declara 235 partidos donde hay 224.
- "Hoy" (6 nov), comparando `S` vs `R` sin duplicar: BUF–CBJ pH **.5202 vs .5258**; CGY–ANA **.4155 vs .4191**; MIN–SJ .7500 en ambos. El `pld` de BUF–CBJ **.7492 vs .7383**.
- `OVR` usa `R.concat(AUD)` (`hockey.ts:152-156`), por lo que también pondera dos veces los 11.

El Brier *mejora* al excluir la auditoría (.2291 < .2360) pero eso no absuelve el leakage: los picks cambian y la comparación de Brier entre mercados distintos no es una mejora de calibración. El hit rate y el ML sí caen, que es la métrica que el informe usa como validación.

### 3.6 Tilt y share

- Cambio de total post-tilt: mín **−0.4560** (UCL VIK–BMU: `lh0=.906`, `la0=3.329` → `lh=1.145`, `la=2.634`; 4.235→3.779), máx +.0083, media −.0229, media abs(...) .0265.
- Share condicional final vs `m.share`: máx **1.079 pp** (MX CHI–NEC: target .768479, real .779272); 240/242 con abs(Δ)>1e−4.
- El solver de `tilt` sí converge a su objetivo **independiente**: error máximo ≤2.0×10⁻⁵. La diferencia anterior es causada por aplicar τ **después** del tilt, no por la bisección.

### 3.7 Cobertura / fuerzas degeneradas

- 213 auditorías: **50** con `H.rs==A.rs && H.ra==A.ra` (9 UCL, 33 UEL, 4 LL, 4 PL); **4** PL con ambos equipos exactamente en 1.45 (los `gp=0`/`cur=0`).
- **126/213 (59.2 %)** son UCL/UEL; en modo `au` no usan `cur` y los equipos OT con `gp=0` caen a la media de liga. Es decir, la mayor parte de la muestra "de validación" no contiene información de forma actual.
- `est(gd)=[55+gd/2, 55−gd/2]` con `gp=38` para MUN/AVL/BOU/…; `fl='e'` se guarda en `teamsFromRows` y **nunca** se consulta en `base`. Los totales estimados se tratan como observados.

### 3.8 Picks y Brier: el "acierto" no supera baselines triviales

| Conjunto | n | Aciertos | p media | Brier del pick | Constante a la tasa observada |
|---|---:|---:|---:|---:|---:|
| Fútbol auditorías | 213 | **131 (61.5 %)** | .5208 | **.24244** | **.23677** |
| NHL auditorías | 11 | 8 (72.7 %) | .5864 | .2360 | **.1983** |
| MLB auditorías | 17 | 9 (52.9 %) | — | .2523 | **.2491** |

Para un forecast constante igual a la tasa de acierto, `Brier = p(1−p)`; por eso las tres columnas finales son el baseline exacto. **El Brier del modelo es peor que el baseline constante en los tres casos.** El 61.5 % de fútbol no es impresionante: "siempre local o empate" acierta 129/213 = 60.6 %; el pick del modelo apenas lo supera (+0.9 pp).

Distribución de picks de fútbol (242): `dco15` **127**, `h` 50, `a` 45, `u35` 11, `cb_o2.5` 8, `dc1x` 1. En auditorías (213): `dco15` 111, `h` 44, `a` 40, `u35` 9, `cb_o2.5` 8, `dc1x` 1. Más de la mitad del "pick" es una combinada DC+Over 1.5, no un 1X2.

MLB: `pick` elige `pld` en **14/17**; acierta 9/17; el favorito ML acierta **11/17**; home 9/17; over 8/17. El "9/17" de la UI es un mercado +1.5, no un pronóstico de ganador.

### 3.9 MLB: incoherencia ML vs run-line

`pH` (Log5 con SHR) vs `Φ(abs(df)/σ)` con `df=gh−ga`, σ=3√2:

| Partido | pH | pF | Implícita normal | Δ |
|---|---:|---:|---:|---:|
| TB–MIL | .466 | .534 | .570 | **+3.6 pp** |
| MIL–TB | .600 | .600 | .570 | −3.0 pp |
| CWS–CLE | .557 | .557 | .524 | −3.3 pp |
| CLE–CWS | .511 | .511 | .476 | −3.5 pp |

17/17 con abs(Δ)≈3 pp. No es un error de redondeo: son dos modelos de probabilidad distintos en el mismo objeto `Model`.

### 3.10 `NOB` roto: reproducción exacta

```
cuota visitante = 2.50
p = 0.47851730533023407
bestOf = {o:"a", ev:+0.196293..., d:2.5}
NOB(g) = true        // "SIN VALOR"
```

`bestOf` encuentra +19.6 % de EV y `NOB` lo niega. `scorePick` con `nob=true` devuelve **−1** (`picks.ts:28-29`), de modo que el pick del día descarta el valor. El mismo patrón está en `hockey.ts:336-340` y `baseball.ts:226-230`.

### 3.11 Overrides y τ negativo

`setOverride('SAN', 50, 0.3)` en el partido SAN–NEC:

| `lh` | `tau(0,1)=1+lh·(−.14)` | h+d+a | Mercado mínimo |
|---:|---:|---:|---:|
| 13.04 | **−0.825** | **.569** | `NaN` |

Con los datos del bundle `lh` máximo es 2.603, así que **no ocurre en la instantánea**; es un riesgo de robustez para la pestaña Equipos. No se presenta como leakage.

### 3.12 Lo que es correcto (verificado)

1. **1X2 suma 1** en 242/242 (máx 7.7×10⁻⁷); la cola de la rejilla es 7.7×10⁻⁷. No hay que renormalizar.
2. **La estructura de τ es la estándar de Dixon-Coles** y el signo es coherente con ρ negativo: sube 0-0 y 1-1, baja 1-0 y 0-1. **No hay inversión de signo**; el problema es el **valor** de ρ en estos datos (R05).
3. **`noVig` es aritméticamente correcto:** con cuotas 2.5/3.2/3.1, `s=1.0350806`, margen 3.508 %, probabilidades normalizadas .38644/.30191/.31165, suma 1.000000. `mg=s−1` es correcto.
4. **Mercados complementarios:** `ov+un=1`, `by+bn=1`, `plf+pld=1`, `tho+thu=1`, `tao+tau=1`; `h+d+a` suma 1. No se encontró un mercado complementario que no sume 1.
5. **`unitOf`/EV:** `EV=p·d−1`, umbral `≥.04`, 10 %/5 %; el test de borde `.5×2.08−1=.04` es correcto. El problema es la **política** de stake, no la aritmética.
6. **Paridad:** 324 tests, ε<1e-9, 242 partidos; la transcripción TS es fiel. Es una fortaleza real de ingeniería, no una validación predictiva.
7. **NFL/NCAA auditoría:** `modelAudit` usa `SA` construida sólo con `results`; los datos muestran que `nfl-audit` (BAL–JAX) y `ncaa-audit` (5 juegos) **no** están en `results`. No se observó solapamiento. Limitación: sin fechas, no se puede probar que el resto de `results` sea anterior (R17).
8. **MLB no tiene fuga de target:** `BaseballEngine` usa `T` (tasas de temporada regular) y no actualiza con `g.sc`; la auditoría `nn=true` ignora abridor, pero el marcador no entra en el modelo. Es un problema de modelo, no de fuga.
9. **Determinismo:** E3 restaura la probabilidad exacta (|Δ|<1e-15); `tilt` converge; `phi/iphi` y `half` son estables.
10. **`over` truncado:** el error de cola es ≤7.7×10⁻⁷; numéricamente irrelevante.

---

## 4. Checklist anti-leakage para el laboratorio nuevo (15 puntos)

Cada punto debe ser un test automatizado, no una convención verbal.

1. **`match_id` único y determinista** (`div:fecha:home:away`), y `match_date`/`kickoff` no nulos en el 100 % de las filas. Sin fecha no hay predicción.
2. **Ventana estricta `< match_date`**: ninguna feature, media, Elo, forma o rating puede usar el partido objetivo ni partidos de la misma fecha/jornada. Test con `date >=` que debe devolver 0 filas.
3. **Test de remoción del target (metamórfico):** para un partido `m`, calcular features con el dataset completo y con el dataset sin `m` ni posteriores; las features pre-partido deben ser **idénticas** (hash). Si cambian, hay fuga.
4. **Test de aleatorización del target:** permutar `home_goals/away_goals` de los partidos de test no debe cambiar ninguna predicción pre-partido de esos partidos (sólo deben cambiar las métricas). Si cambia una probabilidad, hay fuga.
5. **Separación `train/valid/test` por temporada**, no por fila; `2026/27` sólo monitorización. Un `match_id` no puede estar en dos splits.
6. **Auditorías fuera del training:** `audit ∩ results = ∅` y `SA`/`S` construidas sólo con partidos anteriores a la fecha de auditoría; assert de conteo (`n(S)=n(unique)`) y de claves.
7. **Deduplicación por `match_id`:** si dos filas colisionan, conservar la de mayor cobertura y registrar el conflicto. Test: `COUNT(*) = COUNT(DISTINCT match_id)` en cada tabla.
8. **Provenance flags:** `observed | estimated | missing`, `source`, `as_of`. Nunca asignar 38 PJ a un total estimado; los equipos con <N partidos se excluyen o se marcan, no se imputan silenciosamente a la media.
9. **Un solo esquema entre ligas:** mismas columnas y mismo significado de `gf/ga/gp/cur/season`; test de que MX y PL no usan campos distintos para "temporada actual".
10. **Cuotas:** sólo apertura/pre-partido como feature; cierre sólo benchmark; documentar timestamp/assumption; nunca usar cuotas de cierre para simular una decisión pre-partido.
11. **Coherencia de mercados:** una única matriz conjunta; asserts `h+d+a=1`, `ov+un=1`, `btts+no=1`, `ΣM=1` (tolerancia 1e-9), `p∈[0,1]`, sin `NaN`; la cola truncada se reporta y se renormaliza o se acota.
12. **Calibración out-of-sample:** log-loss/Brier/RPS con IC por bootstrap de bloques (liga-temporada), no i.i.d.; comparar contra climatología, favorito y de-vig; reportar n, cobertura y calibración por bin.
13. **Sin selección p-hacking:** pre-registrar la regla de pick y las métricas; evaluar la distribución completa, no el pick elegido; un solo uso del test reservado; corregir comparaciones múltiples.
14. **Duplicados/identificadores en evaluación:** cada partido cuenta una vez; los artefactos de evaluación llevan `snapshot_id`, `as_of` y hash del dataset; no se agregan logs de distintas suites como si fueran muestras independientes.
15. **Kill switch numérico:** si una probabilidad es negativa/NaN, un mercado no suma 1, o una feature usa una fecha ≥ kickoff, el pipeline aborta y escribe un test que falla; no se "sanea" silenciosamente.

---

## 5. Implicaciones y prioridades para el laboratorio

**P0 (bloqueantes para cualquier afirmación de validez):**
1. Rehacer la evaluación MX/NHL con estado point-in-time y deduplicación; no usar los 8/9 ni los 8/11 como evidencia.
2. Convertir los backtests en aserciones; el 2-3 vs 4-1 debe fallar el CI.
3. Tratar los 324 tests de paridad como *fidelidad*, no como validación; añadir una suite de métricas OOS contra baseline y de-vig.
4. Corregir `NOB` y bloquear parlays correlacionados/fallback sintético antes de conectar dinero.

**P1 (calidad del motor):**
5. Estimar/validar ρ, HFA, K, E y el nivel de empate en train; reportar sensibilidad; no hardcodear ρ negativo.
6. Derivar Over/Under/BTTS/combinadas de una sola matriz; corregir el tilt para no mover el total.
7. Añadir `match_id`, `match_date`, `kickoff`, `snapshot_id`; eliminar las fuerzas estimadas con `gp=38` o marcarlas y excluirlas de la evaluación.
8. Reemplazar el sizing fijo por Kelly fraccional con tope y exigir cuota real.

**P2 (higiene):**
9. Corregir docs/09-11 (SA, MX 2025-26, 43 vs 28) y la tolerancia dorada.
10. Acotar Vitest a los tests del dominio; reportar 392/324, no 416.

---

## 6. Limitaciones de esta auditoría

- La muestra de 213 auditorías no es un test reservado ni independiente: los equipos se repiten, no hay fecha por partido y la tasa de empate es atípica. Los IC son i.i.d.; un bootstrap por equipo/liga los ampliaría. Las conclusiones de calibración son **sobre esta muestra**, no un veredicto universal sobre Poisson+DC.
- No hay cuotas históricas en el repo; no se pudo evaluar ROI/EV contra el mercado. Los cálculos de EV son aritméticos, no una backtest de apuestas.
- El modelo Python replica el motor en los puntos de control, pero no es una segunda implementación independiente línea a línea; se usó para masa/calibración/leakage. Las sondas NHL/MLB usan el propio motor TS.
- No se modificó ningún archivo de código, test o dato. El archivo `evidence/statistical-tests/aztecavet-experiments.json` se restauró a `HEAD` tras la ejecución de la suite.

---

## Apéndice A — Comandos y salidas clave

```text
$ npx vitest run --reporter=dot
Test Files  9 passed (9)
     Tests  416 passed (416)

$ # salida de batch-verify (extracto)
BATCH-NFL juegos: 14 | Δmax: 0.000e+0
BATCH-NCAA juegos: 32 | Δmax: 0.000e+0
AUDIT-NCAA juegos: 5
  MASS@BALL 31-30 | almacenado: MASS gana (ML) | motor: MASS gana (ML) 80.4% → ✓
  SAC@TOL 17-20 | almacenado: TOL gana (ML) | motor: TOL gana (ML) 78.5% → ✓
  EMU@CMU 7-35 | almacenado: EMU gana (ML) | motor: EMU gana (ML) 61.1% → ✗
  FAU@UTSA 60-29 | almacenado: FAU +1.5 | motor: UTSA gana (ML) 50.8% → ✗
  SMU@VT 51-28 | almacenado: SMU +1.5 | motor: VT gana (ML) 50.6% → ✗
BACKTEST-NCAA: 2-3 (UI observada: 4-1)
```

```text
# Sonda NOB (motor de fútbol, cuota visitante 2.50)
bestOf a 0.19629326332558517 2.5
NOB true
```

```text
# Sonda leakage MX (resumen; J15)
== J15 pre (exclude J15) base hits 8 / 9 pre hits 5 / 9
AME-TOL 2,2 | base dco15 61.0% W | pre h 43.3% L | dP -17.7pp
```

**Archivos de evidencia primarios:** `src/domain/aztecavet/football.ts`, `hockey.ts`, `baseball.ts`, `constants.ts`; `tests/domain/aztecavet-experiments.test.ts`, `batch-verify.test.ts`, `aztecavet-parity.test.ts`, `sensitivity.test.ts`; `src/data/aztecavet-fb-teams.json`, `aztecavet-fb-fixtures.json`, `aztecavet-nhl-results.json`, `aztecavet-nhl-audit.json`; `docs/09-football-engine.md`, `docs/10-nhl-engine.md`, `docs/11-mlb-engine.md`.
