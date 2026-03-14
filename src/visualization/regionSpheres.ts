// ─── Country Sphere Visualization ───────────────────────────────────
// Creates sized/colored spheres for each oil-trading country on the Cesium globe.

import * as Cesium from "cesium";
import { COUNTRIES } from "../data/countries";
import { totalExports, totalImports } from "../data/tradeFlows";
import { type Region, REGIONS } from "../data/regions";

/** Minimum sphere radius in metres */
const BASE_RADIUS = 35_000;
/** Scaling factor for log(volume) */
const LOG_SCALE = 18_000;

export function createCountrySpheres(
  viewer: Cesium.Viewer,
): Cesium.Entity[] {
  const entities: Cesium.Entity[] = [];

  // Precompute region color map
  const regionMap = new Map<string, Region>();
  for (const r of REGIONS) regionMap.set(r.id, r);

  for (const country of COUNTRIES) {
    const exp = totalExports(country.code);
    const imp = totalImports(country.code);
    const total = exp + imp;
    if (total === 0) continue;

    // Radius: base + log-scaled volume
    const radius = BASE_RADIUS + Math.log1p(total / 1e9) * LOG_SCALE;

    // Color: net exporters → warm, net importers → cool
    const ratio = total > 0 ? (exp - imp) / total : 0;
    const region = regionMap.get(country.region);
    const [rr, gg, bb] = region?.color ?? [180, 180, 180];

    // Blend region color with export/import tint
    const tintR = ratio >= 0 ? Math.min(255, rr + 60 * ratio) : Math.max(0, rr - 40);
    const tintG = ratio >= 0 ? Math.max(0, gg - 30 * ratio) : Math.min(255, gg + 30);
    const tintB = ratio >= 0 ? Math.max(0, bb - 50 * ratio) : Math.min(255, bb + 60);
    const color = new Cesium.Color(tintR / 255, tintG / 255, tintB / 255, 0.65);

    // Format volume for label
    const expB = (exp / 1e9).toFixed(0);
    const impB = (imp / 1e9).toFixed(0);

    const entity = viewer.entities.add({
      name: country.name,
      position: Cesium.Cartesian3.fromDegrees(country.lon, country.lat, radius),
      ellipsoid: {
        radii: new Cesium.Cartesian3(radius, radius, radius),
        material: color,
      },
      label: {
        text: country.code,
        font: "bold 12px sans-serif",
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(5e5, 1.0, 1.5e7, 0.3),
      },
      description: `<b>${country.name}</b> (${country.portName})<br/>` +
        `Exports: $${expB}B / Imports: $${impB}B`,
    });

    entities.push(entity);
  }

  return entities;
}