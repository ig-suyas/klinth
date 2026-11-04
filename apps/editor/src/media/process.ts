import { MAX_VIDEO_BYTES, formatBytes, hasControlChar, type Asset } from '@klinth/core';

/**
 * Turns a file the user picked into a site file. Pictures are resized and
 * compressed in the browser (originals never reach the site); videos are
 * checked for type and size. Every problem is a MediaError with a plain message.
 */

export class MediaError extends Error {
  override name = 'MediaError';
}

/** Pictures wider than this are scaled down. */
export const IMAGE_MAX_WIDTH = 2000;
/** Pictures larger than this are refused before they are opened. */
export const MAX_IMAGE_INPUT_BYTES = 40 * 1024 * 1024;
/** GIFs up to this size are kept as they are, so animations keep moving. */
export const MAX_GIF_BYTES = 8 * 1024 * 1024;
const WEBP_QUALITY = 0.82;
const JPEG_QUALITY = 0.85;

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
export const VIDEO_ACCEPT = 'video/mp4,video/webm';

type ImageMime = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
type VideoMime = 'video/mp4' | 'video/webm';

const ascii = (bytes: Uint8Array, from: number, to: number): string =>
  String.fromCharCode(...bytes.subarray(from, to));

/** Reads the picture type from the file's first bytes (its name and type can lie). */
export function sniffImage(bytes: Uint8Array): ImageMime | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') return 'image/png';
  if (ascii(bytes, 0, 4) === 'GIF8') return 'image/gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** Reads the video type from the file's first bytes. */
export function sniffVideo(bytes: Uint8Array): VideoMime | null {
  if (ascii(bytes, 4, 8) === 'ftyp') {
    // QuickTime (.mov) files share the MP4 box layout but often do not play in browsers.
    return ascii(bytes, 8, 10) === 'qt' ? null : 'video/mp4';
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'video/webm';
  }
  return null;
}

/** Scales a size down to fit `max` wide, keeping its shape. Never scales up. */
export function fitWidth(width: number, height: number, max: number) {
  if (width <= max) return { width, height };
  return { width: max, height: Math.max(1, Math.round((height * max) / width)) };
}

/** A tidy file name for the list: one line, at most 200 characters. */
export function cleanName(name: string, fallback: string): string {
  const flat = Array.from(name, (c) => (hasControlChar(c) ? ' ' : c))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return (flat || fallback).slice(0, 200);
}

/** A short random file id like `img-k3x9q2ab`, unique (ignoring case) among `taken`. */
export function newAssetId(kind: Asset['kind'], taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, (t) => t.toLowerCase()));
  const prefix = kind === 'image' ? 'img' : 'vid';
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const id = `${prefix}-${Array.from(bytes, (b) => (b % 36).toString(36)).join('')}`;
    if (!used.has(id)) return id;
  }
}

export interface PreparedFile {
  kind: Asset['kind'];
  mime: Asset['mime'];
  name: string;
  data: Uint8Array;
  width?: number;
  height?: number;
}

async function head(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 16).arrayBuffer());
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Resizes and compresses a picture to WebP (or JPEG where WebP is not available). */
export async function prepareImage(file: File): Promise<PreparedFile> {
  if (file.size > MAX_IMAGE_INPUT_BYTES) {
    throw new MediaError(
      `This picture is very large (${formatBytes(file.size)}). Please use one under ${formatBytes(MAX_IMAGE_INPUT_BYTES)}.`,
    );
  }
  const type = sniffImage(await head(file));
  if (!type) throw new MediaError('Please use a JPG, PNG, WebP or GIF picture.');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new MediaError('This picture could not be opened. It may be damaged.');
  }
  const name = cleanName(file.name, 'Picture');
  try {
    // Animated GIFs would stop moving if redrawn, so small ones are kept as they are.
    if (type === 'image/gif' && file.size <= MAX_GIF_BYTES) {
      const data = new Uint8Array(await file.arrayBuffer());
      return { kind: 'image', mime: type, name, data, width: bitmap.width, height: bitmap.height };
    }
    const size = fitWidth(bitmap.width, bitmap.height, IMAGE_MAX_WIDTH);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d');
    if (!context) throw new MediaError('Your browser could not prepare this picture.');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    let blob = await toBlob(canvas, 'image/webp', WEBP_QUALITY);
    // Browsers without WebP encoding hand back a PNG instead.
    if (blob?.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', JPEG_QUALITY);
    if (!blob) throw new MediaError('Your browser could not prepare this picture.');
    const mime = blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    // A small, already compressed picture can come out bigger: keep the original then.
    const keepOriginal =
      size.width === bitmap.width &&
      blob.size >= file.size &&
      (type === 'image/webp' || type === 'image/jpeg');
    const data = new Uint8Array(await (keepOriginal ? file : blob).arrayBuffer());
    return { kind: 'image', mime: keepOriginal ? type : mime, name, data, ...size };
  } finally {
    bitmap.close();
  }
}

/** Reads a video's pixel size, if the browser can. Never fails. */
function videoSize(file: Blob): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    let url: string;
    try {
      url = URL.createObjectURL(file);
    } catch {
      resolve(undefined);
      return;
    }
    const video = document.createElement('video');
    const done = (size?: { width: number; height: number }) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      resolve(size);
    };
    const timer = setTimeout(() => done(), 5000);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () =>
      done(
        video.videoWidth > 0 && video.videoHeight > 0
          ? {
              width: Math.min(video.videoWidth, 10_000),
              height: Math.min(video.videoHeight, 10_000),
            }
          : undefined,
      );
    video.onerror = () => done();
    video.src = url;
  });
}

/** Checks a video: MP4 or WebM, at most 25 MB. */
export async function prepareVideo(file: File): Promise<PreparedFile> {
  if (file.size > MAX_VIDEO_BYTES) {
    throw new MediaError(
      `This video is ${formatBytes(file.size)}. Videos can be up to ${formatBytes(MAX_VIDEO_BYTES)}. For bigger videos, put them on YouTube or Vimeo and paste the link instead.`,
    );
  }
  const mime = sniffVideo(await head(file));
  if (!mime) {
    throw new MediaError(
      'Please use an MP4 or WebM video. Most phones and video apps can save as MP4.',
    );
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const size = await videoSize(file);
  return { kind: 'video', mime, name: cleanName(file.name, 'Video'), data, ...size };
}
