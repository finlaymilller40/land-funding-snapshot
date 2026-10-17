"use client";

import { cn } from "@/lib/utils";

type Props = {
  value: boolean | null;
  onChange(value: boolean): void;
  error: boolean;
};

export function AccessQuestion({ value, onChange, error }: Props) {
  return (
    <fieldset aria-describedby="access-hint" aria-invalid={error || undefined}>
      <legend className="text-xl font-bold">Would you allow public access on foot for 30 years?</legend>
      {/* £3,700 is hard-coded: no public function returns the rate before an
          estimate runs. Update by hand if rules.ewco_rates changes (D60). */}
      <p id="access-hint" className="mt-2 text-sm text-muted">
        Free access on foot, with paths, in daylight all year. On eligible land near towns this can add £3,700 per
        hectare. You can change your answer on the results.
      </p>
      {error && (
        <p className="mt-3 text-sm font-semibold text-clay-text" role="alert">
          Choose yes or no to continue.
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {[
          { v: true, label: "Yes" },
          { v: false, label: "No" },
        ].map(({ v, label }) => (
          <label
            key={label}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border-2 bg-white px-4 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-ink",
              value === v ? "border-moss bg-moss-tint" : "border-line hover:border-moss/50",
            )}
          >
            <input type="radio" name="access" checked={value === v} onChange={() => onChange(v)} className="size-5 accent-moss" />
            <span className="text-base font-semibold">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
