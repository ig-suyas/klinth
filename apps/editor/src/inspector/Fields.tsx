import { pageFile, safeUrl, type Asset, type BlockType } from '@klinth/core';
import { useShallow } from 'zustand/react/shallow';
import { useEditor } from '../state/store.ts';
import { useId, useState } from 'react';
import { z } from 'zod';
import { Icon } from '../ui/Icon.tsx';
import { maxItems, maxLength, propSchema, type FieldSpec } from './fields.ts';
import { CodeField, ImageField, VideoField } from './MediaFields.tsx';

type Value = unknown;
export type Item = Record<string, unknown>;

export interface FieldProps {
  spec: FieldSpec;
  blockType: BlockType;
  /** Path of this field from the block's props, for reading its limits. */
  path: readonly string[];
  value: Value;
  onChange: (value: Value) => void;
  /** The props (or list item) holding this field, for fields that edit several props. */
  item: Item;
  /** Changes several props at once, optionally adding a just-uploaded file in the same step. */
  onPatch: (patch: Item, newAsset?: Asset) => void;
}

export const asText = (v: Value): string => (typeof v === 'string' ? v : '');
const asItem = (v: Value): Item =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Item) : {};
const asList = (v: Value): Item[] => (Array.isArray(v) ? v.map(asItem) : []);

export function Help({ id, text }: { id: string; text: string | undefined }) {
  return text ? (
    <p id={id} className="help">
      {text}
    </p>
  ) : null;
}

/** One inspector control, picked from the field's kind. */
export function Field(props: FieldProps) {
  const { spec } = props;
  switch (spec.kind) {
    case 'line':
    case 'text':
      return <TextField {...props} spec={spec} />;
    case 'choice':
      return <ChoiceField {...props} spec={spec} />;
    case 'link':
      return isObjectProp(props.blockType, props.path) ? (
        <LinkObjectField {...props} spec={spec} />
      ) : (
        <AddressField
          id={props.path.join('-')}
          label={spec.label}
          help={spec.help}
          value={asText(props.value)}
          onChange={props.onChange}
          max={maxLength(propSchema(props.blockType, props.path))}
        />
      );
    case 'list':
      return <ListField {...props} spec={spec} />;
    case 'image':
      return <ImageField {...props} spec={spec} />;
    case 'video':
      return <VideoField {...props} spec={spec} />;
    case 'code':
      return <CodeField {...props} spec={spec} />;
  }
}

/** True when a link prop holds text and address together (a button), not just an address. */
function isObjectProp(type: BlockType, path: readonly string[]): boolean {
  const schema = propSchema(type, path);
  const inner = schema instanceof z.ZodOptional ? schema.unwrap() : schema;
  return inner instanceof z.ZodObject;
}

function TextField({
  spec,
  blockType,
  path,
  value,
  onChange,
}: FieldProps & { spec: Extract<FieldSpec, { kind: 'line' | 'text' }> }) {
  const id = useId();
  const max = maxLength(propSchema(blockType, path));
  const text = asText(value);
  const common = {
    id,
    className: 'input',
    value: text,
    maxLength: max,
    'aria-describedby': spec.help ? `${id}-help` : undefined,
  };
  return (
    <div>
      <label className="label" htmlFor={id}>
        {spec.label}
      </label>
      {spec.kind === 'text' ? (
        <textarea
          {...common}
          rows={spec.rows ?? 3}
          className="input resize-y"
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          {...common}
          type={spec.input ?? 'text'}
          // Line fields never hold line breaks: pasted text is joined into one line.
          onChange={(e) => onChange(e.target.value.replace(/[\r\n]+/g, ' '))}
        />
      )}
      <Help id={`${id}-help`} text={spec.help} />
    </div>
  );
}

function ChoiceField({
  spec,
  value,
  onChange,
}: FieldProps & { spec: Extract<FieldSpec, { kind: 'choice' }> }) {
  const id = useId();
  const entries = Object.entries(spec.options);
  const current = asText(value) || spec.fallback || entries[0]?.[0];
  return (
    <fieldset>
      <legend className="label">{spec.label}</legend>
      <div className="flex flex-wrap gap-1 rounded-lg bg-sunk p-1">
        {entries.map(([option, label]) => (
          <label
            key={option}
            className="relative flex min-h-8 flex-1 cursor-pointer items-center justify-center rounded-md px-2 text-center text-[0.8125rem] font-medium text-ink-soft has-checked:bg-panel has-checked:text-ink has-checked:shadow-[0_1px_2px_rgba(29,27,24,.12)] has-focus-visible:outline-2 has-focus-visible:outline-accent"
          >
            <input
              type="radio"
              className="sr-only"
              name={id}
              value={option}
              checked={current === option}
              onChange={() => onChange(option)}
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const ADDRESS_HELP =
  'Start with https:// for a website, use mailto: or tel:, or pick one of your pages.';

/** A web address. Kept as a draft while it is not valid yet, so typing is never blocked. */
export function AddressField({
  id,
  label,
  help,
  value,
  max,
  onChange,
}: {
  id: string;
  label: string;
  help?: string | undefined;
  value: string;
  max?: number | undefined;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  // The saved value changed from outside (undo, another control): show it.
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  const pageFiles = useEditor(
    useShallow((s) => (s.project?.pages ?? []).map((page) => pageFile(page.slug))),
  );
  const valid = (v: string) => v.trim() === '' || safeUrl(v.trim()) !== null;
  const invalid = !valid(draft);
  return (
    <div data-field={id}>
      <label className="label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        className="input"
        inputMode="url"
        spellCheck={false}
        value={draft}
        maxLength={max}
        placeholder="https://"
        list={`${inputId}-pages`}
        aria-invalid={invalid}
        aria-describedby={`${inputId}-help`}
        onChange={(e) => {
          setDraft(e.target.value);
          if (valid(e.target.value)) onChange(e.target.value.trim());
        }}
      />
      <datalist id={`${inputId}-pages`}>
        {pageFiles.map((file) => (
          <option key={file} value={file} />
        ))}
      </datalist>
      {invalid ? (
        <p id={`${inputId}-help`} className="error-text" role="alert">
          {ADDRESS_HELP}
        </p>
      ) : (
        <p id={`${inputId}-help`} className="help">
          {help ?? 'Paste a web address, #contact to jump to a section, or a page like about.html.'}
        </p>
      )}
    </div>
  );
}

/** A link with its own text, for example a button. Clearing both removes it. */
function LinkObjectField({ spec, blockType, path, value, onChange }: FieldProps) {
  const id = useId();
  const link = asItem(value);
  const update = (patch: Item) => {
    const next = { label: asText(link.label), href: asText(link.href), ...patch };
    onChange(next.label === '' && next.href === '' ? undefined : next);
  };
  return (
    <fieldset className="space-y-3 rounded-lg border border-line p-3">
      <legend className="px-1 text-[0.8125rem] font-semibold">{spec.label}</legend>
      <div>
        <label className="label" htmlFor={id}>
          Text
        </label>
        <input
          id={id}
          className="input"
          value={asText(link.label)}
          maxLength={maxLength(propSchema(blockType, [...path, 'label']))}
          onChange={(e) => update({ label: e.target.value.replace(/[\r\n]+/g, ' ') })}
        />
      </div>
      <AddressField
        id={`${path.join('-')}-href`}
        label="Goes to"
        value={asText(link.href)}
        max={maxLength(propSchema(blockType, [...path, 'href']))}
        onChange={(href) => update({ href })}
      />
    </fieldset>
  );
}

function ListField({
  spec,
  blockType,
  path,
  value,
  onChange,
  onPatch,
}: FieldProps & { spec: Extract<FieldSpec, { kind: 'list' }> }) {
  const items = asList(value);
  const limit = maxItems(propSchema(blockType, path));
  const set = (next: Item[]) => onChange(next.length ? next : undefined);
  const move = (from: number, to: number) => {
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (moved) next.splice(to, 0, moved);
    set(next);
  };
  const noun = spec.itemLabel.toLowerCase();
  // Items are named by their first text field (a picture's id means nothing to people).
  const nameKey = spec.fields.find((f) => f.kind === 'line' || f.kind === 'text')?.key ?? '';
  return (
    <fieldset>
      <legend className="label">{spec.label}</legend>
      <ol className="space-y-2">
        {items.map((item, index) => {
          const name = asText(item[nameKey]) || `${spec.itemLabel} ${index + 1}`;
          return (
            <li key={index} className="rounded-lg border border-line bg-panel">
              <details open={items.length <= 2}>
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <span className="flex shrink-0">
                    <button
                      type="button"
                      className="icon-btn size-8"
                      aria-label={`Move ${noun} ${index + 1} up`}
                      disabled={index === 0}
                      onClick={(e) => {
                        e.preventDefault();
                        move(index, index - 1);
                      }}
                    >
                      <Icon name="up" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn size-8"
                      aria-label={`Move ${noun} ${index + 1} down`}
                      disabled={index === items.length - 1}
                      onClick={(e) => {
                        e.preventDefault();
                        move(index, index + 1);
                      }}
                    >
                      <Icon name="down" />
                    </button>
                    <button
                      type="button"
                      className="icon-btn size-8 hover:text-danger"
                      aria-label={`Remove ${noun} ${index + 1}`}
                      onClick={(e) => {
                        e.preventDefault();
                        set(items.filter((_, i) => i !== index));
                      }}
                    >
                      <Icon name="trash" />
                    </button>
                  </span>
                </summary>
                <div className="space-y-3 border-t border-line p-3">
                  {spec.fields.map((child) => (
                    <Field
                      key={child.key}
                      spec={child}
                      blockType={blockType}
                      path={[...path, child.key]}
                      value={item[child.key]}
                      item={item}
                      onChange={(v) =>
                        set(items.map((it, i) => (i === index ? { ...it, [child.key]: v } : it)))
                      }
                      onPatch={(patch, newAsset) =>
                        onPatch(
                          {
                            [spec.key]: items.map((it, i) =>
                              i === index ? { ...it, ...patch } : it,
                            ),
                          },
                          newAsset,
                        )
                      }
                    />
                  ))}
                </div>
              </details>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="btn btn-line mt-2 w-full"
        disabled={items.length >= limit}
        onClick={() => set([...items, spec.newItem()])}
      >
        <Icon name="plus" />
        Add a {noun}
      </button>
      {items.length >= limit ? (
        <p className="help">That is the most this section can hold ({limit}).</p>
      ) : null}
    </fieldset>
  );
}
