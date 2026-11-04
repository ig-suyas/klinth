import { MULTI_PAGE_NOTE, addHeaderBack, removeHeader } from './header.ts';
import { useEditor } from './store.ts';

/**
 * Removes the site header (one undo step) and says so with an Undo button.
 * Sites with several pages also get a reminder that the header was their menu.
 */
export function removeHeaderNow(): boolean {
  const { change, notify, project } = useEditor.getState();
  if (!project || project.meta.headerEnabled === false) return false;
  const problem = change(removeHeader);
  if (problem) {
    notify(`The header could not be removed: ${problem}`);
    return false;
  }
  const multi = project.pages.length > 1;
  notify(multi ? `Header removed. ${MULTI_PAGE_NOTE}` : 'Header removed.', true);
  return true;
}

/** Puts the site header back with the settings it had. */
export function addHeaderBackNow(): boolean {
  const { change, notify } = useEditor.getState();
  const problem = change(addHeaderBack);
  if (problem) notify(`The header could not be added: ${problem}`);
  return problem === null;
}
