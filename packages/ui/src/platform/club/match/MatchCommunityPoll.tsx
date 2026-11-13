"use client";

import React, { useCallback, useEffect, useState } from "react";
import { MaestroIcon } from "../../components/MaestroPrimitives";
import { usePlatformCore } from "../../platform-provider";
import type { PlatformGame } from "../../types";

interface Tally {
  ganador: { home: number; draw: number; away: number };
  pick: { si: number; no: number };
  mine: { ganador: string | null; pick: string | null };
}

const EMPTY: Tally = { ganador: { home: 0, draw: 0, away: 0 }, pick: { si: 0, no: 0 }, mine: { ganador: null, pick: null } };

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

/**
 * Votación de la comunidad: «¿Quién gana?» y «¿Se dará el pick principal?». Los resultados
 * se ven después de votar (para no inducir el voto) junto a lo que dice el modelo. Con
 * cuenta se guarda en el servidor; con el PIN de la beta el voto queda solo en esta vista.
 */
export function MatchCommunityPoll({ game }: { game: PlatformGame }): React.JSX.Element {
  const { hasAccountSession } = usePlatformCore();
  const [tally, setTally] = useState<Tally>(EMPTY);
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const isNfl = game.sport === "american-football";
  const mainPick = game.picks[0];
  const closed = game.status !== "NS" || Date.parse(game.kickoffUtc) <= Date.now();

  useEffect(() => {
    if (!hasAccountSession) return;
    let alive = true;
    fetch(`/api/social/votes?gameId=${encodeURIComponent(game.id)}`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { tally?: Tally } | null) => {
        if (alive && data?.tally) setTally(data.tally);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [game.id, hasAccountSession]);

  const vote = useCallback(
    async (question: "ganador" | "pick", choice: string) => {
      if (closed || busy) return;
      setError("");
      const previous = tally.mine[question];
      if (previous === choice) return;
      // Optimista: mueve el voto en el conteo local.
      setTally((t) => {
        const next: Tally = { ganador: { ...t.ganador }, pick: { ...t.pick }, mine: { ...t.mine, [question]: choice } };
        const bucket = next[question] as Record<string, number>;
        if (previous && bucket[previous] !== undefined) bucket[previous] = Math.max(0, bucket[previous]! - 1);
        bucket[choice] = (bucket[choice] ?? 0) + 1;
        return next;
      });
      if (!hasAccountSession) return;
      setBusy(true);
      try {
        const res = await fetch("/api/social/votes", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId: game.id, question, choice }),
        });
        const data = (await res.json().catch(() => null)) as { tally?: Tally; error?: string } | null;
        if (res.ok && data?.tally) setTally(data.tally);
        else setError(data?.error ?? "No se pudo guardar tu voto.");
      } catch {
        setError("No se pudo guardar tu voto. Revisa tu conexión.");
      } finally {
        setBusy(false);
      }
    },
    [busy, closed, game.id, hasAccountSession, tally.mine],
  );

  const winnerOptions = [
    { key: "home", label: game.home.shortName, model: game.x12[0] },
    ...(isNfl ? [] : [{ key: "draw", label: "Empate", model: game.x12[1] }]),
    { key: "away", label: game.away.shortName, model: game.x12[2] },
  ];
  const winnerTotal = tally.ganador.home + tally.ganador.draw + tally.ganador.away;
  const pickTotal = tally.pick.si + tally.pick.no;

  return (
    <section className="pl-poll glass-card glass-ring" aria-labelledby="poll-title">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 id="poll-title" className="m-0 text-base font-extrabold">
            La comunidad vota
          </h2>
          <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
            {closed ? "Votación cerrada: el partido ya empezó." : "Vota y compara con el modelo. Puedes cambiar tu voto hasta el inicio."}
          </p>
        </div>
        <MaestroIcon name="users" size={18} style={{ color: "var(--pl-text-muted)" }} />
      </header>

      <PollQuestion
        title="¿Quién gana?"
        options={winnerOptions.map((o) => ({
          key: o.key,
          label: o.label,
          votes: tally.ganador[o.key as keyof Tally["ganador"]],
          modelP: o.model,
        }))}
        total={winnerTotal}
        mine={tally.mine.ganador}
        disabled={closed}
        onVote={(k) => vote("ganador", k)}
      />

      {mainPick ? (
        <PollQuestion
          title={`¿Se dará «${mainPick.label}»?`}
          options={[
            { key: "si", label: "Sí", votes: tally.pick.si, modelP: mainPick.p },
            { key: "no", label: "No", votes: tally.pick.no, modelP: 1 - mainPick.p },
          ]}
          total={pickTotal}
          mine={tally.mine.pick}
          disabled={closed}
          onVote={(k) => vote("pick", k)}
        />
      ) : null}

      {error ? (
        <p role="alert" className="m-0 text-xs font-semibold" style={{ color: "var(--pl-danger)" }}>
          {error}
        </p>
      ) : null}
      {hasAccountSession ? null : (
        <p className="m-0 text-xs" style={{ color: "var(--pl-text-muted)" }}>
          Con la vista de socio beta tu voto queda solo en esta pantalla. Con tu cuenta se suma al conteo de todos.
        </p>
      )}
    </section>
  );
}

function PollQuestion({
  title,
  options,
  total,
  mine,
  disabled,
  onVote,
}: {
  title: string;
  options: Array<{ key: string; label: string; votes: number; modelP: number }>;
  total: number;
  mine: string | null;
  disabled: boolean;
  onVote: (key: string) => void;
}): React.JSX.Element {
  const reveal = Boolean(mine) || disabled;
  return (
    <fieldset className="pl-poll-q">
      <legend className="text-sm font-bold">{title}</legend>
      <div className="pl-poll-options" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => {
          const share = pct(o.votes, total);
          return (
            <button
              key={o.key}
              type="button"
              className={`pl-poll-option ${mine === o.key ? "is-mine" : ""}`.trim()}
              aria-pressed={mine === o.key}
              disabled={disabled}
              onClick={() => onVote(o.key)}
            >
              {reveal ? <span className="pl-poll-fill" style={{ width: `${share}%` }} aria-hidden="true" /> : null}
              <span className="pl-poll-label">
                {mine === o.key ? <MaestroIcon name="check" size={12} /> : null}
                <span className="truncate">{o.label}</span>
              </span>
              {reveal ? <strong className="pl-poll-share num">{share} %</strong> : null}
            </button>
          );
        })}
      </div>
      {reveal ? (
        <p className="m-0 text-[11px] num" style={{ color: "var(--pl-text-muted)" }}>
          {total} {total === 1 ? "voto" : "votos"} · Modelo:{" "}
          {options.map((o) => `${o.label} ${Math.round(o.modelP * 100)} %`).join(" · ")}
        </p>
      ) : null}
    </fieldset>
  );
}
