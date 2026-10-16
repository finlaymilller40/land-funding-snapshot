"use client";

import { aboutMoney, hectares, longDate, money } from "@/lib/format";
import type { Payment, ScreenResult } from "@/lib/screen";
import { paymentColours, plainSummary, wordingFor } from "@/lib/wording";

type Props = {
  result: ScreenResult;
  updating: boolean;
  publicAccess: boolean;
  onPublicAccessChange(value: boolean): void;
  selectedPayment: string | null;
  onSelectPayment(code: string | null): void;
  selectedBlock: number | null;
  onSelectBlock(index: number | null): void;
  onStartAgain(): void;
};

type Grouped = { code: string; total: number; low: number; insideHa: number; ha: number; perBlock: { name: string; payment: Payment }[] };

function groupPayments(result: ScreenResult, kind: Payment["kind"]): Grouped[] {
  const groups = new Map<string, Grouped>();
  for (const b of result.blocks) {
    for (const p of b.payments.filter((x) => x.kind === kind)) {
      const g = groups.get(p.code) ?? { code: p.code, total: 0, low: 0, insideHa: 0, ha: 0, perBlock: [] };
      g.total += p.amount_gbp;
      g.low += p.low_amount_gbp;
      g.insideHa += p.inside_ha;
      g.ha += p.ha;
      g.perBlock.push({ name: b.name, payment: p });
      groups.set(p.code, g);
    }
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
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
  selectedBlock,
  onSelectBlock,
  onStartAgain,
}: Props) {
  const { summary, income, costs_covered } = result;
  const oneOff = groupPayments(result, "one_off");
  const annual = groupPayments(result, "annual");
  const maint = income.annual_maintenance;
  const hasRange = income.one_off_low_gbp < income.one_off_total_gbp;
  const notApplied = new Map<string, { payment: string; reason: string; total: number; low: number }>();
  for (const b of result.blocks)
    for (const n of b.not_applied) {
      const cur = notApplied.get(n.code) ?? { payment: n.payment, reason: n.reason, total: 0, low: 0 };
      cur.total += n.would_be_gbp;
      cur.low += n.would_be_low_gbp;
      notApplied.set(n.code, cur);
    }
  const block = selectedBlock !== null ? result.blocks[selectedBlock] : null;

  return (
    <div className="space-y-6" aria-busy={updating}>
      <section aria-labelledby="estimate-heading">
        <div className="flex items-baseline justify-between gap-3">
          <h1 id="estimate-heading" className="text-2xl font-bold text-moss">
            Your estimate
          </h1>
          <p className="text-sm text-muted" role="status">
            {updating ? "Updating…" : ""}
          </p>
        </div>
        <p className="mt-1">
          {hectares(summary.drawn_ha)} drawn · <strong>{hectares(summary.eligible_ha)} could be planted</strong>
        </p>
        <p className="mt-3 rounded bg-moss-tint p-3">{plainSummary(result)}</p>
      </section>

      {summary.meets_site_minimum ? (
        <section aria-labelledby="money-heading" className="space-y-3">
          <div className="rounded border-2 border-moss bg-white p-4">
            <h2 id="money-heading" className="font-bold">
              Payments you could receive
            </h2>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <p>
                <span className="block text-2xl font-bold tabular-nums">{range(income.one_off_low_gbp, income.one_off_total_gbp)}</span>
                <span className="text-sm text-muted">one-off</span>
              </p>
              {maint.per_year_gbp > 0 && (
                <p>
                  <span className="block text-2xl font-bold tabular-nums">{aboutMoney(maint.per_year_gbp)}</span>
                  <span className="text-sm text-muted">a year for {maint.years} years</span>
                </p>
              )}
            </div>
            <p className="mt-3 border-t border-line pt-2 text-sm">
              Over {maint.years ?? 15} years:{" "}
              <strong>{range(income.total_income_low_gbp, income.total_income_gbp)} in total</strong>
            </p>
            {hasRange && (
              <p className="mt-2 text-sm text-muted">
                The lower figure pays each bonus only on the land inside its target area; the higher one follows the
                scheme rule that a field touching a target area is paid on all of it.
              </p>
            )}
            {summary.has_large_block && (
              <p className="mt-2 rounded bg-warn-bg p-2 text-sm font-semibold text-warn-text">
                At least one field is over {summary.large_block_ha} ha, so the higher figure is likely to overstate what
                you would get. Try drawing your individual fields.
              </p>
            )}
          </div>

          <MoneyBar oneOff={oneOff} maintenanceTotal={maint.total_gbp} />

          <div className="rounded border-2 border-dashed border-muted bg-white p-4">
            <h2 className="font-bold">Costs covered (not income)</h2>
            <p className="mt-1">
              Planting costs covered up to
              <strong className="block text-xl tabular-nums">{aboutMoney(costs_covered.planting_costs_up_to_gbp)}</strong>
            </p>
            <p className="mt-1 text-sm text-muted">
              This pays back what you spend on planting and protecting the trees. It is not extra money.
            </p>
          </div>
        </section>
      ) : (
        <section className="rounded border-l-4 border-clay bg-clay-tint p-4" role="status">
          <h2 className="font-bold">Not enough of this land could be planted</h2>
          <p className="mt-1">
            Woodland creation payments need at least 1 hectare that could be planted, so we haven&apos;t worked out any
            payments. The fields below show what was left out and why.
          </p>
        </section>
      )}

      <section aria-labelledby="access-heading" className="rounded border border-line bg-white p-4">
        <h2 id="access-heading" className="font-bold">
          Public access
        </h2>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p id="access-label" className="text-sm">
            Allow free public access on foot for 30 years (can add £3,700 per hectare near towns)
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={publicAccess}
            aria-labelledby="access-label"
            onClick={() => onPublicAccessChange(!publicAccess)}
            className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border-2 ${
              publicAccess ? "border-moss bg-moss" : "border-muted bg-white"
            }`}
          >
            <span
              className={`inline-block h-6 w-6 rounded-full shadow transition-transform ${
                publicAccess ? "translate-x-6 bg-white" : "translate-x-0.5 bg-muted"
              }`}
            />
            <span className="sr-only">{publicAccess ? "On" : "Off"}</span>
          </button>
        </div>
        {[...notApplied].map(([code, n]) => (
          <p key={code} className="mt-2 text-sm font-semibold text-moss">
            {code === "recreational_access" ? "Allowing public access would add " : `${n.payment} would add `}
            {n.low < n.total ? `${money(n.low)} to ${money(n.total)}` : money(n.total)}.
          </p>
        ))}
      </section>

      {(oneOff.length > 0 || annual.length > 0) && (
        <section aria-labelledby="bonus-heading">
          <h2 id="bonus-heading" className="text-lg font-bold">
            Why your land qualifies
          </h2>
          <p className="text-sm text-muted">Exact amounts. Select a payment to see its target area on the map.</p>
          <div className="mt-3 space-y-3">
            {[...oneOff, ...annual].map((g) => (
              <PaymentCard
                key={g.code}
                group={g}
                eligibleHa={summary.eligible_ha}
                selected={selectedPayment === g.code}
                onSelect={() => onSelectPayment(selectedPayment === g.code ? null : g.code)}
              />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="fields-heading">
        <h2 id="fields-heading" className="text-lg font-bold">
          Your fields
        </h2>
        <p className="text-sm text-muted">Select a field here or on the map to see its breakdown.</p>
        <ul className="mt-2 divide-y divide-line rounded border border-line bg-white">
          {result.blocks.map((b, i) => (
            <li key={b.block}>
              <button
                type="button"
                onClick={() => onSelectBlock(selectedBlock === i ? null : i)}
                aria-expanded={selectedBlock === i}
                className={`flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-moss-tint ${
                  selectedBlock === i ? "bg-moss-tint" : ""
                }`}
              >
                <span className="font-semibold">
                  {b.name}
                  {b.is_large && <span className="ml-2 text-sm font-normal text-warn-text">over {summary.large_block_ha} ha</span>}
                  {!b.meets_block_minimum && <span className="ml-2 text-sm font-normal text-clay-text">under 0.1 ha</span>}
                </span>
                <span className="text-sm tabular-nums">
                  {hectares(b.eligible_ha)} of {hectares(b.drawn_ha)}
                </span>
              </button>
              {block && selectedBlock === i && (
                <div className="space-y-2 border-t border-line p-3 text-sm">
                  <p>
                    <strong>Left out:</strong>{" "}
                    {b.removed.length === 0 ? "nothing" : b.removed.map((r) => `${r.reason} ${hectares(r.ha)}`).join("; ")}
                  </p>
                  {b.flags.length > 0 && (
                    <ul className="list-disc space-y-1 pl-5">
                      {b.flags.map((f) => (
                        <li key={f.code} className={f.code === "large_block" ? "font-semibold text-warn-text" : ""}>
                          {f.explanation}
                        </li>
                      ))}
                    </ul>
                  )}
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
      </section>

      {result.next_steps.length > 0 && (
        <section aria-labelledby="steps-heading">
          <h2 id="steps-heading" className="text-lg font-bold">
            How to get this
          </h2>
          <ol className="mt-2 space-y-3">
            {result.next_steps.map((s, i) => (
              <li key={s.code} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-moss text-sm font-bold text-white">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold">{s.title}</p>
                  <p className="text-sm">{s.body}</p>
                  <a href={s.source_url} target="_blank" rel="noreferrer" className="text-sm text-moss underline">
                    Source (gov.uk)
                  </a>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-labelledby="detail-heading" className="space-y-2">
        <h2 id="detail-heading" className="text-lg font-bold">
          Before you rely on this
        </h2>
        <details className="rounded border border-line bg-white p-3">
          <summary className="cursor-pointer font-semibold">Why land was left out</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {[...new Map(result.blocks.flatMap((b) => b.removed.map((r) => [r.code, r]))).values()].map((r) => (
              <li key={r.code}>
                <strong>{r.reason}:</strong> {r.explanation}
              </li>
            ))}
            {result.blocks.every((b) => b.removed.length === 0) && <li>Nothing was left out.</li>}
          </ul>
        </details>
        <details className="rounded border border-line bg-white p-3">
          <summary className="cursor-pointer font-semibold">What this estimate can&apos;t check</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {result.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
        <details className="rounded border border-line bg-white p-3">
          <summary className="cursor-pointer font-semibold">Sources and rates</summary>
          <p className="mt-2 text-sm">Rates checked against gov.uk on {longDate(result.rates_checked)}.</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {result.sources.map((s) => (
              <li key={s}>
                <a href={s} className="text-moss underline" rel="noreferrer" target="_blank">
                  {s.replace("https://www.gov.uk/", "gov.uk/")}
                </a>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <div className="border-t border-line pt-4">
        <button
          type="button"
          onClick={onStartAgain}
          className="min-h-11 rounded px-4 font-semibold text-clay-text underline hover:bg-clay-tint"
        >
          Start again
        </button>
      </div>
    </div>
  );
}

function MoneyBar({ oneOff, maintenanceTotal }: { oneOff: Grouped[]; maintenanceTotal: number }) {
  const parts = [
    ...oneOff.map((g) => ({ code: g.code, label: wordingFor(g.code).title, amount: g.total })),
    ...(maintenanceTotal > 0 ? [{ code: "maintenance", label: "Yearly upkeep (15 years)", amount: maintenanceTotal }] : []),
  ].filter((p) => p.amount > 0);
  const total = parts.reduce((s, p) => s + p.amount, 0);
  if (total === 0) return null;
  return (
    <figure className="rounded border border-line bg-white p-4">
      <figcaption className="font-bold">Where the money comes from</figcaption>
      <p className="text-sm text-muted">Over 15 years, using the higher figures. Costs covered are not included.</p>
      <div className="mt-3 flex h-5 w-full overflow-hidden rounded" aria-hidden="true">
        {parts.map((p) => (
          <div
            key={p.code}
            style={{ width: `${(100 * p.amount) / total}%`, background: paymentColours[p.code] ?? "#7d9a6b" }}
            className="h-full border-r border-white last:border-r-0"
          />
        ))}
      </div>
      <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
        {parts.map((p) => (
          <li key={p.code} className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: paymentColours[p.code] ?? "#7d9a6b" }} />
            <span className="flex-1">{p.label}</span>
            <span className="tabular-nums">
              {money(p.amount)} ({Math.round((100 * p.amount) / total)}%)
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function PaymentCard({
  group,
  eligibleHa,
  selected,
  onSelect,
}: {
  group: Grouped;
  eligibleHa: number;
  selected: boolean;
  onSelect(): void;
}) {
  const first = group.perBlock[0].payment;
  const w = wordingFor(group.code);
  const annual = first.kind === "annual";
  const pct = eligibleHa > 0 ? Math.round((100 * group.insideHa) / eligibleHa) : 0;
  const colour = paymentColours[group.code] ?? "#7d9a6b";
  const mapBased = first.qualification !== "eligible_area";
  return (
    <article
      className={`rounded border bg-white p-4 ${selected ? "border-2 border-ink" : "border-line"}`}
      style={{ borderLeft: `6px solid ${colour}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold">{w.title}</h3>
        {mapBased && (
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className={`min-h-11 shrink-0 rounded px-3 text-sm font-semibold ${
              selected ? "bg-ink text-white" : "border border-line bg-white hover:bg-moss-tint"
            }`}
          >
            {selected ? "Shown on map" : "Show on map"}
          </button>
        )}
      </div>
      <p className="text-xl font-bold tabular-nums">
        {money(group.total)}
        {annual && <span className="text-base font-normal text-muted"> a year for {first.years} years</span>}
      </p>
      {!annual && group.low < group.total && (
        <p className="text-sm">
          or <strong className="tabular-nums">{money(group.low)}</strong> if paid only on the land inside the target area
        </p>
      )}
      {mapBased && (
        <p className={`mt-1 text-sm ${pct < 50 ? "font-semibold text-warn-text" : "text-muted"}`}>
          {first.qualification === "area_inside"
            ? `Paid only on the ${hectares(group.insideHa)} inside the target area (${pct}% of the land you could plant).`
            : `${hectares(group.insideHa)} of the ${hectares(eligibleHa)} you could plant lies inside the target area (${pct}%).`}
        </p>
      )}
      <p className="mt-2 text-sm">{w.why(first)}</p>
      <p className="mt-2 rounded border-l-4 border-sage bg-paper p-2 text-sm">{first.condition}</p>
      <details className="mt-2 text-sm text-muted">
        <summary className="cursor-pointer">Detail</summary>
        <p className="mt-1">{w.detail}</p>
        <p className="mt-1">
          {money(first.rate_gbp)} {first.unit.replace("£", "")}
          {first.qualification === "touches" && " on the whole field if it touches the target area (scheme rule)"}
        </p>
        <ul className="mt-1">
          {group.perBlock.map(({ name, payment }) => (
            <li key={name}>
              {name}: paid on {hectares(payment.ha)} → {money(payment.amount_gbp)}
              {!annual && payment.low_amount_gbp < payment.amount_gbp && (
                <> (inside only: {hectares(payment.inside_ha)} → {money(payment.low_amount_gbp)})</>
              )}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
