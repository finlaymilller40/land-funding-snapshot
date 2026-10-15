"use client";

import { useState } from "react";

type Props = { onFound(lon: number, lat: number): void };

export function PostcodeSearch({ onFound }: Props) {
  const [postcode, setPostcode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    const value = postcode.trim();
    if (!value) {
      setMessage("Enter a postcode, for example PE28 0AA.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(value)}`);
      const body = (await res.json()) as { result?: { longitude: number | null; latitude: number | null } };
      const r = body.result;
      if (!res.ok || !r || r.longitude == null || r.latitude == null) {
        setMessage("We couldn't find that postcode. Check it and try again, or move the map yourself.");
      } else {
        onFound(r.longitude, r.latitude);
        setMessage(`Showing ${value.toUpperCase()}.`);
      }
    } catch {
      setMessage("Postcode search isn't available right now. You can still move the map yourself.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={search} className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="postcode" className="block font-semibold">
          Postcode
        </label>
        <input
          id="postcode"
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
          autoComplete="postal-code"
          spellCheck={false}
          className="mt-1 min-h-11 w-40 rounded border-2 border-ink bg-white px-3 uppercase"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 rounded bg-moss px-4 font-semibold text-white hover:bg-moss-dark disabled:opacity-60"
      >
        {busy ? "Finding…" : "Find"}
      </button>
      <p className="w-full text-sm text-muted" role="status">
        {message}
      </p>
    </form>
  );
}
