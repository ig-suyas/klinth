import { OFL_TEXT } from './font-license.ts';
import type { FontKey, Theme } from './tokens.ts';

/**
 * Open-license fonts that ship inside exported sites (no third-party font
 * hosts). Core only knows their names; the editor supplies the bytes.
 * Latin subset only: other scripts fall back to the system stack.
 */

export interface FontFile {
  /** File name inside the site's `fonts/` folder. */
  file: string;
  family: string;
  /** Variable weight range. */
  weight: string;
  copyright: string;
}

/** Same range fontsource uses for its latin subset. */
const LATIN_RANGE =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';

export const BUNDLED_FONTS: Partial<Record<FontKey, FontFile>> = {
  fraunces: {
    file: 'fraunces-latin-wght-normal.woff2',
    family: 'Fraunces',
    weight: '100 900',
    copyright: 'Copyright 2020 The Fraunces Project Authors (github.com/undercasetype/Fraunces)',
  },
  'instrument-sans': {
    file: 'instrument-sans-latin-wght-normal.woff2',
    family: 'Instrument Sans',
    weight: '400 700',
    copyright:
      'Copyright 2022 The Instrument Sans Project Authors (https://github.com/Instrument/instrument-sans)',
  },
  bricolage: {
    file: 'bricolage-grotesque-latin-wght-normal.woff2',
    family: 'Bricolage Grotesque',
    weight: '200 800',
    copyright:
      'Copyright 2022 The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage)',
  },
  figtree: {
    file: 'figtree-latin-wght-normal.woff2',
    family: 'Figtree',
    weight: '300 900',
    copyright:
      'Copyright 2022 The Figtree Project Authors (https://github.com/erikdkennedy/figtree)',
  },
};

export const FONTS_DIR = 'fonts';
export const fontPath = (font: FontFile): string => `${FONTS_DIR}/${font.file}`;

/** The bundled fonts a theme uses, heading first, without duplicates. */
export function themeFonts(theme: Theme): FontFile[] {
  const keys = [...new Set([theme.fonts.heading, theme.fonts.body])];
  return keys.flatMap((key) => {
    const font = BUNDLED_FONTS[key];
    return font ? [font] : [];
  });
}

/**
 * `@font-face` rules. By default for the site stylesheet (which lives in
 * `css/`); the editor preview passes `data:` addresses instead.
 */
export function fontFaceCss(
  fonts: readonly FontFile[],
  urlFor: (font: FontFile) => string = (font) => `../${fontPath(font)}`,
): string {
  return fonts
    .map(
      (f) =>
        `@font-face{font-family:"${f.family}";src:url(${urlFor(f)}) format("woff2");font-weight:${f.weight};font-style:normal;font-display:swap;unicode-range:${LATIN_RANGE}}\n`,
    )
    .join('');
}

/** The licence file that must travel with the fonts. */
export function fontLicense(fonts: readonly FontFile[]): string {
  return `Fonts in this folder: ${fonts.map((f) => f.family).join(', ')}.\n\n${fonts
    .map((f) => `${f.family}: ${f.copyright}`)
    .join('\n')}\n\n${OFL_TEXT}`;
}
