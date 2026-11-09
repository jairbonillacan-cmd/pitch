"use client";

import React, { useMemo, useState } from "react";
import { Input, Label, TextField } from "@heroui/react";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { formatDecimal, formatPercent } from "@pitchlab/contracts";
import { AstryxScope } from "../astryx.js";
import { BrandLogo, Mascot } from "../primitives.js";
import { Icon } from "../icons.js";
import { LeagueBadge, ProbSplit, TeamBadge } from "../sports.js";
import { leadIndex } from "../sports.js";
import type { LvLeague, LvMatch, LvOutcome } from "./data.js";
import { PublicNav } from "./public-nav.js";

/* ==========================================================================
   Landing «Pregunta un partido» (app definitiva)
   Tesis: el producto se demuestra funcionando. El visitante elige un partido real
   de la jornada y el análisis sube como una hoja; el resto de la página explica
   lo que acaba de ver, demuestra que el historial no se edita y cierra con planes.
   ========================================================================== */

export interface LandingPlan {
  id: "free" | "pro" | "elite";
  name: string;
  /** Precio mensual en MXN con IVA. 0 = gratis. */
  price: number;
  blurb: string;
  features: string[];
}

export interface LandingV2Props {
  leagues: LvLeague[];
  /** Ligas del catálogo con su estado, para la sección de cobertura. */
  coverage: { slug: string; label: string; soon?: boolean }[];
  plans: LandingPlan[];
  signupHref?: string;
  loginHref?: string;
}

const TZ = "America/Mexico_City";

/** Nombres cortos para el selector: caben cuatro ligas en 343 px sin truncar. */
const SHORT_LEAGUE: Record<string, string> = {
  "premier-league": "Premier",
  "serie-a": "Serie A",
  "ligue-1": "Ligue 1",
};

function kickoffLabel(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: TZ,
  })
    .format(d)
    .replace(/\./g, "");
  const time = new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: TZ,
  }).format(d);
  return `${day} · ${time}`;
}

function parseOdds(raw: string): number | null {
  const n = Number(raw.replace(",", ".").trim());
  return Number.isFinite(n) && n > 1 ? n : null;
}

/* ---------------------------------------------------------------- Hoja de análisis */

function Teams({ m }: { m: LvMatch }) {
  return (
    <div className="lv-teams">
      <div className="lv-team">
        <TeamBadge league={m.league} slug={m.home.slug} name={m.home.name} size={44} />
        <span className="lv-team-name">{m.home.short}</span>
      </div>
      <div className="lv-meta">
        <span className="num">{kickoffLabel(m.kickoff)}</span>
        <span>{m.round}</span>
      </div>
      <div className="lv-team lv-team-away">
        <span className="lv-team-name">{m.away.short}</span>
        <TeamBadge league={m.league} slug={m.away.slug} name={m.away.name} size={44} />
      </div>
    </div>
  );
}

function YourOdds({ outcome }: { outcome: LvOutcome }) {
  const [raw, setRaw] = useState("");
  const odds = parseOdds(raw);
  const implied = odds ? 1 / odds : null;
  const diff = implied !== null ? (outcome.p - implied) * 100 : null;

  return (
    <div className="lv-yours">
      <TextField value={raw} onChange={setRaw} className="lv-yours-field">
        <Label>Tu cuota · {outcome.label}</Label>
        <Input placeholder={formatDecimal(outcome.fairOdds)} inputMode="decimal" />
      </TextField>
      <p className="lv-yours-read" aria-live="polite">
        {implied === null || diff === null ? (
          <>
            Escribe la cuota que ves. La comparamos con la probabilidad del modelo{" "}
            <span className="num">({formatPercent(outcome.p, 1)})</span>.
          </>
        ) : (
          <>
            Tu cuota implica <span className="num">{formatPercent(implied, 1)}</span>. El modelo
            estima <span className="num">{formatPercent(outcome.p, 1)}</span>:{" "}
            <strong className="num">
              {diff >= 0 ? "+" : "−"}
              {Math.abs(diff).toFixed(1)} pts
            </strong>{" "}
            {diff >= 0 ? "a favor de tu cuota." : "en contra de tu cuota."}
          </>
        )}
      </p>
    </div>
  );
}

function AnalysisSheet({ m, signupHref }: { m: LvMatch; signupHref: string }) {
  const ps = m.outcomes.map((o) => o.p);
  const lead = leadIndex(ps);
  const [picked, setPicked] = useState<number | null>(null);
  const sel = picked !== null && picked < m.outcomes.length ? picked : lead;
  const focus = m.outcomes[sel] ?? m.outcomes[0];
  if (!focus) return null;

  return (
    <article className="lv-sheet" aria-label={`Análisis de ${m.home.name} contra ${m.away.name}`}>
      <span className="lv-grabber" aria-hidden="true" />
      <div className="lv-rise" key={m.id}>
        <Teams m={m} />
      </div>

      <div className="lv-sheet-grid">
        <section className="lv-prob" aria-label="Probabilidades">
          <p className="lv-kicker">{focus.label}</p>
          <p className="lv-big num">{formatPercent(focus.p, 1)}</p>
          <p className="lv-fair">
            Cuota justa <span className="num">{formatDecimal(focus.fairOdds)}</span>
          </p>

          {/* La barra no se remonta: al cambiar de partido sus segmentos se mueven. */}
          <ProbSplit probabilities={ps} labels={m.outcomes.map((o) => o.label)} />
          <div className="lv-legend" role="radiogroup" aria-label="Resultado a revisar">
            {m.outcomes.map((o, i) => (
              <button
                key={o.short}
                type="button"
                role="radio"
                aria-checked={i === sel}
                className={i === lead ? "is-lead" : undefined}
                onClick={() => setPicked(i)}
              >
                <span className="lv-legend-k">{o.short}</span>
                <span className="lv-legend-v num">{formatPercent(o.p, 1)}</span>
              </button>
            ))}
          </div>

          <dl className="lv-extras">
            {m.extras.map((e) => (
              <div key={e.label}>
                <dt>{e.label}</dt>
                <dd className="num">{formatPercent(e.p, 1)}</dd>
              </div>
            ))}
            {m.likelyScore ? (
              <div>
                <dt>Marcador más probable</dt>
                <dd className="num">{m.likelyScore}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="lv-side" aria-label="Tu cuota y factores">
          <YourOdds key={`${m.id}-${sel}`} outcome={focus} />
          <div className="lv-factors">
            <p className="lv-kicker">Por qué</p>
            <dl>
              {m.factors.map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>
                    <span className="num">{f.value}</span>
                    {f.detail ? <small>{f.detail}</small> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </div>

      <footer className="lv-sheet-foot">
        <p className="lv-stamp">
          <Icon name="model" />
          <span>
            {m.modelLabel} · publicado{" "}
            <span className="num">{kickoffLabel(m.publishedAt)}</span>
          </span>
        </p>
        <a href={signupHref} className="button button--primary button--md">
          Ver todos los mercados
          <Icon name="arrow" />
        </a>
      </footer>
    </article>
  );
}

/* ---------------------------------------------------------------- Hero */

function Hero({ leagues, signupHref }: { leagues: LvLeague[]; signupHref: string }) {
  const playable = leagues.filter((l) => l.upcoming.length > 0);
  const [leagueSlug, setLeagueSlug] = useState(playable[0]?.slug ?? "");
  const league = playable.find((l) => l.slug === leagueSlug) ?? playable[0];
  const [matchId, setMatchId] = useState<string | null>(null);
  const match =
    league?.upcoming.find((m) => m.id === matchId) ?? league?.upcoming[0] ?? null;

  return (
    <section className="lv-hero" aria-labelledby="lv-title">
      <div className="lv-hero-ground fieldgrid" aria-hidden="true" />
      <div className="lv-hero-copy">
        <p className="lv-eyebrow">
          {league ? `${league.round} · ${league.label}` : "Jornada en curso"}
        </p>
        <h1 id="lv-title">Lee el juego con datos.</h1>
        <p className="lv-lede">
          Elige un partido. Te mostramos qué tan probable es cada resultado, cuánto
          debería pagar y por qué.
        </p>
      </div>

      {league ? (
        <div className="lv-ask">
          {/* Deslizable: con siete ligas no caben en 375 px y Astryx truncaría los nombres. */}
          <div className="lv-seg">
            <div className="lv-seg-in">
              <AstryxScope>
                <SegmentedControl
                  label="Liga"
                  value={league.slug}
                  onChange={(v) => {
                    setLeagueSlug(v);
                    setMatchId(null);
                  }}
                >
                  {playable.map((l) => (
                    <SegmentedControlItem
                      key={l.slug}
                      value={l.slug}
                      label={SHORT_LEAGUE[l.slug] ?? l.label}
                    />
                  ))}
                </SegmentedControl>
              </AstryxScope>
            </div>
          </div>

          <div className="lv-rail" role="listbox" aria-label={`Partidos de ${league.label}`}>
            {league.upcoming.map((m) => {
              const on = m.id === match?.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  className="lv-chip"
                  onClick={() => setMatchId(m.id)}
                >
                  <TeamBadge league={m.league} slug={m.home.slug} name={m.home.name} size={22} />
                  <span className="lv-chip-codes">
                    {m.home.code}
                    <span className="lv-vs">vs</span>
                    {m.away.code}
                  </span>
                  <TeamBadge league={m.league} slug={m.away.slug} name={m.away.name} size={22} />
                  <span className="lv-chip-time num">{kickoffLabel(m.kickoff).split(" · ")[1]}</span>
                </button>
              );
            })}
          </div>

          {match ? <AnalysisSheet m={match} signupHref={signupHref} /> : null}
        </div>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------- Cómo se lee */

function HowToRead({ m }: { m: LvMatch }) {
  const ps = m.outcomes.map((o) => o.p);
  const lead = m.outcomes[leadIndex(ps)];
  const rows = [
    {
      n: "01",
      q: "¿Quién llega como favorito?",
      a: "La probabilidad de cada resultado, estimada con el historial de los dos equipos y ajustada por la calidad de cada rival.",
      demo: (
        <div className="lv-demo">
          <ProbSplit probabilities={ps} labels={m.outcomes.map((o) => o.label)} />
          <div className="lv-demo-row">
            {m.outcomes.map((o) => (
              <span key={o.short} className={o === lead ? "is-lead" : undefined}>
                <small>{o.short}</small>
                <b className="num">{formatPercent(o.p, 1)}</b>
              </span>
            ))}
          </div>
        </div>
      ),
    },
    {
      n: "02",
      q: "¿Paga lo que debería?",
      a: "La cuota justa es lo que pagaría ese resultado sin margen de la casa. Pon la tuya al lado y ves la diferencia en puntos.",
      demo: lead ? (
        <div className="lv-demo lv-demo-odds">
          <div>
            <small>Cuota justa · {lead.label}</small>
            <b className="num">{formatDecimal(lead.fairOdds)}</b>
          </div>
          <div>
            <small>Probabilidad</small>
            <b className="num">{formatPercent(lead.p, 1)}</b>
          </div>
        </div>
      ) : null,
    },
    {
      n: "03",
      q: "¿Por qué?",
      a: "Cada cifra trae su método: ataque, defensa, localía y cuántos partidos hay detrás. Sin cajas negras.",
      demo: (
        <dl className="lv-demo lv-demo-factors">
          {m.factors.slice(0, 2).map((f) => (
            <div key={f.label}>
              <dt>{f.label}</dt>
              <dd className="num">{f.value}</dd>
            </div>
          ))}
        </dl>
      ),
    },
  ];

  return (
    <section className="lv-section" id="como-se-lee" aria-labelledby="lv-read-title">
      <header className="lv-head">
        <p className="lv-eyebrow">Cómo se lee</p>
        <h2 id="lv-read-title">Tres preguntas, una pantalla.</h2>
        <p>Lo que acabas de ver arriba, pieza por pieza.</p>
      </header>
      <ol className="lv-read">
        {rows.map((r) => (
          <li key={r.n}>
            <div className="lv-read-text">
              <span className="lv-read-n num">{r.n}</span>
              <h3>{r.q}</h3>
              <p>{r.a}</p>
            </div>
            {r.demo}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------------------------------------------------------------- Historial */

function Ledger({ finals }: { finals: LvMatch[] }) {
  if (finals.length === 0) return null;
  return (
    <section className="lv-section" id="historial" aria-labelledby="lv-ledger-title">
      <header className="lv-head">
        <p className="lv-eyebrow">Historial íntegro</p>
        <h2 id="lv-ledger-title">Lo que publicamos antes del partido no se edita.</h2>
        <p>La jornada pasada, tal como salió: la probabilidad publicada y el marcador final.</p>
      </header>
      <div className="lv-ledger" role="table" aria-label="Partidos de la jornada pasada">
        <div className="lv-ledger-row lv-ledger-head" role="row">
          <span role="columnheader">Partido</span>
          <span role="columnheader">Publicado antes del inicio</span>
          <span role="columnheader">Final</span>
        </div>
        {finals.slice(0, 5).map((m) => {
          const ps = m.outcomes.map((o) => o.p);
          const fav = m.outcomes[leadIndex(ps)];
          return (
            <div className="lv-ledger-row" role="row" key={m.id}>
              <span role="cell" className="lv-ledger-match">
                <TeamBadge league={m.league} slug={m.home.slug} name={m.home.name} size={22} />
                <span>
                  {m.home.short} <span className="lv-vs">vs</span> {m.away.short}
                </span>
                <TeamBadge league={m.league} slug={m.away.slug} name={m.away.name} size={22} />
              </span>
              <span role="cell" className="lv-ledger-pub">
                {fav ? (
                  <>
                    {fav.label} <b className="num">{formatPercent(fav.p, 1)}</b>
                    <small className="num">{kickoffLabel(m.publishedAt)}</small>
                  </>
                ) : null}
              </span>
              <span role="cell" className="lv-ledger-score num">
                {m.result ? `${m.result.home}–${m.result.away}` : "—"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Ligas */

function Coverage({ coverage }: { coverage: LandingV2Props["coverage"] }) {
  return (
    <section className="lv-section" id="ligas" aria-labelledby="lv-leagues-title">
      <header className="lv-head">
        <p className="lv-eyebrow">México primero</p>
        <h2 id="lv-leagues-title">Las ligas que sigues, con su emblema.</h2>
        <p>Calendario, resultados y análisis que se actualizan solos cada jornada.</p>
      </header>
      <ul className="lv-leagues">
        {coverage.map((l) => (
          <li key={l.slug} className={l.soon ? "is-soon" : undefined}>
            <LeagueBadge league={l.slug} label={l.label} size={40} />
            <span>{l.label}</span>
            {l.soon ? <small>Pronto</small> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- Planes */

function Plans({ plans, signupHref }: { plans: LandingPlan[]; signupHref: string }) {
  return (
    <section className="lv-section" id="planes" aria-labelledby="lv-plans-title">
      <header className="lv-head">
        <p className="lv-eyebrow">Planes</p>
        <h2 id="lv-plans-title">Empieza gratis. Prueba Pro 7 días.</h2>
        <p>Precios en pesos mexicanos, IVA incluido.</p>
      </header>
      <div className="lv-plans">
        {plans.map((p) => {
          const featured = p.id === "pro";
          return (
            <article key={p.id} className={`lv-plan${featured ? " is-featured" : ""}`}>
              <header>
                <h3>{p.name}</h3>
                <p>{p.blurb}</p>
              </header>
              <p className="lv-price">
                {p.price === 0 ? (
                  <span className="lv-price-n num">Gratis</span>
                ) : (
                  <>
                    <span className="lv-price-n num">
                      <span className="lv-price-sign">$</span>
                      {p.price}
                    </span>
                    <span className="lv-price-u">MXN al mes</span>
                  </>
                )}
              </p>
              <ul>
                {p.features.map((f) => (
                  <li key={f}>
                    <Icon name="check" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={`${signupHref}?plan=${p.id}`}
                className={`button ${featured ? "button--primary" : "button--secondary"} button--md`}
              >
                {p.price === 0 ? "Crear cuenta" : featured ? "Probar 7 días" : `Elegir ${p.name}`}
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Cierre */

function Close({ signupHref }: { signupHref: string }) {
  return (
    <section className="lv-close" aria-labelledby="lv-close-title">
      <Mascot edition="radar" size={112} className="lv-close-radar" />
      <div>
        <h2 id="lv-close-title">Información para decidir.</h2>
        <p>
          No somos casa de apuestas: no recibimos dinero ni damos montos. Publicamos
          probabilidades con su método y su hora. Solo mayores de 18.
        </p>
      </div>
      <a href={signupHref} className="button button--primary button--lg">
        Prueba 7 días
      </a>
    </section>
  );
}

function Footer() {
  return (
    <footer className="lv-foot">
      <BrandLogo variant="horizontal" width={112} />
      <nav aria-label="Legal">
        <a href="/legal/privacidad">Privacidad</a>
        <a href="/legal/terminos">Términos</a>
        <a href="/legal/juego-responsable">Juego responsable</a>
        <a href="/legal/creditos">Créditos</a>
      </nav>
    </footer>
  );
}

/* ---------------------------------------------------------------- Página */

export function LandingV2({
  leagues,
  coverage,
  plans,
  signupHref = "/signup",
  loginHref = "/login",
}: LandingV2Props): React.JSX.Element {
  const sample = useMemo(
    () => leagues.find((l) => l.upcoming.length > 0)?.upcoming[0] ?? null,
    [leagues],
  );
  const finals = useMemo(
    () => leagues.find((l) => l.finals.length >= 3)?.finals ?? [],
    [leagues],
  );

  return (
    <div className="lv">
      <PublicNav signupHref={signupHref} loginHref={loginHref} />
      <main>
        <Hero leagues={leagues} signupHref={signupHref} />
        {sample ? <HowToRead m={sample} /> : null}
        <Ledger finals={finals} />
        <Coverage coverage={coverage} />
        <Plans plans={plans} signupHref={signupHref} />
        <Close signupHref={signupHref} />
      </main>
      <Footer />
    </div>
  );
}
