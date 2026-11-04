import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, ErrorBoundary, isLoadError } from './App.tsx';
import { closeStorage, listProjects } from './lib/storage.ts';
import { useEditor } from './state/store.ts';

afterEach(async () => {
  useEditor.getState().close();
  localStorage.clear();
  await closeStorage();
  indexedDB.deleteDatabase('klinth');
});

// The first lazy screen can take several seconds while every other test file runs in parallel.
const COLD_LOAD_MS = 15_000;

describe('App', { timeout: 30_000 }, () => {
  it('starts with the template picker and an empty project list', async () => {
    render(<App />);
    expect(
      // The first lazy screen can take over a second while other test files run in parallel.
      await screen.findByRole(
        'heading',
        { name: 'Make a website you are proud of.' },
        { timeout: COLD_LOAD_MS },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Personal portfolio/ })).toBeInTheDocument();
    expect(await screen.findByText(/Nothing saved yet/)).toBeInTheDocument();
  });

  it('opens a template in the editor and saves it to the browser', async () => {
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Small business/ }, { timeout: COLD_LOAD_MS }),
    );
    const sections = await screen.findByRole(
      'navigation',
      { name: 'Sections' },
      { timeout: COLD_LOAD_MS },
    );
    expect(within(sections).getAllByRole('listitem').length).toBeGreaterThan(3);
    expect(screen.getByTitle('Preview of your site')).toHaveAttribute('sandbox', 'allow-scripts');
    expect(await listProjects()).toHaveLength(1);
  });

  it('edits a section from the inspector and can undo it', async () => {
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Personal portfolio/ }, { timeout: COLD_LOAD_MS }),
    );
    const sections = await screen.findByRole(
      'navigation',
      { name: 'Sections' },
      { timeout: COLD_LOAD_MS },
    );
    fireEvent.click(
      within(sections).getAllByRole('button', { name: /Big intro/ })[1] as HTMLElement,
    );
    const settings = screen.getByRole('complementary', { name: 'Settings' });
    const heading = await within(settings).findByLabelText(
      'Heading',
      {},
      { timeout: COLD_LOAD_MS },
    );
    fireEvent.change(heading, { target: { value: 'A brand new headline' } });
    expect(within(sections).getByText('A brand new headline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(within(sections).queryByText('A brand new headline')).not.toBeInTheDocument(),
    );
  });

  it('shows a plain message when a link is not valid yet', async () => {
    render(<App />);
    fireEvent.click(
      await screen.findByRole('button', { name: /Personal portfolio/ }, { timeout: COLD_LOAD_MS }),
    );
    const sections = await screen.findByRole(
      'navigation',
      { name: 'Sections' },
      { timeout: COLD_LOAD_MS },
    );
    fireEvent.click(within(sections).getAllByRole('button', { name: /Contact/ })[1] as HTMLElement);
    const settings = screen.getByRole('complementary', { name: 'Settings' });
    const address = await within(settings).findByLabelText('Form service address');
    fireEvent.change(address, { target: { value: 'javascript:alert(1)' } });
    expect(within(settings).getByRole('alert')).toHaveTextContent('Start with https://');
    expect(JSON.stringify(useEditor.getState().project)).not.toContain('javascript:');
  });
});

describe('isLoadError', () => {
  it('spots failed downloads of lazily loaded parts in Chrome, Firefox and Safari', () => {
    expect(isLoadError(new TypeError('Failed to fetch dynamically imported module: /a.js'))).toBe(
      true,
    );
    expect(isLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });
});

describe('ErrorBoundary', () => {
  function Broken(): never {
    throw new Error('boom');
  }

  it('shows a way out instead of a blank page, and asks before deleting local data', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset local data' }));
    expect(screen.getByText(/It cannot be undone/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yes, delete local data' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('button', { name: 'Yes, delete local data' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reset local data' })).toBeInTheDocument();
    quiet.mockRestore();
  });
});
