import { BLOCK_TYPES, blockPropSchemas, renderSite } from '@klinth/core';
import { templates } from '@klinth/templates';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  blockFields,
  maxItems,
  maxLength,
  propSchema,
  UNUSED_PROPS,
  specKeys,
} from '../inspector/fields.ts';
import { buildPreviewDocument, previewMessageSchema } from './document.ts';

const project = () => {
  const template = templates[0];
  if (!template) throw new Error('no templates');
  return template.create();
};

describe('preview document', () => {
  it('inlines the stylesheet and script so the frame needs no files', () => {
    const doc = buildPreviewDocument(project(), 0, {
      origin: 'http://localhost',
      interactive: true,
    });
    expect(doc).toContain('<style>:root {');
    expect(doc).not.toContain('css/site.css');
    expect(doc).not.toContain('js/site.js');
    expect(doc).not.toContain('rel="icon"');
    expect(doc).toContain('data-k-section=');
    expect(doc).toContain('data-k-field="heading"');
    expect(doc).toContain("source = 'klinth-preview'");
  });

  it('escapes the bridge settings so they cannot end the script early', () => {
    const doc = buildPreviewDocument(project(), 0, {
      origin: '</script><script>alert(1)</script>',
      interactive: true,
    });
    expect(doc).not.toContain('</script><script>alert(1)');
    expect(doc).toContain('\\u003c/script>');
  });

  it('runs no scripts in thumbnails and marks nothing for editing', () => {
    const doc = buildPreviewDocument(project(), 0, { origin: '', interactive: false });
    expect(doc).not.toContain('<script');
    expect(doc).not.toContain('data-k-');
  });

  it('keeps custom code in a nested sandbox and lets the frame fill in files', () => {
    const base = project();
    const home = base.pages[0];
    if (!home) throw new Error('no page');
    const code = '<script>parent.parent.postMessage("x","*");localStorage.k=1</script>';
    const withCode = {
      ...base,
      pages: [
        {
          ...home,
          sections: [
            { id: 'code', type: 'customCode' as const, props: { code } },
            ...home.sections,
          ],
        },
        ...base.pages.slice(1),
      ],
    };
    const doc = buildPreviewDocument(withCode, 0, {
      origin: 'http://localhost',
      interactive: true,
    });
    // The pasted code is never live in the preview page, only inside the nested frame.
    expect(doc).not.toContain(code);
    expect(doc).toMatch(
      /<iframe class="code-frame" sandbox="allow-scripts" title="Custom code preview" srcdoc="[^"]*parent\.parent/,
    );
    expect(doc).not.toContain('allow-same-origin');
    // The bridge accepts only a height from code frames, and only from frames in the page.
    expect(doc).toContain("e.data.source === 'klinth-code' && e.source !== window.top");
    expect(doc).toContain('Math.min(Math.max(Math.round(h), 80), 1600)');
    expect(doc).toContain('item.blob instanceof Blob');
  });

  it('turns the scroll reveal off on reloads', () => {
    const calm = buildPreviewDocument(project(), 0, { origin: '', interactive: true, calm: true });
    expect(calm).toContain('.reveal, .reveal.is-visible');
  });

  it('never puts editor markers in exported files', () => {
    for (const template of templates) {
      for (const file of renderSite(template.create())) {
        if (typeof file.content === 'string') expect(file.content).not.toContain('data-k-');
      }
    }
  });
});

describe('preview messages', () => {
  it('accepts the messages the frame sends', () => {
    const edit = {
      source: 'klinth-preview',
      type: 'edit',
      id: 'hero',
      field: 'heading',
      value: 'Hi',
    };
    expect(previewMessageSchema.safeParse(edit).success).toBe(true);
    expect(
      previewMessageSchema.safeParse({ source: 'klinth-preview', type: 'ready' }).success,
    ).toBe(true);
  });

  it('rejects anything else', () => {
    const bad = [
      null,
      'select',
      { type: 'select', id: 'hero' },
      { source: 'klinth-preview', type: 'edit', id: 'hero', field: 'image', value: 'x' },
      { source: 'klinth-preview', type: 'edit', id: 'x'.repeat(65), field: 'heading', value: '' },
      { source: 'klinth-preview', type: 'run', code: 'alert(1)' },
    ];
    for (const message of bad) expect(previewMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe('inspector fields', () => {
  it('cover every block prop', () => {
    for (const type of BLOCK_TYPES) {
      const shape = blockPropSchemas[type].shape;
      const shown = blockFields[type].flatMap(specKeys);
      for (const key of shown) expect(Object.keys(shape), `${type}.${key}`).toContain(key);
      for (const key of Object.keys(shape)) {
        if (UNUSED_PROPS[type]?.includes(key)) continue;
        expect(shown, `${type}.${key}`).toContain(key);
      }
    }
  });

  it('offer only choices the schema allows', () => {
    for (const type of BLOCK_TYPES) {
      for (const spec of blockFields[type]) {
        if (spec.kind !== 'choice') continue;
        const schema = propSchema(type, [spec.key]);
        const inner = schema instanceof z.ZodOptional ? schema.unwrap() : schema;
        if (!(inner instanceof z.ZodEnum)) throw new Error(`${type}.${spec.key} is not a choice`);
        expect(Object.keys(spec.options).sort()).toEqual([...inner.options].sort());
      }
    }
  });

  it('start new list items that the schema accepts', () => {
    for (const type of BLOCK_TYPES) {
      for (const spec of blockFields[type]) {
        if (spec.kind !== 'list') continue;
        const element = propSchema(type, [spec.key]);
        const list = element instanceof z.ZodOptional ? element.unwrap() : element;
        if (!(list instanceof z.ZodArray)) throw new Error(`${type}.${spec.key} is not a list`);
        expect(z.safeParse(list.element, spec.newItem()).success, `${type}.${spec.key}`).toBe(true);
      }
    }
  });

  it('read limits from the schema', () => {
    expect(maxLength(propSchema('hero', ['heading']))).toBe(200);
    expect(maxLength(propSchema('projects', ['items', 'title']))).toBe(120);
    expect(maxItems(propSchema('hero', ['buttons']))).toBe(2);
    expect(maxItems(propSchema('hero', ['heading']))).toBe(0);
  });
});
