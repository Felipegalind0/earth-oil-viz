import "./style.css";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

// ─── Data & Visualization Modules ───────────────────────────────────
import { TRADE_FLOWS, TRADE_YEAR } from "./data/tradeFlows";
import type { TradeFlow } from "./data/tradeFlows";
import { REGIONS } from "./data/regions";
import { ROUTE_SCENARIOS } from "./data/seaRoutes";
import type { RouteScenarioId } from "./data/seaRoutes";
import { createCountrySpheres } from "./visualization/regionSpheres";
import { createSeaLanes } from "./visualization/seaLanes";
import { createOrbitCompass } from "./visualization/orbitCompass";
import { buildCullableSet, updateCulling } from "./culling";
import type { CullableSet } from "./culling";
import {
  compensateInvertedHeading,
  computeTwoPointGestureMetrics,
} from "./mathUtils";

// ─── Read API key from URL params ───────────────────────────────────
const params = new URLSearchParams(window.location.search);
const apiKey = params.get("key");

// ─── Viewer Initialisation ──────────────────────────────────────────
const viewer = new Cesium.Viewer("cesiumContainer", {
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
const debugGestures = params.has("debug-gestures");
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

// ─── Cross-browser Trackpad Fixes ───────────────────────────────────
// Prevent page scroll on wheel (Firefox/Chrome)
document.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });

// Prevent Safari proprietary gesture defaults
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

// Remove default imagery (will be replaced below)
viewer.imageryLayers.removeAll();

// ─── Base Map Selection ─────────────────────────────────────────────
if (apiKey) {
  // Google Photorealistic 3-D Tiles
  try {
    const tileset = await Cesium.createGooglePhotorealistic3DTileset({
      key: apiKey,
    });
    viewer.scene.primitives.add(tileset);
  } catch (error) {
    console.error("Failed to load Google 3D Tiles:", error);
  }
} else {
  // Fallback: free OpenStreetMap imagery via Cesium's built-in provider
  viewer.imageryLayers.addImageryProvider(
    new Cesium.OpenStreetMapImageryProvider({
      url: "https://tile.openstreetmap.org/",
    })
  );

  // Show fallback warning modal
  const modal = document.getElementById("fallbackModal");
  if (modal) {
    modal.style.display = "flex";
    document.getElementById("dismissModal")?.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }
}

// ─── Dataset Filtering ──────────────────────────────────────────────
function filterFlows(datasetId: string): TradeFlow[] {
  switch (datasetId) {
    case "top50":
      return [...TRADE_FLOWS].sort((a, b) => b.value - a.value).slice(0, 50);
    case "top30":
      return [...TRADE_FLOWS].sort((a, b) => b.value - a.value).slice(0, 30);
    case "middle_east": {
      const me = REGIONS.find((r) => r.id === "middle_east")!;
      return TRADE_FLOWS.filter((f) => me.countries.includes(f.from));
    }
    case "americas": {
      const na = REGIONS.find((r) => r.id === "north_america")!;
      const sa = REGIONS.find((r) => r.id === "south_america")!;
      const codes = [...na.countries, ...sa.countries];
      return TRADE_FLOWS.filter((f) => codes.includes(f.from));
    }
    case "africa": {
      const af = REGIONS.find((r) => r.id === "africa")!;
      return TRADE_FLOWS.filter((f) => af.countries.includes(f.from));
    }
    case "europe": {
      const ne = REGIONS.find((r) => r.id === "north_europe")!;
      const me = REGIONS.find((r) => r.id === "med_europe")!;
      const codes = [...ne.countries, ...me.countries];
      return TRADE_FLOWS.filter((f) => codes.includes(f.from));
    }
    case "russia_cis": {
      const ru = REGIONS.find((r) => r.id === "russia_cis")!;
      return TRADE_FLOWS.filter((f) => ru.countries.includes(f.from));
    }
    default:
      return TRADE_FLOWS;
  }
}

// ─── Build / Rebuild Visualization ──────────────────────────────────
let currentLaneEntities: Cesium.Entity[] = [];
let currentCullSet: CullableSet | null = null;
let cullTickListener: Cesium.Event.RemoveCallback | null = null;
let currentDatasetId = "all";
let currentScenarioId: RouteScenarioId = "baseline";

function updateScenarioDescription(): void {
  const scenario = ROUTE_SCENARIOS.find((item) => item.id === currentScenarioId);
  const description = document.getElementById("routeScenarioDescription");
  if (scenario && description) {
    description.textContent = scenario.description;
  }
}

function rebuildCurrentVisualization(): void {
  buildVisualization(filterFlows(currentDatasetId));
}

function buildVisualization(flows: TradeFlow[]) {
  // Tear down previous lanes (spheres stay — they don't change)
  for (const e of currentLaneEntities) viewer.entities.remove(e);

  // Trade lanes
  const lanes = createSeaLanes(viewer, flows, currentScenarioId);
  currentLaneEntities = lanes.map((l) => l.entity);
  console.log(`Rendered ${lanes.length} trade lanes for scenario "${currentScenarioId}"`);

  // Rebuild culling set (re-uses existing spheres)
  if (cullTickListener) cullTickListener();
  currentCullSet = buildCullableSet(sphereEntities, lanes);
  cullTickListener = viewer.clock.onTick.addEventListener(() =>
    updateCulling(viewer, currentCullSet!),
  );
}

// ─── Render Country Spheres (always visible) ────────────────────────
const sphereEntities = createCountrySpheres(viewer);
const waypointEntitySet = new Set(sphereEntities);
let hadWaypointSelection = false;
let suppressCompassSelectionClear = false;

function isWaypointEntity(entity: Cesium.Entity | undefined): boolean {
  return entity !== undefined && waypointEntitySet.has(entity);
}

function exitWaypointPoiMode(clearSelection: boolean): void {
  viewer.trackedEntity = undefined;
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  if (clearSelection) {
    viewer.selectedEntity = undefined;
  }
  hadWaypointSelection = false;

  // Fly camera back to top-down (perpendicular) view, keeping current position & heading
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

  if (isWaypointEntity(entity)) {
    hadWaypointSelection = true;
    return;
  }

  if (!entity && hadWaypointSelection) {
    exitWaypointPoiMode(false);
    return;
  }

  if (entity && !isWaypointEntity(entity) && hadWaypointSelection) {
    exitWaypointPoiMode(false);
  }
});

viewer.infoBox?.viewModel.closeClicked.addEventListener(() => {
  if (hadWaypointSelection || isWaypointEntity(viewer.selectedEntity) || isWaypointEntity(viewer.trackedEntity)) {
    exitWaypointPoiMode(true);
  }
});

// ─── Initial Build ──────────────────────────────────────────────────
console.log(`Building visualization from ${TRADE_FLOWS.length} trade flows (${TRADE_YEAR})`);
updateScenarioDescription();
rebuildCurrentVisualization();

// ─── Dataset Dropdown Wiring ────────────────────────────────────────
const dataPanel = document.getElementById("dataPanel") as HTMLDivElement | null;
const dataPanelToggle = document.getElementById("dataPanelToggle") as HTMLButtonElement | null;

function setDataPanelMinimized(minimized: boolean): void {
  if (!dataPanel || !dataPanelToggle) return;
  dataPanel.classList.toggle("is-minimized", minimized);
  dataPanelToggle.textContent = minimized ? "Show Data Overlay" : "Hide Data Overlay";
  dataPanelToggle.setAttribute("aria-expanded", minimized ? "false" : "true");
}

if (dataPanel && dataPanelToggle) {
  // Default collapsed on first load.
  setDataPanelMinimized(true);
  dataPanelToggle.addEventListener("click", () => {
    const currentlyMinimized = dataPanel.classList.contains("is-minimized");
    setDataPanelMinimized(!currentlyMinimized);
  });
}

const datasetSelect = document.getElementById("datasetSelect") as HTMLSelectElement | null;
datasetSelect?.addEventListener("change", () => {
  currentDatasetId = datasetSelect.value;
  const flows = filterFlows(currentDatasetId);
  console.log(`Switching to dataset "${currentDatasetId}" — ${flows.length} flows`);
  buildVisualization(flows);
});

const routeScenarioSelect = document.getElementById("routeScenarioSelect") as HTMLSelectElement | null;
routeScenarioSelect?.addEventListener("change", () => {
  currentScenarioId = routeScenarioSelect.value as RouteScenarioId;
  updateScenarioDescription();
  console.log(`Switching routing scenario to "${currentScenarioId}"`);
  rebuildCurrentVisualization();
});

// ─── Multi-touch / Trackpad Gesture Support ─────────────────────────
const controller = viewer.scene.screenSpaceCameraController;
controller.enableTilt = true;
controller.enableZoom = true;
controller.enableRotate = true;
controller.enableTranslate = true;
controller.enableLook = true;

// Tilt: right-drag, Ctrl+left-drag, or touch pinch
controller.tiltEventTypes = [
  Cesium.CameraEventType.MIDDLE_DRAG,
  Cesium.CameraEventType.PINCH,
  {
    eventType: Cesium.CameraEventType.LEFT_DRAG,
    modifier: Cesium.KeyboardEventModifier.CTRL,
  },
  {
    eventType: Cesium.CameraEventType.RIGHT_DRAG,
    modifier: undefined,
  },
];

// Zoom: pinch only via touch events (wheel handled manually below)
controller.zoomEventTypes = [Cesium.CameraEventType.PINCH];

// ─── Custom Wheel Handler (trackpad-aware) ──────────────────────────
// On macOS trackpads:
//   • Two-finger swipe  → wheel event (ctrlKey = false) → we pan
//   • Pinch-to-zoom     → wheel event (ctrlKey = true)  → we zoom
// On a regular mouse wheel both fire without ctrlKey → we zoom.
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

function getWaypointOrbitTarget(): Cesium.Cartesian3 | null {
  const waypointEntity = isWaypointEntity(viewer.trackedEntity)
    ? viewer.trackedEntity
    : undefined;

  if (!waypointEntity?.position) return null;

  const position = waypointEntity.position.getValue(viewer.clock.currentTime, scratchWaypointPosition);
  return position ? projectToGlobeSurface(position) : null;
}

function resolveCompassAnchor(): Cesium.Cartesian3 | null {
  return getWaypointOrbitTarget() ?? getOrbitTargetAtScreenCenter();
}

function clampCameraPitch(): number {
  const clampedPitch = Cesium.Math.clamp(viewer.camera.pitch, MIN_CAMERA_PITCH_RAD, MAX_CAMERA_PITCH_RAD);

  if (Math.abs(clampedPitch - viewer.camera.pitch) > 0.0001) {
    viewer.camera.setView({
      destination: Cesium.Cartesian3.clone(viewer.camera.positionWC),
      orientation: {
        heading: viewer.camera.heading,
        pitch: clampedPitch,
        roll: 0,
      },
    });
  }

  return clampedPitch;
}

function formatZoomDistance(distanceMeters: number): string {
  if (distanceMeters >= 1_000_000) {
    return `${(distanceMeters / 1_000_000).toFixed(2)}M m`;
  }

  if (distanceMeters >= 1_000) {
    return `${(distanceMeters / 1_000).toFixed(0)} km`;
  }

  return `${distanceMeters.toFixed(0)} m`;
}

function orbitCameraAroundTarget(pitchDeltaRad: number, headingDeltaRad = 0): void {
  // Clamp against world pitch before entering the local ENU orbit frame.
  const currentWorldPitch = viewer.camera.pitch;
  const maxUp = MAX_CAMERA_PITCH_RAD - currentWorldPitch;
  const maxDown = MIN_CAMERA_PITCH_RAD - currentWorldPitch;
  const clampedPitchDeltaRad = Cesium.Math.clamp(pitchDeltaRad, maxDown, maxUp);
  const effectiveHeadingDeltaRad = Math.abs(headingDeltaRad) >= Cesium.Math.toRadians(0.02)
    ? headingDeltaRad
    : 0;
  const effectivePitchDeltaRad = Math.abs(clampedPitchDeltaRad) >= Cesium.Math.toRadians(0.02)
    ? clampedPitchDeltaRad
    : 0;

  // Avoid repicking/reframing when nothing meaningful can be applied.
  if (effectiveHeadingDeltaRad === 0 && effectivePitchDeltaRad === 0) {
    return;
  }

  const target = getOrbitTargetAtScreenCenter();
  if (!target) return;

  // Ensure custom orbit is not fighting entity tracking / POI mode transforms.
  viewer.trackedEntity = undefined;
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

  const orbitTransform = Cesium.Transforms.eastNorthUpToFixedFrame(target, undefined, scratchOrbitTransform);
  viewer.camera.lookAtTransform(orbitTransform);
  if (effectiveHeadingDeltaRad !== 0) {
    viewer.camera.rotateRight(effectiveHeadingDeltaRad);
  }
  if (effectivePitchDeltaRad !== 0) {
    viewer.camera.rotateUp(effectivePitchDeltaRad);
  }
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

  // Keep horizon alignment stable after custom orbit operations.
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

    // Heuristic: trackpad fires many small-delta events in quick succession;
    // a mouse wheel fires fewer, larger-delta events.
    const now = performance.now();
    const dt = now - lastWheelTime;
    lastWheelTime = now;
    if (dt < 50 && Math.abs(e.deltaY) < 60) {
      isTrackpad = true;
    } else if (dt > 300) {
      isTrackpad = false;
    }

    if (e.ctrlKey) {
      // Pinch-to-zoom (Chrome/Firefox send ctrlKey+wheel for trackpad pinch)
      // Safari handles this via gesturechange above, so skip if GestureEvent exists
      if (!supportsSafariGestureEvents) {
        const zoomFraction = -e.deltaY * 0.01;
        const height = viewer.camera.positionCartographic.height;
        if (zoomFraction > 0) {
          viewer.camera.zoomIn(height * zoomFraction);
        } else {
          viewer.camera.zoomOut(height * -zoomFraction);
        }
      }
    } else if (e.shiftKey) {
      // Shift + two-finger swipe → orbit around center target
      // vertical motion: pitch orbit, horizontal motion: heading orbit
      const pitchDelta = e.deltaY * 0.15;
      const headingDelta = e.deltaX * 0.15;
      const pitchDeltaRad = Cesium.Math.toRadians(pitchDelta);
      const headingDeltaRad = Cesium.Math.toRadians(headingDelta);
      orbitCameraAroundTarget(
        Math.abs(pitchDeltaRad) >= Cesium.Math.toRadians(0.02) ? pitchDeltaRad : 0,
        Math.abs(headingDeltaRad) >= Cesium.Math.toRadians(0.02) ? headingDeltaRad : 0,
      );
    } else if (isTrackpad) {
      // Two-finger swipe → orbit (rotate around the globe like click-drag)
      // Temporarily remove the constrained axis so rotateRight uses
      // the camera's local up (heading-aware) instead of the globe's
      // fixed north pole axis.
      const camera = viewer.camera;
      const height = camera.positionCartographic.height;
      const factor = height / 6_000_000;
      const dx = e.deltaX * 0.05 * factor;
      const dy = e.deltaY * 0.05 * factor;
      const savedAxis = camera.constrainedAxis;
      camera.constrainedAxis = undefined;
      camera.rotateRight(Cesium.Math.toRadians(dx));
      camera.rotateUp(Cesium.Math.toRadians(dy));
      camera.constrainedAxis = savedAxis;
      clampCameraPitch();
    } else {
      // Regular mouse scroll wheel → zoom
      const zoomAmount = e.deltaY;
      if (zoomAmount > 0) {
        viewer.camera.zoomOut(viewer.camera.positionCartographic.height * 0.08);
      } else {
        viewer.camera.zoomIn(viewer.camera.positionCartographic.height * 0.08);
      }
    }
  },
  { passive: false }
);

// ─── Two-finger Rotate Gesture → Camera Heading ─────────────────────
// Safari supports GestureEvent for trackpad rotation.
// For actual touchscreens, we fall back to pointer events.

// Safari gesture events (macOS trackpad rotation + pinch zoom)
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

    // Rotation
    const rotDelta = ge.rotation - lastGestureRotation;
    lastGestureRotation = ge.rotation;
    if (Math.abs(rotDelta) > 0.1) {
      orbitCameraAroundTarget(0, Cesium.Math.toRadians(-rotDelta));
    }

    // Pinch-to-zoom via scale
    const scaleDelta = ge.scale / lastGestureScale;
    lastGestureScale = ge.scale;
    const height = viewer.camera.positionCartographic.height;
    if (scaleDelta > 1) {
      viewer.camera.zoomIn(height * (scaleDelta - 1) * 0.5);
    } else if (scaleDelta < 1) {
      viewer.camera.zoomOut(height * (1 - scaleDelta) * 0.5);
    }
  }) as EventListener, { passive: false } as AddEventListenerOptions);

  canvas.addEventListener("gestureend", ((e: Event) => {
    e.preventDefault();
  }) as EventListener, { passive: false } as AddEventListenerOptions);
}

// Touchscreen fallback: own all two-finger touch input directly.
// Apply centroid translation as orbit and finger distance changes as zoom.
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
    logGesture(`touch gesture session cleared: ${reason}`, {
      activePointers: activePointers.size,
    });
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
      touchGestureSession = {
        previousMetrics: metrics,
        controlsSuspended: false,
      };
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

  if (!touchGestureSession || activePointers.size !== 2) {
    return;
  }

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
    if (scaleDelta > 1) {
      viewer.camera.zoomIn(height * (scaleDelta - 1) * 0.5);
    } else if (scaleDelta < 1) {
      viewer.camera.zoomOut(height * (1 - scaleDelta) * 0.5);
    }
    logGesture("applied pinch zoom delta", { scaleDelta, distanceDeltaPx });
  }

  touchGestureSession.previousMetrics = metrics;
}, { passive: false });

function removePointer(e: PointerEvent) {
  if (e.pointerType !== "touch") return;

  activePointers.delete(e.pointerId);
  if (canvas.hasPointerCapture(e.pointerId)) {
    canvas.releasePointerCapture(e.pointerId);
  }

  if (activePointers.size < 2) {
    clearTouchGestureSession("touch count dropped below two");
  }
}

canvas.addEventListener("pointerup", removePointer);
canvas.addEventListener("pointercancel", removePointer);

// ─── Camera HUD & Reset Control ───────────────────────────────────
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
  const wrapped = ((lonDeg + 180) % 360 + 360) % 360 - 180;
  return wrapped;
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
  const pitchDeg = Cesium.Math.clamp(
    snapshot.pitchDeg,
    MIN_CAMERA_PITCH_DISPLAY_DEG,
    MAX_CAMERA_PITCH_DISPLAY_DEG,
  );
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
  if (field === "zoom") {
    return parseDistanceMeters(raw);
  }

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

  const cancelEdit = () => {
    endHudInlineEdit();
  };

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
    if (event.key === "Enter") {
      event.preventDefault();
      commitEdit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  });

  input.addEventListener("blur", () => {
    commitEdit();
  });

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
  if (hadWaypointSelection || viewer.trackedEntity) {
    viewer.trackedEntity = undefined;
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    viewer.selectedEntity = undefined;
    hadWaypointSelection = false;
  }

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.clone(viewer.camera.positionWC),
    orientation: {
      heading: 0,
      pitch: Cesium.Math.toRadians(-90),
      roll: 0,
    },
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

  // ── Heading (compensate for over-the-horizon inversion) ──
  let headingDeg = Cesium.Math.toDegrees(
    Cesium.Math.zeroToTwoPi(camera.heading),
  );
  const surfaceNormal = Cesium.Cartesian3.normalize(camera.positionWC, scratchSurfaceNormal);
  const isLookingAwayFromGlobe = Cesium.Cartesian3.dot(camera.directionWC, surfaceNormal) > 0;
  headingDeg = compensateInvertedHeading(headingDeg, isLookingAwayFromGlobe);

  // ── Camera HUD ──
  if (cameraHud instanceof HTMLElement) {
    ensureInteractiveCameraHud();

    const targetCartographic = compassAnchor
      ? Cesium.Cartographic.fromCartesian(compassAnchor)
      : camera.positionCartographic;
    const latDeg = Cesium.Math.toDegrees(targetCartographic.latitude);
    const lonDeg = Cesium.Math.toDegrees(targetCartographic.longitude);
    const pitchDisplay = -Cesium.Math.toDegrees(clampedPitch);
    const hdgDisplay = headingDeg % 360;

    latestHudSnapshot = {
      latDeg,
      lonDeg,
      headingDeg: hdgDisplay,
      pitchDeg: pitchDisplay,
      zoomMeters: zoomDistance,
    };

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

if (cameraResetButton) {
  cameraResetButton.title = "Reset camera to north-up & top-down";
}

// ─── Initial Camera View ────────────────────────────────────────────
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(-30, 20, 15_000_000),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch: Cesium.Math.toRadians(-90),
    roll: 0,
  },
});

