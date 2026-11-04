import { describe, expect, it } from 'vitest';
import { changedFields, listNames } from './changes.ts';

describe('change summary', () => {
  it('names changed settings in plain words, in the inspector order', () => {
    const before = { heading: 'Hi', subheading: 'Old', image: 'a', imageAlt: 'x' };
    const after = {
      heading: 'Hello',
      subheading: 'New',
      image: 'a',
      imageAlt: 'y',
      status: 'Open',
    };
    const names = changedFields('hero', before, after);
    expect(names).toContain('Heading');
    expect(names).toContain('Picture description');
    expect(names).not.toContain('heading');
    expect(names.indexOf('Heading')).toBeLessThan(names.indexOf('Picture description'));
    expect(changedFields('hero', before, before)).toEqual([]);
  });

  it('joins names like a sentence', () => {
    expect(listNames([])).toBe('');
    expect(listNames(['Heading'])).toBe('Heading');
    expect(listNames(['Heading', 'Buttons', 'Background'])).toBe('Heading, Buttons and Background');
  });
});
