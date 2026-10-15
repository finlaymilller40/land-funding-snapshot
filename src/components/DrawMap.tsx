"use client";

import { Map as MapLibreMap, NavigationControl, type GeoJSONSource } from "maplibre-gl";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useEffect, useImperativeHandle, useRef, useState, type RefObject } from "react";
import { TerraDraw, TerraDrawPolygonMode, TerraDrawRenderMode, TerraDrawSelectMode } from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { areaHa } from "@/lib/geo";
import { hectares } from "@/lib/format";
import { addRegionOutline, addSatellite, BASEMAP_STYLE, boundsOf, configureMapLibre, setSatellite, START_VIEW } from "@/lib/map";

configureMapLibre();

export type MapBlock = {
  id: string;
  name: string;
  geometry: Polygon | MultiPolygon;
  editable: boolean; // drawn or uploaded Polygon; MultiPolygons are shown but not reshaped
  outside: boolean;
};

export type DrawMapHandle = {
  /** Put a polygon into the drawing layer so it can be edited. False if rejected. */
  addPolygon(id: string, geometry: Polygon): boolean;
  clear(): void;
  remove(id: string): void;
  flyTo(lon: number, lat: number): void;
  fitTo(geometries: (Polygon | MultiPolygon)[]): void;
};

type Tool = "draw" | "edit" | "move";

type Props = {
  /** Plain prop, not `ref`: next/dynamic does not forward refs. */
  handleRef: RefObject<DrawMapHandle | null>;
  region: FeatureCollection<Polygon | MultiPolygon> | null;
  blocks: MapBlock[];
  /** The map stays mounted between steps; resize it when it is shown again. */
  visible: boolean;
  /** Called with every finished, editable polygon whenever one is drawn or changed. */
  onPolygonsChange(polygons: { id: string; geometry: Polygon }[]): void;
};

const SAGE = "#7d9a6b";
const MOSS = "#2f4a32";
const CLAY = "#b4664a";
// Ochre outline stays visible on both the light basemap and the aerial photo.
const EDGE = "#d9a520";

export function DrawMap({ handleRef, region, blocks, visible, onPolygonsChange }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const onChangeRef = useRef(onPolygonsChange);
  const [ready, setReady] = useState(false);
  const [tool, setTool] = useState<Tool>("draw");
  const [satellite, setSatelliteOn] = useState(false);
  const [liveHa, setLiveHa] = useState<number | null>(null);

  useEffect(() => {
    onChangeRef.current = onPolygonsChange;
  }, [onPolygonsChange]);

  // Create the map and drawing tools once.
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
    map.getCanvas().setAttribute("aria-label", "Map. Use the drawing tools to outline your fields.");
    mapRef.current = map;

    map.on("load", () => {
      addSatellite(map);
      map.addSource("blocks", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      // Uploaded multi-part fields (not editable) and outside-region highlights.
      map.addLayer({
        id: "blocks-fill",
        type: "fill",
        source: "blocks",
        filter: ["==", ["get", "editable"], false],
        paint: { "fill-color": SAGE, "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: "blocks-outside",
        type: "line",
        source: "blocks",
        filter: ["==", ["get", "outside"], true],
        paint: { "line-color": CLAY, "line-width": 4 },
      });
      map.addLayer({
        id: "blocks-line",
        type: "line",
        source: "blocks",
        filter: ["==", ["get", "editable"], false],
        paint: { "line-color": EDGE, "line-width": 3 },
      });
      map.addLayer({
        id: "blocks-label",
        type: "symbol",
        source: "blocks",
        layout: {
          "text-field": ["concat", ["get", "name"], "\n", ["get", "area"]],
          "text-size": 13,
          "text-font": ["Noto Sans Bold"],
        },
        paint: { "text-color": "#1f2421", "text-halo-color": "#ffffff", "text-halo-width": 2 },
      });

      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new TerraDrawPolygonMode({
            styles: {
              fillColor: SAGE,
              fillOpacity: 0.35,
              outlineColor: EDGE,
              outlineWidth: 3,
              closingPointColor: MOSS,
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

    return () => {
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

  // Labels and non-editable fields.
  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("blocks") as GeoJSONSource | undefined;
    if (!ready || !source) return;
    const data: FeatureCollection = {
      type: "FeatureCollection",
      features: blocks.map(
        (b): Feature => ({
          type: "Feature",
          properties: { name: b.name, area: hectares(areaHa(b.geometry)), editable: b.editable, outside: b.outside },
          geometry: b.geometry,
        }),
      ),
    };
    source.setData(data);
  }, [ready, blocks]);

  useEffect(() => {
    const draw = drawRef.current;
    if (!ready || !draw) return;
    draw.setMode(tool === "draw" ? "polygon" : tool === "edit" ? "select" : "static");
  }, [ready, tool]);

  useEffect(() => {
    if (ready && mapRef.current) setSatellite(mapRef.current, satellite);
  }, [ready, satellite]);

  useEffect(() => {
    if (visible) mapRef.current?.resize();
  }, [visible]);

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
      map.fitBounds(boundsOf(fc), { padding: 40, maxZoom: 16 });
    },
  }));

  const toolButton = (value: Tool, label: string, hint: string) => (
    <button
      type="button"
      onClick={() => setTool(value)}
      aria-pressed={tool === value}
      title={hint}
      className={`min-h-11 rounded px-3 py-2 text-sm font-semibold ${
        tool === value ? "bg-moss text-white" : "border border-line bg-white text-ink hover:bg-moss-tint"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Map tools">
        {toolButton("draw", "Draw a field", "Click each corner of the field. Click the first point (or press Enter) to finish; Escape cancels.")}
        {toolButton("edit", "Edit fields", "Click a field, then drag its corners or the whole shape.")}
        {toolButton("move", "Move map", "Pan and zoom without drawing.")}
        <label className="ml-auto flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={satellite}
            onChange={(e) => setSatelliteOn(e.target.checked)}
            className="h-5 w-5 accent-moss"
          />
          Aerial photo
        </label>
      </div>
      <p className="mt-2 text-sm text-muted" aria-live="polite">
        {tool === "draw" &&
          (liveHa !== null
            ? `Drawing: ${hectares(liveHa)}. Click the first point or press Enter to finish.`
            : "Click each corner of a field on the map. Click the first point or press Enter to finish.")}
        {tool === "edit" && "Click a field to select it, then drag its corners. Click a corner and press Delete to remove it."}
        {tool === "move" && "Drag to move the map. Drawing is paused."}
      </p>
      <div
        ref={container}
        className="mt-2 h-[60vh] min-h-[320px] w-full overflow-hidden rounded border border-line bg-moss-tint sm:h-[520px]"
      />
    </div>
  );
}
