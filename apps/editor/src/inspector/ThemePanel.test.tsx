import { THEME_PRESETS, addPage, blankProject } from '@klinth/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from '../state/store.ts';
import { ThemePanel } from './ThemePanel.tsx';

/** The value, or a failed test when it is missing. */
function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('missing value');
  return value;
}

const project = () => useEditor.getState().project;

beforeEach(() => {
  act(() => useEditor.getState().open('p1', blankProject(), 1));
});

describe('site style panel', () => {
  it('applies a preset in one click and keeps it editable', () => {
    render(<ThemePanel />);
    const looks = screen.getByRole('group', { name: 'Ready-made looks' });
    expect(within(looks).getAllByRole('button')).toHaveLength(THEME_PRESETS.length);
    const midnight = THEME_PRESETS.find((p) => p.id === 'midnight');
    fireEvent.click(within(looks).getByRole('button', { name: /Midnight/ }));
    expect(project()?.theme.colors).toEqual(midnight?.colors);
    expect(project()?.theme.fonts).toEqual(midnight?.fonts);
    expect(project()?.theme.preset).toBe('midnight');
    expect(within(looks).getByRole('button', { name: /Midnight/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Editing a color afterwards works and the look is no longer marked as the preset.
    fireEvent.change(screen.getByLabelText('Accent', { exact: true }), {
      target: { value: '#ffcc00' },
    });
    expect(project()?.theme.colors.accent).toBe('#ffcc00');
    expect(project()?.theme.preset).toBeUndefined();
  });

  it('edits site-wide CSS and JavaScript behind a trust notice', () => {
    render(<ThemePanel />);
    const area = screen.getByRole('region', { name: 'Custom code for every page' });
    expect(area).toHaveTextContent(
      'This code runs on your published site. Only paste code you trust.',
    );
    fireEvent.change(within(area).getByLabelText(/Custom CSS/), {
      target: { value: 'h1 { letter-spacing: 0 }' },
    });
    fireEvent.change(within(area).getByLabelText(/Custom JavaScript/), {
      target: { value: 'console.log(1);' },
    });
    expect(project()?.siteCode).toEqual({ css: 'h1 { letter-spacing: 0 }', js: 'console.log(1);' });
    expect(area).toHaveTextContent('24 bytes of 200 KB');
  });

  it('refuses site-wide code over about 200 KB and says why', () => {
    render(<ThemePanel />);
    const area = screen.getByRole('region', { name: 'Custom code for every page' });
    fireEvent.change(within(area).getByLabelText(/Custom JavaScript/), {
      target: { value: 'a'.repeat(200_001) },
    });
    expect(project()?.siteCode?.js ?? '').toBe('');
    expect(within(area).getByRole('alert')).toHaveTextContent('Keep custom code under 200 KB');
  });

  it('changes the header style with keyboard-friendly radio buttons', () => {
    render(<ThemePanel />);
    const group = screen.getByRole('group', { name: 'Header style' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.getAttribute('value'))).toEqual([
      'bar',
      'pill',
      'centered',
      'minimal',
    ]);
    expect(within(group).getByLabelText(/Top bar/)).toBeChecked();
    fireEvent.click(within(group).getByLabelText(/Floating pill/));
    expect(project()?.meta.headerStyle).toBe('pill');
    expect(within(group).getByLabelText(/Floating pill/)).toBeChecked();
  });
});

describe('header settings', () => {
  const header = () => project()?.meta.header;
  const region = () => screen.getByRole('region', { name: 'Header' });

  it('comes first, above the other collapsible sections', () => {
    const { container } = render(<ThemePanel />);
    const summaries = [...container.querySelectorAll('details > summary')].map((s) =>
      s.textContent?.trim(),
    );
    expect(summaries).toEqual([
      'Header',
      'Footer',
      'Details',
      'Ready-made looks',
      'Colors',
      'Fonts',
      'Shape and space',
      'Custom code',
    ]);
    const details = container.querySelectorAll('details');
    expect(details[0]).toHaveAttribute('open');
    // The style picker is the first control in the header section.
    const legends = [...region().querySelectorAll('legend')].map((l) => l.textContent);
    expect(legends.slice(0, 4)).toEqual(['Header style', 'Layout', 'Background', 'Header color']);
  });

  it('picks layout, background, color and sticky', () => {
    render(<ThemePanel />);
    expect(header()).toBeUndefined();
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Layout' })).getByLabelText(/^Floating/),
    );
    expect(header()?.layout).toBe('floating');
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Background' })).getByLabelText(/^Glass/),
    );
    expect(header()?.background).toBe('glass');
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Header color' })).getByLabelText(/^Accent/),
    );
    expect(header()?.color).toBe('accent');
    fireEvent.click(within(region()).getByLabelText(/Stay at the top/));
    expect(header()?.sticky).toBe(false);
  });

  it('keeps the pill floating', () => {
    render(<ThemePanel />);
    fireEvent.click(within(region()).getByLabelText(/Floating pill/));
    expect(within(region()).getByLabelText(/^Full width/)).toBeDisabled();
  });

  it('takes a custom color and warns when header text is hard to read', () => {
    render(<ThemePanel />);
    fireEvent.click(within(region()).getByLabelText(/^Custom/));
    fireEvent.change(within(region()).getByLabelText('Header custom color', { exact: true }), {
      target: { value: '#7a7a7a' },
    });
    expect(header()?.color).toBe('custom');
    expect(header()?.customColor).toBe('#7a7a7a');
    expect(within(region()).getByRole('status')).toHaveTextContent(
      'Header text may be hard to read',
    );
  });

  it('refuses an unsafe button link and keeps a safe one', () => {
    render(<ThemePanel />);
    const button = within(region()).getByRole('group', { name: 'Button' });
    fireEvent.change(within(button).getByLabelText('Button text'), {
      target: { value: 'Book a call' },
    });
    const link = within(button).getByLabelText('Goes to');
    fireEvent.change(link, { target: { value: 'javascript:alert(1)' } });
    expect(header()?.cta?.href ?? '').toBe('');
    expect(within(button).getByRole('alert')).toBeInTheDocument();
    fireEvent.change(link, { target: { value: 'https://example.com/book' } });
    expect(header()?.cta).toEqual({ label: 'Book a call', href: 'https://example.com/book' });
  });

  it('starts with a text logo', () => {
    render(<ThemePanel />);
    const logo = within(region()).getByRole('group', { name: 'Logo' });
    expect(within(logo).getByLabelText(/Site name as text/)).toBeChecked();
    expect(within(logo).getByRole('button', { name: /Pick a logo/ })).toBeInTheDocument();
  });
});

describe('show or remove the header', () => {
  const region = () => screen.getByRole('region', { name: 'Header' });
  const twoPages = () =>
    act(() => {
      useEditor.getState().change((p) => addPage(p, 'About').project);
    });

  it('turns the header off, hides its settings and adds it back', () => {
    render(<ThemePanel />);
    const toggle = within(region()).getByRole('switch', { name: 'Show header' });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(project()?.meta.headerEnabled).toBe(false);
    expect(useEditor.getState().notice?.text).toBe('Header removed.');
    expect(useEditor.getState().notice?.undo).toBe(true);
    expect(within(region()).queryByRole('group', { name: 'Header style' })).toBeNull();
    expect(within(region()).queryByRole('group', { name: 'Header links' })).toBeNull();
    fireEvent.click(within(region()).getByRole('button', { name: 'Add header back' }));
    expect(project()?.meta.headerEnabled).toBe(true);
    expect(within(region()).getByRole('group', { name: 'Header style' })).toBeInTheDocument();
  });

  it('warns a site with several pages that visitors lose the menu', () => {
    twoPages();
    render(<ThemePanel />);
    fireEvent.click(within(region()).getByRole('switch', { name: 'Show header' }));
    const note = "Without a header, visitors can't move between your pages unless you add links.";
    expect(within(region()).getByRole('status')).toHaveTextContent(note);
    expect(useEditor.getState().notice?.text).toContain(note);
  });

  it('hides the header on the current page only', () => {
    twoPages();
    act(() => useEditor.getState().setPage(1));
    render(<ThemePanel />);
    fireEvent.click(within(region()).getByLabelText(/Hide header on this page/));
    expect(project()?.pages[1]?.hideHeader).toBe(true);
    expect(project()?.pages[0]?.hideHeader).toBeUndefined();
  });

  it('adds header links from a list of pages and sections', () => {
    twoPages();
    render(<ThemePanel />);
    const links = within(region()).getByRole('group', { name: 'Header links' });
    fireEvent.click(within(links).getByRole('button', { name: 'Choose links myself' }));
    expect(project()?.meta.navLinks?.map((l) => l.label)).toEqual(['Home', 'About']);
    const add = within(region()).getByLabelText('Add a link to');
    fireEvent.change(add, { target: { value: 'page:about' } });
    expect(project()?.meta.navLinks?.at(-1)).toEqual({
      label: 'About',
      target: { kind: 'page', page: 'about' },
    });
    expect(project()?.meta.navLinks).toHaveLength(3);
    const remove = within(region()).getAllByRole('button', { name: 'Remove link “About”' });
    fireEvent.click(must(remove[1]));
    expect(project()?.meta.navLinks?.map((l) => l.label)).toEqual(['Home', 'About']);
  });
});

describe('footer settings', () => {
  it('turns "Back to top" off for the site and hides it on one page', () => {
    render(<ThemePanel />);
    const region = screen.getByRole('region', { name: 'Footer' });
    const toggle = within(region).getByRole('switch', { name: 'Show “Back to top”' });
    expect(toggle).toBeChecked();
    fireEvent.click(within(region).getByLabelText(/Hide “Back to top” on this page/));
    expect(project()?.pages[0]?.hideBackToTop).toBe(true);
    fireEvent.click(toggle);
    expect(project()?.meta.backToTop).toBe(false);
    expect(within(region).queryByLabelText(/on this page/)).toBeNull();
    fireEvent.click(toggle);
    expect(project()?.meta.backToTop).toBeUndefined();
  });
});
