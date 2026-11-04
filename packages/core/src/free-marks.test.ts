/**
 * The editor measures the flow layout before a section turns free (Part 2 of
 * the free canvas). Every element it can place carries `data-k-from="<path>"`
 * in the editable preview only; exports never do.
 */
import { describe, expect, it } from 'vitest';
import { bindPathSchema, renderSite, sampleProject, type Project, type Section } from './index.ts';

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;

function htmlOf(project: Project, editable: boolean): string {
  const files = renderSite(project, editable ? { editable: true, preview: true } : {});
  const page = files.find((f) => f.path === 'index.html');
  if (typeof page?.content !== 'string') throw new Error('index.html missing');
  return page.content;
}

const paths = (html: string): string[] =>
  [...html.matchAll(/data-k-from="([^"]*)"/g)].map((m) => m[1] ?? '');

/** One page holding `sections` (plus the sample's assets). */
function withSections(sections: Section[]): Project {
  const p = clone();
  const page = p.pages[0];
  if (!page) throw new Error('page missing');
  page.sections = sections;
  return p;
}

describe('free layout markers in the editable preview', () => {
  it('names the prop path of every element that can be placed freely', () => {
    const html = htmlOf(clone(), true);
    const found = paths(html);
    expect(found).toEqual(
      expect.arrayContaining([
        'heading',
        'subheading',
        'buttons.0',
        'items.0.image',
        'items.0.title',
        'items.0.description',
        'items.0',
        'items.1',
      ]),
    );
    for (const path of found) expect(bindPathSchema.safeParse(path).success).toBe(true);
  });

  it('marks pictures, buttons, quotes, facts and videos in every free-capable block', () => {
    const html = htmlOf(
      withSections([
        {
          id: 'a',
          type: 'about',
          props: {
            heading: 'About',
            body: 'One.\n\nTwo.',
            image: 'img1',
            imageAlt: 'Map',
            facts: [{ label: 'Based in', value: 'Pune' }],
          },
        },
        {
          id: 't',
          type: 'textImage',
          props: { heading: 'T', body: 'B', button: { label: 'Go', href: '#a' }, image: 'img1' },
        },
        {
          id: 'g',
          type: 'gallery',
          props: { heading: 'G', images: [{ image: 'img1', caption: 'Cap' }] },
        },
        {
          id: 'v',
          type: 'video',
          props: { heading: 'V', embedUrl: 'https://youtu.be/dQw4w9WgXcQ', caption: 'C' },
        },
        {
          id: 'q',
          type: 'testimonials',
          props: { heading: 'Q', items: [{ quote: 'Nice.', name: 'Ana', role: 'Client' }] },
        },
        {
          id: 'c',
          type: 'contact',
          props: { heading: 'C', email: 'a@example.com', phone: '+91 1' },
        },
      ] as Section[]),
      true,
    );
    expect(paths(html)).toEqual(
      expect.arrayContaining([
        'image',
        'body',
        'facts.0.label',
        'facts.0.value',
        'button',
        'images.0.image',
        'images.0.caption',
        'embedUrl',
        'caption',
        'items.0.quote',
        'items.0.name',
        'items.0.role',
        'email',
        'phone',
      ]),
    );
    // A body of two paragraphs marks both, so the editor can measure them as one.
    expect(paths(html).filter((p) => p === 'body').length).toBeGreaterThanOrEqual(3);
  });

  it('never appears in exported files', () => {
    for (const file of renderSite(clone())) {
      if (typeof file.content === 'string') expect(file.content).not.toContain('data-k-from');
    }
  });
});
