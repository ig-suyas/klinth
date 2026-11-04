/**
 * @klinth/core: project schema, design tokens, renderer and exporter.
 * Shared by the editor and the Worker. Must never depend on the DOM
 * (enforced by tsconfig `lib` without "DOM").
 */

export const SCHEMA_VERSION = 1;

/** Escapes text for safe use in HTML text and attribute values. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
