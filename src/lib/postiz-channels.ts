/**
 * The AATC Postiz channels (one home for channel facts, Ryan 2026-10-12/13).
 * n8n workflow B rejects any channel id not on its own allow list and
 * enforces the media rules server-side; this list mirrors both for the send
 * modal and the send route's validation.
 */
export interface PostizChannel {
  id: string
  platform: 'instagram' | 'facebook' | 'x' | 'tiktok' | 'gmb' | 'youtube'
  label: string
  /** The post must have this media kind, or the channel is disabled in the modal. */
  requires?: 'image' | 'video'
  /** Shown beside the disabled checkbox. */
  requireHint?: string
}

export const AATC_POSTIZ_CHANNELS: readonly PostizChannel[] = [
  { id: 'cmpesh71v03szny0y0f2gidx9', platform: 'instagram', label: 'Instagram' },
  { id: 'cmpeo33qx03mzlg0y8oauzo5q', platform: 'facebook', label: 'Facebook' },
  { id: 'cmphf1fnp03opt60ystp5pjv9', platform: 'x', label: 'X' },
  { id: 'cmphiok1f02znpn0ymm7ujols', platform: 'tiktok', label: 'TikTok' },
  { id: 'cmphis91a02zvpn0y3vis8520', platform: 'gmb', label: 'Google Business', requires: 'image', requireHint: 'Photo posts only' },
  // YouTube: Ryan supplies the id; uncommenting is the only change needed -
  // the modal's title field and the send route's youtube_title already key
  // on the platform.
  // { id: 'YOUTUBE_CHANNEL_ID', platform: 'youtube', label: 'YouTube', requires: 'video', requireHint: 'Videos only' },
]

export const DEFAULT_CHANNEL_PLATFORMS: ReadonlyArray<PostizChannel['platform']> = ['instagram', 'facebook']

export const INSTAGRAM_CHANNEL_ID =
  AATC_POSTIZ_CHANNELS.find(c => c.platform === 'instagram')!.id

/** The hint when a post's media cannot go to this channel, or null when it can. */
export function channelUnavailable(c: PostizChannel, hasImage: boolean, hasVideo: boolean): string | null {
  if (c.requires === 'image' && !hasImage) return c.requireHint ?? 'Needs an image'
  if (c.requires === 'video' && !hasVideo) return c.requireHint ?? 'Needs a video'
  return null
}
