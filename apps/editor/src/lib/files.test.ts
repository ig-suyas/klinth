import {
  MAX_PROJECT_FILE_BYTES,
  ProjectError,
  sampleProject,
  serializeProject,
} from '@klinth/core';
import { describe, expect, it, vi } from 'vitest';
import { importProjectFile } from './files.ts';

describe('importProjectFile', () => {
  it('rejects a huge file by its size, without reading it', async () => {
    const huge = new Blob([new Uint8Array(MAX_PROJECT_FILE_BYTES + 1)]);
    const read = vi.spyOn(huge, 'text');
    await expect(importProjectFile(huge)).rejects.toThrow(ProjectError);
    expect(read).not.toHaveBeenCalled();
  });

  it('imports a valid project file', async () => {
    const file = new Blob([serializeProject(sampleProject)], { type: 'application/json' });
    expect((await importProjectFile(file)).meta.title).toBe(sampleProject.meta.title);
  });
});
