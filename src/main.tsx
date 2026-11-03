import { ThemeProvider, applyTheme, type ThemeDefinition } from '@agiler/ui';
import '@agiler/ui/tokens.css';
import '@agiler/ui/themes.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import theme from '../theme.json';
import { App } from './App';

applyTheme(theme as ThemeDefinition);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme as ThemeDefinition}>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
