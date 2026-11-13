"use client";

import React, { useMemo, useState } from "react";
import { LeagueBadge, parseUserOdds } from "../../sports";
import { decimalToAmericanInt, formatOddsValue, isPickUnlocked } from "../access-guard";
import { MaestroIcon } from "../components/MaestroPrimitives";
import { AtmosphereStage, ClubWorkspaceShell } from "../components/ShellChrome";
import { usePlatform } from "../platform-provider";

const signedAmerican = (dec: number) => {
  const a = decimalToAmericanInt(dec);
  return a > 0 ? `+${a}` : `−${Math.abs(a)}`;
};

/** Ventaja en puntos de probabilidad: lo que dice el modelo menos lo que implica tu momio. */
export function edgeAgainstBook(p: number, bookDecimal: number): number {
  return Math.round((p - 1 / bookDecimal) * 1000) / 10;
}

function Converter(): React.JSX.Element {
  const [raw, setRaw] = useState("");
  const dec = raw.trim() ? parseUserOdds(raw) : null;
  return (
    <section className="pl-odds-conv glass-card glass-ring" aria-labelledby="conv-title">
      <h2 id="conv-title" className="m-0 text-base font-extrabold">
        Convertidor
      </h2>
      <label className="pl-finder-select">
        <span>Escribe un momio</span>
        <input
          className="glass-input num"
          inputMode="decimal"
          placeholder="−110, +150 o 1.91"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
      </label>
      <dl className="pl-odds-conv-out num" aria-live="polite">
        <div>
          <dt>Americano</dt>
          <dd>{dec ? signedAmerican(dec) : "—"}</dd>
        </div>
        <div>
          <dt>Decimal</dt>
          <dd>{dec ? dec.toFixed(2) : "—"}</dd>
        </div>
        <div>
          <dt>Probabilidad implícita</dt>
          <dd>{dec ? `${((1 / dec) * 100).toFixed(1)} %` : "—"}</dd>
        </div>
      </dl>
      {raw.trim() && !dec ? (
        <p className="m-0 text-xs" role="alert" style={{ color: "var(--pl-danger)" }}>
          Escribe un momio válido, como −110, +150 o 1.91.
        </p>
      ) : null}
    </section>
  );
}

/**
 * /app/momios · Compara tu momio: junto a cada selección escribes el momio de tu casa y ves al
 * instante si paga más o menos que el momio justo del modelo. No inventa cuotas de casa.
 */
export function OddsCompareClubView(): React.JSX.Element {
  const { dataset, viewerRole, oddsFormat } = usePlatform();
  const [league, setLeague] = useState("all");
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const games = useMemo(
    () =>
      dataset.games
        .filter((g) => g.status !== "FT" && (league === "all" || g.league === league))
        .sort((a, b) => Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc)),
    [dataset.games, league],
  );
  const leagues = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of dataset.games) if (g.status !== "FT") m.set(g.league, g.leagueLabel);
    return Array.from(m.entries());
  }, [dataset.games]);

  const compared = Object.entries(inputs)
    .map(([id, raw]) => ({ id, dec: parseUserOdds(raw) }))
    .filter((x) => x.dec !== null).length;

  return (
    <AtmosphereStage activePath="/app/momios">
      <ClubWorkspaceShell activePath="/app/momios">
        <header className="space-y-1.5">
          <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">Compara tu momio</h1>
          <p className="m-0 text-sm max-w-2xl" style={{ color: "var(--pl-text-secondary)" }}>
            Escribe el momio que te da tu casa junto a cada selección. Si paga más que el momio justo del modelo,
            se marca en verde; si paga menos, la casa se queda con la diferencia.
          </p>
        </header>

        <div className="pl-odds-layout">
          <div className="pl-odds-main">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <label className="pl-finder-select">
                <span>Liga</span>
                <select className="glass-input" value={league} onChange={(e) => setLeague(e.target.value)}>
                  <option value="all">Todas</option>
                  {leagues.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {compared > 0 ? (
                <button type="button" className="pl-btn-glass text-xs min-h-9 px-3" onClick={() => setInputs({})}>
                  Borrar mis momios ({compared})
                </button>
              ) : null}
            </div>

            {games.map((g) => {
              const picks = g.picks.filter((p) => isPickUnlocked(p, g.status, viewerRole));
              if (picks.length === 0) return null;
              return (
                <section key={g.id} className="pl-odds-game glass-card glass-ring" aria-label={`${g.home.name} vs ${g.away.name}`}>
                  <header className="pl-finder-meta text-xs">
                    <LeagueBadge league={g.league} label={g.leagueLabel} size={14} />
                    <strong className="text-sm truncate" style={{ color: "var(--pl-text)" }}>
                      {g.home.shortName} vs {g.away.shortName}
                    </strong>
                    <span>
                      · {g.dayLabel} {g.kickoffLocal}
                    </span>
                  </header>
                  <ul className="pl-odds-rows">
                    {picks.map((pk) => {
                      const raw = inputs[pk.id] ?? "";
                      const dec = raw.trim() ? parseUserOdds(raw) : null;
                      const edge = dec ? edgeAgainstBook(pk.p, dec) : null;
                      const inputId = `odds-${pk.id}`;
                      return (
                        <li key={pk.id} className="pl-odds-row">
                          <div className="min-w-0">
                            <strong className="text-sm block truncate">{pk.label}</strong>
                            <span className="text-xs num" style={{ color: "var(--pl-text-muted)" }}>
                              {(pk.p * 100).toFixed(1)} % · justo {formatOddsValue(pk.fairDecimal, oddsFormat)}
                            </span>
                          </div>
                          <label htmlFor={inputId} className="sr-only">
                            Tu momio para {pk.label}
                          </label>
                          <input
                            id={inputId}
                            className="glass-input num pl-odds-input"
                            inputMode="decimal"
                            placeholder="Tu momio"
                            value={raw}
                            onChange={(e) => setInputs((prev) => ({ ...prev, [pk.id]: e.target.value }))}
                          />
                          <span
                            className={`pl-odds-verdict num ${edge === null ? "" : edge >= 0 ? "is-pos" : "is-neg"}`.trim()}
                            aria-live="polite"
                          >
                            {raw.trim() && !dec
                              ? "Momio inválido"
                              : edge === null
                                ? "—"
                                : edge >= 0
                                  ? `Paga +${edge.toFixed(1)} pts`
                                  : `Paga ${edge.toFixed(1)} pts`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          <aside className="pl-odds-side">
            <Converter />
            <section className="pl-odds-conv glass-card glass-ring" aria-labelledby="odds-how">
              <h2 id="odds-how" className="m-0 text-base font-extrabold">
                Cómo leerlo
              </h2>
              <ul className="pl-cortex-list">
                <li>El momio justo es 1 entre la probabilidad del modelo: lo que pagaría una casa sin comisión.</li>
                <li>
                  <MaestroIcon name="check" size={12} style={{ color: "var(--pl-success)" }} /> Verde: tu casa paga más que lo
                  justo.
                </li>
                <li>Gris: paga menos; la diferencia es la comisión de la casa.</li>
                <li>Una ventaja no asegura el resultado: solo dice que el precio es bueno.</li>
              </ul>
            </section>
          </aside>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
