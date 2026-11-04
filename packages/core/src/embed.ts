/**
 * YouTube and Vimeo links. Users paste a page address; only the video id is
 * kept, and every player address is rebuilt from that id. Raw embed code
 * (`<iframe ...>`) is never accepted, so nothing the user pastes reaches the page.
 */

export type VideoProvider = 'youtube' | 'vimeo';

export interface VideoEmbed {
  provider: VideoProvider;
  id: string;
  /** Private Vimeo videos need the hash from their share link. */
  hash?: string;
}

const YT_ID = '([A-Za-z0-9_-]{11})';
/** Optional query or fragment after the id, for example `?si=...` or `#t=30`. */
const REST = '([?&#][^\\s<>"\']*)?';

const YOUTUBE: RegExp[] = [
  new RegExp(
    `^https?://(?:www\\.|m\\.)?youtube\\.com/watch\\?(?:[^#\\s<>"']*&)?v=${YT_ID}${REST}$`,
  ),
  new RegExp(`^https?://youtu\\.be/${YT_ID}${REST}$`),
  new RegExp(`^https?://(?:www\\.|m\\.)?youtube\\.com/(?:shorts|embed|live)/${YT_ID}${REST}$`),
  new RegExp(`^https?://(?:www\\.)?youtube-nocookie\\.com/embed/${YT_ID}${REST}$`),
];

const VIMEO: RegExp[] = [
  /^https?:\/\/(?:www\.)?vimeo\.com\/(\d{6,12})(?:\/([a-f0-9]{6,20}))?\/?([?#][^\s<>"']*)?$/,
  /^https?:\/\/player\.vimeo\.com\/video\/(\d{6,12})\/?([?#][^\s<>"']*)?$/,
];

/** The Vimeo `h=` hash in a player link's query. */
const VIMEO_HASH = /[?&]h=([a-f0-9]{6,20})(?:&|#|$)/;

export const MAX_EMBED_URL_LENGTH = 500;

/**
 * Reads a YouTube or Vimeo page link. Returns null for anything else,
 * including embed code, other sites and look-alike addresses.
 */
export function parseVideoUrl(raw: string): VideoEmbed | null {
  const value = raw.trim();
  if (value.length === 0 || value.length > MAX_EMBED_URL_LENGTH) return null;
  for (const pattern of YOUTUBE) {
    const match = pattern.exec(value);
    if (match?.[1]) return { provider: 'youtube', id: match[1] };
  }
  const page = VIMEO[0]?.exec(value);
  if (page?.[1])
    return page[2]
      ? { provider: 'vimeo', id: page[1], hash: page[2] }
      : { provider: 'vimeo', id: page[1] };
  const player = VIMEO[1]?.exec(value);
  if (player?.[1]) {
    const hash = VIMEO_HASH.exec(player[2] ?? '')?.[1];
    return hash ? { provider: 'vimeo', id: player[1], hash } : { provider: 'vimeo', id: player[1] };
  }
  return null;
}

/** True if the text looks like pasted embed code rather than a link. */
export function looksLikeEmbedCode(raw: string): boolean {
  return /<\s*(iframe|script|embed|object|video)\b/i.test(raw);
}

/** The player address loaded when the visitor presses play. */
export function embedPlayerUrl(embed: VideoEmbed): string {
  if (embed.provider === 'youtube') {
    return `https://www.youtube-nocookie.com/embed/${embed.id}?autoplay=1&rel=0`;
  }
  const hash = embed.hash ? `h=${embed.hash}&` : '';
  return `https://player.vimeo.com/video/${embed.id}?${hash}autoplay=1&dnt=1`;
}

/** The normal page address, used as a fallback link when scripts are off. */
export function embedPageUrl(embed: VideoEmbed): string {
  if (embed.provider === 'youtube') return `https://www.youtube.com/watch?v=${embed.id}`;
  return `https://vimeo.com/${embed.id}${embed.hash ? `/${embed.hash}` : ''}`;
}

export const PROVIDER_NAME: Record<VideoProvider, string> = { youtube: 'YouTube', vimeo: 'Vimeo' };

/** Player hosts the exported site's script is allowed to load. */
export const PLAYER_PREFIXES = [
  'https://www.youtube-nocookie.com/embed/',
  'https://player.vimeo.com/video/',
] as const;
