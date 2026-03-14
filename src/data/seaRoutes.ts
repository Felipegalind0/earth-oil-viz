// ─── Sea Route Waypoint Graph & Pathfinding ─────────────────────────
// Defines a graph of maritime waypoints/chokepoints and uses Dijkstra's
// algorithm to find the shortest sea route between any two country ports.

/** [latitude, longitude] */
export type LatLon = [number, number];

// ─── Named Waypoints ────────────────────────────────────────────────
export const WAYPOINTS: Record<string, LatLon> = {
  // Persian Gulf & Indian Ocean
  persian_gulf:     [27, 50],
  hormuz:           [26.5, 56.5],
  gulf_of_oman:     [24, 59],
  arabian_sea_n:    [20, 62],
  arabian_sea:      [15, 60],
  south_sri_lanka:  [5, 80],

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
  north_sea_north:  [60, 3],

  // Baltic & Black Sea
  baltic_sea:       [57, 18],
  danish_straits:    [56, 11],
  bosphorus:        [41.2, 29.0],
  black_sea:        [43, 35],

  // South Atlantic / Cape route
  cape_of_good_hope: [-34.5, 18.5],
  south_atlantic:   [-20, 0],
  mid_atlantic_s:   [0, -20],
  mid_atlantic_n:   [40, -40],

  // Africa coasts
  gulf_of_guinea:   [3, 5],
  west_africa:      [5, -2],
  east_africa:      [-5, 45],
  mozambique_ch:    [-15, 42],

  // Malacca / East Asia
  malacca_west:     [5, 95],
  singapore_strait: [1.3, 104],
  south_china_sea:  [10, 112],
  east_china_sea:   [30, 125],
  korea_strait:     [34, 129],
  japan_pacific:    [35, 141],

  // Americas
  panama_caribbean: [9.3, -79.9],
  panama_pacific:   [8.9, -79.5],
  caribbean:        [18, -75],
  us_gulf_coast:    [27, -88],
  us_east_coast:    [37, -74],
  brazil_ne:        [-5, -35],
  brazil_coast:     [-20, -38],
  argentina_coast:  [-38, -56],
  venezuela_coast:  [11, -65],

  // Russia Pacific
  russia_pacific:   [43, 132],
};

// ─── Graph Edges ────────────────────────────────────────────────────
// Each edge is [from, to] — bidirectional. Distance computed via haversine.
const EDGES: [string, string][] = [
  // Persian Gulf
  ["persian_gulf", "hormuz"],
  ["hormuz", "gulf_of_oman"],
  ["gulf_of_oman", "arabian_sea_n"],
  ["arabian_sea_n", "arabian_sea"],

  // Indian Ocean routes
  ["arabian_sea", "bab_el_mandeb"],
  ["arabian_sea", "south_sri_lanka"],
  ["arabian_sea", "east_africa"],

  // Red Sea → Suez → Mediterranean
  ["bab_el_mandeb", "red_sea_mid"],
  ["red_sea_mid", "red_sea_north"],
  ["red_sea_north", "suez_south"],
  ["suez_south", "suez_north"],
  ["suez_north", "east_med"],
  ["east_med", "central_med"],
  ["central_med", "west_med"],
  ["west_med", "gibraltar"],

  // Atlantic / Europe
  ["gibraltar", "bay_of_biscay"],
  ["bay_of_biscay", "english_channel"],
  ["english_channel", "north_sea_south"],
  ["north_sea_south", "north_sea_north"],
  ["north_sea_south", "danish_straits"],
  ["danish_straits", "baltic_sea"],

  // Black Sea
  ["bosphorus", "east_med"],
  ["bosphorus", "black_sea"],

  // Malacca → East Asia
  ["south_sri_lanka", "malacca_west"],
  ["malacca_west", "singapore_strait"],
  ["singapore_strait", "south_china_sea"],
  ["south_china_sea", "east_china_sea"],
  ["east_china_sea", "korea_strait"],
  ["korea_strait", "japan_pacific"],

  // Cape route (Africa)
  ["east_africa", "mozambique_ch"],
  ["mozambique_ch", "cape_of_good_hope"],
  ["cape_of_good_hope", "south_atlantic"],
  ["south_atlantic", "gulf_of_guinea"],
  ["south_atlantic", "mid_atlantic_s"],

  // West Africa coast
  ["gulf_of_guinea", "west_africa"],
  ["west_africa", "gibraltar"],

  // Atlantic crossings
  ["mid_atlantic_s", "brazil_ne"],
  ["mid_atlantic_s", "mid_atlantic_n"],
  ["mid_atlantic_s", "caribbean"],
  ["brazil_ne", "brazil_coast"],
  ["brazil_coast", "argentina_coast"],
  ["mid_atlantic_n", "english_channel"],
  ["mid_atlantic_n", "bay_of_biscay"],
  ["mid_atlantic_n", "us_east_coast"],

  // Americas
  ["caribbean", "us_gulf_coast"],
  ["caribbean", "panama_caribbean"],
  ["caribbean", "venezuela_coast"],
  ["panama_caribbean", "panama_pacific"],
  ["us_gulf_coast", "us_east_coast"],

  // Trans-Pacific (Panama → Asia)
  ["panama_pacific", "south_china_sea"],

  // Russia Pacific
  ["russia_pacific", "korea_strait"],
  ["russia_pacific", "east_china_sea"],
];

// ─── Haversine Distance ─────────────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Build Adjacency Graph ──────────────────────────────────────────
type Graph = Map<string, Map<string, number>>;

function buildGraph(): Graph {
  const graph: Graph = new Map();
  const ensureNode = (n: string) => {
    if (!graph.has(n)) graph.set(n, new Map());
  };

  for (const [a, b] of EDGES) {
    ensureNode(a);
    ensureNode(b);
    const wa = WAYPOINTS[a];
    const wb = WAYPOINTS[b];
    const dist = haversine(wa[0], wa[1], wb[0], wb[1]);
    graph.get(a)!.set(b, dist);
    graph.get(b)!.set(a, dist);
  }

  return graph;
}

const GRAPH = buildGraph();

// ─── Dijkstra's Algorithm ───────────────────────────────────────────
function dijkstra(
  graph: Graph,
  start: string,
  end: string,
): string[] | null {
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const visited = new Set<string>();
  const queue: [string, number][] = [[start, 0]];
  dist.set(start, 0);

  while (queue.length > 0) {
    queue.sort((a, b) => a[1] - b[1]);
    const [node, d] = queue.shift()!;

    if (visited.has(node)) continue;
    visited.add(node);

    if (node === end) {
      const path: string[] = [];
      let current: string | undefined = end;
      while (current) {
        path.unshift(current);
        current = prev.get(current);
      }
      return path;
    }

    const neighbors = graph.get(node);
    if (!neighbors) continue;

    for (const [neighbor, weight] of neighbors) {
      if (visited.has(neighbor)) continue;
      const newDist = d + weight;
      if (newDist < (dist.get(neighbor) ?? Infinity)) {
        dist.set(neighbor, newDist);
        prev.set(neighbor, node);
        queue.push([neighbor, newDist]);
      }
    }
  }

  return null;
}

// ─── Connect Country Ports to Waypoint Graph ────────────────────────
/** Find the N nearest waypoints to a given lat/lon */
function nearestWaypoints(
  lat: number,
  lon: number,
  n: number = 3,
): { name: string; dist: number }[] {
  const ranked = Object.entries(WAYPOINTS)
    .map(([name, wp]) => ({
      name,
      dist: haversine(lat, lon, wp[0], wp[1]),
    }))
    .sort((a, b) => a.dist - b.dist);
  return ranked.slice(0, n);
}

// Route cache: "FROM→TO" → interpolated LatLon[]
const routeCache = new Map<string, LatLon[]>();

/**
 * Find the shortest sea route between two country ports.
 * Returns interpolated [lat, lon] points, or null if no route exists.
 */
export function findSeaRoute(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  cacheKey?: string,
): LatLon[] | null {
  if (cacheKey && routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  // Temporarily add source and dest to graph
  const srcId = "__src__";
  const dstId = "__dst__";

  const tempGraph: Graph = new Map();
  for (const [k, v] of GRAPH) {
    tempGraph.set(k, new Map(v));
  }
  tempGraph.set(srcId, new Map());
  tempGraph.set(dstId, new Map());

  // Connect source to nearest waypoints
  for (const wp of nearestWaypoints(fromLat, fromLon, 3)) {
    const d = wp.dist;
    tempGraph.get(srcId)!.set(wp.name, d);
    const wpNeighbors = tempGraph.get(wp.name);
    if (wpNeighbors) wpNeighbors.set(srcId, d);
  }

  // Connect dest to nearest waypoints
  for (const wp of nearestWaypoints(toLat, toLon, 3)) {
    const d = wp.dist;
    tempGraph.get(dstId)!.set(wp.name, d);
    const wpNeighbors = tempGraph.get(wp.name);
    if (wpNeighbors) wpNeighbors.set(dstId, d);
  }

  const path = dijkstra(tempGraph, srcId, dstId);
  if (!path) return null;

  // Convert path to LatLon coordinates
  const rawPoints: LatLon[] = path.map((id) => {
    if (id === srcId) return [fromLat, fromLon] as LatLon;
    if (id === dstId) return [toLat, toLon] as LatLon;
    return WAYPOINTS[id];
  });

  // Interpolate for smooth curve
  const result = interpolateRoute(rawPoints, 10);

  if (cacheKey) routeCache.set(cacheKey, result);
  return result;
}

// ─── Catmull-Rom interpolation ──────────────────────────────────────
export function interpolateRoute(
  pts: LatLon[],
  segmentsPerLeg: number = 10,
): LatLon[] {
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