"use client";

import { ChevronDown, Layers as LayersIcon, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { hatchBackground } from "@/lib/patterns";
import type { SiteContext } from "@/lib/screen";
import { cn } from "@/lib/utils";
import {
  contextLabel,
  EXCLUSION_COLOUR,
  exclusionByLayer,
  exclusionIcons,
  flagByLayer,
  flagIcons,
  paymentColours,
  paymentIcons,
  PLANTABLE_COLOUR,
  targetStyleFor,
} from "@/lib/wording";

type Props = {
  context: SiteContext | null;
  contextState: "idle" | "loading" | "ready" | "unavailable";
  hasResult: boolean;
  shown: Record<string, boolean>;
  onChange(id: string, on: boolean): void;
  /** Phones: start collapsed so the key doesn't cover the map. */
  defaultOpen: boolean;
};

type Swatch = { background: string; border: string };

function swatchFor(layer: SiteContext["layers"][number]): Swatch {
  if (layer.kind === "exclusion") {
    return { background: hatchBackground(exclusionByLayer[layer.layer_id] ?? ""), border: `1px solid ${EXCLUSION_COLOUR}` };
  }
  if (layer.kind === "flag") return { background: "transparent", border: "2px dotted #1f2421" };
  const code = layer.payments?.[0];
  const colour = (code && paymentColours[code]) || PLANTABLE_COLOUR;
  const style = targetStyleFor(code);
  const alpha = Math.round(style.opacity * 255).toString(16).padStart(2, "0");
  return { background: `${colour}${alpha}`, border: `2px ${style.line} ${colour}` };
}

function iconFor(layer: SiteContext["layers"][number]): LucideIcon | undefined {
  if (layer.kind === "target") return layer.payments?.[0] ? paymentIcons[layer.payments[0]] : undefined;
  if (layer.kind === "exclusion") return exclusionIcons[exclusionByLayer[layer.layer_id] ?? ""];
  return flagIcons[flagByLayer[layer.layer_id] ?? ""];
}

function Row({
  id,
  label,
  swatch,
  Icon,
  on,
  onChange,
}: {
  id: string;
  label: string;
  swatch: Swatch;
  Icon?: LucideIcon;
  on: boolean;
  onChange(id: string, on: boolean): void;
}) {
  const inputId = `layer-${id.replace(/[^a-z0-9]/gi, "-")}`;
  return (
    <div className="flex min-h-9 items-center gap-2 coarse:min-h-11">
      <Checkbox id={inputId} checked={on} onCheckedChange={(v) => onChange(id, v === true)} />
      <span aria-hidden="true" className="inline-block h-3.5 w-5 shrink-0 rounded-[3px]" style={swatch} />
      {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0 text-muted" />}
      <label htmlFor={inputId} className="flex-1 cursor-pointer text-xs leading-4">
        {label}
      </label>
    </div>
  );
}

const GROUPS: { kind: "target" | "exclusion" | "flag"; title: string }[] = [
  { kind: "target", title: "Payment areas" },
  { kind: "exclusion", title: "Can't plant" },
  { kind: "flag", title: "Worth checking" },
];

export function MapLegend({ context, contextState, hasResult, shown, onChange, defaultOpen }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="pointer-events-auto w-64 max-w-[calc(100vw-1.5rem)] rounded-lg border border-line bg-white shadow-md"
    >
      <CollapsibleTrigger className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm font-semibold coarse:h-11">
        <LayersIcon aria-hidden="true" className="size-4 text-muted" />
        <span className="flex-1 text-left">Map key</span>
        <ChevronDown aria-hidden="true" className={cn("size-4 transition-transform", open && "rotate-180")} />
      </CollapsibleTrigger>
      <CollapsibleContent className="max-h-[min(55vh,480px)] overflow-y-auto border-t border-line px-3 pt-2 pb-3">
        <fieldset>
          <legend className="text-xs font-semibold tracking-wide text-muted uppercase">Your estimate</legend>
          <div className="mt-1 flex min-h-9 items-center gap-2 pl-6 coarse:min-h-11">
            <span aria-hidden="true" className="inline-block h-3.5 w-5 shrink-0 rounded-[3px] border-[3px] border-ink bg-white" />
            <span className="text-xs">Your fields</span>
          </div>
          {hasResult ? (
            <>
              <Row
                id="plantable"
                label="Could be planted"
                swatch={{ background: `${PLANTABLE_COLOUR}66`, border: `1px solid ${PLANTABLE_COLOUR}` }}
                on={shown["plantable"] !== false}
                onChange={onChange}
              />
              <Row
                id="left-out"
                label="Left out (hatched by reason)"
                swatch={{ background: hatchBackground("sssi"), border: `1px solid ${EXCLUSION_COLOUR}` }}
                on={shown["left-out"] !== false}
                onChange={onChange}
              />
            </>
          ) : (
            <div className="flex min-h-9 items-center gap-2 pl-6 coarse:min-h-11">
              <span aria-hidden="true" className="inline-block h-3.5 w-5 shrink-0 rounded-[3px] border-2 border-dashed border-moss" />
              <span className="text-xs">Area we cover</span>
            </div>
          )}
        </fieldset>
        {hasResult && contextState === "loading" && <p className="mt-2 text-xs text-muted">Loading nearby layers…</p>}
        {hasResult && contextState === "unavailable" && (
          <p className="mt-2 text-xs text-muted">Nearby layers aren&apos;t available right now (very large areas can take too long).</p>
        )}
        {hasResult &&
          context &&
          GROUPS.map(({ kind, title }) => {
            const layers = context.layers.filter((l) => l.kind === kind && l.geometry);
            if (layers.length === 0) return null;
            return (
              <fieldset key={kind} className="mt-3">
                <legend className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</legend>
                <div className="mt-1">
                  {layers.map((l) => (
                    <Row
                      key={l.id}
                      id={l.id}
                      label={contextLabel(l)}
                      swatch={swatchFor(l)}
                      Icon={iconFor(l)}
                      on={Boolean(shown[l.id])}
                      onChange={onChange}
                    />
                  ))}
                </div>
              </fieldset>
            );
          })}
        {hasResult && context && (
          <p className="mt-3 text-xs text-muted">
            Shapes within {context.buffer_m / 1000} km of your fields, simplified to about {context.simplified_m} m.
          </p>
        )}
        {!hasResult && <p className="mt-2 text-xs text-muted">Payment areas and land that can&apos;t be planted appear here with your estimate.</p>}
      </CollapsibleContent>
    </Collapsible>
  );
}
