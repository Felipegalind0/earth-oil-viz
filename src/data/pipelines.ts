export type PipelinePoint = [number, number];

export interface PipelineSourceGroup {
  id: string;
  title: string;
  url?: string;
  usage: string;
}

export interface PipelineRouteDefinition {
  id: string;
  from: string;
  to: string;
  label: string;
  bidirectional?: boolean;
  points: PipelinePoint[];
  notes?: string;
}

export const PIPELINE_SOURCE_GROUPS: PipelineSourceGroup[] = [
  {
    id: "gem_goit",
    title: "Global Energy Monitor: Global Oil Infrastructure Tracker",
    url: "https://globalenergymonitor.org/projects/global-oil-infrastructure-tracker/",
    usage: "Reference for crude pipeline project existence, broad routing, and terminal linkage.",
  },
  {
    id: "manual_generalization",
    title: "Manual route generalization",
    usage: "Visualization routes are schematic corridor lines, not survey-grade GIS polylines.",
  },
];

export const PIPELINE_ROUTES: PipelineRouteDefinition[] = [
  {
    id: "can_usa_mainline",
    from: "CAN",
    to: "USA",
    label: "Canada-US crude trunk system",
    bidirectional: true,
    points: [
      [45.26, -66.06],
      [45.5, -73.57],
      [43.65, -79.38],
      [43.04, -87.91],
      [35.47, -97.52],
      [29.76, -95.37],
      [28.88, -90.03],
    ],
    notes: "Generalized path representing the major Canadian-to-U.S. trunk systems ending near the Gulf Coast crude hub.",
  },
  {
    id: "nld_bel_refining",
    from: "NLD",
    to: "BEL",
    label: "Rotterdam-Antwerp corridor",
    bidirectional: true,
    points: [
      [51.9, 4.5],
      [51.65, 4.55],
      [51.3, 4.28],
    ],
    notes: "Short refinery and storage corridor inside the ARA crude complex.",
  },
  {
    id: "nld_deu_refining",
    from: "NLD",
    to: "DEU",
    label: "Rotterdam-North Germany corridor",
    bidirectional: true,
    points: [
      [51.9, 4.5],
      [52.1, 6.4],
      [53.51, 8.12],
    ],
    notes: "Generalized inland crude corridor between Rotterdam and northern German refinery access.",
  },
  {
    id: "rus_chn_espo",
    from: "RUS",
    to: "CHN",
    label: "ESPO / Skovorodino-Daqing corridor",
    points: [
      [60.36, 28.61],
      [58.0, 49.0],
      [56.0, 88.0],
      [53.0, 123.0],
      [49.1, 124.0],
      [39.03, 121.62],
      [36.07, 120.38],
    ],
    notes: "Schematic eastward trunk route used to keep the largest Russia-China flow off an implausible Baltic-to-Asia sea path.",
  },
  {
    id: "kaz_chn_pipeline",
    from: "KAZ",
    to: "CHN",
    label: "Kazakhstan-China crude pipeline corridor",
    points: [
      [47.1, 51.91],
      [46.5, 66.0],
      [45.2, 78.5],
      [44.2, 84.0],
      [43.8, 87.6],
      [36.07, 120.38],
    ],
    notes: "Generalized route following the major Kazakhstan-China crude corridor toward eastern Chinese receipt infrastructure.",
  },
];
