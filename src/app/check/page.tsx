import type { Metadata } from "next";
import { CheckFlow } from "@/components/CheckFlow";

export const metadata: Metadata = { title: "Check your land · Land Funding Snapshot" };

export default function CheckPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:py-10">
      <CheckFlow />
    </div>
  );
}
