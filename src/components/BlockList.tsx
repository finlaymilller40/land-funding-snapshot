"use client";

import { MapPin, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { hectares } from "@/lib/format";

export type ListedBlock = { id: string; name: string; ha: number; outsideHa: number; editable: boolean };

type Props = {
  blocks: ListedBlock[];
  onRename(id: string, name: string): void;
  onDelete(id: string): void;
  onShow(id: string): void;
};

export function BlockList({ blocks, onRename, onDelete, onShow }: Props) {
  const total = blocks.reduce((sum, b) => sum + b.ha, 0);

  if (blocks.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line bg-white p-4 text-sm text-muted">
        No fields yet. Draw one on the map or upload a file.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">
          {blocks.length} field{blocks.length === 1 ? "" : "s"}
        </h2>
        <p className="text-sm font-semibold tabular-nums">about {hectares(total)}</p>
      </div>
      <p className="text-xs text-muted">Areas are approximate until you see your estimate.</p>
      <ul className="mt-2 divide-y divide-line rounded-lg border border-line bg-white">
        {blocks.map((b, i) => (
          <li key={b.id} className="p-3">
            <div className="flex items-center gap-2">
              <label htmlFor={`name-${b.id}`} className="sr-only">
                Field {i + 1} name
              </label>
              <Input
                id={`name-${b.id}`}
                value={b.name}
                maxLength={60}
                onChange={(e) => onRename(b.id, e.target.value)}
                className="h-9 min-w-0 flex-1 coarse:h-11"
              />
              <span className="w-20 shrink-0 text-right text-sm tabular-nums">{hectares(b.ha)}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => onShow(b.id)} aria-label={`Show ${b.name} on map`} title="Show on map">
                <MapPin aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onDelete(b.id)}
                aria-label={`Delete ${b.name}`}
                title="Delete"
                className="text-clay-text hover:bg-clay-tint hover:text-clay-text"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
            {b.outsideHa > 0 && (
              <p className="mt-2 rounded-md bg-warn-bg px-3 py-2 text-xs font-semibold text-warn-text" role="status">
                {b.outsideHa >= b.ha - 0.01
                  ? "This field is outside the area we cover, so it will be left out. Move or delete it."
                  : `About ${hectares(b.outsideHa)} of this field is outside the area we cover and will be left out.`}
              </p>
            )}
            {!b.editable && (
              <p className="mt-2 text-xs text-muted">
                Uploaded as several parts, so it can be renamed or deleted but not reshaped on the map.
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
