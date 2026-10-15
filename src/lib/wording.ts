import type { Payment } from "@/lib/screen";
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
};
