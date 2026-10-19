import { ArrowRight, Footprints, ListChecks, PenLine } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { RegionOutline } from "@/components/RegionOutline";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import preview from "../../public/workspace-preview.webp";

const steps = [
  {
    Icon: PenLine,
    title: "Draw your fields",
    text: "Find your land by postcode, then draw each field on the map or upload a file.",
  },
  {
    Icon: Footprints,
    title: "Answer one question",
    text: "Would you allow public access on foot? Near towns it can add a bonus.",
  },
  {
    Icon: ListChecks,
    title: "See your estimate",
    text: "What could be planted, which payments apply with honest ranges, and what each one asks of you.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        {/* Hero */}
        <section className="border-b border-line bg-gradient-to-b from-white to-paper">
          <div className="mx-auto max-w-6xl px-4 pt-12 pb-10 sm:pt-20">
            <p className="text-sm font-semibold text-moss">England Woodland Creation Offer · Cambridgeshire &amp; Peterborough</p>
            <h1 className="mt-3 max-w-3xl text-3xl leading-tight font-bold tracking-tight text-ink sm:text-4xl">
              See what woodland funding your land could earn, in minutes.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-muted sm:text-lg">
              Draw your fields and get a plain-English estimate: what could be planted, what is left out and why, which
              payments apply, and what each one would ask of you.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="h-12 px-6 text-base">
                <Link href="/check">
                  Check your land
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg" className="h-12">
                <a href="#how-it-works">How it works</a>
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted">Free to use. No sign-up.</p>

            {/* Preview of the workspace */}
            <figure className="mt-12">
              <div className="overflow-hidden rounded-xl border border-line bg-white shadow-[0_24px_60px_-20px_rgba(31,36,33,0.35)]">
                <div aria-hidden="true" className="flex h-8 items-center gap-1.5 border-b border-line bg-paper px-3">
                  <span className="size-2.5 rounded-full bg-line" />
                  <span className="size-2.5 rounded-full bg-line" />
                  <span className="size-2.5 rounded-full bg-line" />
                </div>
                <Image
                  src={preview}
                  alt="The workspace: two fields drawn on the map with the riverside shade target area highlighted, and the estimate panel open on the riverside shade payment, showing what it pays, why your land qualifies and a checklist of what you'd have to do."
                  priority
                  sizes="(min-width: 1152px) 1120px, 100vw"
                  className="h-auto w-full"
                />
              </div>
              <figcaption className="mt-3 text-center text-xs text-muted">
                The workspace on two test fields. Map © OpenFreeMap, © OpenMapTiles, data © OpenStreetMap contributors.
              </figcaption>
            </figure>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 id="how-heading" className="text-2xl font-bold">
              How it works
            </h2>
            <ol className="mt-8 grid gap-6 md:grid-cols-3">
              {steps.map(({ Icon, title, text }, i) => (
                <li key={title} className="rounded-xl border border-line bg-white p-6">
                  <div className="flex items-center gap-3">
                    <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-lg bg-moss-tint text-moss">
                      <Icon className="size-5" />
                    </span>
                    <span className="text-sm font-semibold text-muted">Step {i + 1}</span>
                  </div>
                  <h3 className="mt-4 text-lg font-bold">{title}</h3>
                  <p className="mt-1 text-sm text-muted">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Region covered */}
        <section id="region" aria-labelledby="region-heading" className="scroll-mt-16 border-y border-line bg-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 md:grid-cols-[1fr_minmax(0,360px)]">
            <div>
              <h2 id="region-heading" className="text-2xl font-bold">
                Area covered
              </h2>
              <p className="mt-3 max-w-xl text-base">
                This prototype covers <strong>Cambridgeshire and Peterborough</strong> only. Draw land anywhere inside the
                dashed outline.
              </p>
              <ul className="mt-4 max-w-xl space-y-2 text-sm text-muted">
                <li>Checked against 15 open map layers for the area, from protected sites to deep peat and open water.</li>
                <li>Rates and rules from the England Woodland Creation Offer guidance on gov.uk, with the date checked.</li>
                <li>Each field is checked separately, the way payments are worked out.</li>
              </ul>
              <Button asChild size="lg" className="mt-8 h-12 px-6 text-base">
                <Link href="/check">
                  Check your land
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <RegionOutline className="mx-auto w-full max-w-[360px]" />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
