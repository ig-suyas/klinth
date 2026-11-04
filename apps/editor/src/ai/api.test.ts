import type { AiRequest, Section } from '@klinth/core';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { AiError, apiBase, askForSection, testKey } from './api.ts';

const KEY = 'AIzaSyTestKey_0123456789abcdefghijk';
const section: Section = { id: 'hero-1', type: 'hero', props: { heading: 'Hello' } };
const request: AiRequest = {
  instruction: 'Warmer please',
  section,
  site: { title: 'Asha', description: '', language: 'en' },
};

let fetchMock: MockInstance<typeof fetch>;
beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('AI client', () => {
  it('sends the key only in the X-Gemini-Key header', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ section: { ...section, props: { heading: 'Hi friend' } } }),
    );
    const next = await askForSection(request, KEY);
    expect(next.props).toEqual({ heading: 'Hi friend' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://localhost:8787/ai/generate');
    expect(String(url)).not.toContain(KEY);
    expect(String(init?.body)).not.toContain(KEY);
    expect(new Headers(init?.headers).get('x-gemini-key')).toBe(KEY);
    expect(init?.credentials).toBe('omit');
  });

  it('rejects answers that are not a valid section of the same id and type', async () => {
    const bad = [
      { section: { ...section, props: { heading: 'x', onclick: 'alert(1)' } } },
      { section: { ...section, id: 'other' } },
      { section: { id: 'hero-1', type: 'about', props: {} } },
      {
        section: { ...section, props: { buttons: [{ label: 'Go', href: 'javascript:alert(1)' }] } },
      },
      'just text',
    ];
    for (const body of bad) {
      fetchMock.mockResolvedValueOnce(Response.json(body));
      await expect(askForSection(request, KEY)).rejects.toMatchObject({ code: 'invalid_output' });
    }
  });

  it('passes on the Worker’s plain message, code and wait time', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { code: 'rate_limited', error: 'You have used the AI helper a lot this hour.' },
        { status: 429, headers: { 'retry-after': '120' } },
      ),
    );
    const error = await askForSection(request, KEY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error).toMatchObject({ code: 'rate_limited', retryAfter: 120 });
  });

  it('says plainly when the Worker cannot be reached', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(testKey(KEY)).rejects.toMatchObject({ code: 'offline' });
  });

  it('does not send sections that are too big', async () => {
    const big: AiRequest = {
      ...request,
      section: { id: 'code-1', type: 'customCode', props: { code: 'x'.repeat(70_000) } },
    };
    await expect(askForSection(big, KEY)).rejects.toMatchObject({ code: 'bad_request' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('only talks to HTTPS or a local Worker', () => {
    expect(apiBase('https://api.klinth.app/')).toBe('https://api.klinth.app');
    expect(apiBase('http://localhost:8787')).toBe('http://localhost:8787');
    expect(apiBase('http://api.klinth.app')).toBeNull();
    expect(apiBase('https://api.klinth.app/path?key=1')).toBeNull();
  });
});
