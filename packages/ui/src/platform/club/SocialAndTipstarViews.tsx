"use client";

import React, { useMemo, useState } from "react";
import { formatOddsValue } from "../access-guard.js";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome.js";
import { usePlatform } from "../platform-provider.js";
import { TIPSTAR_CREATORS } from "../spacetime-catalog.js";

export function SocialVipClubView(): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    socialPosts,
    publishSocialPost,
    addSocialComment,
    toggleSocialLike,
    blockedSpamAttempts,
    navigateTo,
  } = usePlatform();

  const [tab, setTab] = useState<"feed" | "consenso" | "ranking">("feed");
  const [draftBody, setDraftBody] = useState<string>("");
  const [draftOrigin, setDraftOrigin] = useState<"Spacetime Suite" | "Bitácora Propia">(
    "Spacetime Suite",
  );
  const [composerErr, setComposerErr] = useState<string>("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  const featuredMatch =
    dataset.games.find((g) => g.status !== "FT") ?? dataset.games[0];

  const handlePublish = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setComposerErr("");
    const res = publishSocialPost({
      leagueLabel: featuredMatch?.leagueLabel ?? "Liga MX",
      matchLabel: featuredMatch
        ? `${featuredMatch.home.shortName} vs ${featuredMatch.away.shortName}`
        : "Análisis de jornada",
      pickBadge: featuredMatch?.picks[0]?.label ?? "Pick Principal · 1.5u",
      originType: draftOrigin,
      body: draftBody,
    });
    if (!res.ok) {
      setComposerErr(res.error ?? "No se pudo publicar.");
      return;
    }
    setDraftBody("");
  };

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/social">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <span className="pl-pill pl-pill--brand">
              Exclusivo Socios Pase Total · Récords Auditados
            </span>
            <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
              Comunidad VIP PitchLab
            </h1>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
              Debate táctico sin spam: cada socio comenta con su historial verificado en unidades
              y CLV. Enlaces externos bloqueados automáticamente ({blockedSpamAttempts}{" "}
              interceptados).
            </p>
          </div>

          <div className="seg-well" role="tablist" aria-label="Vistas de comunidad">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "feed"}
              className="seg-btn"
              onClick={() => setTab("feed")}
            >
              Muro Verificado
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "consenso"}
              className="seg-btn"
              onClick={() => setTab("consenso")}
            >
              Consenso vs. Suite
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "ranking"}
              className="seg-btn"
              onClick={() => setTab("ranking")}
            >
              Ranking CLV (IC 95 %)
            </button>
          </div>
        </section>

        {viewerRole === "visitor" ? (
          <section className="glass-lens glass-ring rounded-3xl p-6 space-y-3">
            <h2 className="m-0 text-xl font-extrabold">
              🔒 Comunidad reservada para suscriptores activos
            </h2>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
              Para evitar ruido, bots y venta clandestina de grupos, solo socios con Pase Total
              pueden leer y opinar en los hilos de partido.
            </p>
            <a
              href="/signup"
              onClick={(e) => {
                e.preventDefault();
                navigateTo("/signup");
              }}
              className="pl-btn-primary text-xs"
            >
              Activar 7 días gratis →
            </a>
          </section>
        ) : null}

        {viewerRole !== "visitor" && tab === "feed" ? (
          <div className="space-y-5">
            {/* Compositor anti-spam */}
            <form
              onSubmit={handlePublish}
              className="glass-lens glass-ring rounded-3xl p-5 space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">
                  Compartir lectura con tu insignia auditada
                </strong>
                <div className="seg-well" role="group" aria-label="Origen del pick comentado">
                  {(["Spacetime Suite", "Bitácora Propia"] as const).map((orig) => (
                    <button
                      key={orig}
                      type="button"
                      className="seg-btn text-xs"
                      aria-pressed={draftOrigin === orig}
                      onClick={() => setDraftOrigin(orig)}
                    >
                      {orig}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                rows={3}
                aria-label="Escribe tu lectura táctica para la comunidad"
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="Comparte tu lectura sobre el partido o cómo armaste tu parlay (enlaces externos bloqueados)..."
                className="glass-input w-full p-3 text-sm"
              />

              {composerErr ? (
                <p className="m-0 text-xs font-semibold" role="alert" style={{ color: "var(--pl-danger)" }}>
                  {composerErr}
                </p>
              ) : null}

              <div className="flex justify-end">
                <button type="submit" className="pl-btn-primary text-xs">
                  Publicar en Comunidad VIP
                </button>
              </div>
            </form>

            {/* Hilos de socios y Tipstars */}
            <div className="space-y-4">
              {socialPosts.map((post) => (
                <article
                  key={post.id}
                  className="glass-card glass-ring rounded-2xl p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <a
                        href={`/app/u/${post.authorHandle}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigateTo(`/app/u/${post.authorHandle}`);
                        }}
                        className="w-10 h-10 rounded-full inline-flex items-center justify-center text-xs font-extrabold no-underline"
                        style={{
                          background: post.avatarGradVar,
                          color: "var(--share-card-fg)",
                        }}
                      >
                        {post.authorName.slice(0, 2).toUpperCase()}
                      </a>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            href={`/app/u/${post.authorHandle}`}
                            onClick={(e) => {
                              e.preventDefault();
                              navigateTo(`/app/u/${post.authorHandle}`);
                            }}
                            className="font-extrabold text-sm no-underline hover:underline"
                          >
                            {post.authorName} (@{post.authorHandle})
                          </a>
                          <span className="pl-pill pl-pill--brand">{post.roleBadge}</span>
                        </div>
                        <span className="text-xs num" style={{ color: "var(--pl-success)" }}>
                          {post.verifiedRecord} · {post.clvBadge} · {post.createdAt}
                        </span>
                      </div>
                    </div>

                    <span className="pl-pill">
                      {post.leagueLabel} · {post.originType}
                    </span>
                  </div>

                  <p className="m-0 text-sm leading-relaxed">{post.body}</p>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="pl-pill pl-pill--info">{post.pickBadge}</span>
                    <button
                      type="button"
                      onClick={() => toggleSocialLike(post.id)}
                      className="pl-btn-glass text-xs min-h-7 px-2.5 num"
                    >
                      {post.likedByMe ? "★" : "☆"} Útil ({post.likes})
                    </button>
                  </div>

                  {/* Hilo de respuestas */}
                  {post.comments.length > 0 ? (
                    <div className="space-y-2 pt-2 hairline-t">
                      {post.comments.map((c) => (
                        <div
                          key={c.id}
                          className="rounded-xl p-2.5 text-xs"
                          style={{ background: "var(--pl-surface)" }}
                        >
                          <div className="flex items-center justify-between font-bold">
                            <span>
                              @{c.authorHandle} ·{" "}
                              <span style={{ color: "var(--pl-success)" }}>{c.verifiedBadge}</span>
                            </span>
                            <span style={{ color: "var(--pl-text-muted)" }}>{c.createdAt}</span>
                          </div>
                          <p className="m-0 mt-1" style={{ color: "var(--pl-text-secondary)" }}>
                            {c.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="text"
                      aria-label={`Responder a ${post.authorName}`}
                      value={replyDrafts[post.id] ?? ""}
                      onChange={(e) =>
                        setReplyDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))
                      }
                      placeholder="Responder con argumento táctico..."
                      className="glass-input flex-1 px-3 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      className="pl-btn-glass text-xs min-h-8 px-3"
                      onClick={() => {
                        const res = addSocialComment(post.id, replyDrafts[post.id] ?? "");
                        if (res.ok) {
                          setReplyDrafts((prev) => ({ ...prev, [post.id]: "" }));
                        }
                      }}
                    >
                      Responder
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}

        {viewerRole !== "visitor" && tab === "consenso" ? (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {dataset.games
              .filter((g) => g.status !== "FT")
              .slice(0, 4)
              .map((g, idx) => {
                const suitePct = Math.round((g.picks[0]?.p ?? 0.58) * 100);
                const communityPct = Math.min(89, suitePct + (idx % 2 === 0 ? 5 : -6));
                return (
                  <div
                    key={g.id}
                    className="glass-card glass-ring rounded-2xl p-5 space-y-2.5"
                  >
                    <span className="text-xs font-bold" style={{ color: "var(--pl-brand)" }}>
                      {g.leagueLabel} · {g.kickoffLocal}
                    </span>
                    <h2 className="m-0 text-base font-extrabold">
                      {g.home.name} vs {g.away.name}
                    </h2>
                    <p className="m-0 text-xs font-semibold">
                      Pick evaluado: {g.picks[0]?.label}
                    </p>
                    <div className="grid grid-cols-2 gap-2.5 text-xs num pt-1">
                      <div className="rounded-xl p-3" style={{ background: "var(--pl-surface)" }}>
                        <span className="block" style={{ color: "var(--pl-text-muted)" }}>
                          Spacetime Suite v2.1
                        </span>
                        <strong className="text-base font-extrabold">{suitePct} %</strong>
                      </div>
                      <div className="rounded-xl p-3" style={{ background: "var(--pl-surface)" }}>
                        <span className="block" style={{ color: "var(--pl-text-muted)" }}>
                          Consenso Socios VIP
                        </span>
                        <strong className="text-base font-extrabold" style={{ color: "var(--pl-success)" }}>
                          {communityPct} %
                        </strong>
                      </div>
                    </div>
                  </div>
                );
              })}
          </section>
        ) : null}

        {viewerRole !== "visitor" && tab === "ranking" ? (
          <section className="glass-card glass-ring rounded-2xl p-5">
            <h2 className="m-0 mb-3 text-lg font-extrabold">
              Leaderboard Verificado (Mínimo 100 picks sellados · IC 95 %)
            </h2>
            <div
              className="pl-table-region"
              tabIndex={0}
              role="region"
              aria-label="Leaderboard verificado de analistas y Tipstars"
            >
              <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="hairline-b text-xs uppercase" style={{ color: "var(--pl-text-muted)" }}>
                  <th scope="col" className="py-2 pr-3">#</th>
                  <th scope="col" className="py-2 pr-3">Analista / Tipstar</th>
                  <th scope="col" className="py-2 px-2 text-right">Muestra</th>
                  <th scope="col" className="py-2 px-2 text-right">CLV Medio</th>
                  <th scope="col" className="py-2 px-2 text-right">ROI (IC 95 %)</th>
                  <th scope="col" className="py-2 pl-2 text-right">Unidades</th>
                </tr>
              </thead>
              <tbody>
                {TIPSTAR_CREATORS.map((c, idx) => (
                  <tr key={c.handle} className="hairline-b">
                    <td className="py-2.5 pr-3 num font-bold">{idx + 1}</td>
                    <td className="py-2.5 pr-3">
                      <a
                        href={`/app/u/${c.handle}`}
                        onClick={(e) => {
                          e.preventDefault();
                          navigateTo(`/app/u/${c.handle}`);
                        }}
                        className="font-bold no-underline hover:underline"
                      >
                        {c.name} (@{c.handle})
                      </a>
                    </td>
                    <td className="py-2.5 px-2 text-right num">{c.settledCount}</td>
                    <td className="py-2.5 px-2 text-right num font-bold" style={{ color: "var(--pl-brand)" }}>
                      {c.clvAvg}
                    </td>
                    <td className="py-2.5 px-2 text-right num">{c.roi95Ci}</td>
                    <td className="py-2.5 pl-2 text-right num font-extrabold" style={{ color: "var(--pl-success)" }}>
                      {c.verifiedUnits}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </section>
        ) : null}
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function TipstarPortalClubView(): React.JSX.Element {
  const {
    dataset,
    viewerRole,
    setViewerRole,
    journal,
    oddsFormat,
    tipstarWeeklyPickOrigin,
    setTipstarWeeklyPickOrigin,
    selectedTipstarPickId,
    setSelectedTipstarPickId,
    openShareTicket,
    navigateTo,
    pushToast,
  } = usePlatform();

  const sofia = TIPSTAR_CREATORS[0]!;
  const [thesis, setThesis] = useState<string>(sofia.weeklyPickThesis);

  const spacetimeCandidatePicks = useMemo(() => {
    const out = [];
    for (const g of dataset.games) {
      if (g.status === "FT") continue;
      for (const pk of g.picks.slice(0, 2)) {
        if (!pk.isRedacted) out.push(pk);
      }
    }
    return out.slice(0, 8);
  }, [dataset.games]);

  const activePick =
    spacetimeCandidatePicks.find((p) => p.id === selectedTipstarPickId) ??
    spacetimeCandidatePicks[0];

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/tipstar">
        <section className="space-y-2">
          <span className="pl-pill pl-pill--info">
            Programa Creadores Oficiales · 25 % Comisión Recurrente
          </span>
          <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
            Portal Tipstar Oficial (@{sofia.handle})
          </h1>
          <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            Tienes derecho a liberar <strong>1 Pick Abierto a la semana</strong> (del motor
            Spacetime Suite o de tu propia Bitácora sellada) con tu boleto oficial y código de 5
            días gratis, manteniendo los otros 4 picks del partido protegidos.
          </p>
        </section>

        {/* KPIs del creador */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 num">
          <div className="glass-card glass-ring rounded-2xl p-4">
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Código Personal
            </span>
            <strong className="text-xl font-extrabold" style={{ color: "var(--pl-brand)" }}>
              {sofia.promoCode}
            </strong>
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Otorga {sofia.freeDays} días gratis
            </span>
          </div>
          <div className="glass-card glass-ring rounded-2xl p-4">
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Referidos Activos Pagados
            </span>
            <strong className="text-xl font-extrabold">{sofia.activeReferrals}</strong>
            <span className="block text-xs" style={{ color: "var(--pl-success)" }}>
              Pase Total bonificado
            </span>
          </div>
          <div className="glass-card glass-ring rounded-2xl p-4">
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Comisión Mensual (25 %)
            </span>
            <strong className="text-xl font-extrabold" style={{ color: "var(--pl-success)" }}>
              ${sofia.monthlyCommissionMxn.toLocaleString("es-MX")} MXN
            </strong>
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Recurrente mes a mes
            </span>
          </div>
          <div className="glass-card glass-ring rounded-2xl p-4">
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Cupo Semanal Abierto
            </span>
            <strong className="text-xl font-extrabold">1 / 1 disp.</strong>
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Cero fuga en los otros 4
            </span>
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Configurador del Pick Abierto de la Semana (Q11: Spacetime vs Bitácora) */}
          <section className="lg:col-span-7 glass-lens glass-ring rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-lg font-extrabold">
                Configurar Pick Abierto de la Semana
              </h2>
              <div className="seg-well" role="group" aria-label="Origen del pick semanal">
                <button
                  type="button"
                  className="seg-btn text-xs"
                  aria-pressed={tipstarWeeklyPickOrigin === "spacetime"}
                  onClick={() => setTipstarWeeklyPickOrigin("spacetime")}
                >
                  Pick Oficial Spacetime Suite
                </button>
                <button
                  type="button"
                  className="seg-btn text-xs"
                  aria-pressed={tipstarWeeklyPickOrigin === "bitacora"}
                  onClick={() => setTipstarWeeklyPickOrigin("bitacora")}
                >
                  Pick de mi Bitácora ({journal.length})
                </button>
              </div>
            </div>

            {tipstarWeeklyPickOrigin === "spacetime" ? (
              <div className="space-y-2">
                <label htmlFor="tipstar-pick-select" className="block text-xs font-bold">
                  Elige el pick de Spacetime Suite que abrirás al público esta semana
                </label>
                <select
                  id="tipstar-pick-select"
                  value={activePick?.id ?? ""}
                  onChange={(e) => setSelectedTipstarPickId(e.target.value)}
                  className="glass-input w-full px-3 py-2.5 text-sm font-semibold"
                >
                  {spacetimeCandidatePicks.map((pk) => (
                    <option key={pk.id} value={pk.id}>
                      {pk.leagueLabel} · {pk.matchLabel} — {pk.label} ({(pk.p * 100).toFixed(0)} %)
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div
                className="rounded-2xl p-3.5 text-xs space-y-1"
                style={{ background: "var(--pl-surface)" }}
              >
                <strong>Última entrada sellada en tu Bitácora:</strong>
                <p className="m-0 font-bold text-sm">
                  {journal[0]?.matchLabel} — {journal[0]?.pickLabel} ({journal[0]?.units}u)
                </p>
              </div>
            )}

            <div>
              <label htmlFor="tipstar-thesis-input" className="block text-xs font-bold mb-1">
                Tu tesis para la tarjeta pública (/p/sofia-sem)
              </label>
              <textarea
                id="tipstar-thesis-input"
                rows={3}
                value={thesis}
                onChange={(e) => setThesis(e.target.value)}
                className="glass-input w-full p-3 text-sm"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                className="pl-btn-primary text-xs"
                onClick={() => {
                  if (!activePick) return;
                  if (viewerRole === "member") {
                    setViewerRole("tipstar");
                  }
                  openShareTicket({
                    kind: "tipstar",
                    title: activePick.matchLabel,
                    subtitle: `Tipstar Oficial @${sofia.handle} · ${activePick.leagueLabel}`,
                    leagueLabel: activePick.leagueLabel,
                    pickLabel:
                      tipstarWeeklyPickOrigin === "spacetime"
                        ? activePick.label
                        : journal[0]?.pickLabel ?? activePick.label,
                    probability: activePick.p,
                    fairDecimal: activePick.fairDecimal,
                    marketDecimal: activePick.marketDecimal,
                    units: activePick.suggestedUnits,
                    gameStatus: "NS",
                    promoCode: sofia.promoCode,
                    tipstarHandle: sofia.handle,
                    originBadge:
                      tipstarWeeklyPickOrigin === "spacetime"
                        ? "PICK OFICIAL SPACETIME SUITE"
                        : "PICK SELLADO BITÁCORA TIPSTAR",
                  });
                }}
              >
                Generar Boleto 4:5 / 9:16 con mi Código →
              </button>

              <a
                href="/p/sofia-sem"
                onClick={(e) => {
                  e.preventDefault();
                  pushToast("Abriendo vista pública /p/sofia-sem...", "default");
                  navigateTo("/p/sofia-sem");
                }}
                className="pl-btn-glass text-xs"
              >
                Ver página pública /p/sofia-sem
              </a>
            </div>
          </section>

          {/* Vista previa rápida del boleto del creador */}
          <aside className="lg:col-span-5 share-ticket-card p-6 space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold uppercase tracking-wider" style={{ color: "var(--share-card-accent)" }}>
                VISTA PREVIA BOLETO TIPSTAR
              </span>
              <span className="num" style={{ color: "var(--share-card-success)" }}>
                {sofia.verifiedUnits}
              </span>
            </div>
            <div>
              <h3 className="m-0 text-lg font-extrabold">
                {activePick?.matchLabel ?? "Partido Estelar"}
              </h3>
              <p className="m-0 text-xs" style={{ color: "var(--share-card-muted)" }}>
                {tipstarWeeklyPickOrigin === "spacetime"
                  ? "Respaldado por PitchLab Spacetime Suite v2.1"
                  : "Selección propia auditada en Bitácora PitchLab"}
              </p>
            </div>
            <div className="ticket-perf" />
            {activePick ? (
              <div
                className="rounded-xl p-3.5 space-y-1"
                style={{ background: "var(--share-card-surface)" }}
              >
                <p className="m-0 text-base font-extrabold">{activePick.label}</p>
                <p className="m-0 text-xs num" style={{ color: "var(--share-card-secondary)" }}>
                  Prob. {(activePick.p * 100).toFixed(1)} % · Momio{" "}
                  {formatOddsValue(activePick.marketDecimal, oddsFormat)}
                </p>
              </div>
            ) : null}
            <p className="m-0 text-xs" style={{ color: "var(--share-card-secondary)" }}>
              “{thesis}”
            </p>
            <div className="ticket-perf" />
            <div className="flex items-center justify-between text-xs font-bold">
              <span>CÓDIGO: {sofia.promoCode} (5 días gratis)</span>
              <span style={{ color: "var(--share-card-muted)" }}>pitchlab.mx</span>
            </div>
          </aside>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
