/**
 * Links between pages of the same site. Kept free of schema imports, so the
 * schema can use these helpers without an import cycle.
 */

/** Windows cannot create files with these names (even with an extension). */
export const DEVICE_NAME = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Page addresses that would clash with exported files or folders. */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'index',
  'assets',
  'css',
  'js',
  'fonts',
  'readme',
]);

/** `about.html`, `index.html` or `about.html#work`: a page of this site, never a path. */
export const PAGE_LINK = /^(index|[a-z0-9]+(?:-[a-z0-9]+)*)\.html(#[A-Za-z][\w-]{0,63})?$/;

/** The page slug a link points to (`''` for the home page), or null if it is not a page link. */
export function linkedSlug(href: string): string | null {
  const match = PAGE_LINK.exec(href.trim());
  if (!match) return null;
  return match[1] === 'index' ? '' : (match[1] ?? null);
}

/** The file a page is exported as. */
export const pageFile = (slug: string): string => (slug === '' ? 'index.html' : `${slug}.html`);

/** Every `href` value found at any depth (section props are plain JSON). */
export function collectHrefs(value: unknown): string[] {
  const found: string[] = [];
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) stack.push(...(current as unknown[]));
    else if (typeof current === 'object' && current !== null) {
      for (const [key, child] of Object.entries(current)) {
        if (key === 'href' && typeof child === 'string') found.push(child);
        else stack.push(child);
      }
    }
  }
  return found;
}

/** Returns a copy of `value` with every `href` passed through `edit`. */
export function mapHrefs<T>(value: T, edit: (href: string) => string): T {
  const walk = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(walk);
    if (typeof current === 'object' && current !== null) {
      return Object.fromEntries(
        Object.entries(current).map(([key, child]) => [
          key,
          key === 'href' && typeof child === 'string' ? edit(child) : walk(child),
        ]),
      );
    }
    return current;
  };
  return walk(value) as T;
}
