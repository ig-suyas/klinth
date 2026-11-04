/** Escapes text for safe use in HTML text and attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** True if the text has a control character or a line/paragraph separator. */
export function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 32 || (code >= 127 && code <= 159) || code === 0x2028 || code === 0x2029) {
      return true;
    }
  }
  return false;
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
  if (value.length > 2048 || hasControlChar(value) || /\s/.test(value)) return null;
  return ALLOWED_URL.some((pattern) => pattern.test(value)) ? value : null;
}
