import { describe, expect, it } from 'vitest';
import {
  MAX_VIDEOS,
  SITE_CSS,
  VIDEO_CSS,
  VIDEO_CSS_PATH,
  VIDEO_JS,
  VIDEO_JS_PATH,
  assetUsage,
  blockPropSchemas,
  projectSchema,
  removeAsset,
  renderSite,
  videoLayout,
  videoMaxWidth,
  videoStyled,
  type Project,
} from './index.ts';
import { sampleProject } from './sample.ts';

const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const YT2 = 'https://youtu.be/aqz-KE-bpKQ';
const VIMEO = 'https://vimeo.com/76979871';

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;

/** The sample project with one video section (props as given) after the hero. */
function withVideo(props: Record<string, unknown>, extra: Partial<Project> = {}): Project {
  const p = clone();
  const page = p.pages[0];
  if (!page) throw new Error('no page');
  page.sections.splice(1, 0, {
    id: 'vid',
    type: 'video',
    props: { heading: 'Watch', ...props },
  } as Project['pages'][number]['sections'][number]);
  p.assets.push(
    { id: 'clip', kind: 'video', name: 'clip.mp4', size: 10, mime: 'video/mp4' },
    {
      id: 'thumb',
      kind: 'image',
      name: 'thumb.webp',
      size: 4,
      mime: 'image/webp',
      width: 1600,
      height: 900,
    },
  );
  return { ...p, ...extra };
}

const files = (p: Project) => renderSite(p);
const file = (p: Project, path: string): string => {
  const f = files(p).find((x) => x.path === path);
  if (typeof f?.content !== 'string') throw new Error(`${path} missing`);
  return f.content;
};
const has = (p: Project, path: string) => files(p).some((x) => x.path === path);
const section = (p: Project): string => {
  const m = /<section id="vid"[\s\S]*?<\/section>/.exec(file(p, 'index.html'));
  return m?.[0] ?? '';
};
const ok = (props: Record<string, unknown>) => blockPropSchemas.video.safeParse(props).success;

describe('video options: validation', () => {
  it('accepts every shape, size, frame, shadow, play style and layout', () => {
    for (const ratio of ['landscape', 'vertical', 'square', 'portrait'])
      expect(ok({ ratio })).toBe(true);
    for (const size of ['small', 'medium', 'large', 'full']) expect(ok({ size })).toBe(true);
    for (const frame of ['plain', 'card', 'glass']) expect(ok({ frame })).toBe(true);
    for (const shadow of ['none', 'soft', 'strong']) expect(ok({ shadow })).toBe(true);
    for (const play of ['circle', 'square', 'minimal']) expect(ok({ play })).toBe(true);
    for (const layout of ['single', 'grid', 'carousel', 'deck']) expect(ok({ layout })).toBe(true);
    expect(ok({ maxWidth: 160, radius: 0, border: 0 })).toBe(true);
    expect(ok({ maxWidth: 1600, radius: 48, border: 8 })).toBe(true);
    expect(ok({ autoplay: true, controls: false, poster: 'thumb', titleBar: 'Trailer' })).toBe(
      true,
    );
  });

  it('refuses unknown choices', () => {
    expect(ok({ ratio: '21:9' })).toBe(false);
    expect(ok({ size: 'huge' })).toBe(false);
    expect(ok({ frame: 'neon' })).toBe(false);
    expect(ok({ play: 'big' })).toBe(false);
    expect(ok({ layout: 'masonry' })).toBe(false);
    expect(ok({ shadow: 'glow' })).toBe(false);
  });

  it('takes only whole numbers in range for widths, radius and border', () => {
    for (const bad of [NaN, Infinity, -Infinity, 12.5, '400', '400px', null, 159, 1601]) {
      expect(ok({ maxWidth: bad })).toBe(false);
    }
    for (const bad of [-1, 49, 1.5, '8px', 'calc(1px)', NaN])
      expect(ok({ radius: bad })).toBe(false);
    for (const bad of [-1, 9, 0.5, '2', Infinity]) expect(ok({ border: bad })).toBe(false);
  });

  it('refuses unsafe text, embed code and odd ids', () => {
    expect(ok({ titleBar: 'two\nlines' })).toBe(false);
    expect(ok({ titleBar: 'x'.repeat(121) })).toBe(false);
    expect(ok({ poster: '../evil' })).toBe(false);
    expect(ok({ videos: [{ embedUrl: '<iframe src="https://evil.example">' }] })).toBe(false);
    expect(ok({ videos: [{ embedUrl: 'https://evil.example/watch?v=dQw4w9WgXcQ' }] })).toBe(false);
    expect(ok({ videos: [{ embedUrl: YT, apiKey: 'x' }] })).toBe(false);
    expect(ok({ autoplay: 'yes' })).toBe(false);
  });

  it('holds up to 12 videos in one section', () => {
    const many = (n: number) => Array.from({ length: n }, () => ({ embedUrl: YT }));
    expect(MAX_VIDEOS).toBe(12);
    expect(ok({ embedUrl: YT, videos: many(11) })).toBe(true);
    expect(ok({ embedUrl: YT, videos: many(12) })).toBe(false);
  });
});

describe('video options: export', () => {
  it('keeps a plain video section byte-identical (no video files)', () => {
    const p = withVideo({ embedUrl: YT });
    const html = section(p);
    expect(html).toContain('<div class="video-frame"><a class="video-facade"');
    expect(html).not.toContain('vids');
    expect(has(p, VIDEO_CSS_PATH)).toBe(false);
    expect(has(p, VIDEO_JS_PATH)).toBe(false);
    expect(file(p, 'index.html')).not.toContain('video.css');
  });

  it.each([
    ['landscape', 'vr-landscape', 720],
    ['vertical', 'vr-vertical', 320],
    ['square', 'vr-square', 440],
    ['portrait', 'vr-portrait', 380],
  ] as const)('exports the %s shape with its class and width', (ratio, cls, width) => {
    const p = withVideo({ embedUrl: YT, ratio, size: 'medium' });
    const html = section(p);
    expect(html).toContain(`class="vids vids-single ${cls} vf-plain vs-none pl-circle has-ratio"`);
    expect(html).toContain(`style="--vmax:${width};"`);
    expect(file(p, 'index.html')).toContain(`<link rel="stylesheet" href="${VIDEO_CSS_PATH}">`);
    expect(file(p, VIDEO_CSS_PATH)).toBe(VIDEO_CSS);
  });

  it('CSS holds each shape as a fixed ratio', () => {
    expect(VIDEO_CSS).toContain('.vids{--vr:16/9');
    expect(VIDEO_CSS).toContain('.vr-vertical{--vr:9/16');
    expect(VIDEO_CSS).toContain('.vr-square{--vr:1/1');
    expect(VIDEO_CSS).toContain('.vr-portrait{--vr:4/5');
  });

  it('works out widths: custom wins, full is unlimited, tall shapes default to medium', () => {
    expect(videoMaxWidth({})).toBeNull();
    expect(videoMaxWidth({ size: 'small' })).toBe(480);
    expect(videoMaxWidth({ size: 'large', ratio: 'vertical' })).toBe(400);
    expect(videoMaxWidth({ ratio: 'vertical' })).toBe(320);
    expect(videoMaxWidth({ size: 'full', ratio: 'square' })).toBeNull();
    expect(videoMaxWidth({ size: 'small', maxWidth: 999 })).toBe(999);
  });

  it('writes style settings as classes and whole numbers only', () => {
    const p = withVideo({
      embedUrl: YT,
      frame: 'glass',
      shadow: 'strong',
      play: 'minimal',
      radius: 24,
      border: 3,
      maxWidth: 900,
      titleBar: 'Our <b>trailer</b>',
      poster: 'thumb',
    });
    const html = section(p);
    expect(html).toContain('vids-single vr-landscape vf-glass vs-strong pl-minimal vid-r vid-b');
    expect(html).toContain('style="--vmax:900;--vrad:24;--vbw:3;"');
    expect(html).toContain('<p class="vid-bar"><span>Our &lt;b&gt;trailer&lt;/b&gt;</span></p>');
    expect(html).toContain('<div class="video-frame has-poster">');
    expect(html).toMatch(
      /<img class="video-poster" src="assets\/thumb\.webp" alt="" width="1600" height="900" loading="lazy"/,
    );
    // Still the click-to-load facade on the privacy-friendly player.
    expect(html).toContain(
      'data-embed="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&amp;rel=0"',
    );
    expect(html).not.toContain('<iframe');
  });

  it('gives uploaded videos a poster, controls and an opt-in silent loop', () => {
    const plain = section(withVideo({ video: 'clip', poster: 'thumb' }));
    expect(plain).toContain(
      '<video src="assets/clip.mp4" poster="assets/thumb.webp" controls playsinline preload="metadata"',
    );
    expect(plain).not.toContain('data-autoplay');
    const loop = section(withVideo({ video: 'clip', autoplay: true, controls: false }));
    expect(loop).toContain(
      '<video src="assets/clip.mp4" playsinline preload="metadata" muted loop data-autoplay',
    );
    // Never the autoplay attribute: the script starts it (and never with reduced motion).
    expect(loop).not.toMatch(/\sautoplay[\s>=]/);
    // Controls can only be hidden on a silent loop.
    expect(section(withVideo({ video: 'clip', controls: false }))).toContain(' controls ');
  });

  it('counts the poster as a used file and drops it with its file', () => {
    const p = withVideo({
      embedUrl: YT,
      poster: 'thumb',
      videos: [{ embedUrl: YT2, poster: 'thumb' }],
    });
    expect(assetUsage(p).get('thumb')).toBe(2);
    const gone = removeAsset(p, 'thumb');
    expect(projectSchema.safeParse(gone).success).toBe(true);
    expect(JSON.stringify(gone)).not.toContain('"thumb"');
  });
});

describe('several videos: export', () => {
  const three = { embedUrl: YT, videos: [{ embedUrl: YT2, title: 'Second' }, { embedUrl: VIMEO }] };

  it('defaults to a grid list and needs js/video.js', () => {
    const p = withVideo(three);
    const html = section(p);
    expect(videoLayout(three)).toBe('grid');
    expect(html).toMatch(/<ul class="vids vids-grid [^"]*" role="list"><li><div class="vid">/);
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).toContain('<p class="vid-bar"><span>Second</span></p>');
    expect(file(p, 'index.html')).toContain(`<script src="${VIDEO_JS_PATH}" defer></script>`);
    expect(file(p, VIDEO_JS_PATH)).toBe(VIDEO_JS);
  });

  it('exports a carousel with slides, arrows and dots hidden until the script runs', () => {
    const html = section(withVideo({ ...three, layout: 'carousel', ratio: 'vertical' }));
    expect(html).toContain(
      'data-carousel role="region" aria-roledescription="carousel" aria-label="Watch"',
    );
    expect(html).toContain('<div class="vc-track" tabindex="0">');
    expect(html.match(/class="vc-slide" role="group" aria-roledescription="slide"/g)).toHaveLength(
      3,
    );
    expect(html).toContain('aria-label="3 of 3"');
    expect(html).toContain('<div class="vc-nav" hidden>');
    expect(html.match(/class="vc-dot"/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Previous video"');
    expect(html).toContain('aria-label="Next video"');
  });

  it('exports a stacked deck that is a plain column without the script', () => {
    const html = section(withVideo({ ...three, layout: 'deck' }));
    expect(html).toContain('data-deck role="region"');
    expect(html).toContain('<div class="vd-stack">');
    expect(html.match(/class="vd-card"/g)).toHaveLength(3);
    expect(html).toContain('<div class="vd-nav" hidden>');
    expect(html).toContain('<p class="vd-count" aria-live="polite">1 / 3</p>');
    expect(VIDEO_CSS).toContain('.vids-deck.is-ready .vd-card{grid-area:1/1');
  });

  it('shows a single layout as one after another, and one video as single', () => {
    expect(section(withVideo({ ...three, layout: 'single' })).match(/class="vid"/g)).toHaveLength(
      3,
    );
    const one = section(withVideo({ embedUrl: YT, layout: 'carousel' }));
    expect(one).toContain('vids-single');
    expect(one).not.toContain('data-carousel');
  });

  it('skips list videos that cannot play', () => {
    const html = section(
      withVideo({ embedUrl: YT, videos: [{ title: 'Empty' }, { video: 'missing' }] }),
    );
    expect(html.match(/class="vid"/g)).toHaveLength(1);
    expect(html).toContain('vids-single');
  });

  it('loads js/video.js for two plain videos on a page (one plays at a time)', () => {
    const p = withVideo({ embedUrl: YT });
    const page = p.pages[0];
    if (!page) throw new Error('no page');
    page.sections.splice(2, 0, { id: 'vid2', type: 'video', props: { embedUrl: YT2 } });
    expect(has(p, VIDEO_JS_PATH)).toBe(true);
    expect(has(p, VIDEO_CSS_PATH)).toBe(false);
    expect(file(p, 'index.html')).toContain(VIDEO_JS_PATH);
  });

  it('a styled section with nothing set is still recognised', () => {
    expect(videoStyled({})).toBe(false);
    expect(videoStyled({ videos: [] })).toBe(false);
    expect(videoStyled({ videos: [{ embedUrl: YT }] })).toBe(true);
    expect(videoStyled({ controls: true })).toBe(true);
  });
});

describe('video CSS and script', () => {
  it('moves only inside prefers-reduced-motion: no-preference', () => {
    const motion = VIDEO_CSS.indexOf('@media (prefers-reduced-motion:no-preference){');
    expect(motion).toBeGreaterThan(0);
    const before = VIDEO_CSS.slice(0, motion);
    expect(before).not.toMatch(/transition|animation|[;{]scroll-behavior/);
  });

  it('shows one video at a time on phones', () => {
    expect(VIDEO_CSS).toContain(
      '@media (max-width:37.49rem){\n.vc-track{padding-inline:0}\n.vc-slide{flex-basis:100%}',
    );
  });

  it('only loads players from the two allowed hosts and never autoplays with reduced motion', () => {
    expect(VIDEO_JS).toContain(
      "var PLAYERS = ['https://www.youtube-nocookie.com/embed/', 'https://player.vimeo.com/video/'];",
    );
    expect(VIDEO_JS).toContain("matchMedia('(prefers-reduced-motion: reduce)')");
    expect(VIDEO_JS).not.toMatch(/innerHTML|eval\(|new Function/);
    // site.js still has its own loader for pages without video.js.
    expect(SITE_CSS).toContain('.video-frame{position:relative;aspect-ratio:16/9');
  });
});
