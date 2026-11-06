/**
 * Free layout text wraps naturally (no hard line breaks), text boxes take the
 * height of their text, and the artboard grows to hold its lowest item.
 * Older projects with stored line breaks still import.
 */
import { describe, expect, it } from 'vitest';
import {
  FREE_CSS,
  MIGRATIONS,
  SCHEMA_VERSION,
  flowToFree,
  migrateProject,
  parseProjectFile,
  renderSite,
  sectionSchema,
  type Project,
  type Section,
} from './index.ts';
import { sampleProject } from './sample.ts';

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing value');
  return value;
}

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;

function freeSection(title: string, body: string): Section {
  return {
    id: 'free1',
    type: 'hero',
    layout: 'free',
    props: { heading: 'Old heading' },
    canvas: {
      aspect: 2,
      items: [
        {
          id: 't',
          type: 'text',
          style: 'title',
          text: title,
          size: 5,
          x: 5,
          y: 5,
          w: 60,
          h: 30,
          z: 0,
        },
        {
          id: 'p',
          type: 'text',
          style: 'body',
          text: body,
          size: 1.5,
          x: 5,
          y: 50,
          w: 40,
          h: 20,
          z: 1,
        },
      ],
    },
  } as Section;
}

function pageWith(section: Section): string {
  const p = clone();
  must(p.pages[0]).sections[0] = section;
  return String(must(renderSite(p)[0]).content);
}

/** The CSS rule for `selector` in FREE_CSS (outside the phone media query). */
function rule(selector: string): string {
  const desktop = FREE_CSS.slice(0, FREE_CSS.indexOf('@media'));
  const at = `\n${desktop}`.indexOf(`\n${selector}{`);
  if (at < 0) throw new Error(`${selector} missing`);
  return desktop.slice(at, desktop.indexOf('}', at) + 1);
}

describe('natural wrapping in free sections', () => {
  it('renders titles without hard line breaks', () => {
    const html = pageWith(freeSection('We make\nbrands\nthat speak\nclearly.', 'Body'));
    const h1 = /<h1 class="free-item[^>]*>(.*?)<\/h1>/.exec(html)?.[1] ?? '';
    expect(h1).toBe('We make brands that speak clearly.');
    expect(h1).not.toContain('<br>');
  });

  it('keeps paragraphs but joins single line breaks in body text', () => {
    const html = pageWith(freeSection('Title', 'Line one\nline two\n\nPara two'));
    expect(html).toContain('<p>Line one line two</p><p>Para two</p>');
  });

  it('balances headings and lets text set its own height', () => {
    expect(rule('.free-title,.free-subtitle')).toContain('text-wrap:balance');
    expect(rule('.free-board>.free-text')).toContain('height:auto');
  });

  it('grows the artboard to hold its lowest item (nothing is clipped)', () => {
    // Items share one grid cell and are placed with margins, so the board's
    // height is at least its aspect ratio and grows with the content.
    const board = rule('.free-board');
    expect(board).toContain('display:grid');
    expect(board).toContain('aspect-ratio:var(--ar)');
    expect(board).not.toContain('overflow:hidden');
    const item = rule('.free-board>.free-item');
    expect(item).toContain('grid-area:1/1');
    expect(item).toContain('margin-top:calc(var(--y)/var(--ar)*1%)');
    expect(item).not.toContain('position:absolute');
    // Sizes depend only on the artboard's own width (container units), never the viewport.
    expect(FREE_CSS).not.toMatch(/\d(?:s|d|l)?vh/);
    expect(rule('.free-text')).toContain('cqw');
  });
});

describe('text keeps its look when it goes free', () => {
  it('keeps the measured line height, so a tight heading stays as tall as it was', () => {
    const hero = must(clone().pages[0]?.sections[0]);
    const { section } = flowToFree(hero, {
      width: 1000,
      height: 600,
      elements: [
        { from: 'heading', x: 0, y: 40, width: 1000, height: 400, fontSize: 150, lineHeight: 129 },
        { from: 'subheading', x: 0, y: 480, width: 500, height: 60, fontSize: 20 },
      ],
    });
    const [title, lede] = must(section.canvas).items;
    expect(title).toMatchObject({ type: 'text', leading: 0.86 });
    expect(lede).not.toHaveProperty('leading');
    const html = pageWith(section);
    expect(html).toMatch(/<h1 class="free-item[^"]*" style="[^"]*--lh:0\.86;/);
    expect(rule('.free-title,.free-subtitle')).toContain('line-height:var(--lh,1.08)');
    expect(rule('.free-body')).toContain('line-height:var(--lh,1.5)');
  });

  it('refuses a line height outside a sensible range', () => {
    const s = freeSection('Title', 'Body');
    const items = must(s.canvas).items as unknown as Record<string, unknown>[];
    for (const leading of [0.1, 9, Number.NaN, '1.2']) {
      must(items[0]).leading = leading;
      expect(sectionSchema.safeParse(s).success).toBe(false);
    }
    must(items[0]).leading = 1.2;
    expect(sectionSchema.safeParse(s).success).toBe(true);
  });
});

describe('older projects with stored line breaks', () => {
  /** A version 5 file as an older Klinth saved it. */
  function v5(): Record<string, unknown> {
    const p = clone() as unknown as Record<string, unknown>;
    const page = must((p as unknown as Project).pages[0]);
    page.sections[0] = freeSection('Big\ntitle', 'One\ntwo\n\nThree');
    page.sections.push({
      id: 'poster',
      type: 'hero',
      props: { layout: 'poster', heading: 'We make\nbrands\r\nthat speak\n clearly.' },
    } as Section);
    return { ...p, schemaVersion: 5 };
  }

  it('migrates line breaks out of headings and free text', () => {
    expect(SCHEMA_VERSION).toBe(7);
    expect(typeof MIGRATIONS[5]).toBe('function');
    const project = migrateProject(v5());
    const sections = must(project.pages[0]).sections;
    const canvas = must(sections[0]?.canvas);
    expect(canvas.items.map((i) => (i.type === 'text' ? i.text : ''))).toEqual([
      'Big title',
      'One two\n\nThree',
    ]);
    const poster = sections.find((s) => s.id === 'poster');
    expect((poster?.props as { heading: string }).heading).toBe(
      'We make brands that speak clearly.',
    );
  });

  it('still imports through the project file and changes nothing else', () => {
    const file = JSON.stringify(v5());
    const project = parseProjectFile(file);
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    const plain = { ...clone(), schemaVersion: 5 };
    expect(migrateProject(plain)).toEqual({ ...clone(), schemaVersion: SCHEMA_VERSION });
  });

  it('leaves odd shapes alone instead of failing the upgrade', () => {
    const step = must(MIGRATIONS[5]);
    expect(step({ pages: 'x' })).toEqual({ pages: 'x' });
    expect(step({ pages: [{ sections: [null, { props: { heading: 3 } }] }] })).toEqual({
      pages: [{ sections: [null, { props: { heading: 3 } }] }],
    });
  });
});
