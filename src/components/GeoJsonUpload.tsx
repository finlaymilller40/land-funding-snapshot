"use client";

import { Upload } from "lucide-react";
import { useId, useState } from "react";
import { parseUpload, type UploadedBlock } from "@/lib/geo";

type Props = { onBlocks(blocks: UploadedBlock[]): void };

const MAX_BYTES = 5 * 1024 * 1024;

export function GeoJsonUpload({ onBlocks }: Props) {
  const id = useId();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setMessage({ text: "That file is over 5 MB. Upload just the fields you want to check.", error: true });
      return;
    }
    const parsed = parseUpload(await file.text());
    if ("error" in parsed) {
      setMessage({ text: parsed.error, error: true });
      return;
    }
    onBlocks(parsed.blocks);
    const n = parsed.blocks.length;
    setMessage({ text: `Added ${n} field${n === 1 ? "" : "s"} from ${file.name}.`, error: false });
  }

  return (
    <div>
      <label
        htmlFor={id}
        className="flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line bg-white px-3 py-2 text-sm hover:border-moss hover:bg-moss-tint coarse:min-h-11 [&:has(+input:focus-visible)]:outline-3 [&:has(+input:focus-visible)]:outline-ink"
      >
        <Upload aria-hidden="true" className="size-4 text-muted" />
        <span>
          <span className="font-semibold">Upload a GeoJSON file</span>
          <span className="block text-xs text-muted">One shape per field, in longitude and latitude (WGS84).</span>
        </span>
      </label>
      <input
        id={id}
        type="file"
        accept=".geojson,.json,application/geo+json,application/json"
        onChange={handleFile}
        className="sr-only"
      />
      {message && (
        <p role={message.error ? "alert" : "status"} className={`mt-2 text-xs ${message.error ? "font-semibold text-clay-text" : "text-muted"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
