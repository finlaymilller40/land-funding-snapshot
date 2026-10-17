"use client";

import { ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  title: string;
  /** Status tags shown at the right of the header, e.g. "4 qualify". */
  tags?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
};

/** One collapsible section of the detail panel, with its status tag(s) in the header. */
export function PanelSection({ id, title, tags, defaultOpen = true, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section aria-labelledby={id} className="border-b border-line last:border-b-0">
        <h2 id={id} className="text-sm">
          <CollapsibleTrigger className="flex min-h-11 w-full items-center gap-2 py-2 text-left font-semibold hover:text-moss coarse:min-h-12">
            <ChevronRight aria-hidden="true" className={cn("size-4 shrink-0 text-muted transition-transform", open && "rotate-90")} />
            <span className="flex-1 text-base">{title}</span>
            {tags && <span className="flex flex-wrap justify-end gap-1">{tags}</span>}
          </CollapsibleTrigger>
        </h2>
        <CollapsibleContent className="pb-4">{children}</CollapsibleContent>
      </section>
    </Collapsible>
  );
}
