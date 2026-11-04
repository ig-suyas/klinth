import { z } from 'zod';

// Zod tests `new Function` once to decide whether to compile fast parsers. The
// editor's policy forbids eval, so that test shows up as a CSP violation in the
// console. Plain parsing is fast enough for project files. Imported first in
// main.tsx: some modules parse while they load, and the test runs only once.
z.config({ jitless: true });
