import { BUNDLED_FONTS, themeFonts, type FontFile, type Theme } from '@klinth/core';
import { useEffect, useState } from 'react';
import bricolage from '@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2?url';
import figtree from '@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2?url';
import fraunces from '@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2?url';
import instrumentSans from '@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?url';

/**
 * The bundled site fonts, served with the editor (same origin, no font host).
 * The exporter copies their bytes into each site; the preview frame gets
 * them as `data:` addresses because it has no files next to it.
 */

const FILE_URLS: Readonly<Record<string, string>> = {
  [BUNDLED_FONTS.fraunces?.file ?? '']: fraunces,
  [BUNDLED_FONTS['instrument-sans']?.file ?? '']: instrumentSans,
  [BUNDLED_FONTS.bricolage?.file ?? '']: bricolage,
  [BUNDLED_FONTS.figtree?.file ?? '']: figtree,
};

/**
 * Makes the bundled fonts available to the editor itself (font pickers, UI).
 * Uses the FontFace API, so no inline CSS is needed.
 */
export function installEditorFonts(): void {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return;
  for (const font of Object.values(BUNDLED_FONTS)) {
    const url = FILE_URLS[font.file];
    if (!url) continue;
    const face = new FontFace(font.family, `url(${url}) format("woff2")`, {
      weight: font.weight,
      display: 'swap',
    });
    document.fonts.add(face);
    // Only fonts the page uses are downloaded; load the UI ones now.
    if (font.family === 'Fraunces' || font.family === 'Instrument Sans')
      void face.load().catch(() => undefined);
  }
}

const bytesCache = new Map<string, Promise<Uint8Array>>();
const dataUrlCache = new Map<string, string>();

function fontBytes(font: FontFile): Promise<Uint8Array> {
  let pending = bytesCache.get(font.file);
  if (!pending) {
    const url = FILE_URLS[font.file];
    pending = url
      ? fetch(url).then(async (res) => {
          if (!res.ok) throw new Error(`Font ${font.family} could not be loaded.`);
          return new Uint8Array(await res.arrayBuffer());
        })
      : Promise.reject(new Error(`Font ${font.family} is not bundled.`));
    // A failed load can be tried again later.
    pending.catch(() => bytesCache.delete(font.file));
    bytesCache.set(font.file, pending);
  }
  return pending;
}

/** Bytes of every bundled font the theme uses, by file name (for the exporter). */
export async function loadFontData(theme: Theme): Promise<Map<string, Uint8Array>> {
  const fonts = themeFonts(theme);
  const data = await Promise.all(fonts.map(fontBytes));
  return new Map(fonts.map((font, i) => [font.file, data[i] ?? new Uint8Array()]));
}

function toDataUrl(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:font/woff2;base64,${btoa(text)}`;
}

/** `data:` addresses for the theme's fonts, by file name. Fills in once loaded. */
export function useFontUrls(theme: Theme | undefined): Readonly<Record<string, string>> {
  const key = theme ? `${theme.fonts.heading}|${theme.fonts.body}` : '';
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!theme) return;
    let live = true;
    const fonts = themeFonts(theme);
    void Promise.all(
      fonts.map(async (font) => {
        const cached = dataUrlCache.get(font.file);
        if (cached) return [font.file, cached] as const;
        const url = toDataUrl(await fontBytes(font));
        dataUrlCache.set(font.file, url);
        return [font.file, url] as const;
      }),
    ).then(
      (entries) => {
        if (live) setUrls(Object.fromEntries(entries));
      },
      // Without the files the preview simply uses the fallback fonts.
      () => undefined,
    );
    return () => {
      live = false;
    };
    // The fonts only change when the font choice does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}
