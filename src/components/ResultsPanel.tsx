"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { PanelSection } from "@/components/PanelSection";
import { NotHereRow, PaymentRow, type PaymentGroup } from "@/components/PaymentRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { aboutMoney, hectares, money } from "@/lib/format";
import { hatchBackground } from "@/lib/patterns";
import type { NotOnThisLand, Payment, ScreenResult } from "@/lib/screen";
import { cn } from "@/lib/utils";
import {
  EXCLUSION_COLOUR,
  exclusionIcons,
  flagIcons,
  paymentColours,
  paymentStatus,
  plainSummary,
  wordingFor,
} from "@/lib/wording";

type Props = {
  result: ScreenResult;
  updating: boolean;
  publicAccess: boolean;
  onPublicAccessChange(value: boolean): void;
  selectedPayment: string | null;
  onSelectPayment(code: string | null): void;
  /** Switch on the nearby target areas for a bonus that isn't on this land. */
  onShowTargetArea(codes: string[]): void;
  canShowTargetArea(codes: string[]): boolean;
  selectedBlock: number | null;
  onSelectBlock(index: number | null): void;
  onStartAgain(): void;
  onOpenSources(): void;
};

function groupPayments(result: ScreenResult, kind: Payment["kind"]): PaymentGroup[] {
  const groups = new Map<string, PaymentGroup>();
  for (const b of result.blocks) {
    for (const p of b.payments.filter((x) => x.kind === kind)) {
      const g =
        groups.get(p.code) ??
        ({
          code: p.code,
          kind,
          total: 0,
          low: 0,
          insideHa: 0,
          ha: 0,
          rate: p.rate_gbp,
          unit: p.unit,
          years: p.years,
          qualification: p.qualification,
          perBlock: [],
          first: p,
        } satisfies PaymentGroup);
      g.total += p.amount_gbp;
      g.low += p.low_amount_gbp;
      g.insideHa += p.inside_ha;
      g.ha += p.ha;
      g.perBlock.push({ name: b.name, ha: p.ha, insideHa: p.inside_ha, amount: p.amount_gbp, low: p.low_amount_gbp });
      groups.set(p.code, g);
    }
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

function costsGroup(result: ScreenResult): PaymentGroup | null {
  const c = result.costs_covered;
  if (!c || c.planting_costs_up_to_gbp <= 0) return null;
  return {
    code: "planting_costs",
    kind: "costs_covered",
    total: c.planting_costs_up_to_gbp,
    low: c.planting_costs_up_to_gbp,
    insideHa: c.ha,
    ha: c.ha,
    rate: c.rate_gbp_per_ha,
    unit: "£/ha",
    years: null,
    qualification: "eligible_area",
    perBlock: result.blocks.flatMap((b) =>
      b.costs_covered.map((x) => ({ name: b.name, ha: x.ha, insideHa: x.ha, amount: x.up_to_gbp, low: x.up_to_gbp })),
    ),
    first: null,
  };
}

function range(low: number, high: number): string {
  if (Math.round(low / 100) === Math.round(high / 100)) return aboutMoney(high);
  return `${aboutMoney(low)} to ${aboutMoney(high).replace("about ", "")}`;
}

export function ResultsPanel({
  result,
  updating,
  publicAccess,
  onPublicAccessChange,
  selectedPayment,
  onSelectPayment,
  onShowTargetArea,
  canShowTargetArea,
  selectedBlock,
  onSelectBlock,
  onStartAgain,
  onOpenSources,
}: Props) {
  const { summary, income } = result;
  const [openRows, setOpenRows] = useState<Record<string, boolean>>({});
  const toggleRow = (code: string, open: boolean) => setOpenRows((r) => ({ ...r, [code]: open }));

  const oneOff = groupPayments(result, "one_off");
  const annual = groupPayments(result, "annual");
  const costs = costsGroup(result);
  const maint = income.annual_maintenance;
  const hasRange = income.one_off_low_gbp < income.one_off_total_gbp;
  const eligibleHa = summary.eligible_ha;

  const notApplied = new Map<string, { payment: string; reason: string; total: number; low: number }>();
  for (const b of result.blocks)
    for (const n of b.not_applied) {
      const cur = notApplied.get(n.code) ?? { payment: n.payment, reason: n.reason, total: 0, low: 0 };
      cur.total += n.would_be_gbp;
      cur.low += n.would_be_low_gbp;
      notApplied.set(n.code, cur);
    }
  const accessGain = notApplied.get("recreational_access");
  // The access bonus rate, from the result (paid, or checked and not on this land).
  const accessRate =
    result.blocks.flatMap((b) => b.payments).find((p) => p.code === "recreational_access")?.rate_gbp ??
    result.not_on_this_land.find((n) => n.code === "recreational_access")?.rate_high_gbp;

  const rows = [...oneOff, ...annual];
  const statuses = rows.map((g) => paymentStatus(g.qualification, g.insideHa, eligibleHa));
  const nQualify = statuses.filter((s) => s === "qualifies").length;
  const nPartly = statuses.filter((s) => s === "partly").length;

  const removed = new Map<string, { reason: string; explanation: string; ha: number }>();
  for (const b of result.blocks)
    for (const r of b.removed) {
      const cur = removed.get(r.code) ?? { reason: r.reason, explanation: r.explanation, ha: 0 };
      cur.ha += r.ha;
      removed.set(r.code, cur);
    }
  const removedHa = [...removed.values()].reduce((s, r) => s + r.ha, 0);

  // Flags across fields, once per kind, with the fields they apply to.
  const flags = new Map<string, { explanation: string; label?: string; fields: string[] }>();
  for (const b of result.blocks)
    for (const f of b.flags) {
      const cur = flags.get(f.code) ?? { explanation: f.explanation, label: f.label, fields: [] };
      cur.fields.push(b.name);
      flags.set(f.code, cur);
    }
  for (const f of result.site_flags) flags.set(f.code, { explanation: f.explanation, label: f.label, fields: [] });

  const accessSwitch = (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3 py-2">
      <label htmlFor="access-switch" className="text-sm">
        <span className="font-semibold">Public access on foot for 30 years</span>
        <span className="block text-xs text-muted">
          {accessRate ? `Can add ${money(accessRate)} per hectare near towns` : "Can add a bonus on land near towns"}
        </span>
      </label>
      <Switch id="access-switch" checked={publicAccess} onCheckedChange={onPublicAccessChange} />
    </div>
  );

  return (
    <div aria-busy={updating}>
      <header className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <h1 id="estimate-heading" tabIndex={-1} className="text-xs font-semibold tracking-wide text-muted uppercase">
            Your estimate
          </h1>
          <p className="text-xs text-muted" role="status">
            {updating ? "Updating…" : ""}
          </p>
        </div>
        <p className="mt-1 text-sm">
          {hectares(summary.drawn_ha)} drawn · <strong>{hectares(summary.eligible_ha)} plantable</strong>
        </p>
      </header>

      <PanelSection
        id="summary-heading"
        title="Summary"
        tags={<Badge variant={summary.meets_site_minimum ? "qualifies" : "issue"}>{summary.meets_site_minimum ? "Estimate" : "Under 1 ha"}</Badge>}
      >
        <p className="text-base">{plainSummary(result)}</p>
        {summary.meets_site_minimum ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-line bg-white p-3">
                <p className="text-xs text-muted">One-off bonuses</p>
                <p className="text-2xl font-bold tabular-nums">{range(income.one_off_low_gbp, income.one_off_total_gbp).replace("about ", "")}</p>
                <p className="text-xs text-muted">about, paid once</p>
              </div>
              <div className="rounded-lg border border-line bg-white p-3">
                <p className="text-xs text-muted">Yearly upkeep</p>
                <p className="text-2xl font-bold tabular-nums">{aboutMoney(maint.per_year_gbp).replace("about ", "")}</p>
                <p className="text-xs text-muted">about, a year for {maint.years ?? 15} years</p>
              </div>
            </div>
            <p className="mt-3 text-sm">
              Over {maint.years ?? 15} years: <strong>{range(income.total_income_low_gbp, income.total_income_gbp)}</strong> in
              income.
            </p>
            {hasRange && (
              <p className="mt-1 text-sm text-muted">
                The lower figure pays each bonus only on the land inside its target area; the higher one follows the
                scheme rule that a field touching a target area is paid on all of it.
              </p>
            )}
            {summary.has_large_block && (
              <p className="mt-2 flex gap-2 rounded-lg bg-warn-bg p-3 text-sm font-semibold text-warn-text">
                <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                At least one field is over {summary.large_block_ha} ha, so the higher figure is likely to overstate what you
                would get. Try drawing your individual fields.
              </p>
            )}
            <div className="mt-3 rounded-lg border border-dashed border-muted/60 p-3">
              <p className="text-sm">
                <span className="font-semibold">Costs covered, not income:</span> planting costs paid back up to{" "}
                <strong className="tabular-nums">{aboutMoney(result.costs_covered.planting_costs_up_to_gbp)}</strong>.
              </p>
            </div>
          </>
        ) : (
          <p className="mt-3 rounded-lg border-l-4 border-clay bg-clay-tint p-3 text-sm">
            Woodland creation payments need at least 1 hectare that could be planted, so we haven&apos;t worked out any
            payments. <strong>Left out</strong> below shows why.
          </p>
        )}
        <div className="mt-3">{accessSwitch}</div>
        {accessGain && (
          <p className="mt-2 text-sm font-semibold text-moss">
            Allowing public access would add {accessGain.low < accessGain.total ? `${money(accessGain.low)} to ${money(accessGain.total)}` : money(accessGain.total)}.
          </p>
        )}
      </PanelSection>

      {summary.meets_site_minimum && (
        <PanelSection id="money-heading" title="Where the money comes from" tags={<Badge variant="none">15 yrs</Badge>}>
          <MoneyBar oneOff={oneOff} maintenanceTotal={maint.total_gbp} />
        </PanelSection>
      )}

      {summary.meets_site_minimum && (
        <PanelSection
          id="payments-heading"
          title="Payments"
          tags={
            <>
              {nQualify > 0 && <Badge variant="qualifies">{nQualify} qualify</Badge>}
              {nPartly > 0 && <Badge variant="partly">{nPartly} partly</Badge>}
            </>
          }
        >
          <p className="text-sm text-muted">Exact amounts. Open a payment to see what it asks of you.</p>
          <ul className="mt-2 space-y-2">
            {rows.map((g, i) => (
              <PaymentRow
                key={g.code}
                group={g}
                status={statuses[i]}
                eligibleHa={eligibleHa}
                detail={result.payment_details[g.code]}
                open={Boolean(openRows[g.code])}
                onOpenChange={(o) => toggleRow(g.code, o)}
                shownOnMap={selectedPayment === g.code}
                onShowOnMap={() => onSelectPayment(selectedPayment === g.code ? null : g.code)}
              />
            ))}
            {accessGain && (
              <PaymentRow
                group={{
                  code: "recreational_access",
                  kind: "one_off",
                  total: accessGain.total,
                  low: accessGain.low,
                  insideHa: 0,
                  ha: 0,
                  rate: 0,
                  unit: "£/ha",
                  years: null,
                  qualification: "touches",
                  perBlock: [],
                  first: null,
                }}
                status="none"
                statusText="Access off"
                eligibleHa={eligibleHa}
                detail={result.payment_details["recreational_access"]}
                open={Boolean(openRows["recreational_access"])}
                onOpenChange={(o) => toggleRow("recreational_access", o)}
                shownOnMap={false}
                amountText={`+${accessGain.low < accessGain.total ? `${money(accessGain.low)}–${money(accessGain.total)}` : money(accessGain.total)}`}
                whatItPays={
                  <p>
                    Paid once. If you allow public access it would add{" "}
                    {accessGain.low < accessGain.total ? `${money(accessGain.low)} to ${money(accessGain.total)}` : money(accessGain.total)} on
                    this land.
                  </p>
                }
                whyQualifies={<p>Your land is in an area near towns that needs more woodland, but you said no to public access.</p>}
                notice={accessSwitch}
              />
            )}
          </ul>
          {costs && (
            <>
              <h3 className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">Costs covered (not income)</h3>
              <ul className="mt-2">
                <PaymentRow
                  group={costs}
                  status="qualifies"
                  eligibleHa={eligibleHa}
                  detail={result.payment_details["planting_costs"]}
                  open={Boolean(openRows["planting_costs"])}
                  onOpenChange={(o) => toggleRow("planting_costs", o)}
                  shownOnMap={false}
                />
              </ul>
            </>
          )}
          {result.not_on_this_land.length > 0 && (
            <>
              <h3 className="mt-4 text-xs font-semibold tracking-wide text-muted uppercase">Not on this land</h3>
              <p className="text-xs text-muted">Bonuses we checked that don&apos;t reach the land you could plant.</p>
              <ul className="mt-2 space-y-2">
                {result.not_on_this_land.map((n: NotOnThisLand) => (
                  <NotHereRow
                    key={n.code}
                    item={n}
                    open={Boolean(openRows[`not:${n.code}`])}
                    onOpenChange={(o) => toggleRow(`not:${n.code}`, o)}
                    canShowOnMap={canShowTargetArea(n.codes)}
                    onShowOnMap={() => onShowTargetArea(n.codes)}
                  />
                ))}
              </ul>
            </>
          )}
        </PanelSection>
      )}

      <PanelSection
        id="leftout-heading"
        title="Left out"
        tags={<Badge variant={removedHa >= 0.01 ? "issue" : "none"}>{removedHa >= 0.01 ? hectares(removedHa) : "None"}</Badge>}
      >
        {removed.size === 0 ? (
          <p className="text-sm">Nothing was left out: all the land you drew could be planted.</p>
        ) : (
          <ul className="space-y-3">
            {[...removed].map(([code, r]) => {
              const Icon = exclusionIcons[code];
              return (
                <li key={code} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-7 shrink-0 rounded-[3px]"
                    style={{ background: hatchBackground(code), border: `1px solid ${EXCLUSION_COLOUR}` }}
                  />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="flex items-baseline gap-2 font-semibold">
                      {Icon && <Icon aria-hidden="true" className="size-4 shrink-0 self-center text-muted" />}
                      <span className="flex-1">{r.reason}</span>
                      <span className="tabular-nums">{hectares(r.ha)}</span>
                    </p>
                    <p className="text-muted">{r.explanation}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PanelSection>

      <PanelSection
        id="checking-heading"
        title="Worth checking"
        defaultOpen={flags.size > 0}
        tags={<Badge variant={flags.size > 0 ? "partly" : "none"}>{flags.size > 0 ? flags.size : "None"}</Badge>}
      >
        {flags.size === 0 ? (
          <p className="text-sm">Nothing else to flag on this land.</p>
        ) : (
          <ul className="space-y-3">
            {[...flags].map(([code, f]) => {
              const Icon = flagIcons[code] ?? TriangleAlert;
              return (
                <li key={code} className="flex gap-3 text-sm">
                  <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warn-text" />
                  <div>
                    {f.label && <p className="font-semibold">{f.label}</p>}
                    <p>{f.explanation}</p>
                    {f.fields.length > 0 && result.blocks.length > 1 && (
                      <p className="text-xs text-muted">In {f.fields.join(", ")}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PanelSection>

      <PanelSection id="fields-heading" title="Fields" defaultOpen={result.blocks.length > 1} tags={<Badge variant="none">{result.blocks.length}</Badge>}>
        <p className="text-sm text-muted">Select a field here or on the map to see its breakdown.</p>
        <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-white">
          {result.blocks.map((b, i) => (
            <li key={b.block}>
              <button
                type="button"
                onClick={() => onSelectBlock(selectedBlock === i ? null : i)}
                aria-expanded={selectedBlock === i}
                className={cn(
                  "flex min-h-9 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-paper coarse:min-h-11",
                  selectedBlock === i && "bg-moss-tint",
                )}
              >
                <span className="font-semibold">
                  {b.name}
                  {b.is_large && (
                    <Badge variant="partly" className="ml-2">
                      over {summary.large_block_ha} ha
                    </Badge>
                  )}
                  {!b.meets_block_minimum && (
                    <Badge variant="issue" className="ml-2">
                      under 0.1 ha
                    </Badge>
                  )}
                </span>
                <span className="text-xs tabular-nums">
                  {hectares(b.eligible_ha)} of {hectares(b.drawn_ha)}
                </span>
              </button>
              {selectedBlock === i && (
                <div className="space-y-2 border-t border-line px-3 py-3 text-sm">
                  <p>
                    <strong>Left out:</strong>{" "}
                    {b.removed.length === 0 ? "nothing" : b.removed.map((r) => `${r.reason} ${hectares(r.ha)}`).join("; ")}
                  </p>
                  {b.payments.length > 0 && (
                    <ul className="space-y-1">
                      {b.payments.map((p) => (
                        <li key={p.code} className="flex justify-between gap-2">
                          <span>{wordingFor(p.code).title}</span>
                          <span className="tabular-nums">
                            {p.kind === "annual"
                              ? `${money(p.amount_gbp)} a year`
                              : p.low_amount_gbp < p.amount_gbp
                                ? `${money(p.low_amount_gbp)} to ${money(p.amount_gbp)}`
                                : money(p.amount_gbp)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </PanelSection>

      <div className="space-y-3 pt-4">
        <p className="text-xs text-muted">
          An estimate from public map data, not an offer of grant. The Forestry Commission decides eligibility and payments.{" "}
          <button type="button" onClick={onOpenSources} className="font-semibold text-moss underline">
            Sources, rates and what this can&apos;t check
          </button>
        </p>
        <Button variant="ghost" size="sm" onClick={onStartAgain} className="text-clay-text hover:bg-clay-tint hover:text-clay-text">
          <RotateCcw aria-hidden="true" />
          Start again
        </Button>
      </div>
    </div>
  );
}

function MoneyBar({ oneOff, maintenanceTotal }: { oneOff: PaymentGroup[]; maintenanceTotal: number }) {
  const parts = [
    ...oneOff.map((g) => ({ code: g.code, label: wordingFor(g.code).title, amount: g.total })),
    ...(maintenanceTotal > 0 ? [{ code: "maintenance", label: "Yearly upkeep (15 years)", amount: maintenanceTotal }] : []),
  ].filter((p) => p.amount > 0);
  const total = parts.reduce((s, p) => s + p.amount, 0);
  if (total === 0) return <p className="text-sm">No income on this land.</p>;
  // Public access shares the near-towns colour, so it is striped to tell them apart.
  const fill = (code: string) => {
    const c = paymentColours[code] ?? "#7d9a6b";
    return code === "recreational_access" ? `repeating-linear-gradient(-45deg, ${c} 0 4px, #ffffff 4px 6px)` : c;
  };
  return (
    <figure>
      <figcaption className="text-sm text-muted">Over 15 years, using the higher figures. Costs covered are not included.</figcaption>
      <div className="mt-2 flex h-4 w-full overflow-hidden rounded-full" aria-hidden="true">
        {parts.map((p) => (
          <div
            key={p.code}
            style={{ width: `${(100 * p.amount) / total}%`, background: fill(p.code) }}
            className="h-full border-r-2 border-white last:border-r-0"
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {parts.map((p) => (
          <li key={p.code} className="flex items-center gap-2">
            <span aria-hidden="true" className="inline-block size-3 shrink-0 rounded-sm" style={{ background: fill(p.code) }} />
            <span className="flex-1">{p.label}</span>
            <span className="tabular-nums">{money(p.amount)}</span>
            <span className="w-10 text-right text-xs text-muted tabular-nums">{Math.round((100 * p.amount) / total)}%</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
