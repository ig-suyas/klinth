import { renderSite, sampleProject, type Project } from '@klinth/core';
import { describe, expect, it } from 'vitest';
import { setBackToTop, setPageBackToTopHidden } from './footer.ts';

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const html = (p: Project) =>
  renderSite(p)
    .filter((f) => f.path.endsWith('.html'))
    .map((f) => String(f.content));

describe('back to top switches', () => {
  it('the site switch removes the link from every exported page and brings it back', () => {
    const off = setBackToTop(clone(), false);
    expect(off.meta.backToTop).toBe(false);
    for (const page of html(off)) expect(page).not.toContain('Back to top');
    const on = setBackToTop(off, true);
    expect('backToTop' in on.meta).toBe(false);
    expect(html(on)[0]).toContain('Back to top');
  });

  it('the page switch removes it from that page only', () => {
    const p = setPageBackToTopHidden(clone(), 0, true);
    expect(p.pages[0]?.hideBackToTop).toBe(true);
    expect(html(p)[0]).not.toContain('Back to top');
    const back = setPageBackToTopHidden(p, 0, false);
    expect(back.pages[0] && 'hideBackToTop' in back.pages[0]).toBe(false);
    expect(html(back)[0]).toContain('Back to top');
  });
});
