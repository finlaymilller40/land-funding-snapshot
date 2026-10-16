"use client";

import dynamic from "next/dynamic";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessQuestion } from "@/components/AccessQuestion";
import { BlockList } from "@/components/BlockList";
import { ErrorPanel } from "@/components/ErrorPanel";
import { GeoJsonUpload } from "@/components/GeoJsonUpload";
import { LayerControls } from "@/components/LayerControls";
import { PostcodeSearch } from "@/components/PostcodeSearch";
import { ResultsPanel } from "@/components/ResultsPanel";
import type { WorkspaceMapHandle } from "@/components/WorkspaceMap";
import { hectares } from "@/lib/format";
import { areaHa, haOutside, OUTSIDE_TOLERANCE_HA, type UploadedBlock } from "@/lib/geo";
import {
  regionOutline,
  screenSite,
  siteContext,
  type FriendlyError,
  type ScreenResult,
  type SiteContext,
} from "@/lib/screen";

// MapLibre needs the browser, so the map is never rendered on the server.
const WorkspaceMap = dynamic(() => import("@/components/WorkspaceMap").then((m) => m.WorkspaceMap), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-moss-tint" />,
});

type Phase = "draw" | "question" | "results";
type Sheet = "peek" | "half" | "full";
type Block = { id: string; name: string; geometry: Polygon | MultiPolygon; editable: boolean };

const MIN_SITE_HA = 1;
const EDIT_DEBOUNCE_MS = 1000;

// Lowest "Field N" not already used. Pure, so it is safe inside state updaters.
function nextFieldName(taken: string[]): string {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`Field ${n}`)) n += 1;
  return `Field ${n}`;
}

const sheetHeight: Record<Sheet, string> = {
  peek: "h-40",
  half: "h-[55dvh]",
  full: "h-[calc(100dvh-4.5rem)]",
};

export function Workspace() {
  const [phase, setPhaseState] = useState<Phase>("draw");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [region, setRegion] = useState<FeatureCollection<Polygon | MultiPolygon> | null>(null);
  const [access, setAccess] = useState<boolean | null>(null);
  const [accessError, setAccessError] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScreenResult | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [context, setContext] = useState<SiteContext | null>(null);
  const [contextState, setContextState] = useState<"idle" | "loading" | "ready" | "unavailable">("idle");
  const [shown, setShown] = useState<Record<string, boolean>>({ plantable: true, "left-out": true });
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);
  const [selectedBlock, setSelectedBlock] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Sheet>("half");
  const mapHandle = useRef<WorkspaceMapHandle>(null);
  // Ids being added by an upload: the drawing tool reports them before we list them.
  const uploading = useRef(new Set<string>());
  // Only the latest request may update the panel.
  const requestId = useRef(0);
  const lastGeometryKey = useRef("");
  const panelRef = useRef<HTMLDivElement>(null);

  // Browser back/forward moves between phases.
  const setPhase = useCallback((next: Phase, push = true) => {
    setPhaseState(next);
    if (push) window.history.pushState({ phase: next }, "");
    panelRef.current?.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    window.history.replaceState({ phase: "draw" }, "");
    const onPop = (e: PopStateEvent) => setPhaseState((e.state?.phase as Phase) ?? "draw");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    regionOutline().then(setRegion);
  }, []);

  const listed = useMemo(
    () =>
      blocks.map((b) => ({
        ...b,
        ha: areaHa(b.geometry),
        outsideHa: (() => {
          const out = haOutside(b.geometry, region);
          return out > OUTSIDE_TOLERANCE_HA ? out : 0;
        })(),
      })),
    [blocks, region],
  );
  const totalHa = listed.reduce((s, b) => s + b.ha, 0);

  // Keep drawn polygons in step with the drawing tool.
  const onPolygonsChange = useCallback((polygons: { id: string; geometry: Polygon }[]) => {
    const skip = new Set(uploading.current); // read now: the updater below runs later
    setBlocks((current) => {
      const byId = new Map(polygons.map((p) => [p.id, p.geometry]));
      const kept = current
        .filter((b) => !b.editable || byId.has(b.id))
        .map((b) => (byId.has(b.id) ? { ...b, geometry: byId.get(b.id)! } : b));
      const known = new Set(kept.map((b) => b.id));
      const next = [...kept];
      for (const p of polygons.filter((x) => !known.has(x.id) && !skip.has(x.id))) {
        next.push({ id: p.id, name: nextFieldName(next.map((b) => b.name)), geometry: p.geometry, editable: true });
      }
      return next;
    });
    setMapError(null);
  }, []);

  function addUploaded(uploaded: UploadedBlock[]) {
    const added: Block[] = uploaded.map((u) => ({
      id: crypto.randomUUID(),
      name: u.name,
      geometry: u.geometry,
      editable: u.geometry.type === "Polygon",
    }));
    // Fields the drawing tool can't take are still shown and screened, just not reshaped.
    for (const b of added) {
      uploading.current.add(b.id);
      if (b.editable && !mapHandle.current?.addPolygon(b.id, b.geometry as Polygon)) b.editable = false;
    }
    setBlocks((current) => [...current, ...added]);
    uploading.current.clear();
    mapHandle.current?.fitTo(added.map((b) => b.geometry));
  }

  function deleteBlock(id: string) {
    mapHandle.current?.remove(id);
    setBlocks((current) => current.filter((b) => b.id !== id));
    setSelectedBlock(null);
  }

  // Run the estimate (and, if the land changed, the nearby layers) for the current fields.
  const run = useCallback(
    async (fields: Block[], publicAccess: boolean) => {
      const id = ++requestId.current;
      if (fields.length === 0) {
        setResult(null);
        setError({ title: "No fields to check", detail: "Draw or upload at least one field.", action: "map" });
        return;
      }
      setLoading(true);
      const site = fields.map((b) => ({ name: b.name.trim() || "Unnamed field", geometry: b.geometry }));
      const res = await screenSite(site, publicAccess);
      if (id !== requestId.current) return; // a newer request has started
      setLoading(false);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setError(null);
      setResult(res.result);
      setSelectedBlock((sel) => (sel !== null && sel < res.result.blocks.length ? sel : null));

      const geometryKey = JSON.stringify(fields.map((b) => b.geometry));
      if (geometryKey !== lastGeometryKey.current) {
        lastGeometryKey.current = geometryKey;
        setContextState("loading");
        const ctx = await siteContext(site);
        if (id !== requestId.current) return;
        setContext(ctx);
        setContextState(ctx ? "ready" : "unavailable");
      }
    },
    [],
  );

  // Live updates on the results page: re-run after edits (debounced) or a toggle.
  const blocksKey = useMemo(() => JSON.stringify(blocks.map((b) => [b.name, b.geometry])), [blocks]);
  const lastRunKey = useRef("");
  useEffect(() => {
    if (phase !== "results" || access === null) return;
    const key = `${blocksKey}|${access}`;
    if (key === lastRunKey.current) return;
    const accessOnly = lastRunKey.current.startsWith(blocksKey + "|");
    lastRunKey.current = key;
    const timer = window.setTimeout(() => run(blocks, access), accessOnly ? 0 : EDIT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [phase, blocksKey, access, blocks, run]);

  function continueToQuestion() {
    if (blocks.length === 0) {
      setMapError("Draw at least one field, or upload a file, to continue.");
      return;
    }
    if (listed.some((b) => b.outsideHa > 0)) {
      setMapError("Some of your land is outside the area we cover. Edit or delete those fields to continue.");
      return;
    }
    setPhase("question");
  }

  function seeEstimate() {
    if (access === null) {
      setAccessError(true);
      return;
    }
    lastRunKey.current = `${blocksKey}|${access}`;
    setResult(null);
    setError(null);
    setPhase("results");
    setSheet("half");
    mapHandle.current?.setTool("move");
    run(blocks, access);
  }

  function startAgain() {
    mapHandle.current?.clear();
    requestId.current += 1;
    lastRunKey.current = "";
    lastGeometryKey.current = "";
    setBlocks([]);
    setAccess(null);
    setResult(null);
    setError(null);
    setContext(null);
    setContextState("idle");
    setSelectedPayment(null);
    setSelectedBlock(null);
    setShown({ plantable: true, "left-out": true });
    mapHandle.current?.setTool("draw");
    setPhase("draw");
  }

  function selectPayment(code: string | null) {
    setSelectedPayment(code);
    if (code && context) {
      // Switch on the payment's target area so the highlight has context.
      const group = context.layers.find((l) => l.payments?.includes(code));
      if (group) setShown((s) => ({ ...s, [group.id]: true }));
    }
  }

  function selectBlock(index: number | null, fromMap = false) {
    setSelectedBlock(index);
    if (index === null) return;
    if (phase !== "results" && fromMap) return;
    if (fromMap) {
      setSheet((s) => (s === "peek" ? "half" : s));
      // Scroll only the panel (scrollIntoView would also scroll the page and move the map).
      window.setTimeout(() => {
        const panel = panelRef.current;
        const target = document.getElementById("fields-heading");
        if (!panel || !target) return;
        const top = target.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - 12;
        panel.scrollTo({ top, behavior: "smooth" });
      }, 50);
    } else {
      mapHandle.current?.fitTo([blocks[index].geometry]);
    }
  }

  const resultMatchesBlocks = result !== null && result.blocks.length === blocks.length;

  return (
    <div className="relative lg:grid lg:h-[calc(100dvh-3.75rem)] lg:grid-cols-[minmax(0,1fr)_minmax(380px,42%)]">
      {/* Map: full screen behind the sheet on phones, left column on desktop. */}
      <div className="relative h-[calc(100dvh-3.75rem)] lg:h-full">
        <WorkspaceMap
          handleRef={mapHandle}
          region={region}
          blocks={listed.map((b) => ({ ...b, outside: b.outsideHa > 0 }))}
          onPolygonsChange={onPolygonsChange}
          result={phase === "results" && resultMatchesBlocks ? result : null}
          context={phase === "results" ? context : null}
          shown={shown}
          highlightPayment={phase === "results" ? selectedPayment : null}
          selectedBlock={phase === "results" ? selectedBlock : null}
          onBlockClick={(i) => selectBlock(i, true)}
        />
        <div className="pointer-events-none absolute right-2 top-28 flex flex-col items-end gap-2 lg:top-24">
          <LayerControls
            context={context}
            contextState={contextState}
            hasResult={phase === "results" && result !== null}
            shown={shown}
            onChange={(id, on) => setShown((s) => ({ ...s, [id]: on }))}
          />
        </div>
      </div>

      {/* Panel: bottom sheet on phones, right column on desktop. */}
      <aside
        aria-label="Your land and estimate"
        className={`fixed inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl border-t border-line bg-paper shadow-[0_-6px_24px_rgba(0,0,0,0.18)] ${sheetHeight[sheet]} lg:static lg:z-auto lg:h-full lg:rounded-none lg:border-l lg:border-t-0 lg:shadow-none`}
      >
        <button
          type="button"
          onClick={() => setSheet((s) => (s === "peek" ? "half" : s === "half" ? "full" : "peek"))}
          aria-expanded={sheet !== "peek"}
          aria-label={sheet === "full" ? "Shrink panel" : "Expand panel"}
          className="flex min-h-11 w-full shrink-0 flex-col items-center justify-center gap-1 lg:hidden"
        >
          <span className="h-1.5 w-12 rounded-full bg-muted/60" />
          <span className="text-xs text-muted">{sheet === "full" ? "Show more map" : "Show more"}</span>
        </button>
        <div ref={panelRef} className="flex-1 overflow-y-auto px-4 pb-8 lg:px-6 lg:py-6">
          {phase === "draw" && (
            <div className="space-y-5">
              <div>
                <p className="font-semibold text-muted">Step 1 of 2</p>
                <h1 className="text-2xl font-bold text-moss">Show us your land</h1>
                <p className="mt-1 text-sm">
                  Draw each field separately: payments are worked out field by field. The dashed green line on the map
                  shows the area we cover.
                </p>
              </div>
              <PostcodeSearch onFound={(lon, lat) => mapHandle.current?.flyTo(lon, lat)} />
              {region === null && <p className="text-sm text-muted">Loading the outline of the area we cover…</p>}
              <GeoJsonUpload onBlocks={addUploaded} />
              <BlockList
                blocks={listed}
                onRename={(id, name) => setBlocks((cur) => cur.map((b) => (b.id === id ? { ...b, name } : b)))}
                onDelete={deleteBlock}
                onShow={(id) => {
                  const b = blocks.find((x) => x.id === id);
                  if (b) mapHandle.current?.fitTo([b.geometry]);
                }}
              />
              {blocks.length > 0 && totalHa < MIN_SITE_HA && (
                <p className="rounded bg-warn-bg px-4 py-3 text-warn-text">
                  You&apos;ve drawn {hectares(totalHa)}. Woodland creation payments need at least 1 hectare that could be
                  planted, so you may want to add more land.
                </p>
              )}
              {mapError && (
                <p className="font-semibold text-clay-text" role="alert">
                  {mapError}
                </p>
              )}
              <button
                type="button"
                onClick={continueToQuestion}
                className="min-h-12 rounded bg-moss px-6 text-lg font-semibold text-white shadow-[0_2px_0_#16241a] hover:bg-moss-dark"
              >
                Continue
              </button>
            </div>
          )}

          {phase === "question" && (
            <div className="space-y-6">
              <p className="font-semibold text-muted">Step 2 of 2</p>
              <AccessQuestion
                value={access}
                error={accessError}
                onChange={(v) => {
                  setAccess(v);
                  setAccessError(false);
                }}
              />
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setPhase("draw")}
                  className="min-h-12 rounded border-2 border-moss bg-white px-5 font-semibold text-moss hover:bg-moss-tint"
                >
                  Back to fields
                </button>
                <button
                  type="button"
                  onClick={seeEstimate}
                  className="min-h-12 rounded bg-moss px-6 text-lg font-semibold text-white shadow-[0_2px_0_#16241a] hover:bg-moss-dark"
                >
                  See my estimate
                </button>
              </div>
            </div>
          )}

          {phase === "results" && (
            <div className="space-y-4">
              {error && <ErrorPanel error={error} onBackToMap={() => setPhase("draw")} onRetry={() => run(blocks, access ?? false)} />}
              {!error && !result && loading && <p role="status">Working out your estimate…</p>}
              {result && (
                <div className={error ? "opacity-50" : ""}>
                  <ResultsPanel
                    result={result}
                    updating={loading}
                    publicAccess={access ?? false}
                    onPublicAccessChange={(v) => setAccess(v)}
                    selectedPayment={selectedPayment}
                    onSelectPayment={selectPayment}
                    selectedBlock={selectedBlock}
                    onSelectBlock={(i) => selectBlock(i)}
                    onStartAgain={startAgain}
                  />
                </div>
              )}
              <details className="rounded border border-line bg-white p-3">
                <summary className="cursor-pointer font-semibold">Rename, add or delete fields</summary>
                <p className="mt-2 text-sm text-muted">
                  Use <strong>Draw a field</strong> or <strong>Edit fields</strong> on the map; the estimate updates a
                  second after you stop.
                </p>
                <div className="mt-3">
                  <BlockList
                    blocks={listed}
                    onRename={(id, name) => setBlocks((cur) => cur.map((b) => (b.id === id ? { ...b, name } : b)))}
                    onDelete={deleteBlock}
                    onShow={(id) => {
                      const b = blocks.find((x) => x.id === id);
                      if (b) mapHandle.current?.fitTo([b.geometry]);
                    }}
                  />
                </div>
              </details>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
