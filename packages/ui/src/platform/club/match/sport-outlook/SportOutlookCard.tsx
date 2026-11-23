import React, { useId } from "react";
import { ProbSplit } from "../../../../sports";
import { formatOddsValue } from "../../../access-guard";
import type { OddsFormat } from "../../../types";
import { MaestroIcon, type MaestroIconName } from "../../../components/MaestroPrimitives";
import {
  SPORT_LABEL,
  confirmationViews,
  favoriteOf,
  isValidOutlook,
  lineViews,
  marginText,
  nflSpecialViews,
  pctText,
  projectedScore,
  restNotes,
  topDrivers,
  totalText,
  winnerSegments,
  type ConfirmationTone,
} from "./sport-outlook-logic";
import type { SportOutlookInput } from "./sport-outlook-types";

export interface SportOutlookCardProps {
  readonly outlook: SportOutlookInput;
  readonly oddsFormat: OddsFormat;
  readonly isExample?: boolean;
}

const TONE_ICON: Record<ConfirmationTone, MaestroIconName> = {
  ok: "check",
  info: "eye",
  muted: "calendar",
  warning: "flag",
  danger: "x",
};

const timeFmt = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function updatedAt(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : timeFmt.format(d);
}

export function SportOutlookCard({
  outlook,
  oddsFormat,
  isExample = false,
}: SportOutlookCardProps): React.JSX.Element {
  const headingId = useId();

  if (!isValidOutlook(outlook)) {
    return (
      <section
        className="pl-sport-outlook glass-card glass-ring"
        aria-labelledby={headingId}
        data-sport-outlook={outlook.sport}
        data-state="empty"
      >
        <h3 id={headingId} className="pl-so-title">
          Panorama del partido
        </h3>
        <p className="pl-so-empty">
          Todavía no tenemos el panorama de este partido. Aparece en cuanto el modelo termine
          de calcularlo.
        </p>
      </section>
    );
  }

  const favorite = favoriteOf(outlook);
  const segments = winnerSegments(outlook);
  const score = projectedScore(outlook);
  const lines = lineViews(outlook);
  const nflSpecials = nflSpecialViews(outlook);
  const confirmations = confirmationViews(outlook);
  const rest = restNotes(outlook);
  const drivers = topDrivers(outlook);
  const generated = updatedAt(outlook.generatedAtUtc);
  const otSegment = segments.length === 3 ? segments[1] : null;

  return (
    <section
      className="pl-sport-outlook glass-card glass-ring"
      aria-labelledby={headingId}
      data-sport-outlook={outlook.sport}
    >
      <header className="pl-so-head">
        <div className="pl-so-head-text">
          <span className="pl-so-sport">{SPORT_LABEL[outlook.sport]}</span>
          <h3 id={headingId} className="pl-so-title">
            Panorama del partido
          </h3>
        </div>
        <div className="pl-so-head-meta">
          {isExample ? (
            <span className="pl-pill pl-pill--warning text-[10px]" data-example-badge="">
              Ejemplo
            </span>
          ) : null}
          {generated ? (
            <time className="pl-so-time num" dateTime={outlook.generatedAtUtc}>
              Calculado {generated}
            </time>
          ) : null}
        </div>
      </header>

      <div className="pl-so-grid">
        <div className="pl-so-block" data-block="winner">
          <h4 className="pl-so-label">Quién gana</h4>
          <p className="pl-so-lead">
            <span className="pl-so-lead-team">Gana {favorite.team}</span>
            <strong className="pl-so-lead-value num">{pctText(favorite.p)}</strong>
          </p>
          <ProbSplit
            probabilities={segments.map((s) => s.p)}
            labels={segments.map((s) => s.label)}
          />
          <ul
            className="pl-so-legend"
            role="list"
            aria-label={otSegment ? "Cómo termina el partido" : "Probabilidad de cada equipo"}
          >
            {segments.map((s) => (
              <li key={s.label}>
                <span>{s.label}</span>
                <strong className="num">{pctText(s.p)}</strong>
              </li>
            ))}
          </ul>
          <p className="pl-so-note num">
            Momio justo {formatOddsValue(1 / Math.max(favorite.p, 0.01), oddsFormat)}
          </p>
        </div>

        <div className="pl-so-block" data-block="score">
          <h4 className="pl-so-label">Marcador esperado</h4>
          <div
            className="pl-so-score"
            role="img"
            aria-label={`${outlook.homeTeam} ${score.home}, ${outlook.awayTeam} ${score.away}`}
          >
            <span className="pl-so-score-team">
              <span className="pl-so-score-name">{outlook.homeTeam}</span>
              <strong className="pl-so-score-value num">{score.home}</strong>
            </span>
            <span className="pl-so-score-sep" aria-hidden="true">
              –
            </span>
            <span className="pl-so-score-team is-away">
              <span className="pl-so-score-name">{outlook.awayTeam}</span>
              <strong className="pl-so-score-value num">{score.away}</strong>
            </span>
          </div>
          <p className="pl-so-note num">
            {marginText(outlook)} · {totalText(outlook)}
            {outlook.sport === "nba" &&
            typeof outlook.expectedPace === "number" &&
            Number.isFinite(outlook.expectedPace)
              ? ` · ${Math.round(outlook.expectedPace)} posesiones por equipo`
              : null}
          </p>
        </div>
      </div>

      {lines.length > 0 ? (
        <div className="pl-so-section" data-block="lines">
          <h4 className="pl-so-label">Líneas del partido</h4>
          <div className="pl-so-lines">
            {lines.map((line) => {
              let leadIdx = 0;
              for (let i = 1; i < line.options.length; i += 1) {
                if (line.options[i]!.p > line.options[leadIdx]!.p) {
                  leadIdx = i;
                }
              }
              return (
                <article key={`${line.kind}-${line.title}`} className="pl-so-line">
                  <h5 className="pl-so-line-title">{line.title}</h5>
                  <ul className="pl-so-line-options" role="list">
                    {line.options.map((opt, idx) => (
                      <li
                        key={opt.label}
                        className="pl-so-option"
                        data-lead={idx === leadIdx ? "true" : "false"}
                      >
                        <span className="pl-so-option-label">{opt.label}</span>
                        <span className="pl-so-option-value num">
                          <strong>{pctText(opt.p)}</strong>
                          <span className="pl-so-option-fair">
                            justo {formatOddsValue(1 / Math.max(opt.p, 0.01), oddsFormat)}
                          </span>
                        </span>
                        <span className="pl-so-option-bar" aria-hidden="true">
                          <span style={{ inlineSize: `${(opt.p * 100).toFixed(1)}%` }} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      {nflSpecials.length > 0 ? (
        <div className="pl-so-section" data-block="nfl-specials">
          <h4 className="pl-so-label">Escenarios clave de NFL</h4>
          <div className="pl-so-lines">
            {nflSpecials.map((special) => (
              <article
                key={special.key}
                className="pl-so-line"
                data-nfl-special={special.key}
              >
                <h5 className="pl-so-line-title">{special.title}</h5>
                <ul className="pl-so-line-options" role="list">
                  <li className="pl-so-option" data-lead="true">
                    <span className="pl-so-option-label">{special.subtitle}</span>
                    <span className="pl-so-option-value num">
                      <strong>{pctText(special.p)}</strong>
                      {special.fairDecimal !== null ? (
                        <span className="pl-so-option-fair">
                          justo {formatOddsValue(special.fairDecimal, oddsFormat)}
                        </span>
                      ) : null}
                    </span>
                    <span className="pl-so-option-bar" aria-hidden="true">
                      <span style={{ inlineSize: `${(special.p * 100).toFixed(1)}%` }} />
                    </span>
                  </li>
                </ul>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {confirmations.length > 0 || rest.length > 0 || drivers.length > 0 ? (
        <div
          className={
            (confirmations.length > 0 || rest.length > 0) && drivers.length > 0
              ? "pl-so-bottom-grid"
              : "pl-so-bottom-single"
          }
        >
          {confirmations.length > 0 || rest.length > 0 ? (
            <div className="pl-so-section" data-block="confirmations">
              <h4 className="pl-so-label">Antes del partido</h4>
              <ul className="pl-so-checks" role="list">
                {confirmations.map((c) => (
                  <li key={c.key} className="pl-so-check" data-tone={c.tone}>
                    <span className="pl-so-check-icon" aria-hidden="true">
                      <MaestroIcon name={TONE_ICON[c.tone]} size={14} />
                    </span>
                    <span className="pl-so-check-text">
                      <strong>{c.title}</strong>
                      {c.detail ? <span>{c.detail}</span> : null}
                    </span>
                  </li>
                ))}
                {rest.map((note) => (
                  <li key={note} className="pl-so-check" data-tone="info">
                    <span className="pl-so-check-icon" aria-hidden="true">
                      <MaestroIcon name="activity" size={14} />
                    </span>
                    <span className="pl-so-check-text">
                      <strong>{note}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {drivers.length > 0 ? (
            <div className="pl-so-section" data-block="drivers">
              <h4 className="pl-so-label">Qué inclina el partido</h4>
              <ul className="pl-so-drivers" role="list">
                {drivers.map((d, idx) => (
                  <li
                    key={`${d.factor}-${idx}`}
                    className="pl-so-driver"
                    data-favors={d.favors ?? "none"}
                  >
                    <span>{d.label}</span>
                    <span className="pl-so-driver-value num">{d.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="pl-so-foot">Probabilidades del modelo. Información para decidir.</p>
    </section>
  );
}
