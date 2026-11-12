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
  colors: readonly [string, string];
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
  "bundesliga": {
    "id": "bundesliga",
    "code": "BL",
    "name": "Bundesliga",
    "shortName": "Bundesliga",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/bundesliga.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/bundesliga.png"
  },
  "serie-a": {
    "id": "serie-a",
    "code": "SA",
    "name": "Serie A",
    "shortName": "Serie A",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/serie-a.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/serie-a.png"
  },
  "ligue-1": {
    "id": "ligue-1",
    "code": "L1",
    "name": "Ligue 1",
    "shortName": "Ligue 1",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/ligue-1.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/ligue-1.png"
  },
  "nfl": {
    "id": "nfl",
    "code": "NFL",
    "name": "NFL",
    "shortName": "NFL",
    "revision": 1,
    "svgPath": "/brand/sports/nfl/r1/svg/nfl.svg",
    "pngPath": "/brand/sports/nfl/r1/png/nfl.png"
  },
  "mlb": {
    "id": "mlb",
    "code": "MLB",
    "name": "Major League Baseball",
    "shortName": "MLB",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/mlb.svg",
    "pngPath": "/brand/sports/mlb/r1/png/mlb.png"
  },
  "nhl": {
    "id": "nhl",
    "code": "NHL",
    "name": "National Hockey League",
    "shortName": "NHL",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/nhl.svg",
    "pngPath": "/brand/sports/nhl/r1/png/nhl.png"
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
    "pngPath": "/brand/sports/liga-mx/r1/png/america.png",
    "colors": [
      "#F9E08B",
      "#B52D3B"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/atlante.png",
    "colors": [
      "#AB263E",
      "#122746"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/atlas.png",
    "colors": [
      "#B4283B",
      "#B4283B"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/atletico-san-luis.png",
    "colors": [
      "#B42B42",
      "#19385C"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/chivas.png",
    "colors": [
      "#BC2D42",
      "#173456"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/cruz-azul.png",
    "colors": [
      "#11376F",
      "#17468C"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/fc-juarez.png",
    "colors": [
      "#A6DB63",
      "#C93444"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/leon.png",
    "colors": [
      "#FFDB80",
      "#075840"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/monterrey.png",
    "colors": [
      "#163252",
      "#163252"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/necaxa.png",
    "colors": [
      "#A72539",
      "#D54451"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/pachuca.png",
    "colors": [
      "#204275",
      "#96B8D7"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/puebla.png",
    "colors": [
      "#1D609C",
      "#9FC9E5"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/pumas-unam.png",
    "colors": [
      "#F2CD78",
      "#172D4A"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/queretaro.png",
    "colors": [
      "#D34B55",
      "#3180C1"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/santos-laguna.png",
    "colors": [
      "#E9B95F",
      "#0D6046"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/tigres-uanl.png",
    "colors": [
      "#FFC445",
      "#17448B"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/tijuana.png",
    "colors": [
      "#9A243A",
      "#242833"
    ]
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
    "pngPath": "/brand/sports/liga-mx/r1/png/toluca.png",
    "colors": [
      "#B5233A",
      "#731C32"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/afc-bournemouth.png",
    "colors": [
      "#D33647",
      "#D33647"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/arsenal.png",
    "colors": [
      "#9F1A2D",
      "#C32236"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/aston-villa.png",
    "colors": [
      "#FFD482",
      "#641E40"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/brentford.png",
    "colors": [
      "#F6BE68",
      "#AA172C"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/brighton-hove-albion.png",
    "colors": [
      "#0F487F",
      "#1763A7"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/chelsea.png",
    "colors": [
      "#183F88",
      "#9EC0F6"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/coventry-city.png",
    "colors": [
      "#8AC8EC",
      "#173757"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/crystal-palace.png",
    "colors": [
      "#18468F",
      "#C53043"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/everton.png",
    "colors": [
      "#13468F",
      "#13468F"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/fulham.png",
    "colors": [
      "#BB2636",
      "#BB2636"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/hull-city.png",
    "colors": [
      "#F6AF42",
      "#74411F"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/ipswich-town.png",
    "colors": [
      "#214A8D",
      "#C52D43"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/leeds-united.png",
    "colors": [
      "#F9D35F",
      "#1E4581"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/liverpool.png",
    "colors": [
      "#A31C32",
      "#DF4453"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/manchester-city.png",
    "colors": [
      "#F6C562",
      "#9DD6F5"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/manchester-united.png",
    "colors": [
      "#FFD16E",
      "#A1182B"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/newcastle-united.png",
    "colors": [
      "#B9CBD9",
      "#B9CBD9"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/nottingham-forest.png",
    "colors": [
      "#AA2338",
      "#AA2338"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/sunderland.png",
    "colors": [
      "#C22C43",
      "#C22C43"
    ]
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
    "pngPath": "/brand/sports/premier-league/r2/png/tottenham-hotspur.png",
    "colors": [
      "#8199B7",
      "#192F51"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/athletic-club.png",
    "colors": [
      "#B42D44",
      "#263D56"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/atletico-madrid.png",
    "colors": [
      "#B9293F",
      "#233A64"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/osasuna.png",
    "colors": [
      "#F0C771",
      "#8E243D"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/celta-vigo.png",
    "colors": [
      "#8B213F",
      "#A7D5EA"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/alaves.png",
    "colors": [
      "#235B94",
      "#397DB4"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/elche.png",
    "colors": [
      "#12694D",
      "#228369"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/barcelona.png",
    "colors": [
      "#A32149",
      "#F5C767"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/getafe.png",
    "colors": [
      "#1D56A0",
      "#A72A3C"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/levante.png",
    "colors": [
      "#A02444",
      "#F0CC84"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/malaga.png",
    "colors": [
      "#184673",
      "#68A8D7"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/racing-santander.png",
    "colors": [
      "#127451",
      "#E6C774"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/rayo-vallecano.png",
    "colors": [
      "#BD3049",
      "#BD3049"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/deportivo-la-coruna.png",
    "colors": [
      "#795B9F",
      "#795B9F"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/espanyol.png",
    "colors": [
      "#E3AE4D",
      "#235B94"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/real-betis.png",
    "colors": [
      "#08774F",
      "#F8D27C"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/real-madrid.png",
    "colors": [
      "#B72A45",
      "#876021"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/real-sociedad.png",
    "colors": [
      "#EAC782",
      "#225990"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/sevilla.png",
    "colors": [
      "#C64152",
      "#C64152"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/valencia.png",
    "colors": [
      "#F3C358",
      "#C54043"
    ]
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
    "pngPath": "/brand/sports/laliga/r1/png/villarreal.png",
    "colors": [
      "#F8D052",
      "#1B4A78"
    ]
  },
  "bundesliga.augsburg": {
    "id": "bundesliga.augsburg",
    "slug": "augsburg",
    "league": "bundesliga",
    "code": "FCA",
    "name": "FC Augsburg",
    "shortName": "Augsburg",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/augsburg.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/augsburg.png",
    "colors": [
      "#A3293B",
      "#1D513E"
    ]
  },
  "bundesliga.bayer-leverkusen": {
    "id": "bundesliga.bayer-leverkusen",
    "slug": "bayer-leverkusen",
    "league": "bundesliga",
    "code": "B04",
    "name": "Bayer 04 Leverkusen",
    "shortName": "Leverkusen",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/bayer-leverkusen.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/bayer-leverkusen.png",
    "colors": [
      "#D4444C",
      "#D4444C"
    ]
  },
  "bundesliga.bayern-munchen": {
    "id": "bundesliga.bayern-munchen",
    "slug": "bayern-munchen",
    "league": "bundesliga",
    "code": "FCB",
    "name": "FC Bayern München",
    "shortName": "Bayern München",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/bayern-munchen.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/bayern-munchen.png",
    "colors": [
      "#A81E37",
      "#77BFE5"
    ]
  },
  "bundesliga.borussia-dortmund": {
    "id": "bundesliga.borussia-dortmund",
    "slug": "borussia-dortmund",
    "league": "bundesliga",
    "code": "BVB",
    "name": "Borussia Dortmund",
    "shortName": "Dortmund",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/borussia-dortmund.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/borussia-dortmund.png",
    "colors": [
      "#F9CF48",
      "#9D6512"
    ]
  },
  "bundesliga.borussia-monchengladbach": {
    "id": "bundesliga.borussia-monchengladbach",
    "slug": "borussia-monchengladbach",
    "league": "bundesliga",
    "code": "BMG",
    "name": "Borussia Mönchengladbach",
    "shortName": "M’gladbach",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/borussia-monchengladbach.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/borussia-monchengladbach.png",
    "colors": [
      "#347753",
      "#347753"
    ]
  },
  "bundesliga.eintracht-frankfurt": {
    "id": "bundesliga.eintracht-frankfurt",
    "slug": "eintracht-frankfurt",
    "league": "bundesliga",
    "code": "SGE",
    "name": "Eintracht Frankfurt",
    "shortName": "Frankfurt",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/eintracht-frankfurt.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/eintracht-frankfurt.png",
    "colors": [
      "#801D33",
      "#CA3C4D"
    ]
  },
  "bundesliga.elversberg": {
    "id": "bundesliga.elversberg",
    "slug": "elversberg",
    "league": "bundesliga",
    "code": "ELV",
    "name": "SV 07 Elversberg",
    "shortName": "Elversberg",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/elversberg.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/elversberg.png",
    "colors": [
      "#C7AD76",
      "#C7AD76"
    ]
  },
  "bundesliga.freiburg": {
    "id": "bundesliga.freiburg",
    "slug": "freiburg",
    "league": "bundesliga",
    "code": "SCF",
    "name": "SC Freiburg",
    "shortName": "Freiburg",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/freiburg.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/freiburg.png",
    "colors": [
      "#C03546",
      "#C03546"
    ]
  },
  "bundesliga.hamburger": {
    "id": "bundesliga.hamburger",
    "slug": "hamburger",
    "league": "bundesliga",
    "code": "HSV",
    "name": "Hamburger SV",
    "shortName": "Hamburger SV",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/hamburger.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/hamburger.png",
    "colors": [
      "#14539A",
      "#0C3264"
    ]
  },
  "bundesliga.hoffenheim": {
    "id": "bundesliga.hoffenheim",
    "slug": "hoffenheim",
    "league": "bundesliga",
    "code": "TSG",
    "name": "TSG 1899 Hoffenheim",
    "shortName": "Hoffenheim",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/hoffenheim.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/hoffenheim.png",
    "colors": [
      "#184D91",
      "#70BDE1"
    ]
  },
  "bundesliga.koln": {
    "id": "bundesliga.koln",
    "slug": "koln",
    "league": "bundesliga",
    "code": "KOE",
    "name": "1. FC Köln",
    "shortName": "Köln",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/koln.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/koln.png",
    "colors": [
      "#9C2337",
      "#DC9698"
    ]
  },
  "bundesliga.mainz": {
    "id": "bundesliga.mainz",
    "slug": "mainz",
    "league": "bundesliga",
    "code": "M05",
    "name": "1. FSV Mainz 05",
    "shortName": "Mainz 05",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/mainz.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/mainz.png",
    "colors": [
      "#A6223A",
      "#DA9354"
    ]
  },
  "bundesliga.paderborn": {
    "id": "bundesliga.paderborn",
    "slug": "paderborn",
    "league": "bundesliga",
    "code": "SCP",
    "name": "SC Paderborn 07",
    "shortName": "Paderborn",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/paderborn.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/paderborn.png",
    "colors": [
      "#3979C4",
      "#181F32"
    ]
  },
  "bundesliga.rb-leipzig": {
    "id": "bundesliga.rb-leipzig",
    "slug": "rb-leipzig",
    "league": "bundesliga",
    "code": "RBL",
    "name": "RB Leipzig",
    "shortName": "RB Leipzig",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/rb-leipzig.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/rb-leipzig.png",
    "colors": [
      "#DA9A38",
      "#A42038"
    ]
  },
  "bundesliga.schalke": {
    "id": "bundesliga.schalke",
    "slug": "schalke",
    "league": "bundesliga",
    "code": "S04",
    "name": "FC Schalke 04",
    "shortName": "Schalke 04",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/schalke.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/schalke.png",
    "colors": [
      "#164A9A",
      "#8CBCE6"
    ]
  },
  "bundesliga.stuttgart": {
    "id": "bundesliga.stuttgart",
    "slug": "stuttgart",
    "league": "bundesliga",
    "code": "VFB",
    "name": "VfB Stuttgart",
    "shortName": "Stuttgart",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/stuttgart.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/stuttgart.png",
    "colors": [
      "#8B2234",
      "#CD3A48"
    ]
  },
  "bundesliga.union-berlin": {
    "id": "bundesliga.union-berlin",
    "slug": "union-berlin",
    "league": "bundesliga",
    "code": "FCU",
    "name": "1. FC Union Berlin",
    "shortName": "Union Berlin",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/union-berlin.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/union-berlin.png",
    "colors": [
      "#F2BA4B",
      "#A32135"
    ]
  },
  "bundesliga.werder-bremen": {
    "id": "bundesliga.werder-bremen",
    "slug": "werder-bremen",
    "league": "bundesliga",
    "code": "SVW",
    "name": "SV Werder Bremen",
    "shortName": "Werder Bremen",
    "revision": 1,
    "svgPath": "/brand/sports/bundesliga/r1/svg/werder-bremen.svg",
    "pngPath": "/brand/sports/bundesliga/r1/png/werder-bremen.png",
    "colors": [
      "#6ABC91",
      "#126348"
    ]
  },
  "serie-a.milan": {
    "id": "serie-a.milan",
    "slug": "milan",
    "league": "serie-a",
    "code": "MIL",
    "name": "AC Milan",
    "shortName": "Milan",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/milan.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/milan.png",
    "colors": [
      "#C93549",
      "#C93549"
    ]
  },
  "serie-a.monza": {
    "id": "serie-a.monza",
    "slug": "monza",
    "league": "serie-a",
    "code": "MON",
    "name": "AC Monza",
    "shortName": "Monza",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/monza.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/monza.png",
    "colors": [
      "#A32036",
      "#A32036"
    ]
  },
  "serie-a.fiorentina": {
    "id": "serie-a.fiorentina",
    "slug": "fiorentina",
    "league": "serie-a",
    "code": "FIO",
    "name": "ACF Fiorentina",
    "shortName": "Fiorentina",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/fiorentina.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/fiorentina.png",
    "colors": [
      "#512C77",
      "#C16587"
    ]
  },
  "serie-a.roma": {
    "id": "serie-a.roma",
    "slug": "roma",
    "league": "serie-a",
    "code": "ROM",
    "name": "AS Roma",
    "shortName": "Roma",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/roma.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/roma.png",
    "colors": [
      "#D6533E",
      "#7F2536"
    ]
  },
  "serie-a.atalanta-bc": {
    "id": "serie-a.atalanta-bc",
    "slug": "atalanta-bc",
    "league": "serie-a",
    "code": "ATA",
    "name": "Atalanta BC",
    "shortName": "Atalanta",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/atalanta-bc.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/atalanta-bc.png",
    "colors": [
      "#193760",
      "#438DCD"
    ]
  },
  "serie-a.bologna": {
    "id": "serie-a.bologna",
    "slug": "bologna",
    "league": "serie-a",
    "code": "BOL",
    "name": "Bologna FC 1909",
    "shortName": "Bologna",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/bologna.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/bologna.png",
    "colors": [
      "#BE3A51",
      "#242D4D"
    ]
  },
  "serie-a.cagliari": {
    "id": "serie-a.cagliari",
    "slug": "cagliari",
    "league": "serie-a",
    "code": "CAG",
    "name": "Cagliari Calcio",
    "shortName": "Cagliari",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/cagliari.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/cagliari.png",
    "colors": [
      "#C33D51",
      "#20385C"
    ]
  },
  "serie-a.como": {
    "id": "serie-a.como",
    "slug": "como",
    "league": "serie-a",
    "code": "COM",
    "name": "Como 1907",
    "shortName": "Como",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/como.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/como.png",
    "colors": [
      "#19437E",
      "#19437E"
    ]
  },
  "serie-a.internazionale-milano": {
    "id": "serie-a.internazionale-milano",
    "slug": "internazionale-milano",
    "league": "serie-a",
    "code": "INT",
    "name": "FC Internazionale Milano",
    "shortName": "Inter",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/internazionale-milano.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/internazionale-milano.png",
    "colors": [
      "#3D88C5",
      "#152743"
    ]
  },
  "serie-a.frosinone": {
    "id": "serie-a.frosinone",
    "slug": "frosinone",
    "league": "serie-a",
    "code": "FRO",
    "name": "Frosinone Calcio",
    "shortName": "Frosinone",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/frosinone.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/frosinone.png",
    "colors": [
      "#F4C940",
      "#A76B18"
    ]
  },
  "serie-a.genoa-cfc": {
    "id": "serie-a.genoa-cfc",
    "slug": "genoa-cfc",
    "league": "serie-a",
    "code": "GEN",
    "name": "Genoa CFC",
    "shortName": "Genoa",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/genoa-cfc.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/genoa-cfc.png",
    "colors": [
      "#B93247",
      "#22345A"
    ]
  },
  "serie-a.juventus": {
    "id": "serie-a.juventus",
    "slug": "juventus",
    "league": "serie-a",
    "code": "JUV",
    "name": "Juventus FC",
    "shortName": "Juventus",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/juventus.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/juventus.png",
    "colors": [
      "#AD8D4E",
      "#AD8D4E"
    ]
  },
  "serie-a.lazio": {
    "id": "serie-a.lazio",
    "slug": "lazio",
    "league": "serie-a",
    "code": "LAZ",
    "name": "SS Lazio",
    "shortName": "Lazio",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/lazio.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/lazio.png",
    "colors": [
      "#173A64",
      "#F9E7B9"
    ]
  },
  "serie-a.lecce": {
    "id": "serie-a.lecce",
    "slug": "lecce",
    "league": "serie-a",
    "code": "LEC",
    "name": "US Lecce",
    "shortName": "Lecce",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/lecce.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/lecce.png",
    "colors": [
      "#9C263D",
      "#FFE38E"
    ]
  },
  "serie-a.napoli": {
    "id": "serie-a.napoli",
    "slug": "napoli",
    "league": "serie-a",
    "code": "NAP",
    "name": "SSC Napoli",
    "shortName": "Napoli",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/napoli.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/napoli.png",
    "colors": [
      "#12649A",
      "#12649A"
    ]
  },
  "serie-a.parma": {
    "id": "serie-a.parma",
    "slug": "parma",
    "league": "serie-a",
    "code": "PAR",
    "name": "Parma Calcio 1913",
    "shortName": "Parma",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/parma.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/parma.png",
    "colors": [
      "#F5D968",
      "#28579A"
    ]
  },
  "serie-a.sassuolo": {
    "id": "serie-a.sassuolo",
    "slug": "sassuolo",
    "league": "serie-a",
    "code": "SAS",
    "name": "US Sassuolo Calcio",
    "shortName": "Sassuolo",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/sassuolo.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/sassuolo.png",
    "colors": [
      "#4D9871",
      "#19372F"
    ]
  },
  "serie-a.torino": {
    "id": "serie-a.torino",
    "slug": "torino",
    "league": "serie-a",
    "code": "TOR",
    "name": "Torino FC",
    "shortName": "Torino",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/torino.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/torino.png",
    "colors": [
      "#792338",
      "#C35C57"
    ]
  },
  "serie-a.udinese": {
    "id": "serie-a.udinese",
    "slug": "udinese",
    "league": "serie-a",
    "code": "UDI",
    "name": "Udinese Calcio",
    "shortName": "Udinese",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/udinese.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/udinese.png",
    "colors": [
      "#5940B2",
      "#1F6F99"
    ]
  },
  "serie-a.venezia": {
    "id": "serie-a.venezia",
    "slug": "venezia",
    "league": "serie-a",
    "code": "VEN",
    "name": "Venezia FC",
    "shortName": "Venezia",
    "revision": 1,
    "svgPath": "/brand/sports/serie-a/r1/svg/venezia.svg",
    "pngPath": "/brand/sports/serie-a/r1/png/venezia.png",
    "colors": [
      "#223532",
      "#223532"
    ]
  },
  "ligue-1.angers-sco": {
    "id": "ligue-1.angers-sco",
    "slug": "angers-sco",
    "league": "ligue-1",
    "code": "SCO",
    "name": "Angers SCO",
    "shortName": "Angers",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/angers-sco.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/angers-sco.png",
    "colors": [
      "#B69A65",
      "#B69A65"
    ]
  },
  "ligue-1.aj-auxerre": {
    "id": "ligue-1.aj-auxerre",
    "slug": "aj-auxerre",
    "league": "ligue-1",
    "code": "AJA",
    "name": "AJ Auxerre",
    "shortName": "Auxerre",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/aj-auxerre.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/aj-auxerre.png",
    "colors": [
      "#77BFE5",
      "#1C4D83"
    ]
  },
  "ligue-1.stade-brestois": {
    "id": "ligue-1.stade-brestois",
    "slug": "stade-brestois",
    "league": "ligue-1",
    "code": "SB29",
    "name": "Stade Brestois 29",
    "shortName": "Brest",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/stade-brestois.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/stade-brestois.png",
    "colors": [
      "#E8A271",
      "#AD2943"
    ]
  },
  "ligue-1.le-havre": {
    "id": "ligue-1.le-havre",
    "slug": "le-havre",
    "league": "ligue-1",
    "code": "HAC",
    "name": "Le Havre AC",
    "shortName": "Le Havre",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/le-havre.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/le-havre.png",
    "colors": [
      "#18395E",
      "#18395E"
    ]
  },
  "ligue-1.le-mans": {
    "id": "ligue-1.le-mans",
    "slug": "le-mans",
    "league": "ligue-1",
    "code": "LMFC",
    "name": "Le Mans FC",
    "shortName": "Le Mans",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/le-mans.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/le-mans.png",
    "colors": [
      "#FFE389",
      "#982437"
    ]
  },
  "ligue-1.racing-lens": {
    "id": "ligue-1.racing-lens",
    "slug": "racing-lens",
    "league": "ligue-1",
    "code": "RCL",
    "name": "Racing Club de Lens",
    "shortName": "Lens",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/racing-lens.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/racing-lens.png",
    "colors": [
      "#FFDC6F",
      "#EC864F"
    ]
  },
  "ligue-1.lorient": {
    "id": "ligue-1.lorient",
    "slug": "lorient",
    "league": "ligue-1",
    "code": "FCL",
    "name": "FC Lorient",
    "shortName": "Lorient",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/lorient.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/lorient.png",
    "colors": [
      "#5940B2",
      "#1F6F99"
    ]
  },
  "ligue-1.lille-osc": {
    "id": "ligue-1.lille-osc",
    "slug": "lille-osc",
    "league": "ligue-1",
    "code": "LOSC",
    "name": "Lille OSC",
    "shortName": "Lille",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/lille-osc.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/lille-osc.png",
    "colors": [
      "#C93950",
      "#233658"
    ]
  },
  "ligue-1.olympique-lyonnais": {
    "id": "ligue-1.olympique-lyonnais",
    "slug": "olympique-lyonnais",
    "league": "ligue-1",
    "code": "OL",
    "name": "Olympique Lyonnais",
    "shortName": "Lyon",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/olympique-lyonnais.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/olympique-lyonnais.png",
    "colors": [
      "#C73A4F",
      "#243B68"
    ]
  },
  "ligue-1.olympique-marseille": {
    "id": "ligue-1.olympique-marseille",
    "slug": "olympique-marseille",
    "league": "ligue-1",
    "code": "OM",
    "name": "Olympique de Marseille",
    "shortName": "Marseille",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/olympique-marseille.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/olympique-marseille.png",
    "colors": [
      "#156487",
      "#156487"
    ]
  },
  "ligue-1.monaco": {
    "id": "ligue-1.monaco",
    "slug": "monaco",
    "league": "ligue-1",
    "code": "ASM",
    "name": "AS Monaco FC",
    "shortName": "Monaco",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/monaco.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/monaco.png",
    "colors": [
      "#DCA459",
      "#A2273D"
    ]
  },
  "ligue-1.ogc-nice": {
    "id": "ligue-1.ogc-nice",
    "slug": "ogc-nice",
    "league": "ligue-1",
    "code": "OGCN",
    "name": "OGC Nice",
    "shortName": "Nice",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/ogc-nice.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/ogc-nice.png",
    "colors": [
      "#CE3D49",
      "#CE3D49"
    ]
  },
  "ligue-1.paris": {
    "id": "ligue-1.paris",
    "slug": "paris",
    "league": "ligue-1",
    "code": "PFC",
    "name": "Paris FC",
    "shortName": "Paris FC",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/paris.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/paris.png",
    "colors": [
      "#263B63",
      "#263B63"
    ]
  },
  "ligue-1.paris-saint-germain": {
    "id": "ligue-1.paris-saint-germain",
    "slug": "paris-saint-germain",
    "league": "ligue-1",
    "code": "PSG",
    "name": "Paris Saint-Germain FC",
    "shortName": "Paris SG",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/paris-saint-germain.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/paris-saint-germain.png",
    "colors": [
      "#CC3A53",
      "#1E365E"
    ]
  },
  "ligue-1.stade-rennais": {
    "id": "ligue-1.stade-rennais",
    "slug": "stade-rennais",
    "league": "ligue-1",
    "code": "SRFC",
    "name": "Stade Rennais FC 1901",
    "shortName": "Rennes",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/stade-rennais.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/stade-rennais.png",
    "colors": [
      "#90253B",
      "#90253B"
    ]
  },
  "ligue-1.strasbourg-alsace": {
    "id": "ligue-1.strasbourg-alsace",
    "slug": "strasbourg-alsace",
    "league": "ligue-1",
    "code": "RCSA",
    "name": "RC Strasbourg Alsace",
    "shortName": "Strasbourg",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/strasbourg-alsace.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/strasbourg-alsace.png",
    "colors": [
      "#195288",
      "#D24D5D"
    ]
  },
  "ligue-1.toulouse": {
    "id": "ligue-1.toulouse",
    "slug": "toulouse",
    "league": "ligue-1",
    "code": "TFC",
    "name": "Toulouse FC",
    "shortName": "Toulouse",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/toulouse.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/toulouse.png",
    "colors": [
      "#512D76",
      "#AF80C4"
    ]
  },
  "ligue-1.es-troyes": {
    "id": "ligue-1.es-troyes",
    "slug": "es-troyes",
    "league": "ligue-1",
    "code": "ESTAC",
    "name": "ES Troyes AC",
    "shortName": "Troyes",
    "revision": 1,
    "svgPath": "/brand/sports/ligue-1/r1/svg/es-troyes.svg",
    "pngPath": "/brand/sports/ligue-1/r1/png/es-troyes.png",
    "colors": [
      "#72B4D7",
      "#253F75"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/arizona-cardinals.png",
    "colors": [
      "#8D2139",
      "#3B2430"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/atlanta-falcons.png",
    "colors": [
      "#A3243F",
      "#B82A46"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/baltimore-ravens.png",
    "colors": [
      "#F6D378",
      "#402C73"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/buffalo-bills.png",
    "colors": [
      "#245498",
      "#CC3952"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/carolina-panthers.png",
    "colors": [
      "#6ECAF1",
      "#2E4766"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/chicago-bears.png",
    "colors": [
      "#FFAA61",
      "#172E4B"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/cincinnati-bengals.png",
    "colors": [
      "#FFB071",
      "#F58542"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/cleveland-browns.png",
    "colors": [
      "#FF984B",
      "#654034"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/dallas-cowboys.png",
    "colors": [
      "#213A57",
      "#294361"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/denver-broncos.png",
    "colors": [
      "#D7613F",
      "#224461"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/detroit-lions.png",
    "colors": [
      "#17638F",
      "#17638F"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/green-bay-packers.png",
    "colors": [
      "#244737",
      "#244737"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/houston-texans.png",
    "colors": [
      "#A7253E",
      "#333F61"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/indianapolis-colts.png",
    "colors": [
      "#244F90",
      "#244F90"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/jacksonville-jaguars.png",
    "colors": [
      "#F4CE78",
      "#286068"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/kansas-city-chiefs.png",
    "colors": [
      "#AA2743",
      "#BE3D51"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/las-vegas-raiders.png",
    "colors": [
      "#5940B2",
      "#1F6F99"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/los-angeles-chargers.png",
    "colors": [
      "#FFD16C",
      "#145A8F"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/los-angeles-rams.png",
    "colors": [
      "#FFCB58",
      "#123A72"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/miami-dolphins.png",
    "colors": [
      "#176B70",
      "#C94F3B"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/minnesota-vikings.png",
    "colors": [
      "#F8CD68",
      "#4A347D"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/new-england-patriots.png",
    "colors": [
      "#B83149",
      "#1E3A5C"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/new-orleans-saints.png",
    "colors": [
      "#F0CE85",
      "#F0CE85"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/new-york-giants.png",
    "colors": [
      "#B42B46",
      "#244C91"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/new-york-jets.png",
    "colors": [
      "#155746",
      "#155746"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/philadelphia-eagles.png",
    "colors": [
      "#2A5D5E",
      "#135152"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/pittsburgh-steelers.png",
    "colors": [
      "#F8CB55",
      "#E45363"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/san-francisco-49ers.png",
    "colors": [
      "#F1C977",
      "#932A42"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/seattle-seahawks.png",
    "colors": [
      "#70AD4B",
      "#34556C"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/tampa-bay-buccaneers.png",
    "colors": [
      "#7C2E42",
      "#702A3A"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/tennessee-titans.png",
    "colors": [
      "#C63E54",
      "#1D3A5E"
    ]
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
    "pngPath": "/brand/sports/nfl/r1/png/washington-commanders.png",
    "colors": [
      "#69233C",
      "#B26455"
    ]
  },
  "mlb.arizona-diamondbacks": {
    "id": "mlb.arizona-diamondbacks",
    "slug": "arizona-diamondbacks",
    "league": "mlb",
    "code": "AZ",
    "name": "Arizona Diamondbacks",
    "shortName": "Diamondbacks",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/arizona-diamondbacks.svg",
    "pngPath": "/brand/sports/mlb/r1/png/arizona-diamondbacks.png",
    "colors": [
      "#7D2539",
      "#F9DFB3"
    ]
  },
  "mlb.athletics": {
    "id": "mlb.athletics",
    "slug": "athletics",
    "league": "mlb",
    "code": "ATH",
    "name": "Athletics",
    "shortName": "Athletics",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/athletics.svg",
    "pngPath": "/brand/sports/mlb/r1/png/athletics.png",
    "colors": [
      "#CA9C3F",
      "#FFE1A0"
    ]
  },
  "mlb.atlanta-braves": {
    "id": "mlb.atlanta-braves",
    "slug": "atlanta-braves",
    "league": "mlb",
    "code": "ATL",
    "name": "Atlanta Braves",
    "shortName": "Braves",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/atlanta-braves.svg",
    "pngPath": "/brand/sports/mlb/r1/png/atlanta-braves.png",
    "colors": [
      "#C93E54",
      "#273954"
    ]
  },
  "mlb.baltimore-orioles": {
    "id": "mlb.baltimore-orioles",
    "slug": "baltimore-orioles",
    "league": "mlb",
    "code": "BAL",
    "name": "Baltimore Orioles",
    "shortName": "Orioles",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/baltimore-orioles.svg",
    "pngPath": "/brand/sports/mlb/r1/png/baltimore-orioles.png",
    "colors": [
      "#F5A157",
      "#F5A157"
    ]
  },
  "mlb.boston-red-sox": {
    "id": "mlb.boston-red-sox",
    "slug": "boston-red-sox",
    "league": "mlb",
    "code": "BOS",
    "name": "Boston Red Sox",
    "shortName": "Red Sox",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/boston-red-sox.svg",
    "pngPath": "/brand/sports/mlb/r1/png/boston-red-sox.png",
    "colors": [
      "#A02741",
      "#263A58"
    ]
  },
  "mlb.chicago-cubs": {
    "id": "mlb.chicago-cubs",
    "slug": "chicago-cubs",
    "league": "mlb",
    "code": "CHC",
    "name": "Chicago Cubs",
    "shortName": "Cubs",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/chicago-cubs.svg",
    "pngPath": "/brand/sports/mlb/r1/png/chicago-cubs.png",
    "colors": [
      "#234D91",
      "#CA4253"
    ]
  },
  "mlb.chicago-white-sox": {
    "id": "mlb.chicago-white-sox",
    "slug": "chicago-white-sox",
    "league": "mlb",
    "code": "CWS",
    "name": "Chicago White Sox",
    "shortName": "White Sox",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/chicago-white-sox.svg",
    "pngPath": "/brand/sports/mlb/r1/png/chicago-white-sox.png",
    "colors": [
      "#5940B2",
      "#1F6F99"
    ]
  },
  "mlb.cincinnati-reds": {
    "id": "mlb.cincinnati-reds",
    "slug": "cincinnati-reds",
    "league": "mlb",
    "code": "CIN",
    "name": "Cincinnati Reds",
    "shortName": "Reds",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/cincinnati-reds.svg",
    "pngPath": "/brand/sports/mlb/r1/png/cincinnati-reds.png",
    "colors": [
      "#A3233B",
      "#DB766B"
    ]
  },
  "mlb.cleveland-guardians": {
    "id": "mlb.cleveland-guardians",
    "slug": "cleveland-guardians",
    "league": "mlb",
    "code": "CLE",
    "name": "Cleveland Guardians",
    "shortName": "Guardians",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/cleveland-guardians.svg",
    "pngPath": "/brand/sports/mlb/r1/png/cleveland-guardians.png",
    "colors": [
      "#D34957",
      "#243655"
    ]
  },
  "mlb.colorado-rockies": {
    "id": "mlb.colorado-rockies",
    "slug": "colorado-rockies",
    "league": "mlb",
    "code": "COL",
    "name": "Colorado Rockies",
    "shortName": "Rockies",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/colorado-rockies.svg",
    "pngPath": "/brand/sports/mlb/r1/png/colorado-rockies.png",
    "colors": [
      "#9E87C9",
      "#3D2F60"
    ]
  },
  "mlb.detroit-tigers": {
    "id": "mlb.detroit-tigers",
    "slug": "detroit-tigers",
    "league": "mlb",
    "code": "DET",
    "name": "Detroit Tigers",
    "shortName": "Tigers",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/detroit-tigers.svg",
    "pngPath": "/brand/sports/mlb/r1/png/detroit-tigers.png",
    "colors": [
      "#FFB06B",
      "#203551"
    ]
  },
  "mlb.houston-astros": {
    "id": "mlb.houston-astros",
    "slug": "houston-astros",
    "league": "mlb",
    "code": "HOU",
    "name": "Houston Astros",
    "shortName": "Astros",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/houston-astros.svg",
    "pngPath": "/brand/sports/mlb/r1/png/houston-astros.png",
    "colors": [
      "#233757",
      "#233757"
    ]
  },
  "mlb.kansas-city-royals": {
    "id": "mlb.kansas-city-royals",
    "slug": "kansas-city-royals",
    "league": "mlb",
    "code": "KC",
    "name": "Kansas City Royals",
    "shortName": "Royals",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/kansas-city-royals.svg",
    "pngPath": "/brand/sports/mlb/r1/png/kansas-city-royals.png",
    "colors": [
      "#DEB052",
      "#254F89"
    ]
  },
  "mlb.los-angeles-angels": {
    "id": "mlb.los-angeles-angels",
    "slug": "los-angeles-angels",
    "league": "mlb",
    "code": "LAA",
    "name": "Los Angeles Angels",
    "shortName": "Angels",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/los-angeles-angels.svg",
    "pngPath": "/brand/sports/mlb/r1/png/los-angeles-angels.png",
    "colors": [
      "#8F2740",
      "#8F2740"
    ]
  },
  "mlb.los-angeles-dodgers": {
    "id": "mlb.los-angeles-dodgers",
    "slug": "los-angeles-dodgers",
    "league": "mlb",
    "code": "LAD",
    "name": "Los Angeles Dodgers",
    "shortName": "Dodgers",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/los-angeles-dodgers.svg",
    "pngPath": "/brand/sports/mlb/r1/png/los-angeles-dodgers.png",
    "colors": [
      "#1C4C8C",
      "#CA3C55"
    ]
  },
  "mlb.miami-marlins": {
    "id": "mlb.miami-marlins",
    "slug": "miami-marlins",
    "league": "mlb",
    "code": "MIA",
    "name": "Miami Marlins",
    "shortName": "Marlins",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/miami-marlins.svg",
    "pngPath": "/brand/sports/mlb/r1/png/miami-marlins.png",
    "colors": [
      "#90E1DB",
      "#193940"
    ]
  },
  "mlb.milwaukee-brewers": {
    "id": "mlb.milwaukee-brewers",
    "slug": "milwaukee-brewers",
    "league": "mlb",
    "code": "MIL",
    "name": "Milwaukee Brewers",
    "shortName": "Brewers",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/milwaukee-brewers.svg",
    "pngPath": "/brand/sports/mlb/r1/png/milwaukee-brewers.png",
    "colors": [
      "#CE9B39",
      "#FFE3A0"
    ]
  },
  "mlb.minnesota-twins": {
    "id": "mlb.minnesota-twins",
    "slug": "minnesota-twins",
    "league": "mlb",
    "code": "MIN",
    "name": "Minnesota Twins",
    "shortName": "Twins",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/minnesota-twins.svg",
    "pngPath": "/brand/sports/mlb/r1/png/minnesota-twins.png",
    "colors": [
      "#24375B",
      "#24375B"
    ]
  },
  "mlb.new-york-mets": {
    "id": "mlb.new-york-mets",
    "slug": "new-york-mets",
    "league": "mlb",
    "code": "NYM",
    "name": "New York Mets",
    "shortName": "Mets",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/new-york-mets.svg",
    "pngPath": "/brand/sports/mlb/r1/png/new-york-mets.png",
    "colors": [
      "#234883",
      "#234883"
    ]
  },
  "mlb.new-york-yankees": {
    "id": "mlb.new-york-yankees",
    "slug": "new-york-yankees",
    "league": "mlb",
    "code": "NYY",
    "name": "New York Yankees",
    "shortName": "Yankees",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/new-york-yankees.svg",
    "pngPath": "/brand/sports/mlb/r1/png/new-york-yankees.png",
    "colors": [
      "#AC4C57",
      "#22344E"
    ]
  },
  "mlb.philadelphia-phillies": {
    "id": "mlb.philadelphia-phillies",
    "slug": "philadelphia-phillies",
    "league": "mlb",
    "code": "PHI",
    "name": "Philadelphia Phillies",
    "shortName": "Phillies",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/philadelphia-phillies.svg",
    "pngPath": "/brand/sports/mlb/r1/png/philadelphia-phillies.png",
    "colors": [
      "#E9A377",
      "#982940"
    ]
  },
  "mlb.pittsburgh-pirates": {
    "id": "mlb.pittsburgh-pirates",
    "slug": "pittsburgh-pirates",
    "league": "mlb",
    "code": "PIT",
    "name": "Pittsburgh Pirates",
    "shortName": "Pirates",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/pittsburgh-pirates.svg",
    "pngPath": "/brand/sports/mlb/r1/png/pittsburgh-pirates.png",
    "colors": [
      "#FFDB74",
      "#FFDB74"
    ]
  },
  "mlb.san-diego-padres": {
    "id": "mlb.san-diego-padres",
    "slug": "san-diego-padres",
    "league": "mlb",
    "code": "SD",
    "name": "San Diego Padres",
    "shortName": "Padres",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/san-diego-padres.svg",
    "pngPath": "/brand/sports/mlb/r1/png/san-diego-padres.png",
    "colors": [
      "#CF9650",
      "#FFE3A1"
    ]
  },
  "mlb.san-francisco-giants": {
    "id": "mlb.san-francisco-giants",
    "slug": "san-francisco-giants",
    "league": "mlb",
    "code": "SF",
    "name": "San Francisco Giants",
    "shortName": "Giants",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/san-francisco-giants.svg",
    "pngPath": "/brand/sports/mlb/r1/png/san-francisco-giants.png",
    "colors": [
      "#FFA56B",
      "#FFA56B"
    ]
  },
  "mlb.seattle-mariners": {
    "id": "mlb.seattle-mariners",
    "slug": "seattle-mariners",
    "league": "mlb",
    "code": "SEA",
    "name": "Seattle Mariners",
    "shortName": "Mariners",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/seattle-mariners.svg",
    "pngPath": "/brand/sports/mlb/r1/png/seattle-mariners.png",
    "colors": [
      "#59B8AA",
      "#20394F"
    ]
  },
  "mlb.st-louis-cardinals": {
    "id": "mlb.st-louis-cardinals",
    "slug": "st-louis-cardinals",
    "league": "mlb",
    "code": "STL",
    "name": "St. Louis Cardinals",
    "shortName": "Cardinals",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/st-louis-cardinals.svg",
    "pngPath": "/brand/sports/mlb/r1/png/st-louis-cardinals.png",
    "colors": [
      "#E0A044",
      "#8C253A"
    ]
  },
  "mlb.tampa-bay-rays": {
    "id": "mlb.tampa-bay-rays",
    "slug": "tampa-bay-rays",
    "league": "mlb",
    "code": "TB",
    "name": "Tampa Bay Rays",
    "shortName": "Rays",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/tampa-bay-rays.svg",
    "pngPath": "/brand/sports/mlb/r1/png/tampa-bay-rays.png",
    "colors": [
      "#1C375E",
      "#1C375E"
    ]
  },
  "mlb.texas-rangers": {
    "id": "mlb.texas-rangers",
    "slug": "texas-rangers",
    "league": "mlb",
    "code": "TEX",
    "name": "Texas Rangers",
    "shortName": "Rangers",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/texas-rangers.svg",
    "pngPath": "/brand/sports/mlb/r1/png/texas-rangers.png",
    "colors": [
      "#D44E56",
      "#23477E"
    ]
  },
  "mlb.toronto-blue-jays": {
    "id": "mlb.toronto-blue-jays",
    "slug": "toronto-blue-jays",
    "league": "mlb",
    "code": "TOR",
    "name": "Toronto Blue Jays",
    "shortName": "Blue Jays",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/toronto-blue-jays.svg",
    "pngPath": "/brand/sports/mlb/r1/png/toronto-blue-jays.png",
    "colors": [
      "#194681",
      "#D54555"
    ]
  },
  "mlb.washington-nationals": {
    "id": "mlb.washington-nationals",
    "slug": "washington-nationals",
    "league": "mlb",
    "code": "WSH",
    "name": "Washington Nationals",
    "shortName": "Nationals",
    "revision": 1,
    "svgPath": "/brand/sports/mlb/r1/svg/washington-nationals.svg",
    "pngPath": "/brand/sports/mlb/r1/png/washington-nationals.png",
    "colors": [
      "#8F293D",
      "#4B6993"
    ]
  },
  "nhl.anaheim-ducks": {
    "id": "nhl.anaheim-ducks",
    "slug": "anaheim-ducks",
    "league": "nhl",
    "code": "ANA",
    "name": "Anaheim Ducks",
    "shortName": "Ducks",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/anaheim-ducks.svg",
    "pngPath": "/brand/sports/nhl/r1/png/anaheim-ducks.png",
    "colors": [
      "#F38645",
      "#F38645"
    ]
  },
  "nhl.boston-bruins": {
    "id": "nhl.boston-bruins",
    "slug": "boston-bruins",
    "league": "nhl",
    "code": "BOS",
    "name": "Boston Bruins",
    "shortName": "Bruins",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/boston-bruins.svg",
    "pngPath": "/brand/sports/nhl/r1/png/boston-bruins.png",
    "colors": [
      "#FFCB60",
      "#FFCB60"
    ]
  },
  "nhl.buffalo-sabres": {
    "id": "nhl.buffalo-sabres",
    "slug": "buffalo-sabres",
    "league": "nhl",
    "code": "BUF",
    "name": "Buffalo Sabres",
    "shortName": "Sabres",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/buffalo-sabres.svg",
    "pngPath": "/brand/sports/nhl/r1/png/buffalo-sabres.png",
    "colors": [
      "#214580",
      "#FFE291"
    ]
  },
  "nhl.calgary-flames": {
    "id": "nhl.calgary-flames",
    "slug": "calgary-flames",
    "league": "nhl",
    "code": "CGY",
    "name": "Calgary Flames",
    "shortName": "Flames",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/calgary-flames.svg",
    "pngPath": "/brand/sports/nhl/r1/png/calgary-flames.png",
    "colors": [
      "#E7713B",
      "#9C2335"
    ]
  },
  "nhl.carolina-hurricanes": {
    "id": "nhl.carolina-hurricanes",
    "slug": "carolina-hurricanes",
    "league": "nhl",
    "code": "CAR",
    "name": "Carolina Hurricanes",
    "shortName": "Hurricanes",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/carolina-hurricanes.svg",
    "pngPath": "/brand/sports/nhl/r1/png/carolina-hurricanes.png",
    "colors": [
      "#9D2138",
      "#262935"
    ]
  },
  "nhl.chicago-blackhawks": {
    "id": "nhl.chicago-blackhawks",
    "slug": "chicago-blackhawks",
    "league": "nhl",
    "code": "CHI",
    "name": "Chicago Blackhawks",
    "shortName": "Blackhawks",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/chicago-blackhawks.svg",
    "pngPath": "/brand/sports/nhl/r1/png/chicago-blackhawks.png",
    "colors": [
      "#9D2339",
      "#639374"
    ]
  },
  "nhl.colorado-avalanche": {
    "id": "nhl.colorado-avalanche",
    "slug": "colorado-avalanche",
    "league": "nhl",
    "code": "COL",
    "name": "Colorado Avalanche",
    "shortName": "Avalanche",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/colorado-avalanche.svg",
    "pngPath": "/brand/sports/nhl/r1/png/colorado-avalanche.png",
    "colors": [
      "#66283D",
      "#66283D"
    ]
  },
  "nhl.columbus-blue-jackets": {
    "id": "nhl.columbus-blue-jackets",
    "slug": "columbus-blue-jackets",
    "league": "nhl",
    "code": "CBJ",
    "name": "Columbus Blue Jackets",
    "shortName": "Blue Jackets",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/columbus-blue-jackets.svg",
    "pngPath": "/brand/sports/nhl/r1/png/columbus-blue-jackets.png",
    "colors": [
      "#223654",
      "#223654"
    ]
  },
  "nhl.dallas-stars": {
    "id": "nhl.dallas-stars",
    "slug": "dallas-stars",
    "league": "nhl",
    "code": "DAL",
    "name": "Dallas Stars",
    "shortName": "Stars",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/dallas-stars.svg",
    "pngPath": "/brand/sports/nhl/r1/png/dallas-stars.png",
    "colors": [
      "#18523E",
      "#86AF9C"
    ]
  },
  "nhl.detroit-red-wings": {
    "id": "nhl.detroit-red-wings",
    "slug": "detroit-red-wings",
    "league": "nhl",
    "code": "DET",
    "name": "Detroit Red Wings",
    "shortName": "Red Wings",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/detroit-red-wings.svg",
    "pngPath": "/brand/sports/nhl/r1/png/detroit-red-wings.png",
    "colors": [
      "#A22035",
      "#E39382"
    ]
  },
  "nhl.edmonton-oilers": {
    "id": "nhl.edmonton-oilers",
    "slug": "edmonton-oilers",
    "league": "nhl",
    "code": "EDM",
    "name": "Edmonton Oilers",
    "shortName": "Oilers",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/edmonton-oilers.svg",
    "pngPath": "/brand/sports/nhl/r1/png/edmonton-oilers.png",
    "colors": [
      "#F48048",
      "#213650"
    ]
  },
  "nhl.florida-panthers": {
    "id": "nhl.florida-panthers",
    "slug": "florida-panthers",
    "league": "nhl",
    "code": "FLA",
    "name": "Florida Panthers",
    "shortName": "Panthers",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/florida-panthers.svg",
    "pngPath": "/brand/sports/nhl/r1/png/florida-panthers.png",
    "colors": [
      "#782537",
      "#FFE3AE"
    ]
  },
  "nhl.los-angeles-kings": {
    "id": "nhl.los-angeles-kings",
    "slug": "los-angeles-kings",
    "league": "nhl",
    "code": "LAK",
    "name": "Los Angeles Kings",
    "shortName": "Kings",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/los-angeles-kings.svg",
    "pngPath": "/brand/sports/nhl/r1/png/los-angeles-kings.png",
    "colors": [
      "#8C9BAC",
      "#8C9BAC"
    ]
  },
  "nhl.minnesota-wild": {
    "id": "nhl.minnesota-wild",
    "slug": "minnesota-wild",
    "league": "nhl",
    "code": "MIN",
    "name": "Minnesota Wild",
    "shortName": "Wild",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/minnesota-wild.svg",
    "pngPath": "/brand/sports/nhl/r1/png/minnesota-wild.png",
    "colors": [
      "#C9554D",
      "#214B40"
    ]
  },
  "nhl.montreal-canadiens": {
    "id": "nhl.montreal-canadiens",
    "slug": "montreal-canadiens",
    "league": "nhl",
    "code": "MTL",
    "name": "Montréal Canadiens",
    "shortName": "Canadiens",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/montreal-canadiens.svg",
    "pngPath": "/brand/sports/nhl/r1/png/montreal-canadiens.png",
    "colors": [
      "#8E263C",
      "#5F88B8"
    ]
  },
  "nhl.nashville-predators": {
    "id": "nhl.nashville-predators",
    "slug": "nashville-predators",
    "league": "nhl",
    "code": "NSH",
    "name": "Nashville Predators",
    "shortName": "Predators",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/nashville-predators.svg",
    "pngPath": "/brand/sports/nhl/r1/png/nashville-predators.png",
    "colors": [
      "#F6CB55",
      "#243554"
    ]
  },
  "nhl.new-jersey-devils": {
    "id": "nhl.new-jersey-devils",
    "slug": "new-jersey-devils",
    "league": "nhl",
    "code": "NJD",
    "name": "New Jersey Devils",
    "shortName": "Devils",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/new-jersey-devils.svg",
    "pngPath": "/brand/sports/nhl/r1/png/new-jersey-devils.png",
    "colors": [
      "#A02239",
      "#A02239"
    ]
  },
  "nhl.new-york-islanders": {
    "id": "nhl.new-york-islanders",
    "slug": "new-york-islanders",
    "league": "nhl",
    "code": "NYI",
    "name": "New York Islanders",
    "shortName": "Islanders",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/new-york-islanders.svg",
    "pngPath": "/brand/sports/nhl/r1/png/new-york-islanders.png",
    "colors": [
      "#214982",
      "#214982"
    ]
  },
  "nhl.new-york-rangers": {
    "id": "nhl.new-york-rangers",
    "slug": "new-york-rangers",
    "league": "nhl",
    "code": "NYR",
    "name": "New York Rangers",
    "shortName": "Rangers",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/new-york-rangers.svg",
    "pngPath": "/brand/sports/nhl/r1/png/new-york-rangers.png",
    "colors": [
      "#214C88",
      "#C9334D"
    ]
  },
  "nhl.ottawa-senators": {
    "id": "nhl.ottawa-senators",
    "slug": "ottawa-senators",
    "league": "nhl",
    "code": "OTT",
    "name": "Ottawa Senators",
    "shortName": "Senators",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/ottawa-senators.svg",
    "pngPath": "/brand/sports/nhl/r1/png/ottawa-senators.png",
    "colors": [
      "#8C263A",
      "#CB554D"
    ]
  },
  "nhl.philadelphia-flyers": {
    "id": "nhl.philadelphia-flyers",
    "slug": "philadelphia-flyers",
    "league": "nhl",
    "code": "PHI",
    "name": "Philadelphia Flyers",
    "shortName": "Flyers",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/philadelphia-flyers.svg",
    "pngPath": "/brand/sports/nhl/r1/png/philadelphia-flyers.png",
    "colors": [
      "#EF813F",
      "#EF813F"
    ]
  },
  "nhl.pittsburgh-penguins": {
    "id": "nhl.pittsburgh-penguins",
    "slug": "pittsburgh-penguins",
    "league": "nhl",
    "code": "PIT",
    "name": "Pittsburgh Penguins",
    "shortName": "Penguins",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/pittsburgh-penguins.svg",
    "pngPath": "/brand/sports/nhl/r1/png/pittsburgh-penguins.png",
    "colors": [
      "#FFE3A3",
      "#FFE3A3"
    ]
  },
  "nhl.san-jose-sharks": {
    "id": "nhl.san-jose-sharks",
    "slug": "san-jose-sharks",
    "league": "nhl",
    "code": "SJS",
    "name": "San Jose Sharks",
    "shortName": "Sharks",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/san-jose-sharks.svg",
    "pngPath": "/brand/sports/nhl/r1/png/san-jose-sharks.png",
    "colors": [
      "#62C0B4",
      "#154C53"
    ]
  },
  "nhl.seattle-kraken": {
    "id": "nhl.seattle-kraken",
    "slug": "seattle-kraken",
    "league": "nhl",
    "code": "SEA",
    "name": "Seattle Kraken",
    "shortName": "Kraken",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/seattle-kraken.svg",
    "pngPath": "/brand/sports/nhl/r1/png/seattle-kraken.png",
    "colors": [
      "#DE515F",
      "#A1DBDC"
    ]
  },
  "nhl.st-louis-blues": {
    "id": "nhl.st-louis-blues",
    "slug": "st-louis-blues",
    "league": "nhl",
    "code": "STL",
    "name": "St. Louis Blues",
    "shortName": "Blues",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/st-louis-blues.svg",
    "pngPath": "/brand/sports/nhl/r1/png/st-louis-blues.png",
    "colors": [
      "#F2C757",
      "#224782"
    ]
  },
  "nhl.tampa-bay-lightning": {
    "id": "nhl.tampa-bay-lightning",
    "slug": "tampa-bay-lightning",
    "league": "nhl",
    "code": "TBL",
    "name": "Tampa Bay Lightning",
    "shortName": "Lightning",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/tampa-bay-lightning.svg",
    "pngPath": "/brand/sports/nhl/r1/png/tampa-bay-lightning.png",
    "colors": [
      "#204B91",
      "#204B91"
    ]
  },
  "nhl.toronto-maple-leafs": {
    "id": "nhl.toronto-maple-leafs",
    "slug": "toronto-maple-leafs",
    "league": "nhl",
    "code": "TOR",
    "name": "Toronto Maple Leafs",
    "shortName": "Maple Leafs",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/toronto-maple-leafs.svg",
    "pngPath": "/brand/sports/nhl/r1/png/toronto-maple-leafs.png",
    "colors": [
      "#254989",
      "#7EABDA"
    ]
  },
  "nhl.utah-mammoth": {
    "id": "nhl.utah-mammoth",
    "slug": "utah-mammoth",
    "league": "nhl",
    "code": "UTA",
    "name": "Utah Mammoth",
    "shortName": "Mammoth",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/utah-mammoth.svg",
    "pngPath": "/brand/sports/nhl/r1/png/utah-mammoth.png",
    "colors": [
      "#8CC5E2",
      "#243341"
    ]
  },
  "nhl.vancouver-canucks": {
    "id": "nhl.vancouver-canucks",
    "slug": "vancouver-canucks",
    "league": "nhl",
    "code": "VAN",
    "name": "Vancouver Canucks",
    "shortName": "Canucks",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/vancouver-canucks.svg",
    "pngPath": "/brand/sports/nhl/r1/png/vancouver-canucks.png",
    "colors": [
      "#224C7B",
      "#224C7B"
    ]
  },
  "nhl.vegas-golden-knights": {
    "id": "nhl.vegas-golden-knights",
    "slug": "vegas-golden-knights",
    "league": "nhl",
    "code": "VGK",
    "name": "Vegas Golden Knights",
    "shortName": "Golden Knights",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/vegas-golden-knights.svg",
    "pngPath": "/brand/sports/nhl/r1/png/vegas-golden-knights.png",
    "colors": [
      "#F5CF7E",
      "#C45A48"
    ]
  },
  "nhl.washington-capitals": {
    "id": "nhl.washington-capitals",
    "slug": "washington-capitals",
    "league": "nhl",
    "code": "WSH",
    "name": "Washington Capitals",
    "shortName": "Capitals",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/washington-capitals.svg",
    "pngPath": "/brand/sports/nhl/r1/png/washington-capitals.png",
    "colors": [
      "#D74755",
      "#283D5C"
    ]
  },
  "nhl.winnipeg-jets": {
    "id": "nhl.winnipeg-jets",
    "slug": "winnipeg-jets",
    "league": "nhl",
    "code": "WPG",
    "name": "Winnipeg Jets",
    "shortName": "Jets",
    "revision": 1,
    "svgPath": "/brand/sports/nhl/r1/svg/winnipeg-jets.svg",
    "pngPath": "/brand/sports/nhl/r1/png/winnipeg-jets.png",
    "colors": [
      "#CA4458",
      "#283A59"
    ]
  }
};

export const MASCOT_EDITIONS = ["american-football","champions-league","europa-league","laliga","liga-mx","mlb","ncaa-fbs","nfl","nhl","premier-league","radar","soccer"] as const;
export type MascotEdition = (typeof MASCOT_EDITIONS)[number];
