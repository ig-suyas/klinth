import type {
  Animation,
  AnimationPreset,
  AnimationSpeed,
  AnimationTarget,
  Project,
  SectionAnimation,
} from '@klinth/core';

/** Plain names for the parts of a section that can move. */
export const TARGET_LABELS: Record<AnimationTarget, string> = {
  section: 'Whole section',
  heading: 'Heading',
  media: 'Pictures',
  buttons: 'Buttons',
  cards: 'Cards',
  video: 'Video thumbnail',
};

export const PRESET_LABELS: Record<AnimationPreset, string> = {
  fade: 'Fade in',
  slideUp: 'Slide up',
  zoom: 'Zoom in',
  blurIn: 'Blur in',
  words: 'Word by word',
  letters: 'Letter by letter',
  typewriter: 'Typewriter',
  maskWipe: 'Wipe reveal',
  parallax: 'Parallax',
  marquee: 'Scrolling row',
  lift: 'Lift on hover',
  tilt: 'Tilt on hover',
  glow: 'Glow on hover',
};

export const PRESET_HELP: Record<AnimationPreset, string> = {
  fade: 'Gently appears as you scroll to it.',
  slideUp: 'Rises a little while it appears.',
  zoom: 'Grows slightly into place.',
  blurIn: 'Comes into focus (a fade on phones).',
  words: 'Each word rises into place.',
  letters: 'Each letter appears in turn.',
  typewriter: 'Typed out, letter by letter.',
  maskWipe: 'A cover slides away to show it.',
  parallax: 'Moves slower than the page. Off on small phones.',
  marquee: 'Scrolls sideways in a loop, with a Pause button.',
  lift: 'Rises when the pointer is on it.',
  tilt: 'Tilts towards the pointer.',
  glow: 'Gets a soft glow in your accent color.',
};

export const SPEED_LABELS: Record<AnimationSpeed, string> = {
  slow: 'Slow',
  normal: 'Normal',
  fast: 'Fast',
};

/**
 * Sets (or with null removes) the animation of one part of a section. An
 * animation with no parts left is removed, so saved files stay tidy. The store
 * validates the result, so a preset that does not fit is refused there.
 */
export function setSectionAnimation(
  project: Project,
  pageIndex: number,
  id: string,
  target: AnimationTarget,
  value: Animation | null,
): unknown {
  const page = project.pages[pageIndex];
  if (!page) return project;
  const sections = page.sections.map((section) => {
    if (section.id !== id) return section;
    const next: SectionAnimation = Object.fromEntries(
      Object.entries({ ...section.animation, [target]: value ?? undefined }).filter(
        ([, setting]) => setting !== undefined,
      ),
    );
    const copy: Record<string, unknown> = { ...section, animation: next };
    if (Object.keys(next).length === 0) copy.animation = undefined;
    return Object.fromEntries(Object.entries(copy).filter(([, v]) => v !== undefined));
  });
  return {
    ...project,
    pages: project.pages.map((p, i) => (i === pageIndex ? { ...p, sections } : p)),
  };
}
