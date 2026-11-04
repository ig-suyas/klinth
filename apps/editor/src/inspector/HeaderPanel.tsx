import {
  HEADER_BACKGROUNDS,
  HEADER_COLORS,
  HEADER_LAYOUTS,
  HEADER_STYLES,
  MAX_CTA_LABEL,
  formatBytes,
  headerColors,
  headerContrastIssues,
  resolveHeader,
  type HeaderBackground,
  type HeaderColor,
  type HeaderLayout,
  type HeaderSettings,
  type HeaderStyle,
  type Project,
} from '@klinth/core';
import { useId, useState, type ReactNode } from 'react';
import { useAssetUrl, useLibrary, withAsset } from '../media/files.ts';
import { useEditor } from '../state/store.ts';
import { Icon } from '../ui/Icon.tsx';
import { AddressField } from './Fields.tsx';

export const HEADER_LABELS: Record<HeaderStyle, { label: string; help: string }> = {
  bar: { label: 'Top bar', help: 'Name left, menu right, stays on top.' },
  pill: { label: 'Floating pill', help: 'A rounded bar floating over the page.' },
  centered: { label: 'Centered logo', help: 'Big name in the middle, menu below.' },
  minimal: { label: 'Minimal', help: 'Small and quiet, no line under it.' },
};

const LAYOUT_LABELS: Record<HeaderLayout, { label: string; help: string }> = {
  full: { label: 'Full width', help: 'Edge to edge.' },
  floating: { label: 'Floating', help: 'Inset, rounded, soft shadow.' },
};

const BACKGROUND_LABELS: Record<HeaderBackground, { label: string; help: string }> = {
  solid: { label: 'Solid', help: 'One color.' },
  transparent: { label: 'Transparent', help: 'Over the first section; solid when scrolled.' },
  glass: { label: 'Glass', help: 'See-through with a blur.' },
};

const COLOR_LABELS: Record<HeaderColor, string> = {
  background: 'Page',
  surface: 'Cards',
  accent: 'Accent color',
  text: 'Text color',
  custom: 'Custom',
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Choice cards drawn as radio buttons (keyboard and screen reader friendly). */
function Choices<T extends string>(props: {
  legend: string;
  name: string;
  options: readonly T[];
  value: T;
  labels: Record<T, { label: string; help?: string }>;
  disabled?: (option: T) => boolean;
  note?: ReactNode;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-[0.8125rem] font-semibold">{props.legend}</legend>
      <div className="grid grid-cols-2 gap-1.5">
        {props.options.map((option) => (
          <label
            key={option}
            className="cursor-pointer rounded-lg border border-line p-2 has-checked:border-ink has-checked:bg-sunk has-disabled:cursor-not-allowed has-disabled:opacity-50 has-focus-visible:outline-2 has-focus-visible:outline-accent"
          >
            <input
              type="radio"
              className="sr-only"
              name={props.name}
              value={option}
              checked={props.value === option}
              disabled={props.disabled?.(option) ?? false}
              onChange={() => props.onChange(option)}
            />
            <span className="block text-[0.8125rem] font-semibold">
              {props.labels[option].label}
            </span>
            {props.labels[option].help ? (
              <span className="block text-[0.6875rem] leading-snug text-ink-soft">
                {props.labels[option].help}
              </span>
            ) : null}
          </label>
        ))}
      </div>
      {props.note}
    </fieldset>
  );
}

/**
 * Header settings at the top of Site style: style, layout, background, color,
 * sticky, a call-to-action button and the logo. Every change goes through the
 * project schema, so unsafe links and colors are refused there too.
 */
export function HeaderPanel() {
  const project = useEditor((s) => s.project);
  const change = useEditor((s) => s.change);
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();
  if (!project) return null;
  const style = project.meta.headerStyle ?? 'bar';
  const header = resolveHeader(project.meta);

  const setHeader = (patch: Partial<HeaderSettings>, key: string, edit?: (p: Project) => Project) =>
    setProblem(
      change((p) => {
        const base = edit ? edit(p) : p;
        const next = { ...resolveHeader(base.meta), ...patch };
        return { ...base, meta: { ...base.meta, header: next } };
      }, `meta.header.${key}`),
    );

  const issues = headerContrastIssues({ ...project, meta: { ...project.meta, header } });
  const colors = headerColors(project.theme, header);
  const showColor = header.background !== 'transparent';

  return (
    <div className="space-y-4">
      <Choices
        legend="Header style"
        name="header-style"
        options={HEADER_STYLES}
        value={style}
        labels={HEADER_LABELS}
        onChange={(next) =>
          change((p) => ({ ...p, meta: { ...p.meta, headerStyle: next } }), 'meta.header')
        }
      />
      <Choices
        legend="Layout"
        name="header-layout"
        options={HEADER_LAYOUTS}
        value={style === 'pill' ? 'floating' : header.layout}
        labels={LAYOUT_LABELS}
        disabled={(option) => style === 'pill' && option === 'full'}
        note={
          style === 'pill' ? <p className="help">The floating pill always floats.</p> : undefined
        }
        onChange={(layout) => setHeader({ layout }, 'layout')}
      />
      <Choices
        legend="Background"
        name="header-background"
        options={HEADER_BACKGROUNDS}
        value={header.background}
        labels={BACKGROUND_LABELS}
        onChange={(background) => setHeader({ background }, 'background')}
      />
      <fieldset className="space-y-2" disabled={!showColor}>
        <legend className="text-[0.8125rem] font-semibold">Header color</legend>
        {showColor ? null : (
          <p className="help -mt-1">A transparent header takes the first section’s colors.</p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {HEADER_COLORS.map((color) => (
            <label
              key={color}
              className="flex cursor-pointer items-center gap-1.5 rounded-full border border-line py-1 pr-2.5 pl-1 text-xs font-medium has-checked:border-ink has-checked:bg-sunk has-disabled:opacity-50 has-focus-visible:outline-2 has-focus-visible:outline-accent"
            >
              <input
                type="radio"
                className="sr-only"
                name="header-color"
                value={color}
                checked={header.color === color}
                onChange={() =>
                  setHeader(
                    color === 'custom'
                      ? { color, customColor: header.customColor ?? project.theme.colors.surface }
                      : { color },
                    'color',
                  )
                }
              />
              <span
                aria-hidden="true"
                className="size-4 rounded-full border border-line-strong"
                style={{
                  background:
                    color === 'custom'
                      ? (header.customColor ??
                        'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)')
                      : project.theme.colors[color],
                }}
              />
              {COLOR_LABELS[color]}
            </label>
          ))}
        </div>
        {showColor && header.color === 'custom' ? (
          <CustomColor
            value={header.customColor ?? project.theme.colors.surface}
            onChange={(customColor) => setHeader({ color: 'custom', customColor }, 'customColor')}
          />
        ) : null}
        {showColor ? (
          <p className="help">
            Text uses{' '}
            <span
              className="inline-block rounded px-1.5 font-semibold"
              style={{ background: colors.bg, color: colors.fg }}
            >
              this color
            </span>{' '}
            so it stays readable.
          </p>
        ) : null}
      </fieldset>
      {issues.length ? (
        <div
          role="status"
          className="rounded-lg border border-[#e6c9a8] bg-[#fdf4e7] p-3 text-xs leading-relaxed"
        >
          <p className="flex items-center gap-1.5 font-semibold">
            <Icon name="warn" className="size-4 text-accent-strong" />
            Header text may be hard to read
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {issues.map((issue) => (
              <li key={issue.where}>
                {issue.where} ({issue.ratio.toFixed(1)}:1, needs 4.5:1)
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-ink-soft">Try a solid background or another color.</p>
        </div>
      ) : null}
      <label className="flex items-start gap-2 text-[0.8125rem]">
        <input
          type="checkbox"
          className="mt-0.5 accent-accent"
          checked={header.sticky}
          onChange={(e) => setHeader({ sticky: e.target.checked }, 'sticky')}
        />
        <span>
          <span className="block font-semibold">Stay at the top when scrolling</span>
          <span className="block text-[0.6875rem] text-ink-soft">
            Visitors who prefer less motion get no fades.
          </span>
        </span>
      </label>

      <fieldset
        className="space-y-3 rounded-lg border border-line p-3"
        aria-labelledby={`${id}-cta`}
      >
        <legend id={`${id}-cta`} className="px-1 text-[0.8125rem] font-semibold">
          Button
        </legend>
        <p className="help -mt-1">
          Optional. Uses your accent color. Leave the text empty to hide it.
        </p>
        <CtaFields
          label={header.cta?.label ?? ''}
          href={header.cta?.href ?? ''}
          onChange={(cta) => setHeader({ cta }, 'cta')}
        />
      </fieldset>

      <LogoField
        header={header}
        onPick={(image, alt, asset) =>
          setHeader({ logo: { image, imageAlt: alt } }, 'logo', (p) => withAsset(p, asset))
        }
        onAlt={(imageAlt) =>
          header.logo && setHeader({ logo: { ...header.logo, imageAlt } }, 'logo.alt')
        }
        onText={() =>
          change((p) => {
            const current = resolveHeader(p.meta);
            const rest = { ...current };
            delete rest.logo;
            return { ...p, meta: { ...p.meta, header: rest } };
          }, 'meta.header.logo')
        }
      />
      {problem ? (
        <p role="alert" className="error-text">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

function CustomColor(props: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const [draft, setDraft] = useState(props.value);
  const [seen, setSeen] = useState(props.value);
  if (props.value !== seen) {
    setSeen(props.value);
    setDraft(props.value);
  }
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label="Header custom color picker"
        className="size-9 shrink-0 cursor-pointer rounded-md border border-line-strong bg-white p-0.5"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value.toLowerCase())}
      />
      <label htmlFor={id} className="sr-only">
        Header custom color
      </label>
      <input
        id={id}
        className="input w-[5.75rem] font-mono text-xs uppercase"
        value={draft}
        maxLength={7}
        spellCheck={false}
        aria-invalid={!HEX.test(draft)}
        onChange={(e) => {
          const v = e.target.value.trim();
          const next = v.startsWith('#') ? v : `#${v}`;
          setDraft(next);
          if (HEX.test(next)) props.onChange(next.toLowerCase());
        }}
      />
    </div>
  );
}

function CtaFields(props: {
  label: string;
  href: string;
  onChange: (cta: { label: string; href: string } | undefined) => void;
}) {
  const id = useId();
  const update = (patch: { label?: string; href?: string }) => {
    const next = { label: props.label, href: props.href, ...patch };
    props.onChange(next.label === '' && next.href === '' ? undefined : next);
  };
  return (
    <>
      <div>
        <label className="label" htmlFor={id}>
          Button text
        </label>
        <input
          id={id}
          className="input"
          value={props.label}
          maxLength={MAX_CTA_LABEL}
          placeholder="Book a call"
          onChange={(e) => update({ label: e.target.value.replace(/[\r\n]+/g, ' ') })}
        />
      </div>
      <AddressField
        id="header-cta-href"
        label="Goes to"
        value={props.href}
        max={2048}
        onChange={(href) => update({ href })}
      />
    </>
  );
}

function LogoField(props: {
  header: HeaderSettings;
  onPick: (image: string, alt: string, asset: Parameters<typeof withAsset>[1]) => void;
  onAlt: (alt: string) => void;
  onText: () => void;
}) {
  const altId = useId();
  const openLibrary = useLibrary((s) => s.open);
  const logo = props.header.logo;
  const asset = useEditor((s) =>
    logo ? s.project?.assets.find((a) => a.id === logo.image) : undefined,
  );
  const title = useEditor((s) => s.project?.meta.title ?? '');
  const url = useAssetUrl(asset?.id);
  const choose = () =>
    openLibrary({
      mode: 'pick',
      kind: 'image',
      onPick: (picked, isNew) =>
        props.onPick(picked.id, logo?.imageAlt || title || 'Logo', isNew ? picked : undefined),
    });
  return (
    <fieldset className="space-y-3">
      <legend className="text-[0.8125rem] font-semibold">Logo</legend>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="cursor-pointer rounded-lg border border-line p-2 text-[0.8125rem] font-semibold has-checked:border-ink has-checked:bg-sunk has-focus-visible:outline-2 has-focus-visible:outline-accent">
          <input
            type="radio"
            className="sr-only"
            name="header-logo"
            checked={!logo}
            onChange={props.onText}
          />
          Site name as text
        </label>
        <label className="cursor-pointer rounded-lg border border-line p-2 text-[0.8125rem] font-semibold has-checked:border-ink has-checked:bg-sunk has-focus-visible:outline-2 has-focus-visible:outline-accent">
          <input
            type="radio"
            className="sr-only"
            name="header-logo"
            checked={Boolean(logo)}
            onChange={() => (logo ? undefined : choose())}
          />
          Picture or icon
        </label>
      </div>
      {asset ? (
        <div className="flex items-center gap-3 rounded-lg border border-line p-2">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-sunk">
            {url ? <img src={url} alt="" className="max-h-full max-w-full object-contain" /> : null}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={asset.name}>
              {asset.name}
            </p>
            <p className="text-xs text-ink-soft">{formatBytes(asset.size)}</p>
          </div>
          <button type="button" className="btn btn-line min-h-7 px-2 text-xs" onClick={choose}>
            Change
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-3 text-sm font-medium text-ink-soft hover:border-accent hover:text-ink"
          onClick={choose}
        >
          <Icon name="upload" />
          Pick a logo from your files
        </button>
      )}
      {logo ? (
        <div>
          <label className="label" htmlFor={altId}>
            Logo description
          </label>
          <input
            id={altId}
            className="input"
            value={logo.imageAlt}
            maxLength={150}
            aria-describedby={`${altId}-help`}
            onChange={(e) => {
              const v = e.target.value.replace(/[\r\n]+/g, ' ');
              if (v.trim()) props.onAlt(v);
            }}
          />
          <p id={`${altId}-help`} className="help">
            Read aloud instead of the picture, usually your site’s name.
          </p>
        </div>
      ) : null}
    </fieldset>
  );
}
