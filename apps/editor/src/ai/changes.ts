import type { BlockType } from '@klinth/core';
import { blockFields, type FieldSpec } from '../inspector/fields.ts';

type Props = Readonly<Record<string, unknown>>;

function labelFor(type: BlockType, key: string): string {
  for (const spec of blockFields[type] as readonly FieldSpec[]) {
    if (spec.key === key) return spec.label;
    if (spec.kind === 'image' && spec.altKey === key) return 'Picture description';
    if (spec.kind === 'video' && spec.linkKey === key) return spec.label;
  }
  return key;
}

/** Plain names of the settings that differ, in the inspector's order. */
export function changedFields(type: BlockType, before: Props, after: Props): string[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changed = keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  const order = (blockFields[type] as readonly FieldSpec[]).map((s) => s.key);
  changed.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
  return [...new Set(changed.map((key) => labelFor(type, key)))];
}

/** "Heading, Intro text and Buttons" */
export function listNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1) ?? ''}`;
}
