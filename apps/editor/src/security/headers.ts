/**
 * Security headers for the hosted editor. Used at build time to write
 * Cloudflare Pages' `_headers` file and by `vite preview`, so the policy that is
 * tested is the policy that ships. Pure: no DOM, no Node APIs.
 */

export const PREVIEW_PATH = '/preview.html';

/**
 * Cloudflare Pages answers `/preview.html` with a redirect to `/preview`, so the
 * preview's own policy must cover both addresses or the frame gets the editor's.
 */
const PREVIEW_PATHS: readonly string[] = [PREVIEW_PATH, '/preview'];

/** The editor page, which points to hashed build files (the preview pages are covered below). */
const EDITOR_HTML_PATHS: readonly string[] = ['/', '/index.html'];

/** The HTML names the current build's hashed files, so browsers must always ask for it again. */
const NO_CACHE = { 'Cache-Control': 'no-cache' } as const;

export type HeaderMap = Readonly<Record<string, string>>;

const COMMON: HeaderMap = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Strict-Transport-Security': 'max-age=31536000',
};

/** The origin of the AI and GitHub Worker, or null when the address is not usable. */
export function workerOrigin(apiBaseUrl: string | undefined): string | null {
  if (!apiBaseUrl) return null;
  try {
    const url = new URL(apiBaseUrl.trim());
    const local = url.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
    return url.protocol === 'https:' || local ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * The editor holds the unlocked Gemini key in memory, so its policy is strict:
 * scripts only from this site, network only to this site, the Worker and GitHub.
 * Inline styles stay allowed because the script-free template thumbnails
 * (`srcdoc`, which inherits this policy) carry the site's stylesheet inline.
 */
export function editorCsp(apiBaseUrl: string | undefined): string {
  const worker = workerOrigin(apiBaseUrl);
  const connect = ["'self'", worker, 'https://api.github.com'].filter(Boolean).join(' ');
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect}`,
    "frame-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/**
 * The live preview runs the user's own site, including pasted custom code that
 * may load scripts or fonts from other sites. Its frame is sandboxed without
 * same-origin, so it cannot reach the editor, its storage or the key. This
 * looser policy keeps it from being framed anywhere but the editor and from
 * submitting forms or using plugins.
 */
export function previewCsp(): string {
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval' https: blob:",
    "style-src 'unsafe-inline' https:",
    'img-src https: data: blob:',
    'media-src https: data: blob:',
    'font-src https: data:',
    'connect-src https:',
    'frame-src https:',
    'worker-src blob:',
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'self'",
  ].join('; ');
}

/** Headers for one request path. */
export function headersFor(path: string, apiBaseUrl: string | undefined): HeaderMap {
  if (PREVIEW_PATHS.includes(path)) {
    return { ...COMMON, 'Content-Security-Policy': previewCsp(), 'X-Frame-Options': 'SAMEORIGIN' };
  }
  return { ...COMMON, 'Content-Security-Policy': editorCsp(apiBaseUrl), 'X-Frame-Options': 'DENY' };
}

function block(path: string, headers: HeaderMap, detach: readonly string[] = []): string {
  const lines = [
    ...detach.map((name) => `  ! ${name}`),
    ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`),
  ];
  return `${path}\n${lines.join('\n')}\n`;
}

/**
 * Cloudflare Pages `_headers`. Rules that match the same path are combined, so
 * the preview rule first removes (`!`) the editor's policy, then sets its own.
 */
export function pagesHeadersFile(apiBaseUrl: string | undefined): string {
  const editor = headersFor('/', apiBaseUrl);
  const preview = headersFor(PREVIEW_PATH, apiBaseUrl);
  const own = { 'Content-Security-Policy': preview['Content-Security-Policy'] ?? '' };
  const frame = { 'X-Frame-Options': preview['X-Frame-Options'] ?? '' };
  // Each path gets exactly one block: Cloudflare Pages lets a second block for
  // the same path replace the first, which dropped the preview's own policy.
  return [
    block('/*', editor),
    ...PREVIEW_PATHS.map((path) =>
      block(path, { ...own, ...frame, ...NO_CACHE }, [
        'Content-Security-Policy',
        'X-Frame-Options',
      ]),
    ),
    ...EDITOR_HTML_PATHS.map((path) => block(path, NO_CACHE)),
    // Hashed files never change.
    block('/assets/*', { 'Cache-Control': 'public, max-age=31536000, immutable' }),
  ].join('\n');
}
