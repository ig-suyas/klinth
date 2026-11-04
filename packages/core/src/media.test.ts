/* eslint-disable @typescript-eslint/no-non-null-assertion -- fixture indexes are known in tests */
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  MAX_VIDEO_BYTES,
  assetBytes,
  assetUsage,
  blockPropSchemas,
  buildExport,
  buildZip,
  formatBytes,
  looksLikeEmbedCode,
  parseVideoUrl,
  projectSchema,
  removeAsset,
  renderSite,
  sampleProject,
  type Project,
  type Section,
  type SiteFile,
} from './index.ts';

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const html = (files: SiteFile[], path = 'index.html'): string => {
  const f = files.find((x) => x.path === path);
  if (!f || typeof f.content !== 'string') throw new Error(`missing ${path}`);
  return f.content;
};

/** The sample project with extra sections on the home page, before the footer. */
function withSections(sections: Section[], assets: Project['assets'] = []): Project {
  const p = clone();
  const home = p.pages[0]!;
  home.sections.splice(home.sections.length - 1, 0, ...sections);
  p.assets.push(...assets);
  return projectSchema.parse(p);
}

const VIDEO_ASSET = {
  id: 'vid1',
  kind: 'video' as const,
  name: 'clip.mp4',
  size: 1000,
  mime: 'video/mp4' as const,
  width: 1280,
  height: 720,
};

describe('video links', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=30', 'youtube', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc123', 'youtube', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'youtube', 'dQw4w9WgXcQ'],
    ['  https://vimeo.com/76979871  ', 'vimeo', '76979871'],
    ['https://player.vimeo.com/video/76979871', 'vimeo', '76979871'],
  ])('reads %s', (url, provider, id) => {
    expect(parseVideoUrl(url)).toMatchObject({ provider, id });
  });

  it('keeps the hash of private Vimeo links', () => {
    expect(parseVideoUrl('https://vimeo.com/76979871/abc123def0')).toEqual({
      provider: 'vimeo',
      id: '76979871',
      hash: 'abc123def0',
    });
    expect(parseVideoUrl('https://player.vimeo.com/video/76979871?h=abc123def0')?.hash).toBe(
      'abc123def0',
    );
  });

  it.each([
    '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
    '<IFRAME src=https://player.vimeo.com/video/76979871>',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>alert(1)</script>',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ onload=alert(1)',
    'https://www.youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://evilyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://youtu.be.evil.com/dQw4w9WgXcQ',
    'https://evil.com/?u=https://youtu.be/dQw4w9WgXcQ',
    'javascript:alert(1)//https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://youtu.be/dQw4w9WgXcQextra',
    'https://vimeo.com/channels/staffpicks',
    'https://vimeo.com.evil.com/76979871',
    'ftp://vimeo.com/76979871',
    'dQw4w9WgXcQ',
    '',
    `https://youtu.be/dQw4w9WgXcQ?${'a'.repeat(600)}`,
  ])('refuses %s', (url) => {
    expect(parseVideoUrl(url)).toBeNull();
  });

  it('refuses raw iframe HTML with a clear message', () => {
    const embed = '<iframe width="560" src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>';
    expect(looksLikeEmbedCode(embed)).toBe(true);
    const result = blockPropSchemas.video.safeParse({ embedUrl: embed });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/link, not the embed code/);
    expect(blockPropSchemas.video.safeParse({ embedUrl: 'https://example.com/v' }).success).toBe(
      false,
    );
    expect(
      blockPropSchemas.video.safeParse({ embedUrl: 'https://youtu.be/dQw4w9WgXcQ' }).success,
    ).toBe(true);
  });
});

describe('video section', () => {
  it('renders a click-to-load facade with addresses rebuilt from the id', () => {
    const page = html(
      renderSite(
        withSections([
          {
            id: 'clip',
            type: 'video',
            props: { heading: 'Our "studio"', embedUrl: 'https://youtu.be/dQw4w9WgXcQ?si=x&t=3' },
          },
        ]),
      ),
    );
    expect(page).toContain(
      'class="video-facade" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"',
    );
    expect(page).toContain(
      'data-embed="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&amp;rel=0"',
    );
    expect(page).toContain(
      'aria-label="Play video: Our &quot;studio&quot; (loads the YouTube player)"',
    );
    // Nothing loads from the video site until play is pressed.
    expect(page).not.toMatch(/<iframe/);
    expect(page).not.toContain('si=x');
  });

  it('renders an uploaded video from its file, and prefers a link when both are set', () => {
    const project = withSections(
      [{ id: 'clip', type: 'video', props: { heading: 'Clip', video: 'vid1' } }],
      [VIDEO_ASSET],
    );
    const page = html(renderSite(project));
    expect(page).toContain(
      '<video src="assets/vid1.mp4" controls playsinline preload="metadata" width="1280" height="720"',
    );
    const both = withSections(
      [
        {
          id: 'clip',
          type: 'video',
          props: { video: 'vid1', embedUrl: 'https://vimeo.com/76979871' },
        },
      ],
      [VIDEO_ASSET],
    );
    const bothPage = html(renderSite(both));
    expect(bothPage).toContain('https://player.vimeo.com/video/76979871?autoplay=1&amp;dnt=1');
    expect(bothPage).not.toContain('<video');
  });

  it('ignores a picture used as a video, and a missing file', () => {
    const project = withSections([
      { id: 'a', type: 'video', props: { video: 'img1' } },
      { id: 'b', type: 'video', props: { video: 'gone' } },
    ]);
    expect(html(renderSite(project))).not.toContain('<video');
  });

  it('marks files for the editor instead of giving them an address in the preview', () => {
    const project = withSections(
      [{ id: 'clip', type: 'video', props: { video: 'vid1' } }],
      [VIDEO_ASSET],
    );
    const page = html(renderSite(project, { preview: true }));
    expect(page).toContain('<video data-k-asset="vid1"');
    expect(page).toContain('<img data-k-asset="img1"');
    expect(page).not.toContain('src="assets/');
  });

  it('the site script loads only the two player hosts', () => {
    const js = html(renderSite(clone()), 'js/site.js');
    expect(js).toContain("'https://www.youtube-nocookie.com/embed/'");
    expect(js).toContain("'https://player.vimeo.com/video/'");
    expect(js).toContain('e.defaultPrevented');
  });
});

describe('custom code', () => {
  const CODE =
    '<canvas id="c"></canvas><script>try{parent.document.title="x"}catch(e){}</script>"\'&';
  const project = () => withSections([{ id: 'code', type: 'customCode', props: { code: CODE } }]);

  it('runs as pasted on the exported site', () => {
    const page = html(renderSite(project()));
    expect(page).toContain(`<div class="custom-code">${CODE}</div>`);
    const readme = buildExport(project(), new Map([['img1', new Uint8Array([1])]])).find(
      (f) => f.path === 'README.md',
    );
    expect(readme?.content).toContain('About your custom code');
  });

  it('is only ever inside a nested allow-scripts frame in the preview', () => {
    const page = html(renderSite(project(), { preview: true, editable: true }));
    // The code never appears as live markup in the preview page itself.
    expect(page).not.toContain('<canvas');
    expect(page).not.toContain('<script>try');
    const frames = page.match(/<iframe[^>]*>/g) ?? [];
    expect(frames).toHaveLength(1);
    const frame = frames[0]!;
    expect(frame).toContain('sandbox="allow-scripts"');
    expect(frame).not.toMatch(/allow-same-origin|allow-top-navigation|allow-popups|allow-forms/);
    expect(frame).toContain('srcdoc="');
    expect(frame).toContain('&lt;canvas id=&quot;c&quot;&gt;');
    // The quote the user typed cannot close the srcdoc attribute early.
    const srcdoc = /srcdoc="([^"]*)"/.exec(frame)?.[1] ?? '';
    expect(srcdoc).toContain('&quot;&#39;&amp;');
  });

  it('shows nothing on the site when empty, and a hint in the preview', () => {
    const empty = withSections([{ id: 'code', type: 'customCode', props: {} }]);
    expect(html(renderSite(empty))).not.toContain('custom-code');
    expect(html(renderSite(empty, { preview: true }))).toContain('paste your code');
  });

  it('refuses code over the size limit', () => {
    expect(blockPropSchemas.customCode.safeParse({ code: 'x'.repeat(200_001) }).success).toBe(
      false,
    );
  });
});

describe('files', () => {
  const project = () =>
    withSections(
      [
        { id: 'clip', type: 'video', props: { video: 'vid1' } },
        {
          id: 'pics',
          type: 'gallery',
          props: {
            images: [
              { image: 'img1', imageAlt: 'River', caption: 'One' },
              { image: 'img2', caption: 'Two' },
            ],
          },
        },
      ],
      [VIDEO_ASSET, { id: 'img2', kind: 'image', name: 'b.webp', size: 2048, mime: 'image/webp' }],
    );

  it('counts where each file is used', () => {
    const usage = assetUsage(project());
    expect(usage.get('img1')).toBe(2);
    expect(usage.get('vid1')).toBe(1);
    expect(usage.get('img2')).toBe(1);
    expect(usage.has('nope')).toBe(false);
  });

  it('removes a file and every reference to it', () => {
    const next = projectSchema.parse(removeAsset(project(), 'img1'));
    expect(next.assets.map((a) => a.id)).toEqual(['vid1', 'img2']);
    expect(assetUsage(next).has('img1')).toBe(false);
    const work = next.pages[0]!.sections.find((s) => s.id === 'work');
    // The description goes with the picture.
    expect(JSON.stringify(work)).not.toContain('A river map');
    const gallery = next.pages[0]!.sections.find((s) => s.type === 'gallery');
    expect(gallery?.props).toEqual({ images: [{ image: 'img2', caption: 'Two' }] });
  });

  it('adds up sizes in plain words', () => {
    expect(assetBytes(project())).toBe(4 + 1000 + 2048);
    expect(formatBytes(300)).toBe('1 KB');
    expect(formatBytes(840 * 1024)).toBe('840 KB');
    expect(formatBytes(12.5 * 1024 * 1024)).toBe('13 MB');
    expect(formatBytes(2.25 * 1024 * 1024)).toBe('2.3 MB');
  });

  it('refuses files over 25 MB', () => {
    const big = clone();
    big.assets.push({ ...VIDEO_ASSET, size: MAX_VIDEO_BYTES + 1 });
    expect(projectSchema.safeParse(big).success).toBe(false);
  });

  it('exports media into the ZIP next to the pages that use it', () => {
    const data = new Map([
      ['img1', new Uint8Array([1, 2])],
      ['img2', new Uint8Array([3])],
      ['vid1', new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])],
    ]);
    const zip = unzipSync(buildZip(buildExport(project(), data)));
    expect(Array.from(zip['assets/vid1.mp4'] ?? [])).toEqual(Array.from(data.get('vid1')!));
    expect(Array.from(zip['assets/img2.webp'] ?? [])).toEqual([3]);
    const page = strFromU8(zip['index.html']!);
    expect(page).toContain('src="assets/vid1.mp4"');
    expect(page).toContain('src="assets/img2.webp"');
  });
});
