import { MAX_SITE_CODE_BYTES, utf8Length, type SiteCode } from '@klinth/core';
import { useId, useState } from 'react';
import { useEditor } from '../state/store.ts';
import { Icon } from '../ui/Icon.tsx';

type CodeKey = keyof SiteCode;

const TOO_LONG = 'Keep custom code under 200 KB. Remove some and try again.';

const sizeText = (bytes: number): string =>
  bytes < 1000 ? `${bytes} bytes` : `${Math.round(bytes / 100) / 10} KB`;

/**
 * Site-wide custom CSS (in every page's head) and JavaScript (at the end of
 * every page). Exported as css/custom.css and js/custom.js; in the editor it
 * only runs inside the sandboxed preview frame.
 */
export function SiteCodePanel() {
  const code = useEditor((s) => s.project?.siteCode);
  const change = useEditor((s) => s.change);
  const id = useId();
  const [problem, setProblem] = useState<string | null>(null);

  const set = (key: CodeKey, value: string) => {
    if (utf8Length(value) > MAX_SITE_CODE_BYTES) {
      setProblem(TOO_LONG);
      return;
    }
    const error = change(
      (p) => ({ ...p, siteCode: { css: '', js: '', ...p.siteCode, [key]: value } }),
      `siteCode.${key}`,
    );
    setProblem(error);
  };

  return (
    <section className="space-y-3" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="text-sm font-semibold">
        Custom code for every page
      </h3>
      <div
        id={`${id}-notice`}
        className="flex gap-2 rounded-lg border border-accent/40 bg-accent-wash px-3 py-2 text-xs leading-relaxed"
      >
        <Icon name="warn" className="mt-0.5 size-4 shrink-0 text-accent" />
        <p>
          <strong className="font-semibold">
            This code runs on your published site. Only paste code you trust.
          </strong>{' '}
          In the editor it runs in a closed box, so it cannot touch Klinth or your saved work.
        </p>
      </div>
      <CodeBox
        label="Custom CSS (added to every page)"
        help="Styles that change the look of the whole site."
        placeholder="h1 { letter-spacing: -0.02em; }"
        value={code?.css ?? ''}
        notice={`${id}-notice`}
        onChange={(value) => set('css', value)}
      />
      <CodeBox
        label="Custom JavaScript (runs at the end of every page)"
        help="For example a visitor counter or a chat widget's snippet, without the script tags."
        placeholder="console.log('Hello');"
        value={code?.js ?? ''}
        notice={`${id}-notice`}
        onChange={(value) => set('js', value)}
      />
      {problem ? (
        <p role="alert" className="text-xs font-semibold text-[#9a2c0e]">
          {problem}
        </p>
      ) : null}
    </section>
  );
}

function CodeBox(props: {
  label: string;
  help: string;
  placeholder: string;
  value: string;
  notice: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label className="label" htmlFor={id}>
        {props.label}
      </label>
      <textarea
        id={id}
        className="input min-h-32 resize-y font-mono text-xs leading-relaxed"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        value={props.value}
        placeholder={props.placeholder}
        aria-describedby={`${props.notice} ${id}-help`}
        onChange={(e) => props.onChange(e.target.value)}
      />
      <p id={`${id}-help`} className="help">
        {sizeText(utf8Length(props.value))} of 200 KB. {props.help}
      </p>
    </div>
  );
}
