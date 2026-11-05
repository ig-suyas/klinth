import { describe, expect, it } from 'vitest';
import {
  HEADER_STYLES,
  MIGRATIONS,
  SCHEMA_VERSION,
  THEME_PRESETS,
  applyPreset,
  blankProject,
  migrateProject,
  parseProjectFile,
  projectSchema,
  renderSite,
  serializeProject,
  themeContrastIssues,
  themeFonts,
  themeSchema,
  themeToCss,
  type Project,
} from './index.ts';
import { sampleProject } from './sample.ts';

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const html = (p: Project, path = 'index.html'): string => {
  const file = renderSite(p).find((f) => f.path === path);
  if (typeof file?.content !== 'string') throw new Error(`${path} missing`);
  return file.content;
};
const css = (p: Project): string => {
  const file = renderSite(p).find((f) => f.path === 'css/site.css');
  return typeof file?.content === 'string' ? file.content : '';
};

describe('header styles', () => {
  it('offers top bar, floating pill, centered logo and minimal', () => {
    expect(HEADER_STYLES).toEqual(['bar', 'pill', 'centered', 'minimal']);
  });

  it.each(HEADER_STYLES)('renders the %s header with the same accessible markup', (style) => {
    const p = clone();
    p.meta.headerStyle = style;
    const page = html(migrateProject(p));
    expect(page).toContain(`<header class="site-header header-${style}" id="top">`);
    expect(page).toContain('<nav class="nav');
    expect(page).toContain('aria-label="Main"');
    expect(page).toContain('<a class="skip" href="#main">');
    // Every style has its own rules in the stylesheet.
    expect(css(p)).toContain(`.header-${style}`);
  });

  it('uses the top bar when no style is set', () => {
    const p = clone();
    delete p.meta.headerStyle;
    expect(html(p)).toContain('<header class="site-header header-bar" id="top">');
  });

  it('refuses unknown or unsafe styles', () => {
    for (const bad of ['floating', 'bar" onclick="x', '', 'BAR']) {
      const p = clone() as unknown as { meta: Record<string, unknown> };
      p.meta.headerStyle = bad;
      expect(projectSchema.safeParse(p).success, bad).toBe(false);
    }
  });

  it('keeps the phone menu inside the header (no layout jump)', () => {
    const sheet = css(clone());
    // The menu panel floats over the page instead of pushing content down.
    expect(sheet).toMatch(/\.menu-panel\{position:absolute/);
    // Pill and centered headers keep a fixed bar height on phones.
    expect(sheet).toMatch(/\.header-pill \.bar\{[^}]*min-height:/);
  });
});

describe('theme presets', () => {
  it('has at least six curated presets with unique ids and names', () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(THEME_PRESETS.map((p) => p.id)).size).toBe(THEME_PRESETS.length);
    expect(new Set(THEME_PRESETS.map((p) => p.name)).size).toBe(THEME_PRESETS.length);
  });

  it.each(THEME_PRESETS.map((p) => [p.id, p] as const))(
    '%s passes theme validation and contrast',
    (id, preset) => {
      const theme = applyPreset(blankProject().theme, id);
      expect(themeSchema.parse(theme)).toEqual(theme);
      expect(theme.colors).toEqual(preset.colors);
      expect(theme.fonts).toEqual(preset.fonts);
      expect(theme.preset).toBe(id);
      expect(themeContrastIssues(theme)).toEqual([]);
      // System font stacks only: nothing to download.
      expect(themeFonts(theme)).toEqual([]);
      // Only safe characters reach the stylesheet.
      expect(themeToCss(theme)).not.toMatch(/[<>\\]|url\(|@import|expression\(/i);
    },
  );

  it('keeps corner roundness and spacing when applied, and stays editable', () => {
    const base = { ...blankProject().theme, radius: 30, spacing: 12 };
    const theme = applyPreset(base, 'midnight');
    expect(theme.radius).toBe(30);
    expect(theme.spacing).toBe(12);
    const p = blankProject();
    p.theme = { ...theme, colors: { ...theme.colors, accent: '#123456' } };
    expect(migrateProject(p).theme.colors.accent).toBe('#123456');
  });

  it('refuses an unknown preset id', () => {
    expect(() => applyPreset(blankProject().theme, 'nope' as never)).toThrow();
    const p = blankProject() as unknown as { theme: Record<string, unknown> };
    p.theme.preset = 'nope';
    expect(projectSchema.safeParse(p).success).toBe(false);
  });
});

describe('schema version 2', () => {
  const v1 = (): Record<string, unknown> => {
    const p = clone() as unknown as Record<string, unknown> & { meta: Record<string, unknown> };
    delete p.meta.headerStyle;
    return { ...p, schemaVersion: 1 };
  };

  it('has an upgrade step (version 5 is now current, see free.test.ts)', () => {
    expect(SCHEMA_VERSION).toBe(6);
    expect(Object.keys(MIGRATIONS)).toContain('1');
  });

  it('upgrades a version 1 project to the top bar header', () => {
    const upgraded = migrateProject(v1());
    expect(upgraded.schemaVersion).toBe(SCHEMA_VERSION);
    expect(upgraded.meta.headerStyle).toBe('bar');
    expect(upgraded.theme.preset).toBeUndefined();
    expect(upgraded.pages).toEqual(clone().pages);
  });

  it('upgrades a version 1 project file and round-trips it', () => {
    const upgraded = parseProjectFile(JSON.stringify(v1()));
    const p = { ...upgraded, meta: { ...upgraded.meta, headerStyle: 'pill' as const } };
    p.theme = applyPreset(p.theme, 'gallery');
    expect(parseProjectFile(serializeProject(p))).toEqual(p);
  });
});
