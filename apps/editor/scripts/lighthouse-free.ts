/**
 * Lighthouse check for a site with freely placed sections (run with
 * `npm run lighthouse:free -w @klinth/editor`; needs Chrome and network for npx).
 *
 * 1. Exports the portfolio template with the editor's preview markers and
 *    measures its intro and about sections in Chrome at desktop width, the same
 *    way the preview script does before "Yes, use free layout".
 * 2. Converts those sections with the real conversion and exports the site.
 * 3. Runs Lighthouse (mobile and desktop) for SEO and accessibility; fails below 95.
 */
import { buildExport, renderSite, type FlowMeasurement, type Project } from '@klinth/core';
import { getTemplate } from '@klinth/templates';
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertToFree } from '../src/state/free.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MIN_SCORE = 0.95;
const LIGHTHOUSE = 'lighthouse@13.6.0';
/** `--keep`: leave the exported sites in the temp folder (for a look by hand). */
const KEEP = process.argv.includes('--keep');

/** The bundled fonts' real bytes, from the fontsource packages the editor uses. */
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

async function writeSite(dir: string, files: { path: string; content: string | Uint8Array }[]) {
  for (const file of files) {
    const target = join(dir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
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

/** Same measurement as the preview script (free-bridge.ts), in the page. */
function measureInPage(id: string): FlowMeasurement {
  const section = document.querySelector(`[data-k-section="${id}"]`);
  const wrap = section?.querySelector(':scope > .wrap');
  if (!section || !wrap) throw new Error(`section ${id} not found`);
  const r = wrap.getBoundingClientRect();
  const cs = getComputedStyle(wrap);
  const left = r.left + parseFloat(cs.paddingLeft);
  const top = r.top + parseFloat(cs.paddingTop);
  const width = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const height = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const groups = new Map<string, { l: number; t: number; r: number; b: number; fs: number }>();
  for (const el of section.querySelectorAll('[data-k-from]')) {
    const box = el.getBoundingClientRect();
    if (!(box.width > 0 && box.height > 0)) continue;
    const path = el.getAttribute('data-k-from') ?? '';
    const g = groups.get(path);
    if (!g) {
      groups.set(path, {
        l: box.left,
        t: box.top,
        r: box.right,
        b: box.bottom,
        fs: parseFloat(getComputedStyle(el).fontSize),
      });
    } else {
      g.l = Math.min(g.l, box.left);
      g.t = Math.min(g.t, box.top);
      g.r = Math.max(g.r, box.right);
      g.b = Math.max(g.b, box.bottom);
    }
  }
  return {
    width,
    height,
    elements: [...groups].map(([from, g]) => ({
      from,
      x: g.l - left,
      y: g.t - top,
      width: g.r - g.l,
      height: g.b - g.t,
      fontSize: g.fs > 0 ? g.fs : undefined,
    })),
  };
}

async function main() {
  const template = getTemplate('portfolio');
  if (!template) throw new Error('portfolio template missing');
  let project: Project = template.create();
  const fonts = await fontBytes();
  const work = await mkdtemp(join(tmpdir(), 'klinth-lh-'));
  const flowDir = join(work, 'flow');
  const freeDir = join(work, 'free');
  const servers: Server[] = [];
  try {
    // 1. The flow site with markers, measured in Chrome at desktop width.
    const fontFiles = buildExport(project, new Map(), fonts).filter((f) =>
      f.path.startsWith('fonts/'),
    );
    await writeSite(flowDir, [...renderSite(project, { editable: true }), ...fontFiles]);
    const flow = await serve(flowDir);
    servers.push(flow.server);
    const sections = (project.pages[0]?.sections ?? []).filter((s) =>
      ['hero', 'about'].includes(s.type),
    );
    const browser = await chromium.launch({ channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(flow.url);
    await page.evaluate(() => document.fonts.ready);
    for (const section of sections) {
      const measure = await page.evaluate(measureInPage, section.id);
      const result = convertToFree(project, 0, section.id, measure);
      if ('problem' in result) throw new Error(`${section.id}: ${result.problem}`);
      project = result.project as Project;
      console.log(`free layout: ${section.type} (${measure.elements.length} items)`);
    }
    await browser.close();

    // 2. The exported site with free sections.
    await writeSite(freeDir, buildExport(project, new Map(), fonts));
    const html = await readFile(join(freeDir, 'index.html'), 'utf8');
    if (!html.includes('block-free') || !html.includes('css/free.css')) {
      throw new Error('the export has no free section');
    }
    const site = await serve(freeDir);
    servers.push(site.server);

    // 3. Lighthouse on a phone (stacked items) and on desktop (placed items).
    let ok = true;
    for (const device of ['mobile', 'desktop'] as const) {
      const report = join(work, `report-${device}.json`);
      // One command line made only of fixed text, the local address and a temp path
      // (npx is a .cmd file on Windows, which needs a shell).
      const command = [
        'npx -y',
        LIGHTHOUSE,
        site.url,
        '--quiet',
        '--only-categories=seo,accessibility',
        '--output=json',
        `--output-path="${report}"`,
        '--chrome-flags=--headless',
        ...(device === 'desktop' ? ['--preset=desktop'] : []),
      ].join(' ');
      // Not spawnSync: this process serves the site while Lighthouse loads it.
      const status = await new Promise<number | null>((resolve, reject) => {
        const child = spawn(command, { stdio: 'inherit', shell: true });
        child.on('error', reject);
        child.on('exit', resolve);
      });
      if (status !== 0) throw new Error(`Lighthouse exited with ${status}`);
      const result = JSON.parse(await readFile(report, 'utf8')) as {
        categories: Record<string, { title: string; score: number }>;
        audits: Record<string, { title: string; score: number | null }>;
      };
      for (const category of Object.values(result.categories)) {
        console.log(`${device} ${category.title}: ${Math.round(category.score * 100)}`);
        if (category.score < MIN_SCORE) ok = false;
      }
      for (const audit of Object.values(result.audits)) {
        if (audit.score !== null && audit.score < 1) console.log(`  needs work: ${audit.title}`);
      }
    }
    if (!ok) throw new Error(`a score is below ${MIN_SCORE * 100}`);
  } finally {
    for (const server of servers) server.close();
    if (KEEP) console.log(`sites kept in ${work}`);
    else await rm(work, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
