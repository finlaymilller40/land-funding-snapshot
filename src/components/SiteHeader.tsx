import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b-4 border-moss bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="text-lg font-bold text-moss no-underline hover:underline"
        >
          Land Funding Snapshot
        </Link>
        <span className="rounded border border-warn-text/40 bg-warn-bg px-2 py-0.5 text-sm font-semibold text-warn-text">
          Prototype
        </span>
      </div>
    </header>
  );
}
