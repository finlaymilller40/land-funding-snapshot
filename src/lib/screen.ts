import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { supabase } from "@/lib/supabase";

// Shape of public.screen_site()'s JSON result.
export type Payment = {
  code: string;
  name: string;
  kind: "one_off" | "annual";
  rate_gbp: number;
  unit: string;
  basis: string;
  ha: number;
  amount_gbp: number;
  years: number | null;
  total_gbp: number;
  condition: string;
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
export type NotApplied = { code: string; payment: string; reason: string; would_be_gbp: number };

export type BlockResult = {
  block: number;
  name: string;
  drawn_ha: number;
  removed: Removal[];
  removed_ha: number;
  eligible_ha: number;
  meets_block_minimum: boolean;
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
  };
  income: {
    one_off: { code: string; name: string; ha: number; amount_gbp: number }[];
    one_off_total_gbp: number;
    annual_maintenance: { ha: number; per_year_gbp: number; years: number | null; total_gbp: number };
    total_income_gbp: number;
  };
  costs_covered: { planting_costs_up_to_gbp: number; ha: number; rate_gbp_per_ha: number; condition: string };
  blocks: BlockResult[];
  site_flags: Flag[];
  limitations: string[];
  rates_checked: string;
  sources: string[];
};

export type SiteBlock = { name: string; geometry: Polygon | MultiPolygon };

export type FriendlyError = { title: string; detail: string; action: "map" | "retry" };

// Plain-English versions of every error screen_site() raises (see the migration).
const knownErrors: { match: RegExp; error: FriendlyError }[] = [
  {
    match: /outside the area we have data for/,
    error: {
      title: "Part of your land is outside the area we cover",
      detail: "This prototype only covers Cambridgeshire and Peterborough. Move or delete any field outside the green outline.",
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
    match: /larger than the .* ha limit/,
    error: {
      title: "That's more land than we can check at once",
      detail: "Please check up to 2,000 hectares at a time.",
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
  const known = knownErrors.find((e) => message && e.match.test(message));
  return (
    known?.error ?? {
      title: "Something went wrong on our side",
      detail: "We couldn't work out your estimate just now. Please try again in a moment.",
      action: "retry",
    }
  );
}

export async function screenSite(
  blocks: SiteBlock[],
  publicAccess: boolean,
): Promise<{ result: ScreenResult } | { error: FriendlyError }> {
  const site: FeatureCollection = {
    type: "FeatureCollection",
    features: blocks.map((b) => ({ type: "Feature", properties: { name: b.name }, geometry: b.geometry })),
  };
  try {
    const { data, error } = await supabase.rpc("screen_site", { site, public_access: publicAccess });
    if (error) return { error: friendlyError(error.message) };
    return { result: data as ScreenResult };
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

export async function regionOutline(): Promise<FeatureCollection<Polygon | MultiPolygon> | null> {
  try {
    const { data, error } = await supabase.rpc("region_outline");
    if (error) return null;
    return data as FeatureCollection<Polygon | MultiPolygon>;
  } catch {
    return null;
  }
}
