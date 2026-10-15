"use client";

import dynamic from "next/dynamic";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessQuestion } from "@/components/AccessQuestion";
import { BlockList } from "@/components/BlockList";
import type { DrawMapHandle } from "@/components/DrawMap";
import { ErrorPanel } from "@/components/ErrorPanel";
import { GeoJsonUpload } from "@/components/GeoJsonUpload";
import { PostcodeSearch } from "@/components/PostcodeSearch";
import { Results } from "@/components/Results";
import { hectares } from "@/lib/format";
import { areaHa, haOutside, OUTSIDE_TOLERANCE_HA, type UploadedBlock } from "@/lib/geo";
import { regionOutline, screenSite, type FriendlyError, type ScreenResult } from "@/lib/screen";

// MapLibre needs the browser, so the map is never rendered on the server.
const DrawMap = dynamic(() => import("@/components/DrawMap").then((m) => m.DrawMap), {
  ssr: false,
  loading: () => <div className="mt-14 h-[60vh] min-h-[320px] rounded border border-line bg-moss-tint sm:h-[520px]" />,
});

type Step = "map" | "question" | "results";
type Block = { id: string; name: string; geometry: Polygon | MultiPolygon; editable: boolean };

const MIN_SITE_HA = 1;

// Lowest "Field N" not already used. Pure, so it is safe inside state updaters.
function nextFieldName(taken: string[]): string {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`Field ${n}`)) n += 1;
  return `Field ${n}`;
}

export function CheckFlow() {
  const [step, setStepState] = useState<Step>("map");
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [region, setRegion] = useState<FeatureCollection<Polygon | MultiPolygon> | null>(null);
  const [access, setAccess] = useState<boolean | null>(null);
  const [accessError, setAccessError] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScreenResult | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const mapHandle = useRef<DrawMapHandle>(null);
  // Ids being added by an upload: the drawing tool reports them before we list them.
  const uploading = useRef(new Set<string>());
  const stepHeading = useRef<HTMLHeadingElement>(null);

  // Browser back/forward moves between steps.
  const setStep = useCallback((next: Step, push = true) => {
    setStepState(next);
    if (push) window.history.pushState({ step: next }, "");
    window.scrollTo({ top: 0 });
  }, []);
  useEffect(() => {
    window.history.replaceState({ step: "map" }, "");
    const onPop = (e: PopStateEvent) => setStepState((e.state?.step as Step) ?? "map");
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (step !== "results") stepHeading.current?.focus();
  }, [step]);

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
    const added: Block[] = uploaded.map((u) => {
      const id = crypto.randomUUID();
      return { id, name: u.name, geometry: u.geometry, editable: u.geometry.type === "Polygon" };
    });
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
  }

  function continueToQuestion() {
    if (blocks.length === 0) {
      setMapError("Draw at least one field, or upload a file, to continue.");
      return;
    }
    if (listed.some((b) => b.outsideHa > 0)) {
      setMapError("Some of your land is outside the area we cover. Edit or delete those fields to continue.");
      return;
    }
    setStep("question");
  }

  async function runScreen() {
    if (access === null) {
      setAccessError(true);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await screenSite(
      blocks.map((b) => ({ name: b.name.trim() || "Unnamed field", geometry: b.geometry })),
      access,
    );
    setLoading(false);
    if ("error" in res) {
      setError(res.error);
      setResult(null);
    } else {
      setResult(res.result);
    }
    setStep("results");
  }

  function startAgain() {
    mapHandle.current?.clear();
    setBlocks([]);
    setAccess(null);
    setResult(null);
    setError(null);
    setStep("map");
  }

  const stepLabel = step === "map" ? "Step 1 of 2" : step === "question" ? "Step 2 of 2" : null;

  return (
    <div>
      {stepLabel && <p className="font-semibold text-muted">{stepLabel}</p>}

      {/* Map step stays mounted (hidden) so drawn fields survive moving between steps. */}
      <div hidden={step !== "map"} className="space-y-5">
        <h1 ref={step === "map" ? stepHeading : undefined} tabIndex={-1} className="text-3xl font-bold text-moss">
          Show us your land
        </h1>
        <PostcodeSearch onFound={(lon, lat) => mapHandle.current?.flyTo(lon, lat)} />
        {region === null && (
          <p className="text-sm text-muted">Loading the outline of the area we cover…</p>
        )}
        <DrawMap
          handleRef={mapHandle}
          region={region}
          visible={step === "map"}
          blocks={listed.map((b) => ({ ...b, outside: b.outsideHa > 0 }))}
          onPolygonsChange={onPolygonsChange}
        />
        <p className="text-sm text-muted">
          The dashed green line shows the area we cover. Drawing needs a mouse or touch screen; you can
          also upload a file.
        </p>
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
            You&apos;ve drawn {hectares(totalHa)}. Woodland creation payments need at least 1 hectare that
            could be planted, so you may want to add more land.
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

      {step === "question" && (
        <div className="space-y-6">
          <h1 ref={stepHeading} tabIndex={-1} className="sr-only">
            One question
          </h1>
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
              onClick={() => setStep("map")}
              className="min-h-12 rounded border-2 border-moss bg-white px-5 font-semibold text-moss hover:bg-moss-tint"
            >
              Back to map
            </button>
            <button
              type="button"
              onClick={runScreen}
              disabled={loading}
              aria-busy={loading}
              className="min-h-12 rounded bg-moss px-6 text-lg font-semibold text-white shadow-[0_2px_0_#16241a] hover:bg-moss-dark disabled:opacity-60"
            >
              {loading ? "Working out your estimate…" : "See my estimate"}
            </button>
          </div>
        </div>
      )}

      {step === "results" && error && (
        <ErrorPanel error={error} onBackToMap={() => setStep("map")} onRetry={runScreen} />
      )}
      {step === "results" && result && (
        <Results
          result={result}
          drawn={blocks.map((b) => ({ name: b.name, geometry: b.geometry }))}
          onChangeAnswers={() => setStep("question")}
          onEditFields={() => setStep("map")}
          onStartAgain={startAgain}
        />
      )}
    </div>
  );
}
