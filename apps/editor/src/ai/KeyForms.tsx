import { useId, useState, type FormEvent } from 'react';
import { Icon } from '../ui/Icon.tsx';
import { AiError, testKey } from './api.ts';
import { useAi } from './store.ts';
import { MIN_PASSPHRASE, VaultError, openVault, readVault, sealKey, writeVault } from './vault.ts';

const GET_KEY_URL = 'https://aistudio.google.com/apikey';

const messageOf = (error: unknown, fallback: string) =>
  error instanceof AiError || error instanceof VaultError ? error.message : fallback;

/** What the vault does and does not protect against. Shown wherever the key is handled. */
export function HonestNote() {
  return (
    <p className="help">
      Your key stays in this browser and is sent only to Klinth’s AI helper, which passes it to
      Google and never stores it. The passphrase lock protects against someone looking at this
      browser’s saved data. It cannot protect against harmful code running on this page while your
      key is unlocked.
    </p>
  );
}

/** First time: paste a key and (by default) lock it with a passphrase. */
export function AddKeyForm({ compact = false }: { compact?: boolean }) {
  const unlock = useAi((s) => s.unlock);
  const [key, setKey] = useState('');
  const [remember, setRemember] = useState(true);
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!/^[A-Za-z0-9_.-]{20,200}$/.test(trimmed)) {
      setProblem('That does not look like a Gemini key. Copy it again from Google AI Studio.');
      return;
    }
    if (remember && pass.length < MIN_PASSPHRASE) {
      setProblem(`Use a passphrase of at least ${MIN_PASSPHRASE} characters.`);
      return;
    }
    if (remember && pass !== again) {
      setProblem('The two passphrases are not the same.');
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      if (remember) writeVault(await sealKey(trimmed, pass));
      unlock(trimmed, remember);
    } catch (error) {
      setProblem(messageOf(error, 'Your key could not be saved. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)} aria-label="Key setup">
      {compact ? null : (
        <p className="text-sm leading-relaxed text-ink-soft">
          The AI helper uses your own free Gemini key from Google.{' '}
          <a
            className="font-medium text-accent-strong underline underline-offset-2"
            href={GET_KEY_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Get a free key
          </a>
          , then paste it here.
        </p>
      )}
      <div>
        <label className="label" htmlFor={`${id}-key`}>
          Your Gemini key
        </label>
        <input
          id={`${id}-key`}
          className="input font-mono"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        {compact ? (
          <p className="help">
            No key yet?{' '}
            <a className="underline" href={GET_KEY_URL} target="_blank" rel="noopener noreferrer">
              Get one free from Google
            </a>
            .
          </p>
        ) : null}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 accent-[var(--color-accent)]"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        <span>
          Remember my key on this computer, locked with a passphrase
          <span className="block text-xs text-ink-soft">
            Untick to use it only until you close this tab.
          </span>
        </span>
      </label>
      {remember ? (
        <div className="grid gap-3">
          <div>
            <label className="label" htmlFor={`${id}-pass`}>
              Passphrase
            </label>
            <input
              id={`${id}-pass`}
              className="input"
              type="password"
              autoComplete="new-password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
            />
            <p className="help">
              At least {MIN_PASSPHRASE} characters. Klinth never saves it, so it cannot be
              recovered. If you forget it, just add your key again.
            </p>
          </div>
          <div>
            <label className="label" htmlFor={`${id}-again`}>
              Passphrase again
            </label>
            <input
              id={`${id}-again`}
              className="input"
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
            />
          </div>
        </div>
      ) : null}
      {problem ? (
        <p role="alert" className="error-text">
          {problem}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary w-full" disabled={busy}>
        <Icon name="key" />
        {busy ? 'Locking your key…' : 'Save key'}
      </button>
    </form>
  );
}

/** A key is saved but locked: ask for the passphrase. */
export function UnlockForm() {
  const unlock = useAi((s) => s.unlock);
  const forget = useAi((s) => s.forget);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const record = readVault();
    if (!record) {
      forget();
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      unlock(await openVault(record, pass), true);
    } catch (error) {
      setProblem(messageOf(error, 'That passphrase is not right. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="space-y-3" onSubmit={(e) => void submit(e)} aria-label="Unlock saved key">
      <div>
        <label className="label" htmlFor={`${id}-pass`}>
          Passphrase to unlock your key
        </label>
        <input
          id={`${id}-pass`}
          className="input"
          type="password"
          autoComplete="current-password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
        />
      </div>
      {problem ? (
        <p role="alert" className="error-text">
          {problem}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary w-full" disabled={busy || pass.length === 0}>
        <Icon name="lock" />
        {busy ? 'Unlocking…' : 'Unlock'}
      </button>
      <button type="button" className="btn btn-quiet w-full text-xs" onClick={forget}>
        Forgot it? Remove the saved key and add it again
      </button>
    </form>
  );
}

/** The key is unlocked: test, lock, forget, auto-lock. */
export function KeyManager() {
  const key = useAi((s) => s.key);
  const saved = useAi((s) => s.saved);
  const autoLock = useAi((s) => s.autoLock);
  const setAutoLock = useAi((s) => s.setAutoLock);
  const lock = useAi((s) => s.lock);
  const forget = useAi((s) => s.forget);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const test = async () => {
    if (!key) return;
    setBusy(true);
    setStatus(null);
    try {
      await testKey(key);
      setStatus({ ok: true, text: 'Your key works.' });
    } catch (error) {
      setStatus({
        ok: false,
        text: messageOf(error, 'The key could not be checked. Please try again.'),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 rounded-lg bg-sunk px-3 py-2 text-sm">
        <Icon name="check" className="size-4 text-ok" />
        {saved ? 'Your key is unlocked.' : 'Your key is ready for this tab.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-line" disabled={busy} onClick={() => void test()}>
          {busy ? 'Testing…' : 'Test my key'}
        </button>
        {saved ? (
          <button type="button" className="btn btn-line" onClick={lock}>
            <Icon name="lock" />
            Lock now
          </button>
        ) : null}
        <button type="button" className="btn btn-line hover:text-danger" onClick={forget}>
          <Icon name="trash" />
          Forget my key
        </button>
      </div>
      {status ? (
        <p
          role={status.ok ? 'status' : 'alert'}
          className={status.ok ? 'help text-ok' : 'error-text'}
        >
          {status.text}
        </p>
      ) : null}
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 accent-[var(--color-accent)]"
          checked={autoLock}
          onChange={(e) => setAutoLock(e.target.checked)}
        />
        <span>
          Lock my key after 30 minutes without AI use
          <span className="block text-xs text-ink-soft">
            {saved
              ? 'You unlock it again with your passphrase.'
              : 'You paste it again to continue.'}
          </span>
        </span>
      </label>
    </div>
  );
}

/** The right form for the current state. */
export function KeyGate({ compact = false }: { compact?: boolean }) {
  const key = useAi((s) => s.key);
  const saved = useAi((s) => s.saved);
  if (key) return <KeyManager />;
  return saved ? <UnlockForm /> : <AddKeyForm compact={compact} />;
}
