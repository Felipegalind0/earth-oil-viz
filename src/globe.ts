// ─── FOSS-Earth: Generic Cesium Globe ───────────────────────────────
// Reusable 3D globe with camera controls, gesture handling, HUD, and
// compass.  Domain-specific layers (oil, logistics, etc.) plug in via
// the GlobeLayer interface — the globe itself knows nothing about them.

import "./style.css";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

import { createOrbitCompass } from "./visualization/orbitCompass";
import type { OrbitCompassHandle } from "./visualization/orbitCompass";
import {
  computeTwoPointGestureMetrics,
} from "./mathUtils";

// ─── Public Types ───────────────────────────────────────────────────

export interface GlobeOptions {
  /** CSS id of the container element (default: "cesiumContainer") */
  container?: string;
  /** Google 3-D Tiles API key.  If omitted, falls back to OSM. */
  apiKey?: string | null;
  /** Initial camera position [lon°, lat°, height m] */
  initialView?: { lon: number; lat: number; height: number };
  /** Show gesture debug logging in console */
  debugGestures?: boolean;
}

/**
 * A pluggable visualization layer that the globe manages.
 * Implement this to add domain-specific visualizations on top of the
 * generic globe.
 */
export interface GlobeLayer {
  /** Unique id for this layer */
  id: string;
  /**
   * Called once when the layer is added.
   * Return the entities created so the globe can track them for culling
   * and selection.
   */
  setup(viewer: Cesium.Viewer): GlobeLayerState;
  /** Tear down all entities and listeners. */
  destroy(viewer: Cesium.Viewer): void;
}

export interface GlobeLayerState {
  /**
   * Entities that behave as "points of interest" — clicking one enters
   * POI-tracking mode (camera follows entity, info-box opens, etc.).
   */
  poiEntities?: Cesium.Entity[];
  /**
   * Optional override for the compass anchor when a POI from this
   * layer is being tracked.
   */
  getPoiOrbitTarget?: () => Cesium.Cartesian3 | null;
}

export interface GlobeHandle {
  /** The underlying Cesium Viewer. */
  viewer: Cesium.Viewer;
  /** The orbit compass handle. */
  compass: OrbitCompassHandle;
  /** Register a visualization layer. */
  addLayer(layer: GlobeLayer): void;
  /** Remove a previously registered layer. */
  removeLayer(layerId: string): void;
  /** Destroy the globe and all layers. */
  destroy(): void;
}

// ─── Implementation ─────────────────────────────────────────────────

export async function createGlobe(opts: GlobeOptions = {}): Promise<GlobeHandle> {
  const container = opts.container ?? "cesiumContainer";
  const apiKey = opts.apiKey ?? null;
  const debugGestures = opts.debugGestures ?? false;

  // ── Viewer Init ────────────────────────────────────────────────────
  const viewer = new Cesium.Viewer(container, {
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
  });

  const orbitCompass = createOrbitCompass(viewer);
  const MAX_CAMERA_PITCH_RAD = Cesium.Math.toRadians(-1);
  const userAgent = navigator.userAgent;
  const isAppleMobileBrowser = /iPhone|iPad|iPod/i.test(userAgent);
  const supportsSafariGestureEvents =
    "GestureEvent" in window
    && /Safari/i.test(userAgent)
    && !isAppleMobileBrowser
    && !/Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPR|Android/i.test(userAgent);

  function logGesture(message: string, payload?: unknown): void {
    if (!debugGestures) return;
    if (payload === undefined) {
      console.log(`[gestures] ${message}`);
      return;
    }
    console.log(`[gestures] ${message}`, payload);
  }

  // ── Cross-browser trackpad fixes ───────────────────────────────────
  document.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
  for (const evt of ["gesturestart", "gesturechange", "gestureend"] as const) {
    document.addEventListener(evt, (e) => e.preventDefault(), { passive: false } as AddEventListenerOptions);
  }

  // Smooth inertia & movement limits
  const ctrl = viewer.scene.screenSpaceCameraController;
  ctrl.inertiaSpin = 0.9;
  ctrl.inertiaTranslate = 0.9;
  ctrl.inertiaZoom = 0.9;
  ctrl.maximumMovementRatio = 0.2;
  ctrl.maximumTiltAngle = Cesium.Math.PI_OVER_TWO + MAX_CAMERA_PITCH_RAD;

  // Remove default imagery
  viewer.imageryLayers.removeAll();

  // ── Base map ───────────────────────────────────────────────────────
  if (apiKey) {
    try {
      const tileset = await Cesium.createGooglePhotorealistic3DTileset({ key: apiKey });
      viewer.scene.primitives.add(tileset);
    } catch (error) {
      console.error("Failed to load Google 3D Tiles:", error);
    }
  } else {
    viewer.imageryLayers.addImageryProvider(
      new Cesium.OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/",
      }),
    );
    const modal = document.getElementById("fallbackModal");
    if (modal) {
      modal.style.display = "flex";
      document.getElementById("dismissModal")?.addEventListener("click", () => {
        modal.style.display = "none";
      });
    }
  }

  // ── Layer registry ─────────────────────────────────────────────────
  const layers = new Map<string, { layer: GlobeLayer; state: GlobeLayerState }>();
  const poiEntitySet = new Set<Cesium.Entity>();
  let poiOrbitTargetFn: (() => Cesium.Cartesian3 | null) | null = null;

  function rebuildPoiSet(): void {
    poiEntitySet.clear();
    poiOrbitTargetFn = null;
    for (const { state } of layers.values()) {
      if (state.poiEntities) {
        for (const e of state.poiEntities) poiEntitySet.add(e);
      }
      if (state.getPoiOrbitTarget) {
        poiOrbitTargetFn = state.getPoiOrbitTarget;
      }
    }
  }

  function addLayer(layer: GlobeLayer): void {
    if (layers.has(layer.id)) removeLayer(layer.id);
    const state = layer.setup(viewer);
    layers.set(layer.id, { layer, state });
    rebuildPoiSet();
  }

  function removeLayer(layerId: string): void {
    const entry = layers.get(layerId);
    if (!entry) return;
    entry.layer.destroy(viewer);
    layers.delete(layerId);
    rebuildPoiSet();
  }

  // ── POI / Entity Selection ─────────────────────────────────────────
  let hadPoiSelection = false;
  let suppressCompassSelectionClear = false;

  function isPoiEntity(entity: Cesium.Entity | undefined): boolean {
    return entity !== undefined && poiEntitySet.has(entity);
  }

  function exitPoiMode(clearSelection: boolean): void {
    viewer.trackedEntity = undefined;
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    if (clearSelection) viewer.selectedEntity = undefined;
    hadPoiSelection = false;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.clone(viewer.camera.positionWC),
      orientation: {
        heading: viewer.camera.heading,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0,
      },
      duration: 0.5,
    });
  }

  viewer.selectedEntityChanged.addEventListener((entity) => {
    if (suppressCompassSelectionClear && !entity) {
      suppressCompassSelectionClear = false;
      return;
    }
    if (orbitCompass.isEntity(entity)) {
      suppressCompassSelectionClear = true;
      viewer.selectedEntity = undefined;
      return;
    }
    if (isPoiEntity(entity)) {
      hadPoiSelection = true;
      return;
    }
    if (!entity && hadPoiSelection) {
      exitPoiMode(false);
      return;
    }
    if (entity && !isPoiEntity(entity) && hadPoiSelection) {
      exitPoiMode(false);
    }
  });

  viewer.infoBox?.viewModel.closeClicked.addEventListener(() => {
    if (hadPoiSelection || isPoiEntity(viewer.selectedEntity) || isPoiEntity(viewer.trackedEntity)) {
      exitPoiMode(true);
    }
  });

  // ── Camera controller setup ────────────────────────────────────────
  const controller = viewer.scene.screenSpaceCameraController;
  controller.enableTilt = true;
  controller.enableZoom = true;
  controller.enableRotate = true;
  controller.enableTranslate = false;
  controller.enableLook = false;

  controller.tiltEventTypes = [
    Cesium.CameraEventType.MIDDLE_DRAG,
    Cesium.CameraEventType.PINCH,
    { eventType: Cesium.CameraEventType.LEFT_DRAG, modifier: Cesium.KeyboardEventModifier.CTRL },
    { eventType: Cesium.CameraEventType.RIGHT_DRAG, modifier: undefined },
  ];
  controller.zoomEventTypes = [Cesium.CameraEventType.PINCH];

  // ── Wheel handler (trackpad-aware) ─────────────────────────────────
  let lastWheelTime = 0;
  let isTrackpad = false;

  const canvas = viewer.scene.canvas;
  const scratchScreenCenter = new Cesium.Cartesian2();
  const scratchWaypointPosition = new Cesium.Cartesian3();
  const scratchSurfaceAnchor = new Cesium.Cartesian3();
  let lastOrbitTarget: Cesium.Cartesian3 | null = null;

  function getOrbitTargetAtScreenCenter(): Cesium.Cartesian3 | null {
    scratchScreenCenter.x = canvas.clientWidth * 0.5;
    scratchScreenCenter.y = canvas.clientHeight * 0.5;
    const target = viewer.camera.pickEllipsoid(scratchScreenCenter, viewer.scene.globe.ellipsoid) ?? undefined;
    if (target) {
      if (lastOrbitTarget) {
        Cesium.Cartesian3.clone(target, lastOrbitTarget);
      } else {
        lastOrbitTarget = Cesium.Cartesian3.clone(target);
      }
    }
    return lastOrbitTarget;
  }

  function projectToGlobeSurface(position: Cesium.Cartesian3): Cesium.Cartesian3 {
    return viewer.scene.globe.ellipsoid.scaleToGeodeticSurface(position, scratchSurfaceAnchor)
      ?? Cesium.Cartesian3.clone(position, scratchSurfaceAnchor);
  }

  function getPoiOrbitTarget(): Cesium.Cartesian3 | null {
    // Layer-provided orbit target
    if (poiOrbitTargetFn) {
      const target = poiOrbitTargetFn();
      if (target) return target;
    }
    // Fallback: tracked entity position projected to surface
    const tracked = isPoiEntity(viewer.trackedEntity) ? viewer.trackedEntity : undefined;
    if (!tracked?.position) return null;
    const position = tracked.position.getValue(viewer.clock.currentTime, scratchWaypointPosition);
    return position ? projectToGlobeSurface(position) : null;
  }

  function resolveCompassAnchor(): Cesium.Cartesian3 | null {
    return getPoiOrbitTarget() ?? getOrbitTargetAtScreenCenter();
  }

  interface CameraControlState {
    latRad: number;
    lonRad: number;
    headingRad: number;
    pitchRad: number;
    zoomMeters: number;
  }

  /**
   * Anchor-locked camera state.
   * Zoom modifies only zoomMeters, preserving lat/lon/heading/pitch.
   */
  const MIN_CAMERA_ANCHOR_DISTANCE_M = 25;
  const MAX_CAMERA_ANCHOR_DISTANCE_M = 80_000_000;
  const MIN_STATE_PITCH_RAD = Cesium.Math.toRadians(1);
  const MAX_STATE_PITCH_RAD = Cesium.Math.toRadians(89);
  const HEADING_INFERENCE_VERTICAL_THRESHOLD_RAD = Cesium.Math.toRadians(87);
  const HEADING_INFERENCE_MIN_HORIZONTAL = 0.01;
  const scratchCameraStateAnchor = new Cesium.Cartesian3();
  const scratchAnchorCartographic = new Cesium.Cartographic();
  const scratchAnchorFrame = new Cesium.Matrix4();
  const scratchAnchorEast = new Cesium.Cartesian3();
  const scratchAnchorNorth = new Cesium.Cartesian3();
  const scratchAnchorUp = new Cesium.Cartesian3();
  const scratchDirectionToAnchor = new Cesium.Cartesian3();
  const scratchHorizontalDirection = new Cesium.Cartesian3();
  const scratchHorizontalProjection = new Cesium.Cartesian3();
  const scratchHeadingDirection = new Cesium.Cartesian3();
  const scratchRailDirection = new Cesium.Cartesian3();
  const scratchCameraDestination = new Cesium.Cartesian3();
  const scratchCameraUp = new Cesium.Cartesian3();
  let cameraState: CameraControlState | null = null;

  function clampStatePitch(pitchRad: number): number {
    return Cesium.Math.clamp(pitchRad, MIN_STATE_PITCH_RAD, MAX_STATE_PITCH_RAD);
  }

  function getAnchorBasis(anchor: Cesium.Cartesian3): {
    east: Cesium.Cartesian3;
    north: Cesium.Cartesian3;
    up: Cesium.Cartesian3;
  } {
    const frame = Cesium.Transforms.eastNorthUpToFixedFrame(anchor, undefined, scratchAnchorFrame);
    Cesium.Matrix4.multiplyByPointAsVector(frame, Cesium.Cartesian3.UNIT_X, scratchAnchorEast);
    Cesium.Matrix4.multiplyByPointAsVector(frame, Cesium.Cartesian3.UNIT_Y, scratchAnchorNorth);
    Cesium.Matrix4.multiplyByPointAsVector(frame, Cesium.Cartesian3.UNIT_Z, scratchAnchorUp);
    Cesium.Cartesian3.normalize(scratchAnchorEast, scratchAnchorEast);
    Cesium.Cartesian3.normalize(scratchAnchorNorth, scratchAnchorNorth);
    Cesium.Cartesian3.normalize(scratchAnchorUp, scratchAnchorUp);
    return { east: scratchAnchorEast, north: scratchAnchorNorth, up: scratchAnchorUp };
  }

  function getCameraStateAnchorCartesian(): Cesium.Cartesian3 | null {
    if (!cameraState) return null;
    return Cesium.Cartesian3.fromRadians(
      cameraState.lonRad,
      cameraState.latRad,
      0,
      viewer.scene.globe.ellipsoid,
      scratchCameraStateAnchor,
    );
  }

  function syncCameraStateFromView(anchorOverride?: Cesium.Cartesian3 | null): void {
    const camera = viewer.camera;
    const anchor = anchorOverride ?? resolveCompassAnchor();
    if (!anchor) return;

    const anchorCartographic = Cesium.Cartographic.fromCartesian(
      anchor,
      viewer.scene.globe.ellipsoid,
      scratchAnchorCartographic,
    );
    if (!anchorCartographic) return;

    const { east, north, up } = getAnchorBasis(anchor);
    Cesium.Cartesian3.subtract(anchor, camera.positionWC, scratchDirectionToAnchor);
    const directionMagnitude = Cesium.Cartesian3.magnitude(scratchDirectionToAnchor);
    if (!Number.isFinite(directionMagnitude) || directionMagnitude <= 0.001) return;
    Cesium.Cartesian3.normalize(scratchDirectionToAnchor, scratchDirectionToAnchor);

    const verticalComponent = Cesium.Cartesian3.dot(scratchDirectionToAnchor, up);
    const pitchRad = clampStatePitch(Math.asin(Cesium.Math.clamp(-verticalComponent, -1, 1)));

    Cesium.Cartesian3.multiplyByScalar(up, verticalComponent, scratchHorizontalProjection);
    Cesium.Cartesian3.subtract(scratchDirectionToAnchor, scratchHorizontalProjection, scratchHorizontalDirection);
    const horizontalMagnitude = Cesium.Cartesian3.magnitude(scratchHorizontalDirection);
    const isNearVertical = Math.abs(pitchRad) >= HEADING_INFERENCE_VERTICAL_THRESHOLD_RAD;
    let headingRad = cameraState?.headingRad ?? 0;
    if (!isNearVertical && horizontalMagnitude > HEADING_INFERENCE_MIN_HORIZONTAL) {
      Cesium.Cartesian3.normalize(scratchHorizontalDirection, scratchHorizontalDirection);
      const eastComponent = Cesium.Cartesian3.dot(scratchHorizontalDirection, east);
      const northComponent = Cesium.Cartesian3.dot(scratchHorizontalDirection, north);
      headingRad = Math.atan2(eastComponent, northComponent);
    }

    cameraState = {
      latRad: anchorCartographic.latitude,
      lonRad: anchorCartographic.longitude,
      headingRad,
      pitchRad,
      zoomMeters: Cesium.Math.clamp(
        Cesium.Cartesian3.distance(camera.positionWC, anchor),
        MIN_CAMERA_ANCHOR_DISTANCE_M,
        MAX_CAMERA_ANCHOR_DISTANCE_M,
      ),
    };
  }

  function ensureCameraState(): CameraControlState | null {
    if (!cameraState) syncCameraStateFromView();
    return cameraState;
  }

  function applyCameraState(): void {
    const state = ensureCameraState();
    if (!state) return;
    const anchor = getCameraStateAnchorCartesian();
    if (!anchor) return;

    const { east, north, up } = getAnchorBasis(anchor);
    const cosHeading = Math.cos(state.headingRad);
    const sinHeading = Math.sin(state.headingRad);
    const cosPitch = Math.cos(state.pitchRad);
    const sinPitch = Math.sin(state.pitchRad);

    Cesium.Cartesian3.multiplyByScalar(north, cosHeading, scratchHeadingDirection);
    Cesium.Cartesian3.multiplyByScalar(east, sinHeading, scratchHorizontalProjection);
    Cesium.Cartesian3.add(scratchHeadingDirection, scratchHorizontalProjection, scratchHeadingDirection);
    Cesium.Cartesian3.normalize(scratchHeadingDirection, scratchHeadingDirection);

    Cesium.Cartesian3.multiplyByScalar(scratchHeadingDirection, cosPitch, scratchRailDirection);
    Cesium.Cartesian3.multiplyByScalar(up, -sinPitch, scratchHorizontalProjection);
    Cesium.Cartesian3.add(scratchRailDirection, scratchHorizontalProjection, scratchRailDirection);
    Cesium.Cartesian3.normalize(scratchRailDirection, scratchRailDirection);

    Cesium.Cartesian3.multiplyByScalar(scratchRailDirection, state.zoomMeters, scratchCameraDestination);
    Cesium.Cartesian3.subtract(anchor, scratchCameraDestination, scratchCameraDestination);

    Cesium.Cartesian3.subtract(anchor, scratchCameraDestination, scratchDirectionToAnchor);
    Cesium.Cartesian3.normalize(scratchDirectionToAnchor, scratchDirectionToAnchor);

    const upDotDirection = Cesium.Cartesian3.dot(up, scratchDirectionToAnchor);
    Cesium.Cartesian3.multiplyByScalar(scratchDirectionToAnchor, upDotDirection, scratchHorizontalProjection);
    Cesium.Cartesian3.subtract(up, scratchHorizontalProjection, scratchCameraUp);
    if (Cesium.Cartesian3.magnitudeSquared(scratchCameraUp) < 1e-6) {
      Cesium.Cartesian3.clone(north, scratchCameraUp);
    } else {
      Cesium.Cartesian3.normalize(scratchCameraUp, scratchCameraUp);
    }

    viewer.trackedEntity = undefined;
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    viewer.camera.setView({
      destination: Cesium.Cartesian3.clone(scratchCameraDestination),
      orientation: {
        direction: Cesium.Cartesian3.clone(scratchDirectionToAnchor),
        up: Cesium.Cartesian3.clone(scratchCameraUp),
      },
    });
  }

  function zoomPreservingOrientation(amount: number): void {
    const state = ensureCameraState();
    if (!state) {
      if (amount > 0) viewer.camera.zoomIn(amount);
      else viewer.camera.zoomOut(-amount);
      return;
    }

    state.zoomMeters = Cesium.Math.clamp(
      state.zoomMeters - amount,
      MIN_CAMERA_ANCHOR_DISTANCE_M,
      MAX_CAMERA_ANCHOR_DISTANCE_M,
    );
    applyCameraState();
  }

  function panCameraAcrossGrid(screenDxPx: number, screenDyPx: number): void {
    const state = ensureCameraState();
    if (!state) return;

    const frustum = viewer.camera.frustum as { fovy?: number };
    const fovy = typeof frustum.fovy === "number" ? frustum.fovy : Cesium.Math.toRadians(60);
    const metersPerPixel = (2 * state.zoomMeters * Math.tan(fovy * 0.5)) / Math.max(canvas.clientHeight, 1);

    const forwardMeters = -screenDyPx * metersPerPixel;
    const rightMeters = screenDxPx * metersPerPixel;
    const cosH = Math.cos(state.headingRad);
    const sinH = Math.sin(state.headingRad);
    const northMeters = forwardMeters * cosH - rightMeters * sinH;
    const eastMeters = forwardMeters * sinH + rightMeters * cosH;

    const earthRadiusMeters = viewer.scene.globe.ellipsoid.maximumRadius;
    const cosLat = Math.max(Math.cos(state.latRad), 0.01);
    const latDeltaRad = northMeters / earthRadiusMeters;
    const lonDeltaRad = eastMeters / (earthRadiusMeters * cosLat);

    state.latRad = Cesium.Math.clamp(state.latRad + latDeltaRad, Cesium.Math.toRadians(-89.999), Cesium.Math.toRadians(89.999));
    state.lonRad = Cesium.Math.negativePiToPi(state.lonRad + lonDeltaRad);
    applyCameraState();
  }

  function orbitCameraAroundTarget(pitchDeltaRad: number, headingDeltaRad = 0): void {
    const state = ensureCameraState();
    if (!state) return;

    const effectiveHeadingDeltaRad = Math.abs(headingDeltaRad) >= Cesium.Math.toRadians(0.02)
      ? headingDeltaRad
      : 0;
    const effectivePitchDeltaRad = Math.abs(pitchDeltaRad) >= Cesium.Math.toRadians(0.02)
      ? pitchDeltaRad
      : 0;
    if (effectiveHeadingDeltaRad === 0 && effectivePitchDeltaRad === 0) return;

    state.headingRad = Cesium.Math.negativePiToPi(state.headingRad + effectiveHeadingDeltaRad);
    state.pitchRad = clampStatePitch(state.pitchRad + effectivePitchDeltaRad);
    applyCameraState();
  }

  canvas.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      e.preventDefault();
      const now = performance.now();
      const dt = now - lastWheelTime;
      lastWheelTime = now;
      if (dt < 50 && Math.abs(e.deltaY) < 60) isTrackpad = true;
      else if (dt > 300) isTrackpad = false;

      if (e.ctrlKey) {
        if (!supportsSafariGestureEvents) {
          const zoomFraction = -e.deltaY * 0.01;
          const height = viewer.camera.positionCartographic.height;
          zoomPreservingOrientation(height * zoomFraction);
        }
      } else if (e.shiftKey) {
        const pitchDelta = -e.deltaY * 0.15;
        const headingDelta = e.deltaX * 0.15;
        const pitchDeltaRad = Cesium.Math.toRadians(pitchDelta);
        const headingDeltaRad = Cesium.Math.toRadians(headingDelta);
        orbitCameraAroundTarget(
          Math.abs(pitchDeltaRad) >= Cesium.Math.toRadians(0.02) ? pitchDeltaRad : 0,
          Math.abs(headingDeltaRad) >= Cesium.Math.toRadians(0.02) ? headingDeltaRad : 0,
        );
      } else if (isTrackpad) {
        panCameraAcrossGrid(e.deltaX, e.deltaY);
      } else {
        const zoomAmount = e.deltaY;
        zoomPreservingOrientation(viewer.camera.positionCartographic.height * 0.08 * (zoomAmount > 0 ? -1 : 1));
      }
    },
    { passive: false },
  );

  // ── Safari gesture events (macOS trackpad rotation + pinch zoom) ──
  if (supportsSafariGestureEvents) {
    let lastGestureRotation = 0;
    let lastGestureScale = 1;

    canvas.addEventListener("gesturestart", ((e: Event) => {
      e.preventDefault();
      const ge = e as unknown as { rotation: number; scale: number };
      lastGestureRotation = ge.rotation;
      lastGestureScale = ge.scale;
    }) as EventListener, { passive: false } as AddEventListenerOptions);

    canvas.addEventListener("gesturechange", ((e: Event) => {
      e.preventDefault();
      const ge = e as unknown as { rotation: number; scale: number };
      const rotDelta = ge.rotation - lastGestureRotation;
      lastGestureRotation = ge.rotation;
      if (Math.abs(rotDelta) > 0.1) orbitCameraAroundTarget(0, Cesium.Math.toRadians(-rotDelta));
      const scaleDelta = ge.scale / lastGestureScale;
      lastGestureScale = ge.scale;
      const height = viewer.camera.positionCartographic.height;
      if (scaleDelta > 1) zoomPreservingOrientation(height * (scaleDelta - 1) * 0.5);
      else if (scaleDelta < 1) zoomPreservingOrientation(height * -(1 - scaleDelta) * 0.5);
    }) as EventListener, { passive: false } as AddEventListenerOptions);

    canvas.addEventListener("gestureend", ((e: Event) => {
      e.preventDefault();
    }) as EventListener, { passive: false } as AddEventListenerOptions);
  }

  // ── Touchscreen fallback ───────────────────────────────────────────
  type ActiveTouchPoint = { x: number; y: number };

  interface TouchGestureSession {
    previousMetrics: ReturnType<typeof computeTwoPointGestureMetrics>;
    controlsSuspended: boolean;
  }

  const activePointers = new Map<number, ActiveTouchPoint>();
  let touchGestureSession: TouchGestureSession | null = null;

  function getSortedTouchPoints(): [ActiveTouchPoint, ActiveTouchPoint] | null {
    if (activePointers.size !== 2) return null;
    const sortedEntries = Array.from(activePointers.entries())
      .sort(([leftId], [rightId]) => leftId - rightId)
      .map(([, point]) => point);
    return [sortedEntries[0], sortedEntries[1]];
  }

  function getCurrentTouchMetrics() {
    const points = getSortedTouchPoints();
    if (!points) return null;
    return computeTwoPointGestureMetrics(points[0], points[1]);
  }

  function suspendTouchControllerInputs(): void {
    if (!touchGestureSession || touchGestureSession.controlsSuspended) return;
    controller.enableInputs = false;
    touchGestureSession.controlsSuspended = true;
    logGesture("touch controller inputs suspended");
  }

  function resumeTouchControllerInputs(): void {
    if (!touchGestureSession?.controlsSuspended) return;
    controller.enableInputs = true;
    touchGestureSession.controlsSuspended = false;
    logGesture("touch controller inputs resumed");
  }

  function clearTouchGestureSession(reason: string): void {
    resumeTouchControllerInputs();
    if (touchGestureSession) {
      logGesture(`touch gesture session cleared: ${reason}`, { activePointers: activePointers.size });
    }
    touchGestureSession = null;
  }

  canvas.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (activePointers.size === 2) {
      const metrics = getCurrentTouchMetrics();
      if (metrics) {
        touchGestureSession = { previousMetrics: metrics, controlsSuspended: false };
        suspendTouchControllerInputs();
        logGesture("touch gesture session started", metrics);
      }
    } else if (activePointers.size > 2) {
      clearTouchGestureSession("more than two touch points");
    }
  });

  canvas.addEventListener("pointermove", (e: PointerEvent) => {
    if (e.pointerType !== "touch" || !activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!touchGestureSession || activePointers.size !== 2) return;
    const metrics = getCurrentTouchMetrics();
    if (!metrics) return;
    e.preventDefault();
    const dx = metrics.centroidX - touchGestureSession.previousMetrics.centroidX;
    const dy = metrics.centroidY - touchGestureSession.previousMetrics.centroidY;
    const distanceDeltaPx = metrics.distancePx - touchGestureSession.previousMetrics.distancePx;
    const TOUCH_SWIPE_DEG_PER_PX = 0.15;
    const TOUCH_SWIPE_DEADZONE_PX = 0.75;
    const TOUCH_PINCH_DEADZONE_PX = 1.5;
    if (Math.abs(dx) >= TOUCH_SWIPE_DEADZONE_PX || Math.abs(dy) >= TOUCH_SWIPE_DEADZONE_PX) {
      orbitCameraAroundTarget(
        Cesium.Math.toRadians(dy * TOUCH_SWIPE_DEG_PER_PX),
        Cesium.Math.toRadians(dx * TOUCH_SWIPE_DEG_PER_PX),
      );
      logGesture("applied swipe orbit delta", { dx, dy });
    }
    if (Math.abs(distanceDeltaPx) >= TOUCH_PINCH_DEADZONE_PX) {
      const scaleDelta = metrics.distancePx / touchGestureSession.previousMetrics.distancePx;
      const height = viewer.camera.positionCartographic.height;
      if (scaleDelta > 1) zoomPreservingOrientation(height * (scaleDelta - 1) * 0.5);
      else if (scaleDelta < 1) zoomPreservingOrientation(height * -(1 - scaleDelta) * 0.5);
      logGesture("applied pinch zoom delta", { scaleDelta, distanceDeltaPx });
    }
    touchGestureSession.previousMetrics = metrics;
  }, { passive: false });

  function removePointer(e: PointerEvent) {
    if (e.pointerType !== "touch") return;
    activePointers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (activePointers.size < 2) clearTouchGestureSession("touch count dropped below two");
  }

  canvas.addEventListener("pointerup", removePointer);
  canvas.addEventListener("pointercancel", removePointer);

  // ── Camera Status Bar & North Button ────────────────────────────────
  // Inject HUD elements if not already present in the document
  if (!document.getElementById("bottomBar")) {
    const bar = document.createElement("div");
    bar.id = "bottomBar";
    bar.className = "bottom-bar";
    bar.innerHTML = `
      <span id="statusText" class="status-text"></span>
      <button id="northButton" class="hud-circle-button north-button" type="button" title="North up">
        <svg viewBox="0 0 36 36" width="36" height="36">
          <polygon class="north-triangle" points="18,4 14,12 22,12" fill="#ef4444"/>
          <text x="18" y="26" text-anchor="middle" fill="rgba(255,255,255,0.82)" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="14">N</text>
        </svg>
      </button>
      <button id="helpButton" class="hud-circle-button" type="button" title="Controls help">?</button>
      <button id="settingsButton" class="hud-circle-button" type="button" title="Settings">⚙️</button>
    `;
    document.body.appendChild(bar);
  }
  if (!document.getElementById("helpModal")) {
    const modal = document.createElement("div");
    modal.id = "helpModal";
    modal.className = "modal-overlay";
    modal.style.display = "none";
    modal.innerHTML = `
      <div class="modal-card help-modal-card">
        <h2>Controls</h2>
        <div class="help-axes">
          <div class="help-axis">
            <div class="help-axis-title">Pan</div>
            <div class="help-axis-triggers">
              <span class="help-trigger">Left drag</span>
              <span class="help-trigger">2-finger swipe</span>
              <span class="help-trigger">1-finger <small>(mobile)</small></span>
            </div>
            <div class="help-axis-note">Changes Lat / Lon</div>
          </div>
          <div class="help-axis">
            <div class="help-axis-title">Orbit</div>
            <div class="help-axis-triggers">
              <span class="help-trigger">Right drag</span>
              <span class="help-trigger">\u21E7 + 2-finger swipe</span>
              <span class="help-trigger">2-finger <small>(mobile)</small></span>
            </div>
            <div class="help-axis-note">Changes Heading / Pitch</div>
          </div>
        </div>
        <div class="help-zoom">Zoom \u2014 Scroll wheel \u00B7 Pinch</div>
        <button id="dismissHelp">Got it</button>
      </div>
    `;
    document.body.appendChild(modal);
  }
  if (!document.getElementById("settingsModal")) {
    const modal = document.createElement("div");
    modal.id = "settingsModal";
    modal.className = "modal-overlay";
    modal.style.display = "none";
    modal.innerHTML = `
      <div class="modal-card settings-modal-card">
        <h2>Settings</h2>
        <p>Camera model: state-driven rail geometry.</p>
        <p>Pitch convention: positive values tilt upward from the local tangent plane.</p>
        <button id="dismissSettings">Close</button>
      </div>
    `;
    document.body.appendChild(modal);
  }

  const statusText = document.getElementById("statusText");
  const northButton = document.getElementById("northButton");
  const northSvg = northButton?.querySelector("svg");
  let northSvgAngle = 0;
  function resetCameraToNorthUp(): void {
    if (hadPoiSelection || viewer.trackedEntity) {
      viewer.trackedEntity = undefined;
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      viewer.selectedEntity = undefined;
      hadPoiSelection = false;
    }
    const state = ensureCameraState();
    if (!state) {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.clone(viewer.camera.positionWC),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
      });
      return;
    }
    state.headingRad = 0;
    state.pitchRad = MAX_STATE_PITCH_RAD;
    applyCameraState();
  }

  function formatStatusZoom(distanceMeters: number): string {
    if (distanceMeters >= 1_000_000) return `${(distanceMeters / 1_000_000).toFixed(1)}Mm`;
    if (distanceMeters >= 1_000) return `${(distanceMeters / 1_000).toFixed(0)}km`;
    return `${distanceMeters.toFixed(0)}m`;
  }

  function updateCompassAndHud() {
    const camera = viewer.camera;
    syncCameraStateFromView();
    const stateAnchor = getCameraStateAnchorCartesian();
    const compassAnchor = stateAnchor ?? resolveCompassAnchor();
    const zoomDistance = cameraState?.zoomMeters
      ?? (compassAnchor
        ? Cesium.Cartesian3.distance(camera.positionWC, compassAnchor)
        : camera.positionCartographic.height);
    orbitCompass.update(compassAnchor, zoomDistance);

    const headingRad = cameraState?.headingRad ?? camera.heading;
    const headingDeg = Cesium.Math.toDegrees(Cesium.Math.zeroToTwoPi(headingRad));

    // Rotate the north button SVG to reflect current heading
    // Use shortest-path rotation to avoid the 180° snap at 0/360 boundary
    if (northSvg) {
      const prev = northSvgAngle;
      let delta = (-headingDeg) - prev;
      // Wrap delta to [-180, 180] for shortest path
      delta = ((delta + 180) % 360 + 360) % 360 - 180;
      northSvgAngle = prev + delta;
      northSvg.style.transform = `rotate(${northSvgAngle}deg)`;
    }

    // Update condensed status text
    if (statusText) {
      const latDeg = Cesium.Math.toDegrees(cameraState?.latRad ?? camera.positionCartographic.latitude);
      const lonDeg = Cesium.Math.toDegrees(cameraState?.lonRad ?? camera.positionCartographic.longitude);
      const pitchDisplay = Cesium.Math.toDegrees(cameraState?.pitchRad ?? 0);
      const hdgDisplay = headingDeg % 360;

      const latStr = `${Math.abs(latDeg).toFixed(4)}\u00B0${latDeg >= 0 ? "N" : "S"}`;
      const lonStr = `${Math.abs(lonDeg).toFixed(4)}\u00B0${lonDeg >= 0 ? "E" : "W"}`;
      const hdgStr = `h${String(Math.round(hdgDisplay)).padStart(3, "0")}\u00B0`;
      const pitchStr = `p${String(Math.round(pitchDisplay)).padStart(2, "0")}\u00B0`;
      const zoomStr = `z${formatStatusZoom(zoomDistance)}`;

      statusText.textContent = `${latStr} ${lonStr} ${hdgStr} ${pitchStr} ${zoomStr}`;
    }
  }

  viewer.scene.preRender.addEventListener(updateCompassAndHud);
  updateCompassAndHud();

  northButton?.addEventListener("click", resetCameraToNorthUp);

  // ── Help modal ─────────────────────────────────────────────────────
  const helpButton = document.getElementById("helpButton");
  const helpModal = document.getElementById("helpModal");
  const settingsButton = document.getElementById("settingsButton");
  const settingsModal = document.getElementById("settingsModal");
  if (helpButton && helpModal) {
    helpButton.addEventListener("click", () => { helpModal.style.display = "flex"; });
    document.getElementById("dismissHelp")?.addEventListener("click", () => { helpModal.style.display = "none"; });
    helpModal.addEventListener("click", (e) => { if (e.target === helpModal) helpModal.style.display = "none"; });
  }
  if (settingsButton && settingsModal) {
    settingsButton.addEventListener("click", () => { settingsModal.style.display = "flex"; });
    document.getElementById("dismissSettings")?.addEventListener("click", () => { settingsModal.style.display = "none"; });
    settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) settingsModal.style.display = "none"; });
  }

  // ── Initial camera view ────────────────────────────────────────────
  const iv = opts.initialView ?? { lon: -30, lat: 20, height: 15_000_000 };
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(iv.lon, iv.lat, iv.height),
    orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-90), roll: 0 },
  });
  syncCameraStateFromView();

  // ── Return handle ──────────────────────────────────────────────────
  return {
    viewer,
    compass: orbitCompass,
    addLayer,
    removeLayer,
    destroy() {
      for (const { layer } of layers.values()) layer.destroy(viewer);
      layers.clear();
      orbitCompass.destroy();
      viewer.destroy();
    },
  };
}
