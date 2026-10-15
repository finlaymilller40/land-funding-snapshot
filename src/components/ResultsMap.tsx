"use client";

import { Map as MapLibreMap, NavigationControl } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useRef } from "react";
import type { BlockResult } from "@/lib/screen";
import { BASEMAP_STYLE, boundsOf, configureMapLibre } from "@/lib/map";
import { removalColours } from "@/lib/wording";

configureMapLibre();

type Props = { blocks: BlockResult[]; drawn: { name: string; geometry: Polygon | MultiPolygon }[] };

export function ResultsMap({ blocks, drawn }: Props) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current || drawn.length === 0) return;
    const outline: FeatureCollection<Polygon | MultiPolygon> = {
      type: "FeatureCollection",
      features: drawn.map((d) => ({ type: "Feature", properties: { name: d.name }, geometry: d.geometry })),
    };
    const eligible: FeatureCollection = {
      type: "FeatureCollection",
      features: blocks.flatMap((b) =>
        b.geometry.eligible ? [{ type: "Feature" as const, properties: {}, geometry: b.geometry.eligible }] : [],
      ),
    };
    const removed: FeatureCollection = {
      type: "FeatureCollection",
      features: blocks.flatMap((b) => b.geometry.removed),
    };

    const map = new MapLibreMap({
      container: container.current,
      style: BASEMAP_STYLE,
      bounds: boundsOf(outline),
      fitBoundsOptions: { padding: 40, maxZoom: 16 },
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.getCanvas().setAttribute("aria-label", "Map of your fields: green could be planted, other colours are left out. Details are in the table below.");

    map.on("load", () => {
      map.addSource("eligible", { type: "geojson", data: eligible });
      map.addSource("removed", { type: "geojson", data: removed });
      map.addSource("outline", { type: "geojson", data: outline });
      map.addLayer({ id: "eligible", type: "fill", source: "eligible", paint: { "fill-color": "#7d9a6b", "fill-opacity": 0.6 } });
      map.addLayer({
        id: "removed",
        type: "fill",
        source: "removed",
        paint: {
          "fill-color": ["match", ["get", "code"], ...Object.entries(removalColours).flat(), "#b4664a"] as never,
          "fill-opacity": 0.65,
        },
      });
      map.addLayer({ id: "removed-line", type: "line", source: "removed", paint: { "line-color": "#1f2421", "line-width": 1, "line-opacity": 0.6 } });
      map.addLayer({ id: "outline", type: "line", source: "outline", paint: { "line-color": "#1f2421", "line-width": 2.5 } });
      map.addLayer({
        id: "outline-label",
        type: "symbol",
        source: "outline",
        layout: { "text-field": ["get", "name"], "text-size": 13, "text-font": ["Noto Sans Bold"] },
        paint: { "text-color": "#1f2421", "text-halo-color": "#ffffff", "text-halo-width": 2 },
      });
    });
    return () => map.remove();
  }, [blocks, drawn]);

  const reasons = new Map<string, string>();
  for (const b of blocks) for (const r of b.removed) reasons.set(r.code, r.reason);

  return (
    <div>
      <div ref={container} className="h-[50vh] min-h-[300px] w-full overflow-hidden rounded border border-line sm:h-[440px]" />
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Map key">
        <li className="flex items-center gap-2">
          <span className="inline-block h-4 w-6 rounded-sm border border-ink/60" style={{ background: "#7d9a6b" }} />
          Could be planted
        </li>
        {[...reasons].map(([code, reason]) => (
          <li key={code} className="flex items-center gap-2">
            <span className="inline-block h-4 w-6 rounded-sm border border-ink/60" style={{ background: removalColours[code] ?? "#b4664a" }} />
            Left out: {reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
