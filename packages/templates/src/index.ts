/**
 * @klinth/templates: the two starter templates and the block definitions.
 */
import type { Project } from '@klinth/core';
import { createLanding } from './landing.ts';
import { createPortfolio } from './portfolio.ts';

export { blockDefinitions, type BlockDefinition } from './blocks.ts';

export interface TemplateInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Returns a fresh copy, so edits never change the template itself. */
  readonly create: () => Project;
}

export const templates: readonly TemplateInfo[] = [
  {
    id: 'portfolio',
    name: 'Personal portfolio',
    description: 'Show your work, tell your story and let people reach you.',
    create: createPortfolio,
  },
  {
    id: 'landing',
    name: 'Small business or link page',
    description: 'One clear page for your business, or all your links in one place.',
    create: createLanding,
  },
];

export function getTemplate(id: string): TemplateInfo | undefined {
  return templates.find((t) => t.id === id);
}
