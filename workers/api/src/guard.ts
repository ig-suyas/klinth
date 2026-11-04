/**
 * Defences for the private design skill. These hide the skill from direct
 * reading; a determined person might still infer style rules from answers.
 */

/** Requests that try to get the hidden instructions out, instead of editing a section. */
const EXTRACTION: RegExp[] = [
  /\b(system|developer)\s+(prompt|instructions?|message)\b/i,
  /\b(your|these|the\s+hidden|the\s+secret|initial|original)\s+(instructions|prompt|rules|guidelines|guide|skill|directives)\b/i,
  /\bignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier|preceding)\b/i,
  /\b(repeat|print|reveal|output|show|copy|dump)\s+(everything|all|the\s+text|the\s+words)\s+(above|before)\b/i,
  /\bdesign\s+(skill|guide)\b/i,
];

export function isExtractionAttempt(instruction: string): boolean {
  return EXTRACTION.some((pattern) => pattern.test(instruction));
}

/** Runs of this many words copied from the skill count as an echo. */
export const ECHO_WORDS = 8;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function shingles(list: string[], size: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + size <= list.length; i++) out.add(list.slice(i, i + size).join(' '));
  return out;
}

/** Every string inside a JSON value (keys too, in case the model hides text there). */
export function allStrings(value: unknown): string[] {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') parts.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (typeof node === 'object' && node !== null) {
      for (const [key, child] of Object.entries(node)) {
        parts.push(key);
        walk(child);
      }
    }
  };
  walk(value);
  return parts;
}

/**
 * True when `output` repeats a run of ECHO_WORDS words from `skill`. Each
 * string is checked separately so words from neighbouring fields never join
 * into a false match.
 */
export function echoesSkill(output: unknown, skill: string): boolean {
  const secret = shingles(words(skill), ECHO_WORDS);
  if (secret.size === 0) return false;
  return allStrings(output).some((text) => {
    for (const run of shingles(words(text), ECHO_WORDS)) if (secret.has(run)) return true;
    return false;
  });
}
