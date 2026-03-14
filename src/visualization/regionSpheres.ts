// ─── Region Sphere Visualization ────────────────────────────────────
// Creates sized/colored spheres for each oil trade region on the Cesium globe.

import * as Cesium from "cesium";
import { getRegion } from "../data/regions";
import type { TradeData } from "../data/comtradeApi";

/** Minimum sphere radius in metres */
const BASE_RADIUS = 60_000;
/** Scaling factor for log(volume) */
const LOG_SCALE = 30_000;
/** Height above surface for sphere center */
const ELEVATION = 0;

export function createRegionSpheres(
  viewer: Cesium.Viewer,
  tradeData: TradeData,
): Cesium.Entity[] {
  const entities: Cesium.Entity[] = [];

  for (const vol of tradeData.volumes) {
    const region = getRegion(vol.regionId);
    const totalVolume = vol.totalExport + vol.totalImport;
    if (totalVolume === 0) continue;

    // Radius: base + log-scaled volume
    const radius = BASE_RADIUS + Math.log1p(totalVolume / 1e9) * LOG_SCALE;

    // Color: net exporters → warm (orange/red), net importers → cool (blue/cyan)
    const ratio = totalVolume > 0 ? vol.netExport / totalVolume : 0;
    // ratio: -1 (pure importer) to +1 (pure exporter)
    const color = ratio >= 0
      ? Cesium.Color.fromCssColorString(
          `rgba(${Math.round(200 + 55 * ratio)}, ${Math.round(120 - 80 * ratio)}, ${Math.round(50 - 50 * ratio)}, 0.7)`,
        )
      : Cesium.Color.fromCssColorString(
          `rgba(${Math.round(50 + 50 * (1 + ratio))}, ${Math.round(120 + 80 * (1 + ratio))}, ${Math.round(200 + 55 * (1 + ratio))}, 0.7)`,
        );

    // Format volume for label
    const exportB = (vol.totalExport / 1e9).toFixed(0);
    const importB = (vol.totalImport / 1e9).toFixed(0);

    const entity = viewer.entities.add({
      name: region.name,
      position: Cesium.Cartesian3.fromDegrees(
        region.lon,
        region.lat,
        radius + ELEVATION,
      ),
      ellipsoid: {
        radii: new Cesium.Cartesian3(radius, radius, radius),
        material: color,
      },
      label: {
        text: `${region.name}\nExp $${exportB}B / Imp $${importB}B`,
        font: "13px sans-serif",
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        outlineWidth: 2,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -20),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        scaleByDistance: new Cesium.NearFarScalar(1e6, 1.0, 2e7, 0.4),
      },
    });

    entities.push(entity);
  }

  return entities;
}
