"use client";

import { useEffect, useRef } from "react";
import type { FriendlyError } from "@/lib/screen";

type Props = { error: FriendlyError; onBackToMap(): void; onRetry(): void };

export function ErrorPanel({ error, onBackToMap, onRetry }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <div className="rounded border-l-4 border-clay bg-clay-tint p-5" role="alert">
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold">
        {error.title}
      </h1>
      <p className="mt-2 max-w-2xl">{error.detail}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        {error.action === "retry" && (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 rounded bg-moss px-4 font-semibold text-white hover:bg-moss-dark"
          >
            Try again
          </button>
        )}
        <button
          type="button"
          onClick={onBackToMap}
          className={`min-h-11 rounded px-4 font-semibold ${
            error.action === "map" ? "bg-moss text-white hover:bg-moss-dark" : "border-2 border-moss bg-white text-moss"
          }`}
        >
          Back to map
        </button>
      </div>
    </div>
  );
}
