import "./style.css";
import * as Cesium from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

// ─── Data & Visualization Modules ───────────────────────────────────
import { fetchComtradeData } from "./data/comtradeApi";
import type { TradeData } from "./data/comtradeApi";
import { getFallbackData } from "./data/fallbackData";
import { createRegionSpheres } from "./visualization/regionSpheres";
import { createSeaLanes } from "./visualization/seaLanes";
import { startFlowAnimation } from "./visualization/flowAnimation";

// ─── Read API keys from URL params ──────────────────────────────────
const params = new URLSearchParams(window.location.search);
const apiKey = params.get("key");
const comtradeKey = params.get("comtrade_key");

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

// ─── Load Trade Data & Build Visualization ──────────────────────────
async function loadTradeData(): Promise<TradeData> {
  if (comtradeKey) {
    try {
      const data = await fetchComtradeData(comtradeKey);
      console.log(
        `Loaded Comtrade data: ${data.flows.length} flows for year ${data.year}`,
      );
      return data;
    } catch (err) {
      console.warn("Comtrade API failed, using fallback data:", err);
    }
  }
  console.log("Using fallback trade data (2023 estimates)");
  return getFallbackData();
}

// Show loading overlay
const loadingOverlay = document.getElementById("loadingOverlay");
if (loadingOverlay) loadingOverlay.style.display = "flex";

const tradeData = await loadTradeData();

// Hide loading overlay
if (loadingOverlay) loadingOverlay.style.display = "none";

// ─── Render Region Spheres ──────────────────────────────────────────
createRegionSpheres(viewer, tradeData);

// ─── Render Sea Lanes ───────────────────────────────────────────────
// Only show flows that have a matching sea route
const lanes = createSeaLanes(viewer, tradeData.flows);
console.log(`Rendered ${lanes.length} sea lanes`);

// ─── Start Flow Animation ───────────────────────────────────────────
const maxFlowValue = Math.max(...tradeData.flows.map((f) => f.value), 1);
startFlowAnimation(viewer, lanes, maxFlowValue);

// ─── Data Source Label ──────────────────────────────────────────────
const sourceLabel = document.getElementById("dataSourceLabel");
if (sourceLabel) {
  sourceLabel.textContent =
    tradeData.source === "comtrade"
      ? `UN Comtrade ${tradeData.year}`
      : `Demo data (${tradeData.year} est.)`;
}

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
    } else if (e.shiftKey && isTrackpad) {
      // Shift + two-finger swipe → rotate camera heading (Chrome/Firefox workaround)
      const headingDelta = e.deltaX * 0.15 + e.deltaY * 0.15;
      viewer.camera.twistRight(Cesium.Math.toRadians(headingDelta));
    } else if (isTrackpad) {
      // Two-finger swipe → orbit (rotate around the globe like click-drag)
      const camera = viewer.camera;
      const height = camera.positionCartographic.height;
      // Scale rotation speed to altitude so it feels consistent
      const factor = height / 6_000_000;
      const deltaLon = e.deltaX * 0.05 * factor;
      const deltaLat = e.deltaY * 0.05 * factor;
      camera.rotateRight(Cesium.Math.toRadians(deltaLon));
      camera.rotateUp(Cesium.Math.toRadians(deltaLat));
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
      viewer.camera.twistRight(Cesium.Math.toRadians(-rotDelta));
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
        viewer.camera.twistRight(-delta);
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
const compassRing = document.querySelector<HTMLElement>(".compass-ring");

function updateCompass() {
  if (!compassRing) return;
  const heading = Cesium.Math.toDegrees(viewer.camera.heading);
  const pitch = Cesium.Math.toDegrees(viewer.camera.pitch);
  // Rotate ring opposite to heading so needle points north;
  // tilt ring on X axis to reflect camera pitch for a 3D effect.
  const tiltX = Math.min(Math.max(pitch + 90, 0), 60); // 0-60° tilt range
  compassRing.style.transform = `rotateX(${tiltX}deg) rotateZ(${-heading}deg)`;
}

viewer.clock.onTick.addEventListener(updateCompass);
updateCompass();

// ─── Initial Camera View ────────────────────────────────────────────
viewer.camera.setView({
  destination: Cesium.Cartesian3.fromDegrees(-30, 20, 15_000_000),
  orientation: {
    heading: Cesium.Math.toRadians(0),
    pitch: Cesium.Math.toRadians(-90),
    roll: 0,
  },
});

