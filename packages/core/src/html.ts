/** Escapes text for safe use in HTML text and attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** No `URL` global here: core has no DOM/Node types, so patterns are explicit. */
const ALLOWED_URL: RegExp[] = [
  /^https:\/\/[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+(:\d{1,5})?([/?#].*)?$/i,
  /^mailto:[^@]+@[^@]+$/i,
  /^tel:\+?[0-9().-]{3,32}$/i,
];
const ANCHOR = /^#[A-Za-z][\w-]{0,63}$/;

/**
 * Returns the URL if it is allowed in a site (https, mailto, tel or an in-page
 * #anchor), otherwise null. Callers must drop the link when this returns null.
 */
export function safeUrl(raw: string): string | null {
  const value = raw.trim();
  if (ANCHOR.test(value)) return value;
  // Reject control characters and whitespace that browsers strip before parsing.
  const hasControl = [...value].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127);
  if (hasControl || /\s/.test(value)) return null;
  if (value.length > 2048) return null;
  return ALLOWED_URL.some((pattern) => pattern.test(value)) ? value : null;
}
