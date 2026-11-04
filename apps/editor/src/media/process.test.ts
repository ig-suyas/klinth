import { MAX_VIDEO_BYTES, REPO_WARN_BYTES, sampleProject, type Project } from '@klinth/core';
import { describe, expect, it, vi } from 'vitest';
import { videoLinkProblem } from '../inspector/MediaFields.tsx';
import { sizeWarning } from './files.ts';
import {
  MAX_IMAGE_INPUT_BYTES,
  MediaError,
  cleanName,
  fitWidth,
  newAssetId,
  prepareImage,
  prepareVideo,
  sniffImage,
  sniffVideo,
} from './process.ts';

const bytes = (...values: (number | string)[]): Uint8Array =>
  new Uint8Array(
    values.flatMap((v) => (typeof v === 'string' ? Array.from(v, (c) => c.charCodeAt(0)) : [v])),
  );

const MP4 = bytes(0, 0, 0, 24, 'ftypisom', 0, 0, 2, 0);
const MOV = bytes(0, 0, 0, 20, 'ftypqt  ', 0, 0, 0, 0);
const WEBM = bytes(0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0);

/** A File whose reported size is `size` without allocating it. */
function fakeFile(head: Uint8Array, name: string, size = head.byteLength): File {
  const file = new File([head as Uint8Array<ArrayBuffer>], name);
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('file checks', () => {
  it('reads picture types from the first bytes', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffImage(bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffImage(bytes('GIF89a'))).toBe('image/gif');
    expect(sniffImage(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe('image/webp');
    // SVG can carry scripts, so it is not accepted as an upload.
    expect(sniffImage(bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBeNull();
    expect(sniffImage(bytes('<html>'))).toBeNull();
  });

  it('reads video types from the first bytes', () => {
    expect(sniffVideo(MP4)).toBe('video/mp4');
    expect(sniffVideo(WEBM)).toBe('video/webm');
    expect(sniffVideo(MOV)).toBeNull();
    expect(sniffVideo(bytes('RIFF', 0, 0, 0, 0, 'AVI '))).toBeNull();
  });

  it('scales big pictures down to 2000 px wide and never up', () => {
    expect(fitWidth(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWidth(800, 600, 2000)).toEqual({ width: 800, height: 600 });
    expect(fitWidth(100_000, 1, 2000)).toEqual({ width: 2000, height: 1 });
  });

  it('tidies file names and makes unique ids', () => {
    expect(cleanName('  my\nholiday photo.jpg ', 'Picture')).toBe('my holiday photo.jpg');
    expect(cleanName('   ', 'Picture')).toBe('Picture');
    expect(cleanName('x'.repeat(300), 'Picture')).toHaveLength(200);
    const taken = new Set<string>();
    for (let i = 0; i < 100; i += 1) {
      const id = newAssetId('image', taken);
      expect(id).toMatch(/^img-[a-z0-9]{8}$/);
      expect(taken.has(id)).toBe(false);
      taken.add(id);
    }
    expect(newAssetId('video', [])).toMatch(/^vid-/);
  });
});

describe('uploads', () => {
  it('refuses videos over 25 MB and suggests a link', async () => {
    const big = fakeFile(MP4, 'big.mp4', MAX_VIDEO_BYTES + 1);
    await expect(prepareVideo(big)).rejects.toThrow(MediaError);
    await expect(prepareVideo(big)).rejects.toThrow(/up to 25 MB.*YouTube or Vimeo/);
  });

  it('refuses videos that are not MP4 or WebM, whatever their name says', async () => {
    await expect(prepareVideo(fakeFile(MOV, 'clip.mp4'))).rejects.toThrow(/MP4 or WebM/);
    await expect(prepareVideo(fakeFile(bytes('<script>'), 'clip.webm'))).rejects.toThrow(
      /MP4 or WebM/,
    );
  });

  it('keeps a valid video as it is', async () => {
    const file = new File([MP4 as Uint8Array<ArrayBuffer>], 'clip.mp4', { type: 'video/mp4' });
    // Test browsers never load video details, so the size lookup gives up after 5 s.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pending = prepareVideo(file);
    await vi.advanceTimersByTimeAsync(5000);
    const prepared = await pending;
    vi.useRealTimers();
    expect(prepared).toMatchObject({ kind: 'video', mime: 'video/mp4', name: 'clip.mp4' });
    expect(Array.from(prepared.data)).toEqual(Array.from(MP4));
  });

  it('refuses pictures that are too large or not pictures', async () => {
    await expect(
      prepareImage(fakeFile(bytes(0xff, 0xd8, 0xff), 'huge.jpg', MAX_IMAGE_INPUT_BYTES + 1)),
    ).rejects.toThrow(/very large/);
    await expect(prepareImage(fakeFile(bytes('<svg onload=alert(1)>'), 'a.svg'))).rejects.toThrow(
      /JPG, PNG, WebP or GIF/,
    );
  });

  it('warns when the site gets heavy', () => {
    const project: Project = {
      ...sampleProject,
      assets: [
        {
          id: 'v',
          kind: 'video',
          name: 'v.mp4',
          size: REPO_WARN_BYTES + 1,
          mime: 'video/mp4',
        },
      ],
    };
    expect(sizeWarning(sampleProject)).toBeNull();
    expect(sizeWarning(project)).toMatch(/add up to \d+ MB/);
  });
});

describe('video links in the inspector', () => {
  it('explains embed code and other sites in plain words', () => {
    expect(
      videoLinkProblem('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>'),
    ).toMatch(/embed code/);
    expect(videoLinkProblem('https://example.com/video')).toMatch(/YouTube or Vimeo/);
    expect(videoLinkProblem('https://youtu.be/dQw4w9WgXcQ')).toBeNull();
  });
});
