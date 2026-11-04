import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { TEST_FONTS } from './test-fonts.ts';
import {
  ProjectError,
  buildExport,
  buildZip,
  exportedProject,
  migrateProject,
  readSiteZip,
  sampleProject,
  siteFileBytes,
  type Project,
} from './index.ts';

const clone = (): Project => JSON.parse(JSON.stringify(sampleProject)) as Project;
const assetData = new Map([['img1', new Uint8Array([1, 2, 3, 4])]]);
const unused = {
  id: 'spare',
  kind: 'image',
  name: 'spare.webp',
  size: 2,
  mime: 'image/webp',
} as const;

describe('export leaves out unused files', () => {
  it('drops files no section uses, from the file list and the project file', () => {
    const project = { ...clone(), assets: [...clone().assets, unused] };
    // The unused file's bytes are not even needed.
    const files = buildExport(project, assetData, TEST_FONTS);
    expect(files.some((f) => f.path.includes('spare'))).toBe(false);
    const saved = JSON.parse(
      String(files.find((f) => f.path === '.klinth/project.json')?.content),
    ) as Project;
    expect(saved.assets.map((a) => a.id)).toEqual(['img1']);
    expect(exportedProject(project).assets).toHaveLength(1);
  });

  it('keeps the site icon even when no section uses it', () => {
    const project = clone();
    project.assets.push(unused);
    project.meta.favicon = 'spare';
    expect(exportedProject(project).assets.map((a) => a.id)).toEqual(['img1', 'spare']);
  });

  it('gives the exact bytes written to the ZIP', () => {
    expect(siteFileBytes({ path: 'a', content: 'é' })).toEqual(new Uint8Array([0xc3, 0xa9]));
    const raw = new Uint8Array([9]);
    expect(siteFileBytes({ path: 'b', content: raw })).toBe(raw);
  });
});

describe('readSiteZip', () => {
  const zip = buildZip(buildExport(clone(), assetData, TEST_FONTS));

  it('opens an exported ZIP with its media', () => {
    const { project, assets, missing } = readSiteZip(zip);
    expect(project).toEqual(migrateProject(clone()));
    expect(Array.from(assets.get('img1') ?? [])).toEqual([1, 2, 3, 4]);
    expect(missing).toEqual([]);
  });

  it('opens a ZIP with everything inside one top folder (GitHub "Download ZIP")', () => {
    const files = buildExport(clone(), assetData, TEST_FONTS);
    const nested = zipSync(
      Object.fromEntries(files.map((f) => [`my-site-main/${f.path}`, siteFileBytes(f)])),
    );
    const { assets } = readSiteZip(nested);
    expect(assets.get('img1')).toBeDefined();
  });

  it('lists media that is missing from the ZIP', () => {
    const files = buildExport(clone(), assetData, TEST_FONTS).filter(
      (f) => !f.path.startsWith('assets/'),
    );
    const { missing, assets } = readSiteZip(buildZip(files));
    expect(missing).toEqual(['river.webp']);
    expect(assets.size).toBe(0);
  });

  it('refuses files that are not a Klinth ZIP, with a plain message', () => {
    expect(() => readSiteZip(strToU8('hello'))).toThrow('not a ZIP');
    expect(() => readSiteZip(zipSync({ 'index.html': strToU8('<p>') }))).toThrow(
      'no Klinth project',
    );
  });

  it('refuses two projects in one ZIP', () => {
    const json = strToU8(JSON.stringify(clone()));
    const two = zipSync({ 'a/.klinth/project.json': json, 'b/.klinth/project.json': json });
    expect(() => readSiteZip(two)).toThrow(ProjectError);
  });

  it('refuses a project file hiding a token', () => {
    const bad = clone();
    bad.meta.title = 'ghp_0123456789abcdefghijklmnopqrstuvwxyz';
    const evil = zipSync({ '.klinth/project.json': strToU8(JSON.stringify(bad)) });
    expect(() => readSiteZip(evil)).toThrow(/key or token/);
  });
});
