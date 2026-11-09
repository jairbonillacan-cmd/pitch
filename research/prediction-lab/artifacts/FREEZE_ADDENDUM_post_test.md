# Adenda POST-TEST al freeze (separada del documento pre-test)

**Origen:** sección 5 del `FREEZE.md` original, escrita después de la evaluación de test.
**Fecha real de escritura:** *mtime* del `FREEZE.md` original = **2026-11-09T03:48:21** (la versión
anterior declaraba 03:52, hora imposible; discrepancia D1 de la auditoría A09c).
**Motivo de separarla:** el freeze debe ser citable como artefacto previo. Esta adenda contiene
resultados de test y **no forma parte** de la congelación.

---

## 5. Adenda POST-TEST (2026-11-09 03:52) — solo para trazabilidad

Evaluación única sobre `test` (2024/25 + 2025/26, 16.126 partidos), con los candidatos congelados:

| Sistema | Log-loss | Brier | RPS | Accuracy | ECE |
|---|---:|---:|---:|---:|---:|
| `logit` (Motor A congelado) | 1,01802 | 0,60983 | 0,20820 | 0,4890 | 0,0112 |
| `hgb` (alternativa) | 1,01860 | 0,61043 | 0,20835 | 0,4904 | 0,0055 |
| `ensemble` (alternativa pre-especificada) | 1,01652 | 0,60907 | 0,20789 | 0,4901 | 0,0047 |
| `stack_logit` (Motor B experimental) | 1,00527 | 0,60159 | 0,20443 | 0,4995 | 0,0082 |
| mercado cierre (mejor precio) | 0,99770 | 0,59645 | 0,20203 | 0,5062 | 0,0063 |
| mercado apertura (mejor precio, n=11.295) | 0,99176 | 0,59238 | 0,20004 | 0,5115 | 0,0063 |
| base_rate | 1,07506 | 0,65044 | 0,22784 | 0,4376 | 0,0154 |

Comparaciones pareadas clave (Δ = pérdida(A) − pérdida(B); <0 ⇒ A mejor):
- `ensemble` vs `logit`: −0,00153 [−0,00250, −0,00050], p=0,001 → **el ensemble supera a logit en test**.
- `ensemble` vs `hgb`: −0,00208 [−0,00320, −0,00100], p=0,000.
- `logit` vs `market_close`: +0,0203 [0,0175, 0,0231] → el mercado gana con claridad.
- `ensemble` vs `market_close`: +0,0188 [0,0161, 0,0214].
- `market_open` vs `stack_logit` (n=11.295): +0,0007 [−0,0000, +0,0015], p=0,97 → **sin diferencia significativa**.
- `market_close` vs `market_open` (n=11.295): −0,0034 [−0,0047, −0,0021] → el cierre es mejor que la apertura.

**Transparencia sobre exposición a test:** el pipeline de walk-forward calcula por diseño todas las
particiones y algunos `metrics.json` intermedios (p. ej. `EXP01_final`) incluían la columna `test`
antes de este documento. Las decisiones de selección se tomaron con `val` y la tabla de arriba es la
evaluación formal pre-registrada; la exposición previa se registra aquí para que un revisor pueda
juzgar el riesgo de data snooping (fue mínima y no guió ninguna elección).

**Lectura honesta:** el Motor A congelado (logit) queda 0,020 por detrás del cierre. El ensemble,
también pre-especificado antes de test, resulta significativamente mejor que logit en test; como eso
se decide mirando test, NO se cambia retroactivamente el modelo desplegado: se propone como
candidato principal del siguiente ciclo, a confirmar con datos nuevos. Motor B (stacking) no supera
al mercado de forma significativa. La conclusión del paper se replica: la información manda.
