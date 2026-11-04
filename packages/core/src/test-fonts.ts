import { BUNDLED_FONTS } from './fonts.ts';

/** Stand-in bytes for every bundled font, for tests (the editor loads the real files). */
export const TEST_FONTS: ReadonlyMap<string, Uint8Array> = new Map(
  Object.values(BUNDLED_FONTS).map((font) => [font.file, new Uint8Array([0x77, 0x4f, 0x46, 0x32])]),
);
