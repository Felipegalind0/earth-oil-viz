import * as Cesium from "cesium";

const MIN_RADIUS_METERS = 750;
const MAX_RADIUS_METERS = 240_000;
const RADIUS_SCALE = 0.035;
const LABEL_RADIUS_SCALE = 1.28;
const SURFACE_LIFT_SCALE = 0.08;
const MIN_SURFACE_LIFT_METERS = 150;
const MAX_SURFACE_LIFT_METERS = 16_000;

export interface OrbitCompassHandle {
  update(anchor: Cesium.Cartesian3 | null, zoomDistance: number): void;
  isEntity(entity: Cesium.Entity | undefined): boolean;
  destroy(): void;
}

export function createOrbitCompass(viewer: Cesium.Viewer): OrbitCompassHandle {
  const eastWestAxisEntity = viewer.entities.add({
    name: "orbit-compass-east-west-axis",
    polyline: {
      positions: [],
      width: 1,
      material: Cesium.Color.WHITE.withAlpha(0.25),
    },
    show: false,
  });

  const northSouthAxisEntity = viewer.entities.add({
    name: "orbit-compass-north-south-axis",
    polyline: {
      positions: [],
      width: 1,
      material: Cesium.Color.WHITE.withAlpha(0.25),
    },
    show: false,
  });

  const northNeedleEntity = viewer.entities.add({
    name: "orbit-compass-north-needle",
    polyline: {
      positions: [],
      width: 3,
      material: Cesium.Color.fromCssColorString("#ef4444"),
    },
    show: false,
  });

  const centerPointEntity = viewer.entities.add({
    name: "orbit-compass-center",
    position: Cesium.Cartesian3.ZERO,
    point: {
      pixelSize: 5,
      color: Cesium.Color.WHITE.withAlpha(0.9),
      outlineColor: Cesium.Color.BLACK.withAlpha(0.85),
      outlineWidth: 2,
    },
    show: false,
  });

  const labelStyle = {
    font: "bold 20px sans-serif",
    style: Cesium.LabelStyle.FILL_AND_OUTLINE,
    outlineColor: Cesium.Color.BLACK,
    outlineWidth: 3,
    horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
    verticalOrigin: Cesium.VerticalOrigin.CENTER,
    scaleByDistance: new Cesium.NearFarScalar(1e4, 1.0, 2e7, 0.45),
  } satisfies Cesium.LabelGraphics.ConstructorOptions;

  const northLabelEntity = viewer.entities.add({
    name: "orbit-compass-label-north",
    position: Cesium.Cartesian3.ZERO,
    label: {
      ...labelStyle,
      text: "N",
      fillColor: Cesium.Color.fromCssColorString("#ef4444"),
    },
    show: false,
  });

  const eastLabelEntity = viewer.entities.add({
    name: "orbit-compass-label-east",
    position: Cesium.Cartesian3.ZERO,
    label: {
      ...labelStyle,
      text: "E",
      fillColor: Cesium.Color.WHITE.withAlpha(0.75),
    },
    show: false,
  });

  const southLabelEntity = viewer.entities.add({
    name: "orbit-compass-label-south",
    position: Cesium.Cartesian3.ZERO,
    label: {
      ...labelStyle,
      text: "S",
      fillColor: Cesium.Color.WHITE.withAlpha(0.6),
    },
    show: false,
  });

  const westLabelEntity = viewer.entities.add({
    name: "orbit-compass-label-west",
    position: Cesium.Cartesian3.ZERO,
    label: {
      ...labelStyle,
      text: "W",
      fillColor: Cesium.Color.WHITE.withAlpha(0.75),
    },
    show: false,
  });

  const entities = [
    eastWestAxisEntity,
    northSouthAxisEntity,
    northNeedleEntity,
    centerPointEntity,
    northLabelEntity,
    eastLabelEntity,
    southLabelEntity,
    westLabelEntity,
  ];
  const entitySet = new Set(entities);

  const scratchFrame = new Cesium.Matrix4();
  const scratchEast = new Cesium.Cartesian3();
  const scratchNorth = new Cesium.Cartesian3();
  const scratchUp = new Cesium.Cartesian3();
  const scratchCenter = new Cesium.Cartesian3();
  const scratchScaled = new Cesium.Cartesian3();
  const scratchOffset = new Cesium.Cartesian3();
  let lastAnchor: Cesium.Cartesian3 | null = null;
  let lastRadiusMeters = -1;

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function hide(): void {
    for (const entity of entities) {
      entity.show = false;
    }
  }

  function show(): void {
    for (const entity of entities) {
      entity.show = true;
    }
  }

  function setPolylinePositions(entity: Cesium.Entity, positions: Cesium.Cartesian3[]): void {
    if (!entity.polyline) return;
    entity.polyline.positions = new Cesium.ConstantProperty(positions);
  }

  function setEntityPosition(entity: Cesium.Entity, position: Cesium.Cartesian3): void {
    entity.position = new Cesium.ConstantPositionProperty(position);
  }

  function offsetPoint(
    base: Cesium.Cartesian3,
    east: Cesium.Cartesian3,
    north: Cesium.Cartesian3,
    up: Cesium.Cartesian3,
    eastMeters: number,
    northMeters: number,
    upMeters = 0,
  ): Cesium.Cartesian3 {
    const point = Cesium.Cartesian3.clone(base);

    if (eastMeters !== 0) {
      Cesium.Cartesian3.multiplyByScalar(east, eastMeters, scratchScaled);
      Cesium.Cartesian3.add(point, scratchScaled, point);
    }
    if (northMeters !== 0) {
      Cesium.Cartesian3.multiplyByScalar(north, northMeters, scratchOffset);
      Cesium.Cartesian3.add(point, scratchOffset, point);
    }
    if (upMeters !== 0) {
      Cesium.Cartesian3.multiplyByScalar(up, upMeters, scratchOffset);
      Cesium.Cartesian3.add(point, scratchOffset, point);
    }

    return point;
  }

  function rebuildGeometry(anchor: Cesium.Cartesian3, radiusMeters: number): void {
    const frame = Cesium.Transforms.eastNorthUpToFixedFrame(anchor, undefined, scratchFrame);
    Cesium.Matrix4.multiplyByPointAsVector(frame, Cesium.Cartesian3.UNIT_X, scratchEast);
    Cesium.Matrix4.multiplyByPointAsVector(frame, Cesium.Cartesian3.UNIT_Y, scratchNorth);
    Cesium.Matrix4.multiplyByPointAsVector(frame, Cesium.Cartesian3.UNIT_Z, scratchUp);
    Cesium.Cartesian3.normalize(scratchEast, scratchEast);
    Cesium.Cartesian3.normalize(scratchNorth, scratchNorth);
    Cesium.Cartesian3.normalize(scratchUp, scratchUp);

    const surfaceLift = clamp(
      radiusMeters * SURFACE_LIFT_SCALE,
      MIN_SURFACE_LIFT_METERS,
      MAX_SURFACE_LIFT_METERS,
    );
    const labelRadius = radiusMeters * LABEL_RADIUS_SCALE;
    const labelLift = surfaceLift * 0.4;
    const center = offsetPoint(anchor, scratchEast, scratchNorth, scratchUp, 0, 0, surfaceLift);
    Cesium.Cartesian3.clone(center, scratchCenter);

    setPolylinePositions(eastWestAxisEntity, [
      offsetPoint(scratchCenter, scratchEast, scratchNorth, scratchUp, -radiusMeters, 0),
      offsetPoint(scratchCenter, scratchEast, scratchNorth, scratchUp, radiusMeters, 0),
    ]);
    setPolylinePositions(northSouthAxisEntity, [
      offsetPoint(scratchCenter, scratchEast, scratchNorth, scratchUp, 0, -radiusMeters),
      offsetPoint(scratchCenter, scratchEast, scratchNorth, scratchUp, 0, radiusMeters),
    ]);
    setPolylinePositions(northNeedleEntity, [
      offsetPoint(scratchCenter, scratchEast, scratchNorth, scratchUp, 0, radiusMeters * 0.15),
      offsetPoint(scratchCenter, scratchEast, scratchNorth, scratchUp, 0, radiusMeters * 0.95),
    ]);

    setEntityPosition(centerPointEntity, scratchCenter);
    setEntityPosition(
      northLabelEntity,
      offsetPoint(scratchCenter, scratchEast, scratchNorth, scratchUp, 0, labelRadius, labelLift),
    );
    setEntityPosition(
      eastLabelEntity,
      offsetPoint(scratchCenter, scratchEast, scratchNorth, scratchUp, labelRadius, 0, labelLift),
    );
    setEntityPosition(
      southLabelEntity,
      offsetPoint(scratchCenter, scratchEast, scratchNorth, scratchUp, 0, -labelRadius, labelLift),
    );
    setEntityPosition(
      westLabelEntity,
      offsetPoint(scratchCenter, scratchEast, scratchNorth, scratchUp, -labelRadius, 0, labelLift),
    );
  }

  return {
    update(anchor: Cesium.Cartesian3 | null, zoomDistance: number): void {
      if (!anchor) {
        lastAnchor = null;
        lastRadiusMeters = -1;
        hide();
        return;
      }

      const radiusMeters = clamp(zoomDistance * RADIUS_SCALE, MIN_RADIUS_METERS, MAX_RADIUS_METERS);
      const anchorChanged = !lastAnchor || !Cesium.Cartesian3.equalsEpsilon(anchor, lastAnchor, 0.0, 1.0);
      const radiusChanged = Math.abs(radiusMeters - lastRadiusMeters) > 500;

      if (anchorChanged || radiusChanged) {
        rebuildGeometry(anchor, radiusMeters);
        if (lastAnchor) {
          Cesium.Cartesian3.clone(anchor, lastAnchor);
        } else {
          lastAnchor = Cesium.Cartesian3.clone(anchor);
        }
        lastRadiusMeters = radiusMeters;
      }

      show();
    },

    isEntity(entity: Cesium.Entity | undefined): boolean {
      return entity !== undefined && entitySet.has(entity);
    },

    destroy(): void {
      for (const entity of entities) {
        viewer.entities.remove(entity);
      }
    },
  };
}