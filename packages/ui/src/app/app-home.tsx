"use client";

import React, { useState } from "react";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Chip } from "@heroui/react";
import { formatDecimal, formatPercent } from "@pitchlab/contracts";
import { Icon } from "../icons.js";
import { Mascot } from "../primitives.js";
import { Freshness, LeagueBadge, PBar, StandingsTable, TeamBadge } from "../sports.js";
import { HomeShell, HOME_LEGAL } from "./home-shell.js";
import type { AppHomeData, HomeMatch, HomeMatchPreview } from "./data.js";

const updateTime = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const updateDate = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function RankedMatches({ ranked }: { ranked: HomeMatch[] }) {
  return (
    <section className="ph-ranked" aria-labelledby="ph-ranked-title">
      <div className="ph-ranked-intro">
        <Mascot edition="radar" size={124} className="ph-radar" />
        <div>
          <h2 id="ph-ranked-title">Lo más probable en tus ligas</h2>
          <p className="ph-ranked-description">
            Radar ordenó los próximos partidos por la probabilidad que estima el modelo.
            Compara la cuota justa con la que ves en tu casa antes de decidir.
          </p>
          <p className="ph-model-note">Modelo PitchLab · en validación</p>
        </div>
      </div>
      <div className="ph-ranking">
        {ranked.length ? (
          <>
            <div className="ph-rank-grid ph-rank-columns" aria-hidden="true">
              <span>Resultado más probable</span>
              <span>Probabilidad</span>
              <span>Cuota justa</span>
            </div>
            <ol>
              {ranked.map((match, index) => {
                const team = match.outcome.team;
                const opponent = team?.slug === match.home.slug ? match.away.shortName : match.home.shortName;
                return <li key={match.id}>
                  <a href={match.href} className="ph-rank-grid ph-rank-row">
                    <span className="ph-rank-number num" aria-hidden="true">{index + 1}</span>
                    {match.outcome.team ? (
                      <TeamBadge league={match.league} size={28} {...match.outcome.team} />
                    ) : <LeagueBadge league={match.league} size={28} />}
                    <span className="ph-stack">
                      <strong>
                        <span className="ph-wide">{match.outcome.label}</span>
                        <span className="ph-phone">{team ? `Victoria de ${team.shortName}` : match.outcome.label}</span>
                      </strong>
                      <small className="ph-wide">{match.matchup} · {match.date} · {match.leagueLabel}</small>
                      <small className="ph-phone">
                        {team ? `vs ${opponent}` : `${match.home.shortName} vs ${match.away.shortName}`} · {match.date}
                      </small>
                    </span>
                    <div className="ph-rank-values">
                      <div className="ph-rank-prob num">
                        {formatPercent(match.outcome.p)}
                        <div className="ph-prob-bar" aria-hidden="true">
                          <PBar p={match.outcome.p} lead />
                        </div>
                      </div>
                      <span className="ph-rank-fair num">
                        <span className="ph-fair-label">Cuota justa </span>
                        {formatDecimal(match.outcome.fairOdds)}
                      </span>
                    </div>
                  </a>
                </li>;
              })}
            </ol>
            <a className="ph-text-link ph-rank-link" href="#proximos">Ver próximos partidos <Icon name="arrow" /></a>
          </>
        ) : <p className="ph-empty">Aún no hay probabilidades publicadas para próximos partidos.</p>}
      </div>
    </section>
  );
}

function Tonight({ match }: { match: AppHomeData["tonight"] }) {
  const close = match?.outcome && match.runnerUp && match.outcome.p - match.runnerUp.p < 0.03;
  return (
    <section className="ph-panel ph-tonight" aria-labelledby="ph-tonight-title">
      <h2 id="ph-tonight-title" className="ph-kicker">
        {match && <LeagueBadge league={match.league} size={18} />}
        Esta noche
        {match && <span className="num"> · {match.leagueLabel} · {match.round} · {match.time}</span>}
      </h2>
      {match ? (
        <>
          <div className="ph-tonight-match">
            <div className="ph-stack">
              <div className="ph-matchup">
                <TeamBadge league={match.league} size={26} {...match.home} />
                <TeamBadge league={match.league} size={26} {...match.away} />
                <strong>{match.matchup}</strong>
              </div>
              {match.outcome ? (
                <div className="ph-tonight-result">
                  <span>Lo más probable · {match.outcome.label}</span>
                  <strong className="ph-accent num">{formatPercent(match.outcome.p)}</strong>
                  <span>Cuota justa <b className="num">{formatDecimal(match.outcome.fairOdds)}</b></span>
                </div>
              ) : <p className="ph-muted">Probabilidades pendientes de publicación.</p>}
            </div>
            <Mascot className="ph-tonight-mascot" edition={match.sport === "football" ? "soccer" : "nfl"} size={132} />
          </div>
          {close && match.runnerUp && (
            <p className="ph-close-game">
              <Icon name="info" />
              <span>Casi parejo · {match.runnerUp.label} <b className="num">{formatPercent(match.runnerUp.p)}</b>.
                Con tan poca diferencia, la cuota decide.</span>
            </p>
          )}
          <a href={match.href} className="button button--primary button--md ph-game-cta">
            Abrir Game Center <Icon name="arrow" />
          </a>
        </>
      ) : <p className="ph-muted">Ya no hay partidos programados para lo que queda de hoy.</p>}
    </section>
  );
}

function Upcoming({ matches }: { matches: HomeMatchPreview[] }) {
  const [sport, setSport] = useState("all");
  const visible = matches.filter((match) => sport === "all" || match.sport === sport).slice(0, 6);
  return (
    <section id="proximos" className="ph-panel ph-upcoming" aria-labelledby="ph-upcoming-title" tabIndex={-1}>
      <div className="ph-panel-heading">
        <h2 id="ph-upcoming-title">Próximos en tus ligas</h2>
        <SegmentedControl label="Deporte" size="lg" value={sport} onChange={setSport}>
          <SegmentedControlItem value="all" label="Todos" />
          <SegmentedControlItem value="football" label="Fútbol" />
          <SegmentedControlItem value="american-football" label="NFL" />
        </SegmentedControl>
      </div>
      {visible.length ? (
        <table aria-labelledby="ph-upcoming-title">
          <thead>
            <tr><th scope="col">Fecha</th><th scope="col">Partido</th><th scope="col">Lo más probable</th><th scope="col">Justa</th></tr>
          </thead>
          <tbody>
            {visible.map((match) => (
              <tr key={match.id}>
                <td><span className="ph-stack num">{match.date}<small>{match.time}</small></span></td>
                <td>
                  <a className="ph-stack ph-match-link" href={match.href}>
                    <strong>{match.matchup}</strong>
                    <small>{match.leagueLabel}</small>
                  </a>
                </td>
                <td>{match.outcome ? (
                  <span className="ph-stack">
                    <strong className="ph-accent num">{formatPercent(match.outcome.p)}</strong>
                    <small>{match.outcome.label}</small>
                  </span>
                ) : <small>Pendiente</small>}</td>
                <td className="num"><b>{match.outcome ? formatDecimal(match.outcome.fairOdds) : "—"}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="ph-empty" role="status">Sin próximos partidos para este filtro.</p>}
    </section>
  );
}

const samplePicks = [
  { selection: "Victoria de Buffalo", matchup: "Buffalo vs Minnesota", odds: 1.87, p: 0.498 },
  { selection: "Victoria de Real Madrid", matchup: "Real Madrid vs Celta", odds: 1.36, p: 0.752 },
  { selection: "Victoria de Bayern", matchup: "Bayern vs Köln", odds: 1.14, p: 0.887 },
];

const sampleMoves = [
  { selection: "Victoria de Buffalo", from: 1.95, to: 1.87, fair: 2.01, age: "hace 2 h" },
  { selection: "Victoria de Bayern", from: 1.14, to: 1.12, fair: 1.13, age: "hace 5 h" },
];

function OpenPicks() {
  return (
    <section id="mis-picks" className="ph-panel ph-picks" aria-labelledby="ph-picks-title" tabIndex={-1}>
      <div className="ph-panel-heading">
        <h2 id="ph-picks-title">Mis picks abiertos</h2><Chip size="sm" variant="soft">Ejemplo</Chip>
      </div>
      <ul className="ph-side-list">
        {samplePicks.map((pick) => (
          <li key={pick.selection}>
            <span className="ph-stack"><strong>{pick.selection} · <span className="num">{formatDecimal(pick.odds)}</span></strong><small>{pick.matchup}</small></span>
            <span className="ph-stack ph-end num"><span>Modelo {formatPercent(pick.p)}</span><small>Abierto</small></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function OddsMoves() {
  return (
    <section id="movimientos" className="ph-panel ph-moves" aria-labelledby="ph-moves-title" tabIndex={-1}>
      <div className="ph-panel-heading">
        <h2 id="ph-moves-title">Movimientos de cuota</h2><Chip size="sm" variant="soft">Ejemplo</Chip>
      </div>
      <ul className="ph-side-list">
        {sampleMoves.map((move) => (
          <li key={move.selection}>
            <span className="ph-stack"><strong>{move.selection}</strong><small>Cuota justa <span className="num">{formatDecimal(move.fair)}</span></small></span>
            <span className="ph-stack ph-end num"><strong>{formatDecimal(move.from)} → {formatDecimal(move.to)}</strong><small>{move.age}</small></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AppHome({ data }: { data: AppHomeData }) {
  return (
    <HomeShell leagues={data.leagues} searchMatches={data.searchMatches}>
      <div className="ph-content">
        <div className="ph-day">
          <Mascot size={60} className="ph-day-radar ph-radar" />
          <div>
            <p className="ph-eyebrow">{data.dayLabel}</p>
            <h1><span className="ph-wide">Hoy</span><span className="ph-phone">Lo más probable hoy</span></h1>
          </div>
          {data.asOf ? (
            <Freshness
              generatedAt={data.asOf}
              stale={data.isStale}
              label={data.isStale
                ? `Último corte · ${updateDate.format(new Date(data.asOf))} · ${updateTime.format(new Date(data.asOf))}`
                : `Datos actualizados ${updateTime.format(new Date(data.asOf))}`}
            />
          ) : <p className="ph-muted">Sin datos publicados</p>}
        </div>
        {data.hasErrors && (
          <div className="ph-data-error" role="status">
            <span>Algunos datos no se pudieron cargar.</span>
            <button type="button" className="ph-text-link" onClick={() => window.location.reload()}>Reintentar</button>
          </div>
        )}
        <RankedMatches ranked={data.ranked} />
        <div className="ph-dashboard-grid">
          <div className="ph-dashboard-main">
            <Tonight match={data.tonight} />
            <Upcoming matches={data.upcoming} />
          </div>
          <div className="ph-dashboard-side">
            <OpenPicks />
            <OddsMoves />
            <div className="ph-panel ph-standings">
              {data.standings.length ? (
                <>
                  <StandingsTable league="liga-mx" rows={data.standings} limit={3} title="Liga MX · tabla" />
                  <a className="ph-text-link ph-rank-link" href="/app/liga-mx">Ver Liga MX <Icon name="arrow" /></a>
                </>
              ) : <><h2>Liga MX · tabla</h2><p className="ph-muted">Tabla pendiente de publicación.</p></>}
            </div>
          </div>
        </div>
        <footer className="ph-legal">
          <p className="ph-phone ph-mobile-model">Modelo PitchLab · en validación</p>
          <p>{HOME_LEGAL}</p>
        </footer>
      </div>
    </HomeShell>
  );
}
