import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/schibsted-grotesk/400.css';
import '@fontsource/schibsted-grotesk/500.css';
import '@fontsource/schibsted-grotesk/600.css';
import '@fontsource/schibsted-grotesk/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/screens.css';
import { App } from './App';

const el = document.getElementById('root');
if (!el) throw new Error('missing #root');

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
