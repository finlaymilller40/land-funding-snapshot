"use client";

import {
  ChevronsUpDown,
  CircleHelp,
  House,
  Info,
  ListChecks,
  Map as MapIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Trees,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { PostcodeSearch } from "@/components/PostcodeSearch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export type View = "workspace" | "fields" | "guide" | "sources" | "about";

export const VIEWS: { id: View; label: string; Icon: LucideIcon }[] = [
  { id: "workspace", label: "Workspace", Icon: House },
  { id: "fields", label: "My fields", Icon: MapIcon },
  { id: "guide", label: "How to get this", Icon: ListChecks },
  { id: "sources", label: "Sources & rates", Icon: Info },
  { id: "about", label: "About", Icon: CircleHelp },
];

function Logo({ short }: { short?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2 text-sm font-bold text-ink no-underline">
      <span aria-hidden="true" className="flex size-7 items-center justify-center rounded-md bg-moss text-white">
        <Trees className="size-4" />
      </span>
      <span className={cn(short && "max-[380px]:sr-only")}>Land Funding Snapshot</span>
    </Link>
  );
}

const REGION = "cambridgeshire-and-peterborough";

function RegionSelect() {
  return (
    <Select value={REGION}>
      <SelectTrigger size="sm" aria-label="Region" className="h-8 w-auto gap-1 border-line bg-white text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={REGION}>Cambridgeshire &amp; Peterborough</SelectItem>
      </SelectContent>
    </Select>
  );
}

type TopBarProps = { isMobile: boolean; onFound(lon: number, lat: number): void; onHelp(): void };

/** 48 px bar: tool name, region, postcode search, prototype tag and help. */
export function TopBar({ isMobile, onFound, onHelp }: TopBarProps) {
  const { toggleSidebar } = useSidebar();
  const [searchOpen, setSearchOpen] = useState(false);

  if (isMobile) {
    return (
      <header className="relative z-40 shrink-0 border-b border-line bg-white">
        <div className="flex h-12 items-center gap-1 px-2">
          <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Open menu">
            <Menu aria-hidden="true" />
          </Button>
          <Logo short />
          <span className="flex-1" />
          <Badge variant="partly">Prototype</Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSearchOpen((o) => !o)}
            aria-expanded={searchOpen}
            aria-label={searchOpen ? "Close postcode search" : "Search by postcode"}
          >
            {searchOpen ? <X aria-hidden="true" /> : <Search aria-hidden="true" />}
          </Button>
        </div>
        {searchOpen && (
          <div className="border-t border-line px-3 py-2">
            <PostcodeSearch
              autoFocus
              onFound={(lon, lat) => {
                onFound(lon, lat);
                setSearchOpen(false);
              }}
            />
          </div>
        )}
      </header>
    );
  }

  return (
    <header className="relative z-40 flex h-12 shrink-0 items-center gap-4 border-b border-line bg-white px-4">
      <Logo />
      <span aria-hidden="true" className="h-5 w-px bg-line" />
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted">Region</span>
        <RegionSelect />
      </div>
      <div className="w-64">
        <PostcodeSearch onFound={onFound} />
      </div>
      <span className="flex-1" />
      <Badge variant="partly">Prototype</Badge>
      <Button variant="ghost" size="icon-sm" onClick={onHelp} aria-label="Help and about">
        <CircleHelp aria-hidden="true" />
      </Button>
    </header>
  );
}

/** Light sidebar: each item switches the right panel's view; the map stays visible. */
export function AppSidebar({ view, onView }: { view: View; onView(view: View): void }) {
  const { state, toggleSidebar, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed" && !isMobile;
  return (
    <Sidebar collapsible="icon" className="top-12 h-[calc(100svh-3rem)]!">
      {isMobile && (
        <SidebarHeader className="border-b border-line px-4 py-3">
          <Logo />
        </SidebarHeader>
      )}
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu aria-label="Panel views">
              {VIEWS.map(({ id, label, Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    isActive={view === id}
                    aria-current={view === id ? "page" : undefined}
                    tooltip={label}
                    onClick={() => {
                      onView(id);
                      if (isMobile) setOpenMobile(false);
                    }}
                    className="h-9 coarse:h-11 data-[active=true]:font-semibold data-[active=true]:shadow-[inset_3px_0_0_var(--color-moss)]"
                  >
                    <Icon aria-hidden="true" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {!isMobile && (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={toggleSidebar} tooltip={collapsed ? "Expand" : undefined} className="h-9 text-muted">
                {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
                <span>{collapsed ? "Expand" : "Collapse"}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}

export type Snap = "peek" | "half" | "full";
// vaul measures snap points from the window bottom; the drawer sits below the
// 56 px top area, so "224px" shows about 168 px of panel.
const SNAPS: Record<Snap, number | string> = { peek: "224px", half: 0.55, full: 1 };
// At part heights the bottom of the drawer is off-screen. Pad the scroll area by
// that hidden height so the end of the content can still be scrolled into view.
const HIDDEN_PAD: Record<Snap, string> = { peek: "calc(100dvh - 224px + 2rem)", half: "calc(45dvh + 2rem)", full: "2rem" };
const NEXT: Record<Snap, Snap> = { peek: "half", half: "full", full: "peek" };

/**
 * Phone detail panel: a non-modal vaul drawer with three heights. The map
 * stays usable behind it. The handle is a real button, so keyboard and
 * screen-reader users can change the height too.
 */
export function PhoneDrawer({
  snap,
  onSnap,
  title,
  scrollRef,
  children,
}: {
  snap: Snap;
  onSnap(snap: Snap): void;
  title: string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const points = [SNAPS.peek, SNAPS.half, SNAPS.full];
  return (
    <DrawerPrimitive.Root
      open
      modal={false}
      dismissible={false}
      snapPoints={points}
      activeSnapPoint={SNAPS[snap]}
      setActiveSnapPoint={(p) => {
        const found = (Object.keys(SNAPS) as Snap[]).find((k) => SNAPS[k] === p);
        if (found) onSnap(found);
      }}
    >
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Content
          aria-describedby={undefined}
          // Never steal focus from the map or the page when it first opens.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(100dvh-3.5rem)] flex-col rounded-t-xl border-t border-line bg-white shadow-[0_-6px_24px_rgba(0,0,0,0.18)] outline-none"
        >
          <DrawerPrimitive.Title className="sr-only">{title}</DrawerPrimitive.Title>
          <button
            type="button"
            onClick={() => onSnap(NEXT[snap])}
            aria-label={snap === "full" ? "Shrink panel" : "Expand panel"}
            className="flex h-11 w-full shrink-0 flex-col items-center justify-center gap-1"
          >
            <span aria-hidden="true" className="h-1.5 w-12 rounded-full bg-muted/50" />
            <span className="flex items-center gap-1 text-xs text-muted">
              <ChevronsUpDown aria-hidden="true" className="size-3" />
              {snap === "full" ? "Show more map" : "Show more"}
            </span>
          </button>
          {/* data-vaul-no-drag: content scrolls normally; the handle changes the height. */}
          <div
            ref={scrollRef}
            data-vaul-no-drag
            data-panel-scroll
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4"
            style={{ paddingBottom: HIDDEN_PAD[snap] }}
          >
            {children}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
