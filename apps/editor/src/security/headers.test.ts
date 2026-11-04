import { describe, expect, it } from 'vitest';
import { editorCsp, headersFor, pagesHeadersFile, previewCsp, workerOrigin } from './headers.ts';

describe('workerOrigin', () => {
  it('keeps only the origin of https or local addresses', () => {
    expect(workerOrigin('https://api.klinth.dev/')).toBe('https://api.klinth.dev');
    expect(workerOrigin('http://localhost:8787')).toBe('http://localhost:8787');
    expect(workerOrigin('http://api.klinth.dev')).toBeNull();
    expect(workerOrigin('javascript:alert(1)')).toBeNull();
    expect(workerOrigin('not a url')).toBeNull();
    expect(workerOrigin(undefined)).toBeNull();
  });
});

describe('editorCsp', () => {
  const csp = editorCsp('https://api.klinth.dev');

  it('allows scripts from this site only', () => {
    expect(csp).toContain("script-src 'self';");
    expect(csp).not.toMatch(/script-src[^;]*(unsafe|https:|\*)/);
  });

  it('limits network calls to this site, the Worker and GitHub', () => {
    expect(csp).toContain("connect-src 'self' https://api.klinth.dev https://api.github.com;");
  });

  it('cannot be framed and blocks plugins, base and form tricks', () => {
    for (const rule of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'"]) {
      expect(csp).toContain(rule);
    }
  });

  it('drops a Worker address that is not https', () => {
    expect(editorCsp('http://evil.example')).toContain("connect-src 'self' https://api.github.com");
  });
});

describe('preview headers', () => {
  it('may only be framed by the editor', () => {
    const headers = headersFor('/preview.html', undefined);
    expect(headers['Content-Security-Policy']).toBe(previewCsp());
    expect(previewCsp()).toContain("frame-ancestors 'self'");
    expect(previewCsp()).toContain("form-action 'none'");
    expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
  });

  it('gives every other page the strict editor policy', () => {
    expect(headersFor('/', undefined)['X-Frame-Options']).toBe('DENY');
    expect(headersFor('/github-callback.html', undefined)['Content-Security-Policy']).toBe(
      editorCsp(undefined),
    );
  });
});

describe('pagesHeadersFile', () => {
  const file = pagesHeadersFile('https://api.klinth.dev');

  it('replaces the editor policy on the preview page instead of combining both', () => {
    const preview = file.slice(file.indexOf('/preview.html'));
    expect(preview).toMatch(
      /^\/preview\.html\n {2}! Content-Security-Policy\n {2}! X-Frame-Options\n/,
    );
  });

  it('writes one header per line under each path', () => {
    for (const line of file.split('\n').filter(Boolean)) {
      expect(line).toMatch(/^(\/\S*| {2}(! )?[A-Za-z-]+(: .+)?)$/);
    }
  });
});
