import type { Section } from '@klinth/core';
import { blockDefinitions } from '@klinth/templates';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { setSectionProps, type Props } from '../state/sections.ts';
import { currentPage, useEditor } from '../state/store.ts';
import { useSectionActions } from '../state/useSectionActions.ts';
import { Icon } from '../ui/Icon.tsx';
import { Field } from './Fields.tsx';
import { blockFields } from './fields.ts';
import { ThemePanel } from './ThemePanel.tsx';

const LATER_NOTES: Partial<Record<Section['type'], string>> = {
  gallery: 'Adding pictures is coming soon. For now you can change the heading and text.',
  video: 'Adding videos and YouTube or Vimeo links is coming soon.',
  customCode: 'Custom code is coming soon.',
};

/** The right panel: the selected section's settings, or the site style. */
export function Inspector() {
  const section = useEditor((s) => currentPage(s)?.sections.find((x) => x.id === s.selectedId));
  const select = useEditor((s) => s.select);
  const reduce = useReducedMotion();

  return (
    <aside
      aria-label="Settings"
      data-tour="inspector"
      className="flex min-h-0 flex-col border-l border-line bg-panel"
    >
      <div
        className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2"
        role="tablist"
      >
        <TabButton active={!section} onClick={() => select(null)}>
          Site style
        </TabButton>
        <TabButton active={Boolean(section)} disabled={!section} onClick={() => undefined}>
          Section
        </TabButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={section?.id ?? 'site'}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
          >
            {section ? <SectionSettings section={section} /> : <ThemePanel />}
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      className="relative h-9 rounded-md px-3 text-sm font-medium text-ink-soft hover:text-ink disabled:cursor-default disabled:opacity-40 aria-selected:text-ink"
    >
      {children}
      {active ? (
        <motion.span
          layoutId="inspector-tab"
          className="absolute inset-x-2 -bottom-[7px] h-0.5 rounded-full bg-accent"
        />
      ) : null}
    </button>
  );
}

function SectionSettings({ section }: { section: Section }) {
  const change = useEditor((s) => s.change);
  const notify = useEditor((s) => s.notify);
  const pageIndex = useEditor((s) => s.pageIndex);
  const { duplicate, remove } = useSectionActions();
  const definition = blockDefinitions[section.type];
  const props: Props = section.props;
  const note = LATER_NOTES[section.type];

  return (
    <div className="space-y-5 p-4">
      <header>
        <p className="eyebrow">Section</p>
        <h2 className="mt-1 font-display text-xl">{definition.label}</h2>
        <p className="help">{definition.description}</p>
      </header>
      <p className="rounded-lg bg-sunk px-3 py-2 text-xs leading-relaxed text-ink-soft">
        Tip: click any text in the preview to change it right there.
      </p>
      {note ? (
        <p className="rounded-lg border border-line px-3 py-2 text-xs leading-relaxed">{note}</p>
      ) : null}
      {blockFields[section.type].map((spec) => (
        <Field
          key={spec.key}
          spec={spec}
          blockType={section.type}
          path={[spec.key]}
          value={props[spec.key]}
          onChange={(value) => {
            const problem = change(
              (p) => setSectionProps(p, pageIndex, section.id, { ...props, [spec.key]: value }),
              `${section.id}.${spec.key}`,
            );
            if (problem) notify(`That change could not be made: ${problem}`);
          }}
        />
      ))}
      <div className="flex gap-2 border-t border-line pt-4">
        <button type="button" className="btn btn-line flex-1" onClick={() => duplicate(section.id)}>
          <Icon name="copy" />
          Duplicate
        </button>
        <button
          type="button"
          className="btn btn-line flex-1 hover:text-danger"
          onClick={() => remove(section.id)}
        >
          <Icon name="trash" />
          Delete
        </button>
      </div>
    </div>
  );
}
