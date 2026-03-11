import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

export default defineConfig({
  base: "/earth-oil-viz/",
  plugins: [cesium()],
});
