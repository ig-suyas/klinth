import type { Project } from '@klinth/core';

/**
 * Settings for a project the owner just started (from a template or Blank):
 * "Back to top" starts off. Projects that already say on or off keep it.
 */
export function newProjectDefaults(project: Project): Project {
  if (project.meta.backToTop !== undefined) return project;
  return { ...project, meta: { ...project.meta, backToTop: false } };
}

/** Shows (or hides) the footer's "Back to top" link on every page. */
export function setBackToTop(project: Project, shown: boolean): Project {
  const meta = { ...project.meta };
  if (shown) delete meta.backToTop;
  else meta.backToTop = false;
  return { ...project, meta };
}

/** Hides (or shows again) the footer's "Back to top" link on one page. */
export function setPageBackToTopHidden(project: Project, index: number, hidden: boolean): Project {
  return {
    ...project,
    pages: project.pages.map((page, i) => {
      if (i !== index) return page;
      const next = { ...page };
      if (hidden) next.hideBackToTop = true;
      else delete next.hideBackToTop;
      return next;
    }),
  };
}
