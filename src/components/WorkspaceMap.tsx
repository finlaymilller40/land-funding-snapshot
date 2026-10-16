"use client";

import { Map as MapLibreMap, NavigationControl, type GeoJSONSource, type MapLayerMouseEvent } from "maplibre-gl";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRenderMode, TerraDrawSelectMode } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import pointOnFeature from "@turf/point-on-feature";
import { areaHa } from "@/lib/geo";
import { hectares } from "@/lib/format";
import { addRegionOutline, addSatellite, BASEMAP_STYLE, boundsOf, configureMapLibre, setSatellite, START_VIEW } from "@/lib/map";
import type { ScreenResult, SiteContext } from "@/lib/screen";
import { contextColour, paymentColours, removalColours } from "@/lib/wording";

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

const SAGE = "#7d9a6b";
const CLAY = "#b4664a";
// Ochre outline stays visible on both the light basemap and the aerial photo.
const EDGE = "#d9a520";
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
      addSatellite(map);
      for (const id of ["context", "removed", "eligible", "qualifying", "blocks", "block-labels"]) {
        map.addSource(id, { type: "geojson", data: EMPTY });
      }
      // Layer toggles: target areas, exclusions and flags near the land.
      map.addLayer({
        id: "context-fill",
        type: "fill",
        source: "context",
        filter: ["in", ["get", "id"], ["literal", []]],
        paint: { "fill-color": ["get", "colour"], "fill-opacity": 0.22 },
      });
      map.addLayer({
        id: "context-line",
        type: "line",
        source: "context",
        filter: ["in", ["get", "id"], ["literal", []]],
        paint: { "line-color": ["get", "colour"], "line-width": 1.2, "line-opacity": 0.9 },
      });
      // Result: what was left out (by reason) and what could be planted.
      map.addLayer({
        id: "removed-fill",
        type: "fill",
        source: "removed",
        paint: { "fill-color": ["get", "colour"], "fill-opacity": 0.6 },
      });
      map.addLayer({
        id: "eligible-fill",
        type: "fill",
        source: "eligible",
        paint: { "fill-color": SAGE, "fill-opacity": 0.5 },
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
        paint: { "line-color": "#1f2421", "line-width": 2.5, "line-dasharray": [2, 1] },
      });
      // Fields: invisible hit area for clicks, multi-part uploads, highlights, labels.
      map.addLayer({ id: "blocks-hit", type: "fill", source: "blocks", paint: { "fill-color": "#000", "fill-opacity": 0 } });
      map.addLayer({
        id: "blocks-fill",
        type: "fill",
        source: "blocks",
        filter: ["==", ["get", "editable"], false],
        paint: { "fill-color": SAGE, "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: "blocks-line",
        type: "line",
        source: "blocks",
        filter: ["==", ["get", "editable"], false],
        paint: { "line-color": EDGE, "line-width": 3 },
      });
      map.addLayer({
        id: "blocks-outside",
        type: "line",
        source: "blocks",
        filter: ["==", ["get", "outside"], true],
        paint: { "line-color": CLAY, "line-width": 4 },
      });
      map.addLayer({
        id: "blocks-selected",
        type: "line",
        source: "blocks",
        filter: ["==", ["get", "selected"], true],
        paint: { "line-color": "#1f2421", "line-width": 4 },
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
        paint: { "text-color": "#1f2421", "text-halo-color": "#ffffff", "text-halo-width": 2 },
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
              fillColor: SAGE,
              fillOpacity: 0.25,
              outlineColor: EDGE,
              outlineWidth: 3,
              closingPointColor: EDGE,
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
            styles: { selectedPolygonColor: SAGE, selectedPolygonOutlineColor: "#1f2421", selectedPolygonOutlineWidth: 3 },
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

  // Region outline: shade outside, zoom to it.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !region || map.getSource("region")) return;
    addRegionOutline(map, region);
    map.fitBounds(boundsOf(region), { padding: 20, duration: 0 });
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
        removed.push({ ...r, properties: { ...r.properties, colour: removalColours[r.properties.code] ?? CLAY } });
      }
    }
    (map.getSource("eligible") as GeoJSONSource).setData({ type: "FeatureCollection", features: eligible });
    (map.getSource("removed") as GeoJSONSource).setData({ type: "FeatureCollection", features: removed });
  }, [ready, result]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setLayoutProperty("eligible-fill", "visibility", shown["plantable"] === false ? "none" : "visible");
    map.setLayoutProperty("removed-fill", "visibility", shown["left-out"] === false ? "none" : "visible");
  }, [ready, shown]);

  // Context layers near the land, filtered to the ones switched on.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const features: Feature[] = (context?.layers ?? [])
      .filter((l) => l.geometry)
      .map((l) => ({
        type: "Feature",
        properties: { id: l.id, colour: contextColour(l) },
        geometry: l.geometry!,
      }));
    (map.getSource("context") as GeoJSONSource).setData({ type: "FeatureCollection", features });
  }, [ready, context]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const on = Object.entries(shown).filter(([id, v]) => v && id.includes(":")).map(([id]) => id);
    const filter = ["in", ["get", "id"], ["literal", on]] as never;
    map.setFilter("context-fill", filter);
    map.setFilter("context-line", filter);
  }, [ready, shown]);

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
            features.push({ type: "Feature", properties: { colour: paymentColours[p.code] ?? SAGE }, geometry });
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

  const toolButton = (value: Tool, label: string, hint: string) => (
    <button
      type="button"
      onClick={() => setTool(value)}
      aria-pressed={tool === value}
      title={hint}
      className={`min-h-11 rounded px-3 py-2 text-sm font-semibold shadow-sm ${
        tool === value ? "bg-moss text-white" : "border border-line bg-white text-ink hover:bg-moss-tint"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="relative h-full w-full">
      {/* Sized explicitly: MapLibre's stylesheet sets the container to position: relative. */}
      <div ref={container} className="h-full w-full bg-moss-tint" />
      {/* Right padding keeps the toolbar clear of the zoom buttons. */}
      <div className="pointer-events-none absolute left-2 right-12 top-2 flex flex-wrap items-start gap-2">
        <div className="pointer-events-auto flex flex-wrap gap-2" role="toolbar" aria-label="Map tools">
          {toolButton("draw", "Draw a field", "Click each corner of the field. Click the first point (or press Enter) to finish; Escape cancels.")}
          {toolButton("edit", "Edit fields", "Click a field, then drag its corners or the whole shape.")}
          {toolButton("move", "Select & move", "Pan and zoom; click a field to see its breakdown.")}
          <label className="flex min-h-11 items-center gap-2 rounded border border-line bg-white px-3 text-sm shadow-sm">
            <input
              type="checkbox"
              checked={satellite}
              onChange={(e) => setSatelliteOn(e.target.checked)}
              className="h-5 w-5 accent-moss"
            />
            Aerial photo
          </label>
        </div>
      </div>
      <p
        className="pointer-events-none absolute bottom-8 left-2 max-w-[80%] rounded bg-white/90 px-2 py-1 text-sm text-ink shadow-sm"
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
  );
}
