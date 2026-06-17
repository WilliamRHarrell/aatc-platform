"use client";

import { useEffect, useState } from "react";
import {
  loadImage, loadBarbaro, renderAnnouncement, renderTattooCard,
  renderVerticalCard, canvasToBlob,
} from "@/lib/aatc-canvas";
import { buildCaption } from "@/lib/aatc-template";

type Upload = { file: File; url: string; img: HTMLImageElement } | null;

const SLOT_LABELS = ["Artist Photo", "Tattoo 1", "Tattoo 2", "Tattoo 3"];

export default function AATCGenerator() {
  const [fontReady, setFontReady] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([null, null, null, null]);
  const [name, setName] = useState("");
  const [ig, setIg] = useState("");
  const [previews, setPreviews] = useState<string[]>([]);
  const [blobs, setBlobs] = useState<Blob[]>([]);
  const [vertPreviews, setVertPreviews] = useState<string[]>([]);
  const [vertBlobs, setVertBlobs] = useState<Blob[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");

  useEffect(() => { loadBarbaro().then(() => setFontReady(true)); }, []);

  async function onPick(idx: number, file: File) {
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    setUploads((u) => { const c = [...u]; c[idx] = { file, url, img }; return c; });
  }

  const ready =
    fontReady && name.trim() && ig.trim() && uploads.every(Boolean);

  async function generate() {
    if (!ready) return;
    setBusy(true); setStatus("Rendering 8 slides (4 square + 4 vertical)…");
    const [artist, t1, t2, t3] = uploads.map((u) => u!.img);

    // Square set (FB / X / GMB / IG)
    const sq = [
      await renderAnnouncement(artist, [t1, t2, t3], name, ig),
      await renderTattooCard(t1, name, ig),
      await renderTattooCard(t2, name, ig),
      await renderTattooCard(t3, name, ig),
    ];
    // Vertical set (TikTok) — one template, artist photo then 3 tattoos
    const vt = [
      await renderVerticalCard(artist, name, ig),
      await renderVerticalCard(t1, name, ig),
      await renderVerticalCard(t2, name, ig),
      await renderVerticalCard(t3, name, ig),
    ];

    setPreviews(sq.map((c) => c.toDataURL("image/jpeg", 0.92)));
    setVertPreviews(vt.map((c) => c.toDataURL("image/jpeg", 0.92)));
    setBlobs(await Promise.all(sq.map(canvasToBlob)));
    setVertBlobs(await Promise.all(vt.map(canvasToBlob)));
    setBusy(false); setStatus("");
  }

  async function dispatch() {
    if (blobs.length !== 4 || vertBlobs.length !== 4) return;
    setBusy(true); setStatus("Sending to Postiz…");
    const fd = new FormData();
    fd.append("artistName", name);
    fd.append("ig", ig);
    fd.append("caption", buildCaption(name, ig));
    blobs.forEach((b, i) => fd.append(`square${i + 1}`, b, `square${i + 1}.jpg`));
    vertBlobs.forEach((b, i) => fd.append(`vert${i + 1}`, b, `vert${i + 1}.jpg`));
    const res = await fetch("/api/aatc/dispatch", { method: "POST", body: fd });
    const json = await res.json();
    setBusy(false);
    setStatus(res.ok ? `✅ Sent to Postiz (id: ${json.postId ?? "ok"})` : `❌ ${json.error}`);
  }

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", color: "#eee", fontFamily: "Barlow, system-ui" }}>
      <h1 style={{ letterSpacing: 1 }}>AATC Carousel Generator</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
        <label>Artist Name
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe" style={inp} />
        </label>
        <label>Instagram Handle
          <input value={ig} onChange={(e) => setIg(e.target.value)}
            placeholder="jane.ink" style={inp} />
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginTop: 16 }}>
        {SLOT_LABELS.map((label, i) => (
          <div key={i} style={box}>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{label}</div>
            <input type="file" accept="image/*"
              onChange={(e) => e.target.files?.[0] && onPick(i, e.target.files[0])} />
            {uploads[i] && (
              <img src={uploads[i]!.url} alt={label}
                style={{ width: "100%", marginTop: 8, borderRadius: 4 }} />
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <button disabled={!ready || busy} onClick={generate} style={btn(ready && !busy)}>
          Generate Slides
        </button>
        <button disabled={blobs.length !== 4 || busy} onClick={dispatch}
          style={btn(blobs.length === 4 && !busy)}>
          Send to Postiz
        </button>
        <span style={{ fontSize: 13, opacity: 0.85 }}>{status}</span>
      </div>

      {previews.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>
            Square — Facebook / X / GMB / Instagram
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            {previews.map((p, i) => (
              <div key={i}>
                <div style={{ fontSize: 11, opacity: 0.6 }}>
                  Slide {i + 1}{i === 0 ? " — Announcement" : ` — Tattoo ${i}`}
                </div>
                <img src={p} style={{ width: "100%", borderRadius: 6, border: "1px solid #333" }} />
                <a href={p} download={`square${i + 1}.jpg`} style={{ fontSize: 12, color: "#C1A878" }}>
                  download
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {vertPreviews.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>
            Vertical 9:16 — TikTok
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            {vertPreviews.map((p, i) => (
              <div key={i}>
                <img src={p} style={{ width: "100%", borderRadius: 6, border: "1px solid #333" }} />
                <a href={p} download={`vertical${i + 1}.jpg`} style={{ fontSize: 12, color: "#C1A878" }}>
                  download
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = {
  display: "block", width: "100%", padding: 8, marginTop: 4,
  background: "#111", color: "#fff", border: "1px solid #333", borderRadius: 4,
};
const box: React.CSSProperties = { background: "#0d0d0d", padding: 10, borderRadius: 6, border: "1px solid #222" };
const btn = (on: boolean): React.CSSProperties => ({
  padding: "10px 16px", borderRadius: 6, border: "none", cursor: on ? "pointer" : "not-allowed",
  background: on ? "#C1A878" : "#333", color: on ? "#000" : "#888", fontWeight: 700,
});