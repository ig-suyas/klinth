/**
 * @klinth/templates: the two starter templates and block definitions (Phase 2).
 */

export interface TemplateInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export const templates: readonly TemplateInfo[] = [
  {
    id: 'portfolio',
    name: 'Personal portfolio',
    description: 'Show your work, tell your story and let people reach you.',
  },
  {
    id: 'landing',
    name: 'Small business or link page',
    description: 'One clear page for your business, or all your links in one place.',
  },
];
