"use client";

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
      <p className="rounded border border-dashed border-line bg-white p-4 text-muted">
        No fields yet. Draw one on the map or upload a file.
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-bold">Your fields</h2>
        <p className="font-semibold">Total about {hectares(total)}</p>
      </div>
      <p className="mt-1 text-sm text-muted">Areas are approximate until you see your estimate.</p>
      <ul className="mt-3 divide-y divide-line rounded border border-line bg-white">
        {blocks.map((b, i) => (
          <li key={b.id} className="p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <label htmlFor={`name-${b.id}`} className="block text-sm text-muted">
                  Field {i + 1} name
                </label>
                <input
                  id={`name-${b.id}`}
                  value={b.name}
                  maxLength={60}
                  onChange={(e) => onRename(b.id, e.target.value)}
                  className="mt-1 min-h-11 w-full rounded border-2 border-ink bg-white px-3"
                />
              </div>
              <p className="min-h-11 py-2 font-semibold tabular-nums">{hectares(b.ha)}</p>
              <button
                type="button"
                onClick={() => onShow(b.id)}
                className="min-h-11 rounded border border-line bg-white px-3 text-sm font-semibold hover:bg-moss-tint"
              >
                Show<span className="sr-only"> {b.name}</span> on map
              </button>
              <button
                type="button"
                onClick={() => onDelete(b.id)}
                className="min-h-11 rounded border border-clay-text px-3 text-sm font-semibold text-clay-text hover:bg-clay-tint"
              >
                Delete<span className="sr-only"> {b.name}</span>
              </button>
            </div>
            {b.outsideHa > 0 && (
              <p className="mt-2 rounded bg-warn-bg px-3 py-2 text-sm font-semibold text-warn-text" role="alert">
                {b.outsideHa >= b.ha - 0.01
                  ? "This field is outside the area we cover. Move or delete it to continue."
                  : `${hectares(b.outsideHa)} of this field is outside the area we cover. Edit or delete it to continue.`}
              </p>
            )}
            {!b.editable && (
              <p className="mt-2 text-sm text-muted">
                Uploaded as several parts, so it can be renamed or deleted but not reshaped on the map.
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
