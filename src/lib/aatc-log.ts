// Best-effort job log. Requires a Supabase table:
//
//   create table aatc_carousel_jobs (
//     id uuid primary key default gen_random_uuid(),
//     artist_name text,
//     media_paths text[],
//     postiz_post_id text,
//     postiz_raw jsonb,
//     created_at timestamptz default now()
//   );
//
// Uses the service-role key on the server only. Never import this client-side.

import { createClient } from "@supabase/supabase-js";

export async function logAatcJob(args: {
  artistName: string;
  postizResult: any;
  mediaPaths: string[];
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return; // logging optional

  const supa = createClient(url, key, { auth: { persistSession: false } });
  await supa.from("aatc_carousel_jobs").insert({
    artist_name: args.artistName,
    media_paths: args.mediaPaths,
    postiz_post_id: args.postizResult?.id ?? null,
    postiz_raw: args.postizResult ?? null,
  });
}
