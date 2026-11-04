import { MAX_PAGES, addPage, deletePage, movePage, renamePage, type Project } from '@klinth/core';
import { useState, type FormEvent } from 'react';
import { useEditor } from '../state/store.ts';
import { Icon } from '../ui/Icon.tsx';

/** Runs a page edit through the store; core refusals come back as plain messages. */
function usePageChange() {
  const change = useEditor((s) => s.change);
  const notify = useEditor((s) => s.notify);
  return (recipe: (p: Project) => Project, done?: string): boolean => {
    let problem: string | null;
    try {
      problem = change(recipe);
    } catch (error) {
      problem = error instanceof Error ? error.message : 'That change is not allowed.';
    }
    if (problem) notify(problem);
    else if (done) notify(done, true);
    return problem === null;
  };
}

/** The page list above the sections: switch, add, rename, reorder and delete pages. */
export function PagesPanel() {
  const pages = useEditor((s) => s.project?.pages);
  const menuOn = useEditor((s) => s.project?.meta.pageMenu !== false);
  const pageIndex = useEditor((s) => s.pageIndex);
  const setPage = useEditor((s) => s.setPage);
  const run = usePageChange();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<number | null>(null);
  if (!pages) return null;
  const full = pages.length >= MAX_PAGES;

  const add = (title: string) => {
    let index = -1;
    const ok = run((p) => {
      const result = addPage(p, title);
      index = result.index;
      return result.project;
    });
    if (ok) {
      setPage(index);
      setAdding(false);
    }
  };

  return (
    <nav
      aria-label="Pages"
      className="flex min-h-0 flex-col border-r border-b border-line bg-panel"
    >
      <div className="flex h-11 shrink-0 items-center justify-between px-4">
        <h2 className="text-sm font-semibold">Pages</h2>
        <span className="text-xs text-ink-soft" title={`Up to ${MAX_PAGES} pages`}>
          {pages.length} of {MAX_PAGES}
        </span>
      </div>
      <ul className="max-h-44 space-y-0.5 overflow-y-auto px-2" role="list">
        {pages.map((page, i) => (
          <li
            key={page.slug || '(home)'}
            className={`group flex items-center gap-1 rounded-lg pr-1 pl-2 ${
              i === pageIndex ? 'bg-accent-wash' : 'hover:bg-sunk'
            }`}
          >
            {renaming === i ? (
              <PageNameForm
                label={`New name for ${page.title}`}
                initial={page.title}
                submit="Save"
                onCancel={() => setRenaming(null)}
                onSubmit={(title) => {
                  if (run((p) => renamePage(p, i, title))) setRenaming(null);
                }}
              />
            ) : (
              <>
                <button
                  type="button"
                  className="min-w-0 flex-1 py-1.5 text-left"
                  aria-current={i === pageIndex ? 'page' : undefined}
                  onClick={() => setPage(i)}
                >
                  <span className="block truncate text-sm font-medium">{page.title}</span>
                  <span className="block truncate text-xs text-ink-soft">
                    {page.slug === '' ? 'Home page' : `${page.slug}.html`}
                  </span>
                </button>
                <span className="flex shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    className="icon-btn size-7"
                    aria-label={`Rename ${page.title}`}
                    onClick={() => setRenaming(i)}
                  >
                    <Icon name="edit" className="size-3.5" />
                  </button>
                  {i > 0 ? (
                    <>
                      <button
                        type="button"
                        className="icon-btn size-7"
                        aria-label={`Move ${page.title} up`}
                        disabled={i === 1}
                        onClick={() => {
                          if (run((p) => movePage(p, i, -1)) && pageIndex === i) setPage(i - 1);
                        }}
                      >
                        <Icon name="up" className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn size-7"
                        aria-label={`Move ${page.title} down`}
                        disabled={i === pages.length - 1}
                        onClick={() => {
                          if (run((p) => movePage(p, i, 1)) && pageIndex === i) setPage(i + 1);
                        }}
                      >
                        <Icon name="down" className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="icon-btn size-7 hover:text-danger"
                        aria-label={`Delete ${page.title}`}
                        onClick={() => {
                          if (run((p) => deletePage(p, i), `“${page.title}” page deleted.`)) {
                            setPage(pageIndex >= i ? pageIndex - 1 : pageIndex);
                          }
                        }}
                      >
                        <Icon name="trash" className="size-3.5" />
                      </button>
                    </>
                  ) : null}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="space-y-2 p-2">
        {adding ? (
          <PageNameForm
            label="New page name"
            initial=""
            submit="Add"
            onCancel={() => setAdding(false)}
            onSubmit={add}
          />
        ) : (
          <button
            type="button"
            className="btn btn-line w-full"
            disabled={full}
            title={full ? `A site can have up to ${MAX_PAGES} pages.` : undefined}
            onClick={() => setAdding(true)}
          >
            <Icon name="plus" />
            Add a page
          </button>
        )}
        {pages.length > 1 ? (
          <label className="flex items-center gap-2 px-1 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={menuOn}
              onChange={(e) =>
                run((p) => ({ ...p, meta: { ...p.meta, pageMenu: e.target.checked } }))
              }
            />
            Show a menu of all pages at the top
          </label>
        ) : null}
      </div>
    </nav>
  );
}

function PageNameForm(props: {
  label: string;
  initial: string;
  submit: string;
  onSubmit: (title: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(props.initial);
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    props.onSubmit(value);
  };
  return (
    <form className="flex w-full items-center gap-1 py-1" onSubmit={onSubmit}>
      <input
        aria-label={props.label}
        className="input h-8 min-h-8 min-w-0 flex-1 text-sm"
        value={value}
        maxLength={120}
        placeholder="For example: About me"
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') props.onCancel();
        }}
      />
      <button type="submit" className="btn btn-primary h-8 min-h-8 px-2 text-xs">
        {props.submit}
      </button>
    </form>
  );
}
