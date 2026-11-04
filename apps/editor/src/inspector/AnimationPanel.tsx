import {
  ANIMATION_SPEEDS,
  MAX_ANIMATION_DELAY,
  animationPresets,
  animationTargets,
  isEntrance,
  type Animation,
  type AnimationPreset,
  type AnimationTarget,
  type Section,
  freeCanvas,
} from '@klinth/core';
import { useId, useState } from 'react';
import {
  PRESET_HELP,
  PRESET_LABELS,
  SPEED_LABELS,
  TARGET_LABELS,
  setSectionAnimation,
} from '../state/animation.ts';
import { useEditor } from '../state/store.ts';

/** Speed matters for animations that play, and for the scrolling row. */
const hasSpeed = (preset: AnimationPreset): boolean => isEntrance(preset) || preset === 'marquee';

/**
 * Animation for the selected section: pick the part that moves, a preset (each
 * with a small live sample), then speed, delay and when it plays. Every choice
 * replays the preview so the result is visible at once.
 */
export function AnimationPanel({ section }: { section: Section }) {
  // A free section only animates as a whole: its items have their own positions.
  const all = animationTargets(section.type);
  const targets = freeCanvas(section) ? all.filter((t) => t === 'section') : all;
  const [target, setTarget] = useState<AnimationTarget | undefined>(
    () => targets.find((t) => section.animation?.[t]) ?? targets[0],
  );
  const change = useEditor((s) => s.change);
  const notify = useEditor((s) => s.notify);
  const pageIndex = useEditor((s) => s.pageIndex);
  const replay = useEditor((s) => s.replayAnimations);
  const id = useId();
  if (!target || targets.length === 0) return null;

  const current = section.animation?.[target];
  const presets = animationPresets(section.type, target);
  const animated = targets.filter((t) => section.animation?.[t]).map((t) => TARGET_LABELS[t]);
  const save = (value: Animation | null, key?: string) => {
    const problem = change(
      (p) => setSectionAnimation(p, pageIndex, section.id, target, value),
      key,
    );
    if (problem) notify(`That animation could not be set: ${problem}`);
    else replay();
  };
  const pick = (preset: AnimationPreset | null) => {
    if (!preset) return save(null);
    // Keep the timing the owner already chose when it still applies.
    const next: Animation = { preset };
    if (current?.speed && hasSpeed(preset)) next.speed = current.speed;
    if (isEntrance(preset)) {
      if (current?.delay !== undefined) next.delay = current.delay;
      if (current?.repeat) next.repeat = current.repeat;
    }
    save(next);
  };
  const delaySeconds = (current?.delay ?? 0) / 1000;

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4 border-t border-line pt-4">
      <div>
        <h3 id={`${id}-title`} className="text-[0.8125rem] font-semibold">
          Animation
        </h3>
        <p className="help">
          {animated.length
            ? `Moving now: ${animated.join(', ')}.`
            : 'Nothing in this section moves yet.'}{' '}
          Visitors who ask their device for less motion always see it still.
        </p>
      </div>

      <div>
        <label className="label" htmlFor={`${id}-target`}>
          What moves
        </label>
        <select
          id={`${id}-target`}
          className="input"
          value={target}
          onChange={(e) => setTarget(e.target.value as AnimationTarget)}
        >
          {targets.map((t) => (
            <option key={t} value={t}>
              {TARGET_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      <div role="radiogroup" aria-label="Animation" className="grid grid-cols-2 gap-1.5">
        {([null, ...presets] as const).map((preset) => (
          <label
            key={preset ?? 'none'}
            className="anim-choice flex cursor-pointer items-start gap-2 rounded-lg border border-line p-2 has-checked:border-ink has-checked:bg-sunk has-focus-visible:outline-2 has-focus-visible:outline-accent"
          >
            <input
              type="radio"
              className="sr-only"
              name={`${id}-preset`}
              checked={(current?.preset ?? null) === preset}
              onChange={() => pick(preset)}
            />
            <span className="anim-demo" data-preset={preset ?? 'none'} aria-hidden="true">
              <span />
            </span>
            <span className="min-w-0">
              <span className="block text-[0.8125rem] font-semibold">
                {preset ? PRESET_LABELS[preset] : 'None'}
              </span>
              <span className="block text-[0.6875rem] leading-snug text-ink-soft">
                {preset ? PRESET_HELP[preset] : 'Stays still.'}
              </span>
            </span>
          </label>
        ))}
      </div>

      {current && hasSpeed(current.preset) ? (
        <fieldset>
          <legend className="label">Speed</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {ANIMATION_SPEEDS.map((speed) => (
              <label
                key={speed}
                className="cursor-pointer rounded-lg border border-line px-2 py-1.5 text-center text-[0.8125rem] font-medium has-checked:border-ink has-checked:bg-sunk has-focus-visible:outline-2 has-focus-visible:outline-accent"
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={`${id}-speed`}
                  checked={(current.speed ?? 'normal') === speed}
                  onChange={() => save({ ...current, speed })}
                />
                {SPEED_LABELS[speed]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {current && isEntrance(current.preset) ? (
        <>
          <div>
            <label className="label" htmlFor={`${id}-delay`}>
              Wait before it starts: {delaySeconds.toFixed(1)} s
            </label>
            <input
              id={`${id}-delay`}
              type="range"
              className="w-full accent-[var(--color-accent)]"
              min={0}
              max={MAX_ANIMATION_DELAY / 1000}
              step={0.1}
              value={delaySeconds}
              onChange={(e) =>
                save(
                  { ...current, delay: Math.round(Number(e.target.value) * 10) * 100 },
                  `${section.id}.animation.${target}.delay`,
                )
              }
            />
          </div>
          <fieldset>
            <legend className="label">Play it</legend>
            <div className="space-y-1">
              {(
                [
                  ['once', 'Once'],
                  ['always', 'Every time it comes into view'],
                ] as const
              ).map(([repeat, label]) => (
                <label key={repeat} className="flex items-center gap-2 text-[0.8125rem]">
                  <input
                    type="radio"
                    name={`${id}-repeat`}
                    checked={(current.repeat ?? 'once') === repeat}
                    onChange={() => save({ ...current, repeat })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </>
      ) : null}

      <button type="button" className="btn btn-line w-full" onClick={replay}>
        Preview animations
      </button>
    </section>
  );
}
