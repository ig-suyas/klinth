import { describe, expect, it } from 'vitest';
import { templates } from './index.ts';

describe('templates', () => {
  it('ships exactly two templates with unique ids', () => {
    expect(templates).toHaveLength(2);
    expect(new Set(templates.map((t) => t.id)).size).toBe(2);
  });
});
