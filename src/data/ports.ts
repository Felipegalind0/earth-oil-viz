export interface PortSourceGroup {
  id: string;
  title: string;
  url?: string;
  usage: string;
}

export interface PortLocation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  role: "export" | "import" | "both";
  notes?: string;
}

export interface CountryPortCatalogEntry {
  code: string;
  name: string;
  region: string;
  primaryPortId: string;
  ports: PortLocation[];
  methodsNote?: string;
}

type PrimaryPortTuple = [string, string, string, number, number, string];

export const PORT_SOURCE_GROUPS: PortSourceGroup[] = [
  {
    id: "un_locode",
    title: "UNECE UN/LOCODE",
    url: "https://unece.org/trade/uncefact/unlocode-code-list-country-and-territory",
    usage: "Standardized port naming and approximate port locality reference.",
  },
  {
    id: "operator_refs",
    title: "Port authority, terminal operator, and refinery references",
    usage: "Select petroleum terminals or crude reception points instead of country centroids.",
  },
  {
    id: "manual_maps",
    title: "Manual cartographic verification",
    usage: "Anchor each point near the marine terminal, offshore loading area, or inland pipeline receipt point used in the visualization.",
  },
  {
    id: "gem_goit",
    title: "Global Energy Monitor: Global Oil Infrastructure Tracker",
    url: "https://globalenergymonitor.org/projects/global-oil-infrastructure-tracker/",
    usage: "Cross-check pipeline-linked export and receipt terminals for countries that trade crude through overland infrastructure.",
  },
];

const PRIMARY_PORTS: PrimaryPortTuple[] = [
  ["SAU", "Saudi Arabia", "Ras Tanura", 26.64, 50.17, "middle_east"],
  ["IRQ", "Iraq", "Al Basrah OT", 29.68, 48.8, "middle_east"],
  ["IRN", "Iran", "Kharg Island", 29.23, 50.33, "middle_east"],
  ["ARE", "UAE", "Fujairah", 25.12, 56.33, "middle_east"],
  ["KWT", "Kuwait", "Mina Al Ahmadi", 29.06, 48.16, "middle_east"],
  ["QAT", "Qatar", "Ras Laffan", 25.93, 51.57, "middle_east"],
  ["OMN", "Oman", "Mina Al Fahal", 23.63, 58.53, "middle_east"],
  ["ISR", "Israel", "Ashkelon", 31.67, 34.55, "middle_east"],
  ["JOR", "Jordan", "Aqaba", 29.52, 35.01, "middle_east"],
  ["NGA", "Nigeria", "Bonny Island", 4.42, 7.17, "africa"],
  ["AGO", "Angola", "Soyo Terminal", -6.13, 12.37, "africa"],
  ["LBY", "Libya", "Es Sider", 30.63, 18.35, "africa"],
  ["DZA", "Algeria", "Arzew", 35.82, -0.3, "africa"],
  ["EGY", "Egypt", "Ain Sukhna", 29.6, 32.35, "africa"],
  ["GNQ", "Equatorial Guinea", "Malabo", 3.75, 8.78, "africa"],
  ["GAB", "Gabon", "Port Gentil", -0.72, 8.78, "africa"],
  ["COG", "Congo", "Pointe-Noire", -4.78, 11.83, "africa"],
  ["ZAF", "South Africa", "Saldanha Bay", -33.0, 17.93, "africa"],
  ["GHA", "Ghana", "Takoradi", 4.88, -1.76, "africa"],
  ["CIV", "Côte d'Ivoire", "Abidjan", 5.31, -4.01, "africa"],
  ["CMR", "Cameroon", "Kribi", 2.94, 9.91, "africa"],
  ["TCD", "Chad", "Kribi (via pipe)", 2.94, 9.91, "africa"],
  ["SDN", "Sudan", "Port Sudan", 19.62, 37.22, "africa"],
  ["SSD", "South Sudan", "Port Sudan (via)", 19.62, 37.22, "africa"],
  ["SEN", "Senegal", "Dakar", 14.69, -17.44, "africa"],
  ["TUN", "Tunisia", "La Skhira", 34.3, 10.07, "africa"],
  ["COD", "DR Congo", "Muanda", -5.93, 12.35, "africa"],
  ["NOR", "Norway", "Mongstad", 60.81, 5.03, "north_europe"],
  ["GBR", "United Kingdom", "Fawley", 50.85, -1.33, "north_europe"],
  ["NLD", "Netherlands", "Rotterdam", 51.9, 4.5, "north_europe"],
  ["DEU", "Germany", "Wilhelmshaven", 53.51, 8.12, "north_europe"],
  ["SWE", "Sweden", "Gothenburg", 57.7, 11.8, "north_europe"],
  ["FIN", "Finland", "Porvoo", 60.31, 25.55, "north_europe"],
  ["BEL", "Belgium", "Antwerp", 51.3, 4.28, "north_europe"],
  ["POL", "Poland", "Gdansk", 54.35, 18.65, "north_europe"],
  ["LTU", "Lithuania", "Butinge", 56.07, 21.07, "north_europe"],
  ["DNK", "Denmark", "Fredericia", 55.56, 9.75, "north_europe"],
  ["IRL", "Ireland", "Whitegate", 51.82, -8.22, "north_europe"],
  ["ITA", "Italy", "Trieste", 45.65, 13.73, "med_europe"],
  ["ESP", "Spain", "Cartagena", 37.6, -0.98, "med_europe"],
  ["FRA", "France", "Fos-sur-Mer", 43.42, 4.94, "med_europe"],
  ["GRC", "Greece", "Agioi Theodoroi", 37.94, 23.06, "med_europe"],
  ["TUR", "Turkey", "Ceyhan", 36.68, 35.8, "med_europe"],
  ["PRT", "Portugal", "Sines", 37.95, -8.87, "med_europe"],
  ["HRV", "Croatia", "Omisalj", 45.21, 14.54, "med_europe"],
  ["ROU", "Romania", "Constanta", 44.16, 28.67, "med_europe"],
  ["BGR", "Bulgaria", "Burgas", 42.49, 27.49, "med_europe"],
  ["AUT", "Austria", "Schwechat", 48.13, 16.53, "med_europe"],
  ["CHE", "Switzerland", "Basel (pipeline)", 47.56, 7.59, "med_europe"],
  ["CZE", "Czech Republic", "Kralupy (pipe)", 50.24, 14.31, "med_europe"],
  ["HUN", "Hungary", "Szazhalombatta", 47.32, 18.92, "med_europe"],
  ["SVK", "Slovakia", "Bratislava", 48.14, 17.11, "med_europe"],
  ["SRB", "Serbia", "Pancevo", 44.87, 20.67, "med_europe"],
  ["GIB", "Gibraltar", "Gibraltar", 36.14, -5.35, "med_europe"],
  ["RUS", "Russia", "Primorsk", 60.36, 28.61, "russia_cis"],
  ["KAZ", "Kazakhstan", "Atyrau", 47.1, 51.91, "russia_cis"],
  ["AZE", "Azerbaijan", "Sangachal", 40.19, 49.47, "russia_cis"],
  ["TKM", "Turkmenistan", "Turkmenbashi", 40.05, 52.96, "russia_cis"],
  ["UZB", "Uzbekistan", "Bukhara", 39.77, 64.42, "russia_cis"],
  ["USA", "United States", "LOOP Terminal", 28.88, -90.03, "north_america"],
  ["CAN", "Canada", "Saint John NB", 45.26, -66.06, "north_america"],
  ["MEX", "Mexico", "Dos Bocas", 18.43, -93.17, "north_america"],
  ["BRA", "Brazil", "Angra dos Reis", -23.01, -44.32, "south_america"],
  ["VEN", "Venezuela", "Jose Terminal", 10.17, -65.01, "south_america"],
  ["COL", "Colombia", "Covenas", 9.4, -75.69, "south_america"],
  ["ECU", "Ecuador", "Esmeraldas", 0.97, -79.63, "south_america"],
  ["ARG", "Argentina", "Bahia Blanca", -38.74, -62.27, "south_america"],
  ["TTO", "Trinidad & Tobago", "Point Fortin", 10.17, -61.69, "south_america"],
  ["GUY", "Guyana", "Georgetown", 6.81, -58.17, "south_america"],
  ["CHL", "Chile", "Quintero", -32.77, -71.53, "south_america"],
  ["PER", "Peru", "La Pampilla", -12.04, -77.12, "south_america"],
  ["URY", "Uruguay", "Montevideo", -34.91, -56.21, "south_america"],
  ["PAN", "Panama", "Charco Azul", 8.08, -82.87, "south_america"],
  ["DOM", "Dominican Republic", "Palenque", 18.28, -69.38, "south_america"],
  ["JAM", "Jamaica", "Kingston", 17.97, -76.8, "south_america"],
  ["NIC", "Nicaragua", "Puerto Sandino", 12.19, -86.76, "south_america"],
  ["CHN", "China", "Qingdao", 36.07, 120.38, "east_asia"],
  ["JPN", "Japan", "Chiba", 35.56, 140.08, "east_asia"],
  ["KOR", "South Korea", "Ulsan", 35.5, 129.38, "east_asia"],
  ["TWN", "Taiwan", "Kaohsiung", 22.61, 120.27, "east_asia"],
  ["MNG", "Mongolia", "Ulaanbaatar", 47.91, 106.91, "east_asia"],
  ["IND", "India", "Jamnagar", 22.47, 70.02, "south_asia"],
  ["PAK", "Pakistan", "Port Qasim", 24.78, 67.35, "south_asia"],
  ["BGD", "Bangladesh", "Chittagong", 22.34, 91.81, "south_asia"],
  ["LKA", "Sri Lanka", "Colombo", 6.94, 79.84, "south_asia"],
  ["SGP", "Singapore", "Jurong Island", 1.26, 103.83, "se_asia_oceania"],
  ["MYS", "Malaysia", "Pengerang", 1.36, 104.18, "se_asia_oceania"],
  ["IDN", "Indonesia", "Cilacap", -7.73, 109.02, "se_asia_oceania"],
  ["THA", "Thailand", "Map Ta Phut", 12.68, 101.15, "se_asia_oceania"],
  ["AUS", "Australia", "Kwinana", -32.23, 115.77, "se_asia_oceania"],
  ["VNM", "Vietnam", "Vung Tau", 10.35, 107.08, "se_asia_oceania"],
  ["PHL", "Philippines", "Batangas", 13.76, 121.06, "se_asia_oceania"],
  ["BRN", "Brunei", "Seria", 4.61, 114.32, "se_asia_oceania"],
  ["MMR", "Myanmar", "Thilawa", 16.67, 96.25, "se_asia_oceania"],
  ["NZL", "New Zealand", "Marsden Point", -35.83, 174.49, "se_asia_oceania"],
  ["PNG", "Papua New Guinea", "Kumul Terminal", -6.75, 143.7, "se_asia_oceania"],
];

const ALTERNATE_PORTS: Partial<Record<string, PortLocation[]>> = {
  SAU: [
    {
      id: "yanbu",
      name: "Yanbu",
      lat: 24.09,
      lon: 38.06,
      role: "export",
      notes: "Red Sea export alternative linked to the East-West crude pipeline.",
    },
  ],
  ARE: [
    {
      id: "jebel_dhanna",
      name: "Jebel Dhanna",
      lat: 24.18,
      lon: 52.58,
      role: "export",
      notes: "Abu Dhabi crude export terminal on the Gulf side.",
    },
  ],
  USA: [
    {
      id: "houston",
      name: "Houston Ship Channel",
      lat: 29.73,
      lon: -95.12,
      role: "both",
      notes: "Large U.S. crude import and export complex; useful editing anchor for Gulf Coast routing.",
    },
    {
      id: "long_beach",
      name: "Long Beach",
      lat: 33.75,
      lon: -118.19,
      role: "import",
      notes: "Pacific receipt point for alternative trans-Pacific logic.",
    },
  ],
  CAN: [
    {
      id: "westridge",
      name: "Westridge Marine Terminal",
      lat: 49.29,
      lon: -122.94,
      role: "export",
      notes: "Pacific export outlet for pipeline-fed Canadian crude.",
    },
  ],
  RUS: [
    {
      id: "kozmino",
      name: "Kozmino",
      lat: 42.71,
      lon: 132.8,
      role: "export",
      notes: "Far East export outlet for ESPO-linked crude shipments.",
    },
    {
      id: "novorossiysk",
      name: "Novorossiysk",
      lat: 44.72,
      lon: 37.78,
      role: "export",
      notes: "Black Sea outlet for southern Russian and Caspian-linked crude.",
    },
  ],
  CHN: [
    {
      id: "ningbo",
      name: "Ningbo-Zhoushan",
      lat: 29.94,
      lon: 121.89,
      role: "import",
      notes: "Major East China crude import complex.",
    },
    {
      id: "dalian",
      name: "Dalian",
      lat: 38.92,
      lon: 121.65,
      role: "import",
      notes: "Northern Chinese crude import and storage hub.",
    },
  ],
  JPN: [
    {
      id: "kawasaki",
      name: "Kawasaki",
      lat: 35.49,
      lon: 139.74,
      role: "import",
      notes: "Tokyo Bay refining and import complex.",
    },
  ],
  NLD: [
    {
      id: "europoort",
      name: "Europoort",
      lat: 51.95,
      lon: 4.13,
      role: "both",
      notes: "Rotterdam outer harbor cluster, helpful for pipeline and coastal hand edits.",
    },
  ],
  DEU: [
    {
      id: "rostock",
      name: "Rostock",
      lat: 54.09,
      lon: 12.1,
      role: "import",
      notes: "Baltic crude receipt point connected to eastern German refining infrastructure.",
    },
  ],
  ITA: [
    {
      id: "augusta",
      name: "Augusta",
      lat: 37.24,
      lon: 15.23,
      role: "import",
      notes: "Sicilian crude and refinery complex.",
    },
  ],
};

export const COUNTRY_ROUTE_ENTRY_WAYPOINTS: Partial<Record<string, string[]>> = {
  SAU: ["persian_gulf"],
  IRQ: ["persian_gulf"],
  IRN: ["persian_gulf"],
  KWT: ["persian_gulf"],
  QAT: ["persian_gulf"],
  ARE: ["gulf_of_oman", "hormuz"],
  OMN: ["gulf_of_oman"],
};

export const COUNTRY_PORTS: CountryPortCatalogEntry[] = PRIMARY_PORTS.map(
  ([code, name, portName, lat, lon, region]) => {
    const primaryPortId = portName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

    const primaryPort: PortLocation = {
      id: primaryPortId,
      name: portName,
      lat,
      lon,
      role: "both",
    };

    const alternates = ALTERNATE_PORTS[code] ?? [];
    const methodsNote = alternates.length > 0
      ? "Primary anchor plus manually curated alternate terminals for route editing."
      : "Single primary anchor selected for the current visualization.";

    return {
      code,
      name,
      region,
      primaryPortId,
      ports: [primaryPort, ...alternates],
      methodsNote,
    };
  },
);

export const COUNTRY_PORTS_MAP = new Map<string, CountryPortCatalogEntry>(
  COUNTRY_PORTS.map((entry) => [entry.code, entry]),
);

export function getCountryPorts(code: string): CountryPortCatalogEntry {
  const entry = COUNTRY_PORTS_MAP.get(code);
  if (!entry) throw new Error(`Unknown country port catalog entry: ${code}`);
  return entry;
}

export function getPrimaryPort(code: string): PortLocation {
  const entry = getCountryPorts(code);
  const port = entry.ports.find((item) => item.id === entry.primaryPortId);
  if (!port) throw new Error(`Missing primary port for ${code}`);
  return port;
}
