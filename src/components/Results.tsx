"use client";

import dynamic from "next/dynamic";
import type { MultiPolygon, Polygon } from "geojson";
import { aboutMoney, hectares, longDate, money } from "@/lib/format";
import type { Payment, ScreenResult } from "@/lib/screen";
import { wordingFor } from "@/lib/wording";

const ResultsMap = dynamic(() => import("@/components/ResultsMap").then((m) => m.ResultsMap), {
  ssr: false,
  loading: () => <div className="h-[300px] rounded border border-line bg-moss-tint" />,
});

type Props = {
  result: ScreenResult;
  drawn: { name: string; geometry: Polygon | MultiPolygon }[];
  onChangeAnswers(): void;
  onEditFields(): void;
  onStartAgain(): void;
};

type Grouped = { code: string; total: number; perBlock: { name: string; payment: Payment }[] };

function groupPayments(result: ScreenResult, kind: Payment["kind"]): Grouped[] {
  const groups = new Map<string, Grouped>();
  for (const b of result.blocks) {
    for (const p of b.payments.filter((x) => x.kind === kind)) {
      const g = groups.get(p.code) ?? { code: p.code, total: 0, perBlock: [] };
      g.total += p.amount_gbp;
      g.perBlock.push({ name: b.name, payment: p });
      groups.set(p.code, g);
    }
  }
  return [...groups.values()].sort((a, b) => b.total - a.total);
}

export function Results({ result, drawn, onChangeAnswers, onEditFields, onStartAgain }: Props) {
  const { summary, income, costs_covered } = result;
  const oneOff = groupPayments(result, "one_off");
  const annual = groupPayments(result, "annual");
  const maint = income.annual_maintenance;
  const notApplied = new Map<string, { payment: string; reason: string; total: number }>();
  for (const b of result.blocks)
    for (const n of b.not_applied) {
      const cur = notApplied.get(n.code) ?? { payment: n.payment, reason: n.reason, total: 0 };
      cur.total += n.would_be_gbp;
      notApplied.set(n.code, cur);
    }
  const flags = [
    ...result.site_flags.map((f) => ({ where: "Whole site", text: f.explanation })),
    ...result.blocks.flatMap((b) => b.flags.map((f) => ({ where: b.name, text: f.explanation }))),
  ];

  return (
    <div className="space-y-10">
      <section aria-labelledby="estimate-heading">
        <h1 id="estimate-heading" className="text-3xl font-bold text-moss">
          Your estimate
        </h1>
        <p className="mt-2 text-lg">
          {hectares(summary.drawn_ha)} drawn · <strong>{hectares(summary.eligible_ha)} could be planted</strong>
        </p>

        {summary.meets_site_minimum ? (
          <div className="mt-6 grid gap-4 md:grid-cols-[3fr_2fr]">
            <div className="rounded border-2 border-moss bg-white p-5">
              <h2 className="text-lg font-bold">Payments you could receive</h2>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-3">
                <p>
                  <span className="block text-3xl font-bold tabular-nums">{aboutMoney(income.one_off_total_gbp)}</span>
                  <span className="text-muted">one-off</span>
                </p>
                {maint.per_year_gbp > 0 && (
                  <p>
                    <span className="block text-3xl font-bold tabular-nums">{aboutMoney(maint.per_year_gbp)}</span>
                    <span className="text-muted">a year for {maint.years} years</span>
                  </p>
                )}
              </div>
              <p className="mt-4 border-t border-line pt-3">
                Over {maint.years ?? 15} years: <strong>{aboutMoney(income.total_income_gbp)} in total</strong>
              </p>
            </div>
            <div className="rounded border-2 border-dashed border-muted bg-white p-5">
              <h2 className="text-lg font-bold">Costs covered (not income)</h2>
              <p className="mt-3">
                Planting costs covered up to
                <strong className="block text-2xl tabular-nums">{aboutMoney(costs_covered.planting_costs_up_to_gbp)}</strong>
              </p>
              <p className="mt-2 text-sm text-muted">
                This pays back what you spend on planting and protecting the trees. It is not extra money.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded border-l-4 border-clay bg-clay-tint p-5" role="status">
            <h2 className="text-lg font-bold">Not enough of this land could be planted</h2>
            <p className="mt-2">
              Woodland creation payments need at least 1 hectare that could be planted, so we haven&apos;t
              worked out any payments. See below for what was left out and why.
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="map-heading">
        <h2 id="map-heading" className="text-xl font-bold">
          What could be planted
        </h2>
        <div className="mt-3">
          <ResultsMap blocks={result.blocks} drawn={drawn} />
        </div>
      </section>

      {oneOff.length > 0 && (
        <section aria-labelledby="bonus-heading">
          <h2 id="bonus-heading" className="text-xl font-bold">
            Bonus payments (one-off)
          </h2>
          <p className="mt-1 text-sm text-muted">Paid once the planting is finished. Exact amounts.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {oneOff.map((g) => (
              <PaymentCard key={g.code} group={g} />
            ))}
          </div>
        </section>
      )}

      {annual.length > 0 && (
        <section aria-labelledby="yearly-heading">
          <h2 id="yearly-heading" className="text-xl font-bold">
            Yearly payment
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {annual.map((g) => (
              <PaymentCard key={g.code} group={g} />
            ))}
          </div>
        </section>
      )}

      {notApplied.size > 0 && (
        <section aria-labelledby="also-heading">
          <h2 id="also-heading" className="text-xl font-bold">
            You could also get
          </h2>
          {[...notApplied].map(([code, n]) => (
            <div key={code} className="mt-4 rounded border-l-4 border-moss bg-moss-tint p-4">
              <p className="font-semibold">
                {code === "recreational_access"
                  ? `Allowing public access would add ${money(n.total)}`
                  : `${n.payment} would add ${money(n.total)}`}
              </p>
              <p className="mt-1 text-sm">{n.reason}</p>
              <button
                type="button"
                onClick={onChangeAnswers}
                className="mt-3 min-h-11 rounded border-2 border-moss bg-white px-4 font-semibold text-moss hover:bg-white/70"
              >
                Change answers
              </button>
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="fields-heading">
        <h2 id="fields-heading" className="text-xl font-bold">
          Field by field
        </h2>
        <div className="mt-3 overflow-x-auto rounded border border-line bg-white">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-moss-tint">
              <tr>
                <th scope="col" className="p-3">Field</th>
                <th scope="col" className="p-3 text-right">Drawn</th>
                <th scope="col" className="p-3">Left out</th>
                <th scope="col" className="p-3 text-right">Could be planted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {result.blocks.map((b) => (
                <tr key={b.block} className="align-top">
                  <th scope="row" className="p-3 font-semibold">
                    {b.name}
                    {!b.meets_block_minimum && (
                      <span className="mt-1 block font-normal text-clay-text">Under 0.1 ha: not paid</span>
                    )}
                  </th>
                  <td className="p-3 text-right tabular-nums">{hectares(b.drawn_ha)}</td>
                  <td className="p-3">
                    {b.removed.length === 0
                      ? "Nothing"
                      : b.removed.map((r) => (
                          <span key={r.code} className="block">
                            {r.reason}: {hectares(r.ha)}
                          </span>
                        ))}
                  </td>
                  <td className="p-3 text-right font-semibold tabular-nums">{hectares(b.eligible_ha)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="detail-heading" className="space-y-3">
        <h2 id="detail-heading" className="text-xl font-bold">
          Before you rely on this
        </h2>
        <details className="rounded border border-line bg-white p-4">
          <summary className="cursor-pointer font-semibold">Things to check ({flags.length})</summary>
          {flags.length === 0 ? (
            <p className="mt-2 text-sm">Nothing flagged on the land that could be planted.</p>
          ) : (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {flags.map((f, i) => (
                <li key={i}>
                  <strong>{f.where}:</strong> {f.text}
                </li>
              ))}
            </ul>
          )}
          {result.blocks.some((b) => b.removed.length > 0) && (
            <>
              <p className="mt-3 text-sm font-semibold">Why land was left out</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {[...new Map(result.blocks.flatMap((b) => b.removed.map((r) => [r.code, r]))).values()].map((r) => (
                  <li key={r.code}>
                    <strong>{r.reason}:</strong> {r.explanation}
                  </li>
                ))}
              </ul>
            </>
          )}
        </details>
        <details className="rounded border border-line bg-white p-4">
          <summary className="cursor-pointer font-semibold">What this estimate can&apos;t check</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {result.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
        <details className="rounded border border-line bg-white p-4">
          <summary className="cursor-pointer font-semibold">Sources and rates</summary>
          <p className="mt-2 text-sm">Rates checked against gov.uk on {longDate(result.rates_checked)}.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {result.sources.map((s) => (
              <li key={s}>
                <a href={s} className="text-moss underline" rel="noreferrer" target="_blank">
                  {s.includes("additional-contributions") ? "EWCO additional contributions (gov.uk)" : "England Woodland Creation Offer (gov.uk)"}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">
            Map data from Natural England, Historic England, the Forestry Commission and ONS (see footer).
          </p>
        </details>
      </section>

      <div className="flex flex-wrap gap-3 border-t border-line pt-6">
        <button
          type="button"
          onClick={onChangeAnswers}
          className="min-h-11 rounded border-2 border-moss bg-white px-4 font-semibold text-moss hover:bg-moss-tint"
        >
          Change answers
        </button>
        <button
          type="button"
          onClick={onEditFields}
          className="min-h-11 rounded border-2 border-moss bg-white px-4 font-semibold text-moss hover:bg-moss-tint"
        >
          Edit fields
        </button>
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

function PaymentCard({ group }: { group: Grouped }) {
  const first = group.perBlock[0].payment;
  const w = wordingFor(group.code);
  const annual = first.kind === "annual";
  return (
    <article className="flex flex-col rounded border border-line bg-white p-4">
      <h3 className="font-bold">{w.title}</h3>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        {money(group.total)}
        {annual && <span className="text-base font-normal text-muted"> a year for {first.years} years</span>}
      </p>
      {annual && <p className="text-sm text-muted">{money(group.total * (first.years ?? 1))} in total</p>}
      <p className="mt-2">{w.why(first)}</p>
      <p className="mt-2 rounded border-l-4 border-sage bg-paper p-2 text-sm">{first.condition}</p>
      <details className="mt-2 text-sm text-muted">
        <summary className="cursor-pointer">Detail</summary>
        <p className="mt-1">{w.detail}</p>
        <p className="mt-1">
          {money(first.rate_gbp)} {first.unit.replace("£", "")}
        </p>
        <ul className="mt-1">
          {group.perBlock.map(({ name, payment }) => (
            <li key={name}>
              {name}: {hectares(payment.ha)} → {money(payment.amount_gbp)}
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
