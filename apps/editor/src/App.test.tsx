import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App.tsx';
import { closeStorage, listProjects } from './lib/storage.ts';
import { useEditor } from './state/store.ts';

afterEach(async () => {
  useEditor.getState().close();
  localStorage.clear();
  await closeStorage();
  indexedDB.deleteDatabase('klinth');
});

describe('App', () => {
  it('starts with the template picker and an empty project list', async () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { name: 'Make a website you are proud of.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Personal portfolio/ })).toBeInTheDocument();
    expect(await screen.findByText(/Nothing saved yet/)).toBeInTheDocument();
  });

  it('opens a template in the editor and saves it to the browser', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Small business/ }));
    const sections = await screen.findByRole('navigation', { name: 'Sections' });
    expect(within(sections).getAllByRole('listitem').length).toBeGreaterThan(3);
    expect(screen.getByTitle('Preview of your site')).toHaveAttribute('sandbox', 'allow-scripts');
    expect(await listProjects()).toHaveLength(1);
  });

  it('edits a section from the inspector and can undo it', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Personal portfolio/ }));
    const sections = await screen.findByRole('navigation', { name: 'Sections' });
    fireEvent.click(
      within(sections).getAllByRole('button', { name: /Big intro/ })[1] as HTMLElement,
    );
    const settings = screen.getByRole('complementary', { name: 'Settings' });
    const heading = await within(settings).findByLabelText('Heading');
    fireEvent.change(heading, { target: { value: 'A brand new headline' } });
    expect(within(sections).getByText('A brand new headline')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() =>
      expect(within(sections).queryByText('A brand new headline')).not.toBeInTheDocument(),
    );
  });

  it('shows a plain message when a link is not valid yet', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Personal portfolio/ }));
    const sections = await screen.findByRole('navigation', { name: 'Sections' });
    fireEvent.click(within(sections).getAllByRole('button', { name: /Contact/ })[1] as HTMLElement);
    const settings = screen.getByRole('complementary', { name: 'Settings' });
    const address = await within(settings).findByLabelText('Form service address');
    fireEvent.change(address, { target: { value: 'javascript:alert(1)' } });
    expect(within(settings).getByRole('alert')).toHaveTextContent('Start with https://');
    expect(JSON.stringify(useEditor.getState().project)).not.toContain('javascript:');
  });
});
