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
  compensateInvertedHeading,
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
  const MIN_CAMERA_PITCH_RAD = Cesium.Math.toRadians(-90);
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
  controller.enableTranslate = true;
  controller.enableLook = true;

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
  const scratchOrbitTransform = new Cesium.Matrix4();
  const scratchWaypointPosition = new Cesium.Cartesian3();
  const scratchSurfaceAnchor = new Cesium.Cartesian3();
  let lastOrbitTarget: Cesium.Cartesian3 | null = null;

  function getOrbitTargetAtScreenCenter(): Cesium.Cartesian3 | null {
    scratchScreenCenter.x = canvas.clientWidth * 0.5;
    scratchScreenCenter.y = canvas.clientHeight * 0.5;
    const ray = viewer.camera.getPickRay(scratchScreenCenter);
    let target = ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined;
    if (!target) {
      target = viewer.camera.pickEllipsoid(scratchScreenCenter, viewer.scene.globe.ellipsoid) ?? undefined;
    }
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

  function clampCameraPitch(): number {
    const clampedPitch = Cesium.Math.clamp(viewer.camera.pitch, MIN_CAMERA_PITCH_RAD, MAX_CAMERA_PITCH_RAD);
    if (Math.abs(clampedPitch - viewer.camera.pitch) > 0.0001) {
      viewer.camera.setView({
        destination: Cesium.Cartesian3.clone(viewer.camera.positionWC),
        orientation: { heading: viewer.camera.heading, pitch: clampedPitch, roll: 0 },
      });
    }
    return clampedPitch;
  }

  function formatZoomDistance(distanceMeters: number): string {
    if (distanceMeters >= 1_000_000) return `${(distanceMeters / 1_000_000).toFixed(2)}M m`;
    if (distanceMeters >= 1_000) return `${(distanceMeters / 1_000).toFixed(0)} km`;
    return `${distanceMeters.toFixed(0)} m`;
  }

  function orbitCameraAroundTarget(pitchDeltaRad: number, headingDeltaRad = 0): void {
    const currentWorldPitch = viewer.camera.pitch;
    const maxUp = MAX_CAMERA_PITCH_RAD - currentWorldPitch;
    const maxDown = MIN_CAMERA_PITCH_RAD - currentWorldPitch;
    const clampedPitchDeltaRad = Cesium.Math.clamp(pitchDeltaRad, maxDown, maxUp);
    const effectiveHeadingDeltaRad = Math.abs(headingDeltaRad) >= Cesium.Math.toRadians(0.02) ? headingDeltaRad : 0;
    const effectivePitchDeltaRad = Math.abs(clampedPitchDeltaRad) >= Cesium.Math.toRadians(0.02) ? clampedPitchDeltaRad : 0;
    if (effectiveHeadingDeltaRad === 0 && effectivePitchDeltaRad === 0) return;

    const target = getOrbitTargetAtScreenCenter();
    if (!target) return;

    viewer.trackedEntity = undefined;
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

    const orbitTransform = Cesium.Transforms.eastNorthUpToFixedFrame(target, undefined, scratchOrbitTransform);
    viewer.camera.lookAtTransform(orbitTransform);
    if (effectiveHeadingDeltaRad !== 0) viewer.camera.rotateRight(effectiveHeadingDeltaRad);
    if (effectivePitchDeltaRad !== 0) viewer.camera.rotateUp(effectivePitchDeltaRad);
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

    viewer.camera.setView({
      destination: Cesium.Cartesian3.clone(viewer.camera.positionWC),
      orientation: {
        heading: viewer.camera.heading,
        pitch: Cesium.Math.clamp(viewer.camera.pitch, MIN_CAMERA_PITCH_RAD, MAX_CAMERA_PITCH_RAD),
        roll: 0,
      },
    });
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
          if (zoomFraction > 0) viewer.camera.zoomIn(height * zoomFraction);
          else viewer.camera.zoomOut(height * -zoomFraction);
        }
      } else if (e.shiftKey) {
        const pitchDelta = e.deltaY * 0.15;
        const headingDelta = e.deltaX * 0.15;
        const pitchDeltaRad = Cesium.Math.toRadians(pitchDelta);
        const headingDeltaRad = Cesium.Math.toRadians(headingDelta);
        orbitCameraAroundTarget(
          Math.abs(pitchDeltaRad) >= Cesium.Math.toRadians(0.02) ? pitchDeltaRad : 0,
          Math.abs(headingDeltaRad) >= Cesium.Math.toRadians(0.02) ? headingDeltaRad : 0,
        );
      } else if (isTrackpad) {
        const camera = viewer.camera;
        const height = camera.positionCartographic.height;
        const factor = height / 6_000_000;
        const dx = e.deltaX * 0.05 * factor;
        const dy = e.deltaY * 0.05 * factor;
        const heading = camera.heading;
        const cosH = Math.cos(heading);
        const sinH = Math.sin(heading);
        const geoDx = dx * cosH - dy * sinH;
        const geoDy = dy * cosH + dx * sinH;
        camera.rotateRight(Cesium.Math.toRadians(geoDx));
        camera.rotateUp(Cesium.Math.toRadians(geoDy));
        clampCameraPitch();
      } else {
        const zoomAmount = e.deltaY;
        if (zoomAmount > 0) viewer.camera.zoomOut(viewer.camera.positionCartographic.height * 0.08);
        else viewer.camera.zoomIn(viewer.camera.positionCartographic.height * 0.08);
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
      if (scaleDelta > 1) viewer.camera.zoomIn(height * (scaleDelta - 1) * 0.5);
      else if (scaleDelta < 1) viewer.camera.zoomOut(height * (1 - scaleDelta) * 0.5);
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
      if (scaleDelta > 1) viewer.camera.zoomIn(height * (scaleDelta - 1) * 0.5);
      else if (scaleDelta < 1) viewer.camera.zoomOut(height * (1 - scaleDelta) * 0.5);
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

  // ── Camera HUD & Reset ─────────────────────────────────────────────
  const cameraHud = document.getElementById("cameraHud");
  const cameraResetButton = document.getElementById("cameraResetButton");
  const scratchSurfaceNormal = new Cesium.Cartesian3();
  const MIN_CAMERA_PITCH_DISPLAY_DEG = -Cesium.Math.toDegrees(MAX_CAMERA_PITCH_RAD);
  const MAX_CAMERA_PITCH_DISPLAY_DEG = -Cesium.Math.toDegrees(MIN_CAMERA_PITCH_RAD);

  type CameraHudField = "lat" | "lon" | "heading" | "pitch" | "zoom";

  type CameraHudSnapshot = {
    latDeg: number;
    lonDeg: number;
    headingDeg: number;
    pitchDeg: number;
    zoomMeters: number;
  };

  type ActiveHudEditor = {
    field: CameraHudField;
    button: HTMLButtonElement;
    input: HTMLInputElement;
  };

  const hudButtons: Partial<Record<CameraHudField, HTMLButtonElement>> = {};
  let latestHudSnapshot: CameraHudSnapshot | null = null;
  let activeHudEditor: ActiveHudEditor | null = null;

  function normalizeLongitudeDeg(lonDeg: number): number {
    return ((lonDeg + 180) % 360 + 360) % 360 - 180;
  }

  function formatLatitude(latDeg: number): string {
    return `${Math.abs(latDeg).toFixed(1)}°${latDeg >= 0 ? "N" : "S"}`;
  }

  function formatLongitude(lonDeg: number): string {
    return `${Math.abs(lonDeg).toFixed(1)}°${lonDeg >= 0 ? "E" : "W"}`;
  }

  function parseDistanceMeters(raw: string): number | null {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) return null;
    const kmMatch = normalized.match(/^(-?\d+(?:\.\d+)?)\s*km$/);
    if (kmMatch) {
      const valueKm = Number(kmMatch[1]);
      return Number.isFinite(valueKm) ? valueKm * 1000 : null;
    }
    const mMatch = normalized.match(/^(-?\d+(?:\.\d+)?)\s*m$/);
    if (mMatch) {
      const valueM = Number(mMatch[1]);
      return Number.isFinite(valueM) ? valueM : null;
    }
    const value = Number(normalized);
    return Number.isFinite(value) ? value : null;
  }

  function applyCameraSnapshot(snapshot: CameraHudSnapshot): void {
    const latDeg = Cesium.Math.clamp(snapshot.latDeg, -89.999, 89.999);
    const lonDeg = normalizeLongitudeDeg(snapshot.lonDeg);
    const headingDeg = ((snapshot.headingDeg % 360) + 360) % 360;
    const pitchDeg = Cesium.Math.clamp(snapshot.pitchDeg, MIN_CAMERA_PITCH_DISPLAY_DEG, MAX_CAMERA_PITCH_DISPLAY_DEG);
    const zoomMeters = Math.max(50, snapshot.zoomMeters);
    const target = Cesium.Cartesian3.fromDegrees(lonDeg, latDeg, 0);

    viewer.trackedEntity = undefined;
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    viewer.camera.lookAt(
      target,
      new Cesium.HeadingPitchRange(
        Cesium.Math.toRadians(headingDeg),
        Cesium.Math.toRadians(-pitchDeg),
        zoomMeters,
      ),
    );
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    clampCameraPitch();
  }

  function getHudFieldEditValue(field: CameraHudField, snapshot: CameraHudSnapshot): string {
    if (field === "lat") return snapshot.latDeg.toFixed(4);
    if (field === "lon") return snapshot.lonDeg.toFixed(4);
    if (field === "heading") return snapshot.headingDeg.toFixed(2);
    if (field === "pitch") return snapshot.pitchDeg.toFixed(2);
    return snapshot.zoomMeters.toFixed(0);
  }

  function parseHudFieldValue(field: CameraHudField, raw: string): number | null {
    if (field === "zoom") return parseDistanceMeters(raw);
    const parsed = Number(raw.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  function applyHudFieldValue(field: CameraHudField, value: number): void {
    if (!latestHudSnapshot) return;
    const next: CameraHudSnapshot = { ...latestHudSnapshot };
    if (field === "lat") next.latDeg = value;
    if (field === "lon") next.lonDeg = value;
    if (field === "heading") next.headingDeg = value;
    if (field === "pitch") next.pitchDeg = value;
    if (field === "zoom") next.zoomMeters = value;
    applyCameraSnapshot(next);
  }

  function endHudInlineEdit(): void {
    if (!activeHudEditor) return;
    activeHudEditor.button.classList.remove("is-editing");
    activeHudEditor.button.removeAttribute("data-invalid");
    activeHudEditor = null;
  }

  function beginHudInlineEdit(field: CameraHudField): void {
    if (!latestHudSnapshot) return;
    const button = hudButtons[field];
    if (!button) return;
    if (activeHudEditor?.field === field) {
      activeHudEditor.input.focus();
      activeHudEditor.input.select();
      return;
    }
    endHudInlineEdit();

    const input = document.createElement("input");
    input.type = "text";
    input.className = "camera-hud-input";
    input.value = getHudFieldEditValue(field, latestHudSnapshot);
    input.spellcheck = false;
    input.autocomplete = "off";
    input.autocapitalize = "off";
    input.setAttribute("aria-label", `Edit ${field}`);

    button.classList.add("is-editing");
    button.replaceChildren(input);
    activeHudEditor = { field, button, input };

    const cancelEdit = () => endHudInlineEdit();
    const commitEdit = () => {
      if (!activeHudEditor || activeHudEditor.field !== field) return;
      const parsed = parseHudFieldValue(field, input.value);
      if (parsed === null) {
        button.setAttribute("data-invalid", "true");
        input.focus();
        input.select();
        return;
      }
      applyHudFieldValue(field, parsed);
      endHudInlineEdit();
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); commitEdit(); return; }
      if (event.key === "Escape") { event.preventDefault(); cancelEdit(); }
    });
    input.addEventListener("blur", () => commitEdit());
    input.focus();
    input.select();
  }

  function ensureInteractiveCameraHud(): void {
    if (!(cameraHud instanceof HTMLElement)) return;
    if (cameraHud.dataset.mode === "interactive") return;
    cameraHud.dataset.mode = "interactive";
    cameraHud.classList.add("camera-hud-grid");
    cameraHud.innerHTML = `
      <div class="camera-hud-row camera-hud-row-2">
        <button type="button" class="camera-hud-value" data-field="lat">LAT --</button>
        <button type="button" class="camera-hud-value" data-field="lon">LON --</button>
      </div>
      <div class="camera-hud-row camera-hud-row-3">
        <button type="button" class="camera-hud-value" data-field="heading">H --</button>
        <button type="button" class="camera-hud-value" data-field="pitch">P --</button>
        <button type="button" class="camera-hud-value" data-field="zoom">Z --</button>
      </div>
    `;
    const fields: CameraHudField[] = ["lat", "lon", "heading", "pitch", "zoom"];
    for (const field of fields) {
      const button = cameraHud.querySelector<HTMLButtonElement>(`button[data-field="${field}"]`);
      if (!button) continue;
      hudButtons[field] = button;
      button.title = "Click to edit; Enter to apply, Esc to cancel";
      button.addEventListener("click", () => beginHudInlineEdit(field));
    }
  }

  function resetCameraToNorthUp(): void {
    if (hadPoiSelection || viewer.trackedEntity) {
      viewer.trackedEntity = undefined;
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      viewer.selectedEntity = undefined;
      hadPoiSelection = false;
    }
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.clone(viewer.camera.positionWC),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
      duration: 0.7,
    });
  }

  function updateCompassAndHud() {
    const camera = viewer.camera;
    const clampedPitch = clampCameraPitch();
    const compassAnchor = resolveCompassAnchor();
    const zoomDistance = compassAnchor
      ? Cesium.Cartesian3.distance(camera.positionWC, compassAnchor)
      : camera.positionCartographic.height;
    orbitCompass.update(compassAnchor, zoomDistance);

    let headingDeg = Cesium.Math.toDegrees(Cesium.Math.zeroToTwoPi(camera.heading));
    const surfaceNormal = Cesium.Cartesian3.normalize(camera.positionWC, scratchSurfaceNormal);
    const isLookingAwayFromGlobe = Cesium.Cartesian3.dot(camera.directionWC, surfaceNormal) > 0;
    headingDeg = compensateInvertedHeading(headingDeg, isLookingAwayFromGlobe);

    if (cameraHud instanceof HTMLElement) {
      ensureInteractiveCameraHud();
      const targetCartographic = compassAnchor
        ? Cesium.Cartographic.fromCartesian(compassAnchor)
        : camera.positionCartographic;
      const latDeg = Cesium.Math.toDegrees(targetCartographic.latitude);
      const lonDeg = Cesium.Math.toDegrees(targetCartographic.longitude);
      const pitchDisplay = -Cesium.Math.toDegrees(clampedPitch);
      const hdgDisplay = headingDeg % 360;

      latestHudSnapshot = { latDeg, lonDeg, headingDeg: hdgDisplay, pitchDeg: pitchDisplay, zoomMeters: zoomDistance };

      if (activeHudEditor?.field !== "lat") {
        hudButtons.lat?.replaceChildren(`LAT ${formatLatitude(latDeg)}`);
        hudButtons.lat?.removeAttribute("data-invalid");
      }
      if (activeHudEditor?.field !== "lon") {
        hudButtons.lon?.replaceChildren(`LON ${formatLongitude(lonDeg)}`);
        hudButtons.lon?.removeAttribute("data-invalid");
      }
      if (activeHudEditor?.field !== "heading") {
        hudButtons.heading?.replaceChildren(`H ${hdgDisplay.toFixed(0)}°`);
        hudButtons.heading?.removeAttribute("data-invalid");
      }
      if (activeHudEditor?.field !== "pitch") {
        hudButtons.pitch?.replaceChildren(`P ${pitchDisplay.toFixed(0)}°`);
        hudButtons.pitch?.removeAttribute("data-invalid");
      }
      if (activeHudEditor?.field !== "zoom") {
        hudButtons.zoom?.replaceChildren(`Z ${formatZoomDistance(zoomDistance)}`);
        hudButtons.zoom?.removeAttribute("data-invalid");
      }
    }
  }

  viewer.scene.preRender.addEventListener(updateCompassAndHud);
  updateCompassAndHud();

  cameraResetButton?.addEventListener("click", resetCameraToNorthUp);
  if (cameraResetButton) cameraResetButton.title = "Reset camera to north-up & top-down";

  // ── Help modal ─────────────────────────────────────────────────────
  const helpButton = document.getElementById("helpButton");
  const helpModal = document.getElementById("helpModal");
  if (helpButton && helpModal) {
    helpButton.addEventListener("click", () => { helpModal.style.display = "flex"; });
    document.getElementById("dismissHelp")?.addEventListener("click", () => { helpModal.style.display = "none"; });
    helpModal.addEventListener("click", (e) => { if (e.target === helpModal) helpModal.style.display = "none"; });
  }

  // ── Initial camera view ────────────────────────────────────────────
  const iv = opts.initialView ?? { lon: -30, lat: 20, height: 15_000_000 };
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(iv.lon, iv.lat, iv.height),
    orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-90), roll: 0 },
  });

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
