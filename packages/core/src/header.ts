/**
 * Header settings: layout, background, sticky/scroll behaviour, a call-to-action
 * button and an optional picture logo. Optional on the project (`meta.header`);
 * without it the header renders exactly as before.
 *
 * Every value is a closed enum, a validated `#rrggbb` color, an allow-listed
 * link (`safeUrl`) or escaped text, so nothing unchecked reaches HTML or CSS.
 */
import { z } from 'zod';
import { singleLine } from './blocks.ts';
import { contrastRatio, mixSrgb, MIN_TEXT_CONTRAST, type ContrastIssue } from './contrast.ts';
import { safeUrl } from './html.ts';
import { DEVICE_NAME } from './links.ts';
import type { Project, Section } from './schema.ts';
import type { Theme } from './tokens.ts';

/** How the site header looks. `bar` is the original sticky top bar. */
export const HEADER_STYLES = ['bar', 'pill', 'centered', 'minimal'] as const;
export type HeaderStyle = (typeof HEADER_STYLES)[number];

/** Edge to edge, or a rounded bar inset from the edges with a soft shadow. */
export const HEADER_LAYOUTS = ['full', 'floating'] as const;
export const HEADER_BACKGROUNDS = ['solid', 'transparent', 'glass'] as const;
/** Theme colors a solid or glass header can use, or the owner's own. */
export const HEADER_COLORS = ['background', 'surface', 'accent', 'text', 'custom'] as const;

export type HeaderLayout = (typeof HEADER_LAYOUTS)[number];
export type HeaderBackground = (typeof HEADER_BACKGROUNDS)[number];
export type HeaderColor = (typeof HEADER_COLORS)[number];

/** Longest call-to-action label. */
export const MAX_CTA_LABEL = 40;

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a color like #1a2b3c');
const assetId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id')
  .refine((v) => !DEVICE_NAME.test(v), 'This file id is reserved');

/** Empty (no button yet), or an allowed link: https, mailto, tel, #anchor or a page. */
const ctaHref = z
  .string()
  .max(2048)
  .refine((v) => v === '' || safeUrl(v) !== null, 'Use a link starting with https://');

export const headerSchema = z
  .object({
    layout: z.enum(HEADER_LAYOUTS),
    background: z.enum(HEADER_BACKGROUNDS),
    /** Color of a solid or glass header (and of a transparent one once scrolled is the section's). */
    color: z.enum(HEADER_COLORS),
    customColor: hexColor.optional(),
    sticky: z.boolean(),
    cta: z
      .object({ label: singleLine(MAX_CTA_LABEL), href: ctaHref })
      .strict()
      .optional(),
    /** A picture from the media library shown instead of the site name. */
    logo: z
      .object({ image: assetId, imageAlt: singleLine(150, 1) })
      .strict()
      .optional(),
  })
  .strict()
  .refine((h) => h.color !== 'custom' || h.customColor !== undefined, {
    message: 'Pick a custom color',
    path: ['customColor'],
  });

export type HeaderSettings = z.infer<typeof headerSchema>;

/** What each style looked like before header settings existed. */
export function defaultHeader(style: HeaderStyle): HeaderSettings {
  return {
    layout: style === 'pill' ? 'floating' : 'full',
    background: 'solid',
    color: style === 'pill' ? 'surface' : 'background',
    sticky: style === 'bar' || style === 'pill',
  };
}

/** The settings in effect for a project's header. */
export function resolveHeader(meta: {
  headerStyle?: HeaderStyle | undefined;
  header?: HeaderSettings | undefined;
}): HeaderSettings {
  return meta.header ?? defaultHeader(meta.headerStyle ?? 'bar');
}

/** The pill is a floating bar by definition. */
export const headerLayout = (style: HeaderStyle, header: HeaderSettings): HeaderLayout =>
  style === 'pill' ? 'floating' : header.layout;

/** The call-to-action to show, or null when its label or link is missing or unsafe. */
export function headerCta(header: HeaderSettings): { label: string; href: string } | null {
  const label = header.cta?.label.trim() ?? '';
  const href = safeUrl(header.cta?.href ?? '');
  return label && href ? { label, href } : null;
}

/** Background of a solid or glass header and the theme color that reads best on it. */
export function headerColors(theme: Theme, header: HeaderSettings): { bg: string; fg: string } {
  const c = theme.colors;
  switch (header.color) {
    case 'background':
      return { bg: c.background, fg: c.text };
    case 'surface':
      return { bg: c.surface, fg: c.text };
    case 'accent':
      return { bg: c.accent, fg: c.accentText };
    case 'text':
      return { bg: c.text, fg: c.background };
    case 'custom': {
      const bg = (header.customColor ?? c.background).toLowerCase();
      const best = [c.text, c.background, c.accentText].reduce((a, b) =>
        contrastRatio(b, bg) > contrastRatio(a, bg) ? b : a,
      );
      return { bg, fg: best };
    }
  }
}

/** Section background names to the theme colors behind them and their text. */
export function sectionColors(theme: Theme, bg: string): { bg: string; fg: string } {
  const c = theme.colors;
  if (bg === 'bold') return { bg: c.accent, fg: c.accentText };
  if (bg === 'tinted') return { bg: c.surface, fg: c.text };
  return { bg: c.background, fg: c.text };
}

/** How opaque a glass header is (the rest shows through, blurred). */
export const GLASS_OPACITY = 0.8;

/**
 * Header text pairings below WCAG AA. `firstBackgrounds` lists the background
 * of the first section on each page (what a transparent header sits on).
 */
export function headerTextIssues(
  theme: Theme,
  header: HeaderSettings,
  firstBackgrounds: readonly string[],
): ContrastIssue[] {
  const issues: ContrastIssue[] = [];
  const check = (where: string, fg: string, bg: string) => {
    const ratio = contrastRatio(fg, bg);
    if (ratio < MIN_TEXT_CONTRAST) issues.push({ where, ratio });
  };
  if (header.background === 'transparent') {
    for (const name of new Set(firstBackgrounds)) {
      const { bg, fg } = sectionColors(theme, name);
      check(`Header text over a ${name} first section`, fg, bg);
    }
    return issues;
  }
  const { bg, fg } = headerColors(theme, header);
  if (header.background === 'solid') {
    check('Header text', fg, bg);
    return issues;
  }
  // Glass: the worst case is page content of any theme color showing through.
  const c = theme.colors;
  const behind = [c.background, c.surface, c.text, c.accent, c.accentText];
  const worst = Math.min(...behind.map((b) => contrastRatio(fg, mixSrgb(bg, GLASS_OPACITY, b))));
  if (worst < MIN_TEXT_CONTRAST) issues.push({ where: 'Header text on glass', ratio: worst });
  return issues;
}

/** Background name of a page's first section (what a transparent header sits on). */
export function firstSectionBackground(sections: readonly Section[]): string {
  const first = sections.find((s) => s.type !== 'footer');
  return first && 'background' in first.props ? (first.props.background ?? 'plain') : 'plain';
}

/** Header text pairings below WCAG AA for this project (none when header settings are not used). */
export function headerContrastIssues(project: Project): ContrastIssue[] {
  if (!project.meta.header) return [];
  return headerTextIssues(
    project.theme,
    project.meta.header,
    project.pages.map((p) => firstSectionBackground(p.sections)),
  );
}

/** CSS custom properties for the header, from validated theme hex values only. */
export function headerToCss(project: Project): string {
  const header = project.meta.header;
  if (!header) return '';
  const { bg, fg } = headerColors(project.theme, header);
  // A button the same color as the header would vanish: use the header's own pair inverted.
  const accent = project.theme.colors.accent;
  const blends = contrastRatio(accent, bg) < 3;
  const btnBg = blends ? fg : accent;
  const btnFg = blends ? bg : project.theme.colors.accentText;
  return `.hdr {\n  --hdr-bg: ${bg};\n  --hdr-fg: ${fg};\n  --hdr-btn-bg: ${btnBg};\n  --hdr-btn-fg: ${btnFg};\n}\n`;
}
