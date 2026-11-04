import {
  FONT_STACKS,
  HEADER_STYLES,
  THEME_PRESETS,
  applyPreset,
  themeContrastIssues,
  type FontKey,
  type HeaderStyle,
  type Theme,
} from '@klinth/core';
import { useId, useState } from 'react';
import { useEditor } from '../state/store.ts';
import { Icon } from '../ui/Icon.tsx';

type ColorKey = keyof Theme['colors'];

const COLOR_LABELS: Record<ColorKey, { label: string; help: string }> = {
  background: { label: 'Page background', help: 'Behind everything.' },
  surface: { label: 'Cards and soft sections', help: 'Cards, quotes and tinted sections.' },
  text: { label: 'Main text', help: 'Headings and paragraphs.' },
  muted: { label: 'Soft text', help: 'Small labels and secondary text.' },
  accent: { label: 'Accent', help: 'Buttons, links and bold sections.' },
  accentText: { label: 'Text on accent', help: 'Words on buttons and bold sections.' },
};

export const FONT_LABELS: Record<FontKey, string> = {
  fraunces: 'Fraunces (soft serif)',
  'instrument-sans': 'Instrument Sans',
  bricolage: 'Bricolage (bold grotesk)',
  figtree: 'Figtree (friendly sans)',
  'system-sans': 'Clean sans',
  'system-serif': 'Classic serif',
  'system-mono': 'Typewriter',
  humanist: 'Friendly sans',
  didone: 'Elegant display',
  oldstyle: 'Bookish serif',
  grotesk: 'Bold grotesk',
  geometric: 'Geometric',
  rounded: 'Rounded',
};

/** Ready-made color sets. Each one passes every contrast check (tested). */
export const PALETTES: readonly { name: string; colors: Theme['colors'] }[] = [
  {
    name: 'Paper',
    colors: {
      background: '#f7f4ee',
      surface: '#ffffff',
      text: '#1c1a17',
      muted: '#6b645a',
      accent: '#b13a0b',
      accentText: '#ffffff',
    },
  },
  {
    name: 'Forest',
    colors: {
      background: '#0f2a22',
      surface: '#16362c',
      text: '#f3efe4',
      muted: '#b9c4b8',
      accent: '#f2b33d',
      accentText: '#1b1a12',
    },
  },
  {
    name: 'Ink',
    colors: {
      background: '#111111',
      surface: '#1c1c1c',
      text: '#f5f5f2',
      muted: '#a9a9a3',
      accent: '#e8e4d8',
      accentText: '#111111',
    },
  },
  {
    name: 'Coast',
    colors: {
      background: '#f3f6f7',
      surface: '#ffffff',
      text: '#14232b',
      muted: '#52646d',
      accent: '#1d5f7a',
      accentText: '#ffffff',
    },
  },
];

const HEX = /^#[0-9a-fA-F]{6}$/;

export const HEADER_LABELS: Record<HeaderStyle, { label: string; help: string }> = {
  bar: { label: 'Top bar', help: 'Name left, menu right, stays on top.' },
  pill: { label: 'Floating pill', help: 'A rounded bar floating over the page.' },
  centered: { label: 'Centered logo', help: 'Big name in the middle, menu below.' },
  minimal: { label: 'Minimal', help: 'Small and quiet, no line under it.' },
};

/** A copy of the theme that no longer claims to be a preset (after a manual edit). */
function withoutPreset(theme: Theme): Theme {
  const next = { ...theme };
  delete next.preset;
  return next;
}

/** The site-wide look: name, colors, fonts, roundness and spacing. */
export function ThemePanel() {
  const project = useEditor((s) => s.project);
  const change = useEditor((s) => s.change);
  if (!project) return null;
  const { theme, meta } = project;
  const issues = themeContrastIssues(theme);

  const setTheme = (patch: Partial<Theme>, key: string) =>
    change((p) => {
      // Own colors or fonts mean the look is no longer exactly the preset.
      const base = 'colors' in patch || 'fonts' in patch ? withoutPreset(p.theme) : p.theme;
      return { ...p, theme: { ...base, ...patch } };
    }, `theme.${key}`);
  const headerStyle = meta.headerStyle ?? 'bar';
  const setColor = (key: ColorKey, value: string) =>
    setTheme({ colors: { ...theme.colors, [key]: value.toLowerCase() } }, `colors.${key}`);

  return (
    <div className="space-y-6 p-4">
      <header>
        <p className="eyebrow">Whole site</p>
        <h2 className="mt-1 font-display text-xl">Site style</h2>
        <p className="help">These settings change every page at once.</p>
      </header>

      <section className="space-y-3" aria-labelledby="site-details">
        <h3 id="site-details" className="text-sm font-semibold">
          Details
        </h3>
        <MetaField
          label="Site name"
          help="Shown at the top of the page and in the browser tab."
          value={meta.title}
          max={120}
          onChange={(title) => change((p) => ({ ...p, meta: { ...p.meta, title } }), 'meta.title')}
        />
        <MetaField
          label="Short description"
          help="One sentence for search results."
          value={meta.description}
          max={300}
          onChange={(description) =>
            change((p) => ({ ...p, meta: { ...p.meta, description } }), 'meta.description')
          }
        />
      </section>

      <section className="space-y-3" aria-labelledby="site-looks">
        <h3 id="site-looks" className="text-sm font-semibold">
          Ready-made looks
        </h3>
        <p className="help -mt-1.5">
          Colors and fonts in one click. You can still change them below.
        </p>
        <div role="group" aria-label="Ready-made looks" className="grid grid-cols-2 gap-2">
          {THEME_PRESETS.map((preset) => {
            const active = theme.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                title={preset.description}
                className="rounded-lg border border-line p-1.5 text-left hover:border-ink aria-pressed:border-ink aria-pressed:ring-1 aria-pressed:ring-ink"
                onClick={() =>
                  change((p) => ({ ...p, theme: applyPreset(p.theme, preset.id) }), 'theme.preset')
                }
              >
                <span
                  className="flex h-12 items-end justify-between gap-1 rounded-md px-2 pb-1.5"
                  style={{ background: preset.colors.background, color: preset.colors.text }}
                  aria-hidden="true"
                >
                  <span
                    className="text-xl leading-none"
                    style={{ fontFamily: FONT_STACKS[preset.fonts.heading] }}
                  >
                    Aa
                  </span>
                  <span className="flex gap-1">
                    <span
                      className="size-3 rounded-full"
                      style={{ background: preset.colors.surface }}
                    />
                    <span
                      className="size-3 rounded-full"
                      style={{ background: preset.colors.accent }}
                    />
                  </span>
                </span>
                <span className="mt-1 block px-0.5 text-xs font-semibold">{preset.name}</span>
              </button>
            );
          })}
        </div>
      </section>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Header style</legend>
        <div className="grid grid-cols-2 gap-1.5">
          {HEADER_STYLES.map((style) => (
            <label
              key={style}
              className="cursor-pointer rounded-lg border border-line p-2 has-checked:border-ink has-checked:bg-sunk has-focus-visible:outline-2 has-focus-visible:outline-accent"
            >
              <input
                type="radio"
                className="sr-only"
                name="header-style"
                value={style}
                checked={headerStyle === style}
                onChange={() =>
                  change((p) => ({ ...p, meta: { ...p.meta, headerStyle: style } }), 'meta.header')
                }
              />
              <span className="block text-[0.8125rem] font-semibold">
                {HEADER_LABELS[style].label}
              </span>
              <span className="block text-[0.6875rem] leading-snug text-ink-soft">
                {HEADER_LABELS[style].help}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="space-y-3" aria-labelledby="site-colors">
        <h3 id="site-colors" className="text-sm font-semibold">
          Colors
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {PALETTES.map((palette) => (
            <button
              key={palette.name}
              type="button"
              className="group rounded-lg border border-line p-1.5 text-[0.6875rem] font-medium hover:border-ink"
              onClick={() =>
                change((p) => ({
                  ...p,
                  theme: { ...withoutPreset(p.theme), colors: palette.colors },
                }))
              }
            >
              <span
                className="flex h-8 overflow-hidden rounded-md"
                style={{ background: palette.colors.background }}
                aria-hidden="true"
              >
                <span
                  className="m-1.5 flex-1 rounded-sm"
                  style={{ background: palette.colors.text }}
                />
                <span
                  className="my-1.5 mr-1.5 w-3 rounded-sm"
                  style={{ background: palette.colors.accent }}
                />
              </span>
              <span className="mt-1 block">{palette.name}</span>
            </button>
          ))}
        </div>
        {(Object.keys(COLOR_LABELS) as ColorKey[]).map((key) => (
          <ColorField
            key={key}
            label={COLOR_LABELS[key].label}
            help={COLOR_LABELS[key].help}
            value={theme.colors[key]}
            onChange={(value) => setColor(key, value)}
          />
        ))}
        {issues.length ? (
          <div
            role="status"
            className="rounded-lg border border-[#e6c9a8] bg-[#fdf4e7] p-3 text-xs leading-relaxed"
          >
            <p className="flex items-center gap-1.5 font-semibold">
              <Icon name="warn" className="size-4 text-accent-strong" />
              Some text may be hard to read
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
              {issues.map((issue) => (
                <li key={issue.where}>{issue.where}</li>
              ))}
            </ul>
            <p className="mt-1.5 text-ink-soft">
              Try a darker text color or a lighter background, or pick a ready-made set above.
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-3" aria-labelledby="site-fonts">
        <h3 id="site-fonts" className="text-sm font-semibold">
          Fonts
        </h3>
        <FontField
          label="Headings"
          value={theme.fonts.heading}
          onChange={(heading) => setTheme({ fonts: { ...theme.fonts, heading } }, 'fonts')}
        />
        <FontField
          label="Text"
          value={theme.fonts.body}
          onChange={(body) => setTheme({ fonts: { ...theme.fonts, body } }, 'fonts')}
        />
      </section>

      <section className="space-y-4" aria-labelledby="site-shape">
        <h3 id="site-shape" className="text-sm font-semibold">
          Shape and space
        </h3>
        <RangeField
          label="Corner roundness"
          value={theme.radius}
          min={0}
          max={48}
          unit="px"
          onChange={(radius) => setTheme({ radius }, 'radius')}
        />
        <RangeField
          label="Space between things"
          value={theme.spacing}
          min={4}
          max={16}
          unit="px"
          onChange={(spacing) => setTheme({ spacing }, 'spacing')}
        />
      </section>
    </div>
  );
}

function MetaField(props: {
  label: string;
  help: string;
  value: string;
  max: number;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>
        {props.label}
      </label>
      <input
        id={id}
        className="input"
        value={props.value}
        maxLength={props.max}
        aria-describedby={`${id}-help`}
        onChange={(e) => props.onChange(e.target.value.replace(/[\r\n]+/g, ' '))}
      />
      <p id={`${id}-help`} className="help">
        {props.help}
      </p>
    </div>
  );
}

/** A color well plus a hex box. The hex box keeps a draft until it is a full color. */
function ColorField(props: {
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(props.value);
  const [seen, setSeen] = useState(props.value);
  if (props.value !== seen) {
    setSeen(props.value);
    setDraft(props.value);
  }
  const invalid = !HEX.test(draft);
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        aria-label={`${props.label} color picker`}
        className="size-9 shrink-0 cursor-pointer rounded-md border border-line-strong bg-white p-0.5"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-[0.8125rem] font-semibold">
          {props.label}
        </label>
        <p className="truncate text-[0.6875rem] text-ink-soft">{props.help}</p>
      </div>
      <input
        id={id}
        className="input w-[5.75rem] font-mono text-xs uppercase"
        value={draft}
        maxLength={7}
        spellCheck={false}
        aria-invalid={invalid}
        onChange={(e) => {
          const v = e.target.value.trim();
          const next = v.startsWith('#') ? v : `#${v}`;
          setDraft(next);
          if (HEX.test(next)) props.onChange(next);
        }}
      />
    </div>
  );
}

function FontField(props: { label: string; value: FontKey; onChange: (value: FontKey) => void }) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>
        {props.label}
      </label>
      <select
        id={id}
        className="input"
        value={props.value}
        style={{ fontFamily: FONT_STACKS[props.value] }}
        onChange={(e) => {
          const key = e.target.value;
          if (key in FONT_STACKS) props.onChange(key as FontKey);
        }}
      >
        {(Object.keys(FONT_LABELS) as FontKey[]).map((key) => (
          <option key={key} value={key} style={{ fontFamily: FONT_STACKS[key] }}>
            {FONT_LABELS[key]}
          </option>
        ))}
      </select>
    </div>
  );
}

function RangeField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[0.8125rem] font-semibold">
          {props.label}
        </label>
        <output htmlFor={id} className="font-mono text-xs text-ink-soft">
          {props.value}
          {props.unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="w-full accent-accent"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </div>
  );
}
