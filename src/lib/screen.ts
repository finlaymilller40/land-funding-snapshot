import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import { supabase } from "@/lib/supabase";

// Shape of public.screen_site()'s JSON result.
export type Payment = {
  code: string;
  name: string;
  kind: "one_off" | "annual";
  rate_gbp: number;
  unit: string;
  qualification: "touches" | "area_inside" | "whole_site_inside" | "eligible_area";
  layer_id: string | null;
  basis: string;
  ha: number;
  /** Plantable land actually inside the target area. */
  inside_ha: number;
  inside_pct: number | null;
  amount_gbp: number;
  /** Paid only on the land inside the target area. */
  low_amount_gbp: number;
  years: number | null;
  total_gbp: number;
  condition: string;
  /** True when (almost) the whole field is inside the target area; then the shape below is omitted. */
  qualifying_is_whole_field: boolean;
  qualifying_geometry: Polygon | MultiPolygon | null;
};

export type CostCovered = {
  code: string;
  name: string;
  rate_gbp: number;
  unit: string;
  ha: number;
  up_to_gbp: number;
  condition: string;
};

export type Removal = { code: string; reason: string; ha: number; explanation: string };
export type Flag = { code: string; label?: string; ha?: number; explanation: string };
export type NotApplied = { code: string; payment: string; reason: string; would_be_gbp: number; would_be_low_gbp: number };

/** A map-based bonus screen_site() checked that doesn't apply to this land. */
export type NotOnThisLand = {
  /** Rate code, or the group code (nature_recovery) when listed as a group. */
  code: string;
  name: string;
  codes: string[];
  rate_low_gbp: number;
  rate_high_gbp: number;
  unit: string;
  layer_id: string;
  reason: "outside_area" | "not_whole_site_inside" | "needs_prerequisite";
  requires_code?: string | null;
  requires_name?: string | null;
};

/** One line of the "How EWCO pays you" explainer, or the compartment rule. */
export type HowPaidLine = { code: string; label: string | null; text: string; source_url: string };

/** One checklist line, with the gov.uk section it comes from. */
export type SourcedItem = { text: string; source_section: string; source_url: string };

/** What a payment entails (rules.payment_details and rules.payment_items). */
export type PaymentDetail = {
  benefit: string;
  paid_when: string;
  source_section: string;
  source_url: string;
  date_checked: string;
  what_to_do: SourcedItem[];
  commitments: SourcedItem[];
};

export type BlockResult = {
  block: number;
  name: string;
  drawn_ha: number;
  removed: Removal[];
  removed_ha: number;
  eligible_ha: number;
  meets_block_minimum: boolean;
  is_large: boolean;
  flags: Flag[];
  payments: Payment[];
  costs_covered: CostCovered[];
  not_applied: NotApplied[];
  geometry: {
    eligible: Polygon | MultiPolygon | null;
    removed: Feature<Polygon | MultiPolygon, { code: string; reason: string }>[];
  };
};

export type ScreenResult = {
  summary: {
    blocks: number;
    drawn_ha: number;
    eligible_ha: number;
    meets_site_minimum: boolean;
    public_access: boolean;
    low_sensitivity_whole_site: boolean;
    has_large_block: boolean;
    large_block_ha: number;
  };
  income: {
    one_off: { code: string; name: string; ha: number; inside_ha: number; amount_gbp: number; low_amount_gbp: number }[];
    one_off_total_gbp: number;
    one_off_low_gbp: number;
    annual_maintenance: { ha: number; per_year_gbp: number; years: number | null; total_gbp: number };
    total_income_gbp: number;
    total_income_low_gbp: number;
  };
  costs_covered: { planting_costs_up_to_gbp: number; ha: number; rate_gbp_per_ha: number; condition: string };
  blocks: BlockResult[];
  /** Map-based bonuses checked but not on this land (empty below the site minimum). */
  not_on_this_land: NotOnThisLand[];
  /** Keyed by rate code, for every code paid, covered or held back in the result. */
  payment_details: Record<string, PaymentDetail>;
  /** "How EWCO pays you" lines and the compartment rule (rules.messages, kind how_paid). */
  how_paid: HowPaidLine[];
  site_flags: Flag[];
  next_steps: { code: string; title: string; body: string; source_url: string }[];
  limitations: string[];
  rates_checked: string;
  sources: string[];
};

export type SiteBlock = { name: string; geometry: Polygon | MultiPolygon };

/** One group of shapes from public.site_context(): a payment target area, an exclusion or a flag. */
export type ContextLayer = {
  id: string;
  kind: "target" | "exclusion" | "flag";
  layer_id: string;
  label: string;
  payments: string[] | null;
  geometry: Geometry | null;
};
export type SiteContext = { buffer_m: number; simplified_m: number; layers: ContextLayer[] };

export type FriendlyError = { title: string; detail: string; action: "map" | "retry" };

// Plain-English versions of every error screen_site() raises (see the migration).
const knownErrors: { match: RegExp; error: FriendlyError }[] = [
  {
    match: /outside the area we have data for/,
    error: {
      title: "Most of your land is outside the area we cover",
      detail:
        "This prototype only covers Cambridgeshire and Peterborough. Move your fields inside the dashed green outline. A small part outside is fine: it is just left out.",
      action: "map",
    },
  },
  {
    match: /must not overlap/,
    error: {
      title: "Some of your fields overlap",
      detail: "Each piece of land should only be drawn once. Edit the fields so they don't overlap.",
      action: "map",
    },
  },

  {
    match: /between 1 and .* blocks/,
    error: {
      title: "Too many or too few fields",
      detail: "Draw between 1 and 50 fields.",
      action: "map",
    },
  },
  {
    match: /coordinates must be longitude\/latitude/,
    error: {
      title: "We couldn't read the location of a field",
      detail: "Uploaded files must use longitude and latitude (WGS84). Files in British National Grid aren't supported yet.",
      action: "map",
    },
  },
  {
    match: /Polygon or MultiPolygon|not valid GeoJSON|no area|FeatureCollection/,
    error: {
      title: "One of the fields isn't a valid shape",
      detail: "Each field needs to be an area with at least three corners. Redraw or delete it.",
      action: "map",
    },
  },
];

export function friendlyError(message: string | undefined): FriendlyError {
  // The size limit lives in rules.settings; show whatever the server says it is.
  const limit = message?.match(/larger than the ([\d.,]+) ha limit/);
  if (limit) {
    return {
      title: "That's more land than we can check at once",
      detail: `Please check up to ${Number(limit[1]).toLocaleString("en-GB")} hectares at a time. For a larger holding, check it in parts.`,
      action: "map",
    };
  }
  const known = knownErrors.find((e) => message && e.match.test(message));
  return (
    known?.error ?? {
      title: "Something went wrong on our side",
      detail: "We couldn't work out your estimate just now. Please try again in a moment.",
      action: "retry",
    }
  );
}

function toSite(blocks: SiteBlock[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: blocks.map((b) => ({ type: "Feature", properties: { name: b.name }, geometry: b.geometry })),
  };
}

export async function screenSite(
  blocks: SiteBlock[],
  publicAccess: boolean,
): Promise<{ result: ScreenResult } | { error: FriendlyError }> {
  const site = toSite(blocks);
  try {
    const { data, error } = await supabase.rpc("screen_site", { site, public_access: publicAccess });
    if (error) return { error: friendlyError(error.message) };
    // Older databases (before migrations 20261017130000 and 20261020100000)
    // don't return these: default them so the panel still works without them.
    const result = data as ScreenResult;
    return {
      result: {
        ...result,
        not_on_this_land: result.not_on_this_land ?? [],
        payment_details: result.payment_details ?? {},
        how_paid: result.how_paid ?? [],
      },
    };
  } catch {
    return {
      error: {
        title: "We couldn't reach the server",
        detail: "Check your internet connection and try again.",
        action: "retry",
      },
    };
  }
}

/** Simplified layer shapes near the user's land, for the map's layer toggles. Null if unavailable. */
export async function siteContext(blocks: SiteBlock[]): Promise<SiteContext | null> {
  try {
    const { data, error } = await supabase.rpc("site_context", { site: toSite(blocks) });
    if (error) return null;
    return data as SiteContext;
  } catch {
    return null;
  }
}

export async function regionOutline(): Promise<FeatureCollection<Polygon | MultiPolygon> | null> {
  try {
    const { data, error } = await supabase.rpc("region_outline");
    if (error) return null;
    return data as FeatureCollection<Polygon | MultiPolygon>;
  } catch {
    return null;
  }
}
