// Browser-side canvas compositor. Mirrors generate.py exactly:
// top-biased cover-crop + Barbaro text with fit-to-width.

import {
  ANNOUNCE_SLOTS, TATTOO_SLOT, NAME, IG, COLORS, TEMPLATE_SRC, CANVAS_SIZE,
  VERT_SIZE, VERT_SLOT, VERT_NAME, VERT_IG,
} from "./aatc-template";

type Slot = { x: number; y: number; w: number; h: number };

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

export async function loadBarbaro(): Promise<void> {
  const face = new FontFace("Barbaro", `url(${TEMPLATE_SRC.font})`);
  await face.load();
  (document as any).fonts.add(face);
}

// Draws img into slot, scaled to cover, cropped with an upward bias (0..1).
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  slot: Slot,
  topBias = 0.15
) {
  const { x, y, w, h } = slot;
  const scale = Math.max(w / img.width, h / img.height);
  const nw = img.width * scale;
  const nh = img.height * scale;
  const sx = (nw - w) / 2 / scale;
  let sy = ((nh - h) * (0.5 - topBias * 0.5)) / scale;
  sy = Math.max(0, Math.min(sy, (nh - h) / scale));
  ctx.drawImage(img, sx, sy, w / scale, h / scale, x, y, w, h);
}

function trackedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width;
  return w + tracking * Math.max(0, text.length - 1);
}

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  start: number,
  min: number,
  tracking: number
): number {
  let size = start;
  while (size > min) {
    ctx.font = `${size}px Barbaro`;
    if (trackedWidth(ctx, text, tracking) <= maxW) return size;
    size -= 1;
  }
  return min;
}

// Draws text right-anchored at rightX, vertically centered at cy, with letter tracking.
function drawTrackedRight(
  ctx: CanvasRenderingContext2D,
  text: string,
  rightX: number,
  cy: number,
  tracking: number
) {
  const total = trackedWidth(ctx, text, tracking);
  ctx.textAlign = "left";
  let x = rightX - total;
  for (const ch of text) {
    ctx.fillText(ch, x, cy);
    x += ctx.measureText(ch).width + tracking;
  }
}

export async function renderAnnouncement(
  artist: HTMLImageElement,
  tattoos: HTMLImageElement[],
  name: string,
  ig: string
): Promise<HTMLCanvasElement> {
  const tpl = await loadImage(TEMPLATE_SRC.announce);
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d")!;
  // Templates are opaque (black photo windows), so draw template FIRST,
  // then drop photos into the windows. The thin gold frames are part of the
  // template border and remain visible just outside each slot.
  ctx.drawImage(tpl, 0, 0);
  drawCover(ctx, artist, ANNOUNCE_SLOTS.artist, 0.25);
  drawCover(ctx, tattoos[0], ANNOUNCE_SLOTS.tattoo1, 0.2);
  drawCover(ctx, tattoos[1], ANNOUNCE_SLOTS.tattoo2, 0.2);
  drawCover(ctx, tattoos[2], ANNOUNCE_SLOTS.tattoo3, 0.2);

  // Name + IG header
  ctx.textBaseline = "middle";
  const nm = name.toUpperCase();
  const nameSize = fitFontSize(ctx, nm, NAME.maxW, NAME.startSize, NAME.minSize, NAME.tracking);
  ctx.font = `${nameSize}px Barbaro`;
  ctx.fillStyle = COLORS.white;
  drawTrackedRight(ctx, nm, NAME.rightX, NAME.centerY, NAME.tracking);

  const handle = ("@" + ig.replace(/^@/, "")).toUpperCase();
  const igSize = fitFontSize(ctx, handle, IG.maxW, IG.startSize, IG.minSize, IG.tracking);
  ctx.font = `${igSize}px Barbaro`;
  ctx.fillStyle = COLORS.white;
  drawTrackedRight(ctx, handle, IG.rightX, IG.centerY, IG.tracking);

  return canvas;
}

// Vertical 9:16 card (TikTok). One template for every slide - slide 1 gets the
// artist photo, slides 2-4 get each tattoo. Pass whichever photo into `photo`.
export async function renderVerticalCard(
  photo: HTMLImageElement,
  name: string,
  ig: string
): Promise<HTMLCanvasElement> {
  const tpl = await loadImage(TEMPLATE_SRC.vertical);
  const canvas = document.createElement("canvas");
  canvas.width = VERT_SIZE.w;
  canvas.height = VERT_SIZE.h;
  const ctx = canvas.getContext("2d")!;

  // Template first (opaque black window), then photo into the window.
  ctx.drawImage(tpl, 0, 0);
  drawCover(ctx, photo, VERT_SLOT, 0.1);

  ctx.textBaseline = "middle";

  // Name - right-aligned, white, tracked
  const nm = name.toUpperCase();
  const nameSize = fitFontSize(ctx, nm, VERT_NAME.maxW, VERT_NAME.startSize, VERT_NAME.minSize, VERT_NAME.tracking);
  ctx.font = `${nameSize}px Barbaro`;
  ctx.fillStyle = COLORS.white;
  drawTrackedRight(ctx, nm, VERT_NAME.rightX, VERT_NAME.centerY, VERT_NAME.tracking);

  // IG handle - right-aligned, white, tracked
  const handle = ("@" + ig.replace(/^@/, "")).toUpperCase();
  const igSize = fitFontSize(ctx, handle, VERT_IG.maxW, VERT_IG.startSize, VERT_IG.minSize, VERT_IG.tracking);
  ctx.font = `${igSize}px Barbaro`;
  ctx.fillStyle = COLORS.white;
  drawTrackedRight(ctx, handle, VERT_IG.rightX, VERT_IG.centerY, VERT_IG.tracking);

  return canvas;
}

export async function renderTattooCard(
  tattoo: HTMLImageElement,
  name: string,
  ig: string
): Promise<HTMLCanvasElement> {
  const tpl = await loadImage(TEMPLATE_SRC.tattoo);
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(tpl, 0, 0);
  drawCover(ctx, tattoo, TATTOO_SLOT, 0.15);

  ctx.textBaseline = "middle";

  // Name - right-aligned, white, tracked
  const nm = name.toUpperCase();
  const nameSize = fitFontSize(ctx, nm, NAME.maxW, NAME.startSize, NAME.minSize, NAME.tracking);
  ctx.font = `${nameSize}px Barbaro`;
  ctx.fillStyle = COLORS.white;
  drawTrackedRight(ctx, nm, NAME.rightX, NAME.centerY, NAME.tracking);

  // IG handle - right-aligned, white, tracked
  const handle = ("@" + ig.replace(/^@/, "")).toUpperCase();
  const igSize = fitFontSize(ctx, handle, IG.maxW, IG.startSize, IG.minSize, IG.tracking);
  ctx.font = `${igSize}px Barbaro`;
  ctx.fillStyle = COLORS.white;
  drawTrackedRight(ctx, handle, IG.rightX, IG.centerY, IG.tracking);

  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res) =>
    canvas.toBlob((b) => res(b!), "image/jpeg", 0.92)
  );
}
