# 19 — Informe técnico del motor NCAA (touchiq.com.mx)

**Alcance:** motor de predicciones NCAA football · **Fecha:** 2026-11-08 · datos congelados al "Sáb 7 nov 2026 · Semana 10".
**Disciplina:** OBSERVADO / INFERIDO / DESCONOCIDO. La investigación NCAA fue independiente de la NFL
(según exige la metodología); se compartieron componentes sólo tras verificar compatibilidad.

## 1. Procedencia de los datos

| Variable | Fuente citada | Frecuencia | Notas |
|---|---|---|---|
| `T` equipos | sin cita explícita en la sección NCAA | semanal (INFERIDO) | **formato distinto al NFL**: [nombre, PF/juego, PA/juego, JJ, conferencia] |
| `R` resultados (121 filas) | sin cita | semanal (INFERIDO) | incluye juegos de temporada completa |
| `AUD` (5 juegos 4–6 nov) | marcadores oficiales + picks pre-partido con flag ✓/✗ | tras cada jornada | ["MASS","BALL",31,30]… flags suman **4-1** |
| `D` calendario (32 juegos sáb 7 nov) | sin cita | semanal | sedes/horas transcritas |
| `N` lesiones | **array vacío** (OBSERVADO: `N=[].map(...)`) | — | el motor acepta lesiones pero la sección NCAA no publica datos de lesiones |
| `CONF` fuerzas de conferencia | sin cita | por temporada | {SEC,B1G,B12,ACC,IND}=1 · P12=.92 · G5=.88 (default .9) |
| `NOTAS` (tab) | explicación metodológica en pantalla | — | texto del autor |

Sin API/endpoints (misma evidencia CDP que NFL: 0 requests). Página embebida base64 (97 KB).

## 2. Arquitectura

**OBSERVADO: 100% en el navegador**, motor propio dentro de `page_ncaa_s1.js` — no reutiliza
el motor NFL (independiente, verificado leyendo ambos). Misma entrega: iframe srcdoc + postMessage.

## 3. Algoritmos y fórmulas — DIFERENCIAS CLAVE vs NFL (todas OBSERVADAS)

Constantes: `E=2.37 · HFA=.56 · K=3 · SHR=.85 · SDM=15.5 · SDT=15 · SDP=11 · NG=96 · LGP=28 · NEUT=∅`.

1. **Fuerza (`build`) — fórmula propia**: `rs = (avg·G + LGP·K + pts) / (G + K + n)`
   donde avg = promedio por juego de T, G = JJ de T, pts = puntos brutos de R, K=3.
   **Ajuste de conferencia**: `rs×cf`, `ra÷cf` con `cf=CONF[conferencia]` (default .9) —
   la ofensa de una conferencia débil se escala a la baja y su defensa al alza.
2. **pH — encogido hacia 50%**: `pH = .5 + SHR·(Log5+HFA − .5)` con SHR=.85 — el NFL usa la
   probabilidad directa; NCAA la **contrae 15% hacia .5** (misma forma que PCONS del 80/20 NFL).
3. **Puntos/márgenes**: idénticos al NFL pero `SDM=15.5` (márgenes más dispersos), `SDT=15`, `SDP=11`.
4. **Pick — regla de 3 ramas (OBSERVADA, corrige mi inferencia anterior de "umbral 55%")**:
   - si `dom` (domina ofensiva y defensiva) y su ML ≥ .52 → ese ML ("ML · DOMINA EN OFENSIVA Y DEFENSIVA");
   - elif max(pH,1−pH) ≥ .58 → ML del favorito ("ML FAVORITO (sin dominio total)");
   - else → el mejor de {ML favorito, underdog +L, Over, Under} por probabilidad
     ("FAVORITO LIGERO · PARTIDO PAREJO" / "SIN VENTAJA CLARA · opción más segura").
5. **Sin 80/20, sin parlays-80/20, sin combinadas**: "NCAA: solo moneyline, sin combinada
   (los marcadores colegiales son muy disparejos)" — comentario del autor. Parlay del día:
   "las 3 apuestas más seguras de la jornada" (PLC-equivalente propio).
6. **Mercados**: los mismos 14 (ML/spread/total/team totals/alt lines) con las curvas NCAA.
7. **Auditoría**: igual filosofía (SA sin los juegos auditados, sin lesiones); el registro
   almacenado trae el pick pre-partido y el flag.

## 4. Ingeniería inversa de resultados (pruebas controladas)

- **Batch: 32 juegos × 15 mercados + pH — Δmáx = 0.000e+0** (motor reconstruido ≡ original).
- Dorado de UI viva: "PICK DEL DÍA MICH gana (ML) **71.5%**" — el motor reconstruido produce
  pH=71.5% para MICH-MSU (0.5 + 0.85·(0.7528−0.5)) — exacto.
- **Sensibilidad SHR**: Log5+HFA crudo 75.3% → SHR 71.5% (−3.8 pp de contracción hacia 50%).
- **Sensibilidad conferencia**: `cf` escala ofensiva/defensiva (G5 .88 reduce la ofensa y endurece
  la defensa proyectada de equipos G5 frente a Power conferences).

## 5. Pipeline de predicción

Idéntico en estructura al NFL (docs/18 §5) con dos etapas sustituidas:
`build()` con promedios+conferencia (OBSERVADO) y `pH` con contracción SHR (OBSERVADO);
pick con la regla de 3 ramas (OBSERVADO). Cosecha manual de datos: no observable (igual que NFL).

## 6. Reproducción

`src/domain/engine-ncaa.ts` — implementación independiente verificada:
**Δmáx = 0 en 32 juegos × 15 mercados** frente al original (`tests/domain/batch-verify.test.ts`).
Correcciones surgidas del propio batch: (a) pH con SHR (mi primera versión usaba la fórmula NFL —
detectado por Δ≠0 y corregido); (b) el array `AUD` NCAA (5 juegos) faltaba en la extracción y
cambiaba la fuerza de 10 equipos (detectado por Δ≠0 en team totals); (c) regla del pick a 3 ramas.

## 7. Validación

- **Identidad**: batch 32×15 → Δ=0; test dorado MICH 71.5% = UI.
- **Backtest del registro original**: el registro auditado NCAA es **"4-1"** (OBSERVADO: los flags
  `pk[1]` de los 5 juegos suman 4: MASS ✓, TOL ✓, EMU ✗, FAU +1.5 ✓ (ganó 60-29 como local), SMU ✓).
- **Replay con la instantánea actual**: reconstruir los picks "como estaban antes del partido"
  produce 2-3 — **no es una contradicción**: los picks almacenados se hicieron con los datos del
  4–6 nov (R más corto, líneas/lesiones de entonces) y el artefacto sólo conserva el estado actual.
  Conclusión honesta: la reproducción del histórico completo requiere instantáneas históricas
  (DESCONOCIDO/no disponible); el registro oficial del modelo es el almacenado (4-1).
- Calibración formal (Brier/log loss): muestra insuficiente embebida (5 picks); no calculable.

## 8. Trazabilidad y diferencias respecto al original

| Componente | Estado | Diferencia |
|---|---|---|
| build con conferencias / eff / model0 con SHR | OBSERVADO | **Ninguna (Δ=0)** |
| Mercados (14) | OBSERVADO | Ninguna |
| Pick 3 ramas | OBSERVADO (antes INFERIDO — corregido) | Ninguna |
| Parlay del día NCAA | Parcialmente OBSERVADO | fórmula "3 más seguras" mapeada; verificación batch pendiente de la UI de parlays |
| Registro histórico 4-1 | OBSERVADO (flags) | Replay exacto imposible sin datos históricos |
| Datos de lesiones NCAA | OBSERVADO (vacíos) | Ninguna — el motor los soporta, la sección no los publica |
| No determinable | — | Criterios de cosecha/transcripción humana |

**Conclusión**: el motor NCAA comparte la familia Pitágoras-Log5 pero con cuatro diferencias
propias verificadas: baselines por promedio+conferencia (cf), K=3, contracción SHR del pH, y
SDM=15.5 con una regla de pick de tres ramas sin capa 80/20. La reconstrucción es
**algorítmicamente idéntica** (Δ=0 en 32 juegos) en todo lo implementado y probado.
