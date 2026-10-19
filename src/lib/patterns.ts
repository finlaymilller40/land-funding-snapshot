import type { Map as MapLibreMap } from "maplibre-gl";
import { EXCLUSION_COLOUR } from "@/lib/wording";

// Hatch patterns that tell the exclusions apart (they share one colour).
// The same spec draws the MapLibre `fill-pattern` images and the CSS legend
// swatches, so the key always matches the map.
type Hatch = "forward" | "back" | "cross" | "dots" | "horizontal" | "grid" | "vertical" | "ripple" | "none";

export const exclusionHatch: Record<string, Hatch> = {
  sssi: "forward",
  scheduled_monument: "cross",
  priority_habitat: "dots",
  deep_peat: "horizontal",
  existing_woodland: "back",
  developed_land: "grid",
  open_water: "ripple",
  small_piece: "vertical",
  // Outside the region: tint only; the map already shades everything outside.
  outside_region: "none",
};

const SIZE = 10; // CSS pixels per tile
const RATIO = 2; // drawn at 2x for sharp lines on high-density screens

export function patternId(code: string): string {
  return `hatch-${exclusionHatch[code] ?? "forward"}`;
}

function draw(ctx: CanvasRenderingContext2D, hatch: Hatch) {
  const s = SIZE * RATIO;
  ctx.strokeStyle = EXCLUSION_COLOUR;
  ctx.fillStyle = EXCLUSION_COLOUR;
  ctx.lineWidth = 1.6 * RATIO;
  ctx.lineCap = "square";
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  // Diagonals are drawn three times (offset by a tile) so they join across tiles.
  const forward = () => [-s, 0, s].forEach((o) => line(o, s, o + s, 0));
  const back = () => [-s, 0, s].forEach((o) => line(o, 0, o + s, s));
  if (hatch === "forward") forward();
  if (hatch === "back") back();
  if (hatch === "cross") {
    forward();
    back();
  }
  if (hatch === "horizontal") line(0, s / 2, s, s / 2);
  if (hatch === "vertical") line(s / 2, 0, s / 2, s);
  if (hatch === "ripple") {
    // Staggered short dashes, like ripples on water.
    line(0, s / 4, s / 2, s / 4);
    line(s / 2, (3 * s) / 4, s, (3 * s) / 4);
  }
  if (hatch === "grid") {
    line(0, s / 2, s, s / 2);
    line(s / 2, 0, s / 2, s);
  }
  if (hatch === "dots") {
    ctx.beginPath();
    ctx.arc(s / 4, s / 4, 1.6 * RATIO, 0, 2 * Math.PI);
    ctx.arc((3 * s) / 4, (3 * s) / 4, 1.6 * RATIO, 0, 2 * Math.PI);
    ctx.fill();
  }
}

/** Register every hatch as a MapLibre image (call once the style has loaded). */
export function addHatchImages(map: MapLibreMap) {
  for (const hatch of new Set(Object.values(exclusionHatch))) {
    const id = `hatch-${hatch}`;
    if (map.hasImage(id)) continue;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE * RATIO;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    draw(ctx, hatch);
    map.addImage(id, ctx.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: RATIO });
  }
}

/** CSS background for a legend swatch, matching the map pattern. */
export function hatchBackground(code: string): string {
  const c = EXCLUSION_COLOUR;
  const tint = "rgba(213, 94, 0, 0.18)";
  const hatch = exclusionHatch[code] ?? "forward";
  const diag = (deg: number) => `repeating-linear-gradient(${deg}deg, ${c} 0 1.5px, transparent 1.5px 5px)`;
  const layers: Record<Hatch, string> = {
    forward: diag(-45),
    back: diag(45),
    cross: `${diag(-45)}, ${diag(45)}`,
    horizontal: `repeating-linear-gradient(0deg, ${c} 0 1.5px, transparent 1.5px 5px)`,
    vertical: `repeating-linear-gradient(90deg, ${c} 0 1.5px, transparent 1.5px 5px)`,
    grid: `repeating-linear-gradient(0deg, ${c} 0 1.5px, transparent 1.5px 5px), repeating-linear-gradient(90deg, ${c} 0 1.5px, transparent 1.5px 5px)`,
    dots: `radial-gradient(${c} 1.4px, transparent 1.6px) 0 0 / 5px 5px`,
    ripple: `url("data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'><path d='M0 2.5H5M5 7.5H10' stroke='${c}' stroke-width='1.6'/></svg>`,
    )}") 0 0 / 10px 10px`,
    none: "linear-gradient(transparent, transparent)",
  };
  return `${layers[hatch]}, ${tint}`;
}
