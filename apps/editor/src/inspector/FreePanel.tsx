import {
  MAX_FREE_FONT,
  MIN_FREE_FONT,
  freeCanvas,
  freeWarnings,
  readingOrder,
  type FreeItem,
  type Section,
} from '@klinth/core';
import { AnimatePresence } from 'motion/react';
import { useId, useState } from 'react';
import {
  itemLabel,
  overlapWarnings,
  readabilityGroup,
  restackItem,
  returnToFlow,
  setItemBox,
  updateFreeItem,
} from '../state/free.ts';
import { useFreeUi } from '../state/free-intent.ts';
import { useEditor } from '../state/store.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';

/**
 * Settings of a section whose content is placed freely: what is in it, the
 * selected item's content, position and stacking, things to fix, and the way
 * back to the optimized layout. Moving happens in the preview.
 */
export function FreePanel({ section }: { section: Section }) {
  const canvas = freeCanvas(section);
  const item = useFreeUi((s) => s.item);
  const selectItem = useFreeUi((s) => s.selectItem);
  const showItems = useFreeUi((s) => s.showItems);
  const setDevice = useEditor((s) => s.setDevice);
  const [confirming, setConfirming] = useState(false);
  const id = useId();
  if (!canvas) return null;
  const items = readingOrder(canvas);
  const current = items.find((i) => i.id === item);
  const warnings = checksFor(section);

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4">
      <div className="rounded-lg border border-line bg-sunk px-3 py-2.5">
        <h3 id={`${id}-title`} className="flex items-center gap-2 text-[0.8125rem] font-semibold">
          <span className="rounded-full bg-ink px-2 py-0.5 text-[0.6875rem] text-panel">
            Free layout
          </span>
          Placed by hand
        </h3>
        <p className="help">
          Drag items in the preview. Arrow keys nudge the selected item (Shift for bigger steps),
          Alt turns snapping off, and a double-click edits text. On phones the items stack in
          reading order.
        </p>
        <button
          type="button"
          className="btn btn-quiet mt-2 px-2"
          onClick={() => setDevice('phone')}
        >
          See it on a phone
        </button>
      </div>

      {warnings.length ? (
        <ul className="space-y-1.5" aria-label="Things to check">
          {warnings.map((w) => (
            <li
              key={w.key}
              className={`flex items-start justify-between gap-2 rounded-lg px-3 py-2 text-xs ${
                w.gentle ? 'bg-sunk' : 'bg-accent-wash'
              }`}
            >
              <span>{w.message}</span>
              <button
                type="button"
                className="shrink-0 font-semibold underline underline-offset-2"
                onClick={() => {
                  if (w.items.length === 1) selectItem(w.items[0] ?? null);
                  showItems(w.items);
                }}
              >
                Show
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div>
        <p className="label" id={`${id}-items`}>
          Items, in reading order
        </p>
        <ul className="space-y-0.5" aria-labelledby={`${id}-items`}>
          {items.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                aria-pressed={i.id === item}
                className={`w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${
                  i.id === item ? 'bg-accent-wash font-medium' : 'hover:bg-sunk'
                }`}
                onClick={() => selectItem(i.id === item ? null : i.id)}
              >
                {itemLabel(i)}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {current ? <ItemSettings key={current.id} section={section} item={current} /> : null}

      <div className="border-t border-line pt-4">
        <button type="button" className="btn btn-line w-full" onClick={() => setConfirming(true)}>
          Return to optimized layout
        </button>
      </div>
      <AnimatePresence>
        {confirming ? (
          <ConfirmDialog
            key="return"
            title="Return to the optimized layout?"
            confirmLabel="Return to optimized layout"
            cancelLabel="Keep the free layout"
            onConfirm={() => {
              setConfirming(false);
              returnNow(section.id);
            }}
            onCancel={() => setConfirming(false)}
          >
            <p>
              The positions you set are removed. Your text, pictures and buttons go back into the
              section’s own layout, which adapts to every screen.
            </p>
          </ConfirmDialog>
        ) : null}
      </AnimatePresence>
    </section>
  );
}

interface Check {
  key: string;
  message: string;
  /** The items it is about; "Show" outlines them in the preview. */
  items: string[];
  /** A hint rather than something to fix. */
  gentle?: boolean;
}

/**
 * Things to check in a free section: each picture without a description, then
 * one grouped line for all small text and one for overlapping text.
 */
function checksFor(section: Section): Check[] {
  const canvas = freeCanvas(section);
  if (!canvas) return [];
  const checks: Check[] = freeWarnings(section).map((w) => ({
    key: `alt-${w.item}`,
    message: w.message,
    items: [w.item],
  }));
  const small = readabilityGroup(canvas);
  if (small) checks.push({ key: 'small', message: small.message, items: small.items });
  const overlaps = overlapWarnings(canvas).map((w) => w.item);
  if (overlaps.length) {
    const n = overlaps.length;
    checks.push({
      key: 'overlap',
      message: n === 1 ? 'A text overlaps another item.' : `${n} texts overlap other items.`,
      items: overlaps,
      gentle: true,
    });
  }
  return checks;
}

function returnNow(sectionId: string) {
  const state = useEditor.getState();
  let dropped: string[] = [];
  const problem = state.change((p) => {
    const result = returnToFlow(p, state.pageIndex, sectionId);
    dropped = result.dropped;
    return result.project;
  });
  if (problem) {
    state.notify(`That change could not be made: ${problem}`);
    return;
  }
  useFreeUi.getState().selectItem(null);
  const n = dropped.length;
  state.notify(
    n
      ? `Back to the optimized layout. ${n === 1 ? '1 item' : `${n} items`} added on the canvas could not be kept.`
      : 'Back to the optimized layout.',
    true,
  );
}

const BOX_FIELDS = [
  ['x', 'From left'],
  ['y', 'From top'],
  ['w', 'Width'],
  ['h', 'Height'],
] as const;

function ItemSettings({ section, item }: { section: Section; item: FreeItem }) {
  const change = useEditor((s) => s.change);
  const notify = useEditor((s) => s.notify);
  const pageIndex = useEditor((s) => s.pageIndex);
  const id = useId();
  const report = (problem: string | null) => {
    if (problem) notify(`That change could not be made: ${problem}`);
  };
  const patch = (values: Record<string, unknown>, field: string) =>
    report(
      change(
        (p) => updateFreeItem(p, pageIndex, section.id, item.id, values),
        `free:${section.id}:${item.id}:${field}`,
      ),
    );
  const box = (key: 'x' | 'y' | 'w' | 'h', value: number) => {
    if (!Number.isFinite(value)) return;
    report(
      change(
        (p) =>
          setItemBox(p, pageIndex, section.id, item.id, {
            x: item.x,
            y: item.y,
            w: item.w,
            h: item.h,
            [key]: value,
          }),
        `free:${section.id}:${item.id}:${key}`,
      ),
    );
  };
  const restack = (by: 'forward' | 'backward') =>
    report(change((p) => restackItem(p, pageIndex, section.id, item.id, by)));
  // Text that must not be empty: the field may be empty while typing, the item keeps its text.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="space-y-3 rounded-lg border border-line p-3" aria-label="Selected item">
      <p className="text-sm font-semibold">{itemLabel(item)}</p>
      {item.type === 'text' ? (
        <>
          <div>
            <label className="label" htmlFor={`${id}-text`}>
              Text
            </label>
            <textarea
              id={`${id}-text`}
              className="input resize-y"
              rows={3}
              maxLength={4000}
              value={draft ?? item.text}
              onBlur={() => setDraft(null)}
              onChange={(e) => {
                setDraft(e.target.value);
                if (e.target.value.trim()) patch({ text: e.target.value }, 'text');
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor={`${id}-size`}>
                Text size
              </label>
              <input
                id={`${id}-size`}
                className="input"
                type="number"
                step={0.1}
                min={MIN_FREE_FONT}
                max={MAX_FREE_FONT}
                value={item.size}
                aria-describedby={`${id}-size-help`}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n >= MIN_FREE_FONT && n <= MAX_FREE_FONT) patch({ size: n }, 'size');
                }}
              />
            </div>
            <div>
              <label className="label" htmlFor={`${id}-align`}>
                Align
              </label>
              <select
                id={`${id}-align`}
                className="input"
                value={item.align ?? 'start'}
                onChange={(e) => patch({ align: e.target.value }, 'align')}
              >
                <option value="start">Left</option>
                <option value="center">Centre</option>
                <option value="end">Right</option>
              </select>
            </div>
          </div>
          <p id={`${id}-size-help`} className="help">
            Size is a share of the section’s width, so it looks the same on every screen.
          </p>
        </>
      ) : null}
      {item.type === 'image' ? (
        <>
          <div>
            <label className="label" htmlFor={`${id}-alt`}>
              Describe the picture
            </label>
            <input
              id={`${id}-alt`}
              className="input"
              maxLength={300}
              value={item.imageAlt ?? ''}
              onChange={(e) =>
                patch({ imageAlt: e.target.value.replace(/[\r\n]+/g, ' ') }, 'imageAlt')
              }
            />
          </div>
          <div>
            <label className="label" htmlFor={`${id}-fit`}>
              Fit
            </label>
            <select
              id={`${id}-fit`}
              className="input"
              value={item.fit ?? 'cover'}
              onChange={(e) => patch({ fit: e.target.value }, 'fit')}
            >
              <option value="cover">Fill the box</option>
              <option value="contain">Show it whole</option>
            </select>
          </div>
        </>
      ) : null}
      {item.type === 'button' ? (
        <>
          <div>
            <label className="label" htmlFor={`${id}-label`}>
              Button text
            </label>
            <input
              id={`${id}-label`}
              className="input"
              maxLength={80}
              value={draft ?? item.label}
              onBlur={() => setDraft(null)}
              onChange={(e) => {
                const value = e.target.value.replace(/[\r\n]+/g, ' ');
                setDraft(value);
                if (value.trim()) patch({ label: value }, 'label');
              }}
            />
          </div>
          <div>
            <label className="label" htmlFor={`${id}-href`}>
              Link
            </label>
            <input
              id={`${id}-href`}
              className="input"
              value={item.href}
              onChange={(e) => patch({ href: e.target.value.trim() }, 'href')}
            />
          </div>
        </>
      ) : null}
      {item.type === 'video' ? (
        <div>
          <label className="label" htmlFor={`${id}-title`}>
            Video title
          </label>
          <input
            id={`${id}-title`}
            className="input"
            maxLength={200}
            value={item.title ?? ''}
            onChange={(e) => patch({ title: e.target.value }, 'title')}
          />
        </div>
      ) : null}

      <fieldset>
        <legend className="label">Position and size (% of the section)</legend>
        <div className="grid grid-cols-2 gap-2">
          {BOX_FIELDS.map(([key, label]) => {
            // Text is as tall as its lines: its height follows the width and the text size.
            const auto = key === 'h' && item.type === 'text';
            return (
              <label key={key} className="text-xs text-ink-soft">
                {auto ? 'Height (automatic)' : label}
                <input
                  className="input mt-1"
                  type="number"
                  step={0.5}
                  min={key === 'w' || key === 'h' ? 0.25 : 0}
                  max={100}
                  value={item[key]}
                  readOnly={auto}
                  aria-readonly={auto || undefined}
                  onChange={(e) => {
                    if (!auto) box(key, Number(e.target.value));
                  }}
                />
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex gap-2">
        <button type="button" className="btn btn-line flex-1" onClick={() => restack('forward')}>
          Bring forward
        </button>
        <button type="button" className="btn btn-line flex-1" onClick={() => restack('backward')}>
          Send back
        </button>
      </div>
    </div>
  );
}
