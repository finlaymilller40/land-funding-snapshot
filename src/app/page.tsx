import { Suspense } from "react";
import { connection } from "next/server";
import { supabase } from "@/lib/supabase";

// Reads the test row at request time, so every visit shows the live database.
async function HealthCheck() {
  await connection();

  const { data, error } = await supabase
    .from("health_check")
    .select("id, message, checked_at")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    return (
      <p className="rounded-md border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        Could not read from Supabase: {error.message}
      </p>
    );
  }

  if (!data) {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        Connected, but the health_check row is missing.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950">
      <p className="font-medium">{data.message}</p>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Row {data.id}, created {new Date(data.checked_at).toUTCString()}
      </p>
    </div>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Land Funding Snapshot
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Phase 0 pipeline check: this page reads one row from Supabase.
      </p>
      <Suspense
        fallback={<p className="text-zinc-500">Checking the database…</p>}
      >
        <HealthCheck />
      </Suspense>
    </main>
  );
}
