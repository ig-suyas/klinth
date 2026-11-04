import {
  MAX_CUSTOM_CODE,
  PROVIDER_NAME,
  formatBytes,
  looksLikeEmbedCode,
  parseVideoUrl,
} from '@klinth/core';
import { useId, useState } from 'react';
import { useAssetUrl, useLibrary } from '../media/files.ts';
import { useEditor } from '../state/store.ts';
import { Icon } from '../ui/Icon.tsx';
import { asText, type FieldProps } from './Fields.tsx';
import { maxLength, propSchema, type FieldSpec } from './fields.ts';

type Spec<K extends FieldSpec['kind']> = Extract<FieldSpec, { kind: K }>;

function useAsset(id: string) {
  return useEditor((s) => (id ? s.project?.assets.find((a) => a.id === id) : undefined));
}

/** A picture from the project's files, with its description for screen readers. */
export function ImageField({
  spec,
  blockType,
  path,
  item,
  onPatch,
}: FieldProps & { spec: Spec<'image'> }) {
  const altId = useId();
  const openLibrary = useLibrary((s) => s.open);
  const id = asText(item[spec.key]);
  const asset = useAsset(id);
  const url = useAssetUrl(asset ? id : undefined);
  const alt = asText(item[spec.altKey]);
  const altPath = [...path.slice(0, -1), spec.altKey];
  const choose = () =>
    openLibrary({
      mode: 'pick',
      kind: 'image',
      onPick: (picked, isNew) => onPatch({ [spec.key]: picked.id }, isNew ? picked : undefined),
    });

  return (
    <fieldset className="space-y-3">
      <legend className="label">{spec.label}</legend>
      {asset ? (
        <div className="flex items-center gap-3 rounded-lg border border-line p-2">
          <div className="size-16 shrink-0 overflow-hidden rounded-md bg-sunk">
            {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={asset.name}>
              {asset.name}
            </p>
            <p className="text-xs text-ink-soft">{formatBytes(asset.size)}</p>
            <div className="mt-1 flex gap-1">
              <button type="button" className="btn btn-line min-h-7 px-2 text-xs" onClick={choose}>
                Change
              </button>
              <button
                type="button"
                className="btn btn-quiet min-h-7 px-2 text-xs hover:text-danger"
                onClick={() => onPatch({ [spec.key]: undefined, [spec.altKey]: undefined })}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-4 text-sm font-medium text-ink-soft hover:border-accent hover:text-ink"
          onClick={choose}
        >
          <Icon name="upload" />
          Choose a picture
        </button>
      )}
      {asset ? (
        <div>
          <label className="label" htmlFor={altId}>
            Describe the picture
          </label>
          <input
            id={altId}
            className="input"
            value={alt}
            maxLength={maxLength(propSchema(blockType, altPath))}
            aria-describedby={`${altId}-help`}
            onChange={(e) => onPatch({ [spec.altKey]: e.target.value.replace(/[\r\n]+/g, ' ') })}
          />
          {alt.trim() ? (
            <p id={`${altId}-help`} className="help">
              Read aloud to people who cannot see the picture.
            </p>
          ) : (
            <p id={`${altId}-help`} className="help text-accent-strong">
              Add a few words, for example “Asha smiling at her desk”, so everyone can enjoy it.
            </p>
          )}
        </div>
      ) : null}
    </fieldset>
  );
}

const LINK_HELP =
  'Paste the address of a YouTube or Vimeo video, for example https://youtu.be/… or https://vimeo.com/…';

/** Checks a pasted video link. Returns a plain problem, or null when it can be used. */
export function videoLinkProblem(value: string): string | null {
  if (looksLikeEmbedCode(value)) {
    return 'That is embed code. Paste the video’s address instead (copy it from your browser’s address bar or the Share button).';
  }
  if (parseVideoUrl(value) === null) return 'Use a link to a YouTube or Vimeo video.';
  return null;
}

/** A video: a YouTube/Vimeo link, or a file the user uploads. Setting one clears the other. */
export function VideoField({ spec, item, onPatch }: FieldProps & { spec: Spec<'video'> }) {
  const linkId = useId();
  const openLibrary = useLibrary((s) => s.open);
  const link = asText(item[spec.linkKey]);
  const fileId = asText(item[spec.key]);
  const asset = useAsset(fileId);
  const [mode, setMode] = useState<'link' | 'file'>(fileId && !link ? 'file' : 'link');
  const [draft, setDraft] = useState(link);
  const [seen, setSeen] = useState(link);
  if (link !== seen) {
    setSeen(link);
    setDraft(link);
  }
  const problem = draft.trim() ? videoLinkProblem(draft) : null;
  const parsed = draft.trim() && !problem ? parseVideoUrl(draft) : null;

  return (
    <fieldset className="space-y-3">
      <legend className="label">{spec.label}</legend>
      <div
        className="flex gap-1 rounded-lg bg-sunk p-1"
        role="radiogroup"
        aria-label="Video source"
      >
        {(
          [
            ['link', 'YouTube or Vimeo'],
            ['file', 'Upload a file'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => setMode(value)}
            className="min-h-8 flex-1 rounded-md px-2 text-[0.8125rem] font-medium text-ink-soft aria-checked:bg-panel aria-checked:text-ink aria-checked:shadow-[0_1px_2px_rgba(29,27,24,.12)]"
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'link' ? (
        <div>
          <label className="label" htmlFor={linkId}>
            Video link
          </label>
          <input
            id={linkId}
            className="input"
            inputMode="url"
            spellCheck={false}
            value={draft}
            placeholder="https://youtu.be/…"
            aria-invalid={problem !== null}
            aria-describedby={`${linkId}-help`}
            onChange={(e) => {
              const value = e.target.value;
              setDraft(value);
              if (!value.trim()) onPatch({ [spec.linkKey]: undefined });
              else if (!videoLinkProblem(value)) {
                onPatch({ [spec.linkKey]: value.trim(), [spec.key]: undefined });
              }
            }}
          />
          {problem ? (
            <p id={`${linkId}-help`} className="error-text" role="alert">
              {problem}
            </p>
          ) : (
            <p id={`${linkId}-help`} className="help">
              {parsed
                ? `${PROVIDER_NAME[parsed.provider]} video found. It loads only when a visitor presses play, so your site stays fast.`
                : LINK_HELP}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {asset ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{asset.name}</p>
                <p className="text-xs text-ink-soft">{formatBytes(asset.size)}</p>
              </div>
              <button
                type="button"
                className="btn btn-quiet min-h-7 px-2 text-xs hover:text-danger"
                onClick={() => onPatch({ [spec.key]: undefined })}
              >
                Remove
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className="btn btn-line w-full"
            onClick={() =>
              openLibrary({
                mode: 'pick',
                kind: 'video',
                onPick: (picked, isNew) =>
                  onPatch(
                    { [spec.key]: picked.id, [spec.linkKey]: undefined },
                    isNew ? picked : undefined,
                  ),
              })
            }
          >
            <Icon name="upload" />
            {asset ? 'Choose another video' : 'Choose a video'}
          </button>
          <p className="help">
            MP4 or WebM, up to 25 MB. For longer videos, use a YouTube or Vimeo link instead.
          </p>
        </div>
      )}
    </fieldset>
  );
}

/** Pasted HTML, CSS and JavaScript, with the trust notice. */
export function CodeField({ spec, value, onChange }: FieldProps & { spec: Spec<'code'> }) {
  const id = useId();
  const code = asText(value);
  const size = new TextEncoder().encode(code).byteLength;
  return (
    <div className="space-y-3">
      <div
        className="flex gap-2 rounded-lg border border-accent/40 bg-accent-wash px-3 py-2 text-xs leading-relaxed"
        id={`${id}-notice`}
      >
        <Icon name="warn" className="mt-0.5 size-4 shrink-0 text-accent" />
        <p>
          <strong className="font-semibold">
            This code runs on your published site. Only paste code you trust.
          </strong>{' '}
          In the editor it runs in a closed box, so it cannot touch Klinth or your saved work.
        </p>
      </div>
      <div>
        <label className="label" htmlFor={id}>
          {spec.label}
        </label>
        <textarea
          id={id}
          className="input min-h-56 resize-y font-mono text-xs leading-relaxed"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          value={code}
          maxLength={MAX_CUSTOM_CODE}
          placeholder="<div>Paste HTML, CSS and JavaScript here</div>"
          aria-describedby={`${id}-notice ${id}-help`}
          onChange={(e) => onChange(e.target.value)}
        />
        <p id={`${id}-help`} className="help">
          {formatBytes(size)} of about 200 KB. Great for effects and widgets from other services.
        </p>
      </div>
    </div>
  );
}
