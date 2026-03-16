import { defineConfig } from "vite";
import cesium from "vite-plugin-cesium";

export default defineConfig({
  base: "/foss-earth/",
  plugins: [cesium()],
  test: {
    include: ["src/**/*.test.ts"],
  },
});
