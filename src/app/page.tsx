import Link from "next/link";

const steps = [
  { title: "Draw your fields", text: "Find your land by postcode and draw each field, or upload a file." },
  { title: "Answer one question", text: "Would you allow public access on foot?" },
  { title: "See your estimate", text: "Payments, what the land could earn, and what to check next." },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      <h1 className="text-3xl font-bold leading-tight text-moss sm:text-4xl">
        What woodland funding could your land get?
      </h1>
      <p className="mt-4 text-lg">
        Draw your fields on a map and see which woodland creation payments they may qualify
        for, roughly how much they could earn, and what to check next.
      </p>
      <p className="mt-4 rounded border-l-4 border-moss bg-moss-tint px-4 py-3">
        This prototype covers <strong>Cambridgeshire and Peterborough</strong> only.
      </p>

      <Link
        href="/check"
        className="mt-8 inline-block rounded bg-moss px-6 py-3 text-lg font-semibold text-white no-underline shadow-[0_2px_0_#16241a] hover:bg-moss-dark"
      >
        Check your land
      </Link>

      <h2 className="mt-12 text-xl font-bold">How it works</h2>
      <ol className="mt-4 grid gap-4 sm:grid-cols-3">
        {steps.map((step, i) => (
          <li key={step.title} className="rounded border border-line bg-white p-4">
            <span className="text-sm font-semibold text-muted">Step {i + 1}</span>
            <p className="mt-1 font-semibold">{step.title}</p>
            <p className="mt-1 text-sm text-muted">{step.text}</p>
          </li>
        ))}
      </ol>

      <p className="mt-8 text-sm text-muted">
        Based on the England Woodland Creation Offer and public map data. It is an estimate,
        not an offer of grant.
      </p>
    </div>
  );
}
