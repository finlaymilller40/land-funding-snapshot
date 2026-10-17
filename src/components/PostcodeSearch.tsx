"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = { onFound(lon: number, lat: number): void; autoFocus?: boolean };

/** Compact postcode search for the top bar. Messages appear just below it. */
export function PostcodeSearch({ onFound, autoFocus }: Props) {
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
        setMessage("We couldn't find that postcode. Check it, or move the map yourself.");
      } else {
        onFound(r.longitude, r.latitude);
        setMessage(null);
      }
    } catch {
      setMessage("Postcode search isn't available right now. You can still move the map yourself.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={search} role="search" className="relative flex w-full items-center gap-1">
      <label htmlFor="postcode" className="sr-only">
        Find your land by postcode
      </label>
      <Input
        id="postcode"
        value={postcode}
        onChange={(e) => setPostcode(e.target.value)}
        placeholder="Postcode, e.g. PE28 0AA"
        autoComplete="postal-code"
        spellCheck={false}
        autoFocus={autoFocus}
        className="h-8 bg-white uppercase placeholder:normal-case coarse:h-11"
      />
      <Button type="submit" size="icon-sm" disabled={busy} aria-label={busy ? "Finding postcode" : "Find postcode"}>
        <Search aria-hidden="true" />
      </Button>
      <p
        role="status"
        className={message ? "absolute top-full right-0 left-0 z-40 mt-1 rounded-md border border-line bg-white px-3 py-2 text-xs shadow-md" : "sr-only"}
      >
        {message}
      </p>
    </form>
  );
}
