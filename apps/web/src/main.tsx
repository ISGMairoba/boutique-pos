import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.tsx';
import { initTheme } from './app/theme.ts';
import { appName } from './lib/env.ts';
import './index.css';

initTheme();
document.title = appName;

const root = document.getElementById('root');
if (!root) throw new Error('The page is missing its #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
