import { describe, expect, it } from 'vitest';
import {
  ANIM_CSS,
  ANIM_CSS_PATH,
  ANIM_JS,
  ANIM_JS_PATH,
  MIGRATIONS,
  SCHEMA_VERSION,
  TRANSITION_PRESETS,
  addPage,
  animationPresets,
  animationTargets,
  blankProject,
  blockPropSchemas,
  canvasAspect,
  migrateProject,
  projectSchema,
  renderSite,
  type BlockType,
  type Project,
} from './index.ts';
import { sampleProject } from './sample.ts';

type AnySection = Project['pages'][number]['sections'][number];

/** A project made from Blank with a second page holding `sections` (like the editor makes it). */
function onSecondPage(sections: Record<string, unknown>[]): Project {
  const { project } = addPage(blankProject(), 'Second page');
  const page = project.pages[1];
  if (!page) throw new Error('no second page');
  page.sections = sections as AnySection[];
  return project;
}

const file = (p: Project, path: string): string => {
  const f = renderSite(p).find((x) => x.path === path);
  if (typeof f?.content !== 'string') throw new Error(`${path} missing`);
  return f.content;
};
const sectionTag = (html: string, id: string): string =>
  new RegExp(`<section id="${id}"[^>]*>`).exec(html)?.[0] ?? '';

/** `{heading}` when the block has a heading, else no props. */
function withHeading(type: BlockType, heading: string): Record<string, unknown> {
  const schema = blockPropSchemas[type] as { safeParse: (v: unknown) => { success: boolean } };
  return schema.safeParse({ heading }).success ? { heading } : {};
}

/** A section of `type` with plain content (a blank canvas is always free). */
function sectionOf(type: BlockType, id: string, animation?: unknown): Record<string, unknown> {
  const base: Record<string, unknown> =
    type === 'canvas'
      ? { id, type, layout: 'free', canvas: { aspect: canvasAspect({}), items: [] }, props: {} }
      : { id, type, props: withHeading(type, `Heading of ${id}`) };
  if (animation) base.animation = animation;
  return base;
}

const ALL_TYPES = Object.keys(blockPropSchemas) as BlockType[];
const issues = (p: unknown) => projectSchema.safeParse(p).error?.issues ?? [];

describe('new presets: moving gradient, background parallax, section transitions', () => {
  it('offers a background on every section that can move as a whole', () => {
    for (const type of ALL_TYPES) {
      const targets = animationTargets(type);
      if (targets.includes('section')) {
        expect(targets, type).toContain('background');
        expect(animationPresets(type, 'background')).toEqual(['gradient', 'parallax']);
        expect(animationPresets(type, 'section')).toEqual(
          expect.arrayContaining([...TRANSITION_PRESETS]),
        );
      } else expect(targets, type).not.toContain('background');
    }
  });

  it('validates the new presets as closed enums on the right parts only', () => {
    const ok = (animation: unknown) => issues(onSecondPage([sectionOf('about', 'a', animation)]));
    expect(ok({ background: { preset: 'gradient', speed: 'slow' } })).toEqual([]);
    expect(ok({ background: { preset: 'parallax' } })).toEqual([]);
    for (const preset of TRANSITION_PRESETS) {
      expect(ok({ section: { preset, delay: 400, repeat: 'always' } })).toEqual([]);
      // Section transitions move the whole section, not a part of it.
      expect(ok({ heading: { preset } })).not.toEqual([]);
    }
    expect(ok({ background: { preset: 'fade' } })).not.toEqual([]);
    expect(ok({ background: { preset: 'gradient', delay: 300 } })).toEqual([]);
    expect(ok({ background: { preset: 'gradient', speed: 'ludicrous' } })).not.toEqual([]);
    expect(ok({ background: { preset: 'gradient', colors: 'red' } })).not.toEqual([]);
    expect(ok({ heading: { preset: 'gradient' } })).not.toEqual([]);
    expect(
      issues(onSecondPage([sectionOf('spacer', 's', { background: { preset: 'gradient' } })])),
    ).not.toEqual([]);
  });

  it('lets a free section have a moving background (it never moves the items)', () => {
    const p = onSecondPage([
      sectionOf('canvas', 'c', {
        section: { preset: 'rise' },
        background: { preset: 'gradient' },
      }),
    ]);
    expect(issues(p)).toEqual([]);
  });

  it('writes the background as a decorative layer with whole-number timing', () => {
    const p = onSecondPage([
      sectionOf('about', 'grad', { background: { preset: 'gradient', speed: 'fast' } }),
      sectionOf('textImage', 'px', { background: { preset: 'parallax' } }),
      sectionOf('hero', 'up', { section: { preset: 'rise', delay: 500 } }),
    ]);
    const html = file(p, 'second-page.html');
    expect(sectionTag(html, 'grad')).toContain('data-anim-background="gradient"');
    expect(sectionTag(html, 'grad')).toContain('--k-background-dur:10s');
    // Ambient: not an entrance, so it never waits for the script.
    expect(sectionTag(html, 'grad')).not.toContain('data-k-enter');
    expect(sectionTag(html, 'px')).toContain('data-anim-background="parallax"');
    expect(sectionTag(html, 'up')).toContain('data-anim-section="rise"');
    expect(sectionTag(html, 'up')).toContain('data-k-enter="section"');
    expect(sectionTag(html, 'up')).toContain('--k-section-delay:500ms');
    // No extra markup: the layer is a pseudo element, so screen readers never meet it.
    expect(html).not.toContain('k-grad');
    expect(ANIM_CSS).toContain('[data-anim-background]::before');
  });

  it('keeps the moving gradient still on small phones and with reduced motion', () => {
    const phone =
      /@media \(prefers-reduced-motion:no-preference\) and \(max-width:37\.5em\)\{([^@]*)\}/.exec(
        ANIM_CSS,
      )?.[1];
    expect(phone).toContain('[data-anim-background=gradient]::before{animation:none}');
    // The animation itself lives only inside the no-preference block.
    const outside = ANIM_CSS.replace(/@keyframes [\w-]+\{.*?\}\}/g, '').replace(
      /@media \(prefers-reduced-motion:no-preference\)[^{]*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g,
      '',
    );
    expect(outside).not.toMatch(/animation|opacity:0|transition/);
    expect(ANIM_JS).toContain('data-anim-background=parallax');
  });

  it('keeps sideways transitions from making the page scroll sideways', () => {
    expect(ANIM_CSS).toMatch(/\[data-anim-section=slideLeft\][^{]*\{[^}]*overflow-x:clip/);
  });

  it('moves a folded section as a whole too', () => {
    expect(ANIM_CSS).toContain('>:is(.wrap,.xp)');
  });
});

describe('every animation on a second page made from Blank', () => {
  it('each block, part and preset validates and exports', () => {
    // Round r gives every part of every section its r-th preset, so all pairs are used.
    const rounds = Math.max(
      ...ALL_TYPES.flatMap((type) =>
        animationTargets(type).map((t) => animationPresets(type, t).length),
      ),
    );
    const seen = new Set<string>();
    for (let r = 0; r < rounds; r++) {
      const sections = ALL_TYPES.flatMap((type, i) => {
        const targets = animationTargets(type);
        if (!targets.length) return [sectionOf(type, `s${i}`)];
        const animation: Record<string, unknown> = {};
        for (const target of targets) {
          const presets = animationPresets(type, target);
          const preset = presets[r % presets.length];
          animation[target] = { preset };
          seen.add(`${type}.${target}.${preset}`);
        }
        return [sectionOf(type, `s${i}`, animation)];
      });
      // The same section twice on one page works too.
      sections.push({
        ...sectionOf('about', 'again'),
        animation: { heading: { preset: 'words' } },
      });
      sections.push({
        ...sectionOf('about', 'again2'),
        animation: { heading: { preset: 'words' } },
      });
      const p = onSecondPage(sections);
      expect(JSON.stringify(issues(p)), `round ${r}`).toBe('[]');
      const html = file(p, 'second-page.html');
      expect(html).toContain('<link rel="stylesheet" href="css/anim.css">');
      expect(html).toContain('<script src="js/anim.js" defer></script>');
      expect(file(p, ANIM_CSS_PATH)).toBe(ANIM_CSS);
      expect(file(p, ANIM_JS_PATH)).toBe(ANIM_JS);
      // The home page (made from Blank, nothing animated) links nothing.
      expect(file(p, 'index.html')).not.toContain('anim.');
    }
    const expected = ALL_TYPES.flatMap((type) =>
      animationTargets(type).flatMap((t) =>
        animationPresets(type, t).map((x) => `${type}.${t}.${x}`),
      ),
    );
    for (const key of expected) expect(seen, key).toContain(key);
  });

  it('splits headings accessibly on every block that has one', () => {
    for (const type of ALL_TYPES) {
      if (!animationPresets(type, 'heading').includes('words')) continue;
      for (const preset of ['words', 'letters', 'typewriter'] as const) {
        const p = onSecondPage([
          { ...sectionOf(type, 'x'), props: { heading: 'Hello <b>moving</b> world' } },
          {
            ...sectionOf(type, 'y'),
            props: { heading: 'Second one' },
            animation: { heading: { preset } },
          },
        ]);
        expect(issues(p), `${type} ${preset}`).toEqual([]);
        const html = file(p, 'second-page.html');
        const heading = /<h[12][^>]*data-k-split[^>]*>([\s\S]*?)<\/h[12]>/.exec(html);
        expect(heading?.[0], `${type} ${preset}`).toContain('aria-label="Second one"');
        // Each piece is hidden from screen readers; the real text stays in the page.
        const pieces = heading?.[1] ?? '';
        expect(pieces).toMatch(/^(<span class="k-w" aria-hidden="true">.*<\/span>\s?)+$/);
        expect(pieces.replace(/<[^>]+>/g, '')).toBe('Second one');
      }
    }
  });
});

describe('schema version 10', () => {
  it('upgrades version 9 files without changing them', () => {
    expect(SCHEMA_VERSION).toBe(10);
    expect(Object.keys(MIGRATIONS)).toContain('9');
    const v9 = { ...JSON.parse(JSON.stringify(sampleProject)), schemaVersion: 9 };
    expect(migrateProject(v9)).toEqual({ ...v9, schemaVersion: 10 });
  });
});
