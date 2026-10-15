"use client";

type Props = {
  value: boolean | null;
  onChange(value: boolean): void;
  error: boolean;
};

export function AccessQuestion({ value, onChange, error }: Props) {
  return (
    <fieldset aria-describedby="access-hint" aria-invalid={error || undefined}>
      <legend className="text-2xl font-bold">Would you allow public access on foot for 30 years?</legend>
      <p id="access-hint" className="mt-2 max-w-2xl text-muted">
        Free access on foot, with paths, in daylight all year. On eligible land near towns this can
        add £3,700 per hectare.
      </p>
      {error && (
        <p className="mt-3 font-semibold text-clay-text" role="alert">
          Choose yes or no to continue.
        </p>
      )}
      <div className="mt-4 space-y-3">
        {[
          { v: true, label: "Yes" },
          { v: false, label: "No" },
        ].map(({ v, label }) => (
          <label
            key={label}
            className={`flex min-h-12 max-w-md cursor-pointer items-center gap-3 rounded border-2 bg-white px-4 ${
              value === v ? "border-moss" : "border-line"
            }`}
          >
            <input
              type="radio"
              name="access"
              checked={value === v}
              onChange={() => onChange(v)}
              className="h-6 w-6 accent-moss"
            />
            <span className="text-lg">{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
