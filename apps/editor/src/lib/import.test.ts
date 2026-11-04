// @vitest-environment node
import {
  buildExport,
  buildZip,
  sampleProject,
  serializeProject,
  themeFonts,
  type Project,
} from '@klinth/core';
import { describe, expect, it } from 'vitest';
import { importAnyFile, missingFilesNote } from './files.ts';

const project = JSON.parse(JSON.stringify(sampleProject)) as Project;
const fonts = new Map(themeFonts(project.theme).map((f) => [f.file, new Uint8Array([1])]));

describe('importAnyFile', () => {
  it('brings back the project and its pictures from a site ZIP', async () => {
    const zip = buildZip(buildExport(project, new Map([['img1', new Uint8Array([7, 8])]]), fonts));
    const file = new File([zip as Uint8Array<ArrayBuffer>], 'my-site.zip', {
      type: 'application/zip',
    });
    const imported = await importAnyFile(file);
    expect(imported.project.meta.title).toBe(project.meta.title);
    expect(Array.from(imported.assets.get('img1') ?? [])).toEqual([7, 8]);
    expect(imported.missing).toEqual([]);
  });

  it('opens a project file and lists the media it does not carry', async () => {
    const file = new File([serializeProject(project)], 'project.json', {
      type: 'application/json',
    });
    const imported = await importAnyFile(file);
    expect(imported.assets.size).toBe(0);
    expect(imported.missing).toEqual(['river.webp']);
  });

  it('knows a ZIP by its contents, not its name', async () => {
    const zip = buildZip(buildExport(project, new Map([['img1', new Uint8Array([1])]]), fonts));
    const unnamed = new File([zip as Uint8Array<ArrayBuffer>], 'download');
    expect((await importAnyFile(unnamed)).assets.size).toBe(1);
    const fake = new File(['not a zip'], 'x.zip', { type: 'application/zip' });
    await expect(importAnyFile(fake)).rejects.toThrow('not a Klinth project file');
  });

  it('says plainly when a ZIP is not from Klinth', async () => {
    const broken = new File([new Uint8Array([0x50, 0x4b, 3, 4, 0, 0])], 'x.zip');
    await expect(importAnyFile(broken)).rejects.toThrow('not a ZIP');
  });
});

describe('missingFilesNote', () => {
  it('is short and plain', () => {
    expect(missingFilesNote([])).toBeNull();
    expect(missingFilesNote(['a.webp'])).toBe(
      '1 picture or video was not included. Upload again in "Pictures and videos".',
    );
    expect(missingFilesNote(['a', 'b'])).toMatch(/^2 pictures or videos were/);
  });
});
