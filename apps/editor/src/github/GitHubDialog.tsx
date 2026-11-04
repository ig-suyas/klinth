import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { exportFiles } from '../lib/files.ts';
import { loadAssets } from '../lib/storage.ts';
import { useEditor } from '../state/store.ts';
import { Icon } from '../ui/Icon.tsx';
import {
  GitHubError,
  getLogin,
  publish,
  suggestRepoName,
  validRepoName,
  type PublishResult,
  type PublishStep,
} from './api.ts';
import {
  connectGitHub,
  hasScope,
  loadClientId,
  neededScope,
  prepareSignIn,
  useGitHub,
  type PendingSignIn,
} from './oauth.ts';

/** The repository a project was last published to (a name, not a secret). */
const repoKey = (projectId: string) => `klinth:github-repo:${projectId}`;

function savedRepo(projectId: string | null): string | null {
  if (!projectId) return null;
  try {
    return localStorage.getItem(repoKey(projectId));
  } catch {
    return null;
  }
}

function rememberRepo(projectId: string, name: string): void {
  try {
    localStorage.setItem(repoKey(projectId), name);
  } catch {
    // Storage blocked: the name is just not suggested next time.
  }
}

export function GitHubDialog() {
  const open = useGitHub((s) => s.dialogOpen);
  return <AnimatePresence>{open ? <PublishDialog key="github" /> : null}</AnimatePresence>;
}

type Phase = 'form' | 'working' | 'done';
type Step = 'connect' | 'files' | PublishStep;

const STEPS: { id: Step; text: string }[] = [
  { id: 'connect', text: 'Connecting to GitHub' },
  { id: 'files', text: 'Preparing your site' },
  { id: 'repo', text: 'Opening the repository' },
  { id: 'upload', text: 'Uploading pictures and videos' },
  { id: 'save', text: 'Saving your files' },
  { id: 'check', text: 'Checking every file arrived' },
  { id: 'pages', text: 'Turning on GitHub Pages' },
];

function PublishDialog() {
  const reduce = useReducedMotion();
  const dialog = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const projectId = useEditor((s) => s.projectId);
  const title = useEditor((s) => s.project?.meta.title ?? '');
  const session = useGitHub((s) => s.session);
  const previous = savedRepo(projectId);

  const [clientId, setClientId] = useState<string | null | undefined>(undefined);
  const [pending, setPending] = useState<PendingSignIn | null>(null);
  const [name, setName] = useState(previous ?? suggestRepoName(title));
  const [mode, setMode] = useState<'create' | 'update'>(previous ? 'update' : 'create');
  const [isPrivate, setPrivate] = useState(false);
  const [pages, setPages] = useState(true);
  const [phase, setPhase] = useState<Phase>('form');
  const [step, setStep] = useState<Step>('connect');
  const [count, setCount] = useState<[number, number] | null>(null);
  const [error, setError] = useState<GitHubError | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);

  const close = () => {
    abort.current?.abort();
    useGitHub.getState().openDialog(false);
  };

  useEffect(() => {
    void loadClientId().then(setClientId);
    void prepareSignIn().then(setPending);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      abort.current?.abort();
      opener?.focus();
    };
  }, []);

  const nameOk = validRepoName(name);
  const wantPages = pages && !isPrivate;
  const scope = neededScope({ private: isPrivate, pages: wantPages });
  const needsSignIn = !hasScope(session, scope);
  const ready = nameOk && Boolean(clientId) && (!needsSignIn || pending !== null);

  const start = () => {
    if (!ready || !clientId || !projectId) return;
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setPhase('working');
    setStep('connect');
    setCount(null);
    // Opens GitHub's window right now, inside the click (pop-up blockers).
    const signIn =
      needsSignIn && pending ? connectGitHub(clientId, pending, scope, controller.signal) : null;

    void (async () => {
      try {
        let current = useGitHub.getState().session;
        if (signIn) {
          const { token, scopes } = await signIn;
          current = { token, scopes, login: await getLogin({ token }) };
          useGitHub.getState().setSession(current);
          setPending(await prepareSignIn());
        }
        if (!current) throw new GitHubError('signed_out', 'Please connect GitHub first.');
        setStep('files');
        const { project } = useEditor.getState();
        if (!project) return;
        const files = await exportFiles(project, await loadAssets(projectId));
        const client = { token: current.token, signal: controller.signal };
        const published = await publish(client, files, {
          login: current.login,
          name,
          mode,
          private: isPrivate,
          pages: wantPages,
          description: project.meta.description ?? '',
          onProgress: (next, done, total) => {
            if (controller.signal.aborted) return;
            setStep(next);
            setCount(total ? [done ?? 0, total] : null);
          },
        });
        if (controller.signal.aborted) return;
        rememberRepo(projectId, name);
        setResult(published);
        setPhase('done');
      } catch (caught) {
        if (controller.signal.aborted) return;
        const problem =
          caught instanceof GitHubError
            ? caught
            : new GitHubError(
                'failed',
                caught instanceof Error ? caught.message : 'Something went wrong.',
              );
        if (problem.kind === 'signed_out') useGitHub.getState().setSession(null);
        if (signIn) void prepareSignIn().then(setPending);
        setError(problem);
        setPhase('form');
      }
    })();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/30 p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && phase !== 'working') close();
      }}
    >
      <motion.div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-title"
        tabIndex={-1}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: reduce ? 0 : 6 }}
        transition={{ duration: 0.2, ease: [0.2, 0.7, 0.2, 1] }}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-line bg-panel p-6 shadow-[0_24px_60px_-20px_rgba(29,27,24,.45)] outline-none"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Put your site online</p>
            <h2 id="github-title" className="mt-1 flex items-center gap-2 font-display text-2xl">
              <Icon name="globe" className="size-5 text-accent" />
              Publish to GitHub
            </h2>
            <p className="help">
              Klinth saves your finished site in a GitHub repository. The files are exactly the ones
              in the ZIP download.
            </p>
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
            <Icon name="close" />
          </button>
        </div>

        {clientId === null ? (
          <p className="rounded-lg bg-sunk px-3 py-2.5 text-sm leading-relaxed">
            Publishing to GitHub is not set up yet. You can download the ZIP instead and upload it
            to GitHub yourself: the README inside explains how.
          </p>
        ) : phase === 'done' && result ? (
          <Done result={result} pages={wantPages} onClose={close} />
        ) : phase === 'working' ? (
          <Progress
            step={step}
            count={count}
            skipConnect={!needsSignIn}
            pages={wantPages}
            onStop={() => {
              abort.current?.abort();
              setPhase('form');
            }}
          />
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              start();
            }}
          >
            <ConnectedAs />
            <div>
              <label className="label" htmlFor="github-repo">
                Repository name
              </label>
              <input
                id="github-repo"
                className="input"
                value={name}
                maxLength={100}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={!nameOk}
                aria-describedby="github-repo-help"
                onChange={(e) => setName(e.target.value.replace(/\s+/g, '-'))}
              />
              <p id="github-repo-help" className={nameOk ? 'help' : 'error-text'}>
                {nameOk
                  ? 'Letters, numbers, dots, dashes and underscores.'
                  : 'Use letters, numbers, dots, dashes and underscores only.'}
              </p>
            </div>

            <fieldset className="space-y-2">
              <legend className="label">This repository is</legend>
              <Radio
                checked={mode === 'create'}
                onChange={() => setMode('create')}
                title="New"
                text="Klinth makes a new repository with this name."
              />
              <Radio
                checked={mode === 'update'}
                onChange={() => setMode('update')}
                title="One I published before"
                text="Your site there is replaced with this version."
              />
            </fieldset>

            <div className="space-y-2">
              <Check
                checked={wantPages}
                disabled={isPrivate}
                onChange={setPages}
                title="Turn on GitHub Pages (a free web address)"
                text={
                  isPrivate
                    ? 'GitHub Pages for private repositories needs a paid GitHub plan.'
                    : 'Your site goes live at yourname.github.io/' + (name || 'repository') + '.'
                }
              />
              {mode === 'create' ? (
                <Check
                  checked={isPrivate}
                  onChange={setPrivate}
                  title="Make the repository private"
                  text="Only you can see the files. The site itself can still be public."
                />
              ) : null}
              <p className="help">
                {scope === 'repo'
                  ? 'GitHub will ask to let Klinth manage your repositories. This is needed to turn on Pages or make private repositories. Klinth only touches the one you name here.'
                  : 'GitHub will ask to let Klinth manage your public repositories. Klinth only touches the one you name here.'}
              </p>
            </div>

            {error ? (
              <div role="alert" className="rounded-lg border border-danger/30 bg-[#fdecea] p-3">
                <p className="text-sm text-danger">{error.message}</p>
                {error.kind === 'name_taken' ? (
                  <button
                    type="button"
                    className="btn btn-line mt-2 h-8 min-h-8 px-2 text-xs"
                    onClick={() => {
                      setMode('update');
                      setError(null);
                    }}
                  >
                    Update that repository instead
                  </button>
                ) : null}
              </div>
            ) : null}

            <button
              type="submit"
              className="btn btn-primary w-full justify-center"
              disabled={!ready}
            >
              <Icon name="globe" />
              {needsSignIn ? 'Connect GitHub and publish' : 'Publish'}
            </button>
            <p className="text-xs leading-relaxed text-ink-soft">
              Klinth keeps your GitHub access only while this tab is open. It is never saved. You
              can remove Klinth’s access any time on GitHub under Settings, then Applications.
            </p>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}

function ConnectedAs() {
  const session = useGitHub((s) => s.session);
  if (!session) return null;
  return (
    <p className="flex items-center justify-between gap-2 rounded-lg bg-sunk px-3 py-2 text-sm">
      <span>
        Connected as <strong>{session.login}</strong>
      </span>
      <button
        type="button"
        className="text-xs font-medium underline underline-offset-2"
        onClick={() => useGitHub.getState().setSession(null)}
      >
        Disconnect
      </button>
    </p>
  );
}

function Radio(props: { checked: boolean; onChange: () => void; title: string; text: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="radio"
        name="github-mode"
        className="mt-0.5 accent-[var(--color-accent)]"
        checked={props.checked}
        onChange={props.onChange}
      />
      <span>
        {props.title}
        <span className="block text-xs text-ink-soft">{props.text}</span>
      </span>
    </label>
  );
}

function Check(props: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  text: string;
}) {
  return (
    <label className={`flex items-start gap-2 text-sm ${props.disabled ? 'opacity-60' : ''}`}>
      <input
        type="checkbox"
        className="mt-0.5 accent-[var(--color-accent)]"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span>
        {props.title}
        <span className="block text-xs text-ink-soft">{props.text}</span>
      </span>
    </label>
  );
}

function Progress(props: {
  step: Step;
  count: [number, number] | null;
  skipConnect: boolean;
  pages: boolean;
  onStop: () => void;
}) {
  const steps = STEPS.filter(
    (s) => !(s.id === 'connect' && props.skipConnect) && !(s.id === 'pages' && !props.pages),
  );
  const at = steps.findIndex((s) => s.id === props.step);
  return (
    <div>
      <ol className="space-y-2" aria-label="Publishing" data-github-step={props.step}>
        {steps.map((s, i) => (
          <li
            key={s.id}
            className={`flex items-center gap-2 text-sm ${i > at ? 'text-ink-soft' : ''}`}
            aria-current={i === at ? 'step' : undefined}
          >
            {i < at ? (
              <Icon name="check" className="size-4 text-ok" />
            ) : i === at ? (
              <span
                className="mx-[5px] size-1.5 rounded-full bg-accent motion-safe:animate-pulse"
                aria-hidden="true"
              />
            ) : (
              <span className="mx-[5px] size-1.5 rounded-full bg-line-strong" aria-hidden="true" />
            )}
            {s.text}
            {i === at && s.id === 'upload' && props.count
              ? ` (${props.count[0]} of ${props.count[1]})`
              : ''}
          </li>
        ))}
      </ol>
      <p role="status" className="sr-only">
        {steps[at]?.text}
      </p>
      {props.step === 'connect' ? (
        <p className="help mt-3">Finish signing in to GitHub in the window that opened.</p>
      ) : null}
      <button type="button" className="btn btn-line mt-5" onClick={props.onStop}>
        Stop
      </button>
    </div>
  );
}

function Done({
  result,
  pages,
  onClose,
}: {
  result: PublishResult;
  pages: boolean;
  onClose: () => void;
}) {
  return (
    <div role="status" className="space-y-4">
      <p className="flex items-center gap-2 font-display text-xl">
        <Icon name="check" className="size-5 text-ok" />
        {result.changed ? 'Your site is on GitHub.' : 'GitHub already has this version.'}
      </p>
      <ul className="space-y-2 text-sm">
        <li>
          <a
            className="inline-flex items-center gap-1.5 font-medium underline underline-offset-2"
            href={result.repoUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the repository {result.fullName}
            <Icon name="external" className="size-3.5" />
          </a>
        </li>
        {result.pagesUrl ? (
          <li>
            <a
              className="inline-flex items-center gap-1.5 font-medium underline underline-offset-2"
              href={result.pagesUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open your live site
              <Icon name="external" className="size-3.5" />
            </a>
            <span className="block text-xs text-ink-soft">
              The first time, it can take a minute or two to appear.
            </span>
          </li>
        ) : null}
      </ul>
      {pages && result.pagesProblem ? (
        <p className="rounded-lg bg-sunk px-3 py-2.5 text-sm leading-relaxed">
          {result.pagesProblem}
        </p>
      ) : null}
      <p className="help">
        To change your site later, edit it here and publish again to the same repository.
      </p>
      <button type="button" className="btn btn-primary" onClick={onClose}>
        Done
      </button>
    </div>
  );
}
