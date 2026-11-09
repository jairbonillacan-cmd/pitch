"use client";

import React, { useEffect, useState } from "react";
import type {
  AnalysisConfidence,
  AnalysisMarketGroup,
  AnalysisPick,
  HeadToHeadView,
  StandingRow,
  CalcStep,
  FactorItem,
  LeagueId,
  MatchAnalysis,
  OutcomeMarket,
} from "@pitchlab/contracts";
import {
  asMarketKey,
  formatDecimal,
  formatFreshnessEs,
  formatPercent,
  probabilityToFairOdds,
  selectionHolds,
} from "@pitchlab/contracts";
import {
  getEmblemPath,
  getLeagueEmblemPath,
  hasLeagueAsset,
  hasTeamAsset,
} from "@pitchlab/sports-assets";
import { Icon } from "./icons.js";

/** Iniciales para equipos/ligas sin emblema registrado (ADR-017: fallback neutro). */
function initialsFromName(name: string | undefined, fallback: string): string {
  const source = (name ?? "").trim() || fallback;
  const words = source.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return source.slice(0, 3).toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}

const GENERIC_LEAGUE_CODES: Record<string, string> = {
  bundesliga: "BL",
  "serie-a": "SA",
  "ligue-1": "L1",
};

export function leadIndex(ps: readonly number[]): number {
  return ps.reduce((bi, p, i) => (p > (ps[bi] ?? -1) ? i : bi), 0);
}

export function parseUserOdds(raw: string): number | null {
  const s = String(raw).trim().replace(",", ".");
  if (!s) return null;
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  if (/^[+-]/.test(s) && Math.abs(v) >= 100) {
    return v > 0 ? 1 + v / 100 : 1 + 100 / Math.abs(v);
  }
  return v > 1 ? v : null;
}

export function TeamBadge({
  league,
  slug,
  name,
  size = 24,
  decorative = true,
}: {
  league: LeagueId | string;
  slug: string;
  name?: string;
  size?: number;
  decorative?: boolean;
}): React.JSX.Element {
  if (!hasTeamAsset(league, slug)) {
    return (
      <span
        className="badge badge-fallback"
        style={{ width: size, height: size, fontSize: Math.max(8, size * 0.36), fontWeight: 700 }}
        aria-hidden={decorative ? "true" : undefined}
        title={name}
      >
        {initialsFromName(name, slug)}
      </span>
    );
  }
  return (
    <span
      className="badge"
      style={{ width: size, height: size }}
      aria-hidden={decorative ? "true" : undefined}
      title={name}
    >
      <img
        src={getEmblemPath(league, slug)}
        alt={decorative ? "" : (name ?? "")}
        width={size}
        height={size}
        decoding="async"
      />
    </span>
  );
}

export function LeagueBadge({
  league,
  label,
  size = 24,
}: {
  league: LeagueId | string;
  label?: string;
  size?: number;
}): React.JSX.Element {
  if (league === "nhl" || league === "mlb") {
    return (
      <span
        className="badge badge-fallback"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <Icon name={league === "nhl" ? "hockey" : "baseball"} />
      </span>
    );
  }
  if (!hasLeagueAsset(league)) {
    return (
      <span
        className="badge badge-fallback"
        style={{ width: size, height: size, fontSize: Math.max(8, size * 0.36), fontWeight: 700 }}
        aria-hidden="true"
        title={label}
      >
        {GENERIC_LEAGUE_CODES[league] ?? initialsFromName(label, league)}
      </span>
    );
  }
  return (
    <span className="badge" style={{ width: size, height: size }}>
      <img
        src={getLeagueEmblemPath(league)}
        alt={label ?? ""}
        width={size}
        height={size}
        decoding="async"
      />
    </span>
  );
}

export function PBar({
  p,
  lead = false,
  grow = false,
}: {
  p: number;
  lead?: boolean;
  grow?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={`pbar ${lead ? "lead" : ""} ${grow ? "grow" : ""}`.trim()}
      style={{ "--w": `${(p * 100).toFixed(1)}%` } as React.CSSProperties}
    >
      <span />
    </div>
  );
}

export function ProbBar({
  outcomes,
  p,
  lead = false,
}: {
  outcomes?: readonly OutcomeMarket[];
  p?: number;
  lead?: boolean;
}): React.JSX.Element {
  if (typeof p === "number") {
    return <PBar p={p} lead={lead} />;
  }
  const list = outcomes ?? [];
  return (
    <ProbSplit
      probabilities={list.map((o) => o.probability)}
      labels={list.map((o) => o.label)}
    />
  );
}

export function ProbSplit({
  outcomes,
  probabilities,
  labels,
}: {
  outcomes?: readonly OutcomeMarket[];
  probabilities?: readonly number[];
  labels?: readonly string[];
}): React.JSX.Element {
  const ps =
    probabilities ?? (outcomes ? outcomes.map((o) => o.probability) : [0.5, 0.5]);
  const lbs =
    labels ?? (outcomes ? outcomes.map((o) => o.label) : ps.map((_, i) => `${i + 1}`));
  const li = leadIndex(ps);

  return (
    <div
      className="psplit"
      role="img"
      aria-label={ps.map((p, i) => `${lbs[i] ?? ""} ${formatPercent(p, 1)}`).join(", ")}
    >
      {ps.map((p, i) => (
        <span
          key={`${lbs[i] ?? i}-${i}`}
          className={i === li ? "lead" : ""}
          style={{ flex: p }}
        />
      ))}
    </div>
  );
}

export function Freshness({
  generatedAt,
  now,
}: {
  generatedAt: string;
  now?: Date;
}): React.JSX.Element {
  const info = formatFreshnessEs(generatedAt, now);
  return (
    <span className="fresh" title={generatedAt}>
      <span className="dot" />
      <span>{info.label}</span>
    </span>
  );
}

/* ---------- Picks, confianza y contexto ---------- */

export const PROFILE_LABELS: Record<AnalysisPick["profile"], string> = {
  conservadora: "Conservadora",
  intermedia: "Intermedia",
  arriesgada: "Arriesgada",
};

/** Pick destacado: el intermedio y, si no hay, el conservador. */
export function featuredPickOf(
  picks: readonly AnalysisPick[] | undefined,
): AnalysisPick | undefined {
  return (
    picks?.find((p) => p.profile === "intermedia") ??
    picks?.find((p) => p.profile === "conservadora")
  );
}

/** Resultado de un pick con el marcador final (null si no se puede calificar). */
export function pickResult(
  pick: AnalysisPick,
  score: { home: number; away: number } | undefined,
): "hit" | "miss" | null {
  if (!score) return null;
  const holds = selectionHolds(pick, score.home, score.away);
  return holds === null ? null : holds ? "hit" : "miss";
}

const CONFIDENCE_LABELS: Record<AnalysisConfidence["level"], string> = {
  alta: "Confianza alta",
  media: "Confianza media",
  baja: "Confianza baja",
};

export function ConfidenceBadge({
  confidence,
  compact = false,
}: {
  confidence: AnalysisConfidence;
  compact?: boolean;
}): React.JSX.Element {
  const title = confidence.reasons.length > 0 ? confidence.reasons.join(" · ") : undefined;
  return (
    <span
      className={"conf conf-" + confidence.level + (compact ? " compact" : "")}
      title={title}
      data-confidence={confidence.level}
    >
      <span className="bars" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      {CONFIDENCE_LABELS[confidence.level]}
    </span>
  );
}

/** «Hoy» / «En juego», calculado en el navegador para no desajustar la hidratación. */
export function useMatchMoment(
  kickoffIso: string,
  finished: boolean,
): "live" | "today" | null {
  const [moment, setMoment] = useState<"live" | "today" | null>(null);
  useEffect(() => {
    if (finished) {
      setMoment(null);
      return;
    }
    const compute = (): "live" | "today" | null => {
      const start = Date.parse(kickoffIso);
      if (!Number.isFinite(start)) return null;
      const now = Date.now();
      if (now >= start && now <= start + 2.5 * 3600 * 1000) return "live";
      const a = new Date(start);
      const b = new Date(now);
      const sameDay =
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
      return sameDay && now < start ? "today" : null;
    };
    setMoment(compute());
    const id = window.setInterval(() => setMoment(compute()), 60_000);
    return () => window.clearInterval(id);
  }, [kickoffIso, finished]);
  return moment;
}

export function MomentTag({
  moment,
}: {
  moment: "live" | "today" | null;
}): React.JSX.Element | null {
  if (!moment) return null;
  return moment === "live" ? (
    <span className="moment live">
      <span className="dot" />
      En juego
    </span>
  ) : (
    <span className="moment">Hoy</span>
  );
}

export function PicksPanel({
  picks,
  confidence,
  score,
}: {
  picks: readonly AnalysisPick[];
  confidence?: AnalysisConfidence;
  score?: { home: number; away: number };
}): React.JSX.Element {
  const order: AnalysisPick["profile"][] = ["conservadora", "intermedia", "arriesgada"];
  const featured = featuredPickOf(picks);
  return (
    <section className="panel picks" aria-labelledby="picks-title" data-picks="">
      <div className="picks-head">
        <p className="eyebrow" id="picks-title">
          Picks PitchLab
        </p>
        {confidence ? <ConfidenceBadge confidence={confidence} /> : null}
      </div>
      <ul>
        {order.map((profile) => {
          const pick = picks.find((p) => p.profile === profile);
          const result = pick ? pickResult(pick, score) : null;
          return (
            <li
              key={profile}
              className={pick && pick === featured ? "featured" : undefined}
              data-profile={profile}
            >
              <span className="prof">{PROFILE_LABELS[profile]}</span>
              {pick ? (
                <>
                  <span className="sel">
                    {pick.label}
                    {pick === featured ? <span className="fav">Pick</span> : null}
                  </span>
                  <span className="num pp">{formatPercent(pick.p, 0)}</span>
                  <span className="num odds">{formatDecimal(pick.fairOdds)}</span>
                  {result ? (
                    <span className={"res " + result}>
                      {result === "hit" ? "Acertado" : "Fallado"}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="sel muted">Sin pick en este perfil</span>
              )}
            </li>
          );
        })}
      </ul>
      <p className="caption muted picks-note">
        % = probabilidad del modelo · cuota justa sin margen · no garantiza resultados · +18
      </p>
    </section>
  );
}

export function WhyList({
  why,
  title = "Por qué este pick",
}: {
  why: readonly string[];
  title?: string;
}): React.JSX.Element | null {
  if (why.length === 0) return null;
  return (
    <section className="why" aria-labelledby="why-title">
      <p className="eyebrow" id="why-title">
        {title}
      </p>
      <ul>
        {why.map((line, idx) => (
          <li key={idx}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

const H2H_DATE = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function HeadToHead({
  rows,
  restDays,
  homeName,
  awayName,
}: {
  rows?: readonly HeadToHeadView[];
  restDays?: { home?: number; away?: number };
  homeName: string;
  awayName: string;
}): React.JSX.Element | null {
  const list = rows ?? [];
  const hasRest =
    restDays !== undefined && (restDays.home !== undefined || restDays.away !== undefined);
  if (list.length === 0 && !hasRest) return null;
  return (
    <section className="h2h" aria-labelledby="h2h-title">
      <p className="eyebrow" id="h2h-title">
        Historial
      </p>
      {hasRest ? (
        <p className="small secondary rest">
          Descanso: {homeName} {restDays?.home ?? "–"} días · {awayName}{" "}
          {restDays?.away ?? "–"} días
        </p>
      ) : null}
      {list.length > 0 ? (
        <ol>
          {list.map((r, idx) => (
            <li key={r.date + "-" + idx}>
              <span className="caption muted">{H2H_DATE.format(Date.parse(r.date + "T12:00:00Z"))}</span>
              <span>
                {r.home}{" "}
                <b className="num">
                  {r.homeGoals}–{r.awayGoals}
                </b>{" "}
                {r.away}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="caption muted">Sin cruces recientes en nuestro historial.</p>
      )}
    </section>
  );
}

/**
 * Mejores selecciones de la jornada por perfil: un pick por partido, solo partidos por
 * jugar, ordenados por probabilidad y, a igualdad, por confianza.
 */
export function BestPicks({
  matches,
  onSelect,
  limit = 5,
}: {
  matches: readonly MatchAnalysis[];
  onSelect?: (match: MatchAnalysis) => void;
  limit?: number;
}): React.JSX.Element | null {
  const [profile, setProfile] = useState<AnalysisPick["profile"]>("intermedia");
  const upcoming = matches.filter((m) => m.status !== "FT" && m.picks && m.picks.length > 0);
  if (upcoming.length === 0) return null;
  const rows = upcoming
    .map((m) => ({ match: m, pick: m.picks!.find((p) => p.profile === profile) }))
    .filter((r): r is { match: MatchAnalysis; pick: AnalysisPick } => r.pick !== undefined)
    .sort(
      (a, b) =>
        b.pick.p - a.pick.p || (b.match.confidence?.score ?? 0) - (a.match.confidence?.score ?? 0),
    )
    .slice(0, limit);
  const profiles: AnalysisPick["profile"][] = ["conservadora", "intermedia", "arriesgada"];
  return (
    <section className="best" aria-labelledby="best-title" data-best-picks="">
      <div className="best-head">
        <h2 id="best-title">Mejores selecciones</h2>
        <div className="seg" role="tablist" aria-label="Perfil de riesgo">
          {profiles.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={profile === p}
              className="chip"
              data-profile-tab={p}
              onClick={() => setProfile(p)}
            >
              {PROFILE_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="small secondary">Sin selecciones en este perfil para esta jornada.</p>
      ) : (
        <ol className="best-list">
          {rows.map(({ match, pick }) => (
            <li key={match.id}>
              <button type="button" onClick={() => onSelect?.(match)} data-best-game={match.id}>
                <span className="teams">
                  <TeamBadge league={match.league} slug={match.home.slug} name={match.home.name} size={20} decorative />
                  <TeamBadge league={match.league} slug={match.away.slug} name={match.away.name} size={20} decorative />
                  <span className="names">
                    {match.home.shortName} – {match.away.shortName}
                    <small className="muted">
                      {match.dayLabel} · {match.kickoffLocal}
                    </small>
                  </span>
                </span>
                <span className="sel">{pick.label}</span>
                <span className="num pp">{formatPercent(pick.p, 0)}</span>
                <span className="num odds">{formatDecimal(pick.fairOdds)}</span>
                {match.confidence ? <ConfidenceBadge confidence={match.confidence} compact /> : null}
              </button>
            </li>
          ))}
        </ol>
      )}
      <p className="caption muted">
        Probabilidad del modelo y cuota justa (sin margen). Unidades de análisis, no recomendación de
        monto. +18.
      </p>
    </section>
  );
}

export function MatchCard({
  match,
  onSelect,
}: {
  match: MatchAnalysis;
  onSelect?: (match: MatchAnalysis) => void;
}): React.JSX.Element {
  const isFinished = match.status === "FT" && match.score !== undefined;
  const nf = match.league === "nfl";
  const draw = !nf;
  const x12 = match.x12 ?? [
    match.outcomes[0]?.probability ?? 0.45,
    draw ? (match.outcomes[1]?.probability ?? 0.25) : 0,
    match.outcomes[draw ? 2 : 1]?.probability ?? 0.3,
  ];
  const [ph, pd, pa] = x12;
  const ps = draw ? [ph, pd, pa] : [ph, pa];
  const li = leadIndex(ps);
  const hL = li === 0;
  const aL = li === ps.length - 1;
  const dL = draw && li === 1;
  const proj = match.projection ?? { home: nf ? 24 : 1.5, away: nf ? 21 : 1.2, total: nf ? 45 : 2.7 };
  const featured = featuredPickOf(match.picks);
  const featuredResult = featured ? pickResult(featured, match.score) : null;
  const projected = match.projectedScore;
  const moment = useMatchMoment(match.kickoffUtc, isFinished);

  return (
    <button
      type="button"
      className={`panel gcard match-card ${isFinished ? "final" : ""}`.trim()}
      data-game={match.id}
      data-game-id={match.id}
      aria-haspopup="dialog"
      aria-label={`Analizar ${match.home.name} contra ${match.away.name}, ${
        isFinished ? "finalizado" : match.kickoffLocal
      }`}
      onClick={() => onSelect?.(match)}
    >
      <span className="top">
        <span className="when">{isFinished ? "Final" : match.kickoffLocal}</span>
        <MomentTag moment={moment} />
        <span className="venue">{match.venue}</span>
      </span>

      <span className="tm">
        <TeamBadge league={match.league} slug={match.home.slug} size={32} />
        <span>
          {match.home.name}
          {hL && !isFinished ? <span className="fav">Favorito</span> : null}
        </span>
        <span className={`p ${hL && !isFinished ? "lead-txt" : ""}`.trim()}>
          {isFinished ? match.score?.home : formatPercent(ph, 1)}
        </span>
      </span>

      <span className="tm">
        <TeamBadge league={match.league} slug={match.away.slug} size={32} />
        <span>
          {match.away.name}
          {aL && !isFinished ? <span className="fav">Favorito</span> : null}
        </span>
        <span className={`p ${aL && !isFinished ? "lead-txt" : ""}`.trim()}>
          {isFinished ? match.score?.away : formatPercent(pa, 1)}
        </span>
      </span>

      <ProbSplit
        probabilities={ps}
        labels={draw ? [match.home.name, "Empate", match.away.name] : [match.home.name, match.away.name]}
      />

      {featured ? (
        <span className="pickline" data-card-pick="">
          <span className="lbl">Pick</span>
          <span className="sel">{featured.label}</span>
          <span className="num pp">{formatPercent(featured.p, 0)}</span>
          {isFinished && featuredResult ? (
            <span className={"res " + featuredResult}>
              {featuredResult === "hit" ? "Acertado" : "Fallado"}
            </span>
          ) : null}
        </span>
      ) : null}

      <span className="foot">
        <span>
          {draw ? (
            <>
              <span className={dL ? "lead-txt" : ""}>Empate {formatPercent(pd, 1)}</span>
              {" · "}
            </>
          ) : null}
          {projected && !nf
            ? "Marcador proyectado " + projected.home + "–" + projected.away
            : "Proy. " + proj.home.toFixed(nf ? 0 : 1) + "–" + proj.away.toFixed(nf ? 0 : 1)}
        </span>
        {match.confidence && !isFinished ? (
          <ConfidenceBadge confidence={match.confidence} compact />
        ) : null}
        <span className="open">
          Analizar <Icon name="arrow" />
        </span>
      </span>
    </button>
  );
}

export function MarketTable({
  groups,
  outcomes,
  selectedKey,
  onSelectRow,
  maxRowsPerGroup,
  interactive = false,
  style,
}: {
  groups?: readonly AnalysisMarketGroup[];
  outcomes?: readonly OutcomeMarket[];
  selectedKey?: string;
  onSelectRow?: (key: string, label: string, p: number) => void;
  maxRowsPerGroup?: number;
  interactive?: boolean;
  style?: React.CSSProperties;
}): React.JSX.Element {
  const resolvedGroups: AnalysisMarketGroup[] =
    groups && groups.length > 0
      ? [...groups]
      : [
          {
            group: "Resultado",
            rows: (outcomes ?? []).map((o) => ({
              market: asMarketKey("h2h"),
              selection: o.key,
              label: o.label,
              p: o.probability,
              fairOdds:
                o.fairOdds?.decimal ?? probabilityToFairOdds(o.probability).decimal,
            })),
          },
        ];

  return (
    <table className="mtable" style={style}>
      {interactive ? (
        <caption className="sr-only">
          Probabilidades por mercado. Elige una fila para compararla con tu cuota.
        </caption>
      ) : null}
      <thead>
        <tr>
          <th>Mercado</th>
          <th>
            <span className="sr-only">Barra</span>
          </th>
          <th className="r">Prob.</th>
          <th className="r">Cuota justa</th>
        </tr>
      </thead>
      {resolvedGroups.map((m, gi) => {
        const rows = maxRowsPerGroup ? m.rows.slice(0, maxRowsPerGroup) : m.rows;
        const li = leadIndex(rows.map((r) => r.p));
        return (
          <tbody key={m.group}>
            <tr className="group">
              <td colSpan={4}>{m.group}</td>
            </tr>
            {rows.map((r, ri) => {
              const rowKey = `${m.group}:${r.label}`;
              const isLead = ri === li;
              const isSelected = selectedKey === rowKey;
              return (
                <tr
                  key={rowKey}
                  className={
                    interactive
                      ? `mrow ${isLead ? "lead" : ""}`.trim()
                      : undefined
                  }
                  tabIndex={interactive ? 0 : undefined}
                  role={interactive ? "button" : undefined}
                  aria-pressed={interactive ? isSelected : undefined}
                  data-market={interactive ? rowKey : undefined}
                  onClick={
                    interactive
                      ? () => onSelectRow?.(rowKey, r.label, r.p)
                      : undefined
                  }
                  onKeyDown={
                    interactive
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onSelectRow?.(rowKey, r.label, r.p);
                          }
                        }
                      : undefined
                  }
                >
                  <td>
                    {r.label}
                    {isLead && gi === 0 ? (
                      <span className="fav">Favorito</span>
                    ) : null}
                  </td>
                  <td className="bar">
                    <PBar p={r.p} lead={isLead} />
                  </td>
                  <td className={`r num pv ${isLead ? "lead-txt" : ""}`.trim()}>
                    {formatPercent(r.p, 1)}
                  </td>
                  <td className="r num secondary">
                    {r.p > 0 ? formatDecimal(1 / r.p) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        );
      })}
    </table>
  );
}

export function OddsCompare({
  marketLabel = "Local gana",
  modelProb = 0.5,
  outcomes,
}: {
  marketLabel?: string;
  modelProb?: number;
  outcomes?: readonly OutcomeMarket[];
}): React.JSX.Element {
  const [oddsInput, setOddsInput] = useState("");
  const label = outcomes?.[0]?.label ?? marketLabel;
  const p = outcomes?.[0]?.probability ?? modelProb;
  const parsedDec = parseUserOdds(oddsInput);
  const imp = parsedDec ? 1 / parsedDec : null;
  const diffPp = imp !== null ? (p - imp) * 100 : null;

  return (
    <div className="panel compare" id="compare">
      <label htmlFor="odds-in">
        Compara con tu cuota · <span className="secondary">{label}</span>
      </label>
      <div className="row">
        <input
          id="odds-in"
          inputMode="decimal"
          placeholder="2.10 o +110"
          value={oddsInput}
          aria-describedby="odds-help"
          onChange={(e) => setOddsInput(e.target.value)}
        />
        <span id="odds-help" className="caption muted">
          Decimal o americana. No se guarda.
        </span>
      </div>
      <div className="out" aria-live="polite">
        <div>
          <span className="caption muted">Modelo</span>
          <b>{formatPercent(p, 1)}</b>
        </div>
        <div>
          <span className="caption muted">Tu cuota implica</span>
          <b>{imp !== null ? formatPercent(imp, 1) : "—"}</b>
        </div>
        <div>
          <span className="caption muted">Diferencia</span>
          <b>
            {diffPp !== null
              ? `${diffPp >= 0 ? "+" : ""}${diffPp.toFixed(1)} pp`
              : "—"}
          </b>
        </div>
      </div>
    </div>
  );
}

export function CalcTrace({
  trace,
  steps,
}: {
  trace?: readonly CalcStep[];
  steps?: readonly string[];
}): React.JSX.Element {
  const items =
    steps ?? (trace ? trace.map((t) => `${t.step}: ${t.value}`) : []);
  return (
    <ol className="steps">
      {items.map((s, idx) => (
        <li key={`${idx}-${s}`} className="done">
          <span className="st">
            <Icon name="check" />
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

export function FactorsList({
  factors,
}: {
  factors: readonly FactorItem[];
}): React.JSX.Element {
  return (
    <div className="factors">
      <p className="eyebrow">Factores del modelo</p>
      <dl>
        {factors.map((f, idx) => (
          <React.Fragment key={`${f.label}-${idx}`}>
            <dt>{f.label}</dt>
            <dd>
              {f.value ?? f.impact}
              {f.sub ?? f.detail ? <small>{f.sub ?? f.detail}</small> : null}
            </dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}

/** Tabla de posiciones calculada en el snapshot (solo partidos ya jugados). */
export function StandingsTable({
  rows,
  league,
  limit,
}: {
  rows: readonly StandingRow[];
  league: LeagueId | string;
  limit?: number;
}): React.JSX.Element | null {
  if (rows.length === 0) return null;
  const visible = typeof limit === "number" ? rows.slice(0, limit) : rows;

  return (
    <section className="standings-block" aria-labelledby="standings-title">
      <h2 id="standings-title" className="h3">
        Tabla de posiciones
      </h2>
      <table className="mtable standings">
        <thead>
          <tr>
            <th scope="col" className="r">
              #
            </th>
            <th scope="col">Equipo</th>
            <th scope="col" className="r">
              PJ
            </th>
            <th scope="col" className="r optional">
              G
            </th>
            <th scope="col" className="r optional">
              E
            </th>
            <th scope="col" className="r optional">
              P
            </th>
            <th scope="col" className="r optional">
              GF
            </th>
            <th scope="col" className="r optional">
              GC
            </th>
            <th scope="col" className="r optional">
              DG
            </th>
            <th scope="col" className="r">
              Pts
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row, index) => (
            <tr key={row.teamId}>
              <td className="r">{index + 1}</td>
              <td>
                <span className="team-cell">
                  <TeamBadge
                    league={league}
                    slug={row.teamId.split(".")[1] ?? row.code.toLowerCase()}
                    name={row.name}
                    size={20}
                  />
                  <span>{row.shortName}</span>
                </span>
              </td>
              <td className="r">{row.played}</td>
              <td className="r optional">{row.won}</td>
              <td className="r optional">{row.drawn}</td>
              <td className="r optional">{row.lost}</td>
              <td className="r optional">{row.goalsFor}</td>
              <td className="r optional">{row.goalsAgainst}</td>
              <td className="r optional">{row.goalsFor - row.goalsAgainst}</td>
              <td className="r">
                <strong>{row.points}</strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}