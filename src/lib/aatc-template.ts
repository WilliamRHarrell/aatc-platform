// Single source of truth for the AATC 2027 EAST templates.
// Square coords measured from the 1024x1024 templates; vertical from the
// 1242x2208 template. Do not change without re-measuring against /public/aatc.

// ---------------------------------------------------------------------------
// SQUARE FORMAT (1024x1024) - Facebook, X, GMB, Instagram
// ---------------------------------------------------------------------------
export const CANVAS_SIZE = 1024;

export const ANNOUNCE_SLOTS = {
  artist: { x: 45, y: 218, w: 499, h: 573 },
  tattoo1: { x: 574, y: 218, w: 404, h: 167 },
  tattoo2: { x: 574, y: 419, w: 404, h: 167 },
  tattoo3: { x: 574, y: 624, w: 404, h: 167 },
} as const;

export const TATTOO_SLOT = { x: 45, y: 218, w: 627, h: 573 } as const;

// Square name: right-aligned to x=980 (flush with the date line), tracked.
export const NAME = { rightX: 980, centerY: 70, maxW: 410, startSize: 56, minSize: 30, tracking: 3 };
// Square IG: right-aligned ending at x=945 (just left of the camera glyph), white.
export const IG = { rightX: 945, centerY: 123, maxW: 375, startSize: 27, minSize: 15, tracking: 1 };

// ---------------------------------------------------------------------------
// VERTICAL FORMAT (1242x2208, 9:16) - TikTok
// Every slide uses ONE template: slide 1 = artist photo, slides 2-4 = tattoos.
// No grid, no separate announcement template.
// ---------------------------------------------------------------------------
export const VERT_SIZE = { w: 1242, h: 2208 } as const;
export const VERT_SLOT = { x: 0, y: 495, w: 1242, h: 1224 } as const;
// Vertical name: right-aligned to x=1148 (flush with date), big, tracked.
export const VERT_NAME = { rightX: 1148, centerY: 205, maxW: 640, startSize: 96, minSize: 44, tracking: 4 };
// Vertical IG: right-aligned ending at x=1075 (left of glyph at ~1096), white.
export const VERT_IG = { rightX: 1075, centerY: 288, maxW: 560, startSize: 46, minSize: 22, tracking: 2 };

export const COLORS = { white: "#FFFFFF", tan: "#C1A878" };

export const TEMPLATE_SRC = {
  announce: "/aatc/AATC-EAST-TEMP-27.png",
  tattoo: "/aatc/AATC-EAST-TATTOO-TEMP-27.png",
  vertical: "/aatc/AATC-EAST-TATTOO-TEMP-VERT-27.png",
  font: "/aatc/barbaro_punta.ttf",
};

// ---------------------------------------------------------------------------
// CHANNEL ROUTING - which format each Postiz channel receives.
// ---------------------------------------------------------------------------
export const CHANNELS = {
  facebook: { id: "cmpeo33qx03mzlg0y8oauzo5q", format: "square" as const },
  gmb: { id: "cmphis91a02zvpn0y3vis8520", format: "square" as const },
  instagram: { id: "cmpesh71v03szny0y0f2gidx9", format: "square" as const },
  x: { id: "cmphf1fnp03opt60ystp5pjv9", format: "square" as const },
  tiktok: { id: "cmphiok1f02znpn0ymm7ujols", format: "vertical" as const },
};

export type FormatKey = "square" | "vertical";

export function buildCaption(artistName: string, ig: string) {
  const handle = ig.replace(/^@/, "");
  return `🔥 ${artistName} (@${handle}) is tattooing at the 10th Annual All American Tattoo Convention - #AATCEAST - Fayetteville/Ft Bragg, NC, April 16-18, 2027. Book via the instructions in their bio.

For information about the event please check out our website at www.allamericantattooconvention.com or click the link in our bio.

#AATC27 #AATC10X #FTBRAGGNC #FAYETTEVILLENC #ALLAMERICANTATTOOCONVENTION`;
}
