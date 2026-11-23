export interface NationalTeamDef {
  readonly slug: string;
  readonly code: string;
  readonly nameEs: string;
  readonly shortEs: string;
  readonly espnNames: readonly string[];
  readonly emblemPath: string;
  readonly externalLogo: string;
}

const STOPWORDS = new Set([
  "and",
  "de",
  "del",
  "der",
  "des",
  "du",
  "do",
  "da",
  "dos",
  "das",
  "van",
  "von",
  "fc",
  "afc",
  "cf",
  "sc",
  "ac",
  "as",
  "ssc",
  "ss",
  "us",
  "ud",
  "cd",
  "ca",
  "rc",
  "rcd",
  "sv",
  "vfl",
  "vfb",
  "tsg",
  "spvgg",
  "fsv",
  "sk",
  "fk",
  "calcio",
  "losc",
  "acf",
  "club",
  "futbol",
  "football",
]);

export function slugifyCanonicalNationalName(rawName: string): string {
  const tokens = rawName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
  const kept = tokens.filter((t) => !STOPWORDS.has(t) && !/^\d+$/.test(t));
  return (kept.length > 0 ? kept : tokens).join("-");
}

type RawEntry = readonly [
  espnName: string,
  code: string,
  nameEs: string,
  shortEs: string,
  logoSegment: string,
  ...aliases: string[],
];

const C = (seg: string) => `https://a.espncdn.com/i/teamlogos/countries/500/${seg}.png`;
const S = (id: string) => `https://a.espncdn.com/i/teamlogos/soccer/500/${id}.png`;

const RAW_ENTRIES: readonly RawEntry[] = [
  ["Afghanistan", "AFG", "Afganistán", "Afganistán", C("afg")],
  ["Albania", "ALB", "Albania", "Albania", C("alb")],
  ["Algeria", "ALG", "Argelia", "Argelia", C("alg")],
  ["American Samoa", "ASA", "Samoa Americana", "Samoa Am.", C("asa")],
  ["Andorra", "AND", "Andorra", "Andorra", C("and")],
  ["Angola", "ANG", "Angola", "Angola", C("ang")],
  ["Anguilla", "AIA", "Anguila", "Anguila", C("aia")],
  ["Antigua and Barbuda", "ATG", "Antigua y Barbuda", "Antigua y B.", C("atg")],
  ["Argentina", "ARG", "Argentina", "Argentina", C("arg")],
  ["Armenia", "ARM", "Armenia", "Armenia", C("fifa.armenia")],
  ["Aruba", "ARU", "Aruba", "Aruba", C("aru")],
  ["Australia", "AUS", "Australia", "Australia", C("aus")],
  ["Austria", "AUT", "Austria", "Austria", C("aut")],
  ["Azerbaijan", "AZE", "Azerbaiyán", "Azerbaiyán", C("aze")],
  ["Bahamas", "BAH", "Bahamas", "Bahamas", C("bah")],
  ["Bahrain", "BHR", "Baréin", "Baréin", C("bhr")],
  ["Bangladesh", "BAN", "Bangladés", "Bangladés", C("ban")],
  ["Barbados", "BRB", "Barbados", "Barbados", C("brb")],
  ["Belarus", "BLR", "Bielorrusia", "Bielorrusia", C("blr")],
  ["Belgium", "BEL", "Bélgica", "Bélgica", C("bel")],
  ["Belize", "BLZ", "Belice", "Belice", C("blz")],
  ["Benin", "BEN", "Benín", "Benín", C("ben")],
  ["Bermuda", "BER", "Bermudas", "Bermudas", C("ber")],
  ["Bhutan", "BHU", "Bután", "Bután", S("5784")],
  ["Bolivia", "BOL", "Bolivia", "Bolivia", C("bol")],
  ["Bonaire", "BOE", "Bonaire", "Bonaire", C("boe")],
  ["Bosnia-Herzegovina", "BIH", "Bosnia y Herzegovina", "Bosnia", C("bih"), "Bosnia and Herzegovina", "Bosnia & Herzegovina"],
  ["Botswana", "BOT", "Botsuana", "Botsuana", C("bot")],
  ["Brazil", "BRA", "Brasil", "Brasil", C("bra"), "Brasil"],
  ["British Virgin Islands", "BVI", "Islas Vírgenes Británicas", "I. V. Brit.", C("bvr")],
  ["Brunei Darussalam", "BRU", "Brunéi", "Brunéi", S("10525"), "Brunei"],
  ["Bulgaria", "BUL", "Bulgaria", "Bulgaria", C("bul")],
  ["Burkina Faso", "BKA", "Burkina Faso", "Burkina F.", C("bka")],
  ["Burundi", "BDI", "Burundi", "Burundi", C("bdi")],
  ["Cambodia", "CAM", "Camboya", "Camboya", C("cam")],
  ["Cameroon", "CMR", "Camerún", "Camerún", C("crm")],
  ["Canada", "CAN", "Canadá", "Canadá", C("can")],
  ["Cape Verde", "CPV", "Cabo Verde", "Cabo Verde", C("cpv"), "Cabo Verde", "Cape Verde Islands"],
  ["Cayman Islands", "CAY", "Islas Caimán", "I. Caimán", C("cay")],
  ["Central African Republic", "CTA", "República Centroafricana", "R. Centroaf.", S("10528")],
  ["Chad", "CHA", "Chad", "Chad", C("cha")],
  ["Chile", "CHI", "Chile", "Chile", C("chi")],
  ["China", "CHN", "China", "China", C("chn"), "China PR"],
  ["Chinese Taipei", "TPE", "China Taipéi", "Ch. Taipéi", S("14561"), "Taiwan"],
  ["Colombia", "COL", "Colombia", "Colombia", C("col")],
  ["Comoros", "COM", "Comoras", "Comoras", C("com")],
  ["Congo", "CGO", "Congo", "Congo", C("cgo"), "Congo Republic", "Republic of the Congo"],
  ["Congo DR", "COD", "RD del Congo", "RD Congo", C("rdc"), "DR Congo", "Democratic Republic of the Congo"],
  ["Cook Islands", "COK", "Islas Cook", "Islas Cook", C("cok")],
  ["Costa Rica", "CRC", "Costa Rica", "Costa Rica", C("crc")],
  ["Croatia", "CRO", "Croacia", "Croacia", C("cro")],
  ["Cuba", "CUB", "Cuba", "Cuba", C("cub")],
  ["Curaçao", "CUW", "Curazao", "Curazao", S("11678"), "Curacao", "Netherlands Antilles"],
  ["Cyprus", "CYP", "Chipre", "Chipre", C("cyp")],
  ["Czechia", "CZE", "República Checa", "R. Checa", C("cze"), "Czech Republic"],
  ["Denmark", "DEN", "Dinamarca", "Dinamarca", C("den")],
  ["Djibouti", "DJI", "Yibuti", "Yibuti", C("dji")],
  ["Dominica", "DMA", "Dominica", "Dominica", C("dma")],
  ["Dominican Republic", "DOM", "República Dominicana", "R. Dominicana", C("dom")],
  ["Ecuador", "ECU", "Ecuador", "Ecuador", C("ecu")],
  ["Egypt", "EGY", "Egipto", "Egipto", C("egy")],
  ["El Salvador", "SLV", "El Salvador", "El Salvador", C("slv")],
  ["England", "ENG", "Inglaterra", "Inglaterra", C("eng")],
  ["Equatorial Guinea", "EQG", "Guinea Ecuatorial", "Guinea Ec.", C("eqg")],
  ["Eritrea", "ERI", "Eritrea", "Eritrea", C("eri")],
  ["Estonia", "EST", "Estonia", "Estonia", C("est")],
  ["Eswatini", "SWZ", "Esuatini", "Esuatini", C("swz"), "Swaziland"],
  ["Ethiopia", "ETH", "Etiopía", "Etiopía", C("eth")],
  ["Faroe Islands", "FRO", "Islas Feroe", "I. Feroe", C("fro")],
  ["Fiji", "FIJ", "Fiyi", "Fiyi", C("fij")],
  ["Finland", "FIN", "Finlandia", "Finlandia", C("fin")],
  ["France", "FRA", "Francia", "Francia", C("fra")],
  ["French Guiana", "GUF", "Guayana Francesa", "Guayana Fr.", S("10532")],
  ["Gabon", "GAB", "Gabón", "Gabón", C("gab")],
  ["Gambia", "GAM", "Gambia", "Gambia", C("gam"), "The Gambia"],
  ["Georgia", "GEO", "Georgia", "Georgia", C("geo")],
  ["Germany", "GER", "Alemania", "Alemania", C("ger")],
  ["Ghana", "GHA", "Ghana", "Ghana", C("gha")],
  ["Gibraltar", "GIB", "Gibraltar", "Gibraltar", C("gib")],
  ["Greece", "GRE", "Grecia", "Grecia", C("gre")],
  ["Grenada", "GRN", "Granada", "Granada", C("grn")],
  ["Guadeloupe", "GDL", "Guadalupe", "Guadalupe", C("gdl")],
  ["Guam", "GUM", "Guam", "Guam", S("10529")],
  ["Guatemala", "GUA", "Guatemala", "Guatemala", C("gua")],
  ["Guinea", "GUI", "Guinea", "Guinea", C("gui")],
  ["Guinea-Bissau", "GNB", "Guinea-Bisáu", "Guinea-B.", C("gnb")],
  ["Guyana", "GUY", "Guyana", "Guyana", C("guy")],
  ["Haiti", "HAI", "Haití", "Haití", C("hai")],
  ["Honduras", "HON", "Honduras", "Honduras", C("hon")],
  ["Hong Kong", "HKG", "Hong Kong", "Hong Kong", C("hkg")],
  ["Hungary", "HUN", "Hungría", "Hungría", C("hun")],
  ["Iceland", "ISL", "Islandia", "Islandia", C("isl")],
  ["India", "IND", "India", "India", C("ind")],
  ["Indonesia", "IDN", "Indonesia", "Indonesia", C("idn")],
  ["Iran", "IRN", "Irán", "Irán", C("irn"), "IR Iran"],
  ["Iraq", "IRQ", "Irak", "Irak", C("irq")],
  ["Israel", "ISR", "Israel", "Israel", C("isr")],
  ["Italy", "ITA", "Italia", "Italia", C("ita")],
  ["Ivory Coast", "CIV", "Costa de Marfil", "C. Marfil", C("civ"), "Côte d'Ivoire", "Cote d'Ivoire"],
  ["Jamaica", "JAM", "Jamaica", "Jamaica", C("jam")],
  ["Japan", "JPN", "Japón", "Japón", C("jpn")],
  ["Jordan", "JOR", "Jordania", "Jordania", C("jor")],
  ["Kazakhstan", "KAZ", "Kazajistán", "Kazajistán", C("kaz")],
  ["Kenya", "KEN", "Kenia", "Kenia", C("ken")],
  ["Kosovo", "KOS", "Kosovo", "Kosovo", C("kosovo")],
  ["Kuwait", "KUW", "Kuwait", "Kuwait", C("kuw")],
  ["Kyrgyz Republic", "KGZ", "Kirguistán", "Kirguistán", C("kgz"), "Kyrgyzstan"],
  ["Laos", "LAO", "Laos", "Laos", C("lao")],
  ["Latvia", "LVA", "Letonia", "Letonia", C("lva")],
  ["Lebanon", "LIB", "Líbano", "Líbano", C("lib")],
  ["Lesotho", "LES", "Lesoto", "Lesoto", C("les")],
  ["Liberia", "LBR", "Liberia", "Liberia", C("lbr")],
  ["Libya", "LBY", "Libia", "Libia", C("lby")],
  ["Liechtenstein", "LIE", "Liechtenstein", "Liechtenst.", C("lie")],
  ["Lithuania", "LTU", "Lituania", "Lituania", C("ltu")],
  ["Luxembourg", "LUX", "Luxemburgo", "Luxemburgo", C("lux")],
  ["Macau", "MAC", "Macao", "Macao", C("mac")],
  ["Madagascar", "MAD", "Madagascar", "Madagascar", C("mad")],
  ["Malawi", "MWI", "Malaui", "Malaui", C("mwi")],
  ["Malaysia", "MAS", "Malasia", "Malasia", C("mas")],
  ["Maldives", "MDV", "Maldivas", "Maldivas", C("mdv")],
  ["Mali", "MLI", "Malí", "Malí", C("mli")],
  ["Malta", "MLT", "Malta", "Malta", C("mlt")],
  ["Martinique", "MTQ", "Martinica", "Martinica", C("marq")],
  ["Mauritania", "MTN", "Mauritania", "Mauritania", C("mtn")],
  ["Mauritius", "MRI", "Mauricio", "Mauricio", C("mri")],
  ["Mexico", "MEX", "México", "México", C("mex"), "México"],
  ["Moldova", "MDA", "Moldavia", "Moldavia", C("mda")],
  ["Mongolia", "MGL", "Mongolia", "Mongolia", C("mgl")],
  ["Montenegro", "MNE", "Montenegro", "Montenegro", C("mtg")],
  ["Montserrat", "MSR", "Montserrat", "Montserrat", C("msr")],
  ["Morocco", "MAR", "Marruecos", "Marruecos", C("mar")],
  ["Mozambique", "MOZ", "Mozambique", "Mozambique", C("moz")],
  ["Myanmar", "MYA", "Birmania", "Birmania", C("mya")],
  ["Namibia", "NAM", "Namibia", "Namibia", C("nam")],
  ["Nepal", "NEP", "Nepal", "Nepal", C("nep")],
  ["Netherlands", "NED", "Países Bajos", "Países Bajos", C("ned"), "Holland"],
  ["New Caledonia", "NCD", "Nueva Caledonia", "N. Caledonia", C("ncd")],
  ["New Zealand", "NZL", "Nueva Zelanda", "N. Zelanda", C("nzl")],
  ["Nicaragua", "NCA", "Nicaragua", "Nicaragua", C("nca")],
  ["Niger", "NIG", "Níger", "Níger", C("nig")],
  ["Nigeria", "NGA", "Nigeria", "Nigeria", C("nga")],
  ["North Korea", "PRK", "Corea del Norte", "Corea N.", C("korn"), "Korea DPR"],
  ["North Macedonia", "MKD", "Macedonia del Norte", "Macedonia N.", C("mkd")],
  ["Northern Ireland", "NIR", "Irlanda del Norte", "Irlanda N.", C("nir")],
  ["Norway", "NOR", "Noruega", "Noruega", C("nor")],
  ["Oman", "OMA", "Omán", "Omán", C("oma")],
  ["Pakistan", "PAK", "Pakistán", "Pakistán", C("pak")],
  ["Palestine", "PLE", "Palestina", "Palestina", C("pal")],
  ["Panama", "PAN", "Panamá", "Panamá", C("pan"), "Panamá"],
  ["Papua New Guinea", "PNG", "Papúa Nueva Guinea", "Papúa N. G.", C("png")],
  ["Paraguay", "PAR", "Paraguay", "Paraguay", C("par")],
  ["Peru", "PER", "Perú", "Perú", C("per"), "Perú"],
  ["Philippines", "PHI", "Filipinas", "Filipinas", C("phi")],
  ["Poland", "POL", "Polonia", "Polonia", C("pol")],
  ["Portugal", "POR", "Portugal", "Portugal", C("por")],
  ["Puerto Rico", "PUR", "Puerto Rico", "Puerto Rico", S("11766")],
  ["Qatar", "QAT", "Catar", "Catar", C("qat")],
  ["Republic of Ireland", "IRL", "Irlanda", "Irlanda", C("irl"), "Ireland"],
  ["Romania", "ROU", "Rumanía", "Rumanía", C("rom")],
  ["Russia", "RUS", "Rusia", "Rusia", C("rus")],
  ["Rwanda", "RWA", "Ruanda", "Ruanda", C("rwa")],
  ["Samoa", "SAM", "Samoa", "Samoa", C("sam")],
  ["San Marino", "SMR", "San Marino", "San Marino", C("smr")],
  ["Sao Tome and Principe", "STP", "Santo Tomé y Príncipe", "Santo Tomé", S("11808"), "São Tomé and Príncipe"],
  ["Saudi Arabia", "KSA", "Arabia Saudita", "Arabia S.", C("ksa")],
  ["Scotland", "SCO", "Escocia", "Escocia", C("sco")],
  ["Senegal", "SEN", "Senegal", "Senegal", C("sen")],
  ["Serbia", "SRB", "Serbia", "Serbia", C("sba"), "Serbia & Montenegro"],
  ["Seychelles", "SEY", "Seychelles", "Seychelles", C("sey")],
  ["Sierra Leone", "SLE", "Sierra Leona", "Sierra Leona", C("sle")],
  ["Singapore", "SIN", "Singapur", "Singapur", C("sin")],
  ["Sint Maarten", "SMA", "Sint Maarten", "Sint Maarten", C("sma")],
  ["Slovakia", "SVK", "Eslovaquia", "Eslovaquia", C("svk")],
  ["Slovenia", "SVN", "Eslovenia", "Eslovenia", C("svn")],
  ["Solomon Islands", "SOL", "Islas Salomón", "I. Salomón", C("sol")],
  ["Somalia", "SOM", "Somalia", "Somalia", C("som")],
  ["South Africa", "RSA", "Sudáfrica", "Sudáfrica", C("rsa")],
  ["South Korea", "KOR", "Corea del Sur", "Corea Sur", C("kors"), "Korea Republic"],
  ["South Sudan", "SSD", "Sudán del Sur", "Sudán S.", S("14075")],
  ["Spain", "ESP", "España", "España", C("esp"), "España"],
  ["Sri Lanka", "SRI", "Sri Lanka", "Sri Lanka", C("sri")],
  ["St. Kitts and Nevis", "SKN", "San Cristóbal y Nieves", "S. Cristóbal", C("skn"), "Saint Kitts and Nevis"],
  ["St. Lucia", "LCA", "Santa Lucía", "Sta. Lucía", C("lca"), "Saint Lucia"],
  ["St. Martin", "SMN", "San Martín", "San Martín", C("stm"), "Saint Martin"],
  ["St. Vincent and the Grenadines", "VIN", "San Vicente y las Granadinas", "S. Vicente", C("vin"), "Saint Vincent and the Grenadines"],
  ["Sudan", "SUD", "Sudán", "Sudán", C("sud")],
  ["Suriname", "SUR", "Surinam", "Surinam", C("sur")],
  ["Sweden", "SWE", "Suecia", "Suecia", C("swe")],
  ["Switzerland", "SUI", "Suiza", "Suiza", C("sui")],
  ["Syria", "SYR", "Siria", "Siria", C("syr")],
  ["Tahiti", "TAH", "Tahití", "Tahití", C("tah")],
  ["Tajikistan", "TJK", "Tayikistán", "Tayikistán", C("tjk")],
  ["Tanzania", "TAN", "Tanzania", "Tanzania", C("tan")],
  ["Thailand", "THA", "Tailandia", "Tailandia", C("tha")],
  ["Timor-Leste", "TLS", "Timor Oriental", "Timor Or.", C("tmp"), "East Timor"],
  ["Togo", "TOG", "Togo", "Togo", C("tog")],
  ["Tonga", "TGA", "Tonga", "Tonga", C("tga")],
  ["Trinidad and Tobago", "TRI", "Trinidad y Tobago", "Trinidad y T.", C("tri")],
  ["Tunisia", "TUN", "Túnez", "Túnez", C("tun")],
  ["Türkiye", "TUR", "Turquía", "Turquía", C("tur"), "Turkey", "Turkiye"],
  ["Turkmenistan", "TKM", "Turkmenistán", "Turkmenistán", C("tkm")],
  ["Turks and Caicos Islands", "TCA", "Islas Turcas y Caicos", "I. Turcas", C("tca")],
  ["Uganda", "UGA", "Uganda", "Uganda", C("uga")],
  ["Ukraine", "UKR", "Ucrania", "Ucrania", C("ukr")],
  ["United Arab Emirates", "UAE", "Emiratos Árabes Unidos", "Emiratos Á.", C("uae"), "UAE"],
  ["United States", "USA", "Estados Unidos", "EE. UU.", C("usa"), "USA"],
  ["Uruguay", "URU", "Uruguay", "Uruguay", C("uru")],
  ["US Virgin Islands", "USVI", "Islas Vírgenes EE. UU.", "I. V. EE. UU.", C("vir")],
  ["Uzbekistan", "UZB", "Uzbekistán", "Uzbekistán", C("uzb")],
  ["Vanuatu", "VAN", "Vanuatu", "Vanuatu", C("van")],
  ["Venezuela", "VEN", "Venezuela", "Venezuela", C("ven")],
  ["Vietnam", "VIE", "Vietnam", "Vietnam", C("vie")],
  ["Wales", "WAL", "Gales", "Gales", C("wal")],
  ["Yemen", "YEM", "Yemen", "Yemen", C("yem")],
  ["Zambia", "ZAM", "Zambia", "Zambia", C("zam")],
  ["Zimbabwe", "ZIM", "Zimbabue", "Zimbabue", S("4214")],
];

export const NATIONAL_TEAMS: readonly NationalTeamDef[] = RAW_ENTRIES.map(
  ([espnName, code, nameEs, shortEs, externalLogo, ...aliases]) => {
    const slug = slugifyCanonicalNationalName(nameEs);
    return {
      slug,
      code,
      nameEs,
      shortEs,
      espnNames: [espnName, ...aliases],
      emblemPath: `/brand/official/countries/${slug}.png`,
      externalLogo,
    };
  },
);

const BY_KEY = new Map<string, NationalTeamDef>();

function indexKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

for (const def of NATIONAL_TEAMS) {
  BY_KEY.set(def.slug, def);
  BY_KEY.set(indexKey(def.nameEs), def);
  BY_KEY.set(indexKey(def.shortEs), def);
  for (const name of def.espnNames) {
    BY_KEY.set(indexKey(name), def);
  }
}

export function findNationalTeamDef(rawNameOrSlug: string): NationalTeamDef | null {
  const trimmed = rawNameOrSlug.trim();
  const clean =
    !trimmed.includes(" ") && trimmed.includes(".")
      ? trimmed.split(".").slice(1).join(".")
      : trimmed;
  return BY_KEY.get(clean.toLowerCase()) ?? BY_KEY.get(indexKey(clean)) ?? null;
}

export const NATIONAL_COMPETITION_ESPN_LOGOS: Readonly<Record<string, string>> = {
  "uefa-nations": "https://a.espncdn.com/i/leaguelogos/soccer/500/2395.png",
  "concacaf-nations": "https://a.espncdn.com/i/leaguelogos/soccer/500/2406.png",
  amistosos: "https://a.espncdn.com/i/leaguelogos/soccer/500/53.png",
  "copa-del-mundo": "https://a.espncdn.com/i/leaguelogos/soccer/500/4.png",
  eliminatorias: "https://a.espncdn.com/i/leaguelogos/soccer/500/65.png",
  "copa-america": "https://a.espncdn.com/i/leaguelogos/soccer/500/83.png",
  eurocopa: "https://a.espncdn.com/i/leaguelogos/soccer/500/74.png",
  "copa-oro": "https://a.espncdn.com/i/leaguelogos/soccer/500/59.png",
  "copa-africana": "https://a.espncdn.com/i/leaguelogos/soccer/500/76.png",
  "copa-asiatica": "https://a.espncdn.com/i/leaguelogos/soccer/500/2243.png",
};
