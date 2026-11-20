import { findNationalTeamDef, isNationalCompetition } from "@pitchlab/contracts";
import { resolveCircularCountryFlag } from "../../country-flags";

export interface TeamVenueGeo {
  readonly country: string;
  readonly region: string | null;
  readonly city: string | null;
  readonly stadium: string | null;
  readonly flagSrc: string | null;
  readonly flagSrcSet?: string | null;
}

interface ClubVenueEntry {
  readonly country: string;
  readonly flagSlug: string | null;
  readonly region: string;
  readonly city: string;
  readonly stadium: string;
}

const GENERIC_COUNTRY_VENUES = new Set([
  "alemania",
  "germany",
  "francia",
  "france",
  "italia",
  "italy",
  "espana",
  "españa",
  "spain",
  "inglaterra",
  "england",
  "mexico",
  "méxico",
  "estados unidos",
  "usa",
  "canada",
  "canadá",
  "europa",
  "internacional",
]);

const LEAGUE_DEFAULT_COUNTRY: Readonly<
  Record<string, { country: string; flagSlug: string | null }>
> = {
  "liga-mx": { country: "México", flagSlug: "mexico" },
  "premier-league": { country: "Inglaterra", flagSlug: "inglaterra" },
  laliga: { country: "España", flagSlug: "espana" },
  "la-liga": { country: "España", flagSlug: "espana" },
  bundesliga: { country: "Alemania", flagSlug: "alemania" },
  "serie-a": { country: "Italia", flagSlug: "italia" },
  "ligue-1": { country: "Francia", flagSlug: "francia" },
  "champions-league": { country: "Europa", flagSlug: null },
  nfl: { country: "Estados Unidos", flagSlug: "estados-unidos" },
  nba: { country: "Estados Unidos", flagSlug: "estados-unidos" },
  nhl: { country: "Estados Unidos", flagSlug: "estados-unidos" },
  mlb: { country: "Estados Unidos", flagSlug: "estados-unidos" },
};

const MX = { country: "México", flagSlug: "mexico" } as const;
const EN = { country: "Inglaterra", flagSlug: "inglaterra" } as const;
const ES = { country: "España", flagSlug: "espana" } as const;
const DE = { country: "Alemania", flagSlug: "alemania" } as const;
const IT = { country: "Italia", flagSlug: "italia" } as const;
const FR = { country: "Francia", flagSlug: "francia" } as const;
const US = { country: "Estados Unidos", flagSlug: "estados-unidos" } as const;
const CA = { country: "Canadá", flagSlug: "canada" } as const;

const TEAM_VENUE_DIRECTORY: Readonly<Record<string, ClubVenueEntry>> = {
  // Liga MX (18)
  "liga-mx.america": { ...MX, region: "Ciudad de México", city: "Benito Juárez", stadium: "Estadio Ciudad de los Deportes" },
  "liga-mx.atlante": { ...MX, region: "Morelos", city: "Zacatepec", stadium: "Estadio Agustín Coruco Díaz" },
  "liga-mx.atlas": { ...MX, region: "Jalisco", city: "Guadalajara", stadium: "Estadio Jalisco" },
  "liga-mx.atletico-san-luis": { ...MX, region: "San Luis Potosí", city: "San Luis Potosí", stadium: "Estadio Alfonso Lastras" },
  "liga-mx.chivas": { ...MX, region: "Jalisco", city: "Zapopan", stadium: "Estadio Akron" },
  "liga-mx.cruz-azul": { ...MX, region: "Ciudad de México", city: "Benito Juárez", stadium: "Estadio Ciudad de los Deportes" },
  "liga-mx.fc-juarez": { ...MX, region: "Chihuahua", city: "Ciudad Juárez", stadium: "Estadio Olímpico Benito Juárez" },
  "liga-mx.leon": { ...MX, region: "Guanajuato", city: "León", stadium: "Estadio León" },
  "liga-mx.monterrey": { ...MX, region: "Nuevo León", city: "Guadalupe", stadium: "Estadio BBVA" },
  "liga-mx.necaxa": { ...MX, region: "Aguascalientes", city: "Aguascalientes", stadium: "Estadio Victoria" },
  "liga-mx.pachuca": { ...MX, region: "Hidalgo", city: "Pachuca", stadium: "Estadio Hidalgo" },
  "liga-mx.puebla": { ...MX, region: "Puebla", city: "Puebla", stadium: "Estadio Cuauhtémoc" },
  "liga-mx.pumas-unam": { ...MX, region: "Ciudad de México", city: "Coyoacán", stadium: "Estadio Olímpico Universitario" },
  "liga-mx.queretaro": { ...MX, region: "Querétaro", city: "Querétaro", stadium: "Estadio Corregidora" },
  "liga-mx.santos-laguna": { ...MX, region: "Coahuila", city: "Torreón", stadium: "Estadio Corona" },
  "liga-mx.tigres-uanl": { ...MX, region: "Nuevo León", city: "San Nicolás de los Garza", stadium: "Estadio Universitario" },
  "liga-mx.tijuana": { ...MX, region: "Baja California", city: "Tijuana", stadium: "Estadio Caliente" },
  "liga-mx.toluca": { ...MX, region: "Estado de México", city: "Toluca", stadium: "Estadio Nemesio Díez" },

  // Premier League (20)
  "premier-league.afc-bournemouth": { ...EN, region: "Dorset", city: "Bournemouth", stadium: "Vitality Stadium" },
  "premier-league.arsenal": { ...EN, region: "Gran Londres", city: "Londres", stadium: "Emirates Stadium" },
  "premier-league.aston-villa": { ...EN, region: "Tierras Medias Occidentales", city: "Birmingham", stadium: "Villa Park" },
  "premier-league.brentford": { ...EN, region: "Gran Londres", city: "Londres", stadium: "Gtech Community Stadium" },
  "premier-league.brighton-hove-albion": { ...EN, region: "Sussex Oriental", city: "Brighton", stadium: "Amex Stadium" },
  "premier-league.chelsea": { ...EN, region: "Gran Londres", city: "Londres", stadium: "Stamford Bridge" },
  "premier-league.coventry-city": { ...EN, region: "Tierras Medias Occidentales", city: "Coventry", stadium: "Coventry Building Society Arena" },
  "premier-league.crystal-palace": { ...EN, region: "Gran Londres", city: "Londres", stadium: "Selhurst Park" },
  "premier-league.everton": { ...EN, region: "Merseyside", city: "Liverpool", stadium: "Hill Dickinson Stadium" },
  "premier-league.fulham": { ...EN, region: "Gran Londres", city: "Londres", stadium: "Craven Cottage" },
  "premier-league.hull-city": { ...EN, region: "Yorkshire Oriental", city: "Kingston upon Hull", stadium: "MKM Stadium" },
  "premier-league.ipswich-town": { ...EN, region: "Suffolk", city: "Ipswich", stadium: "Portman Road" },
  "premier-league.leeds-united": { ...EN, region: "Yorkshire Occidental", city: "Leeds", stadium: "Elland Road" },
  "premier-league.liverpool": { ...EN, region: "Merseyside", city: "Liverpool", stadium: "Anfield" },
  "premier-league.manchester-city": { ...EN, region: "Gran Mánchester", city: "Mánchester", stadium: "Etihad Stadium" },
  "premier-league.manchester-united": { ...EN, region: "Gran Mánchester", city: "Mánchester", stadium: "Old Trafford" },
  "premier-league.newcastle-united": { ...EN, region: "Tyne y Wear", city: "Newcastle upon Tyne", stadium: "St. James' Park" },
  "premier-league.nottingham-forest": { ...EN, region: "Nottinghamshire", city: "Nottingham", stadium: "City Ground" },
  "premier-league.sunderland": { ...EN, region: "Tyne y Wear", city: "Sunderland", stadium: "Stadium of Light" },
  "premier-league.tottenham-hotspur": { ...EN, region: "Gran Londres", city: "Londres", stadium: "Tottenham Hotspur Stadium" },

  // LaLiga (20)
  "laliga.alaves": { ...ES, region: "País Vasco", city: "Vitoria-Gasteiz", stadium: "Mendizorroza" },
  "laliga.athletic-club": { ...ES, region: "País Vasco", city: "Bilbao", stadium: "San Mamés" },
  "laliga.atletico-madrid": { ...ES, region: "Comunidad de Madrid", city: "Madrid", stadium: "Riyadh Air Metropolitano" },
  "laliga.barcelona": { ...ES, region: "Cataluña", city: "Barcelona", stadium: "Spotify Camp Nou" },
  "laliga.celta-vigo": { ...ES, region: "Galicia", city: "Vigo", stadium: "Balaídos" },
  "laliga.deportivo-la-coruna": { ...ES, region: "Galicia", city: "A Coruña", stadium: "Abanca-Riazor" },
  "laliga.elche": { ...ES, region: "Comunidad Valenciana", city: "Elche", stadium: "Martínez Valero" },
  "laliga.espanyol": { ...ES, region: "Cataluña", city: "Cornellà de Llobregat", stadium: "RCDE Stadium" },
  "laliga.getafe": { ...ES, region: "Comunidad de Madrid", city: "Getafe", stadium: "Coliseum" },
  "laliga.levante": { ...ES, region: "Comunidad Valenciana", city: "Valencia", stadium: "Ciutat de València" },
  "laliga.malaga": { ...ES, region: "Andalucía", city: "Málaga", stadium: "La Rosaleda" },
  "laliga.osasuna": { ...ES, region: "Navarra", city: "Pamplona", stadium: "El Sadar" },
  "laliga.racing-santander": { ...ES, region: "Cantabria", city: "Santander", stadium: "El Sardinero" },
  "laliga.rayo-vallecano": { ...ES, region: "Comunidad de Madrid", city: "Madrid", stadium: "Estadio de Vallecas" },
  "laliga.real-betis": { ...ES, region: "Andalucía", city: "Sevilla", stadium: "Benito Villamarín" },
  "laliga.real-madrid": { ...ES, region: "Comunidad de Madrid", city: "Madrid", stadium: "Santiago Bernabéu" },
  "laliga.real-sociedad": { ...ES, region: "País Vasco", city: "San Sebastián", stadium: "Reale Arena" },
  "laliga.sevilla": { ...ES, region: "Andalucía", city: "Sevilla", stadium: "Ramón Sánchez-Pizjuán" },
  "laliga.valencia": { ...ES, region: "Comunidad Valenciana", city: "Valencia", stadium: "Mestalla" },
  "laliga.villarreal": { ...ES, region: "Comunidad Valenciana", city: "Villarreal", stadium: "Estadio de la Cerámica" },

  // Bundesliga (18)
  "bundesliga.augsburg": { ...DE, region: "Baviera", city: "Augsburgo", stadium: "WWK Arena" },
  "bundesliga.bayer-leverkusen": { ...DE, region: "Renania del Norte-Westfalia", city: "Leverkusen", stadium: "BayArena" },
  "bundesliga.bayern-munchen": { ...DE, region: "Baviera", city: "Múnich", stadium: "Allianz Arena" },
  "bundesliga.bayern-munich": { ...DE, region: "Baviera", city: "Múnich", stadium: "Allianz Arena" },
  "bundesliga.borussia-dortmund": { ...DE, region: "Renania del Norte-Westfalia", city: "Dortmund", stadium: "Signal Iduna Park" },
  "bundesliga.borussia-monchengladbach": { ...DE, region: "Renania del Norte-Westfalia", city: "Mönchengladbach", stadium: "Borussia-Park" },
  "bundesliga.eintracht-frankfurt": { ...DE, region: "Hesse", city: "Fráncfort del Meno", stadium: "Deutsche Bank Park" },
  "bundesliga.elversberg": { ...DE, region: "Sarre", city: "Spiesen-Elversberg", stadium: "Ursapharm-Arena" },
  "bundesliga.freiburg": { ...DE, region: "Baden-Wurtemberg", city: "Friburgo", stadium: "Europa-Park Stadion" },
  "bundesliga.hamburger": { ...DE, region: "Estado de Hamburgo", city: "Hamburgo", stadium: "Volksparkstadion" },
  "bundesliga.hoffenheim": { ...DE, region: "Baden-Wurtemberg", city: "Sinsheim", stadium: "PreZero Arena" },
  "bundesliga.koln": { ...DE, region: "Renania del Norte-Westfalia", city: "Colonia", stadium: "RheinEnergieStadion" },
  "bundesliga.mainz": { ...DE, region: "Renania-Palatinado", city: "Maguncia", stadium: "Mewa Arena" },
  "bundesliga.paderborn": { ...DE, region: "Renania del Norte-Westfalia", city: "Paderborn", stadium: "Home Deluxe Arena" },
  "bundesliga.rb-leipzig": { ...DE, region: "Sajonia", city: "Leipzig", stadium: "Red Bull Arena" },
  "bundesliga.schalke": { ...DE, region: "Renania del Norte-Westfalia", city: "Gelsenkirchen", stadium: "Veltins-Arena" },
  "bundesliga.stuttgart": { ...DE, region: "Baden-Wurtemberg", city: "Stuttgart", stadium: "MHPArena" },
  "bundesliga.union-berlin": { ...DE, region: "Estado de Berlín", city: "Berlín", stadium: "Stadion An der Alten Försterei" },
  "bundesliga.werder-bremen": { ...DE, region: "Estado de Bremen", city: "Bremen", stadium: "Weserstadion" },

  // Serie A (20)
  "serie-a.atalanta-bc": { ...IT, region: "Lombardía", city: "Bérgamo", stadium: "Gewiss Stadium" },
  "serie-a.bologna": { ...IT, region: "Emilia-Romaña", city: "Bolonia", stadium: "Stadio Renato Dall'Ara" },
  "serie-a.cagliari": { ...IT, region: "Cerdeña", city: "Cagliari", stadium: "Unipol Domus" },
  "serie-a.como": { ...IT, region: "Lombardía", city: "Como", stadium: "Stadio Giuseppe Sinigaglia" },
  "serie-a.fiorentina": { ...IT, region: "Toscana", city: "Florencia", stadium: "Stadio Artemio Franchi" },
  "serie-a.frosinone": { ...IT, region: "Lacio", city: "Frosinone", stadium: "Stadio Benito Stirpe" },
  "serie-a.genoa-cfc": { ...IT, region: "Liguria", city: "Génova", stadium: "Stadio Luigi Ferraris" },
  "serie-a.internazionale-milano": { ...IT, region: "Lombardía", city: "Milán", stadium: "Stadio Giuseppe Meazza" },
  "serie-a.juventus": { ...IT, region: "Piamonte", city: "Turín", stadium: "Allianz Stadium" },
  "serie-a.lazio": { ...IT, region: "Lacio", city: "Roma", stadium: "Stadio Olimpico" },
  "serie-a.lecce": { ...IT, region: "Apulia", city: "Lecce", stadium: "Stadio Via del Mare" },
  "serie-a.milan": { ...IT, region: "Lombardía", city: "Milán", stadium: "San Siro" },
  "serie-a.monza": { ...IT, region: "Lombardía", city: "Monza", stadium: "U-Power Stadium" },
  "serie-a.napoli": { ...IT, region: "Campania", city: "Nápoles", stadium: "Stadio Diego Armando Maradona" },
  "serie-a.parma": { ...IT, region: "Emilia-Romaña", city: "Parma", stadium: "Stadio Ennio Tardini" },
  "serie-a.roma": { ...IT, region: "Lacio", city: "Roma", stadium: "Stadio Olimpico" },
  "serie-a.sassuolo": { ...IT, region: "Emilia-Romaña", city: "Reggio Emilia", stadium: "Mapei Stadium" },
  "serie-a.torino": { ...IT, region: "Piamonte", city: "Turín", stadium: "Stadio Olimpico Grande Torino" },
  "serie-a.udinese": { ...IT, region: "Friuli-Venecia Julia", city: "Údine", stadium: "Bluenergy Stadium" },
  "serie-a.venezia": { ...IT, region: "Véneto", city: "Venecia", stadium: "Stadio Pier Luigi Penzo" },

  // Ligue 1 (18)
  "ligue-1.aj-auxerre": { ...FR, region: "Borgoña-Franco Condado", city: "Auxerre", stadium: "Stade de l'Abbé-Deschamps" },
  "ligue-1.angers-sco": { ...FR, region: "Países del Loira", city: "Angers", stadium: "Stade Raymond-Kopa" },
  "ligue-1.es-troyes": { ...FR, region: "Gran Este", city: "Troyes", stadium: "Stade de l'Aube" },
  "ligue-1.estac-troyes": { ...FR, region: "Gran Este", city: "Troyes", stadium: "Stade de l'Aube" },
  "ligue-1.le-havre": { ...FR, region: "Normandía", city: "El Havre", stadium: "Stade Océane" },
  "ligue-1.le-mans": { ...FR, region: "Países del Loira", city: "Le Mans", stadium: "Stade Marie-Marvingt" },
  "ligue-1.lille-osc": { ...FR, region: "Altos de Francia", city: "Villeneuve-d'Ascq", stadium: "Decathlon Arena" },
  "ligue-1.lorient": { ...FR, region: "Bretaña", city: "Lorient", stadium: "Stade du Moustoir" },
  "ligue-1.monaco": { country: "Mónaco", flagSlug: "francia", region: "Fontvieille", city: "Mónaco", stadium: "Stade Louis-II" },
  "ligue-1.ogc-nice": { ...FR, region: "Provenza-Alpes-Costa Azul", city: "Niza", stadium: "Allianz Riviera" },
  "ligue-1.olympique-lyonnais": { ...FR, region: "Auvernia-Ródano-Alpes", city: "Décines-Charpieu", stadium: "Groupama Stadium" },
  "ligue-1.olympique-marseille": { ...FR, region: "Provenza-Alpes-Costa Azul", city: "Marsella", stadium: "Stade Vélodrome" },
  "ligue-1.paris": { ...FR, region: "Isla de Francia", city: "París", stadium: "Stade Jean-Bouin" },
  "ligue-1.paris-saint-germain": { ...FR, region: "Isla de Francia", city: "París", stadium: "Parc des Princes" },
  "ligue-1.racing-lens": { ...FR, region: "Altos de Francia", city: "Lens", stadium: "Stade Bollaert-Delelis" },
  "ligue-1.lens": { ...FR, region: "Altos de Francia", city: "Lens", stadium: "Stade Bollaert-Delelis" },
  "ligue-1.stade-brestois": { ...FR, region: "Bretaña", city: "Brest", stadium: "Stade Francis-Le Blé" },
  "ligue-1.stade-rennais": { ...FR, region: "Bretaña", city: "Rennes", stadium: "Roazhon Park" },
  "ligue-1.strasbourg-alsace": { ...FR, region: "Gran Este", city: "Estrasburgo", stadium: "Stade de la Meinau" },
  "ligue-1.strasbourg": { ...FR, region: "Gran Este", city: "Estrasburgo", stadium: "Stade de la Meinau" },
  "ligue-1.toulouse": { ...FR, region: "Occitania", city: "Toulouse", stadium: "Stadium de Toulouse" },

  // NFL (32)
  "nfl.arizona-cardinals": { ...US, region: "Arizona", city: "Glendale", stadium: "State Farm Stadium" },
  "nfl.atlanta-falcons": { ...US, region: "Georgia", city: "Atlanta", stadium: "Mercedes-Benz Stadium" },
  "nfl.baltimore-ravens": { ...US, region: "Maryland", city: "Baltimore", stadium: "M&T Bank Stadium" },
  "nfl.buffalo-bills": { ...US, region: "Nueva York", city: "Orchard Park", stadium: "Highmark Stadium" },
  "nfl.carolina-panthers": { ...US, region: "Carolina del Norte", city: "Charlotte", stadium: "Bank of America Stadium" },
  "nfl.chicago-bears": { ...US, region: "Illinois", city: "Chicago", stadium: "Soldier Field" },
  "nfl.cincinnati-bengals": { ...US, region: "Ohio", city: "Cincinnati", stadium: "Paycor Stadium" },
  "nfl.cleveland-browns": { ...US, region: "Ohio", city: "Cleveland", stadium: "Huntington Bank Field" },
  "nfl.dallas-cowboys": { ...US, region: "Texas", city: "Arlington", stadium: "AT&T Stadium" },
  "nfl.denver-broncos": { ...US, region: "Colorado", city: "Denver", stadium: "Empower Field at Mile High" },
  "nfl.detroit-lions": { ...US, region: "Míchigan", city: "Detroit", stadium: "Ford Field" },
  "nfl.green-bay-packers": { ...US, region: "Wisconsin", city: "Green Bay", stadium: "Lambeau Field" },
  "nfl.houston-texans": { ...US, region: "Texas", city: "Houston", stadium: "NRG Stadium" },
  "nfl.indianapolis-colts": { ...US, region: "Indiana", city: "Indianápolis", stadium: "Lucas Oil Stadium" },
  "nfl.jacksonville-jaguars": { ...US, region: "Florida", city: "Jacksonville", stadium: "EverBank Stadium" },
  "nfl.kansas-city-chiefs": { ...US, region: "Misuri", city: "Kansas City", stadium: "GEHA Field at Arrowhead Stadium" },
  "nfl.las-vegas-raiders": { ...US, region: "Nevada", city: "Las Vegas", stadium: "Allegiant Stadium" },
  "nfl.los-angeles-chargers": { ...US, region: "California", city: "Inglewood", stadium: "SoFi Stadium" },
  "nfl.los-angeles-rams": { ...US, region: "California", city: "Inglewood", stadium: "SoFi Stadium" },
  "nfl.miami-dolphins": { ...US, region: "Florida", city: "Miami Gardens", stadium: "Hard Rock Stadium" },
  "nfl.minnesota-vikings": { ...US, region: "Minnesota", city: "Mineápolis", stadium: "U.S. Bank Stadium" },
  "nfl.new-england-patriots": { ...US, region: "Massachusetts", city: "Foxborough", stadium: "Gillette Stadium" },
  "nfl.new-orleans-saints": { ...US, region: "Luisiana", city: "Nueva Orleans", stadium: "Caesars Superdome" },
  "nfl.new-york-giants": { ...US, region: "Nueva Jersey", city: "East Rutherford", stadium: "MetLife Stadium" },
  "nfl.new-york-jets": { ...US, region: "Nueva Jersey", city: "East Rutherford", stadium: "MetLife Stadium" },
  "nfl.philadelphia-eagles": { ...US, region: "Pensilvania", city: "Filadelfia", stadium: "Lincoln Financial Field" },
  "nfl.pittsburgh-steelers": { ...US, region: "Pensilvania", city: "Pittsburgh", stadium: "Acrisure Stadium" },
  "nfl.san-francisco-49ers": { ...US, region: "California", city: "Santa Clara", stadium: "Levi's Stadium" },
  "nfl.seattle-seahawks": { ...US, region: "Washington", city: "Seattle", stadium: "Lumen Field" },
  "nfl.tampa-bay-buccaneers": { ...US, region: "Florida", city: "Tampa", stadium: "Raymond James Stadium" },
  "nfl.tennessee-titans": { ...US, region: "Tennessee", city: "Nashville", stadium: "Nissan Stadium" },
  "nfl.washington-commanders": { ...US, region: "Maryland", city: "Landover", stadium: "Northwest Stadium" },

  // NBA (30)
  "nba.atlanta-hawks": { ...US, region: "Georgia", city: "Atlanta", stadium: "State Farm Arena" },
  "nba.boston-celtics": { ...US, region: "Massachusetts", city: "Boston", stadium: "TD Garden" },
  "nba.brooklyn-nets": { ...US, region: "Nueva York", city: "Brooklyn", stadium: "Barclays Center" },
  "nba.charlotte-hornets": { ...US, region: "Carolina del Norte", city: "Charlotte", stadium: "Spectrum Center" },
  "nba.chicago-bulls": { ...US, region: "Illinois", city: "Chicago", stadium: "United Center" },
  "nba.cleveland-cavaliers": { ...US, region: "Ohio", city: "Cleveland", stadium: "Rocket Arena" },
  "nba.dallas-mavericks": { ...US, region: "Texas", city: "Dallas", stadium: "American Airlines Center" },
  "nba.denver-nuggets": { ...US, region: "Colorado", city: "Denver", stadium: "Ball Arena" },
  "nba.detroit-pistons": { ...US, region: "Míchigan", city: "Detroit", stadium: "Little Caesars Arena" },
  "nba.golden-state-warriors": { ...US, region: "California", city: "San Francisco", stadium: "Chase Center" },
  "nba.houston-rockets": { ...US, region: "Texas", city: "Houston", stadium: "Toyota Center" },
  "nba.indiana-pacers": { ...US, region: "Indiana", city: "Indianápolis", stadium: "Gainbridge Fieldhouse" },
  "nba.los-angeles-clippers": { ...US, region: "California", city: "Inglewood", stadium: "Intuit Dome" },
  "nba.los-angeles-lakers": { ...US, region: "California", city: "Los Ángeles", stadium: "Crypto.com Arena" },
  "nba.memphis-grizzlies": { ...US, region: "Tennessee", city: "Memphis", stadium: "FedExForum" },
  "nba.miami-heat": { ...US, region: "Florida", city: "Miami", stadium: "Kaseya Center" },
  "nba.milwaukee-bucks": { ...US, region: "Wisconsin", city: "Milwaukee", stadium: "Fiserv Forum" },
  "nba.minnesota-timberwolves": { ...US, region: "Minnesota", city: "Mineápolis", stadium: "Target Center" },
  "nba.new-orleans-pelicans": { ...US, region: "Luisiana", city: "Nueva Orleans", stadium: "Smoothie King Center" },
  "nba.new-york-knicks": { ...US, region: "Nueva York", city: "Nueva York", stadium: "Madison Square Garden" },
  "nba.oklahoma-city-thunder": { ...US, region: "Oklahoma", city: "Oklahoma City", stadium: "Paycom Center" },
  "nba.orlando-magic": { ...US, region: "Florida", city: "Orlando", stadium: "Kia Center" },
  "nba.philadelphia-76ers": { ...US, region: "Pensilvania", city: "Filadelfia", stadium: "Wells Fargo Center" },
  "nba.phoenix-suns": { ...US, region: "Arizona", city: "Phoenix", stadium: "PHX Arena" },
  "nba.portland-trail-blazers": { ...US, region: "Oregón", city: "Portland", stadium: "Moda Center" },
  "nba.sacramento-kings": { ...US, region: "California", city: "Sacramento", stadium: "Golden 1 Center" },
  "nba.san-antonio-spurs": { ...US, region: "Texas", city: "San Antonio", stadium: "Frost Bank Center" },
  "nba.toronto-raptors": { ...CA, region: "Ontario", city: "Toronto", stadium: "Scotiabank Arena" },
  "nba.utah-jazz": { ...US, region: "Utah", city: "Salt Lake City", stadium: "Delta Center" },
  "nba.washington-wizards": { ...US, region: "Distrito de Columbia", city: "Washington D. C.", stadium: "Capital One Arena" },

  // NHL (32)
  "nhl.anaheim-ducks": { ...US, region: "California", city: "Anaheim", stadium: "Honda Center" },
  "nhl.boston-bruins": { ...US, region: "Massachusetts", city: "Boston", stadium: "TD Garden" },
  "nhl.buffalo-sabres": { ...US, region: "Nueva York", city: "Búfalo", stadium: "KeyBank Center" },
  "nhl.calgary-flames": { ...CA, region: "Alberta", city: "Calgary", stadium: "Scotiabank Saddledome" },
  "nhl.carolina-hurricanes": { ...US, region: "Carolina del Norte", city: "Raleigh", stadium: "Lenovo Center" },
  "nhl.chicago-blackhawks": { ...US, region: "Illinois", city: "Chicago", stadium: "United Center" },
  "nhl.colorado-avalanche": { ...US, region: "Colorado", city: "Denver", stadium: "Ball Arena" },
  "nhl.columbus-blue-jackets": { ...US, region: "Ohio", city: "Columbus", stadium: "Nationwide Arena" },
  "nhl.dallas-stars": { ...US, region: "Texas", city: "Dallas", stadium: "American Airlines Center" },
  "nhl.detroit-red-wings": { ...US, region: "Míchigan", city: "Detroit", stadium: "Little Caesars Arena" },
  "nhl.edmonton-oilers": { ...CA, region: "Alberta", city: "Edmonton", stadium: "Rogers Place" },
  "nhl.florida-panthers": { ...US, region: "Florida", city: "Sunrise", stadium: "Amerant Bank Arena" },
  "nhl.los-angeles-kings": { ...US, region: "California", city: "Los Ángeles", stadium: "Crypto.com Arena" },
  "nhl.minnesota-wild": { ...US, region: "Minnesota", city: "Saint Paul", stadium: "Xcel Energy Center" },
  "nhl.montreal-canadiens": { ...CA, region: "Quebec", city: "Montreal", stadium: "Centre Bell" },
  "nhl.nashville-predators": { ...US, region: "Tennessee", city: "Nashville", stadium: "Bridgestone Arena" },
  "nhl.new-jersey-devils": { ...US, region: "Nueva Jersey", city: "Newark", stadium: "Prudential Center" },
  "nhl.new-york-islanders": { ...US, region: "Nueva York", city: "Elmont", stadium: "UBS Arena" },
  "nhl.new-york-rangers": { ...US, region: "Nueva York", city: "Nueva York", stadium: "Madison Square Garden" },
  "nhl.ottawa-senators": { ...CA, region: "Ontario", city: "Ottawa", stadium: "Canadian Tire Centre" },
  "nhl.philadelphia-flyers": { ...US, region: "Pensilvania", city: "Filadelfia", stadium: "Wells Fargo Center" },
  "nhl.pittsburgh-penguins": { ...US, region: "Pensilvania", city: "Pittsburgh", stadium: "PPG Paints Arena" },
  "nhl.san-jose-sharks": { ...US, region: "California", city: "San José", stadium: "SAP Center" },
  "nhl.seattle-kraken": { ...US, region: "Washington", city: "Seattle", stadium: "Climate Pledge Arena" },
  "nhl.st-louis-blues": { ...US, region: "Misuri", city: "San Luis", stadium: "Enterprise Center" },
  "nhl.tampa-bay-lightning": { ...US, region: "Florida", city: "Tampa", stadium: "Amalie Arena" },
  "nhl.toronto-maple-leafs": { ...CA, region: "Ontario", city: "Toronto", stadium: "Scotiabank Arena" },
  "nhl.utah-mammoth": { ...US, region: "Utah", city: "Salt Lake City", stadium: "Delta Center" },
  "nhl.vancouver-canucks": { ...CA, region: "Columbia Británica", city: "Vancouver", stadium: "Rogers Arena" },
  "nhl.vegas-golden-knights": { ...US, region: "Nevada", city: "Las Vegas", stadium: "T-Mobile Arena" },
  "nhl.washington-capitals": { ...US, region: "Distrito de Columbia", city: "Washington D. C.", stadium: "Capital One Arena" },
  "nhl.winnipeg-jets": { ...CA, region: "Manitoba", city: "Winnipeg", stadium: "Canada Life Centre" },
};

function cleanSnapshotVenue(rawVenue: string | null | undefined): {
  stadium: string | null;
  city: string | null;
} {
  if (!rawVenue) return { stadium: null, city: null };
  const trimmed = rawVenue.trim();
  if (!trimmed || GENERIC_COUNTRY_VENUES.has(trimmed.toLowerCase())) {
    return { stadium: null, city: null };
  }
  if (trimmed.includes(" · ")) {
    const [rawStadium, rawCity] = trimmed.split(" · ");
    const st = rawStadium?.trim() || null;
    const ct = rawCity?.trim() || null;
    return {
      stadium: st && !GENERIC_COUNTRY_VENUES.has(st.toLowerCase()) ? st : null,
      city: ct && !GENERIC_COUNTRY_VENUES.has(ct.toLowerCase()) ? ct : null,
    };
  }
  return { stadium: trimmed, city: null };
}

/**
 * Resuelve la jerarquía geográfica completa de un club o selección:
 * País → Estado / Provincia / Región → Ciudad → Estadio.
 */
export function resolveTeamVenueGeo(
  league: string,
  teamSlug: string,
  teamName: string,
  fallbackVenueName?: string | null,
): TeamVenueGeo | null {
  const canonicalLeague = league === "la-liga" ? "laliga" : league;
  const cleanSlug = teamSlug.includes(".") ? teamSlug.split(".")[1]! : teamSlug;
  const entry = TEAM_VENUE_DIRECTORY[`${canonicalLeague}.${cleanSlug}`];
  const parsedFallback = cleanSnapshotVenue(fallbackVenueName);

  if (entry) {
    const circularFlag = resolveCircularCountryFlag(entry.flagSlug, entry.country);
    return {
      country: entry.country,
      region: entry.region,
      city: entry.city,
      stadium: entry.stadium || parsedFallback.stadium,
      flagSrc: circularFlag?.src ?? null,
      flagSrcSet: circularFlag?.srcSet ?? null,
    };
  }

  if (isNationalCompetition(canonicalLeague)) {
    const nat = findNationalTeamDef(cleanSlug) ?? findNationalTeamDef(teamName);
    const circularFlag = resolveCircularCountryFlag(
      nat?.slug ?? cleanSlug,
      nat?.nameEs ?? nat?.emblemPath ?? null,
    );
    return {
      country: nat?.nameEs ?? "Internacional",
      region: null,
      city: parsedFallback.city,
      stadium: parsedFallback.stadium,
      flagSrc: circularFlag?.src ?? nat?.emblemPath ?? null,
      flagSrcSet: circularFlag?.srcSet ?? null,
    };
  }

  const def = LEAGUE_DEFAULT_COUNTRY[canonicalLeague];
  if (!def && !parsedFallback.stadium) return null;
  const circularFlag = resolveCircularCountryFlag(def?.flagSlug ?? null, def?.country ?? null);
  return {
    country: def?.country ?? "Internacional",
    region: null,
    city: parsedFallback.city,
    stadium: parsedFallback.stadium,
    flagSrc: circularFlag?.src ?? null,
    flagSrcSet: circularFlag?.srcSet ?? null,
  };
}
