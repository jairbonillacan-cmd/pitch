# 05 · Licencias y derechos de uso comercial

> PitchLab será un SaaS de suscripción, así que cada fuente se verifica contra los 13
> derechos de la directiva. Clasificación: **APROBADO** (permiso documental claro),
> **CONDICIONAL** (restricciones manejables), **PENDIENTE** (sin confirmar),
> **NO AUTORIZADO** (incompatible).
> Base: `docs/architecture/FREE_DATA_STRATEGY.md` (términos verificados 2026-11-08) y
> `docs/architecture/COMPLIANCE_REGISTER.md`. No es asesoría legal.

## 1. Clasificación por fuente

| Derecho | openfootball (CC0 1.0) | nflverse (CC-BY 4.0) | The Odds API Free | API-Football Free | football-data.org Free |
|---|---|---|---|---|---|
| Acceso / descarga / almacenamiento | ✅ | ✅ | ✅ (almacenamiento indefinido) | ✅ | ✅ |
| Procesamiento / datos derivados | ✅ | ✅ | ✅ (entrenar modelos permitido) | ✅ técnico | ◐ |
| **Uso comercial en producto** | ✅ sin restricciones | ✅ **con atribución visible** | ✅ si los datos no son el producto principal; ⛔ revender o redistribuir el feed crudo | **◐ solo beta privada sin cobro** hasta confirmación escrita (FD-14) | **PENDIENTE** — términos sin clasificar (adaptador nuevo, no ampliar uso) |
| Mostrar estadísticas / cuotas a clientes | ✅ | ✅ con atribución | ✅ con snapshots propios y hora visible | ⛔ público hasta FD-14 | ◐ |
| Conservar históricos tras cancelar | ✅ | ✅ | ✅ | sin garantía documental | sin garantía documental |
| Atribución | No requerida (CC0); se da igualmente | **Obligatoria**: «Datos: nflverse (CC-BY 4.0)» en Metodología y vistas | Opcional; se registra la hora del snapshot | Según términos | PENDIENTE |
| Restricciones territoriales / volumen | Ninguna | Ninguna | Presupuesto de 500 créditos/mes | 100 req/día (se opera con margen de 90) | 10 req/min |

**Clasificación resumida:** openfootball y nflverse = **APROBADO**. The Odds API = **APROBADO**
con dos reglas propias (no redistribuir feed crudo; etiquetar el cierre como aproximado).
API-Football Free = **CONDICIONAL** (beta privada hasta FD-14). football-data.org = **PENDIENTE**.
football-data.co.uk, scraping de casas, APIs ocultas de ESPN/NFL.com, MLB/NHL públicas = **NO AUTORIZADO**.

## 2. Reglas de retención que se aplican ya

- El corpus `data/history/` conserva **solo** datos cuyo derecho de almacenamiento está
  documentado; cada archivo lleva SHA-256 y URL de origen en el manifiesto para poder
  demostrar qué se descargó y cuándo.
- Las cuotas de cierre de nflverse se almacenan con `usage: "research-only"`: permanecen
  en el corpus interno, nunca se publican como cuotas propias ni se exportan.
- Si una fuente cambia de términos (riesgo en `17-risk-register.md`), el registro de
  fuente permite reconstruir qué filas provienen de ella y excluirlas con un filtro por
  `source`.

## 3. Textos de atribución en uso (verificado en el manifiesto)

- `Datos: nflverse (nflverse-data, CC-BY 4.0)`
- `Datos: openfootball/football.json (CC0 1.0)`
- Cuotas: `hora de cada snapshot visible` + badge *stale* cuando el snapshot es viejo
  (`FREE_DATA_STRATEGY.md` §2).

## 4. Pendientes del fundador (no bloquean el desarrollo, sí el cobro)

1. **FD-14**: confirmación por escrito de API-Football para Liga MX comercial.
2. Clasificar los términos de football-data.org Free antes de ampliar su uso.
3. Al empezar a cobrar: Vercel Pro (el Hobby es no comercial) y revisión de Stripe MX
   (restricción de pronósticos con premio — regla vigente: ningún premio).
