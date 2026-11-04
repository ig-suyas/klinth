import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, escapeHtml } from './index.ts';

describe('core', () => {
  it('starts at schema version 1', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });
});
