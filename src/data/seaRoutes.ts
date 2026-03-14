// ─── Sea Route Waypoint Network & Route Templates ───────────────────
// Defines the maritime chokepoints and the routes oil takes between regions.

/** [latitude, longitude] */
export type LatLon = [number, number];

// ─── Named Waypoints ────────────────────────────────────────────────
export const WAYPOINTS: Record<string, LatLon> = {
  // Persian Gulf & Indian Ocean
  hormuz:           [26.5, 56.5],
  gulf_of_oman:     [24, 59],
  arabian_sea:      [15, 60],
  south_sri_lanka:  [5, 80],
  indian_ocean_cen: [0, 75],

  // Red Sea / Suez
  bab_el_mandeb:    [12.5, 43.3],
  red_sea_mid:      [18, 39],
  red_sea_north:    [22, 38],
  suez_south:       [30, 32.5],
  suez_north:       [31.5, 32.3],

  // Mediterranean
  east_med:         [34, 30],
  central_med:      [37, 15],
  west_med:         [36.5, 0],

  // Atlantic approaches
  gibraltar:        [36, -5.5],
  bay_of_biscay:    [45, -5],
  english_channel:  [50, -1],
  north_sea_south:  [54, 4],

  // South Atlantic / Cape route
  cape_of_good_hope: [-34.5, 18.5],
  south_atlantic:   [-20, 0],
  mid_atlantic_s:   [0, -20],
  mid_atlantic_n:   [40, -40],

  // Africa
  gulf_of_guinea:   [3, 5],
  west_africa:      [5, -2],
  mozambique_ch:    [-15, 42],
  east_africa:      [-5, 45],

  // Malacca / East Asia
  malacca_west:     [5, 95],
  singapore_strait: [1.3, 104],
  south_china_sea:  [10, 112],
  east_china_sea:   [30, 125],
  korea_strait:     [34, 129],

  // Americas
  panama_caribbean: [9.3, -79.9],
  panama_pacific:   [8.9, -79.5],
  caribbean:        [18, -75],
  us_gulf_coast:    [27, -88],
  us_east_coast:    [37, -74],
  brazil_coast:     [-20, -38],
  brazil_ne:        [-5, -35],

  // Russia Pacific
  russia_pacific:   [43, 132],
  baltic_sea:       [58, 20],

  // Region centers (used as route endpoints)
  r_north_america:  [30, -90],
  r_south_america:  [-15, -38],
  r_north_europe:   [57, 3],
  r_med_europe:     [40, 15],
  r_russia_cis:     [60, 50],
  r_middle_east:    [26, 52],
  r_africa:         [3, 5],
  r_south_asia:     [15, 73],
  r_east_asia:      [32, 125],
  r_se_asia:        [1, 104],
};

// ─── Route Definitions ──────────────────────────────────────────────
export interface SeaRoute {
  from: string;        // region id
  to: string;          // region id
  waypoints: string[]; // ordered WAYPOINTS keys from source to dest
  bidirectional?: boolean; // if true, flow can go either way
}

export const SEA_ROUTES: SeaRoute[] = [
  // ── Middle East exports ───────────────────────────────────────────
  {
    from: "middle_east",
    to: "east_asia",
    waypoints: [
      "r_middle_east", "hormuz", "gulf_of_oman", "arabian_sea",
      "south_sri_lanka", "malacca_west", "singapore_strait",
      "south_china_sea", "east_china_sea", "r_east_asia",
    ],
  },
  {
    from: "middle_east",
    to: "south_asia",
    waypoints: [
      "r_middle_east", "hormuz", "gulf_of_oman", "arabian_sea",
      "r_south_asia",
    ],
  },
  {
    from: "middle_east",
    to: "se_asia_oceania",
    waypoints: [
      "r_middle_east", "hormuz", "gulf_of_oman", "arabian_sea",
      "south_sri_lanka", "malacca_west", "r_se_asia",
    ],
  },
  {
    from: "middle_east",
    to: "med_europe",
    waypoints: [
      "r_middle_east", "hormuz", "gulf_of_oman", "arabian_sea",
      "bab_el_mandeb", "red_sea_mid", "red_sea_north", "suez_south",
      "suez_north", "east_med", "r_med_europe",
    ],
  },
  {
    from: "middle_east",
    to: "north_europe",
    waypoints: [
      "r_middle_east", "hormuz", "gulf_of_oman", "arabian_sea",
      "bab_el_mandeb", "red_sea_mid", "red_sea_north", "suez_south",
      "suez_north", "east_med", "central_med", "gibraltar",
      "bay_of_biscay", "english_channel", "north_sea_south",
      "r_north_europe",
    ],
  },
  {
    from: "middle_east",
    to: "north_america",
    waypoints: [
      "r_middle_east", "hormuz", "gulf_of_oman", "arabian_sea",
      "bab_el_mandeb", "red_sea_mid", "red_sea_north", "suez_south",
      "suez_north", "east_med", "central_med", "gibraltar",
      "mid_atlantic_s", "caribbean", "r_north_america",
    ],
  },
  {
    from: "middle_east",
    to: "south_america",
    waypoints: [
      "r_middle_east", "hormuz", "gulf_of_oman", "arabian_sea",
      "bab_el_mandeb", "red_sea_mid", "red_sea_north", "suez_south",
      "suez_north", "east_med", "central_med", "gibraltar",
      "mid_atlantic_s", "brazil_ne", "r_south_america",
    ],
  },

  // ── Africa exports ────────────────────────────────────────────────
  {
    from: "africa",
    to: "north_europe",
    waypoints: [
      "r_africa", "west_africa", "gibraltar", "bay_of_biscay",
      "english_channel", "north_sea_south", "r_north_europe",
    ],
  },
  {
    from: "africa",
    to: "med_europe",
    waypoints: [
      "r_africa", "west_africa", "gibraltar", "west_med",
      "central_med", "r_med_europe",
    ],
  },
  {
    from: "africa",
    to: "north_america",
    waypoints: [
      "r_africa", "west_africa", "mid_atlantic_s", "caribbean",
      "r_north_america",
    ],
  },
  {
    from: "africa",
    to: "south_america",
    waypoints: [
      "r_africa", "south_atlantic", "brazil_ne", "r_south_america",
    ],
  },
  {
    from: "africa",
    to: "east_asia",
    waypoints: [
      "r_africa", "south_atlantic", "cape_of_good_hope",
      "mozambique_ch", "east_africa", "arabian_sea",
      "south_sri_lanka", "malacca_west", "singapore_strait",
      "south_china_sea", "east_china_sea", "r_east_asia",
    ],
  },
  {
    from: "africa",
    to: "south_asia",
    waypoints: [
      "r_africa", "south_atlantic", "cape_of_good_hope",
      "mozambique_ch", "east_africa", "arabian_sea", "r_south_asia",
    ],
  },

  // ── Russia/CIS exports ───────────────────────────────────────────
  {
    from: "russia_cis",
    to: "north_europe",
    waypoints: [
      "r_russia_cis", "baltic_sea", "north_sea_south", "r_north_europe",
    ],
  },
  {
    from: "russia_cis",
    to: "med_europe",
    waypoints: [
      "r_russia_cis", "baltic_sea", "north_sea_south",
      "english_channel", "bay_of_biscay", "gibraltar",
      "central_med", "r_med_europe",
    ],
  },
  {
    from: "russia_cis",
    to: "east_asia",
    waypoints: [
      "r_russia_cis", "russia_pacific", "korea_strait",
      "east_china_sea", "r_east_asia",
    ],
  },
  {
    from: "russia_cis",
    to: "south_asia",
    waypoints: [
      "r_russia_cis", "baltic_sea", "north_sea_south",
      "english_channel", "bay_of_biscay", "gibraltar",
      "central_med", "east_med", "suez_north", "suez_south",
      "red_sea_north", "red_sea_mid", "bab_el_mandeb",
      "arabian_sea", "r_south_asia",
    ],
  },

  // ── South America exports ────────────────────────────────────────
  {
    from: "south_america",
    to: "north_america",
    waypoints: [
      "r_south_america", "brazil_ne", "caribbean", "r_north_america",
    ],
  },
  {
    from: "south_america",
    to: "north_europe",
    waypoints: [
      "r_south_america", "brazil_ne", "mid_atlantic_s",
      "mid_atlantic_n", "english_channel", "north_sea_south",
      "r_north_europe",
    ],
  },
  {
    from: "south_america",
    to: "east_asia",
    waypoints: [
      "r_south_america", "brazil_coast", "south_atlantic",
      "cape_of_good_hope", "mozambique_ch", "east_africa",
      "arabian_sea", "south_sri_lanka", "malacca_west",
      "singapore_strait", "south_china_sea", "east_china_sea",
      "r_east_asia",
    ],
  },

  // ── North America exports ────────────────────────────────────────
  {
    from: "north_america",
    to: "north_europe",
    waypoints: [
      "r_north_america", "us_east_coast", "mid_atlantic_n",
      "english_channel", "north_sea_south", "r_north_europe",
    ],
  },
  {
    from: "north_america",
    to: "east_asia",
    waypoints: [
      "r_north_america", "us_gulf_coast", "panama_caribbean",
      "panama_pacific", "south_china_sea", "east_china_sea",
      "r_east_asia",
    ],
  },
  {
    from: "north_america",
    to: "south_asia",
    waypoints: [
      "r_north_america", "us_east_coast", "mid_atlantic_n",
      "gibraltar", "central_med", "east_med", "suez_north",
      "suez_south", "red_sea_north", "red_sea_mid",
      "bab_el_mandeb", "arabian_sea", "r_south_asia",
    ],
  },

  // ── SE Asia / Oceania ─────────────────────────────────────────────
  {
    from: "se_asia_oceania",
    to: "east_asia",
    waypoints: [
      "r_se_asia", "singapore_strait", "south_china_sea",
      "east_china_sea", "r_east_asia",
    ],
  },
  {
    from: "se_asia_oceania",
    to: "south_asia",
    waypoints: [
      "r_se_asia", "malacca_west", "south_sri_lanka", "r_south_asia",
    ],
  },
];

// ─── Route Lookup ───────────────────────────────────────────────────
const routeIndex = new Map<string, SeaRoute>();
for (const route of SEA_ROUTES) {
  routeIndex.set(`${route.from}→${route.to}`, route);
}

/** Find the sea route from one region to another, checking both directions */
export function findRoute(from: string, to: string): SeaRoute | undefined {
  return (
    routeIndex.get(`${from}→${to}`) ??
    routeIndex.get(`${to}→${from}`)
  );
}

// ─── Catmull-Rom interpolation on the globe ─────────────────────────
/** Interpolate smooth curve through waypoints using Catmull-Rom spline.
 *  Returns densified array of [lat, lon] points. */
export function interpolateRoute(
  waypointKeys: string[],
  segmentsPerLeg: number = 12,
): LatLon[] {
  const pts = waypointKeys.map((k) => {
    const wp = WAYPOINTS[k];
    if (!wp) throw new Error(`Unknown waypoint: ${k}`);
    return wp;
  });

  if (pts.length < 2) return pts;
  if (pts.length === 2) return linearInterp(pts[0], pts[1], segmentsPerLeg);

  const result: LatLon[] = [];

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];

    for (let s = 0; s < segmentsPerLeg; s++) {
      const t = s / segmentsPerLeg;
      result.push(catmullRom(p0, p1, p2, p3, t));
    }
  }

  // Push the final point
  result.push(pts[pts.length - 1]);
  return result;
}

function linearInterp(a: LatLon, b: LatLon, steps: number): LatLon[] {
  const result: LatLon[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return result;
}

function catmullRom(
  p0: LatLon, p1: LatLon, p2: LatLon, p3: LatLon, t: number,
): LatLon {
  const t2 = t * t;
  const t3 = t2 * t;

  const lat =
    0.5 * (
      2 * p1[0] +
      (-p0[0] + p2[0]) * t +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
    );

  const lon =
    0.5 * (
      2 * p1[1] +
      (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
    );

  return [lat, lon];
}
