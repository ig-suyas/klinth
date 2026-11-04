import {
  MAX_NAV_LABEL,
  MAX_NAV_LINKS,
  automaticNavLinks,
  navLinkProblems,
  removeBrokenNavLinks,
  type Project,
} from '@klinth/core';
import { useId, useState } from 'react';
import {
  addNavLink,
  automaticLinks,
  customizeNavLinks,
  decodeTarget,
  encodeTarget,
  moveNavLink,
  navTargetOptions,
  removeNavLink,
  setNavLabel,
  setNavTarget,
  type TargetOption,
} from '../state/header.ts';
import { useEditor } from '../state/store.ts';
import { Icon } from '../ui/Icon.tsx';

/** Options grouped by page, for a `<select>`. */
function TargetOptions({ options }: { options: TargetOption[] }) {
  const groups = [...new Set(options.map((o) => o.group))];
  return groups.map((group) => (
    <optgroup key={group} label={group}>
      {options
        .filter((o) => o.group === group)
        .map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
    </optgroup>
  ));
}

/**
 * Header links: each goes to a page or to a section, picked from a list
 * (nothing to type but the label). Without a choice the header shows its
 * automatic links; "Choose links myself" turns them into this list.
 */
export function NavLinksPanel() {
  const project = useEditor((s) => s.project);
  const change = useEditor((s) => s.change);
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();
  if (!project) return null;
  const links = project.meta.navLinks;
  const options = navTargetOptions(project);
  const broken = navLinkProblems(project);
  const run = (recipe: (p: Project) => Project, key?: string) => setProblem(change(recipe, key));

  return (
    <fieldset className="space-y-3 rounded-lg border border-line p-3" aria-labelledby={`${id}-l`}>
      <legend id={`${id}-l`} className="px-1 text-[0.8125rem] font-semibold">
        Header links
      </legend>
      {links === undefined ? (
        <>
          <p className="help -mt-1">
            {automaticNavLinks(project).length
              ? `Automatic: ${automaticNavLinks(project)
                  .map((l) => l.label)
                  .join(', ')}.`
              : 'No links yet.'}
          </p>
          <button
            type="button"
            className="btn btn-line w-full"
            onClick={() => run(customizeNavLinks)}
          >
            Choose links myself
          </button>
        </>
      ) : (
        <>
          <p className="help -mt-1">Each link goes to a page or to a section of a page.</p>
          {broken.length ? (
            <div
              role="status"
              className="rounded-lg border border-[#e6c9a8] bg-[#fdf4e7] p-3 text-xs leading-relaxed"
            >
              <p className="flex items-center gap-1.5 font-semibold">
                <Icon name="warn" className="size-4 text-accent-strong" />
                Some links lead nowhere
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
                {broken.map((b) => (
                  <li key={b.index}>{b.message} It is hidden on your site.</li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-line mt-2 min-h-8 px-2.5 text-xs"
                onClick={() => run(removeBrokenNavLinks)}
              >
                Remove {broken.length === 1 ? 'it' : 'them'}
              </button>
            </div>
          ) : null}
          <ol className="space-y-2" role="list">
            {links.map((link, i) => {
              const value = encodeTarget(link.target);
              const known = options.some((o) => o.value === value);
              return (
                <li key={i} className="space-y-1.5 rounded-lg bg-sunk p-2">
                  <div className="flex items-center gap-1">
                    <label className="sr-only" htmlFor={`${id}-label-${i}`}>
                      Link {i + 1} text
                    </label>
                    <input
                      id={`${id}-label-${i}`}
                      className="input min-w-0 flex-1"
                      value={link.label}
                      maxLength={MAX_NAV_LABEL}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[\r\n]+/g, ' ');
                        if (v.trim()) run((p) => setNavLabel(p, i, v), `nav.${i}.label`);
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-quiet size-8 min-h-8 p-0"
                      aria-label={`Move “${link.label}” up`}
                      disabled={i === 0}
                      onClick={() => run((p) => moveNavLink(p, i, -1))}
                    >
                      <Icon name="up" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet size-8 min-h-8 p-0"
                      aria-label={`Move “${link.label}” down`}
                      disabled={i === links.length - 1}
                      onClick={() => run((p) => moveNavLink(p, i, 1))}
                    >
                      <Icon name="down" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet size-8 min-h-8 p-0 hover:text-danger"
                      aria-label={`Remove link “${link.label}”`}
                      onClick={() => run((p) => removeNavLink(p, i))}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                  <label className="sr-only" htmlFor={`${id}-to-${i}`}>
                    Link {i + 1} goes to
                  </label>
                  <select
                    id={`${id}-to-${i}`}
                    className="input"
                    value={known ? value : ''}
                    onChange={(e) => {
                      const target = decodeTarget(e.target.value);
                      if (target) run((p) => setNavTarget(p, i, target));
                    }}
                  >
                    {known ? null : (
                      <option value="" disabled>
                        Deleted, pick another
                      </option>
                    )}
                    <TargetOptions options={options} />
                  </select>
                </li>
              );
            })}
          </ol>
          <AddLink
            options={options}
            full={links.length >= MAX_NAV_LINKS}
            onAdd={(value) => {
              const target = decodeTarget(value);
              if (target) run((p) => addNavLink(p, target));
            }}
          />
          <button
            type="button"
            className="text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-ink"
            onClick={() => run(automaticLinks)}
          >
            Use automatic links instead
          </button>
        </>
      )}
      {problem ? (
        <p role="alert" className="error-text">
          {problem}
        </p>
      ) : null}
    </fieldset>
  );
}

function AddLink(props: {
  options: TargetOption[];
  full: boolean;
  onAdd: (value: string) => void;
}) {
  const id = useId();
  if (props.full) return <p className="help">A header can have up to {MAX_NAV_LINKS} links.</p>;
  return (
    <div>
      <label className="label" htmlFor={id}>
        Add a link to
      </label>
      <select
        id={id}
        className="input"
        value=""
        onChange={(e) => {
          if (e.target.value) props.onAdd(e.target.value);
        }}
      >
        <option value="">Pick a page or section…</option>
        <TargetOptions options={props.options} />
      </select>
    </div>
  );
}
