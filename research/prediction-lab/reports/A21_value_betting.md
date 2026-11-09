# A21 — Simulación de apuestas por valor: no hay estrategia rentable

**Implementación:** orquestador (ciclo 8). **Script:** `pipeline/experiment_value_betting.py`.
**Precios:** cuotas B365 de cierre (test) y B365 del snapshot (fixtures). Apuesta plana de 1 unidad
al resultado con mayor `edge = p_modelo·cuota − 1` si supera τ.

---

## 1. Test 2024/25 + 2025/26 (12.373 partidos con cuota)

| τ | Apuestas | ROI | IC95 % ROI | Acierto | Edge medio creído |
|---:|---:|---:|---|---:|---:|
| 0,00 | 10.048 | **−9,73 %** | [−12,77 %; −6,49 %] | 31,3 % | +0,154 |
| 0,02 | 8.930 | **−10,47 %** | [−13,59 %; −7,02 %] | 30,2 % | +0,172 |
| 0,05 | 7.325 | **−9,52 %** | [−13,05 %; −5,69 %] | 29,1 % | +0,202 |
| 0,10 | 5.176 | **−8,89 %** | [−13,11 %; −4,71 %] | 27,3 % | +0,255 |
| 0,15 | 3.716 | **−11,94 %** | [−16,76 %; −6,71 %] | 24,7 % | +0,307 |

**Todos los IC95 % están enteros por debajo de cero.** Con 10.000 apuestas, el ROI es −9,7 % y el
intervalo excluye el 0 con holgura. La conclusión no depende de un umbral: cuanto más alto el
umbral, más negativo el ROI.

## 2. Fixtures pre-registrados (146)

| τ | Apuestas | ROI | IC95 % ROI | Acierto |
|---:|---:|---:|---|---:|
| 0,00 | 111 | −1,23 % | [−26,20 %; +20,44 %] | 36,0 % |
| 0,05 | 75 | −4,81 % | [−36,65 %; +23,51 %] | 34,7 % |
| 0,10 | 46 | −19,46 % | [−62,55 %; +22,81 %] | 23,9 % |
| 0,15 | 23 | −48,48 % | [−88,67 %; +6,39 %] | 17,4 % |

Mismo signo, pero con 146 partidos los intervalos son enormes: **no se interpreta individualmente**.

## 3. Lectura

1. **No hay estrategia de valor.** El modelo cree tener un edge medio del +15 % al +31 % sobre el
   cierre; la realidad es un ROI de −9 % a −12 %. Es la firma de la **sobreconfianza en las
   probabilidades extremas**, no de un mercado ineficiente.
2. **El margen de la casa no explica todo.** B365 cierra con ~6,4 % de overround; el ROI es peor
   (−9,7 % a −12 %), así que además del margen hay error de modelo.
3. **Coherencia con el resto del laboratorio:** el modelo pierde 0,020 de log-loss contra el
   mercado; era esperable que una estrategia basada en sus edges perdiera. La simulación lo
   cuantifica en unidades monetarias.
4. **Reconciliación con el ciclo 7:** el ECE de los 146 fixtures sugería infraconfianza en un bin,
   pero con 12.373 apuestas el patrón es claro: **sobreconfianza en los picks de mayor edge**. La
   lectura del ciclo 7 era correcta en cuanto a "el ECE de 146 partidos es ruidoso", pero la
   conclusión de fondo es sobreconfianza, ahora con evidencia grande.

## 4. Limitaciones

- Se apuesta al cierre de B365, no necesariamente al mejor precio disponible (Max/Avg podrían
  mejorar el ROI en 1-2 pp, nunca 10).
- Sin comisión de exchange ni límites de stake.
- El test ya se había usado para otras conclusiones; esta simulación no elige modelo, solo evalúa
  una estrategia.
- Los 146 fixtures son pocos para ROI; solo se usan como consistencia de signo.

## 5. Reproducibilidad

```bash
cd research/prediction-lab
./.venv/bin/python pipeline/experiment_value_betting.py
# -> artifacts/VALUE_BETTING/value_betting.{json,md}
```
