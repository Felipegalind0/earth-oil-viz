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
import { buildCullableSet, updateCulling } from "./culling";
import type { CullableSet } from "./culling";
import { shortestAngleDeltaDeg, compensateInvertedHeading, compassTilt } from "./mathUtils";

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

function orbitCameraAroundTarget(pitchDeltaRad: number, headingDeltaRad = 0): void {
  const target = getOrbitTargetAtScreenCenter();
  if (!target) return;

  // Ensure custom orbit is not fighting entity tracking / POI mode transforms.
  viewer.trackedEntity = undefined;
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

  const orbitTransform = Cesium.Transforms.eastNorthUpToFixedFrame(target, undefined, scratchOrbitTransform);
  viewer.camera.lookAtTransform(orbitTransform);
  if (headingDeltaRad !== 0) {
    viewer.camera.rotateRight(headingDeltaRad);
  }
  if (pitchDeltaRad !== 0) {
    viewer.camera.rotateUp(pitchDeltaRad);
  }
  viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

  // Keep horizon alignment stable after custom orbit operations.
  viewer.camera.setView({
    destination: Cesium.Cartesian3.clone(viewer.camera.positionWC),
    orientation: {
      heading: viewer.camera.heading,
      pitch: viewer.camera.pitch,
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
      if (!("GestureEvent" in window)) {
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
      orbitCameraAroundTarget(
        Cesium.Math.toRadians(pitchDelta),
        Cesium.Math.toRadians(headingDelta),
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
if ("GestureEvent" in window) {
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

// Touchscreen fallback: track two pointers and compute rotation delta
const activePointers = new Map<number, { x: number; y: number }>();
let prevAngle: number | null = null;

function getAngle(): number | null {
  const pts = Array.from(activePointers.values());
  if (pts.length < 2) return null;
  return Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
}

canvas.addEventListener("pointerdown", (e: PointerEvent) => {
  if (e.pointerType !== "touch") return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 2) {
    prevAngle = getAngle();
  }
});

canvas.addEventListener("pointermove", (e: PointerEvent) => {
  if (e.pointerType !== "touch" || !activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (activePointers.size === 2 && prevAngle !== null) {
    const angle = getAngle();
    if (angle !== null) {
      const delta = angle - prevAngle;
      if (Math.abs(delta) > 0.003 && Math.abs(delta) < Math.PI) {
        orbitCameraAroundTarget(0, -delta);
      }
      prevAngle = angle;
    }
  }
});

function removePointer(e: PointerEvent) {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) {
    prevAngle = null;
  }
}

canvas.addEventListener("pointerup", removePointer);
canvas.addEventListener("pointercancel", removePointer);

// ─── 3D Compass Widget ─────────────────────────────────────────────
const compassWidget = document.getElementById("compassWidget");
const compassRing = document.querySelector<HTMLElement>(".compass-ring");
let lastCompassHeadingDeg: number | null = null;
let displayCompassHeadingDeg = 0;
const scratchSurfaceNormal = new Cesium.Cartesian3();

function updateCompass() {
  if (!compassRing) return;
  let headingDeg = Cesium.Math.toDegrees(
    Cesium.Math.zeroToTwoPi(viewer.camera.heading),
  );

  const surfaceNormal = Cesium.Cartesian3.normalize(viewer.camera.positionWC, scratchSurfaceNormal);
  const isLookingAwayFromGlobe = Cesium.Cartesian3.dot(viewer.camera.directionWC, surfaceNormal) > 0;
  headingDeg = compensateInvertedHeading(headingDeg, isLookingAwayFromGlobe);

  if (lastCompassHeadingDeg === null) {
    lastCompassHeadingDeg = headingDeg;
    displayCompassHeadingDeg = headingDeg;
  } else {
    displayCompassHeadingDeg += shortestAngleDeltaDeg(lastCompassHeadingDeg, headingDeg);
    lastCompassHeadingDeg = headingDeg;
  }

  const pitch = Cesium.Math.toDegrees(viewer.camera.pitch);

  const [tiltX, tiltY] = compassTilt(pitch, displayCompassHeadingDeg);
  compassRing.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg) rotateZ(${-displayCompassHeadingDeg}deg)`;
}

viewer.clock.onTick.addEventListener(updateCompass);
updateCompass();

compassWidget?.addEventListener("click", () => {
  // If in POI orbit mode, exit it first so flyTo isn't fighting the tracking transform
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
});

if (compassWidget) {
  compassWidget.title = "Reset camera to north-up & top-down";
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

