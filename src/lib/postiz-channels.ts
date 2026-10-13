/**
 * The AATC Postiz channels (one home for channel facts, Ryan 2026-10-12).
 * n8n workflow B rejects any channel id not on its own allow list; this list
 * mirrors it for the send modal and the send route's validation.
 */
export const AATC_POSTIZ_CHANNELS = [
  { id: 'cmpesh71v03szny0y0f2gidx9', platform: 'instagram', label: 'Instagram' },
  { id: 'cmpeo33qx03mzlg0y8oauzo5q', platform: 'facebook', label: 'Facebook' },
  { id: 'cmphf1fnp03opt60ystp5pjv9', platform: 'x', label: 'X' },
  { id: 'cmphiok1f02znpn0ymm7ujols', platform: 'tiktok', label: 'TikTok' },
] as const

export type PostizChannel = (typeof AATC_POSTIZ_CHANNELS)[number]

export const DEFAULT_CHANNEL_PLATFORMS: ReadonlyArray<PostizChannel['platform']> = ['instagram', 'facebook']

export const INSTAGRAM_CHANNEL_ID =
  AATC_POSTIZ_CHANNELS.find(c => c.platform === 'instagram')!.id
