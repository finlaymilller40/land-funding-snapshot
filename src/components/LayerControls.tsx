"use client";

import type { SiteContext } from "@/lib/screen";
import { contextColour, contextLabel } from "@/lib/wording";

type Props = {
  context: SiteContext | null;
  contextState: "idle" | "loading" | "ready" | "unavailable";
  hasResult: boolean;
  shown: Record<string, boolean>;
  onChange(id: string, on: boolean): void;
};

const SECTIONS: { kind: "target" | "exclusion" | "flag"; title: string }[] = [
  { kind: "target", title: "Payment target areas" },
  { kind: "exclusion", title: "Land that can't be planted" },
  { kind: "flag", title: "Worth checking" },
];

function Row({ id, label, colour, on, onChange, dashed }: { id: string; label: string; colour: string; on: boolean; onChange(id: string, on: boolean): void; dashed?: boolean }) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2 py-0.5">
      <input type="checkbox" checked={on} onChange={(e) => onChange(id, e.target.checked)} className="h-5 w-5 shrink-0 accent-moss" />
      <span
        className="inline-block h-4 w-6 shrink-0 rounded-sm border border-ink/50"
        style={{ background: dashed ? "transparent" : colour, borderColor: dashed ? colour : undefined, borderWidth: dashed ? 3 : 1 }}
      />
      <span className="text-sm leading-tight">{label}</span>
    </label>
  );
}

export function LayerControls({ context, contextState, hasResult, shown, onChange }: Props) {
  if (!hasResult) return null;
  return (
    <details className="pointer-events-auto max-h-[60vh] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto rounded border border-line bg-white p-3 shadow">
      <summary className="cursor-pointer font-semibold">Map layers and key</summary>
      <div className="mt-2 space-y-3">
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted">Your estimate</legend>
          <Row id="plantable" label="Could be planted" colour="#7d9a6b" on={shown["plantable"] !== false} onChange={onChange} />
          <Row id="left-out" label="Left out (coloured by reason)" colour="#b4664a" on={shown["left-out"] !== false} onChange={onChange} />
        </fieldset>
        {contextState === "loading" && <p className="text-sm text-muted">Loading nearby layers…</p>}
        {contextState === "unavailable" && (
          <p className="text-sm text-muted">Nearby layers aren&apos;t available right now (very large areas can take too long).</p>
        )}
        {context &&
          SECTIONS.map(({ kind, title }) => {
            const layers = context.layers.filter((l) => l.kind === kind && l.geometry);
            if (layers.length === 0) return null;
            return (
              <fieldset key={kind}>
                <legend className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</legend>
                {layers.map((l) => (
                  <Row key={l.id} id={l.id} label={contextLabel(l)} colour={contextColour(l)} on={Boolean(shown[l.id])} onChange={onChange} />
                ))}
              </fieldset>
            );
          })}
        {context && (
          <p className="text-xs text-muted">
            Shapes within {context.buffer_m / 1000} km of your fields, simplified to about {context.simplified_m} m.
          </p>
        )}
      </div>
    </details>
  );
}
