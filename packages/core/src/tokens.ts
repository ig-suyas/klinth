import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a color like #1a2b3c');

/** Font stacks are a closed list so nothing unsafe reaches CSS. */
export const FONT_STACKS = {
  'system-sans':
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  'system-serif': 'Charter, "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif',
  'system-mono': 'ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace',
  humanist:
    'Seravek, "Gill Sans Nova", Ubuntu, Calibri, "DejaVu Sans", source-sans-pro, sans-serif',
  didone: 'Didot, "Bodoni MT", "Noto Serif Display", "URW Palladio L", P052, Sylfaen, serif',
} as const;

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
    accent: '#c2410c',
    accentText: '#ffffff',
  },
  fonts: { heading: 'didone', body: 'system-sans' },
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
    ['--radius', `${theme.radius}px`],
    ['--space', `${theme.spacing}px`],
  ];
  return `:root {\n${vars.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;
}
