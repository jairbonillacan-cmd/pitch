"use client";

import React, { useMemo, useState } from "react";
import { Switch } from "@heroui/react";
import { LeagueBadge } from "../../sports.js";
import { formatOddsValue } from "../access-guard.js";
import { MatchTicketCard } from "../components/MatchTicketCard.js";
import {
  AtmosphereStage,
  ClubWorkspaceShell,
} from "../components/ShellChrome.js";
import { TechPrecisionSection } from "../public/TechAndPricingSurfaces.js";
import { usePlatform } from "../platform-provider.js";
import {
  MEMBERSHIP_SPEC,
  TIPSTAR_CREATORS,
} from "../spacetime-catalog.js";

export function ClubTechView(): React.JSX.Element {
  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/tech">
        <TechPrecisionSection inClub />
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function HistorialClubView(): React.JSX.Element {
  const { dataset } = usePlatform();
  const [outcomeFilter, setOutcomeFilter] = useState<"all" | "hit" | "miss">("all");
  const [leagueFilter, setLeagueFilter] = useState<string>("all");

  const finishedGames = useMemo(
    () =>
      dataset.games.filter((g) => {
        if (g.status !== "FT" || !g.score) return false;
        if (leagueFilter !== "all" && g.league !== leagueFilter) return false;
        const res = g.picks[0]?.result;
        if (outcomeFilter === "hit") return res === "hit";
        if (outcomeFilter === "miss") return res === "miss";
        return true;
      }),
    [dataset.games, leagueFilter, outcomeFilter],
  );

  const allFt = dataset.games.filter((g) => g.status === "FT" && g.score);
  const hitsCount = allFt.filter((g) => g.picks[0]?.result === "hit").length;

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/historial">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <span className="pl-pill pl-pill--success">
              Registro Público Inmutable · Partidos Finalizados FT
            </span>
            <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
              Resultados Cerrados y Auditoría ({allFt.length} encuentros)
            </h1>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
              Todos los encuentros finalizados permanecen públicos con sus marcadores oficiales y
              calificación automática ({hitsCount} picks principales ganados en el corte actual).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="seg-well" role="group" aria-label="Filtrar resultados cerrados">
              {(["all", "hit", "miss"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className="seg-btn"
                  aria-pressed={outcomeFilter === f}
                  onClick={() => setOutcomeFilter(f)}
                >
                  {f === "all" ? "Todos" : f === "hit" ? "Ganados" : "Perdidos"}
                </button>
              ))}
            </div>

            <select
              aria-label="Liga en historial"
              value={leagueFilter}
              onChange={(e) => setLeagueFilter(e.target.value)}
              className="glass-input px-3 py-1.5 text-xs font-semibold"
            >
              <option value="all">Todas las ligas</option>
              {dataset.leagues.map((l) => (
                <option key={l.league} value={l.league}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {finishedGames.slice(0, 15).map((g) => (
            <MatchTicketCard key={g.id} game={g} />
          ))}
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function BitacoraClubView(): React.JSX.Element {
  const { journal, oddsFormat, exportJournalCsv } = usePlatform();

  const stats = useMemo(() => {
    let netUnits = 0;
    let clvSum = 0;
    let won = 0;
    let settled = 0;
    for (const j of journal) {
      clvSum += j.clvPct;
      if (j.status === "won") {
        won += 1;
        settled += 1;
        netUnits += j.units * (j.userDecimal - 1);
      } else if (j.status === "lost") {
        settled += 1;
        netUnits -= j.units;
      }
    }
    return {
      netUnits: Math.round(netUnits * 100) / 100,
      avgClv: journal.length ? Math.round((clvSum / journal.length) * 10) / 10 : 0,
      winRate: settled ? Math.round((won / settled) * 1000) / 10 : 0,
    };
  }, [journal]);

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/lab">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <span className="pl-pill pl-pill--brand">
              Unidades Simuladas Auditadas · CLV Automático
            </span>
            <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
              Mi Bitácora Cuantitativa
            </h1>
          </div>

          <button
            type="button"
            className="pl-btn-primary text-xs"
            onClick={() => exportJournalCsv()}
          >
            Exportar Bitácora CSV →
          </button>
        </section>

        <div className="grid grid-cols-3 gap-3.5 num">
          <div className="glass-card glass-ring rounded-2xl p-4">
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Balance Simulado
            </span>
            <strong
              className="text-2xl font-extrabold"
              style={{
                color: stats.netUnits >= 0 ? "var(--pl-success)" : "var(--pl-danger)",
              }}
            >
              {stats.netUnits >= 0 ? `+${stats.netUnits.toFixed(2)}u` : `${stats.netUnits.toFixed(2)}u`}
            </strong>
          </div>
          <div className="glass-card glass-ring rounded-2xl p-4">
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              CLV Promedio vs. Justa
            </span>
            <strong className="text-2xl font-extrabold" style={{ color: "var(--pl-brand)" }}>
              +{stats.avgClv.toFixed(1)} %
            </strong>
          </div>
          <div className="glass-card glass-ring rounded-2xl p-4">
            <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
              Acierto Resuelto
            </span>
            <strong className="text-2xl font-extrabold">{stats.winRate.toFixed(1)} %</strong>
          </div>
        </div>

        <section className="glass-card glass-ring rounded-2xl p-5">
          <div
            className="pl-table-region"
            tabIndex={0}
            role="region"
            aria-label="Bitácora verificada de selecciones selladas"
          >
            <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="hairline-b text-xs uppercase" style={{ color: "var(--pl-text-muted)" }}>
                <th scope="col" className="py-2 pr-3">Corte</th>
                <th scope="col" className="py-2 pr-3">Partido & Selección</th>
                <th scope="col" className="py-2 px-2">Origen</th>
                <th scope="col" className="py-2 px-2 text-right">Unid.</th>
                <th scope="col" className="py-2 px-2 text-right">Tu Cuota</th>
                <th scope="col" className="py-2 px-2 text-right">CLV</th>
                <th scope="col" className="py-2 pl-2 text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {journal.map((item) => (
                <tr key={item.id} className="hairline-b">
                  <td className="py-2.5 pr-3 text-xs" style={{ color: "var(--pl-text-muted)" }}>
                    {item.sealedAt}
                  </td>
                  <td className="py-2.5 pr-3">
                    <strong className="block">{item.pickLabel}</strong>
                    <span className="text-xs" style={{ color: "var(--pl-text-muted)" }}>
                      {item.leagueLabel} · {item.matchLabel}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className="pl-pill">{item.origin}</span>
                  </td>
                  <td className="py-2.5 px-2 text-right num font-bold">
                    {item.units.toFixed(2)}u
                  </td>
                  <td className="py-2.5 px-2 text-right num">
                    {formatOddsValue(item.userDecimal, oddsFormat)}
                  </td>
                  <td
                    className="py-2.5 px-2 text-right num font-bold"
                    style={{
                      color: item.clvPct >= 0 ? "var(--pl-success)" : "var(--pl-warning)",
                    }}
                  >
                    {item.clvPct >= 0 ? `+${item.clvPct.toFixed(1)}` : item.clvPct.toFixed(1)} %
                  </td>
                  <td className="py-2.5 pl-2 text-right">
                    <span
                      className={
                        item.status === "won"
                          ? "pl-pill pl-pill--success"
                          : item.status === "lost"
                            ? "pl-pill pl-pill--danger"
                            : "pl-pill pl-pill--info"
                      }
                    >
                      {item.status === "won"
                        ? "Ganado"
                        : item.status === "lost"
                          ? "Perdido"
                          : "En juego"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </section>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function AnalystProfileClubView({
  handle,
}: {
  handle: string;
}): React.JSX.Element {
  const { socialPosts, navigateTo } = usePlatform();
  const creator =
    TIPSTAR_CREATORS.find((c) => c.handle === handle) ?? TIPSTAR_CREATORS[0]!;
  const posts = socialPosts.filter((p) => p.authorHandle === creator.handle);

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath={`/app/u/${creator.handle}`}>
        <section className="glass-lens glass-ring glass-ring--featured rounded-3xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span
                className="w-16 h-16 rounded-full inline-flex items-center justify-center text-xl font-extrabold"
                style={{
                  background: creator.avatarGradVar,
                  color: "var(--share-card-fg)",
                }}
              >
                {creator.avatarInitials}
              </span>
              <div>
                <span className="pl-pill pl-pill--info">{creator.specialty}</span>
                <h1 className="m-0 mt-1 text-2xl font-extrabold">
                  {creator.name} (@{creator.handle})
                </h1>
                <p className="m-0 text-xs num" style={{ color: "var(--pl-success)" }}>
                  Récord verificado: {creator.verifiedUnits} · CLV {creator.clvAvg} · ROI{" "}
                  {creator.roi95Ci}
                </p>
              </div>
            </div>

            <a
              href={`/p/${creator.weeklyPickSlug}`}
              onClick={(e) => {
                e.preventDefault();
                navigateTo(`/p/${creator.weeklyPickSlug}`);
              }}
              className="pl-btn-primary text-xs"
            >
              Ver Pick Abierto Semanal ({creator.promoCode}) →
            </a>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="m-0 text-lg font-extrabold">
            Aportes recientes en Comunidad VIP
          </h2>
          {posts.map((p) => (
            <div key={p.id} className="glass-card glass-ring rounded-2xl p-4 space-y-2">
              <span className="text-xs font-bold" style={{ color: "var(--pl-brand)" }}>
                {p.leagueLabel} · {p.pickBadge}
              </span>
              <p className="m-0 text-sm">{p.body}</p>
            </div>
          ))}
        </section>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function AccountReferralsClubView(): React.JSX.Element {
  const {
    referralPaidFriends,
    simulateFriendFirstPayment,
    pushToast,
  } = usePlatform();

  const [rfc, setRfc] = useState<string>("XAXX010101000");
  const [razonSocial, setRazonSocial] = useState<string>("");

  const earnedDays =
    referralPaidFriends * MEMBERSHIP_SPEC.referralBothRewardDays +
    (referralPaidFriends >= MEMBERSHIP_SPEC.referralAmbassadorThreshold
      ? MEMBERSHIP_SPEC.referralAmbassadorBonusDays
      : 0);
  const isAmbassador =
    referralPaidFriends >= MEMBERSHIP_SPEC.referralAmbassadorThreshold;

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/account">
        <section className="space-y-1">
          <span className="pl-pill pl-pill--brand">
            Membresía Única · Referidos Doble Vía · CFDI 4.0
          </span>
          <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
            Mi Cuenta, Referidos y Facturación
          </h1>
        </section>

        {/* Sistema de Referidos Doble Vía */}
        <section
          className="glass-lens glass-ring glass-ring--featured rounded-3xl p-6 space-y-4"
          data-referrals-card=""
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="pl-pill pl-pill--success">
                Socio ↔ Socio · Ambos Ganan +15 Días Gratis
              </span>
              <h2 className="m-0 mt-1 text-xl font-extrabold">
                Invita amigos a PitchLab y acumula tiempo gratis
              </h2>
            </div>
            {isAmbassador ? (
              <span className="pl-pill pl-pill--brand">★ Insignia Embajador Activa</span>
            ) : null}
          </div>

          <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
            Tu enlace otorga a tu invitado{" "}
            <strong>{MEMBERSHIP_SPEC.referralFriendBenefit}</strong>. En cuanto realiza el pago de
            su primer mes, <strong>ambos reciben +15 días gratis</strong> automáticos en su Pase
            Total.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 num">
            <div className="rounded-2xl p-4" style={{ background: "var(--pl-surface)" }}>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Amigos con 1er mes pagado
              </span>
              <strong className="text-2xl font-extrabold" data-referral-friends="">
                {referralPaidFriends} / 5
              </strong>
            </div>
            <div className="rounded-2xl p-4" style={{ background: "var(--pl-surface)" }}>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Días gratis acumulados
              </span>
              <strong
                className="text-2xl font-extrabold"
                style={{ color: "var(--pl-success)" }}
                data-referral-days=""
              >
                +{earnedDays} días
              </strong>
            </div>
            <div className="rounded-2xl p-4" style={{ background: "var(--pl-surface)" }}>
              <span className="block text-xs" style={{ color: "var(--pl-text-muted)" }}>
                Código personal
              </span>
              <strong className="text-xl font-extrabold" style={{ color: "var(--pl-brand)" }}>
                SOCIO-8842
              </strong>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              className="pl-btn-primary text-xs"
              onClick={() => {
                try {
                  void navigator.clipboard?.writeText(
                    "https://pitchlab.mx/signup?ref=SOCIO-8842",
                  );
                } catch (err) {
                  void err;
                }
                pushToast("Enlace de referido copiado al portapapeles.", "success");
              }}
            >
              Copiar mi enlace de referido
            </button>

            <button
              type="button"
              className="pl-btn-glass text-xs"
              data-simulate-referral=""
              onClick={simulateFriendFirstPayment}
            >
              Simular 1er pago de amigo (+15d ambos)
            </button>
          </div>
        </section>

        {/* Plan Pase Total + Facturación Fiscal CFDI 4.0 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="glass-card glass-ring rounded-2xl p-5 space-y-3">
            <h2 className="m-0 text-lg font-extrabold">{MEMBERSHIP_SPEC.name}</h2>
            <p className="m-0 text-sm" style={{ color: "var(--pl-text-secondary)" }}>
              Suscripción activa: <strong>${MEMBERSHIP_SPEC.monthlyMxn} MXN / mes</strong> (opción
              anual disponible por ${MEMBERSHIP_SPEC.annualMxn.toLocaleString("es-MX")} MXN / año,
              ahorro del 33 %).
            </p>
            <button
              type="button"
              className="pl-btn-glass text-xs"
              onClick={() =>
                pushToast(
                  "Cambio a plan anual ($2,390 MXN/año) preparado para tu siguiente corte.",
                  "success",
                )
              }
            >
              Cambiar a Plan Anual ($2,390 MXN · -33 %)
            </button>
          </section>

          <section className="glass-card glass-ring rounded-2xl p-5 space-y-3">
            <h2 className="m-0 text-lg font-extrabold">
              Datos Fiscales SAT · Factura CFDI 4.0
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label htmlFor="cfdi-rfc" className="block text-xs font-bold mb-1">
                  RFC
                </label>
                <input
                  id="cfdi-rfc"
                  type="text"
                  value={rfc}
                  onChange={(e) => setRfc(e.target.value.toUpperCase())}
                  className="glass-input w-full px-3 py-2 text-xs uppercase font-bold num"
                />
              </div>
              <div>
                <label htmlFor="cfdi-razon" className="block text-xs font-bold mb-1">
                  Razón Social
                </label>
                <input
                  id="cfdi-razon"
                  type="text"
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value)}
                  placeholder="Nombre o empresa"
                  className="glass-input w-full px-3 py-2 text-xs"
                />
              </div>
            </div>
            <button
              type="button"
              className="pl-btn-primary text-xs"
              onClick={() =>
                pushToast(
                  `Datos CFDI 4.0 guardados para RFC ${rfc}. Tu PDF/XML se timbrará en cada pago.`,
                  "success",
                )
              }
            >
              Guardar datos CFDI 4.0
            </button>
          </section>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}

export function FounderAdminClubView(): React.JSX.Element {
  const {
    dataset,
    month1NoCardMode,
    setMonth1NoCardMode,
    blockedSpamAttempts,
    pushToast,
  } = usePlatform();

  const [newCreatorCode, setNewCreatorCode] = useState<string>("ALEX5");

  return (
    <AtmosphereStage>
      <ClubWorkspaceShell activePath="/app/admin">
        <section className="space-y-1">
          <span className="pl-pill pl-pill--warning">
            Consola Operativa Founder · Configuración de Lanzamiento
          </span>
          <h1 className="m-0 text-2xl sm:text-3xl font-extrabold">
            Admin Founder · Control de Prueba Gratis, Tipstars y Motores
          </h1>
        </section>

        {/* Interruptor Mes 1 (Sin Tarjeta) vs Mes 2 (Tarjeta $0 MXN) */}
        <section className="glass-lens glass-ring rounded-3xl p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1 max-w-xl">
            <h2 className="m-0 text-lg font-extrabold">
              Política de Prueba Gratis (Mes 1 vs. Mes 2)
            </h2>
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
              En Mes 1 permitimos registro sin tarjeta con escudo anti-abuso $0 MXN (OAuth +
              normalización Gmail + huella de dispositivo) para crecer la base inicial. Al pasar al
              Mes 2 se activa la verificación bancaria $0.00 MXN.
            </p>
          </div>

          <Switch isSelected={month1NoCardMode} onChange={setMonth1NoCardMode}>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Content>
              <span className="text-xs font-bold">
                {month1NoCardMode
                  ? "Mes 1 Activo: Sin pedir tarjeta"
                  : "Mes 2 Activo: Tarjeta $0 MXN"}
              </span>
            </Switch.Content>
          </Switch>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Alta rápida de códigos de Tipstars */}
          <section className="glass-card glass-ring rounded-2xl p-5 space-y-3">
            <h2 className="m-0 text-lg font-extrabold">
              Códigos de Tipstars Oficiales (5d gratis · 25 % comisión)
            </h2>
            <div className="space-y-2 text-xs">
              {TIPSTAR_CREATORS.map((c) => (
                <div
                  key={c.handle}
                  className="rounded-xl p-3 flex items-center justify-between num"
                  style={{ background: "var(--pl-surface)" }}
                >
                  <span>
                    <strong>{c.promoCode}</strong> · @{c.handle}
                  </span>
                  <span style={{ color: "var(--pl-success)" }}>
                    {c.activeReferrals} activos · ${c.monthlyCommissionMxn} MXN/mes
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="text"
                aria-label="Nuevo código promocional de Tipstar"
                value={newCreatorCode}
                onChange={(e) => setNewCreatorCode(e.target.value.toUpperCase())}
                className="glass-input px-3 py-2 text-xs uppercase font-bold num flex-1"
              />
              <button
                type="button"
                className="pl-btn-primary text-xs"
                onClick={() =>
                  pushToast(
                    `Código ${newCreatorCode} habilitado (5 días gratis + atribución 25 %).`,
                    "success",
                  )
                }
              >
                Emitir código
              </button>
            </div>
          </section>

          {/* Salud de Snapshots y Escudo Anti-Fuga */}
          <section className="glass-card glass-ring rounded-2xl p-5 space-y-3">
            <h2 className="m-0 text-lg font-extrabold">
              Estado de Spacetime Suite v2.1 & Anti-Spam
            </h2>
            <p className="m-0 text-xs num" style={{ color: "var(--pl-text-secondary)" }}>
              Enlaces de spam bloqueados en Comunidad VIP:{" "}
              <strong>{blockedSpamAttempts}</strong>
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {dataset.leagues.map((lg) => (
                <div
                  key={lg.league}
                  className="rounded-xl p-2.5 flex items-center justify-between"
                  style={{ background: "var(--pl-surface)" }}
                >
                  <span className="flex items-center gap-1.5 font-semibold truncate">
                    <LeagueBadge league={lg.league} label={lg.label} size={16} />
                    <span className="truncate">{lg.label}</span>
                  </span>
                  <span className="num" style={{ color: "var(--pl-success)" }}>
                    {lg.totalGames} OK
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </ClubWorkspaceShell>
    </AtmosphereStage>
  );
}
