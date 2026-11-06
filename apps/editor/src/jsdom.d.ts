/** The part of jsdom's API the preview script tests use (no @types/jsdom in the project). */
declare module 'jsdom' {
  export class JSDOM {
    constructor(
      html?: string,
      options?: { runScripts?: 'outside-only'; url?: string; pretendToBeVisual?: boolean },
    );
    readonly window: Window & typeof globalThis;
  }
}
