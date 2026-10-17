"use client";

import { Check, ChevronDown, ExternalLink, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { hectares, longDate, money } from "@/lib/format";
import type { NotOnThisLand, Payment, PaymentDetail, SourcedItem } from "@/lib/screen";
import { cn } from "@/lib/utils";
import { notHereReason, paymentColours, paymentIcons, statusLabel, wordingFor, type Status } from "@/lib/wording";

/** A payment combined across fields. */
export type PaymentGroup = {
  code: string;
  kind: "one_off" | "annual" | "costs_covered";
  total: number;
  low: number;
  insideHa: number;
  ha: number;
  rate: number;
  unit: string;
  years: number | null;
  qualification: Payment["qualification"];
  perBlock: { name: string; ha: number; insideHa: number; amount: number; low: number }[];
  /** First field's payment, for wording that needs one (null for costs covered). */
  first: Payment | null;
};

type RowProps = {
  group: PaymentGroup;
  status: Status;
  /** Overrides the status label (e.g. "Access off"). */
  statusText?: string;
  eligibleHa: number;
  detail: PaymentDetail | undefined;
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Shown on map: its qualifying land is outlined. */
  shownOnMap: boolean;
  onShowOnMap?: () => void;
  /** Replaces the amount, e.g. "would add £9,000". */
  amountText?: string;
  /** Extra content above the breakdown, e.g. the public-access switch. */
  notice?: ReactNode;
  /** Replace sections 1 and 3 (for a payment held back by the access answer). */
  whatItPays?: ReactNode;
  whyQualifies?: ReactNode;
};

function amountLabel(g: PaymentGroup): string {
  if (g.kind === "annual") return `${money(g.total)} a year`;
  if (g.kind === "costs_covered") return `up to ${money(g.total)}`;
  return g.low < g.total ? `${money(g.low)}–${money(g.total)}` : money(g.total);
}

function rateText(g: PaymentGroup): string {
  const rate = `${money(g.rate)} per hectare`;
  if (g.kind === "annual") return `${rate} a year, for ${g.years ?? 15} years.`;
  if (g.kind === "costs_covered") return `Pays back actual costs, up to an average of ${rate}. It reimburses spending; it is not income.`;
  return `${rate}, paid once.`;
}

function howCalculated(g: PaymentGroup, eligibleHa: number): string {
  if (g.kind === "annual") {
    return `On the ${hectares(g.ha)} you could plant: ${money(g.total)} a year, ${money(g.total * (g.years ?? 15))} over ${g.years ?? 15} years.`;
  }
  if (g.kind === "costs_covered") return `On the ${hectares(g.ha)} you could plant: up to ${money(g.total)} in costs paid back.`;
  if (g.qualification === "area_inside") {
    return `Only the ${hectares(g.insideHa)} inside the target area is paid: ${money(g.total)}.`;
  }
  if (g.qualification === "whole_site_inside") {
    return `On all ${hectares(g.ha)} you could plant, because it is all inside the area: ${money(g.total)}.`;
  }
  const whole = `A field that touches the target area is paid on all of it: ${hectares(g.ha)} gives ${money(g.total)}.`;
  if (g.low < g.total) {
    return `${whole} Paid only on the ${hectares(g.insideHa)} inside, it would be ${money(g.low)}, so we show both.`;
  }
  return g.ha < eligibleHa - 0.005 ? `${whole} Fields that don't touch it get nothing.` : whole;
}

function Checklist({ items, icon }: { items: SourcedItem[]; icon: "check" | "dot" }) {
  return (
    <ul className="mt-1 space-y-1">
      {items.map((item) => (
        <li key={item.text} className="flex gap-2 text-sm">
          {icon === "check" ? (
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-moss" />
          ) : (
            <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-muted" />
          )}
          <span>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}

function Part({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-stone text-xs font-semibold text-muted"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold">{title}</h4>
        <div className="mt-0.5 text-sm">{children}</div>
      </div>
    </div>
  );
}

/** Every gov.uk section the breakdown draws on, main section first. */
function sourcesOf(detail: PaymentDetail): { section: string; url: string }[] {
  const all = [
    { section: detail.source_section, url: detail.source_url },
    ...[...detail.what_to_do, ...detail.commitments].map((i) => ({ section: i.source_section, url: i.source_url })),
  ];
  return [...new Map(all.map((s) => [s.url + s.section, s])).values()];
}

export function PaymentRow({
  group,
  status,
  statusText,
  eligibleHa,
  detail,
  open,
  onOpenChange,
  shownOnMap,
  onShowOnMap,
  amountText,
  notice,
  whatItPays,
  whyQualifies,
}: RowProps) {
  const w = wordingFor(group.code);
  const Icon = paymentIcons[group.code];
  const colour = paymentColours[group.code] ?? "#7d9a6b";
  const mapBased = group.qualification !== "eligible_area";
  const pct = eligibleHa > 0 ? Math.min(100, Math.round((100 * group.insideHa) / eligibleHa)) : 0;
  const contentId = `pay-${group.code}`;

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} asChild>
      <li className={cn("rounded-lg border bg-white", open ? "border-ink/40 shadow-sm" : "border-line")}>
        <CollapsibleTrigger
          className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-paper coarse:py-3"
          aria-controls={contentId}
        >
          <span
            aria-hidden="true"
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md"
            style={{ background: `${colour}26`, color: "#1f2421", boxShadow: `inset 3px 0 0 ${colour}` }}
          >
            {Icon && <Icon className="size-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="text-sm font-semibold">{w.title}</span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{amountText ?? amountLabel(group)}</span>
            </span>
            <span className="mt-1 flex items-center gap-2">
              {mapBased ? (
                <>
                  <Progress
                    value={pct}
                    aria-label={`${pct}% of the land you could plant is inside the target area`}
                    className="h-1.5 w-16 bg-stone"
                    indicatorStyle={{ background: colour }}
                  />
                  <span className="text-xs text-muted tabular-nums">{pct}% inside</span>
                </>
              ) : (
                <span className="text-xs text-muted">
                  {group.kind === "costs_covered" ? "Costs paid back, not income" : "All the land you could plant"}
                </span>
              )}
              <span className="flex-1" />
              <Badge variant={status}>{statusText ?? statusLabel[status]}</Badge>
              <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
            </span>
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent id={contentId} className="space-y-3 border-t border-line px-3 pt-3 pb-4">
          {notice}
          <Part n={1} title="What it pays">
            {whatItPays ?? (
              <>
            <p>{rateText(group)}</p>
            <p className="mt-1 text-muted">{howCalculated(group, eligibleHa)}</p>
            {group.perBlock.length > 1 && (
              <ul className="mt-1 text-muted">
                {group.perBlock.map((b) => (
                  <li key={b.name} className="flex justify-between gap-2 tabular-nums">
                    <span>
                      {b.name}: {hectares(b.ha)}
                    </span>
                    <span>{b.low < b.amount ? `${money(b.low)}–${money(b.amount)}` : money(b.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
              </>
            )}
          </Part>
          {detail && (
            <Part n={2} title="Why the government pays it">
              <p>{detail.benefit}</p>
            </Part>
          )}
          <Part n={3} title="Why your land qualifies">
            {whyQualifies ?? <p>{w.why(group.first ?? undefined)}</p>}
            {mapBased && !whyQualifies && (
              <p className="mt-1 text-muted">
                {hectares(group.insideHa)} of the {hectares(eligibleHa)} you could plant is inside the target area ({pct}%).
              </p>
            )}
            {mapBased && onShowOnMap && (
              <Button variant="outline" size="sm" className="mt-2" onClick={onShowOnMap} aria-pressed={shownOnMap}>
                <MapPin aria-hidden="true" />
                {shownOnMap ? "Shown on map" : "Show on map"}
              </Button>
            )}
          </Part>
          {detail && (
            <>
              <Part n={4} title="What you'd have to do">
                <Checklist items={detail.what_to_do} icon="check" />
              </Part>
              <Part n={5} title="What you're committing to">
                <Checklist items={detail.commitments} icon="dot" />
              </Part>
              <Part n={6} title="When it's paid">
                <p>{detail.paid_when}</p>
              </Part>
              <Part n={7} title="Source">
                <a
                  href={detail.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-moss underline"
                >
                  gov.uk: {detail.source_section}
                  <ExternalLink aria-hidden="true" className="size-3" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
                <p className="text-xs text-muted">
                  Checked {longDate(detail.date_checked)}. {w.detail}.
                </p>
                {sourcesOf(detail).length > 1 && (
                  <p className="mt-1 text-xs text-muted">
                    Checklist lines also from:{" "}
                    {sourcesOf(detail)
                      .slice(1)
                      .map((s, i, all) => (
                        <span key={s.url + s.section}>
                          <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                            {s.section}
                          </a>
                          {i < all.length - 1 ? "; " : ""}
                        </span>
                      ))}
                    .
                  </p>
                )}
              </Part>
            </>
          )}
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}

/** A map-based bonus that was checked but doesn't reach this land. */
export function NotHereRow({
  item,
  open,
  onOpenChange,
  onShowOnMap,
  canShowOnMap,
}: {
  item: NotOnThisLand;
  open: boolean;
  onOpenChange(open: boolean): void;
  onShowOnMap(): void;
  canShowOnMap: boolean;
}) {
  const Icon = paymentIcons[item.code] ?? paymentIcons[item.codes[0]];
  const title = wordingFor(item.codes[0]).title;
  const rate =
    item.rate_low_gbp === item.rate_high_gbp
      ? `${money(item.rate_high_gbp)}/ha`
      : `${money(item.rate_low_gbp)}–${money(item.rate_high_gbp)}/ha`;
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} asChild>
      <li className="rounded-lg border border-line bg-white">
        <CollapsibleTrigger className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-paper coarse:min-h-12">
          <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-md bg-stone text-muted">
            {Icon && <Icon className="size-4" />}
          </span>
          <span className="flex-1 text-sm">{title}</span>
          <span className="text-xs text-muted tabular-nums">{rate}</span>
          <Badge variant="none">{statusLabel.none}</Badge>
          <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="border-t border-line px-3 pt-2 pb-3 text-sm">
          <p>{notHereReason(item)}</p>
          {canShowOnMap && (
            <Button variant="outline" size="sm" className="mt-2" onClick={onShowOnMap}>
              <MapPin aria-hidden="true" />
              Show nearby target areas
            </Button>
          )}
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}
