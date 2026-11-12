/**
 * Data Access Layer — carga los datasets extraídos del original (scripts/extract-data.mjs)
 * y los mapea a los tipos del dominio. Los datos son una instantánea del "7 nov 2026"
 * tal como los publica la app; su procedencia está citada en docs/07-network-observations.md.
 */
import nflTeams from "./nfl-teams.json";
import nflResults from "./nfl-results.json";
import nflAudit from "./nfl-audit.json";
import nflInjuries from "./nfl-injuries.json";
import nflSchedule from "./nfl-schedule.json";
import nflConstants from "./nfl-constants.json";
import propsPlayers from "./props-players.json";
import propsDefenses from "./props-defenses.json";
import propsPrior from "./props-prior.json";
import money from "./money.json";
import ncaaTeams from "./ncaa-teams.json";
import ncaaResults from "./ncaa-results.json";
import ncaaSchedule from "./ncaa-schedule.json";
import ncaaConstants from "./ncaa-constants.json";
import ncaaAudit from "./ncaa-audit.json";
import teamColors from "./team-colors.json";
import type {
  Game,
  Injury,
  MoneyData,
  NflTeams,
  PlayerRow,
  ResultRow,
} from "../domain/types.js";
import type { NflConstants } from "../domain/engine-nfl.js";
import type { NcaaConstants, NcaaTeams } from "../domain/engine-ncaa.js";
import type { PropsPrior } from "../domain/props.js";

// El runtime original ya mapea N y PJ de arrays literales a objetos (id/t/n/r/i/st/h/d).

export const nfl = {
  teams: nflTeams as NflTeams,
  results: nflResults as ResultRow[],
  audit: nflAudit as ResultRow[],
  injuries: nflInjuries as unknown as Injury[],
  constants: nflConstants as NflConstants,
  schedule: nflSchedule as unknown as [string, Game[]][],
  props: {
    players: propsPlayers as unknown as PlayerRow[],
    defenses: propsDefenses as Record<string, [number, number, number, number]>,
    prior: propsPrior as PropsPrior,
  },
  money: money as MoneyData,
  colors: teamColors as Record<string, [string, string]>,
};

export const DATA_AS_OF = "7 nov 2026"; // fecha citada por la app

export const ncaa = {
  teams: ncaaTeams as NcaaTeams,
  results: ncaaResults as ResultRow[],
  audit: ncaaAudit as ResultRow[],
  schedule: ncaaSchedule as unknown as [string, Game[]][],
  constants: { SHR: 0.85, SDT: 15, SDP: 11, LGP: 28, NEUT: [], ...(ncaaConstants as object) } as unknown as NcaaConstants,
};
