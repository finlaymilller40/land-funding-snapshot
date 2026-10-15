import area from "@turf/area";
import difference from "@turf/difference";
import { feature, featureCollection } from "@turf/helpers";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";

export type AreaGeometry = Polygon | MultiPolygon;

export function areaHa(geometry: AreaGeometry): number {
  return area(geometry) / 10_000;
}

/**
 * How much of a field lies outside the covered region, in hectares.
 * Uses the simplified outline (within about 10 m), so tiny edge slivers are ignored.
 */
export function haOutside(
  geometry: AreaGeometry,
  region: FeatureCollection<AreaGeometry> | null,
): number {
  if (!region || region.features.length === 0) return 0;
  let rest: Feature<AreaGeometry> | null = feature(geometry);
  for (const r of region.features) {
    if (!rest) break;
    rest = difference(featureCollection([rest, r]));
  }
  return rest ? area(rest) / 10_000 : 0;
}

/** Ignore differences smaller than this when warning about the region edge (0.01 ha = 100 m²). */
export const OUTSIDE_TOLERANCE_HA = 0.01;

export type UploadedBlock = { name: string; geometry: AreaGeometry };

/**
 * Read a GeoJSON file into blocks: one per Polygon or MultiPolygon feature.
 * Returns a plain-English error for anything we can't use.
 */
export function parseUpload(text: string): { blocks: UploadedBlock[] } | { error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: "That file isn't valid GeoJSON. Export your fields as GeoJSON and try again." };
  }

  const features: Feature<Geometry | null>[] = [];
  const obj = json as { type?: string; features?: unknown; geometry?: unknown; coordinates?: unknown };
  if (obj.type === "FeatureCollection" && Array.isArray(obj.features)) {
    features.push(...(obj.features as Feature<Geometry | null>[]));
  } else if (obj.type === "Feature") {
    features.push(obj as Feature<Geometry | null>);
  } else if (obj.type === "Polygon" || obj.type === "MultiPolygon") {
    features.push({ type: "Feature", properties: {}, geometry: obj as AreaGeometry });
  } else {
    return { error: "We couldn't find any fields in that file. It should contain polygons." };
  }

  const blocks: UploadedBlock[] = [];
  for (const [i, f] of features.entries()) {
    const g = f?.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
    if (!looksLikeLonLat(g)) {
      return {
        error:
          "The file's coordinates don't look like longitude and latitude. Files in British National Grid (eastings and northings) aren't supported yet.",
      };
    }
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const name = [props.name, props.Name, props.NAME, props.field_name].find(
      (v): v is string => typeof v === "string" && v.trim() !== "",
    );
    blocks.push({ name: name?.trim() ?? `Uploaded field ${i + 1}`, geometry: g });
  }

  if (blocks.length === 0) {
    return { error: "We couldn't find any fields in that file. It should contain polygons, not points or lines." };
  }
  return { blocks };
}

function looksLikeLonLat(g: AreaGeometry): boolean {
  const rings = g.type === "Polygon" ? g.coordinates : g.coordinates.flat();
  return rings.every((ring) =>
    ring.every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90),
  );
}
