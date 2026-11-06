/**
 * Lighthouse check for the animation presets (run with `npm run lighthouse:anim -w
 * @klinth/editor`; needs Chrome and network for npx). Exports the portfolio
 * template with a moving gradient, background parallax, section transitions and
 * split headings, then runs Lighthouse on a phone for all four categories; fails
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

/** The portfolio template with a new preset on every section. */
function buildProject(): { project: Project; assets: Map<string, Uint8Array> } {
  const template = getTemplate('portfolio');
  if (!template) throw new Error('portfolio template missing');
  const project = template.create();
  // By block type, so any order of sections works; the rest get a section transition.
  const byType: Record<string, object> = {
    hero: { background: { preset: 'gradient' }, heading: { preset: 'words' } },
    about: { section: { preset: 'rise' }, heading: { preset: 'letters' } },
    projects: { section: { preset: 'slideLeft' }, cards: { preset: 'tilt' } },
    testimonials: { background: { preset: 'parallax' }, section: { preset: 'swing' } },
  };
  for (const section of project.pages[0]?.sections ?? []) {
    if (section.type === 'footer' || section.type === 'spacer') continue;
    (section as { animation?: object }).animation = byType[section.type] ?? {
      section: { preset: 'slideRight' },
    };
  }
  return { project, assets: new Map() };
}
async function main() {
  const { project, assets } = buildProject();
  const work = await mkdtemp(join(tmpdir(), 'klinth-lh-anim-'));
  let server: Server | null = null;
  try {
    for (const file of buildExport(project, assets, await fontBytes())) {
      const target = join(work, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content);
    }
    const html = await readFile(join(work, 'index.html'), 'utf8');
    for (const needed of [
      'data-anim-background="gradient"',
      'data-anim-background="parallax"',
      'data-anim-section="rise"',
      'data-anim-section="swing"',
      'data-anim-heading="letters"',
      'js/anim.js',
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
