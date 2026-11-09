"use client";

import React from "react";
import { formatDecimal, formatPercent } from "@pitchlab/contracts";
import type { HomeMatch } from "../app/data.js";
import type { LvMatch } from "../landing/data.js";
import { Mascot } from "../primitives.js";
import { leadIndex, LeagueBadge, ProbSplit, TeamBadge } from "../sports.js";

export function LoginForecast({ ranked }: { ranked: readonly HomeMatch[] }) {
  return (
    <aside className="pl-auth-visual pl-auth-ranking fieldgrid" aria-label="Muestra de PitchLab">
      <div className="pl-auth-visual-inner">
        <div className="pl-auth-visual-intro">
          <Mascot size={112} />
          <div>
            <p className="pl-account-eyebrow">Lee el juego con datos.</p>
            <h2>Lo más probable, con su cuota justa.</h2>
          </div>
        </div>
        {ranked.length ? (
          <ol className="pl-auth-forecast-list" role="list">
            {ranked.slice(0, 3).map(({ id, league, leagueLabel, matchup, outcome }) => (
              <li key={id}>
                {outcome.team
                  ? <TeamBadge league={league} size={28} {...outcome.team} />
                  : <LeagueBadge league={league} size={28} />}
                <div><strong>{outcome.label}</strong><small>{matchup} · {leagueLabel}</small></div>
                <div className="pl-auth-forecast-number">
                  <strong className="num">{formatPercent(outcome.p)}</strong>
                  <small className="num">Justa {formatDecimal(outcome.fairOdds)}</small>
                </div>
              </li>
            ))}
          </ol>
        ) : <p>Pronto podrás consultar las próximas probabilidades publicadas.</p>}
        <p className="pl-auth-model">Modelo PitchLab · en validación</p>
      </div>
    </aside>
  );
}

const exampleOdds = 2.1;
const pointFormat = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

export function SignupForecast({ match }: { match?: LvMatch }) {
  const probabilities = match?.outcomes.map(({ p }) => p) ?? [];
  const lead = match?.outcomes[leadIndex(probabilities)];
  const team = lead?.short === "Local" ? match?.home : lead?.short === "Visita" ? match?.away : undefined;
  return (
    <aside className="pl-auth-visual pl-auth-match fieldgrid" aria-label="Muestra de PitchLab">
      <div className="pl-auth-visual-inner">
        <p className="pl-account-eyebrow">Lee el juego con datos.</p>
        <h2>Así se ve un partido en PitchLab.</h2>
        {match && lead ? (
          <div className="pl-auth-match-card">
            <p className="pl-account-eyebrow">{match.leagueLabel}</p>
            <p className="pl-auth-match-teams">
              <TeamBadge league={match.league} size={28} slug={match.home.slug} name={match.home.name} />
              {match.home.short} vs {match.away.short}
              <TeamBadge league={match.league} size={28} slug={match.away.slug} name={match.away.name} />
            </p>
            <p>Lo más probable · {team ? `Victoria de ${team.name}` : lead.label}</p>
            <div className="pl-auth-match-figure">
              <strong className="num">{formatPercent(lead.p)}</strong>
              <span>Cuota justa <b className="num">{formatDecimal(lead.fairOdds)}</b></span>
            </div>
            <ProbSplit probabilities={probabilities} labels={match.outcomes.map(({ short }) => short)} />
            <ul className="pl-auth-match-legend" role="list">
              {match.outcomes.map(({ short, p }) => <li key={short}>{short} <b className="num">{formatPercent(p)}</b></li>)}
            </ul>
            <div className="pl-auth-your-odds">
              <strong>Tu cuota · Ejemplo <span className="num">{formatDecimal(exampleOdds)}</span></strong>
              <span>Implica <b className="num">{formatPercent(1 / exampleOdds)}</b> · Modelo <b className="num">{pointFormat.format((lead.p - 1 / exampleOdds) * 100)} pts</b></span>
            </div>
          </div>
        ) : <p>Pronto podrás comparar probabilidades y cuotas justas de un partido.</p>}
        <div className="pl-auth-model-note">
          <Mascot edition="soccer" size={76} />
          <p>Probabilidad y cuota justa del Modelo PitchLab · en validación. Tú decides con tu propia cuota.</p>
        </div>
      </div>
    </aside>
  );
}
