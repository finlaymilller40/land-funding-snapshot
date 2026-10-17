"use client";

import { CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { FriendlyError } from "@/lib/screen";

type Props = { error: FriendlyError; onBackToMap(): void; onRetry(): void };

export function ErrorPanel({ error, onBackToMap, onRetry }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <div className="rounded-lg border-l-4 border-clay bg-clay-tint p-4" role="alert">
      <h1 ref={heading} tabIndex={-1} className="flex items-center gap-2 text-lg font-bold">
        <CircleAlert aria-hidden="true" className="size-5 shrink-0 text-clay-text" />
        {error.title}
      </h1>
      <p className="mt-1 text-sm">{error.detail}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {error.action === "retry" && <Button onClick={onRetry}>Try again</Button>}
        <Button variant={error.action === "map" ? "default" : "outline"} onClick={onBackToMap}>
          Back to fields
        </Button>
      </div>
    </div>
  );
}
