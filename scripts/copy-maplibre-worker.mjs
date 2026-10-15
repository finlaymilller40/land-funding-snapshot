// MapLibre loads its web worker from a file next to its own bundle. Next.js
// bundles MapLibre into a chunk, so serve the worker as a static file instead
// (see setWorkerUrl in src/lib/map.ts). Runs before `dev` and `build`.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const src = path.join(path.dirname(require.resolve("maplibre-gl/package.json")), "dist", "maplibre-gl-worker.mjs");
const destDir = path.join(import.meta.dirname, "..", "public", "vendor");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, path.join(destDir, "maplibre-gl-worker.mjs"));
console.log("Copied MapLibre worker to public/vendor/");
