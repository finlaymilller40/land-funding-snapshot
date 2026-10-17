import { ArrowRight, Trees } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-ink no-underline">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-md bg-moss text-white">
            <Trees className="size-4" />
          </span>
          <span className="max-[400px]:sr-only">Land Funding Snapshot</span>
        </Link>
        <Badge variant="partly">Prototype</Badge>
        <nav aria-label="Page sections" className="ml-auto hidden items-center gap-6 text-sm md:flex">
          <a href="#how-it-works" className="text-ink hover:text-moss">
            How it works
          </a>
          <a href="#region" className="text-ink hover:text-moss">
            Area covered
          </a>
        </nav>
        <Button asChild size="sm" className="ml-auto md:ml-0">
          <Link href="/check">
            Check your land
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </header>
  );
}
