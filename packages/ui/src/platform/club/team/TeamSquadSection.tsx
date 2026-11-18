"use client";

import React, { useMemo } from "react";
import type { LeagueId, PlatformSport } from "@pitchlab/contracts";
import {
  resolveThemedPackSrcSet,
  resolveThemedPackUrl,
  usePackIconBase,
} from "../../../pack-icon-theme";
import { resolveCircularCountryFlag } from "../../country-flags";
import { PersonAvatar } from "./PersonAvatar";
import type { TeamInjuryItem, TeamProfileData, TeamSquadPlayer } from "./types";

export interface TeamSquadSectionProps {
  league: LeagueId;
  sport?: PlatformSport;
  teamSlug: string;
  teamName: string;
  seasonLabel: string;
  squad: NonNullable<TeamProfileData["squad"]>;
  injuries?: readonly TeamInjuryItem[];
  isVisitorRestricted: boolean;
  upgradeHref: string;
  onNavigate: (href: string) => void;
}

interface PositionSectionDef {
  readonly group: TeamSquadPlayer["positionGroup"];
  readonly title: string;
  readonly fallbackCode: string;
  readonly isGoalkeeper: boolean;
}

function positionSectionsForSport(sport: PlatformSport): readonly PositionSectionDef[] {
  if (sport === "basketball") {
    return [
      { group: "MID", title: "Bases y escoltas", fallbackCode: "G", isGoalkeeper: false },
      { group: "FWD", title: "Aleros", fallbackCode: "F", isGoalkeeper: false },
      { group: "DEF", title: "Pívots", fallbackCode: "C", isGoalkeeper: false },
      { group: "GK", title: "Rotación", fallbackCode: "ROT", isGoalkeeper: false },
    ];
  }
  if (sport === "american-football") {
    return [
      { group: "FWD", title: "Ofensiva", fallbackCode: "OFF", isGoalkeeper: false },
      { group: "MID", title: "Línea y receptores", fallbackCode: "OFF", isGoalkeeper: false },
      { group: "DEF", title: "Defensiva", fallbackCode: "DEF", isGoalkeeper: false },
      { group: "GK", title: "Equipos especiales", fallbackCode: "ESP", isGoalkeeper: false },
    ];
  }
  if (sport === "ice-hockey") {
    return [
      { group: "FWD", title: "Delanteros", fallbackCode: "FWD", isGoalkeeper: false },
      { group: "MID", title: "Centros", fallbackCode: "C", isGoalkeeper: false },
      { group: "DEF", title: "Defensas", fallbackCode: "D", isGoalkeeper: false },
      { group: "GK", title: "Porteros", fallbackCode: "G", isGoalkeeper: true },
    ];
  }
  return [
    { group: "FWD", title: "Delanteros", fallbackCode: "DEL", isGoalkeeper: false },
    { group: "MID", title: "Centrocampistas", fallbackCode: "MC", isGoalkeeper: false },
    { group: "DEF", title: "Defensas", fallbackCode: "DF", isGoalkeeper: false },
    { group: "GK", title: "Porteros", fallbackCode: "POR", isGoalkeeper: true },
  ];
}

const LONG_POS_TO_SHORT: Readonly<Record<string, string>> = {
  delantero: "DEL",
  delanteros: "DEL",
  atacante: "DEL",
  mediocampista: "MC",
  mediocampistas: "MC",
  centrocampista: "MC",
  volante: "MC",
  defensa: "DF",
  defensas: "DF",
  defensor: "DF",
  portero: "POR",
  arquero: "POR",
  guardameta: "POR",
};

function normalizePersonKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveTacticalPositionCode(player: TeamSquadPlayer, fallbackCode: string): string {
  const raw = player.positionLabel.trim();
  if (!raw) return fallbackCode;
  const mapped = LONG_POS_TO_SHORT[normalizePersonKey(raw)];
  if (mapped) return mapped;
  if (raw.length <= 8) return raw.toUpperCase();
  return fallbackCode;
}

function resolveNationalityCode3(
  nationality: string | null,
  nationalityCode: string | null,
): string | null {
  const cleanCode = nationalityCode?.trim().toUpperCase();
  if (cleanCode) return cleanCode;
  const cleanNat = nationality?.trim();
  if (!cleanNat) return null;
  const stripped = cleanNat
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return stripped.length >= 3 ? stripped.slice(0, 3) : stripped || null;
}

function formatBirthDateSlash(iso?: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  return `${Number(m[3])}/${Number(m[2])}/${m[1]}`;
}

function findPlayerInjury(
  player: TeamSquadPlayer,
  injuries: readonly TeamInjuryItem[],
): { status: string; detail: string | null } | null {
  if (
    player.availability === "injured" ||
    player.availability === "doubtful" ||
    player.availability === "suspended"
  ) {
    return {
      status:
        player.availability === "suspended"
          ? "Suspendido"
          : player.availability === "doubtful"
            ? "En duda"
            : "Lesionado",
      detail: player.injuryDetail ?? null,
    };
  }
  if (injuries.length === 0) return null;
  const fullKey = normalizePersonKey(player.name);
  const shortKey = normalizePersonKey(player.shortName);
  const lastToken = fullKey.split(" ").pop() ?? "";

  for (const inj of injuries) {
    const injKey = normalizePersonKey(inj.player);
    if (!injKey) continue;
    if (injKey === fullKey || (shortKey && injKey === shortKey)) {
      return { status: inj.status || "Lesionado", detail: inj.detail };
    }
    if (lastToken.length >= 4 && (injKey.endsWith(` ${lastToken}`) || injKey === lastToken)) {
      return { status: inj.status || "Lesionado", detail: inj.detail };
    }
  }
  return null;
}

function MedicalCrossIcon(): React.JSX.Element {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
      className="pl-sq-injury-icon"
    >
      <path d="M4.6 1.5h2.8v3.1h3.1v2.8H7.4v3.1H4.6V7.4H1.5V4.6h3.1V1.5Z" fill="currentColor" />
    </svg>
  );
}

export function TeamSquadSection({
  league,
  sport = "football",
  teamSlug,
  teamName,
  squad,
  injuries = [],
  onNavigate,
}: TeamSquadSectionProps): React.JSX.Element {
  const iconBase = usePackIconBase();

  const hasSeasonStats = useMemo(
    () =>
      sport === "football" &&
      squad.players.some(
        (p) =>
          p.stats.appearances > 0 ||
          p.stats.goals > 0 ||
          p.stats.assists > 0 ||
          p.stats.shots > 0 ||
          p.stats.saves > 0,
      ),
    [sport, squad.players],
  );

  const hasBirthDates = useMemo(
    () => squad.players.some((p) => Boolean(p.birthDate)),
    [squad.players],
  );

  const groupedSections = useMemo(() => {
    const defs = positionSectionsForSport(sport);
    return defs
      .map((sec) => ({
        ...sec,
        players: squad.players.filter((p) => p.positionGroup === sec.group),
      }))
      .filter((sec) => sec.players.length > 0);
  }, [sport, squad.players]);

  const navigateOnPlainClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    onNavigate(href);
  };

  if (groupedSections.length === 0) {
    return (
      <div className="pl-sq-empty">
        No hay jugadores registrados en la plantilla para el corte actual.
      </div>
    );
  }

  const trailingColCount =
    3 + (hasBirthDates ? 1 : 0) + (hasSeasonStats ? 3 : 1);

  return (
    <section
      className="pl-sq-sheet"
      aria-label={`Plantilla de ${teamName}`}
      data-team-squad-sheet=""
      data-team-squad-section=""
    >
      <div
        tabIndex={0}
        role="region"
        aria-label={`Jugadores de ${teamName}`}
        className="pl-sq-region"
      >
        <table className="pl-sq-table">
          <colgroup>
            <col className="pl-sq-col-player" />
            <col className="pl-sq-col-nat" />
            <col className="pl-sq-col-height" />
            {hasBirthDates ? <col className="pl-sq-col-dob" /> : null}
            <col className="pl-sq-col-age" />
            {hasSeasonStats ? (
              <>
                <col className="pl-sq-col-pj" />
                <col className="pl-sq-col-stat1" />
                <col className="pl-sq-col-stat2" />
              </>
            ) : (
              <col className="pl-sq-col-weight" />
            )}
          </colgroup>

          {groupedSections.map((sec, sectionIdx) => {
            const isFirstSection = sectionIdx === 0;
            const showStatOverrideHeaders =
              hasSeasonStats && !isFirstSection && sec.isGoalkeeper;

            return (
              <tbody key={sec.group} className="pl-sq-group" data-squad-group={sec.group}>
                <tr className={`pl-sq-group-row ${isFirstSection ? "is-first" : ""}`.trim()}>
                  <th scope="colgroup" className="pl-sq-group-title">
                    {sec.title}
                  </th>
                  {isFirstSection ? (
                    <>
                      <th scope="col" className="pl-sq-colhead">
                        Nacionalidad
                      </th>
                      <th scope="col" className="pl-sq-colhead">
                        Altura
                      </th>
                      {hasBirthDates ? (
                        <th scope="col" className="pl-sq-colhead">
                          Fecha de nacim.
                        </th>
                      ) : null}
                      <th scope="col" className="pl-sq-colhead">
                        Edad
                      </th>
                      {hasSeasonStats ? (
                        <>
                          <th scope="col" className="pl-sq-colhead is-num">
                            PJ
                          </th>
                          <th scope="col" className="pl-sq-colhead is-num">
                            {sec.isGoalkeeper ? "Atajadas" : "G / A"}
                          </th>
                          <th scope="col" className="pl-sq-colhead is-num">
                            {sec.isGoalkeeper ? "Recibidos" : "Tiros (TaP)"}
                          </th>
                        </>
                      ) : (
                        <th scope="col" className="pl-sq-colhead is-num">
                          Peso
                        </th>
                      )}
                    </>
                  ) : showStatOverrideHeaders ? (
                    <>
                      <td
                        colSpan={3 + (hasBirthDates ? 1 : 0) + 1}
                        aria-hidden="true"
                        className="pl-sq-colhead-spacer"
                      />
                      <th scope="col" className="pl-sq-colhead is-num">
                        Atajadas
                      </th>
                      <th scope="col" className="pl-sq-colhead is-num">
                        Recibidos
                      </th>
                    </>
                  ) : (
                    <td
                      colSpan={trailingColCount}
                      aria-hidden="true"
                      className="pl-sq-colhead-spacer"
                    />
                  )}
                </tr>

                {sec.players.map((player) => {
                  const href = `/app/${league}/teams/${teamSlug}/players/${player.slug}`;
                  const posCode = resolveTacticalPositionCode(player, sec.fallbackCode);
                  const natCode = resolveNationalityCode3(
                    player.nationality,
                    player.nationalityCode,
                  );
                  const natFlag = resolveCircularCountryFlag(
                    player.nationality,
                    player.nationalityCode,
                  );
                  const injury = findPlayerInjury(player, injuries);
                  const dobLabel = formatBirthDateSlash(player.birthDate);
                  const stat1Label = sec.isGoalkeeper ? "Atajadas" : "G / A";
                  const stat2Label = sec.isGoalkeeper ? "Recibidos" : "Tiros (TaP)";

                  return (
                    <tr key={player.id} className="pl-sq-row">
                      <th scope="row" className="pl-sq-player-cell">
                        <div className="pl-sq-player-main">
                          <span
                            className="pl-sq-jersey num"
                            title={player.jersey ? `Dorsal ${player.jersey}` : "Sin dorsal"}
                          >
                            {player.jersey || "–"}
                          </span>

                          <PersonAvatar
                            photoKey={player.photoKey}
                            fallbackPhotoKey={player.fallbackPhotoKey}
                            role="player"
                            size={40}
                            className="pl-sq-avatar"
                          />

                          <div className="pl-sq-identity">
                            <a
                              href={href}
                              onClick={(e) => navigateOnPlainClick(e, href)}
                              className="pl-team-link pl-sq-name"
                            >
                              {player.name}
                            </a>
                            <span className="pl-sq-pos">{posCode}</span>
                            {injury ? (
                              <span className="pl-sq-injury">
                                <MedicalCrossIcon />
                                <strong className="pl-sq-injury-status">{injury.status}</strong>
                                {injury.detail ? (
                                  <span className="pl-sq-injury-detail">{injury.detail}</span>
                                ) : null}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </th>

                      <td data-label="Nacionalidad" className="pl-sq-cell pl-sq-nat-cell">
                        {natCode ? (
                          <span className="pl-sq-nat">
                            {natFlag ? (
                              <img
                                src={resolveThemedPackUrl(natFlag.src, iconBase)}
                                srcSet={resolveThemedPackSrcSet(natFlag.srcSet, iconBase)}
                                alt=""
                                aria-hidden="true"
                                width={18}
                                height={18}
                                loading="lazy"
                                decoding="async"
                                draggable={false}
                                className="pl-sq-flag"
                              />
                            ) : null}
                            <span>{natCode}</span>
                          </span>
                        ) : (
                          <span className="pl-sq-muted">—</span>
                        )}
                      </td>

                      <td data-label="Altura" className="pl-sq-cell num">
                        {player.heightCm ? `${player.heightCm} cm` : "—"}
                      </td>

                      {hasBirthDates ? (
                        <td data-label="Nacimiento" className="pl-sq-cell num">
                          {dobLabel ?? "—"}
                        </td>
                      ) : null}

                      <td data-label="Edad" className="pl-sq-cell num">
                        {player.age != null ? `${player.age} años` : "—"}
                      </td>

                      {hasSeasonStats ? (
                        <>
                          <td data-label="PJ" className="pl-sq-cell is-num num pl-sq-strong">
                            {player.stats.appearances}
                          </td>

                          <td data-label={stat1Label} className="pl-sq-cell is-num num">
                            {sec.isGoalkeeper
                              ? player.stats.saves
                              : `${player.stats.goals} / ${player.stats.assists}`}
                          </td>

                          <td data-label={stat2Label} className="pl-sq-cell is-num num">
                            {sec.isGoalkeeper
                              ? player.stats.goalsConceded
                              : `${player.stats.shots} (${player.stats.shotsOnTarget})`}
                          </td>
                        </>
                      ) : (
                        <td data-label="Peso" className="pl-sq-cell is-num num">
                          {player.weightKg ? `${player.weightKg} kg` : "—"}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
    </section>
  );
}
