import { ThemeProvider, type ThemeDefinition } from '@agiler/ui';
import '@agiler/ui/tokens.css';
import '@agiler/ui/themes.css';
import './styles/theme.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import theme from '../theme.json';
import { App } from './App';

// index.html resolves the stored/OS theme before paint. Do not force light here;
// ThemeProvider applies non-color branding while preserving that preference.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme as ThemeDefinition}>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
