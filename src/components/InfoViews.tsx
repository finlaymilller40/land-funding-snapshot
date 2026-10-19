"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { longDate, money } from "@/lib/format";
import type { ScreenResult } from "@/lib/screen";
import { wordingFor } from "@/lib/wording";

function ViewHeader({ title, intro }: { title: string; intro?: ReactNode }) {
  return (
    <header className="pb-4">
      <h1 tabIndex={-1} className="text-xl font-bold">
        {title}
      </h1>
      {intro && <p className="mt-1 text-sm text-muted">{intro}</p>}
    </header>
  );
}

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-moss underline">
      {children}
      <ExternalLink aria-hidden="true" className="size-3" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

function NeedsEstimate({ what, onGoToWorkspace }: { what: string; onGoToWorkspace(): void }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-white p-4 text-sm">
      <p>{what}</p>
      <Button className="mt-3" size="sm" onClick={onGoToWorkspace}>
        Go to the workspace
      </Button>
    </div>
  );
}

export function GuideView({ result, onGoToWorkspace }: { result: ScreenResult | null; onGoToWorkspace(): void }) {
  return (
    <div>
      <ViewHeader title="How to get this" intro="The steps from gov.uk, in order, for the land you've drawn." />
      {!result ? (
        <NeedsEstimate what="Draw your land and see your estimate first: some steps depend on how much could be planted." onGoToWorkspace={onGoToWorkspace} />
      ) : (
        <ol className="space-y-4">
          {result.next_steps.map((s, i) => (
            <li key={s.code} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-moss text-sm font-bold text-white">
                {i + 1}
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold">{s.title}</h2>
                <p className="mt-0.5 text-sm">{s.body}</p>
                <SourceLink href={s.source_url}>Source (gov.uk)</SourceLink>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Rates used in this result: payments, costs, and bonuses checked but not on this land. */
function ratesOf(result: ScreenResult) {
  const rows = new Map<string, { name: string; rate: string; source?: string; section?: string }>();
  const add = (code: string, rate: string) => {
    if (rows.has(code)) return;
    const d = result.payment_details[code];
    rows.set(code, { name: wordingFor(code).title, rate, source: d?.source_url, section: d?.source_section });
  };
  for (const b of result.blocks) {
    for (const p of b.payments) add(p.code, p.kind === "annual" ? `${money(p.rate_gbp)}/ha a year for ${p.years} years` : `${money(p.rate_gbp)}/ha`);
    for (const c of b.costs_covered) add(c.code, `up to ${money(c.rate_gbp)}/ha (average cap)`);
  }
  for (const n of result.not_on_this_land) {
    if (rows.has(n.code)) continue;
    rows.set(n.code, {
      name: `${wordingFor(n.codes[0]).title} (not on this land)`,
      rate: n.rate_low_gbp === n.rate_high_gbp ? `${money(n.rate_high_gbp)}/ha` : `${money(n.rate_low_gbp)}–${money(n.rate_high_gbp)}/ha`,
    });
  }
  return [...rows.values()];
}

export function SourcesView({ result, onGoToWorkspace }: { result: ScreenResult | null; onGoToWorkspace(): void }) {
  return (
    <div className="space-y-6">
      <ViewHeader title="Sources & rates" intro="Where every number and rule comes from." />
      <section aria-labelledby="rates-heading">
        <h2 id="rates-heading" className="text-base font-semibold">
          Rates in your estimate
        </h2>
        {!result ? (
          <div className="mt-2">
            <NeedsEstimate what="Rates appear here once you've seen an estimate." onGoToWorkspace={onGoToWorkspace} />
          </div>
        ) : (
          <>
            <p className="text-xs text-muted">Checked against gov.uk on {longDate(result.rates_checked)}.</p>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th scope="col" className="py-1 font-semibold">
                    Payment
                  </th>
                  <th scope="col" className="py-1 text-right font-semibold">
                    Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {ratesOf(result).map((r) => (
                  <tr key={r.name} className="border-b border-line align-top">
                    <td className="py-2 pr-2">
                      {r.name}
                      {r.source && (
                        <span className="block">
                          <SourceLink href={r.source}>{r.section}</SourceLink>
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">{r.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      {result && (
        <section aria-labelledby="limits-heading">
          <h2 id="limits-heading" className="text-base font-semibold">
            What this estimate can&apos;t check
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {result.limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="guidance-heading">
        <h2 id="guidance-heading" className="text-base font-semibold">
          Scheme guidance
        </h2>
        <ul className="mt-2 space-y-1">
          <li>
            <SourceLink href="https://www.gov.uk/guidance/england-woodland-creation-offer">England Woodland Creation Offer</SourceLink>
          </li>
          <li>
            <SourceLink href="https://www.gov.uk/government/publications/apply-for-the-england-woodland-creation-offer/additional-contributions-for-ewco">
              Additional contributions for EWCO
            </SourceLink>
          </li>
          <li>
            <SourceLink href="https://www.gov.uk/guidance/environmental-impact-assessments-for-woodland">
              Environmental impact assessments for woodland
            </SourceLink>
          </li>
        </ul>
      </section>

      <section aria-labelledby="data-heading">
        <h2 id="data-heading" className="text-base font-semibold">
          Map data
        </h2>
        <p className="mt-2 text-sm">Contains public sector information licensed under the Open Government Licence v3.0.</p>
        <p className="mt-2 text-sm">
          Contains data from Natural England, Historic England, the Forestry Commission and the Office for National
          Statistics, used under the Open Government Licence v3.0. England Peat Status is used under the Non-Commercial
          Government Licence. Contains OS data © Crown copyright and database right 2026.
        </p>
        <p className="mt-2 text-sm">
          Basemap © OpenFreeMap, © OpenMapTiles, data © OpenStreetMap contributors. Aerial imagery © Esri, Maxar, Earthstar
          Geographics, and the GIS User Community. Postcode search by postcodes.io (Office for National Statistics data).
        </p>
      </section>
    </div>
  );
}

export function AboutView() {
  return (
    <div className="space-y-4 text-sm">
      <ViewHeader title="About" />
      <p>
        <strong>Land Funding Snapshot</strong> gives a landowner a quick, plain-English estimate of England Woodland
        Creation Offer (EWCO) funding for land they draw on a map: what could be planted, what is left out and why, which
        payments apply, and what to do next.
      </p>
      <p>
        Eligibility and money are worked out by rules in the database, from public map data and the gov.uk rates. Ranges
        are shown honestly, and income is never added to costs covered.
      </p>
      <p>
        It covers <strong>Cambridgeshire and Peterborough</strong> only, for now.
      </p>
      <p className="rounded-lg bg-warn-bg p-3 text-warn-text">
        This is a prototype. It is an estimate, not an offer of grant or financial advice. The Forestry Commission decides
        eligibility and payments.
      </p>
      <Link href="/" className="inline-block text-moss underline">
        Back to the start page
      </Link>
    </div>
  );
}
