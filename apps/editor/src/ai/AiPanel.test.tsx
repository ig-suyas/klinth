import { serializeProject, type Project, type Section } from '@klinth/core';
import { getTemplate } from '@klinth/templates';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { Inspector } from '../inspector/Inspector.tsx';
import { addSection } from '../state/sections.ts';
import { useEditor } from '../state/store.ts';
import { NoticeBar } from '../ui/Notice.tsx';
import { QuotaBanner } from './QuotaBanner.tsx';
import { useAi } from './store.ts';

const KEY = 'AIzaSyTestKey_0123456789abcdefghijk';

let fetchMock: MockInstance<typeof fetch>;

function openPortfolio(): Section {
  const template = getTemplate('portfolio');
  if (!template) throw new Error('missing template');
  const project: Project = template.create();
  useEditor.getState().open('p1', project, 1);
  const hero = project.pages[0]?.sections.find((s) => s.type === 'hero');
  if (!hero) throw new Error('no hero');
  return hero;
}

function selectWithAi(id: string, key: string | null = KEY) {
  act(() => {
    useEditor.getState().select(id);
    if (key) useAi.getState().unlock(key, false);
    useAi.getState().openPanel(id);
  });
}

function ui() {
  return render(
    <>
      <QuotaBanner />
      <Inspector />
      <NoticeBar />
    </>,
  );
}

const sectionOnPage = (id: string) =>
  useEditor.getState().project?.pages[0]?.sections.find((s) => s.id === id);

async function ask(text: string) {
  const panel = await screen.findByRole('region', { name: 'AI helper' });
  fireEvent.change(within(panel).getByLabelText('What do you want?'), { target: { value: text } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Ask AI' }));
  return panel;
}

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  useEditor.getState().close();
  useAi.setState({ key: null, saved: false, quotaHit: false, panelFor: null });
  localStorage.clear();
});

describe('AI panel', () => {
  it('asks for a key first, with the honest choices', async () => {
    const hero = openPortfolio();
    selectWithAi(hero.id, null);
    ui();
    const panel = await screen.findByRole('region', { name: 'AI helper' });
    expect(within(panel).getByLabelText('Your Gemini key')).toHaveAttribute('type', 'password');
    expect(within(panel).getByLabelText('Passphrase')).toBeInTheDocument();
  });

  it('applies the answer as one undoable change and never puts the key in the project', async () => {
    const hero = openPortfolio();
    selectWithAi(hero.id);
    ui();
    fetchMock.mockResolvedValueOnce(
      Response.json({
        section: { ...hero, props: { ...hero.props, heading: 'Quiet, careful work' } },
      }),
    );
    await ask('Make the heading calmer');
    await screen.findByText('The AI updated this section.');
    expect(sectionOnPage(hero.id)?.props).toMatchObject({ heading: 'Quiet, careful work' });
    const project = useEditor.getState().project;
    expect(project && serializeProject(project)).not.toContain(KEY);

    expect(screen.getByText('Changed: Heading.')).toBeInTheDocument();

    const panel = screen.getByRole('region', { name: 'AI helper' });
    fireEvent.click(within(panel).getByRole('button', { name: 'Undo' }));
    expect(sectionOnPage(hero.id)?.props).toEqual(hero.props);
    expect(await within(panel).findByLabelText('What do you want?')).toBeInTheDocument();
  });

  it('shows the quota banner when the Gemini limit is used up, and editing keeps working', async () => {
    const hero = openPortfolio();
    selectWithAi(hero.id);
    ui();
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { code: 'quota', error: 'Your Gemini limit is reached. Free-tier limits reset daily.' },
        { status: 429 },
      ),
    );
    await ask('Shorter');
    const banner = await screen.findByText('Your Gemini limit is reached.');
    expect(banner.closest('[role="status"]')).toHaveTextContent('Free-tier limits reset daily.');
    expect(sectionOnPage(hero.id)?.props).toEqual(hero.props);
    const settings = screen.getByRole('complementary', { name: 'Settings' });
    fireEvent.change(within(settings).getByLabelText('Heading'), { target: { value: 'By hand' } });
    expect(sectionOnPage(hero.id)?.props).toMatchObject({ heading: 'By hand' });
    fireEvent.click(screen.getByRole('button', { name: 'Hide this message' }));
    await waitFor(() => expect(screen.queryByText('Your Gemini limit is reached.')).toBeNull());
  });

  it('rejects an invalid answer and leaves the section alone', async () => {
    const hero = openPortfolio();
    selectWithAi(hero.id);
    ui();
    fetchMock.mockResolvedValueOnce(
      Response.json({ section: { ...hero, props: { heading: 'x', script: '<script>' } } }),
    );
    const panel = await ask('Anything');
    expect(await within(panel).findByRole('alert')).toHaveTextContent('did not fit this section');
    expect(sectionOnPage(hero.id)?.props).toEqual(hero.props);
  });

  it('offers a different key when Gemini refuses this one', async () => {
    const hero = openPortfolio();
    selectWithAi(hero.id);
    ui();
    fetchMock.mockResolvedValueOnce(
      Response.json({ code: 'bad_key', error: 'Gemini did not accept this key.' }, { status: 401 }),
    );
    const panel = await ask('Anything');
    fireEvent.click(await within(panel).findByRole('button', { name: 'Use a different key' }));
    expect(useAi.getState().key).toBeNull();
    expect(await within(panel).findByLabelText('Your Gemini key')).toBeInTheDocument();
  });

  it('needs an explicit confirm before using AI-written code', async () => {
    openPortfolio();
    act(() => {
      useEditor.getState().change((p) => addSection(p, 0, 'customCode', null).project);
    });
    const code = useEditor
      .getState()
      .project?.pages[0]?.sections.find((s) => s.type === 'customCode');
    if (!code) throw new Error('no code section');
    selectWithAi(code.id);
    ui();
    fetchMock.mockResolvedValueOnce(
      Response.json({ section: { ...code, props: { code: '<div class="glow">Hi</div>' } } }),
    );
    await ask('A soft animated background');
    const use = await screen.findByRole('button', { name: 'Use this code' });
    expect(screen.getByLabelText('Code from the AI')).toHaveTextContent(
      '<div class="glow">Hi</div>',
    );
    const panel = screen.getByRole('region', { name: 'AI helper' });
    expect(within(panel).getByText(/This code runs on your published site/)).toBeInTheDocument();
    expect(use).toBeDisabled();
    expect(sectionOnPage(code.id)?.props).toEqual(code.props);

    fireEvent.click(screen.getByLabelText('I have read this code and I trust it'));
    fireEvent.click(use);
    expect(sectionOnPage(code.id)?.props).toEqual({ code: '<div class="glow">Hi</div>' });
  });
});
