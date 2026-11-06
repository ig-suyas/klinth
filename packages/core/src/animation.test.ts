import { describe, expect, it } from 'vitest';
import {
  ANIM_CSS,
  ANIM_CSS_PATH,
  ANIM_JS,
  ANIM_JS_PATH,
  MAX_ANIMATED_SECTIONS,
  MAX_ANIMATION_DELAY,
  MIGRATIONS,
  SCHEMA_VERSION,
  SITE_CSS,
  animationPresets,
  animationTargets,
  buildExport,
  migrateProject,
  parseProjectFile,
  projectSchema,
  serializeProject,
  splitText,
  type Project,
} from './index.ts';
import { sampleProject } from './sample.ts';
import { TEST_FONTS } from './test-fonts.ts';

/** The value, or a failed test when it is missing. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing value');
  return value;
}

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const exportOf = (p: Project) =>
  buildExport(p, new Map(p.assets.map((a) => [a.id, new Uint8Array([1, 2, 3])])), TEST_FONTS);
const text = (files: ReturnType<typeof buildExport>, path: string): string => {
  const file = files.find((f) => f.path === path);
  if (typeof file?.content !== 'string') throw new Error(`${path} missing`);
  return file.content;
};

/** The sample with animations on the hero (first section) and the projects section. */
function animated(): Project {
  const p = clone();
  const [hero, work] = must(p.pages[0]).sections as unknown as Record<string, unknown>[];
  must(hero).animation = {
    heading: { preset: 'words', speed: 'slow', delay: 200 },
    buttons: { preset: 'lift' },
  };
  must(work).animation = {
    section: { preset: 'slideUp', repeat: 'always' },
    cards: { preset: 'glow' },
    media: { preset: 'maskWipe', speed: 'fast' },
  };
  return p;
}

const withAnimation = (animation: unknown, index = 0): unknown => {
  const p = clone() as unknown as { pages: { sections: Record<string, unknown>[] }[] };
  must(must(p.pages[0]).sections[index]).animation = animation;
  return p;
};

const valid = (data: unknown): boolean => projectSchema.safeParse(data).success;

describe('animation settings schema', () => {
  it('accepts presets that fit the element', () => {
    expect(valid(animated())).toBe(true);
    expect(valid(withAnimation({ media: { preset: 'parallax' } }, 0))).toBe(true);
    expect(valid(withAnimation({ heading: { preset: 'typewriter', delay: 0 } }))).toBe(true);
    expect(
      valid(withAnimation({ heading: { preset: 'letters', delay: MAX_ANIMATION_DELAY } })),
    ).toBe(true);
  });

  it('rejects unknown presets, speeds and repeat choices', () => {
    expect(valid(withAnimation({ heading: { preset: 'spin' } }))).toBe(false);
    expect(valid(withAnimation({ heading: { preset: 'fade', speed: 'warp' } }))).toBe(false);
    expect(valid(withAnimation({ heading: { preset: 'fade', repeat: 'twice' } }))).toBe(false);
    expect(valid(withAnimation({ heading: { preset: 'Fade' } }))).toBe(false);
  });

  it('rejects delays out of range or not whole milliseconds', () => {
    for (const delay of [-1, MAX_ANIMATION_DELAY + 1, 12.5, Number.NaN, '200', '1s;color:red']) {
      expect(valid(withAnimation({ heading: { preset: 'fade', delay } })), String(delay)).toBe(
        false,
      );
    }
  });

  it('rejects unknown elements and extra fields', () => {
    expect(valid(withAnimation({ footer: { preset: 'fade' } }))).toBe(false);
    expect(valid(withAnimation({ heading: { preset: 'fade', css: 'color:red' } }))).toBe(false);
    expect(valid(withAnimation({ heading: { speed: 'slow' } }))).toBe(false);
  });

  it('rejects a preset on an element it does not fit', () => {
    expect(valid(withAnimation({ heading: { preset: 'parallax' } }))).toBe(false);
    expect(valid(withAnimation({ section: { preset: 'words' } }))).toBe(false);
    expect(valid(withAnimation({ buttons: { preset: 'maskWipe' } }))).toBe(false);
    // Marquee is for picture rows (galleries), not a single hero picture.
    expect(valid(withAnimation({ media: { preset: 'marquee' } }))).toBe(false);
    // Parallax is for big pictures, not project covers.
    expect(valid(withAnimation({ media: { preset: 'parallax' } }, 1))).toBe(false);
  });

  it('rejects an element the section does not have', () => {
    // The hero has no video, the links section no buttons.
    expect(valid(withAnimation({ video: { preset: 'fade' } }))).toBe(false);
    expect(valid(withAnimation({ buttons: { preset: 'lift' } }, 2))).toBe(false);
    expect(animationTargets('spacer')).toEqual([]);
    expect(animationTargets('video')).toContain('video');
  });

  it('never lets the video player itself move: only its thumbnail, never on hover', () => {
    expect(animationPresets('video', 'video')).not.toContain('lift');
    expect(animationPresets('video', 'video')).not.toContain('parallax');
    expect(animationPresets('video', 'video')).toContain('maskWipe');
  });

  it('caps how many sections of one page can be animated', () => {
    const p = clone() as unknown as { pages: { sections: Record<string, unknown>[] }[] };
    must(p.pages[0]).sections = Array.from({ length: MAX_ANIMATED_SECTIONS + 1 }, (_, i) => ({
      id: `s${i}`,
      type: 'about',
      props: { heading: `Part ${i}` },
      animation: { section: { preset: 'fade' } },
    }));
    expect(valid(p)).toBe(false);
    must(p.pages[0]).sections.pop();
    expect(valid(p)).toBe(true);
  });

  it('upgrades a version 3 project and keeps animations through a project file', () => {
    expect(SCHEMA_VERSION).toBe(8);
    expect(Object.keys(MIGRATIONS)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    const upgraded = migrateProject({ ...clone(), schemaVersion: 3 });
    expect(upgraded.schemaVersion).toBe(8);
    expect(upgraded.pages).toEqual(clone().pages);
    const back = parseProjectFile(serializeProject(animated()));
    expect(must(must(back.pages[0]).sections[0]).animation).toEqual(
      must(must(animated().pages[0]).sections[0]).animation,
    );
  });

  it('refuses an imported file with bad animation settings', () => {
    const bad = withAnimation({ heading: { preset: 'fade', delay: 99999 } }) as Project;
    expect(() => parseProjectFile(JSON.stringify({ ...bad, schemaVersion: 6 }))).toThrow(/damaged/);
  });
});

/** Text a search engine or a copy and paste would get: the HTML without tags. */
const visibleText = (html: string): string =>
  html
    .replace(/<br>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

describe('text splitting', () => {
  it('splits into words that are hidden from screen readers, with the full text as the label', () => {
    const out = splitText('Hello big  world', 'words');
    expect(out.label).toBe('Hello big world');
    expect(out.count).toBe(3);
    expect(visibleText(out.html)).toBe('Hello big world');
    const pieces = out.html.match(/<span class="k-w" aria-hidden="true">/g) ?? [];
    expect(pieces).toHaveLength(3);
  });

  it('splits into letters but keeps each word together and emoji whole', () => {
    const out = splitText('Hi 👋🏽 you', 'letters');
    expect(out.html.match(/class="k-w"/g)).toHaveLength(3);
    expect(out.html).toContain('<span class="k-c" style="--i:2">👋🏽</span>');
    expect(visibleText(out.html)).toBe('Hi 👋🏽 you');
    expect(out.count).toBe(6);
  });

  it('escapes the text and keeps line breaks', () => {
    const out = splitText('<b>Big</b> &\nbold', 'words');
    expect(out.html).not.toContain('<b>');
    expect(out.html).toContain('&lt;b&gt;Big&lt;/b&gt;');
    expect(out.html).toContain('<br>');
    expect(out.label).toBe('<b>Big</b> & bold');
    expect(visibleText(out.html)).toBe('<b>Big</b> &\nbold');
  });
});

describe('animations in the export', () => {
  it('adds nothing when no section is animated', () => {
    const files = exportOf(clone());
    expect(files.some((f) => f.path === ANIM_CSS_PATH || f.path === ANIM_JS_PATH)).toBe(false);
    const html = text(files, 'index.html');
    expect(html).not.toContain('anim');
    expect(html).not.toContain('k-in');
  });

  it('writes small CSS and JS files linked only from pages that animate', () => {
    const files = exportOf(animated());
    expect(text(files, ANIM_CSS_PATH)).toBe(ANIM_CSS);
    expect(text(files, ANIM_JS_PATH)).toBe(ANIM_JS);
    expect(ANIM_CSS.length).toBeLessThan(16_000);
    expect(ANIM_JS.length).toBeLessThan(8_000);
    const home = text(files, 'index.html');
    expect(home).toMatch(
      /<link rel="stylesheet" href="css\/site.css">\n<link rel="stylesheet" href="css\/anim.css">/,
    );
    expect(home).toContain('<script src="js/anim.js" defer></script>');
    const about = text(files, 'about.html');
    expect(about).not.toContain('anim.');
  });

  it('marks the animated sections and keeps the content in the page', () => {
    const home = text(exportOf(animated()), 'index.html');
    // The first section plays on load (no hidden state), the others wait for the script.
    expect(home).toContain(
      '<section id="hero" class="block block-hero bg-plain k-anim k-in-heading" data-anim-heading="words" data-anim-buttons="lift" data-k-enter="heading" style="--k-heading-dur:1.1s;--k-heading-delay:200ms;--k-heading-step:.08s">',
    );
    expect(home).toContain(
      '<section id="work" class="block block-projects bg-plain k-anim" data-anim-section="slideUp" data-anim-media="maskWipe" data-anim-cards="glow" data-k-enter="section media" data-k-again="section" style="--k-section-dur:.7s;--k-section-delay:0ms;--k-media-dur:.45s;--k-media-delay:0ms">',
    );
    // The split heading: one label for screen readers, the words still in the page.
    expect(home).toMatch(/<h1 class="display" data-k-split aria-label="Asha Rao" style="--n:2">/);
    expect(home).toContain(
      '<span class="k-w" aria-hidden="true"><span style="--i:0">Asha</span></span>',
    );
    expect(home).toContain('River atlas');
  });

  it('animates a video only through its thumbnail and keeps click to play', () => {
    const p = clone();
    must(p.pages[0]).sections.splice(1, 0, {
      id: 'film',
      type: 'video',
      props: { heading: 'Film', embedUrl: 'https://youtu.be/dQw4w9WgXcQ' },
      animation: { video: { preset: 'zoom' } },
    });
    const home = text(exportOf(p), 'index.html');
    expect(home).toContain('data-anim-video="zoom"');
    expect(home).toContain('class="video-facade"');
    expect(home).toContain('data-embed="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(home).not.toContain('<iframe');
    // The rules move the thumbnail (the facade), never the frame that later holds the player.
    expect(ANIM_CSS).toContain('.video-facade');
    expect(ANIM_CSS).not.toMatch(/\.video-frame[^{]*\{[^}]*animation/);
    expect(ANIM_CSS).not.toMatch(/iframe/);
  });

  it('only moves transform and opacity (blur also softens, and is plain fade on phones)', () => {
    const keyframes = [...ANIM_CSS.matchAll(/@keyframes ([\w-]+)\{(.*?)\}\}/g)];
    expect(keyframes.length).toBeGreaterThan(3);
    for (const [, name, body] of keyframes) {
      const props = [...(body ?? '').matchAll(/([a-z-]+):/g)].map((m) => m[1]);
      const allowed =
        name === 'k-blur' ? ['opacity', 'transform', 'filter'] : ['opacity', 'transform'];
      for (const prop of props) expect(allowed, `${name}: ${prop}`).toContain(prop);
    }
    for (const [, value] of ANIM_CSS.matchAll(/transition:([^;}]+)/g)) {
      expect(value).toMatch(/^(transform|opacity)\b/);
    }
    // Word reveal reuses the poster headline's keyframes from site.css.
    expect(ANIM_CSS).toContain('animation:line-up');
    expect(ANIM_CSS).not.toContain('@keyframes line-up');
    expect(SITE_CSS).toContain('@keyframes line-up');
  });

  it('keeps every moving or hiding rule behind the reduced-motion check', () => {
    // Keyframes only describe motion; they never run unless a rule inside the check uses them.
    const outside = ANIM_CSS.replace(/@keyframes [\w-]+\{.*?\}\}/g, '').replace(
      /@media \(prefers-reduced-motion:no-preference\)[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g,
      '',
    );
    expect(outside).not.toMatch(/animation|opacity:0|transition/);
    expect(ANIM_CSS).toContain(
      '@media (prefers-reduced-motion:no-preference) and (max-width:37.5em)',
    );
  });
});
