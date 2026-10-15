import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { getWorkerUrl, setWorkerUrl, type Map as MapLibreMap, type StyleSpecification } from "maplibre-gl";

// Served from public/vendor by scripts/copy-maplibre-worker.mjs.
const WORKER_URL = "/vendor/maplibre-gl-worker.mjs";

export function configureMapLibre() {
  if (getWorkerUrl() !== WORKER_URL) setWorkerUrl(WORKER_URL);
}

// Free basemap, no API key: OpenFreeMap "Positron" (muted, light).
export const BASEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

// Optional aerial imagery for tracing field edges. Esri World Imagery terms
// allow non-commercial and prototype use with attribution.
export const SATELLITE_SOURCE: NonNullable<StyleSpecification["sources"]>[string] = {
  type: "raster",
  tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
  tileSize: 256,
  maxzoom: 19,
  attribution:
    "Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community",
};

// Roughly Cambridgeshire and Peterborough, used until the outline loads.
export const START_VIEW = { center: [0.0, 52.38] as [number, number], zoom: 8.6 };

/** Add a hidden satellite layer under the basemap's labels, and return a toggle. */
export function addSatellite(map: MapLibreMap) {
  if (!map.getSource("satellite")) map.addSource("satellite", SATELLITE_SOURCE);
  const firstSymbol = map.getStyle().layers.find((l) => l.type === "symbol")?.id;
  if (!map.getLayer("satellite")) {
    map.addLayer(
      { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
      firstSymbol,
    );
  }
}

export function setSatellite(map: MapLibreMap, on: boolean) {
  if (map.getLayer("satellite")) map.setLayoutProperty("satellite", "visibility", on ? "visible" : "none");
}

/** Shade everything outside the covered region and outline its edge. */
export function addRegionOutline(map: MapLibreMap, region: FeatureCollection<Polygon | MultiPolygon>) {
  const holes = region.features.flatMap((f) =>
    f.geometry.type === "Polygon" ? [f.geometry.coordinates[0]] : f.geometry.coordinates.map((p) => p[0]),
  );
  const mask: FeatureCollection<Polygon> = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [[[-20, 45], [10, 45], [10, 62], [-20, 62], [-20, 45]], ...holes],
        },
      },
    ],
  };
  map.addSource("region-mask", { type: "geojson", data: mask });
  map.addSource("region", { type: "geojson", data: region });
  map.addLayer({ id: "region-mask", type: "fill", source: "region-mask", paint: { "fill-color": "#1f2421", "fill-opacity": 0.18 } });
  map.addLayer({
    id: "region-line",
    type: "line",
    source: "region",
    paint: { "line-color": "#2f4a32", "line-width": 2.5, "line-dasharray": [3, 2] },
  });
}

export function boundsOf(region: FeatureCollection<Polygon | MultiPolygon>): [number, number, number, number] {
  let minX = 180, minY = 90, maxX = -180, maxY = -90;
  for (const f of region.features) {
    const rings = f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat();
    for (const ring of rings) for (const [x, y] of ring) {
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  return [minX, minY, maxX, maxY];
}
