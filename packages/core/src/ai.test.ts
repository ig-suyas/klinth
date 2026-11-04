import { describe, expect, it } from 'vitest';
import { aiErrorSchema, aiRequestSchema, geminiKeySchema } from './ai.ts';
import { keepAssetRefs } from './media.ts';

const request = {
  instruction: 'Make it warmer',
  section: { id: 'hero-1', type: 'hero', props: { heading: 'Hi' } },
  site: { title: 'Asha', description: '', language: 'en' },
};

describe('AI contract', () => {
  it('accepts a normal request and refuses extra fields such as a key', () => {
    expect(aiRequestSchema.safeParse(request).success).toBe(true);
    expect(aiRequestSchema.safeParse({ ...request, apiKey: 'AIza...' }).success).toBe(false);
    expect(
      aiRequestSchema.safeParse({ ...request, site: { ...request.site, key: 'x' } }).success,
    ).toBe(false);
  });

  it('refuses empty or very long instructions and invalid sections', () => {
    expect(aiRequestSchema.safeParse({ ...request, instruction: ' ' }).success).toBe(false);
    expect(aiRequestSchema.safeParse({ ...request, instruction: 'x'.repeat(1001) }).success).toBe(
      false,
    );
    const bad = { ...request, section: { id: 'h', type: 'hero', props: { onload: 'x' } } };
    expect(aiRequestSchema.safeParse(bad).success).toBe(false);
  });

  it('checks key shape and error bodies', () => {
    expect(geminiKeySchema.safeParse('AIzaSyA-valid_key.0123456789').success).toBe(true);
    expect(geminiKeySchema.safeParse('short').success).toBe(false);
    expect(geminiKeySchema.safeParse('has space in it 0123456789').success).toBe(false);
    expect(aiErrorSchema.safeParse({ error: 'x', code: 'quota' }).success).toBe(true);
    expect(aiErrorSchema.safeParse({ error: 'x', code: 'other' }).success).toBe(false);
  });
});

describe('keepAssetRefs', () => {
  it('keeps known file references and drops invented ones, at any depth', () => {
    const props = {
      image: 'known',
      imageAlt: 'A cat',
      items: [
        { image: 'made-up', title: 'One' },
        { image: 'known', title: 'Two' },
      ],
      video: 'nope',
    };
    expect(keepAssetRefs(props, new Set(['known']))).toEqual({
      image: 'known',
      imageAlt: 'A cat',
      items: [{ title: 'One' }, { image: 'known', title: 'Two' }],
    });
  });

  it('does not change the input', () => {
    const props = { image: 'x' };
    keepAssetRefs(props, new Set());
    expect(props).toEqual({ image: 'x' });
  });
});
