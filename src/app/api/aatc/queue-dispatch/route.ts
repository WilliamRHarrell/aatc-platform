import { NextRequest, NextResponse } from "next/server";
import { CHANNELS } from "@/lib/aatc-template";

export const runtime = "nodejs";
const POSTIZ_BASE = "https://api.postiz.com/public/v1";

function channelSettings(key: string): Record<string, unknown> {
  switch (key) {
    case "facebook": return { __type: "facebook" };
    case "gmb": return { __type: "googleMyBusiness" };
    case "instagram": return { __type: "instagram", post_type: "post" };
    case "x": return { __type: "x", who_can_reply_post: "everyone" };
    case "tiktok": return {
      __type: "tiktok", privacy_level: "PUBLIC_TO_EVERYONE",
      duet: false, stitch: false, comment: true, autoAddMusic: "no",
      brand_content_toggle: false, brand_organic_toggle: false,
      video_made_with_ai: false, content_posting_method: "DIRECT_POST",
    };
    default: return {};
  }
}

// Ingest a public URL into Postiz storage, return its verified {id, path}.
async function uploadFromUrl(apiKey: string, url: string) {
  const r = await fetch(`${POSTIZ_BASE}/upload-from-url`, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) throw new Error(`upload-from-url failed (${r.status}): ${await r.text()}`);
  return r.json(); // { id, path }
}

export async function POST(req: NextRequest) {
  // Admin-only.
  const { createServerClient } = await import("@/lib/supabase-server");
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: prof } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (prof?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const apiKey = process.env.POSTIZ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "POSTIZ_API_KEY not set" }, { status: 500 });

  try {
    const { submissionId } = await req.json();
    if (!submissionId) return NextResponse.json({ error: "missing submissionId" }, { status: 400 });

    // Load the submission (admin RLS allows reading all).
    const { data: sub, error: subErr } = await supabase
      .from("aatc_submissions").select("*").eq("id", submissionId).single();
    if (subErr || !sub) return NextResponse.json({ error: "submission not found" }, { status: 404 });
    if (sub.status === "posted") return NextResponse.json({ error: "already posted" }, { status: 409 });

    // Build public URLs for the 8 stored images.
    const pub = (p: string) =>
      supabase.storage.from("exhibitor-media").getPublicUrl(p).data.publicUrl;
    const squareUrls = (sub.square_paths as string[]).map(pub);
    const vertUrls = (sub.vertical_paths as string[]).map(pub);

    // Ingest each into Postiz (8 calls).
    const squareArr = [];
    for (const u of squareUrls) squareArr.push(await uploadFromUrl(apiKey, u));
    const vertArr = [];
    for (const u of vertUrls) vertArr.push(await uploadFromUrl(apiKey, u));

    const squareImg = squareArr.map((m) => ({ id: m.id, path: m.path }));
    const vertImg = vertArr.map((m) => ({ id: m.id, path: m.path }));

    const posts = Object.entries(CHANNELS).map(([key, cfg]) => ({
      integration: { id: cfg.id },
      value: [{ content: sub.caption, image: cfg.format === "vertical" ? vertImg : squareImg }],
      settings: channelSettings(key),
    }));

    const r = await fetch(`${POSTIZ_BASE}/posts`, {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "draft", date: new Date().toISOString(), shortLink: false, tags: [], posts }),
    });
    if (!r.ok) return NextResponse.json({ error: `posts failed (${r.status}): ${await r.text()}` }, { status: 502 });
    const result = await r.json();

    // Mark posted.
    await supabase.from("aatc_submissions").update({
      status: "posted",
      postiz_post_id: result?.id ?? null,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }).eq("id", submissionId);

    return NextResponse.json({ ok: true, postId: result?.id ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "dispatch error" }, { status: 500 });
  }
}
