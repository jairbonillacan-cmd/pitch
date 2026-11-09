"use client";

import React, { useState } from "react";
import type {
  AnalysisMarketGroup,
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
        <span>{match.venue}</span>
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

      <span className="foot">
        <span>
          {draw ? (
            <>
              <span className={dL ? "lead-txt" : ""}>Empate {formatPercent(pd, 1)}</span>
              {" · "}
            </>
          ) : null}
          Proy. {proj.home.toFixed(nf ? 0 : 1)}–{proj.away.toFixed(nf ? 0 : 1)}
        </span>
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
