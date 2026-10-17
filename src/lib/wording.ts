import type { Payment, ScreenResult } from "@/lib/screen";
import { hectares } from "@/lib/format";

// Plain-English names and reasons for each payment. Scheme terms go in `detail`.
// Amounts and eligibility always come from screen_site(); this is wording only.
type Wording = { title: string; detail: string; why(p: Payment): string };

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
    why: (p) => `Your land touches an area mapped as a ${tier(p.code)} priority for joining up wildlife habitat.`,
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
    why: (p) => `${hectares(p.ha)} of your land is in a riverside strip where trees would shade the water. Only that part is paid.`,
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

// Colours for the reasons land is left out (fills only, each with a darker outline).
export const removalColours: Record<string, string> = {
  sssi: "#b4664a",
  scheduled_monument: "#8a6f9e",
  priority_habitat: "#c9a227",
  deep_peat: "#6b4f3a",
  existing_woodland: "#5b7f8f",
  developed_land: "#7b7f86",
};

// Colour per payment, shared by the map's target areas, the payment cards and
// the money bar so the three link visually. Earthy, distinguishable hues.
export const paymentColours: Record<string, string> = {
  nature_recovery_premium: "#3f6b35",
  nature_recovery_high: "#5f8a45",
  nature_recovery_lower: "#93b273",
  flood_risk: "#3e78a0",
  water_quality: "#6fa8c4",
  riparian: "#2d6474",
  close_to_settlements: "#c2873a",
  recreational_access: "#9c5f2a",
  low_sensitivity: "#8e86b5",
  maintenance: "#b8ad8c",
};

export const flagColours: Record<string, string> = {
  peat_status: "#7a5a3e",
  alc_provisional: "#d1b04f",
};

/** Exclusion code for each exclusion layer (matches rules.ewco_exclusions). */
const exclusionByLayer: Record<string, string> = {
  sssi: "sssi",
  scheduled_monuments: "scheduled_monument",
  priority_habitat: "priority_habitat",
  peat_status: "deep_peat",
  nfi_woodland: "existing_woodland",
  developed_land: "developed_land",
};

/** Colour for a site_context() group: its top payment, its exclusion, or its flag layer. */
export function contextColour(layer: { kind: string; layer_id: string; payments: string[] | null }): string {
  if (layer.kind === "target" && layer.payments?.length) return paymentColours[layer.payments[0]] ?? "#7d9a6b";
  if (layer.kind === "exclusion") return removalColours[exclusionByLayer[layer.layer_id]] ?? "#b4664a";
  return flagColours[layer.layer_id] ?? "#a08a5a";
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
