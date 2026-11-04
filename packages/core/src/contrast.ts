import type { Theme } from './tokens.ts';

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (rgb: Rgb): string =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;

/** Same result as CSS `color-mix(in srgb, a <weight>, b)` for opaque colors. */
export function mixSrgb(a: string, weight: number, b: string): string {
  const x = parseHex(a);
  const y = parseHex(b);
  const mix = (i: 0 | 1 | 2): number => x[i] * weight + y[i] * (1 - weight);
  return toHex([mix(0), mix(1), mix(2)]);
}

function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio between two `#rrggbb` colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastIssue {
  /** Plain-language name of the pairing, for editor warnings. */
  where: string;
  ratio: number;
}

/** How much of the button-text color soft text and cards use on bold sections (CSS color-mix). */
export const BOLD_MUTED_MIX = 0.9;
export const BOLD_CARD_MIX = 0.08;

/** WCAG AA for normal text. */
export const MIN_TEXT_CONTRAST = 4.5;

/**
 * Checks every text and background pairing the site stylesheet uses (plain,
 * tinted and bold sections, cards and buttons). Mixed colors match the
 * stylesheet's `color-mix` values. Returns the pairs below WCAG AA.
 */
export function themeContrastIssues(theme: Theme): ContrastIssue[] {
  const c = theme.colors;
  const boldMuted = mixSrgb(c.accentText, BOLD_MUTED_MIX, c.accent);
  const boldCard = mixSrgb(c.accentText, BOLD_CARD_MIX, c.accent);
  const pairs: [string, string, string][] = [
    ['Text on the background', c.text, c.background],
    ['Text on tinted sections and cards', c.text, c.surface],
    ['Soft text on the background', c.muted, c.background],
    ['Soft text on tinted sections and cards', c.muted, c.surface],
    ['Links on the background', c.accent, c.background],
    ['Links on tinted sections and cards', c.accent, c.surface],
    ['Button text', c.accentText, c.accent],
    ['Soft text on bold sections', boldMuted, c.accent],
    ['Text on cards in bold sections', c.accentText, boldCard],
  ];
  return pairs
    .map(([where, fg, bg]) => ({ where, ratio: contrastRatio(fg, bg) }))
    .filter((p) => p.ratio < MIN_TEXT_CONTRAST);
}
