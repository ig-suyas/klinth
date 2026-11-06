/**
 * Lighthouse check for a site that uses every extra (run with
 * `npm run lighthouse:extras -w @klinth/editor`; needs Chrome and network for
 * npx). Exports the portfolio template with a rotating headline first (so it
 * is the page's main heading), a picture stack (three SVG pictures), numbered
 * steps on glass, a quote marquee, a folded section, decorative shapes and
 * giant text, then runs Lighthouse on a phone for all four categories; fails
 * below 95.
 */
import { buildExport, type Project } from '@klinth/core';
import { getTemplate } from '@klinth/templates';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addSection, setSectionProps } from '../src/state/sections.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MIN_SCORE = 0.95;
const LIGHTHOUSE = 'lighthouse@13.6.0';
const KEEP = process.argv.includes('--keep');

async function fontBytes(): Promise<Map<string, Uint8Array>> {
  const base = join(ROOT, 'node_modules', '@fontsource-variable');
  const fonts = new Map<string, Uint8Array>();
  for (const pkg of await readdir(base)) {
    const dir = join(base, pkg, 'files');
    if (!existsSync(dir)) continue;
    for (const file of await readdir(dir)) {
      if (file.endsWith('.woff2')) fonts.set(file, await readFile(join(dir, file)));
    }
  }
  return fonts;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

function serve(dir: string): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
    const file = normalize(join(dir, path.endsWith('/') ? `${path}index.html` : path));
    if (!file.startsWith(dir)) {
      res.writeHead(403).end();
      return;
    }
    readFile(file).then(
      (body) => {
        res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
        res.end(body);
      },
      () => res.writeHead(404).end(),
    );
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}/` });
    }),
  );
}

/** Applies a pure edit and checks nothing went wrong. */
function step(result: unknown): Project {
  if (typeof result === 'object' && result !== null && 'problem' in result) {
    throw new Error(String((result as { problem: string }).problem));
  }
  return result as Project;
}

/** A small picture: a soft gradient with a circle, 800 x 1000. */
function picture(hue: number): Uint8Array {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 60% 70%)"/><stop offset="1" stop-color="hsl(${hue + 40} 50% 40%)"/></linearGradient></defs><rect width="800" height="1000" fill="url(#g)"/><circle cx="400" cy="420" r="180" fill="rgb(255 255 255/.35)"/></svg>`;
  return new TextEncoder().encode(svg);
}

function buildProject(): { project: Project; assets: Map<string, Uint8Array> } {
  const template = getTemplate('portfolio');
  if (!template) throw new Error('portfolio template missing');
  let project = template.create();
  const assets = new Map<string, Uint8Array>();
  for (const [i, id] of ['pic1', 'pic2', 'pic3'].entries()) {
    const bytes = picture(20 + i * 90);
    assets.set(id, bytes);
    project.assets.push({
      id,
      kind: 'image',
      name: `${id}.svg`,
      size: bytes.length,
      mime: 'image/svg+xml',
      width: 800,
      height: 1000,
    });
  }
  let last: string | null = null;
  const add = (type: Parameters<typeof addSection>[2], props: Record<string, unknown>) => {
    const added = addSection(project, 0, type, last);
    project = step(added.project);
    project = step(setSectionProps(project, 0, added.id, props));
    last = added.id;
    return added.id;
  };
  // First section, so it is the page's main heading.
  const first = project.pages[0]?.sections[0]?.id;
  add('rotator', {
    heading: 'We design',
    words: [{ word: 'websites' }, { word: 'shops' }, { word: 'brands' }],
    effect: 'typewriter',
    intro: 'A small studio for friendly, fast websites.',
    shapes: [
      { kind: 'starburst', color: 'accent', motion: 'spin', size: 160, x: 88, y: 24 },
      { kind: 'rings', color: 'muted', motion: 'float', size: 120, x: 8, y: 80, opacity: 60 },
    ],
  });
  // Move the rotating headline above the template's own intro.
  const page = project.pages[0];
  if (page && first) {
    const rot = page.sections.findIndex((s) => s.id === last);
    const [section] = page.sections.splice(rot, 1);
    if (section) page.sections.unshift(section);
  }
  add('cardStack', {
    heading: 'A few moments',
    images: ['pic1', 'pic2', 'pic3'].map((image, i) => ({
      image,
      imageAlt: `Studio picture ${i + 1}`,
    })),
    auto: true,
  });
  add('steps', {
    heading: 'How it works',
    cardStyle: 'glass',
    background: 'tinted',
    items: [
      { title: 'We talk', text: 'Tell me what you need.' },
      { title: 'I make it', text: 'You see progress every week.' },
      { title: 'You launch', text: 'Your site goes live.' },
    ],
    shapes: [
      { kind: 'blob', color: 'accent', motion: 'pulse', size: 360, x: 90, y: 60, opacity: 30 },
    ],
  });
  add('marquee', {
    heading: 'Kind words',
    cardStyle: 'glass',
    items: [
      { quote: 'A **brilliant** partner.', name: 'Ana', role: 'Founder' },
      { quote: 'Fast, kind and **clear**.', name: 'Ben' },
      { quote: 'Our shop doubled its visits.', name: 'Chloé', role: 'Owner' },
    ],
  });
  add('textImage', {
    heading: 'Questions',
    body: 'Everything you wanted to know.',
    fold: true,
    foldTitle: 'Read the answers',
  });
  add('giantText', { heading: 'Hello', fill: 'accent', size: 'huge', crop: true, reveal: true });
  return { project, assets };
}

async function main() {
  const { project, assets } = buildProject();
  const work = await mkdtemp(join(tmpdir(), 'klinth-lh-extras-'));
  let server: Server | null = null;
  try {
    for (const file of buildExport(project, assets, await fontBytes())) {
      const target = join(work, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content);
    }
    const html = await readFile(join(work, 'index.html'), 'utf8');
    for (const needed of [
      'data-rotator',
      'data-stack',
      'block-steps cs-glass',
      'data-marquee',
      'data-fold',
      'shp-layer',
      'gt-crop',
      'js/extras.js',
    ]) {
      if (!html.includes(needed)) throw new Error(`the export has no ${needed}`);
    }
    const site = await serve(work);
    server = site.server;
    const report = join(work, 'report-mobile.json');
    const command = [
      'npx -y',
      LIGHTHOUSE,
      site.url,
      '--quiet',
      '--only-categories=performance,accessibility,best-practices,seo',
      '--output=json',
      `--output-path="${report}"`,
      '--chrome-flags=--headless',
    ].join(' ');
    const status = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(command, { stdio: 'inherit', shell: true });
      child.on('error', reject);
      child.on('exit', resolve);
    });
    if (status !== 0) throw new Error(`Lighthouse exited with ${status}`);
    const result = JSON.parse(await readFile(report, 'utf8')) as {
      categories: Record<string, { title: string; score: number }>;
      audits: Record<string, { title: string; score: number | null; displayValue?: string }>;
    };
    let ok = true;
    for (const category of Object.values(result.categories)) {
      console.log(`mobile ${category.title}: ${Math.round(category.score * 100)}`);
      if (category.score < MIN_SCORE) ok = false;
    }
    for (const id of [
      'largest-contentful-paint',
      'cumulative-layout-shift',
      'total-blocking-time',
    ]) {
      const audit = result.audits[id];
      if (audit) console.log(`  ${audit.title}: ${audit.displayValue ?? ''}`);
    }
    for (const audit of Object.values(result.audits)) {
      if (audit.score !== null && audit.score < 0.9) console.log(`  needs work: ${audit.title}`);
    }
    if (!ok) throw new Error(`a score is below ${MIN_SCORE * 100}`);
  } finally {
    server?.close();
    if (KEEP) console.log(`site kept in ${work}`);
    else await rm(work, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
