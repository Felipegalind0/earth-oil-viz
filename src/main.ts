// ─── FOSS Earth — Demo Entry Point ──────────────────────────────────
// Minimal entry point that creates a generic globe with no data layers.
// To add domain-specific layers (trade flows, logistics, etc.), import
// createGlobe and register GlobeLayer implementations.

import { createGlobe } from "./globe";

const params = new URLSearchParams(window.location.search);

await createGlobe({
  apiKey: params.get("key"),
  debugGestures: params.has("debug-gestures"),
});

