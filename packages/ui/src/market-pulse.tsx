/**
 * «Dónde está el dinero» (FD-20): volumen por resultado en mercados de predicción comparado con
 * la probabilidad del modelo. Nunca nombra al proveedor (FD-16) y siempre aclara que no es dinero
 * de casas mexicanas.
 */
import {
  MARKET_PULSE_LEAN_GAP,
  formatPercent,
  marketPulseLean,
  type MarketPulseSide,
  type MarketPulseView,
} from "@pitchlab/contracts";
import { Badge } from "./components/ui/badge.js";

const COMPACT = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });
const TIME = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Mexico_City",
});

export function formatPulseVolume(
  volume: number,
  unit: MarketPulseView["unit"],
  short = false,
): string {
  const n = COMPACT.format(volume < 1000 ? Math.round(volume) : volume);
  if (unit === "usd") return `US$${n}`;
  return short ? n : `${n} contratos`;
}

export function MarketPulsePanel({
  pulse,
  labels,
  model,
}: {
  pulse?: MarketPulseView;
  labels: Record<MarketPulseSide, string>;
  model: Partial<Record<MarketPulseSide, number>>;
}): React.JSX.Element {
  if (!pulse) {
    return (
      <section className="pulse panel" aria-labelledby="pulse-title" data-market-pulse="empty">
        <p className="eyebrow" id="pulse-title">
          Dónde está el dinero
        </p>
        <p className="small secondary pulse-empty">
          Todavía no hay mercado abierto para este partido. Los mercados suelen abrir entre una y
          dos semanas antes y ganan volumen cerca del inicio.
        </p>
      </section>
    );
  }

  const lean = marketPulseLean(pulse, model);
  const top = [...pulse.sides].sort((a, b) => b.share - a.share)[0];

  return (
    <section
      className="pulse panel"
      aria-labelledby="pulse-title"
      data-market-pulse={pulse.thin ? "thin" : "ready"}
    >
      <div className="pulse-head">
        <div>
          <p className="eyebrow" id="pulse-title">
            Dónde está el dinero
          </p>
          <p className="caption muted pulse-meta">
            Mercados de predicción · {TIME.format(Date.parse(pulse.observedAt))}
          </p>
        </div>
        <div className="pulse-total">
          <b className="num">{formatPulseVolume(pulse.totalVolume, pulse.unit)}</b>
          <span className="caption muted">negociados</span>
        </div>
      </div>

      <div
        className={`pulse-stack${pulse.thin ? " is-thin" : ""}`}
        role="img"
        aria-label={pulse.sides
          .map((s) => `${labels[s.side]} ${formatPercent(s.share, 0)} del dinero`)
          .join(", ")}
      >
        {pulse.sides.map((s) => (
          <span
            key={s.side}
            data-side={s.side}
            className={s.side === top?.side ? "lead" : ""}
            style={{ flex: Math.max(s.share, 0.001) }}
          />
        ))}
      </div>

      <table className="pulse-table">
        <caption className="sr-only">Reparto del dinero frente a la probabilidad del modelo</caption>
        <thead>
          <tr>
            <th scope="col">Resultado</th>
            <th scope="col" className="num">
              <span className="key key-money" aria-hidden="true" />
              Dinero
            </th>
            <th scope="col" className="num">
              <span className="key key-model" aria-hidden="true" />
              Modelo
            </th>
          </tr>
        </thead>
        <tbody>
          {pulse.sides.map((s) => {
            const p = model[s.side];
            return (
              <tr key={s.side} data-side={s.side} className={lean?.side === s.side ? "is-lean" : ""}>
                <th scope="row">
                  <span className="pulse-label">{labels[s.side]}</span>
                  <span className="pulse-bars" aria-hidden="true">
                    <span className="bar-money" style={{ width: `${(s.share * 100).toFixed(1)}%` }} />
                    {p !== undefined ? (
                      <span className="bar-model" style={{ width: `${(p * 100).toFixed(1)}%` }} />
                    ) : null}
                  </span>
                </th>
                <td className="num">
                  <b>{formatPercent(s.share, 0)}</b>
                  <small>{formatPulseVolume(s.volume, pulse.unit, true)}</small>
                </td>
                <td className="num">
                  <b>{p !== undefined ? formatPercent(p, 0) : "–"}</b>
                  <small>
                    {s.price !== null ? `mercado ${formatPercent(s.price, 0)}` : " "}
                  </small>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {pulse.thin ? (
        <p className="pulse-read small secondary" data-pulse-read="thin">
          Poco volumen todavía: el reparto aún no dice nada. Vuelve cerca del inicio, cuando entra
          la mayor parte del dinero.
        </p>
      ) : lean ? (
        <div className="pulse-read is-lean" data-pulse-read="lean">
          <Badge variant="pill-warning">Mercado cargado</Badge>
          <p className="small">
            El {formatPercent(lean.share, 0)} del dinero va a <b>{labels[lean.side]}</b>, pero el
            modelo le da {formatPercent(lean.model, 0)}. Cuando el público se carga de un lado y ese
            lado falla, es el clásico casinazo.
          </p>
        </div>
      ) : (
        <p className="pulse-read small secondary" data-pulse-read="balanced">
          El dinero va en línea con el modelo: ningún resultado recibe más de{" "}
          {Math.round(MARKET_PULSE_LEAN_GAP * 100)} puntos por encima de su probabilidad.
        </p>
      )}

    </section>
  );
}

/** Resumen de una línea en la pestaña Picks; lleva a la pestaña Dinero. */
export function MarketPulseTeaser({
  pulse,
  labels,
  lean,
  onOpen,
}: {
  pulse?: MarketPulseView;
  labels: Record<MarketPulseSide, string>;
  lean: ReturnType<typeof marketPulseLean>;
  onOpen: () => void;
}): React.JSX.Element | null {
  if (!pulse) return null;
  const top = [...pulse.sides].sort((a, b) => b.share - a.share)[0];
  if (!top) return null;
  return (
    <button type="button" className="pulse-teaser panel" onClick={onOpen} data-pulse-teaser="">
      <span className="eyebrow">Dónde está el dinero</span>
      <span className="pulse-teaser-line small">
        {pulse.thin ? (
          <>Poco volumen todavía · {formatPulseVolume(pulse.totalVolume, pulse.unit)}</>
        ) : (
          <>
            <b className="num">{formatPercent(top.share, 0)}</b> a {labels[top.side]} ·{" "}
            {formatPulseVolume(pulse.totalVolume, pulse.unit)}
          </>
        )}
      </span>
      {lean ? <Badge variant="pill-warning">Mercado cargado</Badge> : null}
      <span className="caption pulse-teaser-cta" aria-hidden="true">
        Ver detalle →
      </span>
    </button>
  );
}

/** Cómo leer el panel de dinero: qué mide y qué no. */
export function MarketPulseGuide(): React.JSX.Element {
  return (
    <section className="pulse-guide" aria-labelledby="pulse-guide-title">
      <p className="eyebrow" id="pulse-guide-title">
        Cómo leerlo
      </p>
      <dl>
        <div>
          <dt>
            <span className="key key-money" aria-hidden="true" />
            Dinero
          </dt>
          <dd>Parte del volumen negociado en cada resultado.</dd>
        </div>
        <div>
          <dt>
            <span className="key key-model" aria-hidden="true" />
            Modelo
          </dt>
          <dd>Probabilidad que le da el modelo PitchLab al mismo resultado.</dd>
        </div>
        <div>
          <dt>Mercado cargado</dt>
          <dd>
            El dinero supera al modelo por {Math.round(MARKET_PULSE_LEAN_GAP * 100)} puntos o más.
            Si ese lado falla, el público pierde en bloque: el casinazo.
          </dd>
        </div>
      </dl>
      <p className="caption muted">
        Volumen de mercados de predicción internacionales, no de casas mexicanas. Incluye a quien
        compra y a quien vende cada resultado: mide atención, no dinero 100 % a favor. Con poco
        volumen no se interpreta. Es análisis, no una invitación a apostar · +18.
      </p>
    </section>
  );
}
