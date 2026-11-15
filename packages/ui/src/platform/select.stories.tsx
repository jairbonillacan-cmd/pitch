import React, { useState } from "react";
import { asLeagueId, type LeagueId } from "@pitchlab/contracts";
import { MaestroIcon } from "./components/MaestroPrimitives";
import { PlLeagueSelect, PlSelect, type PlSelectOption } from "./components/PlSelect";
import { LeagueBadge } from "../sports";

const SAMPLE_LEAGUES: ReadonlyArray<{ league: LeagueId; label: string }> = [
  { league: asLeagueId("liga-mx"), label: "Liga MX" },
  { league: asLeagueId("nfl"), label: "NFL" },
  { league: asLeagueId("premier-league"), label: "Premier League" },
  { league: asLeagueId("laliga"), label: "LaLiga" },
  { league: asLeagueId("bundesliga"), label: "Bundesliga" },
  { league: asLeagueId("serie-a"), label: "Serie A" },
  { league: asLeagueId("ligue-1"), label: "Ligue 1" },
];

const SORT_OPTIONS: PlSelectOption<"diff" | "picks" | "soon">[] = [
  { value: "diff", label: "Mayor diferencia", description: "Brecha modelo vs. consenso" },
  { value: "picks", label: "Más picks", description: "Mayor participación de socios" },
  { value: "soon", label: "Próximos", description: "Por hora de inicio" },
];

const MATCH_OPTIONS: PlSelectOption[] = [
  {
    value: "mx-ame-caz",
    label: "AME vs CAZ",
    description: "Liga MX · 19:05",
    triggerLabel: "Liga MX · AME vs CAZ (19:05)",
    icon: <LeagueBadge league={asLeagueId("liga-mx")} label="Liga MX" size={18} />,
  },
  {
    value: "epl-ars-che",
    label: "ARS vs CHE",
    description: "Premier League · 11:30",
    triggerLabel: "Premier League · ARS vs CHE (11:30)",
    icon: <LeagueBadge league={asLeagueId("premier-league")} label="Premier League" size={18} />,
  },
  {
    value: "nfl-kc-buf",
    label: "KC vs BUF",
    description: "NFL · 16:25",
    triggerLabel: "NFL · KC vs BUF (16:25)",
    icon: <LeagueBadge league={asLeagueId("nfl")} label="NFL" size={18} />,
  },
];

const CFDI_OPTIONS: PlSelectOption[] = [
  { value: "612", label: "612 — Personas Físicas con Actividades Empresariales" },
  { value: "626", label: "626 — Régimen Simplificado de Confianza (RESICO)" },
  { value: "605", label: "605 — Sueldos y Salarios" },
  { value: "601", label: "601 — General de Ley Personas Morales" },
  { value: "616", label: "616 — Sin obligaciones fiscales" },
];

function SelectShowcase(): React.JSX.Element {
  const [league, setLeague] = useState("all");
  const [sort, setSort] = useState<"diff" | "picks" | "soon">("diff");
  const [matchId, setMatchId] = useState("mx-ame-caz");
  const [regimen, setRegimen] = useState("612");
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("5");
  const [year, setYear] = useState("1996");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <section className="glass-card glass-ring rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="m-0 text-base font-extrabold">Filtros y ordenamiento</h2>
            <p className="m-0 text-xs" style={{ color: "var(--pl-text-secondary)" }}>
              Variantes glass y pill con emblemas oficiales y estados curados.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PlLeagueSelect
              leagues={SAMPLE_LEAGUES}
              value={league}
              onChange={setLeague}
              allLabel="Todas las ligas"
              ariaLabel="Filtrar por liga"
            />
            <PlSelect
              variant="pill"
              size="sm"
              ariaLabel="Ordenar"
              value={sort}
              onChange={setSort}
              options={SORT_OPTIONS}
            />
          </div>
        </div>
      </section>

      <section className="glass-card glass-ring rounded-2xl p-5 space-y-4">
        <h2 className="m-0 text-base font-extrabold">Campos de estudio y cuenta</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PlSelect
            label="Partido de la jornada"
            variant="glass"
            size="lg"
            fullWidth
            popoverWidth="trigger"
            value={matchId}
            onChange={setMatchId}
            options={MATCH_OPTIONS}
          />
          <PlSelect
            label="Régimen fiscal SAT"
            variant="field"
            size="md"
            fullWidth
            popoverWidth="trigger"
            value={regimen}
            onChange={setRegimen}
            options={CFDI_OPTIONS}
          />
        </div>
      </section>

      <section className="glass-card glass-ring rounded-2xl p-5 space-y-4">
        <h2 className="m-0 text-base font-extrabold">Fecha de nacimiento (Auth) y estados</h2>
        <div className="pl-auth-dob max-w-md">
          <PlSelect
            variant="auth"
            size="lg"
            ariaLabel="Día"
            placeholder="Día"
            autoComplete="bday-day"
            popoverWidth="min-trigger"
            triggerClassName="num"
            value={day}
            onChange={setDay}
            options={Array.from({ length: 31 }, (_, i) => ({
              value: String(i + 1),
              label: String(i + 1),
            }))}
          />
          <PlSelect
            variant="auth"
            size="lg"
            ariaLabel="Mes"
            placeholder="Mes"
            autoComplete="bday-month"
            popoverWidth="min-trigger"
            value={month}
            onChange={setMonth}
            options={[
              { value: "1", label: "Enero" },
              { value: "2", label: "Febrero" },
              { value: "3", label: "Marzo" },
              { value: "4", label: "Abril" },
              { value: "5", label: "Mayo" },
              { value: "6", label: "Junio" },
              { value: "7", label: "Julio" },
              { value: "8", label: "Agosto" },
              { value: "9", label: "Septiembre" },
              { value: "10", label: "Octubre" },
              { value: "11", label: "Noviembre" },
              { value: "12", label: "Diciembre" },
            ]}
          />
          <PlSelect
            variant="auth"
            size="lg"
            ariaLabel="Año"
            placeholder="Año"
            autoComplete="bday-year"
            popoverWidth="min-trigger"
            triggerClassName="num"
            value={year}
            onChange={setYear}
            options={Array.from({ length: 60 }, (_, i) => {
              const y = String(2008 - i);
              return { value: y, label: y };
            })}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          <PlSelect
            label="Campo con error"
            variant="field"
            size="md"
            fullWidth
            isInvalid
            value=""
            placeholder="Selecciona un horario"
            onChange={() => {}}
            options={[
              {
                value: "America/Mexico_City",
                label: "Ciudad de México (UTC−6)",
                icon: <MaestroIcon name="calendar" size={14} />,
              },
            ]}
          />
          <PlSelect
            label="Campo deshabilitado"
            variant="field"
            size="md"
            fullWidth
            isDisabled
            value="G03"
            onChange={() => {}}
            options={[{ value: "G03", label: "G03 — Gastos en general" }]}
          />
        </div>
      </section>
    </div>
  );
}

function OpenMenuShowcase(): React.JSX.Element {
  const [league, setLeague] = useState("all");
  return (
    <div className="p-8 min-h-[420px]">
      <PlLeagueSelect
        leagues={SAMPLE_LEAGUES}
        value={league}
        onChange={setLeague}
        allLabel="Todas las ligas"
        ariaLabel="Liga"
        variant="glass"
        size="sm"
        defaultOpen
      />
    </div>
  );
}

export default {
  title: "Platform v4 / Listas desplegables",
};

export const GaleriaOscuro = {
  render: () => <SelectShowcase />,
};

export const GaleriaClaro = {
  ...GaleriaOscuro,
  globals: { theme: "light" },
};

export const GaleriaMovilOscuro = {
  render: () => <SelectShowcase />,
  parameters: { viewport: { defaultViewport: "mobile1" } },
};

export const GaleriaMovilClaro = {
  ...GaleriaMovilOscuro,
  globals: { theme: "light" },
};

export const FiltroLigaOscuro = {
  render: () => <OpenMenuShowcase />,
};

export const FiltroLigaClaro = {
  ...FiltroLigaOscuro,
  globals: { theme: "light" },
};
