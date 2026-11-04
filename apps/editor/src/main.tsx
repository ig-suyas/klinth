import './lib/zod-config.ts';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App, ErrorBoundary } from './App.tsx';
import './index.css';
import { installEditorFonts } from './lib/fonts.ts';

try {
  installEditorFonts();
} catch {
  // Fonts are a nicety: the system fonts are used instead.
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
