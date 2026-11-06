import { describe, expect, it } from 'vitest';
import {
  CANVAS_CSS,
  CANVAS_REF,
  FREE_CSS,
  MIGRATIONS,
  SCHEMA_VERSION,
  blockPropSchemas,
  canvasAspect,
  canvasHeight,
  canvasHeightPx,
  canvasIsDark,
  freeToFlow,
  hexToRgb,
  migrateProject,
  projectSchema,
  renderSite,
  resizeCanvas,
  type FreeCanvas,
  type Project,
} from './index.ts';
import { sampleProject } from './sample.ts';

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
type AnySection = Project['pages'][number]['sections'][number];

function withCanvas(props: Record<string, unknown>, canvas?: Partial<FreeCanvas>): Project {
  const p = clone();
  const page = p.pages[0];
  if (!page) throw new Error('no page');
  page.sections.splice(1, 0, {
    id: 'blank',
    type: 'canvas',
    layout: 'free',
    canvas: { aspect: canvasAspect(props), items: [], ...canvas },
    props,
  } as AnySection);
  return p;
}
const file = (p: Project, path: string): string => {
  const f = renderSite(p).find((x) => x.path === path);
  if (typeof f?.content !== 'string') throw new Error(`${path} missing`);
  return f.content;
};
const section = (p: Project): string =>
  /<section id="blank"[\s\S]*?<\/section>/.exec(file(p, 'index.html'))?.[0] ?? '';
const ok = (props: Record<string, unknown>) => blockPropSchemas.canvas.safeParse(props).success;

describe('blank canvas: height maths', () => {
  it('maps the presets to a share of the screen height', () => {
    expect(canvasHeight({ height: 'quarter' })).toEqual({ unit: 'vh', value: 25 });
    expect(canvasHeight({})).toEqual({ unit: 'vh', value: 50 });
    expect(canvasHeight({ height: 'threeQuarter' })).toEqual({ unit: 'vh', value: 75 });
    expect(canvasHeight({ height: 'full' })).toEqual({ unit: 'vh', value: 100 });
  });

  it('uses a custom percent or pixel value, with defaults', () => {
    expect(canvasHeight({ height: 'custom', heightVh: 60 })).toEqual({ unit: 'vh', value: 60 });
    expect(canvasHeight({ height: 'custom' })).toEqual({ unit: 'vh', value: 50 });
    expect(canvasHeight({ height: 'custom', heightUnit: 'px', heightPx: 640 })).toEqual({
      unit: 'px',
      value: 640,
    });
    expect(canvasHeight({ height: 'custom', heightUnit: 'px' })).toEqual({
      unit: 'px',
      value: 480,
    });
    // A custom value only counts with "custom".
    expect(canvasHeight({ height: 'full', heightPx: 200, heightUnit: 'px' })).toEqual({
      unit: 'vh',
      value: 100,
    });
  });

  it('works out px heights for a screen and never goes below the smallest height', () => {
    expect(canvasHeightPx({ height: 'half' }, 900)).toBe(450);
    expect(canvasHeightPx({ height: 'quarter' }, 800)).toBe(200);
    expect(canvasHeightPx({ height: 'quarter', minHeight: 320 }, 800)).toBe(320);
    expect(canvasHeightPx({ height: 'custom', heightUnit: 'px', heightPx: 700 }, 400)).toBe(700);
    expect(canvasHeightPx({ height: 'full' }, NaN)).toBe(0);
  });

  it('shapes the artboard to fill the section on the reference screen', () => {
    expect(CANVAS_REF).toEqual({ width: 1120, viewport: 900 });
    expect(canvasAspect({ height: 'half' })).toBe(2.4889);
    expect(canvasAspect({ height: 'full' })).toBe(1.2444);
    expect(canvasAspect({ height: 'quarter', minHeight: 450 })).toBe(2.4889);
    expect(canvasAspect({ height: 'custom', heightUnit: 'px', heightPx: 280 })).toBe(4);
    // Kept within the free canvas limits.
    expect(canvasAspect({ height: 'custom', heightUnit: 'px', heightPx: 80 })).toBe(14);
  });

  it('keeps items in place on screen when the height changes', () => {
    const canvas: FreeCanvas = {
      aspect: 2,
      items: [
        {
          id: 'a',
          type: 'text',
          style: 'title',
          text: 'Hi',
          size: 5,
          x: 10,
          y: 20,
          w: 50,
          h: 10,
          z: 0,
        },
      ],
    };
    // Twice as tall: the board's aspect halves, the item's % numbers halve, same px.
    const taller = resizeCanvas(canvas, { height: 'custom', heightUnit: 'px', heightPx: 1120 });
    expect(taller.aspect).toBe(1);
    expect(taller.items[0]).toMatchObject({ x: 10, y: 10, w: 50, h: 5 });
  });

  it('never makes the artboard too short for its lowest item', () => {
    const canvas: FreeCanvas = {
      aspect: 1,
      items: [{ id: 'a', type: 'button', label: 'Go', href: '', x: 0, y: 70, w: 20, h: 10, z: 0 }],
    };
    const short = resizeCanvas(canvas, { height: 'quarter' });
    const item = short.items[0];
    if (!item) throw new Error('no item');
    expect(item.y + item.h).toBeLessThanOrEqual(100);
    expect(short.aspect).toBe(1.25);
  });
});

describe('blank canvas: validation', () => {
  it('accepts every height, unit and fill', () => {
    for (const height of ['quarter', 'half', 'threeQuarter', 'full', 'custom'])
      expect(ok({ height })).toBe(true);
    for (const fill of ['none', 'color', 'gradient', 'image']) expect(ok({ fill })).toBe(true);
    expect(ok({ height: 'custom', heightUnit: 'px', heightPx: 3000, minHeight: 1200 })).toBe(true);
    expect(ok({ color: '#1F3fe0', colorTo: '#000000', angle: 360, dim: 90, image: 'img1' })).toBe(
      true,
    );
  });

  it('refuses out-of-range or non-numbers, odd colors and unknown fields', () => {
    for (const bad of [9, 201, 50.5, NaN, Infinity, '50', '50vh'])
      expect(ok({ heightVh: bad })).toBe(false);
    for (const bad of [79, 3001, 12.3, '480px']) expect(ok({ heightPx: bad })).toBe(false);
    for (const bad of [-1, 1201, 'calc(1px)']) expect(ok({ minHeight: bad })).toBe(false);
    for (const bad of ['red', '#fff', '#12345g', 'url(x)', '#1f3fe0;x:y', 'rgb(0,0,0)']) {
      expect(ok({ color: bad })).toBe(false);
    }
    expect(ok({ angle: 361 })).toBe(false);
    expect(ok({ dim: 91 })).toBe(false);
    expect(ok({ height: 'tall' })).toBe(false);
    expect(ok({ fill: 'video' })).toBe(false);
    expect(ok({ backgroundUrl: 'x' })).toBe(false);
  });

  it('is always placed freely', () => {
    const p = withCanvas({ height: 'half' });
    expect(projectSchema.safeParse(p).success).toBe(true);
    const page = p.pages[0];
    const s = page?.sections[1];
    if (!page || !s) throw new Error('no section');
    const flow = { ...s } as Record<string, unknown>;
    delete flow.layout;
    delete flow.canvas;
    page.sections[1] = flow as AnySection;
    expect(projectSchema.safeParse(p).success).toBe(false);
  });

  it('starts empty and holds the same items as any free section', () => {
    const p = withCanvas(
      {},
      {
        items: [
          {
            id: 't',
            type: 'text',
            style: 'title',
            text: 'Hello',
            size: 5,
            x: 5,
            y: 5,
            w: 50,
            h: 12,
            z: 0,
          },
          {
            id: 'b',
            type: 'button',
            label: 'Go',
            href: 'https://example.com',
            x: 5,
            y: 40,
            w: 15,
            h: 9,
            z: 1,
          },
        ],
      },
    );
    expect(projectSchema.safeParse(p).success).toBe(true);
    const html = section(p);
    // The page's first heading in reading order: the hero has the h1, so this is an h2.
    expect(html).toContain('<h2 class="free-item free-text free-title"');
    expect(html).toContain('<a class="button free-item free-button"');
  });
});

describe('blank canvas: export', () => {
  it('renders the height as whole numbers and its classes', () => {
    const html = section(withCanvas({ height: 'threeQuarter', minHeight: 300 }));
    expect(html).toContain('class="block block-canvas block-free canvas-vh bg-plain"');
    expect(html).toContain(
      '<div class="wrap canvas-wrap" style="--ch:75;--cmin:300;"><div class="free-board free-stack" style="--ar:1.659;">',
    );
    const px = section(withCanvas({ height: 'custom', heightUnit: 'px', heightPx: 640 }));
    expect(px).toContain('canvas-px');
    expect(px).toContain('style="--ch:640;"');
  });

  it('turns colors into numbers, never raw text', () => {
    expect(hexToRgb('#1f3fe0')).toEqual([31, 63, 224]);
    expect(hexToRgb('red')).toBeNull();
    const color = section(withCanvas({ fill: 'color', color: '#1f3fe0' }));
    expect(color).toContain(
      '<div class="canvas-fill fill-color" style="--c1r:31;--c1g:63;--c1b:224;" aria-hidden="true"></div>',
    );
    expect(color).not.toContain('#1f3fe0');
    const gradient = section(
      withCanvas({ fill: 'gradient', color: '#ffffff', colorTo: '#000000', angle: 90 }),
    );
    expect(gradient).toContain('--c1r:255;--c1g:255;--c1b:255;--c2r:0;--c2g:0;--c2b:0;--ga:90;');
  });

  it('puts a background picture behind as a decorative image, with an optional dim', () => {
    const html = section(withCanvas({ fill: 'image', image: 'img1', dim: 50 }));
    expect(html).toContain(
      '<img class="canvas-fill canvas-img" src="assets/img1.webp" alt="" loading="lazy" decoding="async">',
    );
    expect(html).toContain(
      '<div class="canvas-fill canvas-dim" style="--dim:50;" aria-hidden="true"></div>',
    );
    expect(html).toContain('canvas-dark');
  });

  it('switches to light text on a dark background', () => {
    expect(canvasIsDark({ fill: 'color', color: '#101010' })).toBe(true);
    expect(canvasIsDark({ fill: 'color', color: '#f5f5f5' })).toBe(false);
    expect(canvasIsDark({ fill: 'image', image: 'x', dim: 20 })).toBe(false);
    expect(canvasIsDark({})).toBe(false);
  });

  it('adds its rules to free.css only when the site has a blank canvas', () => {
    expect(file(withCanvas({}), 'css/free.css')).toBe(FREE_CSS + CANVAS_CSS);
    expect(CANVAS_CSS).toContain(
      '.canvas-wrap{display:grid;align-content:center;min-height:max(calc(var(--cmin,0)*1px),calc(var(--ch,50)*1vh))}',
    );
    expect(CANVAS_CSS).toContain('calc(var(--ch,50)*1svh)');
    expect(renderSite(clone()).some((f) => f.path === 'css/free.css')).toBe(false);
  });

  it('cannot return to a flow layout (it has none)', () => {
    const p = withCanvas({});
    const s = p.pages[0]?.sections[1];
    if (!s) throw new Error('no section');
    const back = freeToFlow(s);
    expect(
      projectSchema.safeParse({ ...p, pages: [{ ...p.pages[0], sections: [back.section] }] })
        .success,
    ).toBe(false);
  });
});

describe('spacer height', () => {
  it('accepts whole px heights from 8 to 480 and renders them', () => {
    const ok2 = (props: Record<string, unknown>) =>
      blockPropSchemas.spacer.safeParse(props).success;
    expect(ok2({ height: 8 })).toBe(true);
    expect(ok2({ height: 480 })).toBe(true);
    for (const bad of [7, 481, 12.5, '96', '96px', NaN]) expect(ok2({ height: bad })).toBe(false);
    const p = clone();
    p.pages[0]?.sections.splice(1, 0, { id: 'gap', type: 'spacer', props: { height: 160 } });
    expect(file(p, 'index.html')).toContain(
      '<div class="spacer" style="height:160px" aria-hidden="true"></div>',
    );
    p.pages[0]?.sections.splice(1, 1, { id: 'gap', type: 'spacer', props: { size: 'large' } });
    expect(file(p, 'index.html')).toContain(
      '<div class="spacer spacer-large" aria-hidden="true"></div>',
    );
  });
});

describe('schema version 8', () => {
  it('upgrades version 7 files without changing them', () => {
    expect(SCHEMA_VERSION).toBe(9);
    expect(Object.keys(MIGRATIONS)).toContain('7');
    const v7 = { ...clone(), schemaVersion: 7 };
    expect(migrateProject(v7)).toEqual({ ...clone(), schemaVersion: 9 });
  });
});
