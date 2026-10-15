"use client";

import { useState } from "react";
import { parseUpload, type UploadedBlock } from "@/lib/geo";

type Props = { onBlocks(blocks: UploadedBlock[]): void };

const MAX_BYTES = 5 * 1024 * 1024;

export function GeoJsonUpload({ onBlocks }: Props) {
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
    <details className="rounded border border-line bg-white p-3">
      <summary className="cursor-pointer font-semibold">Or upload a GeoJSON file</summary>
      <p className="mt-2 text-sm text-muted">
        One shape per field, in longitude and latitude (WGS84). Most mapping tools can export this.
      </p>
      <label htmlFor="upload" className="mt-3 block font-semibold">
        Choose a file
      </label>
      <input
        id="upload"
        type="file"
        accept=".geojson,.json,application/geo+json,application/json"
        onChange={handleFile}
        className="mt-1 block w-full text-sm file:mr-3 file:min-h-11 file:rounded file:border-0 file:bg-moss file:px-4 file:font-semibold file:text-white"
      />
      {message && (
        <p
          role={message.error ? "alert" : "status"}
          className={`mt-2 text-sm ${message.error ? "font-semibold text-clay-text" : "text-muted"}`}
        >
          {message.text}
        </p>
      )}
    </details>
  );
}
