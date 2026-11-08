# Definición del MVP

> **Propósito:** qué entra en la primera versión pública, qué no y cuándo se considera lista.
> **Consumidores:** fundador, plan de waves y autores de prompts.
> **Fecha:** 2026-11-08 · Supuestos vigentes: FD-01 (NFL + Liga MX + Premier League), **FD-02 = datos US$0** (`docs/architecture/FREE_DATA_STRATEGY.md`) y FD-04/05.

## 1. Escenario elegido: **Lean+ con ecosistema**

Es el escenario A de la directiva (un deporte núcleo con investigación útil), más el fútbol mexicano e inglés por su peso en México, más el ecosistema social y de referidos para crecer sin pagar adquisición. Se descartan los escenarios B y C por el costo de datos (`COST_MODEL.md`) y porque los modelos aún no han pasado su gate.

## 2. Dentro del MVP

| Área | Secciones | Alcance |
|---|---|---|
| Base | 00, 03, 28, 35 | DS, Shell, auth con 18+, cuenta y billing, ayuda, metodología y legal |
| Adquisición | 01, 02, 04, 38 | Landing, pricing, onboarding, referidos e invitaciones, trial de 7 días |
| Deportes | 05, 06◐, 07, 08, 11b, 12, 33 | Dashboard, hub de NFL, Liga MX y Premier League, Game Center y búsqueda |
| Investigación | 13, 14, 15 (NFL), 16◐ | Jugadores, perfiles, Prop Lab NFL **con línea manual y cuota opcional ingresada por el usuario** (sin cuotas de props en la fase $0) y equipos básico |
| Mercados | 17 (actual + histórico capturado) | Comparador de moneyline, spread y totales con las casas del plan gratis de The Odds API, en snapshots espaciados. Apertura propia y **cierre aproximado** (último snapshot antes del inicio). |
| Comunidad | 25, 36, 37◐ | Pick Journal, Mi Lab, perfiles públicos y leaderboard beta tras flag |
| Inteligencia | 21◐, 22◐ | Metodología, Baseline 0 documentado y estado «en validación» |
| Operación | 29, 30, 32 | Admin, datos, usuarios, billing y moderación |

## 3. Fuera del MVP (y por qué)

| Fuera | Motivo | Cuándo |
|---|---|---|
| Predicciones públicas (21 completo) | Ningún modelo ha pasado el gate | Cuando un modelo supere al Baseline 0 y al mercado (W5) |
| Backtesting (23) y Replay (20) | Requieren un histórico as-of suficiente | W5 |
| PitchLab AI (24) | Necesita una API estable y control de costos | W5 |
| Alertas (26 completo) y notificaciones push | Retención, no activación | W6 |
| NCAAF, NHL y MLB | Licencias y costos | Tras FD-02 Pro |
| Props de fútbol | Cobertura de props de soccer por confirmar con el proveedor | Post-MVP |
| Cuotas reales de props NFL | No caben en el plan gratis de The Odds API | Disparador §6 de `FREE_DATA_STRATEGY.md` (US$59/mes) |
| Liga MX en un plan de pago | Licencia comercial de API-Football Free no confirmada | Tras FD-14 (a) |
| Apps nativas | Web y PWA bastan para validar | Post-tracción |
| Afiliados, SGP y OCR | Postura y cumplimiento | No planeado |

## 4. Criterios de lanzamiento (beta pública)

**Producto**

- J1, J2, J4, J5 y J8 de `USER_JOURNEYS.md` pasan en E2E (Playwright) en 375 y 1440 px.
- Las cifras visibles tienen fuente, hora y, cuando aplica, n.
- No hay datos demo en producción (gate de build).

**Datos**

- Fuentes conformes a `FREE_DATA_STRATEGY.md` §1 y §5: atribución a nflverse visible y Liga MX solo con la licencia confirmada o detrás del flag.
- Frescura dentro del SLA de cada liga durante 14 días seguidos en staging.
- Captura de snapshots de cuotas activa al menos 4 semanas antes del lanzamiento (para tener apertura, cierre y CLV desde el inicio).

**Calidad**

- Gates de `PITCHLAB_MASTER_PLAN.md` §11 en verde.
- Lighthouse ≥ 90 en las rutas públicas y CWV de laboratorio dentro de los umbrales.

**Negocio y legal**

- Pasarela aprobada (FD-06).
- Aviso de privacidad, términos y juego responsable publicados (C-04, C-05 y C-08).
- Revisión legal de leaderboards y emblemas (FD-07/08). Si no está lista, se lanza con los flags apagados.

## 5. Éxito del MVP (8 semanas después de la beta)

| Métrica | Umbral para seguir invirtiendo |
|---|---|
| Activos semanales / registrados (W4) | ≥ 25 % |
| Investigaciones completadas por activo a la semana | ≥ 3 |
| Conversión trial → pago | ≥ 8 % (directo) / ≥ 5 % (referido) |
| Registros por referido o invitación | ≥ 20 % |
| Suscriptores de pago | ≥ el punto de equilibrio Lean (~45–80 según el precio) |

No son promesas: son umbrales de decisión para pasar a datos Pro y a la Wave 5.
