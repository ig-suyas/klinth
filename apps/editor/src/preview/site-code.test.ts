import { blankProject, type Project } from '@klinth/core';
import { describe, expect, it } from 'vitest';
import shell from '../../public/preview.html?raw';
import previewSource from './Preview.tsx?raw';
import { buildPreviewDocument } from './document.ts';

const CSS = '.k-test{color:red} /* </style><script>alert("css")</script> */ </STYLE >';
const JS = 'document.body.dataset.ran="1"; // </script><script>alert("js")</script>';

const project = (): Project => ({ ...blankProject(), siteCode: { css: CSS, js: JS } });
const count = (text: string, pattern: RegExp): number => text.match(pattern)?.length ?? 0;

describe('site-wide code in the editor preview', () => {
  const doc = buildPreviewDocument(project(), 0, { origin: 'http://localhost', interactive: true });

  it('applies the CSS inside the preview page, after the site styles', () => {
    expect(doc).toContain('.k-test{color:red}');
    expect(doc.indexOf('.k-test')).toBeGreaterThan(doc.indexOf(':root {'));
    expect(doc).not.toContain('css/custom.css');
  });

  it('cannot close its style element early', () => {
    expect(doc).not.toMatch(/<\/style\s*>\s*<script>alert/i);
    expect(count(doc, /<\/style/gi)).toBe(count(doc, /<style[\s>]/gi));
  });

  it('runs the JavaScript from a string, so it cannot break out of its script', () => {
    expect(doc).not.toContain('</script><script>alert("js")');
    expect(doc).not.toContain('js/custom.js');
    expect(count(doc, /<\/script/gi)).toBe(count(doc, /<script[\s>]/gi));
    expect(doc).toContain('dataset.ran');
  });

  it('leaves thumbnails (no scripts, editor policy) without any custom code', () => {
    const thumb = buildPreviewDocument(project(), 0, { origin: '', interactive: false });
    expect(thumb).not.toContain('k-test');
    expect(thumb).not.toContain('dataset.ran');
    expect(thumb).not.toContain('custom.');
  });

  it('adds nothing when there is no code', () => {
    const plain = buildPreviewDocument(blankProject(), 0, { origin: '', interactive: true });
    expect(plain).not.toContain('data-k-site');
  });
});

describe('preview sandbox', () => {
  const sandboxes = (source: string): string[] =>
    [...source.matchAll(/sandbox="([^"]*)"/g)].map((m) => m[1] ?? '');

  it('runs the page, and so the code, only in frames without same-origin', () => {
    expect(sandboxes(previewSource)).toEqual(['allow-scripts']);
    expect(sandboxes(shell)).toEqual(['allow-scripts']);
    expect(previewSource + shell).not.toContain('allow-same-origin');
    expect(previewSource + shell).not.toContain('allow-top-navigation');
  });
});
