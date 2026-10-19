import {
  Bird,
  Building,
  Building2,
  CalendarClock,
  Droplet,
  Droplets,
  Flower2,
  Footprints,
  Landmark,
  Layers,
  MapPinOff,
  Receipt,
  Scissors,
  ShieldCheck,
  Sprout,
  TreeDeciduous,
  Trees,
  TriangleAlert,
  Waves,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import type { NotOnThisLand, Payment, ScreenResult } from "@/lib/screen";

// Plain-English names and reasons for each payment. Scheme terms go in `detail`.
// Amounts and eligibility always come from screen_site(); this is wording only.
type Wording = { title: string; detail: string; why(p?: Payment): string };

const tier = (code: string) => code.replace("nature_recovery_", "");

export const paymentWording: Record<string, Wording> = {
  nature_recovery_premium: {
    title: "Nature recovery bonus",
    detail: "EWCO additional contribution: nature recovery, premium tier",
    why: () => "Your land touches an area mapped as a top priority for joining up wildlife habitat.",
  },
  nature_recovery_high: {
    title: "Nature recovery bonus",
    detail: "EWCO additional contribution: nature recovery, high tier",
    why: () => "Your land touches an area mapped as a high priority for joining up wildlife habitat.",
  },
  nature_recovery_lower: {
    title: "Nature recovery bonus",
    detail: "EWCO additional contribution: nature recovery, lower tier",
    why: (p) => `Your land touches an area mapped as a ${tier(p?.code ?? "lower")} priority for joining up wildlife habitat.`,
  },
  flood_risk: {
    title: "Flood reduction bonus",
    detail: "EWCO additional contribution: flood risk management",
    why: () => "Your land touches an area where new woodland could help slow floodwater.",
  },
  water_quality: {
    title: "Cleaner water bonus",
    detail: "EWCO additional contribution: water quality",
    why: () => "Your land touches an area where woodland could help keep farm run-off out of rivers.",
  },
  riparian: {
    title: "Riverside shade bonus",
    detail: "EWCO additional contribution: riparian buffers (Keeping Rivers Cool)",
    why: () => "Part of your land is in a riverside strip where trees would shade the water. Only that part is paid.",
  },
  close_to_settlements: {
    title: "Woodland near towns bonus",
    detail: "EWCO additional contribution: woodlands close to settlements",
    why: () => "Your land is in an area near towns that would benefit from more woodland.",
  },
  recreational_access: {
    title: "Public access bonus",
    detail: "EWCO additional contribution: recreational access",
    why: () => "Your land is near towns and you said you would allow public access on foot for 30 years.",
  },
  low_sensitivity: {
    title: "Lower-risk land payment",
    detail: "EWCO low sensitivity land payment (Low Sensitivity Map v4.0)",
    why: () => "All the land you could plant is mapped as low sensitivity for new woodland.",
  },
  planting_costs: {
    title: "Planting costs covered",
    detail: "EWCO capital items: standard cost items and activities, up to the standard cost cap",
    why: () => "Paid back as you claim for the planting and protection work, up to an average cap per hectare.",
  },
  maintenance: {
    title: "Yearly upkeep payment",
    detail: "EWCO annual maintenance payment",
    why: () => "Paid on all the land you could plant, each year for 15 years, if you look after the trees.",
  },
};

export function wordingFor(code: string): Wording {
  return (
    paymentWording[code] ?? {
      title: code.replaceAll("_", " "),
      detail: "",
      why: () => "",
    }
  );
}

// Map and chart colours: colour-blind-safe Okabe–Ito hues, one per payment
// family, shared by the map's target areas, the payment rows and the money bar.
// The three nature recovery tiers share a hue and differ by fill strength and
// outline (solid / dashed / dotted).
export const paymentColours: Record<string, string> = {
  nature_recovery_premium: "#009E73",
  nature_recovery_high: "#009E73",
  nature_recovery_lower: "#009E73",
  flood_risk: "#0072B2",
  water_quality: "#56B4E9",
  riparian: "#CC79A7",
  close_to_settlements: "#E69F00",
  recreational_access: "#E69F00",
  low_sensitivity: "#F0E442",
  maintenance: "#55605a",
};

export type LineStyle = "solid" | "dashed" | "dotted";

/** Fill strength (25–45%) and outline style per payment's target area. */
export const targetStyle: Record<string, { opacity: number; line: LineStyle }> = {
  nature_recovery_premium: { opacity: 0.45, line: "solid" },
  nature_recovery_high: { opacity: 0.35, line: "dashed" },
  nature_recovery_lower: { opacity: 0.25, line: "dotted" },
};
const DEFAULT_TARGET_STYLE = { opacity: 0.3, line: "solid" as LineStyle };
export function targetStyleFor(code: string | undefined) {
  return (code && targetStyle[code]) || DEFAULT_TARGET_STYLE;
}

/** Everything that can't be planted is one vermillion family, told apart by hatching. */
export const EXCLUSION_COLOUR = "#D55E00";
/** Flags ("worth checking") are a dotted dark outline with no fill. */
export const FLAG_COLOUR = "#1f2421";
/** Land that could be planted. */
export const PLANTABLE_COLOUR = "#7d9a6b";

/** Exclusion code for each exclusion layer (matches rules.ewco_exclusions). */
export const exclusionByLayer: Record<string, string> = {
  sssi: "sssi",
  scheduled_monuments: "scheduled_monument",
  priority_habitat: "priority_habitat",
  peat_status: "deep_peat",
  nfi_woodland: "existing_woodland",
  developed_land: "developed_land",
  open_water: "open_water",
};

/** Flag code for each flag layer (matches rules.ewco_flags). */
export const flagByLayer: Record<string, string> = {
  peat_status: "shallow_peat",
  alc_provisional: "best_farmland",
};

/** Colour for a site_context() group: its top payment, the exclusion colour, or the flag outline. */
export function contextColour(layer: { kind: string; layer_id: string; payments: string[] | null }): string {
  if (layer.kind === "target" && layer.payments?.length) return paymentColours[layer.payments[0]] ?? PLANTABLE_COLOUR;
  if (layer.kind === "exclusion") return EXCLUSION_COLOUR;
  return FLAG_COLOUR;
}

// Icons (Lucide), keyed by payment, exclusion and flag code.
export const paymentIcons: Record<string, LucideIcon> = {
  nature_recovery_premium: Sprout,
  nature_recovery_high: Sprout,
  nature_recovery_lower: Sprout,
  nature_recovery: Sprout,
  flood_risk: Waves,
  water_quality: Droplet,
  riparian: TreeDeciduous,
  close_to_settlements: Building2,
  recreational_access: Footprints,
  low_sensitivity: ShieldCheck,
  maintenance: CalendarClock,
  planting_costs: Receipt,
};

export const exclusionIcons: Record<string, LucideIcon> = {
  sssi: Bird,
  scheduled_monument: Landmark,
  priority_habitat: Flower2,
  deep_peat: Layers,
  existing_woodland: Trees,
  developed_land: Building,
  open_water: Droplets,
  small_piece: Scissors,
  outside_region: MapPinOff,
};

export const flagIcons: Record<string, LucideIcon> = {
  best_farmland: Wheat,
  shallow_peat: Layers,
  large_block: TriangleAlert,
};

export type Status = "qualifies" | "partly" | "none" | "issue";

export const statusLabel: Record<Status, string> = {
  qualifies: "Qualifies",
  partly: "Partly",
  none: "Not this land",
  issue: "Left out",
};

/**
 * Tag for a payment: "Qualifies" when at least 99% of the plantable land is
 * inside its target area (upkeep and costs always qualify), otherwise
 * "Partly" (it touches, but less is inside, so a range applies).
 */
export function paymentStatus(qualification: Payment["qualification"], insideHa: number, eligibleHa: number): Status {
  if (qualification === "eligible_area" || qualification === "whole_site_inside") return "qualifies";
  return eligibleHa > 0 && insideHa >= 0.99 * eligibleHa ? "qualifies" : "partly";
}

/** Why a map-based bonus checked by screen_site() doesn't apply to this land. */
export function notHereReason(item: NotOnThisLand): string {
  if (item.reason === "needs_prerequisite") {
    const name = item.requires_code ? wordingFor(item.requires_code).title.toLowerCase() : "another bonus";
    return `Only paid where the ${name} applies, and that doesn't reach your land.`;
  }
  if (item.reason === "not_whole_site_inside") {
    return "Paid only when all the land you could plant is in a lower-risk area, and some of yours isn't.";
  }
  if (item.code === "riparian") return "None of the land you could plant is in a riverside shade strip.";
  return `The land you could plant doesn't touch ${targetPhrase[item.codes[0]] ?? "its target area"}.`;
}

// Plain phrase for "the target area" of each payment, used in sentences.
export const targetPhrase: Record<string, string> = {
  nature_recovery_premium: "a top-priority area for joining up wildlife habitat",
  nature_recovery_high: "a high-priority area for joining up wildlife habitat",
  nature_recovery_lower: "a priority area for joining up wildlife habitat",
  flood_risk: "a flood reduction target area",
  water_quality: "a cleaner water target area",
  riparian: "a riverside shade strip",
  close_to_settlements: "an area near towns that needs more woodland",
  recreational_access: "an area near towns that needs more woodland",
  low_sensitivity: "a low-sensitivity area for new woodland",
};

const shortName: Record<string, string> = {
  nature_recovery_premium: "nature recovery",
  nature_recovery_high: "nature recovery",
  nature_recovery_lower: "nature recovery",
  flood_risk: "flood reduction",
  water_quality: "cleaner water",
  riparian: "riverside shade",
  close_to_settlements: "woodland near towns",
  recreational_access: "public access",
  low_sensitivity: "lower-risk land",
};

function listJoin(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function ha1(n: number): string {
  return `${n.toLocaleString("en-GB", { maximumFractionDigits: n < 10 ? 1 : 0 })} ha`;
}

/**
 * One or two plain sentences built only from screen_site()'s numbers:
 * which payments apply and the main reasons (how much land is inside each
 * target area, and what was left out).
 */
// How each exclusion reads in the summary (keyed by exclusion code):
// `because` when it is the only reason, `mainly` when there are several.
export const leftOutPhrase: Record<string, { because: string; mainly: string }> = {
  sssi: { because: "it is in an SSSI", mainly: "land in an SSSI" },
  scheduled_monument: {
    because: "it is a Scheduled Monument or within 20 m of one",
    mainly: "a Scheduled Monument and the 20 m around it",
  },
  priority_habitat: { because: "it is priority habitat", mainly: "priority habitat" },
  deep_peat: { because: "it is on deep peat", mainly: "deep peat" },
  existing_woodland: { because: "it is already woodland", mainly: "existing woodland" },
  developed_land: {
    because: "it is developed land (buildings, gardens or solar farms)",
    mainly: "developed land (buildings, gardens and solar farms)",
  },
  open_water: { because: "it is open water", mainly: "open water" },
  small_piece: {
    because: "it is in separate pieces under 0.1 ha, the smallest a planting area can be",
    mainly: "separate pieces under 0.1 ha",
  },
  outside_region: {
    because: "it is outside the area we cover",
    mainly: "land outside the area we cover",
  },
};

export function plainSummary(result: ScreenResult): string {
  const { summary } = result;
  const removed = new Map<string, number>();
  for (const b of result.blocks) for (const r of b.removed) removed.set(r.code, (removed.get(r.code) ?? 0) + r.ha);
  const leftOut = [...removed].sort((a, b) => b[1] - a[1]);
  const leftOutTotal = leftOut.reduce((s, [, ha]) => s + ha, 0);
  const top = leftOut[0]?.[0];
  const phrase = top ? leftOutPhrase[top] : undefined;
  const leftOutText =
    leftOutTotal < 0.01 || !top
      ? ""
      : leftOut.length > 1
        ? `${ha1(leftOutTotal)} is left out, mainly ${phrase?.mainly ?? top.replaceAll("_", " ")}.`
        : `${ha1(leftOutTotal)} is left out because ${phrase?.because ?? `of ${top.replaceAll("_", " ")}`}.`;

  if (!summary.meets_site_minimum) {
    const could =
      summary.eligible_ha < 0.05
        ? `None of the ${ha1(summary.drawn_ha)} you drew could be planted.`
        : `Only ${ha1(summary.eligible_ha)} of the ${ha1(summary.drawn_ha)} you drew could be planted, which is under the 1 ha minimum.`;
    return `${could} ${leftOutText}`.trim();
  }

  // Combine blocks: per payment, total paid-on and inside area.
  const per = new Map<string, { inside: number; ha: number; amount: number }>();
  for (const b of result.blocks)
    for (const p of b.payments.filter((x) => x.kind === "one_off")) {
      const cur = per.get(p.code) ?? { inside: 0, ha: 0, amount: 0 };
      per.set(p.code, { inside: cur.inside + p.inside_ha, ha: cur.ha + p.ha, amount: cur.amount + p.amount_gbp });
    }
  const ranked = [...per].sort((a, b) => b[1].amount - a[1].amount);
  const names = [...new Set(ranked.map(([code]) => shortName[code] ?? code))];
  const hasUpkeep = result.income.annual_maintenance.per_year_gbp > 0;

  if (ranked.length === 0) {
    return `${ha1(summary.eligible_ha)} could be planted. It doesn't touch any bonus target area${hasUpkeep ? ", but would get planting costs and yearly upkeep" : ""}. ${leftOutText}`.trim();
  }

  const first = `${ha1(summary.eligible_ha)} could be planted and earn bonuses for ${listJoin(names)}${hasUpkeep ? ", plus yearly upkeep" : ""}.`;
  const reasons = ranked
    .filter(([code]) => code !== "low_sensitivity")
    .slice(0, 2)
    .map(([code, v]) => {
      const pct = v.ha > 0 ? Math.round((100 * v.inside) / summary.eligible_ha) : 0;
      const phrase = targetPhrase[code] ?? "its target area";
      if (pct >= 99) return `all of it lies in ${phrase}`;
      if (v.inside < 0.05) return `it only just touches ${phrase}`;
      return `${ha1(v.inside)} (${pct}%) lies in ${phrase}`;
    });
  const second = reasons.length ? `${reasons[0][0].toUpperCase()}${reasons[0].slice(1)}${reasons[1] ? `, and ${reasons[1]}` : ""}.` : "";
  return [first, second, leftOutText].filter(Boolean).join(" ");
}

const tierLabel: Record<string, string> = {
  nature_recovery_premium: "top priority",
  nature_recovery_high: "high priority",
  nature_recovery_lower: "lower priority",
};

/** Plain label for a map layer: target areas are named after their payments, like the cards. */
export function contextLabel(layer: { kind: string; label: string; payments: string[] | null }): string {
  if (layer.kind !== "target" || !layer.payments?.length) return layer.label;
  const names = [...new Set(layer.payments.map((code) => wordingFor(code).title.replace(/ (bonus|payment)$/, "")))];
  const tier = tierLabel[layer.payments[0]];
  return `${names.join(" / ")} area${tier ? ` (${tier})` : ""}`;
}
