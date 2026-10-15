const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

/** Exact amount for detail cards, e.g. "£9,900". */
export function money(amount: number): string {
  return gbp.format(amount);
}

/** Headline amount: rounded to the nearest £100, e.g. "about £22,000". */
export function aboutMoney(amount: number): string {
  if (amount === 0) return "£0";
  return `about ${gbp.format(Math.round(amount / 100) * 100)}`;
}

export function hectares(ha: number): string {
  return `${ha.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ha`;
}

export function longDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
