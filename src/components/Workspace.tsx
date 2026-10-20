"use client";

import dynamic from "next/dynamic";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, PenLine } from "lucide-react";
import { AccessQuestion } from "@/components/AccessQuestion";
import { AppSidebar, PhoneDrawer, TopBar, VIEWS, type Snap, type View } from "@/components/AppShell";
import { BlockList } from "@/components/BlockList";
import { ErrorPanel } from "@/components/ErrorPanel";
import { GeoJsonUpload } from "@/components/GeoJsonUpload";
import { AboutView, GuideView, SourcesView } from "@/components/InfoViews";
import { MapLegend } from "@/components/MapLegend";
import { ResultsPanel } from "@/components/ResultsPanel";
import { Button } from "@/components/ui/button";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { WorkspaceMapHandle } from "@/components/WorkspaceMap";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const [sheet, setSheet] = useState<Snap>("half");
  const [view, setViewState] = useState<View>("workspace");
  const isMobile = useIsMobile();
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
    setViewState("workspace");
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
    // Land outside the region is left out by the server, which refuses a site
    // that is entirely or mostly outside (rules.settings.max_outside_share_pct).
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
    mapHandle.current?.fitTo(blocks.map((b) => b.geometry));
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
    if (code && isMobile) setSheet("peek");
  }

  // Target areas near the land for bonuses that aren't on it.
  const nearbyTargets = (codes: string[]) =>
    (context?.layers ?? []).filter((l) => l.kind === "target" && l.geometry && l.payments?.some((p) => codes.includes(p)));
  function showTargetArea(codes: string[]) {
    const ids = nearbyTargets(codes).map((l) => l.id);
    setShown((s) => ({ ...s, ...Object.fromEntries(ids.map((id) => [id, true])) }));
    if (isMobile) setSheet("peek");
  }

  function setView(next: View) {
    setViewState(next);
    panelRef.current?.scrollTo({ top: 0 });
    if (isMobile) setSheet((s) => (s === "peek" ? "half" : s));
    // Move focus to the new view's heading so screen readers announce it.
    window.setTimeout(() => panelRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true }), 50);
  }

  function startDrawing() {
    mapHandle.current?.setTool("draw");
    if (isMobile) setSheet("peek");
  }

  function selectBlock(index: number | null, fromMap = false) {
    setSelectedBlock(index);
    if (index === null) return;
    if (phase !== "results" && fromMap) return;
    if (fromMap) {
      setViewState("workspace");
      // Open the Fields section if it is closed.
      window.setTimeout(() => {
        const trigger = document.querySelector<HTMLButtonElement>("#fields-heading button[aria-expanded='false']");
        trigger?.click();
      }, 0);
      setSheet((s) => (s === "peek" ? "half" : s));
      // Scroll only the panel (scrollIntoView would also scroll the page and move the map).
      window.setTimeout(() => {
        const panel = panelRef.current;
        const target = document.getElementById("fields-heading")?.parentElement;
        if (!panel || !target) return;
        const top = target.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop - 12;
        panel.scrollTo({ top, behavior: "smooth" });
      }, 50);
    } else {
      mapHandle.current?.fitTo([blocks[index].geometry]);
    }
  }

  const resultMatchesBlocks = result !== null && result.blocks.length === blocks.length;
  const renameBlock = (id: string, name: string) => setBlocks((cur) => cur.map((b) => (b.id === id ? { ...b, name } : b)));
  const showBlock = (id: string) => {
    const b = blocks.find((x) => x.id === id);
    if (b) mapHandle.current?.fitTo([b.geometry]);
    if (isMobile) setSheet("peek");
  };
  const fieldList = <BlockList blocks={listed} onRename={renameBlock} onDelete={deleteBlock} onShow={showBlock} />;

  const workspaceView = (
    <>
      {phase === "draw" && (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">Step 1 of 2</p>
            <h1 tabIndex={-1} className="mt-1 text-xl font-bold">
              Show us your land
            </h1>
            <p className="mt-1 text-sm">
              Find your land with the postcode search, then draw each field separately: payments are worked out field by
              field. The dashed green line shows the area we cover.
            </p>
          </div>
          <Button variant="outline" onClick={startDrawing} className="w-full justify-start">
            <PenLine aria-hidden="true" />
            Draw a field on the map
          </Button>
          <GeoJsonUpload onBlocks={addUploaded} />
          {region === null && <p className="text-xs text-muted">Loading the outline of the area we cover…</p>}
          {fieldList}
          {blocks.length > 0 && totalHa < MIN_SITE_HA && (
            <p className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-text">
              You&apos;ve drawn {hectares(totalHa)}. Woodland creation payments need at least 1 hectare that could be
              planted, so you may want to add more land.
            </p>
          )}
          {mapError && (
            <p className="text-sm font-semibold text-clay-text" role="alert">
              {mapError}
            </p>
          )}
          <Button size="lg" onClick={continueToQuestion} className="w-full">
            Continue
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      )}

      {phase === "question" && (
        <div className="space-y-5">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Step 2 of 2</p>
          <AccessQuestion
            value={access}
            error={accessError}
            onChange={(v) => {
              setAccess(v);
              setAccessError(false);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="lg" onClick={() => setPhase("draw")}>
              <ArrowLeft aria-hidden="true" />
              Back to fields
            </Button>
            <Button size="lg" onClick={seeEstimate} className="flex-1">
              See my estimate
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {phase === "results" && (
        <div className="space-y-4">
          {error && <ErrorPanel error={error} onBackToMap={() => setPhase("draw")} onRetry={() => run(blocks, access ?? false)} />}
          {!error && !result && loading && (
            <p role="status" className="text-sm">
              Working out your estimate…
            </p>
          )}
          {result && (
            <div className={error ? "opacity-50" : ""}>
              <ResultsPanel
                result={result}
                updating={loading}
                publicAccess={access ?? false}
                onPublicAccessChange={(v) => setAccess(v)}
                selectedPayment={selectedPayment}
                onSelectPayment={selectPayment}
                onShowTargetArea={showTargetArea}
                canShowTargetArea={(codes) => nearbyTargets(codes).length > 0}
                selectedBlock={selectedBlock}
                onSelectBlock={(i) => selectBlock(i)}
                onStartAgain={startAgain}
                onOpenSources={() => setView("sources")}
              />
            </div>
          )}
        </div>
      )}
    </>
  );

  const fieldsView = (
    <div className="space-y-4">
      <header>
        <h1 tabIndex={-1} className="text-xl font-bold">
          My fields
        </h1>
        <p className="mt-1 text-sm text-muted">
          {phase === "results"
            ? "Rename, add or delete fields. The estimate updates a second after you stop."
            : "Rename, add or delete fields, then continue in the workspace."}
        </p>
      </header>
      <Button variant="outline" onClick={startDrawing} className="w-full justify-start">
        <PenLine aria-hidden="true" />
        Draw a field on the map
      </Button>
      <GeoJsonUpload onBlocks={addUploaded} />
      {fieldList}
    </div>
  );

  const panelResult = phase === "results" ? result : null;
  const panel =
    view === "workspace" ? workspaceView
    : view === "fields" ? fieldsView
    : view === "guide" ? <GuideView result={panelResult} onGoToWorkspace={() => setView("workspace")} />
    : view === "sources" ? <SourcesView result={panelResult} onGoToWorkspace={() => setView("workspace")} />
    : <AboutView />;
  const viewLabel = VIEWS.find((v) => v.id === view)?.label ?? "Panel";

  return (
    <SidebarProvider className="h-dvh min-h-0 flex-col overflow-hidden">
      <TopBar isMobile={isMobile} onFound={(lon, lat) => mapHandle.current?.flyTo(lon, lat)} onHelp={() => setView("about")} />
      <div className="flex min-h-0 flex-1">
        <AppSidebar view={view} onView={setView} />
        <main id="main" className="relative min-w-0 flex-1" aria-label="Map">
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
          <div
            className={
              isMobile
                ? "pointer-events-none absolute bottom-[calc(var(--drawer-peek)+0.5rem)] left-3 z-10"
                : "pointer-events-none absolute bottom-3 left-3 z-10"
            }
          >
            <MapLegend
              key={isMobile ? "phone" : "desktop"}
              context={context}
              contextState={contextState}
              hasResult={phase === "results" && result !== null}
              shown={shown}
              onChange={(id, on) => setShown((s) => ({ ...s, [id]: on }))}
              defaultOpen={!isMobile}
            />
          </div>
        </main>
        {!isMobile && (
          <aside aria-label={viewLabel} className="hidden w-[400px] shrink-0 flex-col border-l border-line bg-white lg:flex">
            <div ref={panelRef} data-panel-scroll className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {panel}
            </div>
          </aside>
        )}
      </div>
      {isMobile && (
        <PhoneDrawer snap={sheet} onSnap={setSheet} title={viewLabel} scrollRef={panelRef}>
          {panel}
        </PhoneDrawer>
      )}
    </SidebarProvider>
  );
}
