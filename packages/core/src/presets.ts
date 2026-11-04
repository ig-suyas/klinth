import type { FontKey, Theme } from './tokens.ts';

/**
 * Curated looks: a color set plus a pair of system font stacks (nothing to
 * download). Applying one keeps the site's roundness and spacing; every value
 * stays editable afterwards. Each preset passes the contrast checks (tested).
 */
export interface ThemePreset {
  readonly id: PresetId;
  readonly name: string;
  readonly description: string;
  readonly colors: Theme['colors'];
  readonly fonts: { readonly heading: FontKey; readonly body: FontKey };
}

export const PRESET_IDS = [
  'gallery',
  'midnight',
  'meadow',
  'terracotta',
  'newsprint',
  'harbor',
  'velvet',
  'sunbeam',
] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const THEME_PRESETS: readonly ThemePreset[] = [
  {
    id: 'gallery',
    name: 'Gallery',
    description: 'Warm paper with an elegant display serif.',
    colors: {
      background: '#f6f2ea',
      surface: '#ebe4d6',
      text: '#1b1813',
      muted: '#5c5549',
      accent: '#9c3412',
      accentText: '#fffaf3',
    },
    fonts: { heading: 'didone', body: 'humanist' },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep navy, crisp grotesk and a cool blue spark.',
    colors: {
      background: '#0d1117',
      surface: '#161c26',
      text: '#eef1f5',
      muted: '#a3adbb',
      accent: '#7cc4ff',
      accentText: '#0d1117',
    },
    fonts: { heading: 'grotesk', body: 'system-sans' },
  },
  {
    id: 'meadow',
    name: 'Meadow',
    description: 'Soft greens and a bookish serif.',
    colors: {
      background: '#f1f5ee',
      surface: '#e1e9da',
      text: '#16211a',
      muted: '#4b5a4e',
      accent: '#2c6636',
      accentText: '#ffffff',
    },
    fonts: { heading: 'oldstyle', body: 'humanist' },
  },
  {
    id: 'terracotta',
    name: 'Terracotta',
    description: 'Sun-baked clay with a clean geometric face.',
    colors: {
      background: '#f5ece4',
      surface: '#ead9ca',
      text: '#2a1a12',
      muted: '#674f43',
      accent: '#9a3a1c',
      accentText: '#ffffff',
    },
    fonts: { heading: 'geometric', body: 'system-sans' },
  },
  {
    id: 'newsprint',
    name: 'Newsprint',
    description: 'Black on white with a typewriter voice.',
    colors: {
      background: '#ffffff',
      surface: '#f0f0ed',
      text: '#111111',
      muted: '#595955',
      accent: '#111111',
      accentText: '#ffffff',
    },
    fonts: { heading: 'system-mono', body: 'system-sans' },
  },
  {
    id: 'harbor',
    name: 'Harbor',
    description: 'Sea blues and a calm classic serif.',
    colors: {
      background: '#f1f6f8',
      surface: '#ffffff',
      text: '#0f2430',
      muted: '#4b616d',
      accent: '#0b5878',
      accentText: '#ffffff',
    },
    fonts: { heading: 'system-serif', body: 'system-sans' },
  },
  {
    id: 'velvet',
    name: 'Velvet',
    description: 'Dark plum with a soft pink glow.',
    colors: {
      background: '#1a1220',
      surface: '#261b2e',
      text: '#f6eff8',
      muted: '#c0afc8',
      accent: '#f2a9ca',
      accentText: '#1a1220',
    },
    fonts: { heading: 'didone', body: 'system-sans' },
  },
  {
    id: 'sunbeam',
    name: 'Sunbeam',
    description: 'Bright butter yellow and friendly rounded letters.',
    colors: {
      background: '#fff8e6',
      surface: '#fbecc2',
      text: '#231b04',
      muted: '#5b4f22',
      accent: '#1d3bb3',
      accentText: '#ffffff',
    },
    fonts: { heading: 'rounded', body: 'rounded' },
  },
];

/** The theme with a preset's colors and fonts. Roundness and spacing stay as they are. */
export function applyPreset(theme: Theme, id: PresetId): Theme {
  const preset = THEME_PRESETS.find((p) => p.id === id);
  if (!preset) throw new Error(`Unknown theme preset: ${String(id)}`);
  return {
    ...theme,
    colors: { ...preset.colors },
    fonts: { ...preset.fonts },
    preset: preset.id,
  };
}
