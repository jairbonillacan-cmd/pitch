# Stack de costo cero (beta)

> **Propósito:** fijar los servicios con los que PitchLab corre en pitchlab.mx a US$0/mes durante la beta, cuándo empezaría a costar cada uno y qué fuentes de datos gratuitas usamos.
> **Consumidores:** fundador, agentes que configuran infraestructura, datos o IA.
> **Decisión:** FD-18, FD-19, FD-20 en `docs/execution/FOUNDER_DECISIONS.md` (2026-11-08).
> **Aviso:** límites gratuitos tomados de las páginas de precios en noviembre de 2026; cambian seguido. Verificar la página oficial antes de crear cada cuenta.

## 1. Infraestructura

| Capa | Servicio | Gratis hasta (aprox.) | Disparador de pago |
|---|---|---|---|
| Web | Next.js 15 + React + TypeScript, Tailwind + shadcn/ui | Software libre | — |
| Hosting | Vercel Hobby | Beta cerrada | Cobrar o abrir al público → Vercel Pro (~US$20/mes; Hobby es solo no comercial) |
| Dominio y DNS | Cloudflare (pitchlab.mx) | DNS y Email Routing gratis | — |
| Base de datos | **Neon** (Postgres estándar, con Drizzle), región AWS us-east-1 junto a Vercel | 1 GB por proyecto, branch por preview | Pasar de 1 GB o necesitar más cómputo → plan de pago por uso (~US$19/mes) |
| Respaldos | Restauración de Neon + `pg_dump` semanal desde GitHub Actions a R2 | Incluido | Copia propia fuera del proveedor |
| Histórico y archivos | Cloudflare R2 | 10 GB, sin costo de salida | > 10 GB: centavos por GB |
| Rate limit y caché | Upstash Redis | ~500 mil comandos/mes | Tráfico alto: pago por uso |
| Login | Better Auth + Google OAuth | Sin límite de usuarios | Apple Sign-In descartado: cobra US$99/año |
| Correo transaccional | Resend (`send.pitchlab.mx`) | ~3,000 correos/mes | Registro masivo: ~US$20/mes |
| Correo de contacto | Cloudflare Email Routing → buzón del fundador | Gratis | — |
| Automatización | GitHub Actions | ~2,000 min/mes (repo privado) | — |
| IA | OpenRouter → **DeepSeek V4.1 Flash 1017** (`deepseek/deepseek-v4.1-flash-1017`) | Sin plan gratis; ~US$0.006/M entrada y ~US$0.50/M salida → ~US$0.0003 por lectura | Créditos prepagados con tope. Fijar el proveedor más barato (hay hasta 13× de diferencia entre endpoints) y desactivar retención/entrenamiento en OpenRouter |

**Regla de datos:** en Postgres solo vive lo que la app lee en vivo (usuarios, perfiles, invitaciones, referidos, suscripciones, picks, predicciones publicadas). El histórico crudo y las features (~1 GB hoy en `data/history/`) van en Parquet a R2.

## 2. Fuentes de datos deportivos gratuitas

| Fuente | Gratis | Uso comercial | Uso en PitchLab |
|---|---|---|---|
| nflverse | Abierto | Sí (licencias abiertas) | NFL (ya integrado) |
| openfootball | Abierto (CC0) | Sí | Esqueleto de calendarios (ya integrado) |
| football-data.org | 10 consultas/min, 12 competiciones | Revisar términos | Resultados y horarios europeos (ya integrado) |
| API-Football | 100 consultas/día | Pendiente confirmación (FD-14) | Liga MX (ya integrado) |
| BALLDONTLIE | 5 consultas/min, un deporte | **Sí, explícito en sus términos** | NFL, MLB, NHL |
| Big Balls Sports Data | 250 consultas/día; endpoint de lesiones 1,000/día | Revisar términos | Alineaciones confirmadas y lesiones (top 5 europeas, MLS) |
| Bzzoiro Sports Data (BSD) | Dice no tener límite; incluye predicciones ML | Verificar | Solo como referencia interna del backtest |
| Understat | Sin clave | Sin términos claros | xG de tiro, top 5 europeas (investigación) |
| StatsBomb Open Data | Abierto, algunas competiciones | Con atribución | Eventos y xG para investigación |
| TheRundown | ~20,000 datos/día, 5 min de retraso | Revisar términos | Cuotas de mercado como benchmark del modelo |
| The Odds API | 500 créditos/mes | Sí | Respaldo de cuotas |
| APIs oficiales MLB / NHL | Gratis, sin clave | **Restringido** (copyright MLBAM; NHL sin términos públicos) | Evitar en producción; usar BALLDONTLIE |

Sigue vigente FD-16: ningún proveedor aparece en la interfaz; la atribución que exijan las licencias va en «Créditos y licencias». Sigue prohibido el scraping de casas de apuestas.

## 3. ¿Dónde está el dinero? (volumen por resultado)

Objetivo de producto: mostrar en qué lado se concentra el dinero de un partido (por ejemplo, Toluca 64 % del volumen, empate 8 %, Necaxa 28 %) y compararlo con la probabilidad del modelo para detectar posibles «casinazos»: partidos donde el público carga un lado que el modelo ve menos probable.

**Lo que no existe gratis:** las casas mexicanas (Caliente, Codere, etc.) no publican porcentajes de tickets ni de dinero. Los «betting splits» de EE. UU. (DraftKings, Circa, BetMGM) solo llegan por APIs de pago (SharpAPI Pro ~US$229/mes, Sportradar) o scrapers de terceros (no permitidos).

**Lo que sí existe gratis — mercados de predicción con API pública:**

| Fuente | Qué da | Cobertura verificada (2026-11-08) |
|---|---|---|
| **Polymarket** (`gamma-api.polymarket.com`, sin clave) | Por partido: un mercado por resultado (local, empate, visitante) con **volumen en USD** y precio (probabilidad implícita). También mercados de campeón, liderato, etc. | **Liga MX por partido** (ej. Toluca vs Necaxa: US$508k / 68k / 232k), NFL, ligas europeas |
| **Kalshi** (`api.elections.kalshi.com/trade-api/v2`, sin clave) | Un contrato sí/no por equipo con volumen en contratos de US$1 | NFL por partido (serie `KXNFLGAME`); fútbol por confirmar |
| Betfair Exchange | Volumen igualado por selección | **Solo con la clave en vivo** (pago único ~£299–499 y aprobación para uso comercial). La clave gratuita no trae volumen. Descartado por ahora |

**Cómo leerlo con honestidad (obligatorio en la UI y la metodología):**

1. Es dinero de **mercados de predicción internacionales**, no de las casas mexicanas. Es un indicador del sentimiento, no «lo que apostó México».
2. El volumen de un mercado incluye compras **y ventas**, y en Polymarket incluye a quien compra «No». Mide interés y actividad en ese resultado, no dinero 100 % a favor. Por eso se muestra junto con el precio (probabilidad implícita) y su movimiento.
3. En partidos con poco volumen (ej. US$21) el indicador no significa nada: se oculta por debajo de un umbral mínimo.
4. Se presenta como análisis («dónde está la atención del mercado»), nunca como invitación a apostar, y con el aviso de juego responsable.

**Pendiente antes de mostrarlo a usuarios (FD-20):** revisar los términos de uso de datos de Polymarket y Kalshi para uso comercial, y cómo nombrar la fuente sin romper FD-16 (por ejemplo, «mercados de predicción»).

## Fuentes

- Prisma, *Serverless Postgres compared (2026)*: https://www.prisma.io/blog/serverless-postgres
- Neon Free Tier 2026: https://agentdeals.dev/vendor/neon
- OpenRouter, DeepSeek V4.1 Flash 1017: https://openrouter.ai/deepseek/deepseek-v4.1-flash-1017
- Diferencia de precios entre endpoints de OpenRouter: https://runtimewire.com/article/one-deepseek-model-41-endpoints-a-13x-price-gap-on-openroute-b239fa
- Términos de BALLDONTLIE: https://www.balldontlie.io/terms.html
- Big Balls Sports Data, lesiones: https://bigballsdata.com/injuries-api
- Lista de datos de fútbol: https://github.com/3zavalam/awesome-soccer-data
- TheRundown: https://therundown.io/api
- SharpAPI, precios de splits: https://sharpapi.io/pricing
- Betfair, clave retrasada sin volumen: https://betfair-developer-docs.atlassian.net/wiki/x/J4DS
