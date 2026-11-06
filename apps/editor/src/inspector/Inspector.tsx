import { freeCanvas, type Asset, type Section } from '@klinth/core';
import { blockDefinitions } from '@klinth/templates';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { AiPanel } from '../ai/AiPanel.tsx';
import { useAi } from '../ai/store.ts';
import { withAsset } from '../media/files.ts';
import { canBeFree } from '../state/free.ts';
import { freeChoice, rememberFreeChoice } from '../state/free-intent.ts';
import { setCanvasProps } from '../state/canvas.ts';
import { setSectionProps, type Props } from '../state/sections.ts';
import { currentPage, useEditor } from '../state/store.ts';
import { useSectionActions } from '../state/useSectionActions.ts';
import { Icon } from '../ui/Icon.tsx';
import { AnimationPanel } from './AnimationPanel.tsx';
import { Field } from './Fields.tsx';
import { blockFields } from './fields.ts';
import { FreePanel } from './FreePanel.tsx';
import { ThemePanel } from './ThemePanel.tsx';

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
      <div className="relative min-h-0 flex-1 overflow-y-auto">
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
  const aiOpen = useAi((s) => s.panelFor === section.id);
  const openPanel = useAi((s) => s.openPanel);
  const definition = blockDefinitions[section.type];
  const props: Props = section.props;
  // The AI helper writes the block's own fields, which a free layout does not show.
  const free = freeCanvas(section) !== null;
  const save = (next: Props, key: string, newAsset?: Asset) => {
    // A blank canvas also reshapes its artboard when its height changes.
    const edit = section.type === 'canvas' ? setCanvasProps : setSectionProps;
    const problem = change((p) => edit(withAsset(p, newAsset), pageIndex, section.id, next), key);
    if (problem) notify(`That change could not be made: ${problem}`);
  };
  const fields = blockFields[section.type].map((spec) => (
    <Field
      key={`${spec.key}:${spec.label}`}
      spec={spec}
      blockType={section.type}
      path={[spec.key]}
      value={props[spec.key]}
      item={props}
      onChange={(value) => save({ ...props, [spec.key]: value }, `${section.id}.${spec.key}`)}
      onPatch={(patch, newAsset) =>
        save({ ...props, ...patch }, `${section.id}.${spec.key}`, newAsset)
      }
    />
  ));

  return (
    <div className="space-y-5 p-4">
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Section</p>
          <h2 className="mt-1 font-display text-xl">{definition.label}</h2>
          <p className="help">{definition.description}</p>
        </div>
        {free ? null : (
          <button
            type="button"
            className={`btn shrink-0 px-2.5 ${aiOpen ? 'btn-primary' : 'btn-line'}`}
            aria-expanded={aiOpen}
            onClick={() => openPanel(aiOpen ? null : section.id)}
          >
            <Icon name="sparkle" className={`size-4 ${aiOpen ? '' : 'text-accent'}`} />
            Ask AI
          </button>
        )}
      </header>
      {aiOpen && !free ? <AiPanel section={section} /> : null}
      {free ? (
        <>
          {/* A blank canvas has its own height and background; other free sections have none. */}
          {section.type === 'canvas' ? (
            <section aria-label="Canvas size and background" className="space-y-5">
              {fields}
            </section>
          ) : null}
          <FreePanel section={section} />
        </>
      ) : (
        <>
          <p className="rounded-lg bg-sunk px-3 py-2 text-xs leading-relaxed text-ink-soft">
            Tip: click any text in the preview to change it right there.
          </p>
          <FreeChoiceNote section={section} />
          {fields}
        </>
      )}
      <AnimationPanel key={section.id} section={section} />
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

/** After "No" with "Don't ask again": dragging keeps the optimized layout; this undoes that choice. */
function FreeChoiceNote({ section }: { section: Section }) {
  const projectId = useEditor((s) => s.projectId);
  const [, refresh] = useState(0);
  if (!canBeFree(section) || freeChoice(projectId, section.id) !== 'no') return null;
  return (
    <p className="help">
      Free positioning is off for this section.{' '}
      <button
        type="button"
        className="font-semibold underline underline-offset-2"
        onClick={() => {
          rememberFreeChoice(projectId, section.id, null);
          refresh((n) => n + 1);
        }}
      >
        Ask me again
      </button>
    </p>
  );
}
