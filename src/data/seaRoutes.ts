// ─── Trade Route Graphs & Pathfinding ───────────────────────────────
// Defines a logistics-aware maritime corridor graph plus a small set of
// explicit pipeline overrides for obviously overland crude flows.

import { COUNTRY_ROUTE_ENTRY_WAYPOINTS } from "./ports";
import { PIPELINE_ROUTES } from "./pipelines";
import type { PipelineRouteDefinition } from "./pipelines";

/** [latitude, longitude] */
export type LatLon = [number, number];

export type RouteMode = "maritime" | "pipeline";

export type RouteScenarioId =
  | "baseline"
  | "suez_closed"
  | "panama_constrained"
  | "hormuz_high_risk";

export interface RouteScenario {
  id: RouteScenarioId;
  label: string;
  description: string;
}

export const ROUTE_SCENARIOS: RouteScenario[] = [
  {
    id: "baseline",
    label: "Baseline",
    description: "Normal corridor costs with all major chokepoints open.",
  },
  {
    id: "suez_closed",
    label: "Suez Closed",
    description: "Blocks Suez Canal transit and forces Europe-Asia traffic toward the Cape route.",
  },
  {
    id: "panama_constrained",
    label: "Panama Constrained",
    description: "Adds heavy Panama delay so Atlantic-Pacific trades prefer longer alternatives when viable.",
  },
  {
    id: "hormuz_high_risk",
    label: "Hormuz High Risk",
    description: "Adds major risk delay to Hormuz transits for Gulf export routes.",
  },
];

export interface TradeRoute {
  mode: RouteMode;
  points: LatLon[];
  totalCostHours: number;
  totalDistanceKm: number;
  corridorPath: string[];
}

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

type CorridorProfile = "open_ocean" | "coastal" | "strait" | "canal";
type ScenarioTag = "suez" | "panama" | "hormuz";

interface MaritimeEdge {
  from: string;
  to: string;
  profile: CorridorProfile;
  bidirectional?: boolean;
  delayHours?: number;
  riskHours?: number;
  tags?: ScenarioTag[];
  geometry?: LatLon[];
}

// Each maritime edge encodes transit profile rather than pure geometry so
// route choice can reflect chokepoint slowdowns and canal penalties.
const MARITIME_EDGES: MaritimeEdge[] = [
  // Persian Gulf
  {
    from: "persian_gulf",
    to: "hormuz",
    profile: "strait",
    bidirectional: true,
    riskHours: 6,
    tags: ["hormuz"],
    geometry: [[27, 50], [27.3, 52.1], [27.0, 54.4], [26.5, 56.5]],
  },
  {
    from: "hormuz",
    to: "gulf_of_oman",
    profile: "strait",
    bidirectional: true,
    riskHours: 3,
    tags: ["hormuz"],
    geometry: [[26.5, 56.5], [25.9, 57.2], [25.0, 58.2], [24, 59]],
  },
  { from: "gulf_of_oman", to: "arabian_sea_n", profile: "coastal", bidirectional: true },
  { from: "arabian_sea_n", to: "arabian_sea", profile: "open_ocean", bidirectional: true },

  // Indian Ocean routes
  {
    from: "arabian_sea",
    to: "bab_el_mandeb",
    profile: "strait",
    bidirectional: true,
    riskHours: 4,
    geometry: [[15, 60], [14.8, 55.2], [14.1, 50.2], [13.0, 46.3], [12.5, 43.3]],
  },
  { from: "arabian_sea", to: "south_sri_lanka", profile: "open_ocean", bidirectional: true },
  { from: "arabian_sea", to: "east_africa", profile: "open_ocean", bidirectional: true },

  // Red Sea → Suez → Mediterranean
  {
    from: "bab_el_mandeb",
    to: "red_sea_mid",
    profile: "strait",
    bidirectional: true,
    riskHours: 2,
    geometry: [[12.5, 43.3], [13.8, 42.9], [15.8, 41.6], [17.2, 40.1], [18, 39]],
  },
  {
    from: "red_sea_mid",
    to: "red_sea_north",
    profile: "coastal",
    bidirectional: true,
    geometry: [[18, 39], [19.8, 39.1], [21.2, 38.8], [22, 38]],
  },
  {
    from: "red_sea_north",
    to: "suez_south",
    profile: "coastal",
    bidirectional: true,
    geometry: [[22, 38], [24.2, 36.6], [26.9, 34.6], [29.0, 33.1], [30, 32.5]],
  },
  {
    from: "suez_south",
    to: "suez_north",
    profile: "canal",
    bidirectional: true,
    delayHours: 18,
    tags: ["suez"],
    geometry: [[30, 32.5], [30.45, 32.55], [30.95, 32.42], [31.5, 32.3]],
  },
  { from: "suez_north", to: "east_med", profile: "coastal", bidirectional: true },
  { from: "east_med", to: "central_med", profile: "open_ocean", bidirectional: true },
  { from: "central_med", to: "west_med", profile: "open_ocean", bidirectional: true },
  {
    from: "west_med",
    to: "gibraltar",
    profile: "strait",
    bidirectional: true,
    delayHours: 4,
    geometry: [[36.5, 0], [36.5, -2.2], [36.2, -4.0], [36, -5.5]],
  },

  // Atlantic / Europe
  {
    from: "gibraltar",
    to: "bay_of_biscay",
    profile: "coastal",
    bidirectional: true,
    geometry: [[36, -5.5], [38.3, -8.6], [41.1, -9.7], [43.6, -7.9], [45, -5]],
  },
  {
    from: "bay_of_biscay",
    to: "english_channel",
    profile: "coastal",
    bidirectional: true,
    riskHours: 2,
    geometry: [[45, -5], [47, -4.5], [48.7, -3.2], [49.8, -1.8], [50, -1]],
  },
  {
    from: "english_channel",
    to: "north_sea_south",
    profile: "strait",
    bidirectional: true,
    delayHours: 6,
    geometry: [[50, -1], [50.8, 0.1], [51.8, 1.4], [53.0, 2.8], [54, 4]],
  },
  { from: "north_sea_south", to: "north_sea_north", profile: "coastal", bidirectional: true },
  {
    from: "north_sea_south",
    to: "danish_straits",
    profile: "strait",
    bidirectional: true,
    delayHours: 4,
    geometry: [[54, 4], [55.0, 6.6], [55.7, 9.2], [56, 11]],
  },
  {
    from: "danish_straits",
    to: "baltic_sea",
    profile: "strait",
    bidirectional: true,
    delayHours: 4,
    geometry: [[56, 11], [55.9, 12.2], [56.2, 14.9], [57, 18]],
  },

  // Black Sea
  {
    from: "bosphorus",
    to: "east_med",
    profile: "strait",
    bidirectional: true,
    delayHours: 10,
    geometry: [[41.2, 29.0], [40.4, 28.6], [38.2, 29.6], [36.3, 30.5], [34, 30]],
  },
  {
    from: "bosphorus",
    to: "black_sea",
    profile: "strait",
    bidirectional: true,
    delayHours: 10,
    geometry: [[41.2, 29.0], [41.7, 29.4], [42.1, 30.8], [43, 35]],
  },

  // Malacca → East Asia
  {
    from: "south_sri_lanka",
    to: "malacca_west",
    profile: "open_ocean",
    bidirectional: true,
    geometry: [[5, 80], [5.1, 85.0], [5.0, 90.0], [5, 95]],
  },
  {
    from: "malacca_west",
    to: "singapore_strait",
    profile: "strait",
    bidirectional: true,
    delayHours: 6,
    geometry: [[5, 95], [4.1, 98.1], [2.7, 101.2], [1.3, 104]],
  },
  {
    from: "singapore_strait",
    to: "south_china_sea",
    profile: "strait",
    bidirectional: true,
    delayHours: 4,
    geometry: [[1.3, 104], [3.2, 105.2], [6.0, 107.8], [10, 112]],
  },
  {
    from: "south_china_sea",
    to: "east_china_sea",
    profile: "open_ocean",
    bidirectional: true,
    geometry: [[10, 112], [14.2, 116.2], [20.5, 121.0], [25.7, 124.1], [30, 125]],
  },
  {
    from: "east_china_sea",
    to: "korea_strait",
    profile: "strait",
    bidirectional: true,
    delayHours: 4,
    geometry: [[30, 125], [31.8, 126.4], [33.0, 127.4], [34, 129]],
  },
  { from: "korea_strait", to: "japan_pacific", profile: "coastal", bidirectional: true },

  // Cape route (Africa)
  {
    from: "east_africa",
    to: "mozambique_ch",
    profile: "coastal",
    bidirectional: true,
    geometry: [[-5, 45], [-8, 44.3], [-11, 43.2], [-15, 42]],
  },
  {
    from: "mozambique_ch",
    to: "cape_of_good_hope",
    profile: "coastal",
    bidirectional: true,
    riskHours: 4,
    geometry: [[-15, 42], [-20.5, 39.7], [-27.0, 33.8], [-31.8, 26.5], [-34.5, 18.5]],
  },
  {
    from: "cape_of_good_hope",
    to: "south_atlantic",
    profile: "open_ocean",
    bidirectional: true,
    riskHours: 10,
    geometry: [[-34.5, 18.5], [-31.0, 12.0], [-27.0, 7.2], [-23.5, 3.0], [-20, 0]],
  },
  { from: "south_atlantic", to: "gulf_of_guinea", profile: "open_ocean", bidirectional: true },
  { from: "south_atlantic", to: "mid_atlantic_s", profile: "open_ocean", bidirectional: true },

  // West Africa coast
  {
    from: "gulf_of_guinea",
    to: "west_africa",
    profile: "coastal",
    bidirectional: true,
    geometry: [[3, 5], [4.1, 2.0], [4.8, -0.2], [5, -2]],
  },
  {
    from: "west_africa",
    to: "gibraltar",
    profile: "open_ocean",
    bidirectional: true,
    geometry: [[5, -2], [12.5, -10.0], [20.5, -14.0], [29.5, -10.5], [36, -5.5]],
  },

  // Atlantic crossings
  { from: "mid_atlantic_s", to: "brazil_ne", profile: "open_ocean", bidirectional: true },
  { from: "mid_atlantic_s", to: "mid_atlantic_n", profile: "open_ocean", bidirectional: true },
  {
    from: "mid_atlantic_s",
    to: "caribbean",
    profile: "open_ocean",
    bidirectional: true,
    geometry: [[0, -20], [7.0, -35.0], [13.0, -51.0], [18, -75]],
  },
  { from: "brazil_ne", to: "brazil_coast", profile: "coastal", bidirectional: true },
  { from: "brazil_coast", to: "argentina_coast", profile: "coastal", bidirectional: true },
  { from: "mid_atlantic_n", to: "english_channel", profile: "open_ocean", bidirectional: true },
  { from: "mid_atlantic_n", to: "bay_of_biscay", profile: "open_ocean", bidirectional: true },
  { from: "mid_atlantic_n", to: "us_east_coast", profile: "open_ocean", bidirectional: true },

  // Americas
  {
    from: "caribbean",
    to: "us_gulf_coast",
    profile: "coastal",
    bidirectional: true,
    geometry: [[18, -75], [20.0, -81.5], [23.5, -85.2], [27, -88]],
  },
  {
    from: "caribbean",
    to: "panama_caribbean",
    profile: "coastal",
    bidirectional: true,
    geometry: [[18, -75], [14.6, -78.2], [11.5, -79.3], [9.3, -79.9]],
  },
  { from: "caribbean", to: "venezuela_coast", profile: "coastal", bidirectional: true },
  {
    from: "panama_caribbean",
    to: "panama_pacific",
    profile: "canal",
    bidirectional: true,
    delayHours: 24,
    tags: ["panama"],
    geometry: [[9.3, -79.9], [9.25, -79.82], [9.05, -79.68], [8.9, -79.5]],
  },
  {
    from: "us_gulf_coast",
    to: "us_east_coast",
    profile: "coastal",
    bidirectional: true,
    geometry: [[27, -88], [29.0, -84.5], [32.0, -79.8], [37, -74]],
  },

  // Trans-Pacific (Panama → Asia)
  { from: "panama_pacific", to: "south_china_sea", profile: "open_ocean", bidirectional: true },

  // Russia Pacific
  {
    from: "russia_pacific",
    to: "korea_strait",
    profile: "coastal",
    bidirectional: true,
    geometry: [[43, 132], [40.0, 131.5], [37.0, 130.4], [34, 129]],
  },
  { from: "russia_pacific", to: "east_china_sea", profile: "coastal", bidirectional: true },
];

interface ScenarioRule {
  blockedTags?: ScenarioTag[];
  extraDelayHours?: Partial<Record<ScenarioTag, number>>;
  extraRiskHours?: Partial<Record<ScenarioTag, number>>;
}

const SCENARIO_RULES: Record<RouteScenarioId, ScenarioRule> = {
  baseline: {},
  suez_closed: {
    blockedTags: ["suez"],
  },
  panama_constrained: {
    extraDelayHours: {
      panama: 240,
    },
  },
  hormuz_high_risk: {
    extraRiskHours: {
      hormuz: 120,
    },
  },
};

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

const PROFILE_SPEED_KNOTS: Record<CorridorProfile, number> = {
  open_ocean: 14.5,
  coastal: 12,
  strait: 9,
  canal: 7,
};

interface GraphEdge {
  cost: number;
  distanceKm: number;
}

// ─── Build Adjacency Graph ──────────────────────────────────────────
type Graph = Map<string, Map<string, GraphEdge>>;

const edgeDefinitionMap = new Map<string, MaritimeEdge>(
  MARITIME_EDGES.map((edge) => [maritimeEdgeKey(edge.from, edge.to), edge]),
);
const graphCache = new Map<RouteScenarioId, Graph>();

function transitHours(distanceKm: number, profile: CorridorProfile): number {
  return distanceKm / (PROFILE_SPEED_KNOTS[profile] * 1.852);
}

function edgeCost(distanceKm: number, edge: MaritimeEdge): number {
  return transitHours(distanceKm, edge.profile) + (edge.delayHours ?? 0) + (edge.riskHours ?? 0);
}

function maritimeEdgeKey(from: string, to: string): string {
  return `${from}→${to}`;
}

function applyScenarioRule(edge: MaritimeEdge, scenarioId: RouteScenarioId): MaritimeEdge | null {
  const rule = SCENARIO_RULES[scenarioId];
  const tags = edge.tags ?? [];

  if (rule.blockedTags?.some((tag) => tags.includes(tag))) {
    return null;
  }

  let delayHours = edge.delayHours ?? 0;
  let riskHours = edge.riskHours ?? 0;

  for (const tag of tags) {
    delayHours += rule.extraDelayHours?.[tag] ?? 0;
    riskHours += rule.extraRiskHours?.[tag] ?? 0;
  }

  return {
    ...edge,
    delayHours,
    riskHours,
  };
}

function buildGraph(scenarioId: RouteScenarioId): Graph {
  const graph: Graph = new Map();
  const ensureNode = (n: string) => {
    if (!graph.has(n)) graph.set(n, new Map());
  };

  const addDirectedEdge = (from: string, to: string, edge: MaritimeEdge) => {
    ensureNode(from);
    ensureNode(to);
    const wa = WAYPOINTS[from];
    const wb = WAYPOINTS[to];
    const distanceKm = haversine(wa[0], wa[1], wb[0], wb[1]);
    graph.get(from)!.set(to, {
      cost: edgeCost(distanceKm, edge),
      distanceKm,
    });
  };

  for (const edge of MARITIME_EDGES) {
    const effectiveEdge = applyScenarioRule(edge, scenarioId);
    if (!effectiveEdge) continue;

    addDirectedEdge(effectiveEdge.from, effectiveEdge.to, effectiveEdge);
    if (effectiveEdge.bidirectional) {
      addDirectedEdge(effectiveEdge.to, effectiveEdge.from, effectiveEdge);
    }
  }

  return graph;
}

function getGraph(scenarioId: RouteScenarioId): Graph {
  const cached = graphCache.get(scenarioId);
  if (cached) return cached;
  const graph = buildGraph(scenarioId);
  graphCache.set(scenarioId, graph);
  return graph;
}

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

    for (const [neighbor, edge] of neighbors) {
      if (visited.has(neighbor)) continue;
      const newDist = d + edge.cost;
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

function routeEntryWaypoints(
  countryCode: string,
  lat: number,
  lon: number,
  n: number = 3,
): { name: string; dist: number }[] {
  const overrides = COUNTRY_ROUTE_ENTRY_WAYPOINTS[countryCode];
  if (!overrides || overrides.length === 0) {
    return nearestWaypoints(lat, lon, n);
  }

  return overrides.map((name) => ({
    name,
    dist: haversine(lat, lon, WAYPOINTS[name][0], WAYPOINTS[name][1]),
  }));
}

// Route cache: "FROM→TO" → interpolated LatLon[]
const routeCache = new Map<string, TradeRoute>();

function pipelineKey(fromCode: string, toCode: string): string {
  return `${fromCode}→${toCode}`;
}

function findPipelineRoute(fromCode: string, toCode: string): PipelineRouteDefinition | null {
  for (const route of PIPELINE_ROUTES) {
    const forward = route.from === fromCode && route.to === toCode;
    const reverse = route.bidirectional && route.from === toCode && route.to === fromCode;
    if (forward || reverse) return route;
  }
  return null;
}

function pipelinePoints(route: PipelineRouteDefinition, fromCode: string, toCode: string): LatLon[] {
  const forward = route.from === fromCode && route.to === toCode;
  return forward ? route.points : [...route.points].reverse();
}

function routeDistanceKm(points: LatLon[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversine(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
  }
  return total;
}

function pipelineTransitHours(distanceKm: number): number {
  const PIPELINE_SPEED_KMPH = 10;
  return distanceKm / PIPELINE_SPEED_KMPH;
}

function pathMetrics(graph: Graph, path: string[]): { totalCostHours: number; totalDistanceKm: number } {
  let totalCostHours = 0;
  let totalDistanceKm = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const edge = graph.get(path[i])?.get(path[i + 1]);
    if (!edge) continue;
    totalCostHours += edge.cost;
    totalDistanceKm += edge.distanceKm;
  }

  return { totalCostHours, totalDistanceKm };
}

function segmentGeometry(fromId: string, toId: string): LatLon[] {
  const forward = edgeDefinitionMap.get(maritimeEdgeKey(fromId, toId));
  if (forward?.geometry) {
    return forward.geometry;
  }
  if (forward) {
    return [WAYPOINTS[fromId], WAYPOINTS[toId]];
  }

  const reverse = edgeDefinitionMap.get(maritimeEdgeKey(toId, fromId));
  if (reverse?.geometry) {
    return [...reverse.geometry].reverse();
  }

  return [WAYPOINTS[fromId], WAYPOINTS[toId]];
}

function buildMaritimePathPoints(
  path: string[],
  fromPoint: LatLon,
  toPoint: LatLon,
  srcId: string,
  dstId: string,
): LatLon[] {
  const points: LatLon[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const fromId = path[i];
    const toId = path[i + 1];

    let segment: LatLon[];
    if (fromId === srcId && toId === dstId) {
      segment = [fromPoint, toPoint];
    } else if (fromId === srcId) {
      segment = [fromPoint, WAYPOINTS[toId]];
    } else if (toId === dstId) {
      segment = [WAYPOINTS[fromId], toPoint];
    } else {
      segment = segmentGeometry(fromId, toId);
    }

    if (i > 0) {
      points.push(...segment.slice(1));
    } else {
      points.push(...segment);
    }
  }

  return points;
}

/**
 * Find the best trade route between two country ports.
 * Returns interpolated [lat, lon] points plus route metadata, or null.
 */
export function findTradeRoute(
  fromCode: string,
  fromLat: number,
  fromLon: number,
  toCode: string,
  toLat: number,
  toLon: number,
  scenarioId: RouteScenarioId = "baseline",
  cacheKey?: string,
): TradeRoute | null {
  if (cacheKey && routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  const pipelineRoute = findPipelineRoute(fromCode, toCode);
  if (pipelineRoute) {
    const corridorPath = [pipelineKey(fromCode, toCode)];
    const rawPoints = pipelinePoints(pipelineRoute, fromCode, toCode);
    const points = densifyRoute(rawPoints, 12);
    const totalDistanceKm = routeDistanceKm(rawPoints);
    const result: TradeRoute = {
      mode: "pipeline",
      points,
      totalCostHours: pipelineTransitHours(totalDistanceKm),
      totalDistanceKm,
      corridorPath,
    };

    if (cacheKey) routeCache.set(cacheKey, result);
    return result;
  }

  // Temporarily add source and dest to graph
  const srcId = "__src__";
  const dstId = "__dst__";
  const graph = getGraph(scenarioId);

  const tempGraph: Graph = new Map();
  for (const [k, v] of graph) {
    tempGraph.set(k, new Map(v));
  }
  tempGraph.set(srcId, new Map());
  tempGraph.set(dstId, new Map());

  // Connect source to nearest waypoints
  for (const wp of routeEntryWaypoints(fromCode, fromLat, fromLon, 3)) {
    const distanceKm = wp.dist;
    const cost = transitHours(distanceKm, "coastal");
    tempGraph.get(srcId)!.set(wp.name, { cost, distanceKm });
    const wpNeighbors = tempGraph.get(wp.name);
    if (wpNeighbors) wpNeighbors.set(srcId, { cost, distanceKm });
  }

  // Connect dest to nearest waypoints
  for (const wp of routeEntryWaypoints(toCode, toLat, toLon, 3)) {
    const distanceKm = wp.dist;
    const cost = transitHours(distanceKm, "coastal");
    tempGraph.get(dstId)!.set(wp.name, { cost, distanceKm });
    const wpNeighbors = tempGraph.get(wp.name);
    if (wpNeighbors) wpNeighbors.set(dstId, { cost, distanceKm });
  }

  const path = dijkstra(tempGraph, srcId, dstId);
  if (!path) return null;

  const rawPoints = buildMaritimePathPoints(
    path,
    [fromLat, fromLon],
    [toLat, toLon],
    srcId,
    dstId,
  );

  const metrics = pathMetrics(tempGraph, path);
  const result: TradeRoute = {
    mode: "maritime",
    points: densifyRoute(rawPoints, 12),
    totalCostHours: metrics.totalCostHours,
    totalDistanceKm: metrics.totalDistanceKm,
    corridorPath: path.filter((id) => id !== srcId && id !== dstId),
  };

  if (cacheKey) routeCache.set(cacheKey, result);
  return result;
}

// ─── Geodesic interpolation ─────────────────────────────────────────
export function densifyRoute(
  pts: LatLon[],
  segmentsPerLeg: number = 12,
): LatLon[] {
  if (pts.length < 2) return pts;
  const result: LatLon[] = [];

  for (let i = 0; i < pts.length - 1; i++) {
    result.push(...interpolateGeodesicLeg(pts[i], pts[i + 1], segmentsPerLeg, i > 0));
  }
  return result;
}

function interpolateGeodesicLeg(
  a: LatLon,
  b: LatLon,
  steps: number,
  omitFirstPoint: boolean,
): LatLon[] {
  const result: LatLon[] = [];
  const start = omitFirstPoint ? 1 : 0;
  const from = latLonToUnitVector(a);
  const to = latLonToUnitVector(b);
  const dot = clampDot(from[0] * to[0] + from[1] * to[1] + from[2] * to[2]);
  const omega = Math.acos(dot);

  if (omega < 1e-6) {
    for (let i = start; i <= steps; i++) {
      const t = i / steps;
      result.push([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
      ]);
    }
    return result;
  }

  const sinOmega = Math.sin(omega);

  for (let i = start; i <= steps; i++) {
    const t = i / steps;
    const scaleA = Math.sin((1 - t) * omega) / sinOmega;
    const scaleB = Math.sin(t * omega) / sinOmega;
    const x = from[0] * scaleA + to[0] * scaleB;
    const y = from[1] * scaleA + to[1] * scaleB;
    const z = from[2] * scaleA + to[2] * scaleB;
    result.push(unitVectorToLatLon(normalizeVector([x, y, z])));
  }

  return result;
}

function latLonToUnitVector([lat, lon]: LatLon): [number, number, number] {
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const cosLat = Math.cos(latRad);
  return [
    cosLat * Math.cos(lonRad),
    cosLat * Math.sin(lonRad),
    Math.sin(latRad),
  ];
}

function normalizeVector([x, y, z]: [number, number, number]): [number, number, number] {
  const len = Math.hypot(x, y, z);
  if (len === 0) return [1, 0, 0];
  return [x / len, y / len, z / len];
}

function unitVectorToLatLon([x, y, z]: [number, number, number]): LatLon {
  const lat = Math.atan2(z, Math.hypot(x, y)) * (180 / Math.PI);
  const lon = Math.atan2(y, x) * (180 / Math.PI);
  return [lat, lon];
}

function clampDot(value: number): number {
  return Math.min(1, Math.max(-1, value));
}