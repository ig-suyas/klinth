import type { Section } from '@klinth/core';
import { blockDefinitions } from '@klinth/templates';
import { AnimatePresence, Reorder, motion, useDragControls, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useAi } from '../ai/store.ts';
import { ADDABLE_BLOCKS } from '../inspector/fields.ts';
import { sectionTitle } from '../state/sections.ts';
import { currentPage, useEditor } from '../state/store.ts';
import { useSectionActions } from '../state/useSectionActions.ts';
import { Icon } from '../ui/Icon.tsx';

/** The left panel: the page's sections in order, and "Add a section". */
export function SectionsPanel() {
  const sections = useEditor((s) => currentPage(s)?.sections);
  const selectedId = useEditor((s) => s.selectedId);
  const [adding, setAdding] = useState(false);
  const actions = useSectionActions();
  if (!sections) return null;
  const ids = sections.map((s) => s.id);

  return (
    <nav
      aria-label="Sections"
      data-tour="sections"
      className="flex min-h-0 flex-col border-r border-line bg-panel"
    >
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <h2 className="text-sm font-semibold">Sections</h2>
        <span className="text-xs text-ink-soft">{sections.length}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sections.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-ink-soft">
            This page is empty. Add your first section below.
          </p>
        ) : (
          <Reorder.Group axis="y" values={ids} onReorder={actions.reorder} className="space-y-0.5">
            {sections.map((section, index) => (
              <SectionRow
                key={section.id}
                section={section}
                index={index}
                count={sections.length}
                selected={section.id === selectedId}
              />
            ))}
          </Reorder.Group>
        )}
      </div>
      <div className="relative shrink-0 border-t border-line p-2">
        <button
          type="button"
          className="btn btn-primary w-full"
          aria-expanded={adding}
          aria-controls="add-section"
          onClick={() => setAdding((v) => !v)}
        >
          <Icon name="plus" />
          Add a section
        </button>
        <AnimatePresence>
          {adding ? (
            <AddSectionMenu
              onPick={(type) => {
                actions.add(type);
                setAdding(false);
              }}
              onClose={() => setAdding(false)}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </nav>
  );
}

function SectionRow({
  section,
  index,
  count,
  selected,
}: {
  section: Section;
  index: number;
  count: number;
  selected: boolean;
}) {
  const select = useEditor((s) => s.select);
  const openPanel = useAi((s) => s.openPanel);
  const { move, duplicate, remove } = useSectionActions();
  const controls = useDragControls();
  const label = blockDefinitions[section.type].label;
  const title = sectionTitle(section);

  return (
    <Reorder.Item
      value={section.id}
      dragListener={false}
      dragControls={controls}
      className={`group relative flex items-center gap-1 rounded-lg pr-1 ${
        selected ? 'bg-accent-wash' : 'hover:bg-sunk'
      }`}
      whileDrag={{ scale: 1.02, boxShadow: '0 8px 24px -8px rgba(29,27,24,.3)' }}
    >
      <button
        type="button"
        className="grid h-11 w-6 shrink-0 cursor-grab touch-none place-items-center text-ink-soft active:cursor-grabbing"
        aria-label={`Drag to move ${label}`}
        onPointerDown={(e) => controls.start(e)}
        tabIndex={-1}
      >
        <Icon name="grip" className="size-3.5" />
      </button>
      <button
        type="button"
        className="min-w-0 flex-1 py-1.5 text-left"
        aria-current={selected ? 'true' : undefined}
        onClick={() => select(section.id)}
      >
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-ink-soft">{label}</span>
      </button>
      <span
        className={`flex shrink-0 ${selected ? '' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'}`}
      >
        <button
          type="button"
          className="icon-btn size-7 text-accent"
          aria-label={`Ask AI about ${label}`}
          title="Ask AI to write or restyle this section"
          onClick={() => {
            select(section.id);
            openPanel(section.id);
          }}
        >
          <Icon name="sparkle" className="size-3.5" />
        </button>
        <button
          type="button"
          className="icon-btn size-7"
          aria-label={`Move ${label} up`}
          disabled={index === 0}
          onClick={() => move(section.id, -1)}
        >
          <Icon name="up" className="size-3.5" />
        </button>
        <button
          type="button"
          className="icon-btn size-7"
          aria-label={`Move ${label} down`}
          disabled={index === count - 1}
          onClick={() => move(section.id, 1)}
        >
          <Icon name="down" className="size-3.5" />
        </button>
        <button
          type="button"
          className="icon-btn size-7"
          aria-label={`Duplicate ${label}`}
          onClick={() => duplicate(section.id)}
        >
          <Icon name="copy" className="size-3.5" />
        </button>
        <button
          type="button"
          className="icon-btn size-7 hover:text-danger"
          aria-label={`Delete ${label}`}
          onClick={() => remove(section.id)}
        >
          <Icon name="trash" className="size-3.5" />
        </button>
      </span>
    </Reorder.Item>
  );
}

function AddSectionMenu({
  onPick,
  onClose,
}: {
  onPick: (type: (typeof ADDABLE_BLOCKS)[number]) => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      id="add-section"
      role="dialog"
      aria-label="Add a section"
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduce ? 0 : 4 }}
      transition={{ duration: 0.18, ease: [0.2, 0.7, 0.2, 1] }}
      className="absolute bottom-full left-2 z-20 mb-2 max-h-[70vh] w-[22rem] overflow-y-auto rounded-xl border border-line bg-panel p-1.5 shadow-[0_16px_40px_-12px_rgba(29,27,24,.35)]"
    >
      <p className="px-2.5 pt-2 pb-1 eyebrow">Pick a section to add</p>
      <ul>
        {ADDABLE_BLOCKS.map((type, i) => (
          <li key={type}>
            <button
              ref={i === 0 ? first : undefined}
              type="button"
              className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-sunk focus-visible:bg-sunk"
              onClick={() => onPick(type)}
            >
              <span className="block text-sm font-medium">{blockDefinitions[type].label}</span>
              <span className="block text-xs leading-snug text-ink-soft">
                {blockDefinitions[type].description}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}
