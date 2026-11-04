import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a color like #1a2b3c');

/** Font stacks are a closed list so nothing unsafe reaches CSS. */
export const FONT_STACKS = {
  // Bundled open-license fonts (see fonts.ts), with close system fallbacks.
  fraunces:
    '"Fraunces", "Iowan Old Style", "Palatino Linotype", "URW Palladio L", P052, Georgia, serif',
  'instrument-sans':
    '"Instrument Sans", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  bricolage:
    '"Bricolage Grotesque", "Segoe UI Variable Display", "Helvetica Neue", Arial, sans-serif',
  figtree:
    '"Figtree", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  'system-sans':
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  'system-serif': 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif',
  'system-mono': 'ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace',
  humanist:
    'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, sans-serif',
  didone: 'Didot, "Bodoni MT", "Noto Serif Display", "URW Palladio L", P052, Sylfaen, serif',
  oldstyle:
    '"Iowan Old Style", "Palatino Linotype", "URW Palladio L", P052, Palatino, "Book Antiqua", serif',
  grotesk:
    '"Helvetica Neue", "Segoe UI Variable Display", "Segoe UI", Helvetica, Arial, "Nimbus Sans", "Liberation Sans", sans-serif',
  geometric:
    'Avenir, "Avenir Next LT Pro", Montserrat, Corbel, "URW Gothic", source-sans-pro, sans-serif',
  rounded:
    'ui-rounded, "SF Pro Rounded", "Hiragino Maru Gothic ProN", Quicksand, Comfortaa, Manjari, "Arial Rounded MT", "Arial Rounded MT Bold", Calibri, sans-serif',
} as const;

/** Serif display faces look best light and loose; sans faces bold and tight. */
const HEADING_STYLE: Record<FontKey, { weight: number; tracking: string }> = {
  fraunces: { weight: 380, tracking: '-0.025em' },
  'instrument-sans': { weight: 600, tracking: '-0.025em' },
  bricolage: { weight: 700, tracking: '-0.035em' },
  figtree: { weight: 700, tracking: '-0.025em' },
  'system-sans': { weight: 700, tracking: '-0.03em' },
  'system-serif': { weight: 400, tracking: '-0.015em' },
  'system-mono': { weight: 600, tracking: '-0.02em' },
  humanist: { weight: 600, tracking: '-0.02em' },
  didone: { weight: 400, tracking: '-0.02em' },
  oldstyle: { weight: 400, tracking: '-0.01em' },
  grotesk: { weight: 700, tracking: '-0.04em' },
  geometric: { weight: 600, tracking: '-0.03em' },
  rounded: { weight: 700, tracking: '-0.025em' },
};

export type FontKey = keyof typeof FONT_STACKS;
const fontKey = z.enum(Object.keys(FONT_STACKS) as [FontKey, ...FontKey[]]);

export const themeSchema = z
  .object({
    colors: z
      .object({
        background: hexColor,
        surface: hexColor,
        text: hexColor,
        muted: hexColor,
        accent: hexColor,
        accentText: hexColor,
      })
      .strict(),
    fonts: z.object({ heading: fontKey, body: fontKey }).strict(),
    /** Corner radius in px. */
    radius: z.number().int().min(0).max(48),
    /** Base spacing unit in px. */
    spacing: z.number().int().min(4).max(16),
  })
  .strict();

export type Theme = z.infer<typeof themeSchema>;

export const defaultTheme: Theme = {
  colors: {
    background: '#f7f4ee',
    surface: '#ffffff',
    text: '#1c1a17',
    muted: '#6b645a',
    accent: '#b13a0b',
    accentText: '#ffffff',
  },
  fonts: { heading: 'fraunces', body: 'instrument-sans' },
  radius: 12,
  spacing: 8,
};

/** Turns a validated theme into CSS custom properties. */
export function themeToCss(theme: Theme): string {
  const c = theme.colors;
  const vars: [string, string][] = [
    ['--color-bg', c.background],
    ['--color-surface', c.surface],
    ['--color-text', c.text],
    ['--color-muted', c.muted],
    ['--color-accent', c.accent],
    ['--color-accent-text', c.accentText],
    ['--font-heading', FONT_STACKS[theme.fonts.heading]],
    ['--font-body', FONT_STACKS[theme.fonts.body]],
    ['--heading-weight', String(HEADING_STYLE[theme.fonts.heading].weight)],
    ['--heading-tracking', HEADING_STYLE[theme.fonts.heading].tracking],
    ['--radius', `${theme.radius}px`],
    ['--space', `${theme.spacing}px`],
  ];
  return `:root {\n${vars.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;
}
