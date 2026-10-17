"use client";

import { Map as MapLibreMap, NavigationControl, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRenderMode, TerraDrawSelectMode } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import pointOnFeature from "@turf/point-on-feature";
import { areaHa } from "@/lib/geo";
import { hectares } from "@/lib/format";
import { MousePointer2, PenLine, Satellite, SquareDashedMousePointer } from "lucide-react";
import { cn } from "@/lib/utils";
import { addRegionOutline, addSatellite, BASEMAP_STYLE, boundsOf, configureMapLibre, setSatellite, START_VIEW } from "@/lib/map";
import { addHatchImages, patternId } from "@/lib/patterns";
import type { ScreenResult, SiteContext } from "@/lib/screen";
import {
  contextColour,
  EXCLUSION_COLOUR,
  FLAG_COLOUR,
  paymentColours,
  PLANTABLE_COLOUR,
  targetStyleFor,
  exclusionByLayer,
} from "@/lib/wording";

configureMapLibre();

export type MapBlock = {
  id: string;
  name: string;
  geometry: Polygon | MultiPolygon;
  editable: boolean; // drawn or uploaded Polygon; MultiPolygons are shown but not reshaped
  outside: boolean;
};

export type Tool = "draw" | "edit" | "move";

export type WorkspaceMapHandle = {
  /** Put a polygon into the drawing layer so it can be edited. False if rejected. */
  addPolygon(id: string, geometry: Polygon): boolean;
  clear(): void;
  remove(id: string): void;
  flyTo(lon: number, lat: number): void;
  fitTo(geometries: (Polygon | MultiPolygon)[]): void;
  setTool(tool: Tool): void;
};

type Props = {
  /** Plain prop, not `ref`: next/dynamic does not forward refs. */
  handleRef: RefObject<WorkspaceMapHandle | null>;
  region: FeatureCollection<Polygon | MultiPolygon> | null;
  blocks: MapBlock[];
  /** Called with every finished, editable polygon whenever one is drawn or changed. */
  onPolygonsChange(polygons: { id: string; geometry: Polygon }[]): void;
  result: ScreenResult | null;
  context: SiteContext | null;
  /** Which overlays are on: context layer ids, plus "plantable" and "left-out". */
  shown: Record<string, boolean>;
  /** Payment selected in the panel: its qualifying land is outlined. */
  highlightPayment: string | null;
  /** Index (0-based, same order as `blocks`) of the field selected in the panel. */
  selectedBlock: number | null;
  onBlockClick(index: number): void;
};

const INK = "#1f2421";
// Ochre glow marks the selected field on both the light basemap and the aerial photo.
const OCHRE = "#d9a520";
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

export function WorkspaceMap({
  handleRef,
  region,
  blocks,
  onPolygonsChange,
  result,
  context,
  shown,
  highlightPayment,
  selectedBlock,
  onBlockClick,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const onChangeRef = useRef(onPolygonsChange);
  const onClickRef = useRef(onBlockClick);
  const toolRef = useRef<Tool>("draw");
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>("draw");
  const [satellite, setSatelliteOn] = useState(false);
  const [liveHa, setLiveHa] = useState<number | null>(null);

  useEffect(() => {
    onChangeRef.current = onPolygonsChange;
    onClickRef.current = onBlockClick;
  }, [onPolygonsChange, onBlockClick]);
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  // Create the map, overlay layers and drawing tools once.
  useEffect(() => {
    if (!container.current) return;
    const map = new MapLibreMap({
      container: container.current,
      style: BASEMAP_STYLE,
      center: START_VIEW.center,
      zoom: START_VIEW.zoom,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.getCanvas().setAttribute("aria-label", "Map of your land. The panel lists the same information as text.");
    mapRef.current = map;

    map.on("load", () => {
      // Phones: start the credits closed (just the ⓘ button) so they don't run under the map key.
      if (map.getContainer().clientWidth < 1024) {
        const attrib = map.getContainer().querySelector("details.maplibregl-ctrl-attrib");
        attrib?.removeAttribute("open");
        attrib?.classList.remove("maplibregl-compact-show");
      }
      addSatellite(map);
      for (const id of ["context", "removed", "eligible", "qualifying", "blocks", "block-labels"]) {
        map.addSource(id, { type: "geojson", data: EMPTY });
      }
      addHatchImages(map);
      // Layer toggles: target areas, exclusions and flags near the land. Each
      // layer is filtered to the ids switched on (see the effect below).
      const none = ["in", ["get", "id"], ["literal", []]] as never;
      map.addLayer({
        id: "context-target-fill",
        type: "fill",
        source: "context",
        filter: none,
        paint: { "fill-color": ["get", "colour"], "fill-opacity": ["get", "opacity"] },
      });
      // Nature recovery tiers share a hue: solid, dashed and dotted outlines tell them apart.
      for (const [line, dash] of [["solid", null], ["dashed", [4, 2]], ["dotted", [1, 1.6]]] as const) {
        map.addLayer({
          id: `context-target-line-${line}`,
          type: "line",
          source: "context",
          filter: none,
          paint: { "line-color": ["get", "colour"], "line-width": 1.6, ...(dash ? { "line-dasharray": [...dash] } : {}) },
        });
      }
      // Can't plant: one vermillion family, told apart by hatching.
      map.addLayer({
        id: "context-exclusion-fill",
        type: "fill",
        source: "context",
        filter: none,
        paint: { "fill-color": EXCLUSION_COLOUR, "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "context-exclusion-hatch",
        type: "fill",
        source: "context",
        filter: none,
        paint: { "fill-pattern": ["get", "pattern"], "fill-opacity": 0.8 },
      });
      map.addLayer({
        id: "context-exclusion-line",
        type: "line",
        source: "context",
        filter: none,
        paint: { "line-color": EXCLUSION_COLOUR, "line-width": 1 },
      });
      // Worth checking: dotted dark outline, no fill.
      map.addLayer({
        id: "context-flag-line",
        type: "line",
        source: "context",
        filter: none,
        paint: { "line-color": FLAG_COLOUR, "line-width": 1.6, "line-dasharray": [1, 1.6] },
      });
      // Result: what was left out (hatched by reason) and what could be planted.
      map.addLayer({
        id: "removed-fill",
        type: "fill",
        source: "removed",
        paint: { "fill-color": EXCLUSION_COLOUR, "fill-opacity": 0.25 },
      });
      map.addLayer({
        id: "removed-hatch",
        type: "fill",
        source: "removed",
        paint: { "fill-pattern": ["get", "pattern"], "fill-opacity": 0.9 },
      });
      map.addLayer({
        id: "eligible-fill",
        type: "fill",
        source: "eligible",
        paint: { "fill-color": PLANTABLE_COLOUR, "fill-opacity": 0.4 },
      });
      // The part of the land that qualifies for the selected payment.
      map.addLayer({
        id: "qualifying-fill",
        type: "fill",
        source: "qualifying",
        paint: { "fill-color": ["get", "colour"], "fill-opacity": 0.55 },
      });
      map.addLayer({
        id: "qualifying-line",
        type: "line",
        source: "qualifying",
        paint: { "line-color": INK, "line-width": 2.5, "line-dasharray": [2, 1] },
      });
      // Fields: invisible hit area for clicks, multi-part uploads, outlines, selection.
      map.addLayer({ id: "blocks-hit", type: "fill", source: "blocks", paint: { "fill-color": "#000", "fill-opacity": 0 } });
      map.addLayer({
        id: "blocks-fill",
        type: "fill",
        source: "blocks",
        filter: ["==", ["get", "editable"], false],
        paint: { "fill-color": PLANTABLE_COLOUR, "fill-opacity": 0.25 },
      });
      // Selected field: an ochre glow under a 5 px outline.
      map.addLayer({
        id: "blocks-selected-glow",
        type: "line",
        source: "blocks",
        filter: ["==", ["get", "selected"], true],
        paint: { "line-color": OCHRE, "line-width": 12, "line-blur": 4, "line-opacity": 0.85 },
      });
      // Every field: a bold 3 px ink outline on a white halo, readable on any background.
      map.addLayer({
        id: "blocks-halo",
        type: "line",
        source: "blocks",
        paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "blocks-line",
        type: "line",
        source: "blocks",
        paint: { "line-color": INK, "line-width": ["case", ["==", ["get", "selected"], true], 5, 3] },
      });
      map.addLayer({
        id: "blocks-outside",
        type: "line",
        source: "blocks",
        filter: ["==", ["get", "outside"], true],
        paint: { "line-color": EXCLUSION_COLOUR, "line-width": 4, "line-dasharray": [2, 1] },
      });
      // Labels from one point per field: polygon labels repeat in every tile they cross.
      map.addLayer({
        id: "blocks-label",
        type: "symbol",
        source: "block-labels",
        layout: {
          "text-field": ["concat", ["get", "name"], "\n", ["get", "area"]],
          "text-size": 13,
          "text-font": ["Noto Sans Bold"],
        },
        paint: { "text-color": INK, "text-halo-color": "#ffffff", "text-halo-width": 2 },
      });

      map.on("click", "blocks-hit", (e: MapLayerMouseEvent) => {
        if (toolRef.current === "draw") return;
        const index = e.features?.[0]?.properties?.index;
        if (typeof index === "number") onClickRef.current(index);
      });
      map.on("mouseenter", "blocks-hit", () => {
        if (toolRef.current === "move") map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "blocks-hit", () => {
        if (toolRef.current === "move") map.getCanvas().style.cursor = "";
      });

      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawPolygonMode({
            styles: {
              fillColor: PLANTABLE_COLOUR,
              fillOpacity: 0.25,
              outlineColor: INK,
              outlineWidth: 3,
              closingPointColor: OCHRE,
              closingPointOutlineColor: "#ffffff",
            },
          }),
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: true,
                  coordinates: { midpoints: true, draggable: true, deletable: true },
                },
              },
            },
            styles: {
              selectedPolygonColor: PLANTABLE_COLOUR,
              selectedPolygonOutlineColor: INK,
              selectedPolygonOutlineWidth: 4,
              selectionPointColor: OCHRE,
              selectionPointOutlineColor: "#ffffff",
              midPointColor: "#ffffff",
              midPointOutlineColor: INK,
            },
          }),
          new TerraDrawRenderMode({ modeName: "static", styles: {} }),
        ],
      });
      draw.start();
      draw.setMode("polygon");

      const emit = () => {
        const all = draw.getSnapshot();
        const drawing = all.find((f) => f.properties.currentlyDrawing && f.geometry.type === "Polygon");
        setLiveHa(drawing ? areaHa(drawing.geometry as Polygon) : null);
        onChangeRef.current(
          all
            .filter((f) => f.geometry.type === "Polygon" && !f.properties.currentlyDrawing)
            .map((f) => ({ id: String(f.id), geometry: f.geometry as Polygon })),
        );
      };
      draw.on("change", emit);
      drawRef.current = draw;
      setReady(true);
    });

    // The panel layout changes size (desktop split, phone sheet): keep the canvas in step.
    const resize = new ResizeObserver(() => map.resize());
    resize.observe(container.current);

    return () => {
      resize.disconnect();
      drawRef.current?.stop();
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Region outline: shade outside, and zoom to it unless fields are already shown
  // (the outline can arrive after an upload has zoomed to the fields).
  const hasBlocks = useRef(false);
  useEffect(() => {
    hasBlocks.current = blocks.length > 0;
  }, [blocks]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !region || map.getSource("region")) return;
    addRegionOutline(map, region);
    if (!hasBlocks.current) map.fitBounds(boundsOf(region), { padding: 20, duration: 0 });
  }, [ready, region]);

  // Fields: labels, hit areas, multi-part uploads, outside warnings, selection.
  useEffect(() => {
    const source = mapRef.current?.getSource("blocks") as GeoJSONSource | undefined;
    const labels = mapRef.current?.getSource("block-labels") as GeoJSONSource | undefined;
    if (!ready || !source || !labels) return;
    labels.setData({
      type: "FeatureCollection",
      features: blocks.map((b) => {
        const point = pointOnFeature({ type: "Feature", properties: {}, geometry: b.geometry });
        return { ...point, properties: { name: b.name, area: hectares(areaHa(b.geometry)) } };
      }),
    });
    source.setData({
      type: "FeatureCollection",
      features: blocks.map(
        (b, index): Feature => ({
          type: "Feature",
          properties: {
            index,
            name: b.name,
            area: hectares(areaHa(b.geometry)),
            editable: b.editable,
            outside: b.outside,
            selected: index === selectedBlock,
          },
          geometry: b.geometry,
        }),
      ),
    });
  }, [ready, blocks, selectedBlock]);

  // Result overlays.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const eligible: Feature[] = [];
    const removed: Feature[] = [];
    for (const b of result?.blocks ?? []) {
      if (b.geometry.eligible) eligible.push({ type: "Feature", properties: {}, geometry: b.geometry.eligible });
      for (const r of b.geometry.removed) {
        removed.push({ ...r, properties: { ...r.properties, pattern: patternId(r.properties.code) } });
      }
    }
    (map.getSource("eligible") as GeoJSONSource).setData({ type: "FeatureCollection", features: eligible });
    (map.getSource("removed") as GeoJSONSource).setData({ type: "FeatureCollection", features: removed });
  }, [ready, result]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setLayoutProperty("eligible-fill", "visibility", shown["plantable"] === false ? "none" : "visible");
    for (const id of ["removed-fill", "removed-hatch"]) {
      map.setLayoutProperty(id, "visibility", shown["left-out"] === false ? "none" : "visible");
    }
  }, [ready, shown]);

  // Context layers near the land, filtered to the ones switched on.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const features: Feature[] = (context?.layers ?? [])
      .filter((l) => l.geometry)
      .map((l) => {
        const style = targetStyleFor(l.payments?.[0]);
        return {
          type: "Feature",
          properties: {
            id: l.id,
            colour: contextColour(l),
            opacity: style.opacity,
            pattern: patternId(exclusionByLayer[l.layer_id] ?? ""),
          },
          geometry: l.geometry!,
        };
      });
    (map.getSource("context") as GeoJSONSource).setData({ type: "FeatureCollection", features });
  }, [ready, context]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const on = new Set(Object.entries(shown).filter(([id, v]) => v && id.includes(":")).map(([id]) => id));
    const ids = (pick: (l: SiteContext["layers"][number]) => boolean) => [
      "in",
      ["get", "id"],
      ["literal", (context?.layers ?? []).filter((l) => on.has(l.id) && pick(l)).map((l) => l.id)],
    ] as never;
    const target = (line: string) => (l: SiteContext["layers"][number]) =>
      l.kind === "target" && targetStyleFor(l.payments?.[0]).line === line;
    map.setFilter("context-target-fill", ids((l) => l.kind === "target"));
    for (const line of ["solid", "dashed", "dotted"]) map.setFilter(`context-target-line-${line}`, ids(target(line)));
    for (const id of ["context-exclusion-fill", "context-exclusion-hatch", "context-exclusion-line"]) {
      map.setFilter(id, ids((l) => l.kind === "exclusion"));
    }
    map.setFilter("context-flag-line", ids((l) => l.kind === "flag"));
  }, [ready, shown, context]);

  // Qualifying land for the selected payment, across all fields.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const features: Feature[] = [];
    if (highlightPayment) {
      for (const b of result?.blocks ?? []) {
        for (const p of b.payments) {
          if (p.code !== highlightPayment) continue;
          // When the whole field qualifies the result omits a duplicate shape: use the field's.
          const geometry = p.qualifying_is_whole_field ? b.geometry.eligible : p.qualifying_geometry;
          if (geometry) {
            features.push({ type: "Feature", properties: { colour: paymentColours[p.code] ?? PLANTABLE_COLOUR }, geometry });
          }
        }
      }
    }
    (map.getSource("qualifying") as GeoJSONSource).setData({ type: "FeatureCollection", features });
  }, [ready, result, highlightPayment]);

  useEffect(() => {
    const draw = drawRef.current;
    if (!ready || !draw) return;
    draw.setMode(tool === "draw" ? "polygon" : tool === "edit" ? "select" : "static");
  }, [ready, tool]);

  useEffect(() => {
    if (ready && mapRef.current) setSatellite(mapRef.current, satellite);
  }, [ready, satellite]);

  useImperativeHandle(handleRef, () => ({
    addPolygon(id, geometry) {
      const draw = drawRef.current;
      if (!draw) return false;
      const [check] = draw.addFeatures([{ id, type: "Feature", geometry, properties: { mode: "polygon" } }]);
      if (!check?.valid) console.warn("Drawing tool rejected uploaded field:", check?.reason);
      return Boolean(check?.valid);
    },
    clear() {
      drawRef.current?.clear();
    },
    remove(id) {
      const draw = drawRef.current;
      if (draw?.hasFeature(id)) draw.removeFeatures([id]);
    },
    flyTo(lon, lat) {
      mapRef.current?.flyTo({ center: [lon, lat], zoom: 15 });
    },
    fitTo(geometries) {
      const map = mapRef.current;
      if (!map || geometries.length === 0) return;
      const fc: FeatureCollection<Polygon | MultiPolygon> = {
        type: "FeatureCollection",
        features: geometries.map((geometry) => ({ type: "Feature", properties: {}, geometry })),
      };
      map.fitBounds(boundsOf(fc), { padding: 60, maxZoom: 16 });
    },
    setTool(next) {
      setTool(next);
    },
  }));

  const tools: { value: Tool; label: string; hint: string; Icon: typeof PenLine }[] = [
    { value: "draw", label: "Draw", hint: "Draw a field: click each corner, then click the first point (or press Enter) to finish. Escape cancels.", Icon: PenLine },
    { value: "edit", label: "Edit", hint: "Edit fields: click a field, then drag its corners or the whole shape.", Icon: SquareDashedMousePointer },
    { value: "move", label: "Select", hint: "Select: pan and zoom, and click a field to see its breakdown.", Icon: MousePointer2 },
  ];

  return (
    <div className="relative h-full w-full">
      {/* Sized explicitly: MapLibre's stylesheet sets the container to position: relative. */}
      <div ref={container} className="h-full w-full bg-moss-tint" />
      {/* Right padding keeps the toolbar clear of the zoom buttons. */}
      <div className="pointer-events-none absolute top-3 right-14 left-3 flex flex-wrap items-start gap-2">
        <div
          className="pointer-events-auto flex rounded-lg border border-line bg-white p-1 shadow-sm"
          role="toolbar"
          aria-label="Map tools"
        >
          {tools.map(({ value, label, hint, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTool(value)}
              aria-pressed={tool === value}
              title={hint}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold coarse:h-11 lg:gap-2 lg:px-3",
                tool === value ? "bg-moss text-white" : "text-ink hover:bg-moss-tint",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
              <span className="sr-only"> tool</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSatelliteOn((on) => !on)}
          aria-pressed={satellite}
          title="Aerial photo"
          className={cn(
            "pointer-events-auto flex h-11 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold shadow-sm coarse:h-[52px]",
            satellite ? "bg-moss text-white" : "bg-white text-ink hover:bg-moss-tint",
          )}
        >
          <Satellite aria-hidden="true" className="size-4" />
          <span className="max-lg:sr-only">Aerial</span>
          <span className="sr-only lg:hidden"> photo</span>
        </button>
        <p
          className="w-full max-w-md rounded-md bg-white/95 px-3 py-1 text-xs text-ink shadow-sm"
          aria-live="polite"
        >
          {tool === "draw" &&
            (liveHa !== null
              ? `Drawing: ${hectares(liveHa)}. Click the first point or press Enter to finish.`
              : "Click each corner of a field. Click the first point or press Enter to finish.")}
          {tool === "edit" && "Click a field, then drag its corners. Select a corner and press Delete to remove it."}
          {tool === "move" && "Drag to move the map. Click a field to see its breakdown."}
        </p>
      </div>
    </div>
  );
}
