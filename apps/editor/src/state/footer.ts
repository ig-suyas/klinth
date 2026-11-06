import type { Project } from '@klinth/core';

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
