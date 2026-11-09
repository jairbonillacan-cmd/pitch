// Generado automáticamente por packages/sports-assets/scripts/sync-assets.mjs — NO EDITAR MANUALMENTE
export interface RegisteredLeagueAsset {
  id: string;
  code: string;
  name: string;
  shortName: string;
  revision: number;
  svgPath: string;
  pngPath: string;
}

export interface RegisteredTeamAsset {
  id: string;
  slug: string;
  league: string;
  code: string;
  name: string;
  shortName: string;
  revision: number;
  svgPath: string;
  pngPath: string;
}

export const LEAGUE_ASSETS: Record<string, RegisteredLeagueAsset> = {
  "liga-mx": {
    "id": "liga-mx",
    "code": "MX",
    "name": "Liga MX",
    "shortName": "Liga MX",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/liga-mx.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/liga-mx.png"
  },
  "premier-league": {
    "id": "premier-league",
    "code": "PL",
    "name": "Premier League",
    "shortName": "Premier League",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/premier-league.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/premier-league.png"
  },
  "laliga": {
    "id": "laliga",
    "code": "LL",
    "name": "LaLiga",
    "shortName": "LaLiga",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/laliga.svg",
    "pngPath": "/brand/sports/laliga/r1/png/laliga.png"
  },
  "nfl": {
    "id": "nfl",
    "code": "NFL",
    "name": "NFL",
    "shortName": "NFL",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/nfl.svg",
    "pngPath": "/brand/sports/nfl/r1/png/nfl.png"
  }
};

export const TEAM_ASSETS: Record<string, RegisteredTeamAsset> = {
  "liga-mx.america": {
    "id": "liga-mx.america",
    "slug": "america",
    "league": "liga-mx",
    "code": "AME",
    "name": "Club América",
    "shortName": "América",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/america.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/america.png"
  },
  "liga-mx.atlante": {
    "id": "liga-mx.atlante",
    "slug": "atlante",
    "league": "liga-mx",
    "code": "ATE",
    "name": "Atlante",
    "shortName": "Atlante",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/atlante.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/atlante.png"
  },
  "liga-mx.atlas": {
    "id": "liga-mx.atlas",
    "slug": "atlas",
    "league": "liga-mx",
    "code": "ATS",
    "name": "Atlas",
    "shortName": "Atlas",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/atlas.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/atlas.png"
  },
  "liga-mx.atletico-san-luis": {
    "id": "liga-mx.atletico-san-luis",
    "slug": "atletico-san-luis",
    "league": "liga-mx",
    "code": "ASL",
    "name": "Atlético de San Luis",
    "shortName": "Atl. San Luis",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/atletico-san-luis.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/atletico-san-luis.png"
  },
  "liga-mx.chivas": {
    "id": "liga-mx.chivas",
    "slug": "chivas",
    "league": "liga-mx",
    "code": "GDL",
    "name": "Chivas Guadalajara",
    "shortName": "Chivas",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/chivas.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/chivas.png"
  },
  "liga-mx.cruz-azul": {
    "id": "liga-mx.cruz-azul",
    "slug": "cruz-azul",
    "league": "liga-mx",
    "code": "CAZ",
    "name": "Cruz Azul",
    "shortName": "Cruz Azul",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/cruz-azul.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/cruz-azul.png"
  },
  "liga-mx.fc-juarez": {
    "id": "liga-mx.fc-juarez",
    "slug": "fc-juarez",
    "league": "liga-mx",
    "code": "JUA",
    "name": "FC Juárez",
    "shortName": "Juárez",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/fc-juarez.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/fc-juarez.png"
  },
  "liga-mx.leon": {
    "id": "liga-mx.leon",
    "slug": "leon",
    "league": "liga-mx",
    "code": "LEO",
    "name": "Club León",
    "shortName": "León",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/leon.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/leon.png"
  },
  "liga-mx.monterrey": {
    "id": "liga-mx.monterrey",
    "slug": "monterrey",
    "league": "liga-mx",
    "code": "MTY",
    "name": "Rayados de Monterrey",
    "shortName": "Monterrey",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/monterrey.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/monterrey.png"
  },
  "liga-mx.necaxa": {
    "id": "liga-mx.necaxa",
    "slug": "necaxa",
    "league": "liga-mx",
    "code": "NEC",
    "name": "Necaxa",
    "shortName": "Necaxa",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/necaxa.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/necaxa.png"
  },
  "liga-mx.pachuca": {
    "id": "liga-mx.pachuca",
    "slug": "pachuca",
    "league": "liga-mx",
    "code": "PAC",
    "name": "Pachuca",
    "shortName": "Pachuca",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/pachuca.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/pachuca.png"
  },
  "liga-mx.puebla": {
    "id": "liga-mx.puebla",
    "slug": "puebla",
    "league": "liga-mx",
    "code": "PUE",
    "name": "Club Puebla",
    "shortName": "Puebla",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/puebla.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/puebla.png"
  },
  "liga-mx.pumas-unam": {
    "id": "liga-mx.pumas-unam",
    "slug": "pumas-unam",
    "league": "liga-mx",
    "code": "PUM",
    "name": "Pumas UNAM",
    "shortName": "Pumas",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/pumas-unam.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/pumas-unam.png"
  },
  "liga-mx.queretaro": {
    "id": "liga-mx.queretaro",
    "slug": "queretaro",
    "league": "liga-mx",
    "code": "QRO",
    "name": "Querétaro",
    "shortName": "Querétaro",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/queretaro.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/queretaro.png"
  },
  "liga-mx.santos-laguna": {
    "id": "liga-mx.santos-laguna",
    "slug": "santos-laguna",
    "league": "liga-mx",
    "code": "SAN",
    "name": "Santos Laguna",
    "shortName": "Santos Laguna",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/santos-laguna.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/santos-laguna.png"
  },
  "liga-mx.tigres-uanl": {
    "id": "liga-mx.tigres-uanl",
    "slug": "tigres-uanl",
    "league": "liga-mx",
    "code": "TIG",
    "name": "Tigres UANL",
    "shortName": "Tigres",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/tigres-uanl.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/tigres-uanl.png"
  },
  "liga-mx.tijuana": {
    "id": "liga-mx.tijuana",
    "slug": "tijuana",
    "league": "liga-mx",
    "code": "TIJ",
    "name": "Xolos de Tijuana",
    "shortName": "Tijuana",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/tijuana.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/tijuana.png"
  },
  "liga-mx.toluca": {
    "id": "liga-mx.toluca",
    "slug": "toluca",
    "league": "liga-mx",
    "code": "TOL",
    "name": "Deportivo Toluca",
    "shortName": "Toluca",
    "revision": 1,
    "svgPath": "/brand/sports/liga-mx/r1/svg/toluca.svg",
    "pngPath": "/brand/sports/liga-mx/r1/png/toluca.png"
  },
  "premier-league.afc-bournemouth": {
    "id": "premier-league.afc-bournemouth",
    "slug": "afc-bournemouth",
    "league": "premier-league",
    "code": "BOU",
    "name": "AFC Bournemouth",
    "shortName": "Bournemouth",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/afc-bournemouth.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/afc-bournemouth.png"
  },
  "premier-league.arsenal": {
    "id": "premier-league.arsenal",
    "slug": "arsenal",
    "league": "premier-league",
    "code": "ARS",
    "name": "Arsenal",
    "shortName": "Arsenal",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/arsenal.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/arsenal.png"
  },
  "premier-league.aston-villa": {
    "id": "premier-league.aston-villa",
    "slug": "aston-villa",
    "league": "premier-league",
    "code": "AVL",
    "name": "Aston Villa",
    "shortName": "Aston Villa",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/aston-villa.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/aston-villa.png"
  },
  "premier-league.brentford": {
    "id": "premier-league.brentford",
    "slug": "brentford",
    "league": "premier-league",
    "code": "BRE",
    "name": "Brentford",
    "shortName": "Brentford",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/brentford.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/brentford.png"
  },
  "premier-league.brighton-hove-albion": {
    "id": "premier-league.brighton-hove-albion",
    "slug": "brighton-hove-albion",
    "league": "premier-league",
    "code": "BHA",
    "name": "Brighton & Hove Albion",
    "shortName": "Brighton",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/brighton-hove-albion.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/brighton-hove-albion.png"
  },
  "premier-league.chelsea": {
    "id": "premier-league.chelsea",
    "slug": "chelsea",
    "league": "premier-league",
    "code": "CHE",
    "name": "Chelsea",
    "shortName": "Chelsea",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/chelsea.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/chelsea.png"
  },
  "premier-league.coventry-city": {
    "id": "premier-league.coventry-city",
    "slug": "coventry-city",
    "league": "premier-league",
    "code": "COV",
    "name": "Coventry City",
    "shortName": "Coventry City",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/coventry-city.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/coventry-city.png"
  },
  "premier-league.crystal-palace": {
    "id": "premier-league.crystal-palace",
    "slug": "crystal-palace",
    "league": "premier-league",
    "code": "CRY",
    "name": "Crystal Palace",
    "shortName": "Crystal Palace",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/crystal-palace.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/crystal-palace.png"
  },
  "premier-league.everton": {
    "id": "premier-league.everton",
    "slug": "everton",
    "league": "premier-league",
    "code": "EVE",
    "name": "Everton",
    "shortName": "Everton",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/everton.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/everton.png"
  },
  "premier-league.fulham": {
    "id": "premier-league.fulham",
    "slug": "fulham",
    "league": "premier-league",
    "code": "FUL",
    "name": "Fulham",
    "shortName": "Fulham",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/fulham.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/fulham.png"
  },
  "premier-league.hull-city": {
    "id": "premier-league.hull-city",
    "slug": "hull-city",
    "league": "premier-league",
    "code": "HUL",
    "name": "Hull City",
    "shortName": "Hull City",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/hull-city.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/hull-city.png"
  },
  "premier-league.ipswich-town": {
    "id": "premier-league.ipswich-town",
    "slug": "ipswich-town",
    "league": "premier-league",
    "code": "IPS",
    "name": "Ipswich Town",
    "shortName": "Ipswich Town",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/ipswich-town.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/ipswich-town.png"
  },
  "premier-league.leeds-united": {
    "id": "premier-league.leeds-united",
    "slug": "leeds-united",
    "league": "premier-league",
    "code": "LEE",
    "name": "Leeds United",
    "shortName": "Leeds United",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/leeds-united.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/leeds-united.png"
  },
  "premier-league.liverpool": {
    "id": "premier-league.liverpool",
    "slug": "liverpool",
    "league": "premier-league",
    "code": "LIV",
    "name": "Liverpool",
    "shortName": "Liverpool",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/liverpool.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/liverpool.png"
  },
  "premier-league.manchester-city": {
    "id": "premier-league.manchester-city",
    "slug": "manchester-city",
    "league": "premier-league",
    "code": "MCI",
    "name": "Manchester City",
    "shortName": "Manchester City",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/manchester-city.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/manchester-city.png"
  },
  "premier-league.manchester-united": {
    "id": "premier-league.manchester-united",
    "slug": "manchester-united",
    "league": "premier-league",
    "code": "MUN",
    "name": "Manchester United",
    "shortName": "Man. United",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/manchester-united.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/manchester-united.png"
  },
  "premier-league.newcastle-united": {
    "id": "premier-league.newcastle-united",
    "slug": "newcastle-united",
    "league": "premier-league",
    "code": "NEW",
    "name": "Newcastle United",
    "shortName": "Newcastle",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/newcastle-united.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/newcastle-united.png"
  },
  "premier-league.nottingham-forest": {
    "id": "premier-league.nottingham-forest",
    "slug": "nottingham-forest",
    "league": "premier-league",
    "code": "NFO",
    "name": "Nottingham Forest",
    "shortName": "Nottingham Forest",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/nottingham-forest.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/nottingham-forest.png"
  },
  "premier-league.sunderland": {
    "id": "premier-league.sunderland",
    "slug": "sunderland",
    "league": "premier-league",
    "code": "SUN",
    "name": "Sunderland",
    "shortName": "Sunderland",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/sunderland.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/sunderland.png"
  },
  "premier-league.tottenham-hotspur": {
    "id": "premier-league.tottenham-hotspur",
    "slug": "tottenham-hotspur",
    "league": "premier-league",
    "code": "TOT",
    "name": "Tottenham Hotspur",
    "shortName": "Tottenham",
    "revision": 2,
    "svgPath": "/brand/sports/premier-league/r2/svg/tottenham-hotspur.svg",
    "pngPath": "/brand/sports/premier-league/r2/png/tottenham-hotspur.png"
  },
  "laliga.athletic-club": {
    "id": "laliga.athletic-club",
    "slug": "athletic-club",
    "league": "laliga",
    "code": "ATH",
    "name": "Athletic Club",
    "shortName": "Athletic Club",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/athletic-club.svg",
    "pngPath": "/brand/sports/laliga/r1/png/athletic-club.png"
  },
  "laliga.atletico-madrid": {
    "id": "laliga.atletico-madrid",
    "slug": "atletico-madrid",
    "league": "laliga",
    "code": "ATM",
    "name": "Atlético de Madrid",
    "shortName": "Atlético de Madrid",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/atletico-madrid.svg",
    "pngPath": "/brand/sports/laliga/r1/png/atletico-madrid.png"
  },
  "laliga.osasuna": {
    "id": "laliga.osasuna",
    "slug": "osasuna",
    "league": "laliga",
    "code": "OSA",
    "name": "CA Osasuna",
    "shortName": "CA Osasuna",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/osasuna.svg",
    "pngPath": "/brand/sports/laliga/r1/png/osasuna.png"
  },
  "laliga.celta-vigo": {
    "id": "laliga.celta-vigo",
    "slug": "celta-vigo",
    "league": "laliga",
    "code": "CELV",
    "name": "Celta de Vigo",
    "shortName": "Celta de Vigo",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/celta-vigo.svg",
    "pngPath": "/brand/sports/laliga/r1/png/celta-vigo.png"
  },
  "laliga.alaves": {
    "id": "laliga.alaves",
    "slug": "alaves",
    "league": "laliga",
    "code": "ALA",
    "name": "Deportivo Alavés",
    "shortName": "Deportivo Alavés",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/alaves.svg",
    "pngPath": "/brand/sports/laliga/r1/png/alaves.png"
  },
  "laliga.elche": {
    "id": "laliga.elche",
    "slug": "elche",
    "league": "laliga",
    "code": "ELC",
    "name": "Elche CF",
    "shortName": "Elche CF",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/elche.svg",
    "pngPath": "/brand/sports/laliga/r1/png/elche.png"
  },
  "laliga.barcelona": {
    "id": "laliga.barcelona",
    "slug": "barcelona",
    "league": "laliga",
    "code": "BAR",
    "name": "FC Barcelona",
    "shortName": "FC Barcelona",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/barcelona.svg",
    "pngPath": "/brand/sports/laliga/r1/png/barcelona.png"
  },
  "laliga.getafe": {
    "id": "laliga.getafe",
    "slug": "getafe",
    "league": "laliga",
    "code": "GET",
    "name": "Getafe CF",
    "shortName": "Getafe CF",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/getafe.svg",
    "pngPath": "/brand/sports/laliga/r1/png/getafe.png"
  },
  "laliga.levante": {
    "id": "laliga.levante",
    "slug": "levante",
    "league": "laliga",
    "code": "LEV",
    "name": "Levante UD",
    "shortName": "Levante UD",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/levante.svg",
    "pngPath": "/brand/sports/laliga/r1/png/levante.png"
  },
  "laliga.malaga": {
    "id": "laliga.malaga",
    "slug": "malaga",
    "league": "laliga",
    "code": "MAL",
    "name": "Málaga CF",
    "shortName": "Málaga CF",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/malaga.svg",
    "pngPath": "/brand/sports/laliga/r1/png/malaga.png"
  },
  "laliga.racing-santander": {
    "id": "laliga.racing-santander",
    "slug": "racing-santander",
    "league": "laliga",
    "code": "RAC",
    "name": "Racing de Santander",
    "shortName": "Racing de Santander",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/racing-santander.svg",
    "pngPath": "/brand/sports/laliga/r1/png/racing-santander.png"
  },
  "laliga.rayo-vallecano": {
    "id": "laliga.rayo-vallecano",
    "slug": "rayo-vallecano",
    "league": "laliga",
    "code": "RAY",
    "name": "Rayo Vallecano",
    "shortName": "Rayo Vallecano",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/rayo-vallecano.svg",
    "pngPath": "/brand/sports/laliga/r1/png/rayo-vallecano.png"
  },
  "laliga.deportivo-la-coruna": {
    "id": "laliga.deportivo-la-coruna",
    "slug": "deportivo-la-coruna",
    "league": "laliga",
    "code": "DEP",
    "name": "Deportivo de La Coruña",
    "shortName": "Deportivo de La Coruña",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/deportivo-la-coruna.svg",
    "pngPath": "/brand/sports/laliga/r1/png/deportivo-la-coruna.png"
  },
  "laliga.espanyol": {
    "id": "laliga.espanyol",
    "slug": "espanyol",
    "league": "laliga",
    "code": "ESP",
    "name": "RCD Espanyol",
    "shortName": "RCD Espanyol",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/espanyol.svg",
    "pngPath": "/brand/sports/laliga/r1/png/espanyol.png"
  },
  "laliga.real-betis": {
    "id": "laliga.real-betis",
    "slug": "real-betis",
    "league": "laliga",
    "code": "BET",
    "name": "Real Betis",
    "shortName": "Real Betis",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/real-betis.svg",
    "pngPath": "/brand/sports/laliga/r1/png/real-betis.png"
  },
  "laliga.real-madrid": {
    "id": "laliga.real-madrid",
    "slug": "real-madrid",
    "league": "laliga",
    "code": "RMA",
    "name": "Real Madrid",
    "shortName": "Real Madrid",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/real-madrid.svg",
    "pngPath": "/brand/sports/laliga/r1/png/real-madrid.png"
  },
  "laliga.real-sociedad": {
    "id": "laliga.real-sociedad",
    "slug": "real-sociedad",
    "league": "laliga",
    "code": "RSO",
    "name": "Real Sociedad",
    "shortName": "Real Sociedad",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/real-sociedad.svg",
    "pngPath": "/brand/sports/laliga/r1/png/real-sociedad.png"
  },
  "laliga.sevilla": {
    "id": "laliga.sevilla",
    "slug": "sevilla",
    "league": "laliga",
    "code": "SEV",
    "name": "Sevilla FC",
    "shortName": "Sevilla FC",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/sevilla.svg",
    "pngPath": "/brand/sports/laliga/r1/png/sevilla.png"
  },
  "laliga.valencia": {
    "id": "laliga.valencia",
    "slug": "valencia",
    "league": "laliga",
    "code": "VAL",
    "name": "Valencia CF",
    "shortName": "Valencia CF",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/valencia.svg",
    "pngPath": "/brand/sports/laliga/r1/png/valencia.png"
  },
  "laliga.villarreal": {
    "id": "laliga.villarreal",
    "slug": "villarreal",
    "league": "laliga",
    "code": "VIL",
    "name": "Villarreal CF",
    "shortName": "Villarreal CF",
    "revision": 1,
    "svgPath": "/brand/sports/laliga/r1/svg/villarreal.svg",
    "pngPath": "/brand/sports/laliga/r1/png/villarreal.png"
  },
  "nfl.arizona-cardinals": {
    "id": "nfl.arizona-cardinals",
    "slug": "arizona-cardinals",
    "league": "nfl",
    "code": "ARI",
    "name": "Arizona Cardinals",
    "shortName": "Arizona Cardinals",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/arizona-cardinals.svg",
    "pngPath": "/brand/sports/nfl/r1/png/arizona-cardinals.png"
  },
  "nfl.atlanta-falcons": {
    "id": "nfl.atlanta-falcons",
    "slug": "atlanta-falcons",
    "league": "nfl",
    "code": "ATL",
    "name": "Atlanta Falcons",
    "shortName": "Atlanta Falcons",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/atlanta-falcons.svg",
    "pngPath": "/brand/sports/nfl/r1/png/atlanta-falcons.png"
  },
  "nfl.baltimore-ravens": {
    "id": "nfl.baltimore-ravens",
    "slug": "baltimore-ravens",
    "league": "nfl",
    "code": "BAL",
    "name": "Baltimore Ravens",
    "shortName": "Baltimore Ravens",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/baltimore-ravens.svg",
    "pngPath": "/brand/sports/nfl/r1/png/baltimore-ravens.png"
  },
  "nfl.buffalo-bills": {
    "id": "nfl.buffalo-bills",
    "slug": "buffalo-bills",
    "league": "nfl",
    "code": "BUF",
    "name": "Buffalo Bills",
    "shortName": "Buffalo Bills",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/buffalo-bills.svg",
    "pngPath": "/brand/sports/nfl/r1/png/buffalo-bills.png"
  },
  "nfl.carolina-panthers": {
    "id": "nfl.carolina-panthers",
    "slug": "carolina-panthers",
    "league": "nfl",
    "code": "CAR",
    "name": "Carolina Panthers",
    "shortName": "Carolina Panthers",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/carolina-panthers.svg",
    "pngPath": "/brand/sports/nfl/r1/png/carolina-panthers.png"
  },
  "nfl.chicago-bears": {
    "id": "nfl.chicago-bears",
    "slug": "chicago-bears",
    "league": "nfl",
    "code": "CHI",
    "name": "Chicago Bears",
    "shortName": "Chicago Bears",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/chicago-bears.svg",
    "pngPath": "/brand/sports/nfl/r1/png/chicago-bears.png"
  },
  "nfl.cincinnati-bengals": {
    "id": "nfl.cincinnati-bengals",
    "slug": "cincinnati-bengals",
    "league": "nfl",
    "code": "CIN",
    "name": "Cincinnati Bengals",
    "shortName": "Cincinnati Bengals",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/cincinnati-bengals.svg",
    "pngPath": "/brand/sports/nfl/r1/png/cincinnati-bengals.png"
  },
  "nfl.cleveland-browns": {
    "id": "nfl.cleveland-browns",
    "slug": "cleveland-browns",
    "league": "nfl",
    "code": "CLE",
    "name": "Cleveland Browns",
    "shortName": "Cleveland Browns",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/cleveland-browns.svg",
    "pngPath": "/brand/sports/nfl/r1/png/cleveland-browns.png"
  },
  "nfl.dallas-cowboys": {
    "id": "nfl.dallas-cowboys",
    "slug": "dallas-cowboys",
    "league": "nfl",
    "code": "DAL",
    "name": "Dallas Cowboys",
    "shortName": "Dallas Cowboys",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/dallas-cowboys.svg",
    "pngPath": "/brand/sports/nfl/r1/png/dallas-cowboys.png"
  },
  "nfl.denver-broncos": {
    "id": "nfl.denver-broncos",
    "slug": "denver-broncos",
    "league": "nfl",
    "code": "DEN",
    "name": "Denver Broncos",
    "shortName": "Denver Broncos",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/denver-broncos.svg",
    "pngPath": "/brand/sports/nfl/r1/png/denver-broncos.png"
  },
  "nfl.detroit-lions": {
    "id": "nfl.detroit-lions",
    "slug": "detroit-lions",
    "league": "nfl",
    "code": "DET",
    "name": "Detroit Lions",
    "shortName": "Detroit Lions",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/detroit-lions.svg",
    "pngPath": "/brand/sports/nfl/r1/png/detroit-lions.png"
  },
  "nfl.green-bay-packers": {
    "id": "nfl.green-bay-packers",
    "slug": "green-bay-packers",
    "league": "nfl",
    "code": "GB",
    "name": "Green Bay Packers",
    "shortName": "Green Bay Packers",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/green-bay-packers.svg",
    "pngPath": "/brand/sports/nfl/r1/png/green-bay-packers.png"
  },
  "nfl.houston-texans": {
    "id": "nfl.houston-texans",
    "slug": "houston-texans",
    "league": "nfl",
    "code": "HOU",
    "name": "Houston Texans",
    "shortName": "Houston Texans",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/houston-texans.svg",
    "pngPath": "/brand/sports/nfl/r1/png/houston-texans.png"
  },
  "nfl.indianapolis-colts": {
    "id": "nfl.indianapolis-colts",
    "slug": "indianapolis-colts",
    "league": "nfl",
    "code": "IND",
    "name": "Indianapolis Colts",
    "shortName": "Indianapolis Colts",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/indianapolis-colts.svg",
    "pngPath": "/brand/sports/nfl/r1/png/indianapolis-colts.png"
  },
  "nfl.jacksonville-jaguars": {
    "id": "nfl.jacksonville-jaguars",
    "slug": "jacksonville-jaguars",
    "league": "nfl",
    "code": "JAX",
    "name": "Jacksonville Jaguars",
    "shortName": "Jacksonville Jaguars",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/jacksonville-jaguars.svg",
    "pngPath": "/brand/sports/nfl/r1/png/jacksonville-jaguars.png"
  },
  "nfl.kansas-city-chiefs": {
    "id": "nfl.kansas-city-chiefs",
    "slug": "kansas-city-chiefs",
    "league": "nfl",
    "code": "KC",
    "name": "Kansas City Chiefs",
    "shortName": "Kansas City Chiefs",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/kansas-city-chiefs.svg",
    "pngPath": "/brand/sports/nfl/r1/png/kansas-city-chiefs.png"
  },
  "nfl.las-vegas-raiders": {
    "id": "nfl.las-vegas-raiders",
    "slug": "las-vegas-raiders",
    "league": "nfl",
    "code": "LV",
    "name": "Las Vegas Raiders",
    "shortName": "Las Vegas Raiders",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/las-vegas-raiders.svg",
    "pngPath": "/brand/sports/nfl/r1/png/las-vegas-raiders.png"
  },
  "nfl.los-angeles-chargers": {
    "id": "nfl.los-angeles-chargers",
    "slug": "los-angeles-chargers",
    "league": "nfl",
    "code": "LAC",
    "name": "Los Angeles Chargers",
    "shortName": "Los Angeles Chargers",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/los-angeles-chargers.svg",
    "pngPath": "/brand/sports/nfl/r1/png/los-angeles-chargers.png"
  },
  "nfl.los-angeles-rams": {
    "id": "nfl.los-angeles-rams",
    "slug": "los-angeles-rams",
    "league": "nfl",
    "code": "LAR",
    "name": "Los Angeles Rams",
    "shortName": "Los Angeles Rams",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/los-angeles-rams.svg",
    "pngPath": "/brand/sports/nfl/r1/png/los-angeles-rams.png"
  },
  "nfl.miami-dolphins": {
    "id": "nfl.miami-dolphins",
    "slug": "miami-dolphins",
    "league": "nfl",
    "code": "MIA",
    "name": "Miami Dolphins",
    "shortName": "Miami Dolphins",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/miami-dolphins.svg",
    "pngPath": "/brand/sports/nfl/r1/png/miami-dolphins.png"
  },
  "nfl.minnesota-vikings": {
    "id": "nfl.minnesota-vikings",
    "slug": "minnesota-vikings",
    "league": "nfl",
    "code": "MIN",
    "name": "Minnesota Vikings",
    "shortName": "Minnesota Vikings",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/minnesota-vikings.svg",
    "pngPath": "/brand/sports/nfl/r1/png/minnesota-vikings.png"
  },
  "nfl.new-england-patriots": {
    "id": "nfl.new-england-patriots",
    "slug": "new-england-patriots",
    "league": "nfl",
    "code": "NE",
    "name": "New England Patriots",
    "shortName": "New England Patriots",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/new-england-patriots.svg",
    "pngPath": "/brand/sports/nfl/r1/png/new-england-patriots.png"
  },
  "nfl.new-orleans-saints": {
    "id": "nfl.new-orleans-saints",
    "slug": "new-orleans-saints",
    "league": "nfl",
    "code": "NO",
    "name": "New Orleans Saints",
    "shortName": "New Orleans Saints",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/new-orleans-saints.svg",
    "pngPath": "/brand/sports/nfl/r1/png/new-orleans-saints.png"
  },
  "nfl.new-york-giants": {
    "id": "nfl.new-york-giants",
    "slug": "new-york-giants",
    "league": "nfl",
    "code": "NYG",
    "name": "New York Giants",
    "shortName": "New York Giants",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/new-york-giants.svg",
    "pngPath": "/brand/sports/nfl/r1/png/new-york-giants.png"
  },
  "nfl.new-york-jets": {
    "id": "nfl.new-york-jets",
    "slug": "new-york-jets",
    "league": "nfl",
    "code": "NYJ",
    "name": "New York Jets",
    "shortName": "New York Jets",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/new-york-jets.svg",
    "pngPath": "/brand/sports/nfl/r1/png/new-york-jets.png"
  },
  "nfl.philadelphia-eagles": {
    "id": "nfl.philadelphia-eagles",
    "slug": "philadelphia-eagles",
    "league": "nfl",
    "code": "PHI",
    "name": "Philadelphia Eagles",
    "shortName": "Philadelphia Eagles",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/philadelphia-eagles.svg",
    "pngPath": "/brand/sports/nfl/r1/png/philadelphia-eagles.png"
  },
  "nfl.pittsburgh-steelers": {
    "id": "nfl.pittsburgh-steelers",
    "slug": "pittsburgh-steelers",
    "league": "nfl",
    "code": "PIT",
    "name": "Pittsburgh Steelers",
    "shortName": "Pittsburgh Steelers",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/pittsburgh-steelers.svg",
    "pngPath": "/brand/sports/nfl/r1/png/pittsburgh-steelers.png"
  },
  "nfl.san-francisco-49ers": {
    "id": "nfl.san-francisco-49ers",
    "slug": "san-francisco-49ers",
    "league": "nfl",
    "code": "SF",
    "name": "San Francisco 49ers",
    "shortName": "San Francisco 49ers",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/san-francisco-49ers.svg",
    "pngPath": "/brand/sports/nfl/r1/png/san-francisco-49ers.png"
  },
  "nfl.seattle-seahawks": {
    "id": "nfl.seattle-seahawks",
    "slug": "seattle-seahawks",
    "league": "nfl",
    "code": "SEA",
    "name": "Seattle Seahawks",
    "shortName": "Seattle Seahawks",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/seattle-seahawks.svg",
    "pngPath": "/brand/sports/nfl/r1/png/seattle-seahawks.png"
  },
  "nfl.tampa-bay-buccaneers": {
    "id": "nfl.tampa-bay-buccaneers",
    "slug": "tampa-bay-buccaneers",
    "league": "nfl",
    "code": "TB",
    "name": "Tampa Bay Buccaneers",
    "shortName": "Tampa Bay Buccaneers",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/tampa-bay-buccaneers.svg",
    "pngPath": "/brand/sports/nfl/r1/png/tampa-bay-buccaneers.png"
  },
  "nfl.tennessee-titans": {
    "id": "nfl.tennessee-titans",
    "slug": "tennessee-titans",
    "league": "nfl",
    "code": "TEN",
    "name": "Tennessee Titans",
    "shortName": "Tennessee Titans",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/tennessee-titans.svg",
    "pngPath": "/brand/sports/nfl/r1/png/tennessee-titans.png"
  },
  "nfl.washington-commanders": {
    "id": "nfl.washington-commanders",
    "slug": "washington-commanders",
    "league": "nfl",
    "code": "WAS",
    "name": "Washington Commanders",
    "shortName": "Washington Commanders",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/washington-commanders.svg",
    "pngPath": "/brand/sports/nfl/r1/png/washington-commanders.png"
  }
};

export const MASCOT_EDITIONS = ["american-football","champions-league","europa-league","laliga","liga-mx","mlb","ncaa-fbs","nfl","nhl","premier-league","radar","soccer"] as const;
export type MascotEdition = (typeof MASCOT_EDITIONS)[number];
