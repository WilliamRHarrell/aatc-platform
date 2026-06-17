import { NextRequest, NextResponse } from "next/server";
import { CHANNELS } from "@/lib/aatc-template";

export const runtime = "nodejs";

const POSTIZ_BASE = "https://api.postiz.com/public/v1";

// Per-channel Postiz settings (each provider validates its own schema).
function channelSettings(key: string): Record<string, unknown> {
  switch (key) {
    case "facebook":
      return { __type: "facebook" };
    case "gmb":
      return { __type: "googleMyBusiness" };
    case "instagram":
      return { __type: "instagram", post_type: "post" };
    case "x":
      return { __type: "x", who_can_reply_post: "everyone" };
    case "tiktok":
      return {
        __type: "tiktok",
        privacy_level: "PUBLIC_TO_EVERYONE",
        duet: false,
        stitch: false,
        comment: true,
        autoAddMusic: "no",
        brand_content_toggle: false,
        brand_organic_toggle: false,
        video_made_with_ai: false,
        content_posting_method: "DIRECT_POST",
      };
    default:
      return {};
  }
}

async function uploadImage(apiKey: string, blob: Blob, filename: string) {
  const fd = new FormData();
  fd.append("file", blob, filename);
  const r = await fetch(`${POSTIZ_BASE}/upload`, {
    method: "POST",
    headers: { Authorization: apiKey },
    body: fd,
  });
  if (!r.ok) throw new Error(`upload failed (${r.status}): ${await r.text()}`);
  return r.json(); // { id, path, ... }
}

export async function POST(req: NextRequest) {
  // Require an authenticated admin session.
  const { createServerClient } = await import("@/lib/supabase-server");
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const apiKey = process.env.POSTIZ_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "POSTIZ_API_KEY not set" }, { status: 500 });

  try {
    const form = await req.formData();
    const caption = String(form.get("caption") || "");
    const artistName = String(form.get("artistName") || "");

    // Collect both sets in carousel order.
    const square: Blob[] = [];
    const vert: Blob[] = [];
    for (let i = 1; i <= 4; i++) {
      const s = form.get(`square${i}`);
      const v = form.get(`vert${i}`);
      if (s instanceof Blob) square.push(s);
      if (v instanceof Blob) vert.push(v);
    }
    if (square.length !== 4 || vert.length !== 4) {
      return NextResponse.json({ error: "expected 4 square + 4 vertical slides" }, { status: 400 });
    }

    // Upload each image ONCE, keyed by format. (8 uploads total.)
    const squareMedia = [];
    for (let i = 0; i < square.length; i++) {
      squareMedia.push(await uploadImage(apiKey, square[i], `aatc_sq${i + 1}.jpg`));
    }
    const vertMedia = [];
    for (let i = 0; i < vert.length; i++) {
      vertMedia.push(await uploadImage(apiKey, vert[i], `aatc_vt${i + 1}.jpg`));
    }
    const squareArr = squareMedia.map((m) => ({ id: m.id, path: m.path }));
    const vertArr = vertMedia.map((m) => ({ id: m.id, path: m.path }));

    // One post entry per channel, using the media set matching its format.
    const posts = Object.entries(CHANNELS).map(([key, cfg]) => {
      const image = cfg.format === "vertical" ? vertArr : squareArr;
      return {
        integration: { id: cfg.id },
        value: [{ content: caption, image }],
        settings: channelSettings(key),
      };
    });

    const body = {
      type: "draft",
      date: new Date().toISOString(),
      shortLink: false,
      tags: [],
      posts,
    };

    const r = await fetch(`${POSTIZ_BASE}/posts`, {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      return NextResponse.json({ error: `posts failed (${r.status}): ${await r.text()}` }, { status: 502 });
    }
    const result = await r.json();

    // Optional Supabase log (best-effort).
    try {
      const { logAatcJob } = await import("@/lib/aatc-log");
      await logAatcJob({
        artistName,
        postizResult: result,
        mediaPaths: [...squareArr, ...vertArr].map((m) => m.path),
      });
    } catch { /* non-fatal */ }

    return NextResponse.json({ ok: true, postId: result?.id ?? null, raw: result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "dispatch error" }, { status: 500 });
  }
}
