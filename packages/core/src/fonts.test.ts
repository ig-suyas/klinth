import { describe, expect, it } from 'vitest';
import { buildExport } from './export.ts';
import { BUNDLED_FONTS, fontFaceCss, fontLicense, themeFonts } from './fonts.ts';
import { renderSite } from './render.ts';
import { sampleProject } from './sample.ts';
import { defaultTheme, FONT_STACKS } from './tokens.ts';

describe('bundled fonts', () => {
  it('lists the fonts a theme uses, once each', () => {
    expect(themeFonts(defaultTheme).map((f) => f.family)).toEqual(['Fraunces', 'Instrument Sans']);
    const same = { ...defaultTheme, fonts: { heading: 'figtree', body: 'figtree' } } as const;
    expect(themeFonts(same)).toHaveLength(1);
    const system = { ...defaultTheme, fonts: { heading: 'didone', body: 'system-sans' } } as const;
    expect(themeFonts(system)).toEqual([]);
  });

  it('names each bundled family first in its stack, with a fallback', () => {
    for (const [key, font] of Object.entries(BUNDLED_FONTS)) {
      const stack = FONT_STACKS[key as keyof typeof FONT_STACKS];
      expect(stack.startsWith(`"${font.family}"`)).toBe(true);
      expect(stack).toMatch(/(serif|sans-serif)$/);
    }
  });

  it('writes @font-face rules with swap and a latin range, and a licence', () => {
    const fonts = themeFonts(defaultTheme);
    const css = fontFaceCss(fonts);
    expect(css.match(/@font-face/g)).toHaveLength(2);
    expect(css).toContain('font-display:swap');
    expect(css).toContain('url(../fonts/fraunces-latin-wght-normal.woff2)');
    const licence = fontLicense(fonts);
    expect(licence).toContain('SIL Open Font License');
    expect(licence).toContain('The Fraunces Project Authors');
  });

  it('preloads the heading font on export but not in the preview', () => {
    const project = { ...sampleProject, theme: defaultTheme };
    const site = renderSite(project);
    const index = site.find((f) => f.path === 'index.html')?.content as string;
    expect(index).toContain('<link rel="preload" href="fonts/fraunces-latin-wght-normal.woff2"');
    const css = site.find((f) => f.path === 'css/site.css')?.content as string;
    expect(css).toContain('@font-face');
    const preview = renderSite(project, { preview: true });
    expect(preview.find((f) => f.path === 'index.html')?.content).not.toContain('rel="preload"');
    expect(preview.find((f) => f.path === 'css/site.css')?.content).not.toContain('@font-face');
  });

  it('refuses to export without the font bytes', () => {
    const project = { ...sampleProject, theme: defaultTheme };
    expect(() => buildExport(project, new Map([['img1', new Uint8Array([1])]]), new Map())).toThrow(
      /font "Fraunces"/,
    );
  });
});
