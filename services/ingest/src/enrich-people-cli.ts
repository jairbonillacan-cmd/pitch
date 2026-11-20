/**
 * Enriquecimiento integral de jugadores y entrenadores con datos reales y retratos
 * combinando las APIs activas del monorepo (Bzzoiro Sports Data, Football-Data.org v4 y ESPN).
 *
 * Genera / actualiza `data/snapshots/<league>/squads.json` para:
 * - Ligas de clubes de fútbol (Liga MX, Premier League, LaLiga, Bundesliga, Serie A, Ligue 1)
 * - Selecciones nacionales (Copa del Mundo, UEFA/Concacaf Nations, Euro, Copa América, Oro, Africana, Asiática)
 * - Deportes de EE. UU. (NBA, NFL, NHL)
 */
import fs from "node:fs";
import path from "node:path";
import {
  LeagueIdSchema,
  LeagueSnapshotSchema,
  LeagueSquadsFileSchema,
  asTeamId,
  computePlayerApplicablePicks,
  findNationalTeamDef,
  slugifyPlayerName,
  type LeagueSquadsFile,
  type PlayerPositionGroup,
  type PlayerRecentGameLog,
  type PlayerSeasonMetric,
  type SquadCoachProfile,
  type SquadPlayerEntry,
  type SquadPlayerStats,
  type TeamSquadEntry,
} from "@pitchlab/contracts";
import { BZZOIRO_LEAGUE_IDS, BZZOIRO_TEAM_IDS } from "@pitchlab/sports-assets";

const ROOT_DIR = path.resolve(import.meta.dirname, "..", "..", "..");
const SNAPSHOTS_ROOT = path.resolve(ROOT_DIR, "data", "snapshots");

for (const envFile of [".env", ".env.local", ".env.9990.local"]) {
  const full = path.join(ROOT_DIR, envFile);
  if (!fs.existsSync(full)) continue;
  for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]!]) {
      process.env[m[1]!] = m[2]!.trim().replace(/^['"]|['"]$/g, "");
    }
  }
}

const FORBIDDEN_FD16_RE =
  /\b(understat|clubelo|fbref|nflverse|openfootball|transfermarkt|bzzoiro|rotowire|moneypuck|basketball-reference|sofascore|fotmob|api-football|polymarket|kalshi|pinnacle|caliente|poisson|dixon-coles|lightgbm|pitagoras|pitágoras|log5|elo)\b/i;

const COUNTRY_NAME_ES: Readonly<Record<string, string>> = {
  England: "Inglaterra",
  Scotland: "Escocia",
  Wales: "Gales",
  "Northern Ireland": "Irlanda del Norte",
  Ireland: "Irlanda",
  "Republic of Ireland": "Irlanda",
  Spain: "España",
  France: "Francia",
  Germany: "Alemania",
  Italy: "Italia",
  Portugal: "Portugal",
  Netherlands: "Países Bajos",
  Belgium: "Bélgica",
  Switzerland: "Suiza",
  Austria: "Austria",
  Croatia: "Croacia",
  Serbia: "Serbia",
  Denmark: "Dinamarca",
  Norway: "Noruega",
  Sweden: "Suecia",
  Finland: "Finlandia",
  Poland: "Polonia",
  Czechia: "Chequia",
  "Czech Republic": "Chequia",
  Slovakia: "Eslovaquia",
  Hungary: "Hungría",
  Romania: "Rumania",
  Greece: "Grecia",
  Turkey: "Turquía",
  Türkiye: "Turquía",
  Ukraine: "Ucrania",
  Russia: "Rusia",
  Georgia: "Georgia",
  Slovenia: "Eslovenia",
  "Bosnia and Herzegovina": "Bosnia",
  Albania: "Albania",
  Kosovo: "Kosovo",
  Montenegro: "Montenegro",
  "North Macedonia": "Macedonia del Norte",
  Iceland: "Islandia",
  Mexico: "México",
  "United States": "Estados Unidos",
  USA: "Estados Unidos",
  Canada: "Canadá",
  "Costa Rica": "Costa Rica",
  Panama: "Panamá",
  Honduras: "Honduras",
  Jamaica: "Jamaica",
  Guatemala: "Guatemala",
  "El Salvador": "El Salvador",
  Argentina: "Argentina",
  Brazil: "Brasil",
  Uruguay: "Uruguay",
  Colombia: "Colombia",
  Chile: "Chile",
  Ecuador: "Ecuador",
  Peru: "Perú",
  Paraguay: "Paraguay",
  Venezuela: "Venezuela",
  Bolivia: "Bolivia",
  Morocco: "Marruecos",
  Senegal: "Senegal",
  Nigeria: "Nigeria",
  Egypt: "Egipto",
  Algeria: "Argelia",
  Tunisia: "Túnez",
  Cameroon: "Camerún",
  Ghana: "Ghana",
  "Ivory Coast": "Costa de Marfil",
  "Côte d'Ivoire": "Costa de Marfil",
  Mali: "Malí",
  Guinea: "Guinea",
  Japan: "Japón",
  "South Korea": "Corea del Sur",
  "Korea Republic": "Corea del Sur",
  Australia: "Australia",
  Iran: "Irán",
  "Saudi Arabia": "Arabia Saudita",
  Qatar: "Catar",
  Uzbekistan: "Uzbekistán",
  "New Zealand": "Nueva Zelanda",
};

const COUNTRY_CODE3: Readonly<Record<string, string>> = {
  Inglaterra: "ENG",
  Escocia: "SCO",
  Gales: "WAL",
  Irlanda: "IRL",
  España: "ESP",
  Francia: "FRA",
  Alemania: "GER",
  Italia: "ITA",
  Portugal: "POR",
  "Países Bajos": "NED",
  Bélgica: "BEL",
  Suiza: "SUI",
  Austria: "AUT",
  Croacia: "CRO",
  Serbia: "SRB",
  Dinamarca: "DEN",
  Noruega: "NOR",
  Suecia: "SWE",
  Finlandia: "FIN",
  Polonia: "POL",
  Chequia: "CZE",
  Eslovaquia: "SVK",
  Hungría: "HUN",
  Rumania: "ROU",
  Grecia: "GRE",
  Turquía: "TUR",
  Ucrania: "UKR",
  Rusia: "RUS",
  Eslovenia: "SVN",
  México: "MEX",
  "Estados Unidos": "USA",
  Canadá: "CAN",
  "Costa Rica": "CRC",
  Panamá: "PAN",
  Honduras: "HON",
  Jamaica: "JAM",
  Argentina: "ARG",
  Brasil: "BRA",
  Uruguay: "URU",
  Colombia: "COL",
  Chile: "CHI",
  Ecuador: "ECU",
  Perú: "PER",
  Paraguay: "PAR",
  Venezuela: "VEN",
  Marruecos: "MAR",
  Senegal: "SEN",
  Nigeria: "NGA",
  Egipto: "EGY",
  Argelia: "ALG",
  Túnez: "TUN",
  Camerún: "CMR",
  Ghana: "GHA",
  "Costa de Marfil": "CIV",
  Japón: "JPN",
  "Corea del Sur": "KOR",
  Australia: "AUS",
};

function translateCountryEs(raw?: string | null): string | null {
  const clean = raw?.trim();
  if (!clean) return null;
  if (COUNTRY_NAME_ES[clean]) return COUNTRY_NAME_ES[clean]!;
  const nat = findNationalTeamDef(clean);
  return nat?.nameEs ?? clean;
}

function resolveIso3(countryEs: string | null, rawCode?: string | null): string | null {
  const code = rawCode?.trim().toUpperCase();
  if (code && code.length >= 2 && code.length <= 3) {
    if (code === "DE") return "GER";
    if (code === "ES") return "ESP";
    if (code === "FR") return "FRA";
    if (code === "IT") return "ITA";
    if (code === "GB" || code === "EN") return "ENG";
    if (code === "NL") return "NED";
    if (code === "PT") return "POR";
    if (code === "MX") return "MEX";
    if (code === "US") return "USA";
    if (code === "CA") return "CAN";
    if (code === "BR") return "BRA";
    if (code === "AR") return "ARG";
    if (code === "CO") return "COL";
    if (code === "UY") return "URU";
    if (code === "CL") return "CHI";
    if (code.length === 3) return code;
  }
  if (countryEs && COUNTRY_CODE3[countryEs]) return COUNTRY_CODE3[countryEs]!;
  if (!countryEs) return null;
  const ascii = countryEs
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return ascii.length >= 3 ? ascii.slice(0, 3) : null;
}

function translateInjuryDetailEs(raw?: string | null): string | null {
  const clean = raw?.trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();
  if (lower.includes("hamstring")) return "Isquiotibiales";
  if (lower.includes("knee") || lower.includes("acl") || lower.includes("cruciate")) return "Rodilla";
  if (lower.includes("ankle")) return "Tobillo";
  if (lower.includes("thigh") || lower.includes("groin") || lower.includes("adductor")) return "Muslo";
  if (lower.includes("calf") || lower.includes("achilles")) return "Gemelo / Aquiles";
  if (lower.includes("foot") || lower.includes("toe") || lower.includes("metatarsal")) return "Pie";
  if (lower.includes("back") || lower.includes("spine")) return "Espalda";
  if (lower.includes("shoulder") || lower.includes("collarbone")) return "Hombro";
  if (lower.includes("hip") || lower.includes("pelvis")) return "Cadera";
  if (lower.includes("head") || lower.includes("concussion")) return "Conmoción";
  if (lower.includes("appendicitis")) return "Apendicitis";
  if (lower.includes("illness") || lower.includes("virus")) return "Enfermedad";
  if (lower.includes("strain") || lower.includes("muscle") || lower.includes("muscular")) return "Lesión muscular";
  if (lower.includes("knock") || lower.includes("bruise") || lower.includes("contusion")) return "Golpe";
  if (lower.includes("fracture") || lower.includes("broken")) return "Fractura";
  if (FORBIDDEN_FD16_RE.test(clean)) return "Parte médico";
  return clean;
}

function translateManagerStyleEs(profile?: string | null, teamStyle?: string | null): string | null {
  const parts: string[] = [];
  const p = (profile ?? "").trim().toLowerCase();
  const s = (teamStyle ?? "").trim().toLowerCase();
  if (p === "attacking") parts.push("Ofensivo");
  else if (p === "defensive") parts.push("Sólido atrás");
  else if (p === "balanced") parts.push("Equilibrado");

  if (s === "possession") parts.push("Posesión");
  else if (s === "counter" || s === "direct") parts.push("Transición rápida");
  else if (s === "high_press" || s === "pressing") parts.push("Presión alta");
  return parts.length > 0 ? parts.join(" · ") : null;
}

function normalizeNameKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function computeAgeFromIso(dob?: string | null): number | null {
  if (!dob) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob.trim());
  if (!m) return null;
  const ref = new Date("2026-11-18T12:00:00Z");
  let age = ref.getUTCFullYear() - Number(m[1]);
  const monthDiff = ref.getUTCMonth() + 1 - Number(m[2]);
  if (monthDiff < 0 || (monthDiff === 0 && ref.getUTCDate() < Number(m[3]))) {
    age -= 1;
  }
  return age >= 15 && age <= 55 ? age : null;
}

function emptyStats(): SquadPlayerStats {
  return {
    appearances: 0,
    subIns: 0,
    goals: 0,
    assists: 0,
    shots: 0,
    shotsOnTarget: 0,
    foulsCommitted: 0,
    foulsSuffered: 0,
    yellowCards: 0,
    redCards: 0,
    offsides: 0,
    saves: 0,
    shotsFaced: 0,
    goalsConceded: 0,
  };
}

function mapSoccerPosGroup(pos?: string | null, specific?: string | null): {
  group: PlayerPositionGroup;
  label: string;
} {
  const p = (pos ?? "").trim().toUpperCase();
  const sp = (specific ?? "").trim().toUpperCase();
  if (p === "G" || sp === "GK") return { group: "GK", label: sp || "GK" };
  if (p === "D" || ["CB", "LB", "RB", "LWB", "RWB", "DF", "DC", "DL", "DR"].includes(sp)) {
    return { group: "DEF", label: sp || "DF" };
  }
  if (p === "F" || ["ST", "CF", "LW", "RW", "SS", "FW"].includes(sp)) {
    return { group: "FWD", label: sp || "ST" };
  }
  return { group: "MID", label: sp || "MC" };
}

async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let idx = 0;
  const runners = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (idx < items.length) {
      const cur = idx++;
      await worker(items[cur]!);
    }
  });
  await Promise.all(runners);
}

async function fetchJsonSafe<T>(url: string, headers?: Record<string, string>): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...(headers ?? {}) },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface BzPlayerRaw {
  id: number;
  name: string;
  short_name?: string | null;
  position?: string | null;
  specific_position?: string | null;
  jersey_number?: number | null;
  date_of_birth?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  preferred_foot?: string | null;
  nationality?: string | null;
  national_team_id?: number | null;
  national_team?: { id: number; name: string; short_name?: string } | null;
  availability?: string | null;
  injury_type?: string | null;
  injury_expected_return?: string | null;
}

interface BzManagerRaw {
  id: number;
  name: string;
  short_name?: string | null;
  country?: string | null;
  preferred_formation?: string | null;
  profile?: string | null;
  team_style?: string | null;
  matches_total?: number | null;
  wins?: number | null;
  draws?: number | null;
  losses?: number | null;
  win_pct?: number | null;
}

function saveValidatedSquadsFile(league: string, payload: LeagueSquadsFile): void {
  const validated = LeagueSquadsFileSchema.parse(payload);
  const serialized = JSON.stringify(validated, null, 2);
  if (FORBIDDEN_FD16_RE.test(serialized)) {
    throw new Error(`El archivo squads.json de ${league} contiene un término restringido FD-16.`);
  }
  const dir = path.join(SNAPSHOTS_ROOT, league);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, "squads.json");
  const tmp = path.join(dir, `squads.json.tmp.${process.pid}`);
  fs.writeFileSync(tmp, serialized + "\n", "utf8");
  fs.renameSync(tmp, dest);
}

async function enrichClubAndNationalSoccer(): Promise<void> {
  const bzKey = process.env.BZZOIRO_API_KEY?.trim();
  const fdKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  const bzHeaders = bzKey ? { Authorization: `Token ${bzKey}` } : undefined;

  // 1) Football-Data.org v4 coaches (5 llamadas totales: PL, BL1, PD, SA, FL1)
  const fdCoachByTeamKey = new Map<string, { name: string; birthDate: string | null; nationality: string | null }>();
  if (fdKey) {
    const fdComps = ["PL", "BL1", "PD", "SA", "FL1"];
    await runPool(fdComps, 3, async (code) => {
      const data = await fetchJsonSafe<{
        teams?: Array<{
          name?: string;
          shortName?: string;
          coach?: { name?: string | null; dateOfBirth?: string | null; nationality?: string | null };
        }>;
      }>(`https://api.football-data.org/v4/competitions/${code}/teams`, {
        "X-Auth-Token": fdKey,
      });
      for (const t of data?.teams ?? []) {
        if (!t.coach?.name) continue;
        const info = {
          name: t.coach.name.trim(),
          birthDate: t.coach.dateOfBirth?.slice(0, 10) ?? null,
          nationality: translateCountryEs(t.coach.nationality),
        };
        if (t.name) fdCoachByTeamKey.set(normalizeNameKey(t.name), info);
        if (t.shortName) fdCoachByTeamKey.set(normalizeNameKey(t.shortName), info);
      }
    });
    console.log(`[enrich] Football-Data coaches indexados: ${fdCoachByTeamKey.size}`);
  }

  const clubLeagues = [
    "liga-mx",
    "premier-league",
    "laliga",
    "bundesliga",
    "serie-a",
    "ligue-1",
  ] as const;

  const coachIdByBzTeam = new Map<number, number>();
  const bzManagerCache = new Map<number, BzManagerRaw | null>();
  const bzTeamCoachName = new Map<number, string>();
  const bzPlayersByTeam = new Map<number, BzPlayerRaw[]>();
  const bzAggregatedStatsByPlayerId = new Map<number, SquadPlayerStats>();
  const globalBzPlayerByName = new Map<string, BzPlayerRaw>();
  const discoveredNationalTeamIdBySlug = new Map<string, number>();

  const collectSnapshotTeams = (
    lg: string,
  ): Array<{ id: string; slug: string; name: string }> => {
    const snapPath = path.join(SNAPSHOTS_ROOT, lg, "latest.json");
    if (!fs.existsSync(snapPath)) return [];
    const parsed = LeagueSnapshotSchema.safeParse(
      JSON.parse(fs.readFileSync(snapPath, "utf8")),
    );
    if (!parsed.success) return [];
    const map = new Map<string, { id: string; slug: string; name: string }>();
    const reg = (id: string, name: string) => {
      const slug = id.includes(".") ? id.split(".").slice(1).join(".") : id;
      if (slug && !map.has(slug)) map.set(slug, { id, slug, name });
    };
    for (const r of parsed.data.standings ?? []) reg(r.teamId, r.name);
    for (const g of parsed.data.games) {
      reg(g.home.id, g.home.name);
      reg(g.away.id, g.away.name);
    }
    for (const r of Object.values(parsed.data.teamRates)) reg(r.teamId, r.name);
    return [...map.values()];
  };

  // Cargar y sembrar clubes faltantes desde latest.json antes de consultar Bzzoiro
  const clubSquadByLeague = new Map<(typeof clubLeagues)[number], LeagueSquadsFile>();
  const seededBzTeamIds = new Set<number>();
  const nowIso = new Date().toISOString();

  for (const lg of clubLeagues) {
    const sqPath = path.join(SNAPSHOTS_ROOT, lg, "squads.json");
    if (!fs.existsSync(sqPath)) continue;
    const sq = JSON.parse(fs.readFileSync(sqPath, "utf8")) as LeagueSquadsFile;
    const existingSlugs = new Set(sq.teams.map((t) => t.teamSlug));
    for (const st of collectSnapshotTeams(lg)) {
      if (!existingSlugs.has(st.slug)) {
        sq.teams.push({
          teamId: asTeamId(`${lg}.${st.slug}`),
          teamSlug: st.slug,
          teamName: st.name,
          coachName: null,
          updatedAt: nowIso,
          players: [],
        });
        existingSlugs.add(st.slug);
      }
    }
    for (const t of sq.teams) {
      const totalApps = t.players.reduce((acc, p) => acc + p.stats.appearances, 0);
      if (totalApps === 0) {
        const key1 = `${lg}.${t.teamSlug}`;
        const key2 = lg === "laliga" ? `la-liga.${t.teamSlug}` : key1;
        const bzId = BZZOIRO_TEAM_IDS[key1] ?? BZZOIRO_TEAM_IDS[key2];
        if (bzId) seededBzTeamIds.add(bzId);
      }
    }
    clubSquadByLeague.set(lg, sq);
  }

  if (bzHeaders) {
    // 2) Obtener coach_id activo por equipo desde eventos recientes de cada liga (6 llamadas)
    await runPool(clubLeagues, 6, async (lg) => {
      const lid = BZZOIRO_LEAGUE_IDS[lg];
      if (!lid) return;
      const page = await fetchJsonSafe<{
        results?: Array<{
          home_team_id: number;
          away_team_id: number;
          home_coach_id?: number | null;
          away_coach_id?: number | null;
        }>;
      }>(`https://sports.bzzoiro.com/api/v2/events/?league=${lid}&limit=80`, bzHeaders);
      for (const ev of page?.results ?? []) {
        if (ev.home_team_id && ev.home_coach_id && !coachIdByBzTeam.has(ev.home_team_id)) {
          coachIdByBzTeam.set(ev.home_team_id, ev.home_coach_id);
        }
        if (ev.away_team_id && ev.away_coach_id && !coachIdByBzTeam.has(ev.away_team_id)) {
          coachIdByBzTeam.set(ev.away_team_id, ev.away_coach_id);
        }
      }
    });

    // Recolectar todos los bzTeamId activos de nuestras 6 ligas (incluidos los recién sembrados)
    const targetBzTeamIds = new Set<number>();
    for (const [lg, sq] of clubSquadByLeague.entries()) {
      for (const t of sq.teams) {
        const key1 = `${lg}.${t.teamSlug}`;
        const key2 = lg === "laliga" ? `la-liga.${t.teamSlug}` : key1;
        const bzId = BZZOIRO_TEAM_IDS[key1] ?? BZZOIRO_TEAM_IDS[key2];
        if (bzId) targetBzTeamIds.add(bzId);
      }
    }

    // Si algún equipo aún no tiene coach_id en los primeros 80 eventos, pedir eventos directos del equipo
    const missingCoachTeams = [...targetBzTeamIds].filter((id) => !coachIdByBzTeam.has(id));
    await runPool(missingCoachTeams, 8, async (tid) => {
      const page = await fetchJsonSafe<{
        results?: Array<{
          home_team_id: number;
          away_team_id: number;
          home_coach_id?: number | null;
          away_coach_id?: number | null;
        }>;
      }>(`https://sports.bzzoiro.com/api/v2/events/?team_id=${tid}&limit=5`, bzHeaders);
      for (const ev of page?.results ?? []) {
        const cid = ev.home_team_id === tid ? ev.home_coach_id : ev.away_coach_id;
        if (cid) {
          coachIdByBzTeam.set(tid, cid);
          break;
        }
      }
    });

    // 3) Descargar ficha de equipo (/api/teams/{id}/) + plantilla (/api/v2/players/?team_id={id}&limit=100)
    await runPool([...targetBzTeamIds], 8, async (tid) => {
      const [teamInfo, playersPage] = await Promise.all([
        fetchJsonSafe<{ coach?: { name?: string | null } }>(
          `https://sports.bzzoiro.com/api/teams/${tid}/`,
          bzHeaders,
        ),
        fetchJsonSafe<{ results?: BzPlayerRaw[] }>(
          `https://sports.bzzoiro.com/api/v2/players/?team_id=${tid}&limit=100`,
          bzHeaders,
        ),
      ]);
      if (teamInfo?.coach?.name?.trim()) {
        bzTeamCoachName.set(tid, teamInfo.coach.name.trim());
      }
      const list = playersPage?.results ?? [];
      bzPlayersByTeam.set(tid, list);
      for (const p of list) {
        globalBzPlayerByName.set(normalizeNameKey(p.name), p);
        if (p.short_name) globalBzPlayerByName.set(normalizeNameKey(p.short_name), p);
        if (p.national_team_id && p.national_team?.name) {
          const natDef = findNationalTeamDef(p.national_team.name);
          if (natDef && !discoveredNationalTeamIdBySlug.has(natDef.slug)) {
            discoveredNationalTeamIdBySlug.set(natDef.slug, p.national_team_id);
          }
        }
      }
    });

    // 3b) Agregar estadísticas reales de temporada para clubes recién sembrados sin conteo previo
    if (seededBzTeamIds.size > 0) {
      await runPool([...seededBzTeamIds], 8, async (tid) => {
        const statsPage = await fetchJsonSafe<{
          results?: Array<{
            player?: { id?: number };
            minutes_played?: number | null;
            goals?: number | null;
            goal_assist?: number | null;
            total_shots?: number | null;
            shots_on_target?: number | null;
            fouls?: number | null;
            was_fouled?: number | null;
            yellow_card?: number | null;
            red_card?: number | null;
            saves?: number | null;
            goals_conceded?: number | null;
          }>;
        }>(`https://sports.bzzoiro.com/api/player-stats/?team=${tid}&limit=450`, bzHeaders);
        for (const row of statsPage?.results ?? []) {
          const pid = row.player?.id;
          const mins = row.minutes_played ?? 0;
          if (!pid || mins <= 0) continue;
          const cur = bzAggregatedStatsByPlayerId.get(pid) ?? emptyStats();
          cur.appearances += 1;
          if (mins < 46) cur.subIns += 1;
          cur.goals += Math.max(0, row.goals ?? 0);
          cur.assists += Math.max(0, row.goal_assist ?? 0);
          cur.shots += Math.max(0, row.total_shots ?? 0);
          cur.shotsOnTarget += Math.max(0, row.shots_on_target ?? 0);
          cur.foulsCommitted += Math.max(0, row.fouls ?? 0);
          cur.foulsSuffered += Math.max(0, row.was_fouled ?? 0);
          cur.yellowCards += Math.max(0, row.yellow_card ?? 0);
          cur.redCards += Math.max(0, row.red_card ?? 0);
          const sv = Math.max(0, row.saves ?? 0);
          const gc = Math.max(0, row.goals_conceded ?? 0);
          cur.saves += sv;
          cur.goalsConceded += gc;
          cur.shotsFaced += sv + gc;
          bzAggregatedStatsByPlayerId.set(pid, cur);
        }
      });
    }

    // 4) Descargar perfiles de entrenadores únicos (/api/managers/{coachId}/)
    const uniqueCoachIds = [...new Set(coachIdByBzTeam.values())];
    await runPool(uniqueCoachIds, 8, async (cid) => {
      const mgr = await fetchJsonSafe<BzManagerRaw>(
        `https://sports.bzzoiro.com/api/managers/${cid}/`,
        bzHeaders,
      );
      bzManagerCache.set(cid, mgr);
    });

    console.log(
      `[enrich] Clubes fútbol enriquecidos: ${bzPlayersByTeam.size} equipos · ${uniqueCoachIds.length} entrenadores · ${globalBzPlayerByName.size} llaves de jugadores`,
    );
  }

  // 5) Actualizar squads.json de las 6 ligas de clubes
  for (const [lg, sq] of clubSquadByLeague.entries()) {

    const updatedTeams: TeamSquadEntry[] = sq.teams.map((team) => {
      const key1 = `${lg}.${team.teamSlug}`;
      const key2 = lg === "laliga" ? `la-liga.${team.teamSlug}` : key1;
      const bzTeamId = BZZOIRO_TEAM_IDS[key1] ?? BZZOIRO_TEAM_IDS[key2] ?? null;
      const bzList = bzTeamId ? (bzPlayersByTeam.get(bzTeamId) ?? []) : [];

      const byNorm = new Map<string, BzPlayerRaw>();
      const byJersey = new Map<string, BzPlayerRaw>();
      for (const bp of bzList) {
        byNorm.set(normalizeNameKey(bp.name), bp);
        if (bp.short_name) byNorm.set(normalizeNameKey(bp.short_name), bp);
        if (bp.jersey_number != null) byJersey.set(String(bp.jersey_number), bp);
      }

      const matchedBzIds = new Set<number>();

      const enrichedPlayers: SquadPlayerEntry[] = team.players.map((p) => {
        const normFull = normalizeNameKey(p.name);
        const normShort = normalizeNameKey(p.shortName);
        const lastTok = normFull.split(" ").pop() ?? "";
        let bp =
          byNorm.get(normFull) ??
          byNorm.get(normShort) ??
          (p.jersey ? byJersey.get(p.jersey) : undefined);

        if (!bp && lastTok.length >= 4) {
          bp = bzList.find((cand) => normalizeNameKey(cand.name).endsWith(` ${lastTok}`));
        }
        if (bp) matchedBzIds.add(bp.id);

        const espnHeadshot = /^\d{3,10}$/.test(p.id)
          ? `https://a.espncdn.com/i/headshots/soccer/players/full/${p.id}.png`
          : null;

        const natEs = translateCountryEs(bp?.nationality) ?? p.nationality;
        const natCode = resolveIso3(natEs, p.nationalityCode);
        const dob = bp?.date_of_birth?.slice(0, 10) ?? p.birthDate ?? null;
        const posMapped = bp
          ? mapSoccerPosGroup(bp.position, bp.specific_position)
          : { group: p.positionGroup, label: p.positionLabel };

        const footRaw = bp?.preferred_foot?.trim().toUpperCase();
        const preferredFoot: "R" | "L" | "B" | null =
          footRaw === "R" || footRaw === "L" || footRaw === "B"
            ? footRaw
            : (p.preferredFoot ?? null);

        const availRaw = (bp?.availability ?? "").trim().toLowerCase();
        const availability: "available" | "injured" | "doubtful" | "suspended" | null =
          availRaw === "injured"
            ? "injured"
            : availRaw === "doubtful"
              ? "doubtful"
              : availRaw === "suspended"
                ? "suspended"
                : availRaw === "available"
                  ? "available"
                  : (p.availability ?? null);

        return {
          ...p,
          jersey: bp?.jersey_number != null ? String(bp.jersey_number) : p.jersey,
          positionGroup: posMapped.group,
          positionLabel: posMapped.label,
          age: computeAgeFromIso(dob) ?? p.age,
          birthDate: dob,
          heightCm: bp?.height_cm ?? p.heightCm,
          weightKg: bp?.weight_kg ?? p.weightKg,
          preferredFoot,
          nationality: natEs,
          nationalityCode: natCode,
          photoKey: bp ? `pl-p:${bp.id}` : (p.photoKey ?? espnHeadshot),
          fallbackPhotoKey: bp && espnHeadshot ? espnHeadshot : (p.fallbackPhotoKey ?? null),
          availability,
          injuryDetail:
            availability && availability !== "available"
              ? translateInjuryDetailEs(bp?.injury_type) ?? p.injuryDetail ?? null
              : null,
          expectedReturn:
            availability && availability !== "available"
              ? (bp?.injury_expected_return?.slice(0, 10) ?? p.expectedReturn ?? null)
              : null,
        };
      });

      // Agregar jugadores del primer equipo actual que no estuvieran en la nómina previa
      const seenSlugs = new Set(enrichedPlayers.map((p) => p.slug));
      for (const bp of bzList) {
        if (matchedBzIds.has(bp.id)) continue;
        if (bp.jersey_number != null && bp.jersey_number > 99 && lg !== "liga-mx") continue;
        const rawSlug = slugifyPlayerName(bp.name);
        const slug = seenSlugs.has(rawSlug) ? `${rawSlug}-${bp.id}` : rawSlug;
        seenSlugs.add(slug);
        const posMapped = mapSoccerPosGroup(bp.position, bp.specific_position);
        const natEs = translateCountryEs(bp.nationality);
        const dob = bp.date_of_birth?.slice(0, 10) ?? null;
        const footRaw = bp.preferred_foot?.trim().toUpperCase();
        const availRaw = (bp.availability ?? "").trim().toLowerCase();
        const availability: "available" | "injured" | "doubtful" | "suspended" | null =
          availRaw === "injured"
            ? "injured"
            : availRaw === "doubtful"
              ? "doubtful"
              : availRaw === "suspended"
                ? "suspended"
                : "available";

        const aggStats = bzAggregatedStatsByPlayerId.get(bp.id) ?? emptyStats();
        const baseSeedPlayer: Omit<SquadPlayerEntry, "candidatePicks"> = {
          id: `bz-${bp.id}`,
          slug,
          name: bp.name,
          shortName: bp.short_name?.trim() || bp.name,
          jersey: bp.jersey_number != null ? String(bp.jersey_number) : null,
          positionGroup: posMapped.group,
          positionLabel: posMapped.label,
          age: computeAgeFromIso(dob),
          birthDate: dob,
          heightCm: bp.height_cm ?? null,
          weightKg: bp.weight_kg ?? null,
          preferredFoot:
            footRaw === "R" || footRaw === "L" || footRaw === "B" ? footRaw : null,
          nationality: natEs,
          nationalityCode: resolveIso3(natEs, null),
          photoKey: `pl-p:${bp.id}`,
          fallbackPhotoKey: null,
          availability,
          injuryDetail:
            availability !== "available" ? translateInjuryDetailEs(bp.injury_type) : null,
          expectedReturn:
            availability !== "available"
              ? (bp.injury_expected_return?.slice(0, 10) ?? null)
              : null,
          stats: aggStats,
        };
        enrichedPlayers.push({
          ...baseSeedPlayer,
          candidatePicks: computePlayerApplicablePicks(baseSeedPlayer),
        });
      }

      // Entrenador verificado (prioriza Bzzoiro actual + Football-Data v4 sobre ESPN histórico)
      const coachId = bzTeamId ? coachIdByBzTeam.get(bzTeamId) : undefined;
      const bzMgr = coachId ? bzManagerCache.get(coachId) : null;
      const fdCoach =
        fdCoachByTeamKey.get(normalizeNameKey(team.teamName)) ??
        fdCoachByTeamKey.get(normalizeNameKey(team.teamSlug.replace(/-/g, " "))) ??
        null;
      const currentBzTeamCoach = bzTeamId ? bzTeamCoachName.get(bzTeamId) : null;

      const resolvedCoachName =
        currentBzTeamCoach ?? bzMgr?.name ?? fdCoach?.name ?? team.coachName ?? null;

      let coachObj: SquadCoachProfile | null = null;
      if (resolvedCoachName) {
        const mgrMatchesCurrent =
          bzMgr &&
          (!currentBzTeamCoach ||
            normalizeNameKey(bzMgr.name) === normalizeNameKey(currentBzTeamCoach) ||
            normalizeNameKey(currentBzTeamCoach).includes(
              normalizeNameKey(bzMgr.name).split(" ").pop() ?? "---",
            ));
        const coachNat =
          (mgrMatchesCurrent ? translateCountryEs(bzMgr?.country) : null) ??
          fdCoach?.nationality ??
          null;

        coachObj = {
          name: resolvedCoachName,
          shortName: mgrMatchesCurrent ? (bzMgr?.short_name ?? null) : null,
          photoKey: mgrMatchesCurrent && bzMgr ? `pl-m:${bzMgr.id}` : null,
          nationality: coachNat,
          nationalityCode: resolveIso3(coachNat, null),
          birthDate: fdCoach?.birthDate ?? null,
          preferredFormation:
            mgrMatchesCurrent && bzMgr?.preferred_formation
              ? bzMgr.preferred_formation
              : null,
          styleLabel: mgrMatchesCurrent
            ? translateManagerStyleEs(bzMgr?.profile, bzMgr?.team_style)
            : null,
          careerRecord:
            mgrMatchesCurrent && bzMgr && typeof bzMgr.matches_total === "number" && bzMgr.matches_total > 0
              ? {
                  matches: bzMgr.matches_total,
                  wins: bzMgr.wins ?? 0,
                  draws: bzMgr.draws ?? 0,
                  losses: bzMgr.losses ?? 0,
                  winPct: bzMgr.win_pct ?? null,
                }
              : null,
        };
      }

      return {
        ...team,
        coachName: resolvedCoachName,
        coach: coachObj,
        players: enrichedPlayers,
      };
    });

    saveValidatedSquadsFile(lg, {
      ...sq,
      observedAt: new Date().toISOString(),
      teams: updatedTeams,
    });
    console.log(`[enrich] Guardado ${lg}/squads.json (${updatedTeams.length} clubes)`);
  }

  // 6) Enriquecer Selecciones Nacionales (plantillas y entrenadores)
  const nationalLeagues = [
    "copa-del-mundo",
    "uefa-nations",
    "concacaf-nations",
    "copa-america",
    "eurocopa",
    "copa-oro",
    "copa-africana",
    "copa-asiatica",
  ] as const;

  const bzNatPlayersBySlug = new Map<string, BzPlayerRaw[]>();
  const bzNatCoachBySlug = new Map<string, string>();
  const bzNatCoachIdBySlug = new Map<string, number>();

  if (bzHeaders && discoveredNationalTeamIdBySlug.size > 0) {
    await runPool([...discoveredNationalTeamIdBySlug.entries()], 8, async ([natSlug, natId]) => {
      const [natTeam, natPlayers, natEvents] = await Promise.all([
        fetchJsonSafe<{ coach?: { name?: string | null } }>(
          `https://sports.bzzoiro.com/api/teams/${natId}/`,
          bzHeaders,
        ),
        fetchJsonSafe<{ results?: BzPlayerRaw[] }>(
          `https://sports.bzzoiro.com/api/v2/players/?national_team_id=${natId}&limit=100`,
          bzHeaders,
        ),
        fetchJsonSafe<{
          results?: Array<{
            home_team_id: number;
            away_team_id: number;
            home_coach_id?: number | null;
            away_coach_id?: number | null;
          }>;
        }>(`https://sports.bzzoiro.com/api/v2/events/?team_id=${natId}&limit=4`, bzHeaders),
      ]);
      if (natTeam?.coach?.name?.trim()) {
        bzNatCoachBySlug.set(natSlug, natTeam.coach.name.trim());
      }
      for (const ev of natEvents?.results ?? []) {
        const cid = ev.home_team_id === natId ? ev.home_coach_id : ev.away_coach_id;
        if (cid) {
          bzNatCoachIdBySlug.set(natSlug, cid);
          break;
        }
      }
      const list = natPlayers?.results ?? [];
      bzNatPlayersBySlug.set(natSlug, list);
      for (const p of list) {
        if (!globalBzPlayerByName.has(normalizeNameKey(p.name))) {
          globalBzPlayerByName.set(normalizeNameKey(p.name), p);
        }
      }
    });

    const missingNatMgrIds = [...new Set(bzNatCoachIdBySlug.values())].filter(
      (cid) => !bzManagerCache.has(cid),
    );
    await runPool(missingNatMgrIds, 8, async (cid) => {
      const mgr = await fetchJsonSafe<BzManagerRaw>(
        `https://sports.bzzoiro.com/api/managers/${cid}/`,
        bzHeaders,
      );
      bzManagerCache.set(cid, mgr);
    });
  }

  for (const lg of nationalLeagues) {
    const sqPath = path.join(SNAPSHOTS_ROOT, lg, "squads.json");
    if (!fs.existsSync(sqPath)) continue;
    const sq = JSON.parse(fs.readFileSync(sqPath, "utf8")) as LeagueSquadsFile;

    const existingNatSlugs = new Set(sq.teams.map((t) => t.teamSlug));
    for (const st of collectSnapshotTeams(lg)) {
      if (!existingNatSlugs.has(st.slug) && (bzNatPlayersBySlug.get(st.slug)?.length ?? 0) > 0) {
        sq.teams.push({
          teamId: asTeamId(`${lg}.${st.slug}`),
          teamSlug: st.slug,
          teamName: st.name,
          coachName: null,
          updatedAt: nowIso,
          players: [],
        });
        existingNatSlugs.add(st.slug);
      }
    }

    const updatedTeams: TeamSquadEntry[] = sq.teams.map((team) => {
      const natPool = bzNatPlayersBySlug.get(team.teamSlug) ?? [];
      const byNorm = new Map<string, BzPlayerRaw>();
      for (const bp of natPool) {
        byNorm.set(normalizeNameKey(bp.name), bp);
        if (bp.short_name) byNorm.set(normalizeNameKey(bp.short_name), bp);
      }

      const matchedIds = new Set<number>();
      const players: SquadPlayerEntry[] = team.players.map((p) => {
        const norm = normalizeNameKey(p.name);
        const bp = byNorm.get(norm) ?? globalBzPlayerByName.get(norm);
        if (bp) matchedIds.add(bp.id);
        const espnHeadshot = /^\d{3,10}$/.test(p.id)
          ? `https://a.espncdn.com/i/headshots/soccer/players/full/${p.id}.png`
          : null;
        const dob = bp?.date_of_birth?.slice(0, 10) ?? p.birthDate ?? null;
        const posMapped = bp
          ? mapSoccerPosGroup(bp.position, bp.specific_position)
          : { group: p.positionGroup, label: p.positionLabel };
        const footRaw = bp?.preferred_foot?.trim().toUpperCase();
        const natEs = translateCountryEs(bp?.nationality) ?? p.nationality;

        return {
          ...p,
          positionGroup: posMapped.group,
          positionLabel: posMapped.label,
          age: computeAgeFromIso(dob) ?? p.age,
          birthDate: dob,
          heightCm: bp?.height_cm ?? p.heightCm,
          preferredFoot:
            footRaw === "R" || footRaw === "L" || footRaw === "B"
              ? footRaw
              : (p.preferredFoot ?? null),
          nationality: natEs,
          nationalityCode: resolveIso3(natEs, p.nationalityCode),
          photoKey: bp ? `pl-p:${bp.id}` : (p.photoKey ?? espnHeadshot),
          fallbackPhotoKey: bp && espnHeadshot ? espnHeadshot : (p.fallbackPhotoKey ?? null),
        };
      });

      if (players.length === 0 && natPool.length > 0) {
        const seenSlugs = new Set<string>();
        for (const bp of natPool) {
          if (matchedIds.has(bp.id)) continue;
          const rawSlug = slugifyPlayerName(bp.name);
          const slug = seenSlugs.has(rawSlug) ? `${rawSlug}-${bp.id}` : rawSlug;
          seenSlugs.add(slug);
          const posMapped = mapSoccerPosGroup(bp.position, bp.specific_position);
          const natEs = translateCountryEs(bp.nationality);
          const dob = bp.date_of_birth?.slice(0, 10) ?? null;
          const footRaw = bp.preferred_foot?.trim().toUpperCase();
          players.push({
            id: `bz-${bp.id}`,
            slug,
            name: bp.name,
            shortName: bp.short_name?.trim() || bp.name,
            jersey: bp.jersey_number != null ? String(bp.jersey_number) : null,
            positionGroup: posMapped.group,
            positionLabel: posMapped.label,
            age: computeAgeFromIso(dob),
            birthDate: dob,
            heightCm: bp.height_cm ?? null,
            weightKg: bp.weight_kg ?? null,
            preferredFoot: footRaw === "R" || footRaw === "L" || footRaw === "B" ? footRaw : null,
            nationality: natEs,
            nationalityCode: resolveIso3(natEs, null),
            photoKey: `pl-p:${bp.id}`,
            fallbackPhotoKey: null,
            stats: emptyStats(),
            candidatePicks: [],
          });
        }
      }

      const natCoachId = bzNatCoachIdBySlug.get(team.teamSlug);
      const natMgr = natCoachId ? bzManagerCache.get(natCoachId) : null;
      const curNatCoach = bzNatCoachBySlug.get(team.teamSlug);
      const resolvedCoach = curNatCoach ?? natMgr?.name ?? team.coachName ?? null;

      let coachObj: SquadCoachProfile | null = null;
      if (resolvedCoach) {
        const matchesMgr =
          natMgr &&
          (!curNatCoach ||
            normalizeNameKey(natMgr.name) === normalizeNameKey(curNatCoach) ||
            normalizeNameKey(curNatCoach).includes(
              normalizeNameKey(natMgr.name).split(" ").pop() ?? "---",
            ));
        const coachNat = matchesMgr ? translateCountryEs(natMgr?.country) : null;
        coachObj = {
          name: resolvedCoach,
          shortName: matchesMgr ? (natMgr?.short_name ?? null) : null,
          photoKey: matchesMgr && natMgr ? `pl-m:${natMgr.id}` : null,
          nationality: coachNat,
          nationalityCode: resolveIso3(coachNat, null),
          preferredFormation:
            matchesMgr && natMgr?.preferred_formation ? natMgr.preferred_formation : null,
          styleLabel: matchesMgr
            ? translateManagerStyleEs(natMgr?.profile, natMgr?.team_style)
            : null,
          careerRecord:
            matchesMgr && natMgr && typeof natMgr.matches_total === "number" && natMgr.matches_total > 0
              ? {
                  matches: natMgr.matches_total,
                  wins: natMgr.wins ?? 0,
                  draws: natMgr.draws ?? 0,
                  losses: natMgr.losses ?? 0,
                  winPct: natMgr.win_pct ?? null,
                }
              : null,
        };
      }

      return {
        ...team,
        coachName: resolvedCoach,
        coach: coachObj,
        players,
      };
    });

    saveValidatedSquadsFile(lg, {
      ...sq,
      observedAt: new Date().toISOString(),
      teams: updatedTeams,
    });
    console.log(`[enrich] Guardado ${lg}/squads.json (${updatedTeams.length} selecciones)`);
  }
}

interface EspnUsTeamsPayload {
  sports?: Array<{
    leagues?: Array<{
      teams?: Array<{
        team?: {
          id?: string;
          displayName?: string;
          shortDisplayName?: string;
          abbreviation?: string;
        };
      }>;
    }>;
  }>;
}

interface EspnUsAthlete {
  id?: string;
  fullName?: string;
  displayName?: string;
  shortName?: string;
  jersey?: string;
  age?: number;
  dateOfBirth?: string;
  height?: number;
  weight?: number;
  headshot?: { href?: string };
  position?: { abbreviation?: string; name?: string };
  birthPlace?: { country?: string };
  injuries?: Array<{ status?: string; details?: { type?: string } }>;
}

interface EspnUsRosterPayload {
  coach?: Array<{ id?: string; firstName?: string; lastName?: string; experience?: number }>;
  athletes?: Array<EspnUsAthlete & { position?: unknown; items?: EspnUsAthlete[] }>;
}

interface CoachPortraitManifestEntry {
  publicPath: string;
  coachName?: string;
}

function loadLocalCoachPortraitManifest(): Record<string, CoachPortraitManifestEntry> {
  const manifestPath = path.join(
    ROOT_DIR,
    "apps",
    "web",
    "public",
    "brand",
    "official",
    "coaches",
    "manifest.json",
  );
  if (!fs.existsSync(manifestPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Record<
      string,
      CoachPortraitManifestEntry
    >;
  } catch (err) {
    void err;
    return {};
  }
}

interface EspnAthleteOverviewPayload {
  statistics?: {
    displayName?: string;
    labels?: string[];
    splits?: Array<{ displayName?: string; stats?: string[] }>;
  };
  gameLog?: {
    statistics?: Array<{
      labels?: string[];
      events?: Array<{ eventId?: string; stats?: string[] }>;
    }>;
    events?: Record<
      string,
      {
        gameDate?: string;
        atVs?: string;
        score?: string;
        gameResult?: string;
        opponent?: { displayName?: string; abbreviation?: string };
      }
    >;
  };
}

const STAT_LABEL_ES: Readonly<Record<string, string>> = {
  GP: "JJ",
  AB: "AB",
  R: "C",
  H: "H",
  HR: "HR",
  RBI: "CI",
  BB: "BB",
  SO: "K",
  AVG: "AVG",
  OBP: "OBP",
  SLG: "SLG",
  OPS: "OPS",
  IP: "IP",
  ERA: "ERA",
  WHIP: "WHIP",
  W: "G",
  L: "P",
  SV: "SV",
  MIN: "MIN",
  PTS: "PTS",
  REB: "REB",
  AST: "AST",
  STL: "ROB",
  BLK: "TAP",
  "FG%": "%TC",
  "3P%": "%3P",
  "FT%": "%TL",
  G: "G",
  A: "A",
  "+/-": "+/-",
  S: "Tiros",
  PPG: "GPP",
  YDS: "YDS",
  TD: "TD",
  INT: "INT",
  CMP: "CMP",
  ATT: "INT.",
  "CMP%": "%CMP",
  REC: "REC",
  CAR: "ACAR",
};

function translateStatLabel(raw: string): string {
  const key = raw.trim().toUpperCase();
  return STAT_LABEL_ES[key] ?? raw.trim();
}

function buildUsOverviewPerformance(
  league: "nba" | "nfl" | "nhl" | "mlb",
  overview: EspnAthleteOverviewPayload | null,
): {
  appearances: number;
  seasonMetrics: PlayerSeasonMetric[];
  recentGames: PlayerRecentGameLog[];
} {
  if (!overview) return { appearances: 0, seasonMetrics: [], recentGames: [] };
  const labels = overview.statistics?.labels ?? [];
  const regSplit =
    overview.statistics?.splits?.find((s) =>
      (s.displayName ?? "").toLowerCase().includes("regular"),
    ) ?? overview.statistics?.splits?.[0];
  const rawVals = regSplit?.stats ?? [];

  const byLabel = new Map<string, string>();
  labels.forEach((lbl, idx) => {
    const val = rawVals[idx]?.trim();
    if (val && val !== "--") byLabel.set(lbl.trim().toUpperCase(), val);
  });

  const gpRaw = Number((byLabel.get("GP") ?? byLabel.get("G") ?? "0").replace(/,/g, ""));
  const appearances = Number.isFinite(gpRaw) && gpRaw > 0 ? Math.round(gpRaw) : 0;

  const preferredOrder =
    league === "mlb"
      ? byLabel.has("ERA") || byLabel.has("IP")
        ? ["GP", "W", "L", "ERA", "IP", "SO", "WHIP", "SV"]
        : ["GP", "AB", "H", "HR", "RBI", "R", "BB", "SO"]
      : league === "nba"
        ? ["GP", "MIN", "PTS", "REB", "AST", "FG%", "3P%", "STL"]
        : league === "nhl"
          ? ["GP", "G", "A", "PTS", "+/-", "S"]
          : ["CMP", "ATT", "CMP%", "YDS", "TD", "INT", "REC", "CAR"];

  const seasonMetrics: PlayerSeasonMetric[] = [];
  for (const key of preferredOrder) {
    const val = byLabel.get(key);
    if (!val) continue;
    seasonMetrics.push({
      key: key.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
      label: translateStatLabel(key),
      value: val,
    });
    if (seasonMetrics.length >= 6) break;
  }
  // Para bateadores MLB, calcular AVG si hay H y AB
  if (league === "mlb" && !byLabel.has("ERA") && byLabel.has("H") && byLabel.has("AB")) {
    const hits = Number(byLabel.get("H"));
    const ab = Number(byLabel.get("AB"));
    if (Number.isFinite(hits) && Number.isFinite(ab) && ab > 0) {
      const avgStr = (hits / ab).toFixed(3).replace(/^0/, "");
      seasonMetrics.splice(1, 0, {
        key: "avg",
        label: "AVG",
        value: avgStr,
        detail: `${hits} H en ${ab} AB`,
      });
      if (seasonMetrics.length > 6) seasonMetrics.pop();
    }
  }

  const glStatBlock = overview.gameLog?.statistics?.[0];
  const glLabels = glStatBlock?.labels ?? [];
  const glEventsMap = overview.gameLog?.events ?? {};
  const recentGames: PlayerRecentGameLog[] = [];

  for (const row of (glStatBlock?.events ?? []).slice(0, 5)) {
    const evId = row.eventId;
    const meta = evId ? glEventsMap[evId] : undefined;
    if (!meta?.gameDate) continue;
    const opponent = meta.opponent?.displayName?.trim() || meta.opponent?.abbreviation?.trim() || "Rival";
    const resRaw = (meta.gameResult ?? "").toUpperCase();
    const result: "W" | "D" | "L" | null =
      resRaw === "W" ? "W" : resRaw === "L" ? "L" : resRaw === "T" || resRaw === "D" ? "D" : null;
    const isHome = meta.atVs === "vs" ? true : meta.atVs === "@" ? false : null;
    const statsList: Array<{ label: string; value: string }> = [];
    glLabels.forEach((lbl, idx) => {
      const v = row.stats?.[idx]?.trim();
      if (!v || statsList.length >= 5) return;
      statsList.push({ label: translateStatLabel(lbl), value: v });
    });
    recentGames.push({
      dateIso: meta.gameDate.slice(0, 10),
      opponent,
      opponentAbbr: meta.opponent?.abbreviation?.trim() ?? null,
      isHome,
      score: meta.score?.trim() ?? null,
      result,
      stats: statsList,
    });
  }

  return { appearances, seasonMetrics, recentGames };
}

function mapUsPosGroup(
  league: "nba" | "nfl" | "nhl" | "mlb",
  abbr?: string,
  groupHint?: string,
): { group: PlayerPositionGroup; label: string } {
  const a = (abbr ?? "").trim().toUpperCase();
  const g = (groupHint ?? "").trim().toLowerCase();

  if (league === "nba") {
    if (a === "PG" || a === "SG" || a === "G") return { group: "MID", label: a || "G" };
    if (a === "C") return { group: "DEF", label: "C" };
    return { group: "FWD", label: a || "F" };
  }

  if (league === "nhl") {
    if (a === "G") return { group: "GK", label: "G" };
    if (a === "D" || a === "LD" || a === "RD") return { group: "DEF", label: a };
    if (a === "C") return { group: "MID", label: "C" };
    return { group: "FWD", label: a || "RW" };
  }

  if (league === "mlb") {
    if (["P", "SP", "RP", "CL", "MR", "LHP", "RHP"].includes(a) || g.includes("pitch")) {
      return { group: "GK", label: a || "P" };
    }
    if (a === "C" || g.includes("catch")) {
      return { group: "DEF", label: a || "C" };
    }
    if (["1B", "2B", "3B", "SS", "IF", "MI", "CI"].includes(a) || g.includes("infield")) {
      return { group: "MID", label: a || "IF" };
    }
    return { group: "FWD", label: a || "OF" };
  }

  // NFL
  if (g.includes("special") || ["K", "PK", "P", "LS"].includes(a)) {
    return { group: "GK", label: a || "ESP" };
  }
  if (
    g.includes("defense") ||
    ["DE", "DT", "NT", "DL", "LB", "ILB", "OLB", "MLB", "CB", "DB", "S", "FS", "SS"].includes(a)
  ) {
    return { group: "DEF", label: a || "DEF" };
  }
  if (["WR", "TE", "OT", "OG", "G", "C", "OL", "T"].includes(a)) {
    return { group: "MID", label: a };
  }
  return { group: "FWD", label: a || "QB" };
}

async function ingestUsProSquads(
  onlyLeagues?: ReadonlySet<string>,
  withStats = false,
): Promise<void> {
  const coachPortraitManifest = loadLocalCoachPortraitManifest();
  const allConfigs: ReadonlyArray<{
    league: "nba" | "nfl" | "nhl" | "mlb";
    sportPath: string;
    headshotSeg: string;
  }> = [
    { league: "nba", sportPath: "basketball/nba", headshotSeg: "nba" },
    { league: "nfl", sportPath: "football/nfl", headshotSeg: "nfl" },
    { league: "nhl", sportPath: "hockey/nhl", headshotSeg: "nhl" },
    { league: "mlb", sportPath: "baseball/mlb", headshotSeg: "mlb" },
  ];
  const configs = onlyLeagues
    ? allConfigs.filter((c) => onlyLeagues.has(c.league))
    : allConfigs;

  for (const cfg of configs) {
    const snapPath = path.join(SNAPSHOTS_ROOT, cfg.league, "latest.json");
    if (!fs.existsSync(snapPath)) continue;
    const parsedSnap = LeagueSnapshotSchema.safeParse(
      JSON.parse(fs.readFileSync(snapPath, "utf8")),
    );
    if (!parsedSnap.success) continue;
    const snap = parsedSnap.data;

    const snapTeams = new Map<string, { id: string; slug: string; name: string; code: string }>();
    const reg = (id: string, name: string, code: string) => {
      const slug = id.includes(".") ? id.split(".").slice(1).join(".") : id;
      if (!snapTeams.has(slug)) snapTeams.set(slug, { id, slug, name, code });
    };
    for (const r of snap.standings ?? []) reg(r.teamId, r.name, r.code);
    for (const g of snap.games) {
      reg(g.home.id, g.home.name, g.home.code);
      reg(g.away.id, g.away.name, g.away.code);
    }
    for (const r of Object.values(snap.teamRates)) reg(r.teamId, r.name, r.code);

    const teamsPayload = await fetchJsonSafe<EspnUsTeamsPayload>(
      `https://site.api.espn.com/apis/site/v2/sports/${cfg.sportPath}/teams?limit=100`,
    );
    const espnEntries = teamsPayload?.sports?.[0]?.leagues?.[0]?.teams ?? [];

    const matchedTargets: Array<{
      espnId: string;
      target: { id: string; slug: string; name: string; code: string };
    }> = [];

    for (const item of espnEntries) {
      const eid = item.team?.id?.trim();
      const dName = item.team?.displayName?.trim() ?? "";
      const abbr = item.team?.abbreviation?.trim().toUpperCase() ?? "";
      if (!eid || !dName) continue;

      const normDisp = normalizeNameKey(dName);
      const allTargets = [...snapTeams.values()];
      const found =
        allTargets.find((t) => normalizeNameKey(t.name) === normDisp) ??
        allTargets.find((t) => abbr && t.code.toUpperCase() === abbr) ??
        allTargets.find((t) =>
          normDisp.endsWith(` ${normalizeNameKey(t.name).split(" ").pop() ?? "---"}`),
        );
      if (found && !matchedTargets.some((m) => m.target.id === found.id)) {
        matchedTargets.push({ espnId: eid, target: found });
      }
    }

    const teamSquads: TeamSquadEntry[] = [];
    const observedAt = new Date().toISOString();

    await runPool(matchedTargets, 8, async ({ espnId, target }) => {
      const roster = await fetchJsonSafe<EspnUsRosterPayload>(
        `https://site.api.espn.com/apis/site/v2/sports/${cfg.sportPath}/teams/${espnId}/roster`,
      );
      if (!roster) return;

      const c0 = roster.coach?.[0];
      const coachName =
        c0 && (c0.firstName || c0.lastName)
          ? `${c0.firstName ?? ""} ${c0.lastName ?? ""}`.trim()
          : null;
      const manifestCoachKey = `${cfg.league}.${target.slug}`;
      const localCoachPhoto = coachPortraitManifest[manifestCoachKey]?.publicPath ?? null;
      let coachBirthDate: string | null = null;
      if (cfg.league === "mlb" && c0?.id) {
        const coreCoach = await fetchJsonSafe<{ dateOfBirth?: string }>(
          `https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/2026/coaches/${encodeURIComponent(c0.id)}`,
        );
        if (coreCoach?.dateOfBirth) {
          coachBirthDate = coreCoach.dateOfBirth.slice(0, 10);
        }
      }
      const coach: SquadCoachProfile | null = coachName
        ? {
            name: coachName,
            ...(localCoachPhoto ? { photoKey: localCoachPhoto } : {}),
            ...(coachBirthDate ? { birthDate: coachBirthDate } : {}),
            styleLabel:
              typeof c0?.experience === "number" && c0.experience > 0
                ? `${c0.experience} temp. de experiencia`
                : null,
          }
        : null;

      const flatAthletes: Array<{ athlete: EspnUsAthlete; groupHint: string }> = [];
      for (const bucket of roster.athletes ?? []) {
        if (Array.isArray(bucket.items)) {
          const hint = typeof bucket.position === "string" ? bucket.position : "";
          for (const sub of bucket.items) {
            flatAthletes.push({ athlete: sub, groupHint: hint });
          }
        } else {
          flatAthletes.push({ athlete: bucket, groupHint: "" });
        }
      }

      const seenSlugs = new Set<string>();
      const players: SquadPlayerEntry[] = [];

      for (const { athlete, groupHint } of flatAthletes) {
        const rawName = (athlete.fullName ?? athlete.displayName ?? "").trim();
        if (!rawName) continue;
        const pid = (athlete.id ?? rawName).trim();
        const baseSlug = slugifyPlayerName(rawName);
        const slug = seenSlugs.has(baseSlug) ? `${baseSlug}-${pid.slice(-4)}` : baseSlug;
        seenSlugs.add(slug);

        const posAbbr =
          typeof athlete.position === "object" && athlete.position
            ? athlete.position.abbreviation
            : undefined;
        const pos = mapUsPosGroup(cfg.league, posAbbr, groupHint);
        const dob = athlete.dateOfBirth ? athlete.dateOfBirth.slice(0, 10) : null;
        const heightCm =
          typeof athlete.height === "number" && athlete.height > 45 && athlete.height < 100
            ? Math.round(athlete.height * 2.54)
            : null;
        const weightKg =
          typeof athlete.weight === "number" && athlete.weight > 100 && athlete.weight < 450
            ? Math.round(athlete.weight * 0.453592)
            : null;
        const countryEs = translateCountryEs(
          athlete.birthPlace?.country ?? (cfg.league === "nhl" ? "Canadá" : "Estados Unidos"),
        );

        const headshotHref =
          athlete.headshot?.href &&
          athlete.headshot.href.startsWith("https://a.espncdn.com/i/headshots/")
            ? athlete.headshot.href
            : null;

        const inj0 = athlete.injuries?.[0];
        const injStatusRaw = (inj0?.status ?? "").toLowerCase();
        const availability: "available" | "injured" | "doubtful" | null = injStatusRaw
          ? injStatusRaw.includes("questionable") || injStatusRaw.includes("day-to-day")
            ? "doubtful"
            : "injured"
          : "available";

        const baseEntry = {
          id: pid,
          slug,
          name: rawName,
          shortName: (athlete.shortName ?? rawName).trim(),
          jersey: athlete.jersey?.trim() || null,
          positionGroup: pos.group,
          positionLabel: pos.label,
          age:
            typeof athlete.age === "number" && athlete.age >= 17 && athlete.age <= 50
              ? Math.round(athlete.age)
              : computeAgeFromIso(dob),
          birthDate: dob,
          heightCm,
          weightKg,
          preferredFoot: null,
          nationality: countryEs,
          nationalityCode: resolveIso3(countryEs, null),
          photoKey: headshotHref,
          fallbackPhotoKey: null,
          availability,
          injuryDetail:
            availability !== "available"
              ? translateInjuryDetailEs(inj0?.details?.type ?? null)
              : null,
          expectedReturn: null,
          stats: emptyStats(),
        };

        players.push({
          ...baseEntry,
          candidatePicks: computePlayerApplicablePicks(baseEntry),
        });
      }

      if (players.length === 0) return;

      if (withStats) {
        const keyPlayers = players
          .filter((p) => /^\d+$/.test(p.id) && p.photoKey)
          .slice(0, 5);
        await runPool(keyPlayers, 3, async (p) => {
          const ov = await fetchJsonSafe<EspnAthleteOverviewPayload>(
            `https://site.web.api.espn.com/apis/common/v3/sports/${cfg.sportPath}/athletes/${encodeURIComponent(p.id)}/overview`,
          );
          const perf = buildUsOverviewPerformance(cfg.league, ov);
          if (perf.appearances > 0) p.stats.appearances = perf.appearances;
          if (perf.seasonMetrics.length > 0) p.seasonMetrics = perf.seasonMetrics;
          if (perf.recentGames.length > 0) p.recentGames = perf.recentGames;
        });
      }

      teamSquads.push({
        teamId: asTeamId(target.id),
        teamSlug: target.slug,
        teamName: target.name,
        coachName,
        coach,
        updatedAt: observedAt,
        players,
      });
    });

    if (teamSquads.length > 0) {
      teamSquads.sort((a, b) => a.teamName.localeCompare(b.teamName, "es-MX"));
      saveValidatedSquadsFile(cfg.league, {
        schemaVersion: 1,
        league: LeagueIdSchema.parse(cfg.league),
        seasonLabel: snap.seasonLabel,
        observedAt,
        teams: teamSquads,
      });
      const totalPlayers = teamSquads.reduce((acc, t) => acc + t.players.length, 0);
      console.log(
        `[enrich] Guardado ${cfg.league}/squads.json (${teamSquads.length} equipos · ${totalPlayers} jugadores con retrato)`,
      );
    }
  }
}

async function main(): Promise<void> {
  const leaguesArg = process.argv.find((a) => a.startsWith("--leagues="))?.slice(10);
  const filterSet = leaguesArg
    ? new Set(leaguesArg.split(",").map((s) => s.trim()).filter(Boolean))
    : undefined;
  const runUsOnly = process.argv.includes("--us-only") || (filterSet && [...filterSet].every((l) => ["nba", "nfl", "nhl", "mlb"].includes(l)));
  if (!runUsOnly) {
    await enrichClubAndNationalSoccer();
  }
  const withStats = process.argv.includes("--with-stats");
  await ingestUsProSquads(filterSet, withStats);
}

main().catch((err) => {
  console.error("[enrich] Error fatal:", err);
  process.exit(1);
});
