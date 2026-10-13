import { createClient } from "@supabase/supabase-js";

// Only the public URL and anon key belong in app code. The service role key
// bypasses row-level security and must never be imported here.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. See README.",
  );
}

export const supabase = createClient(url, anonKey, {
  auth: { persistSession: false },
});
