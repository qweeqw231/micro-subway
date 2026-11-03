import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import { t } from './i18n';
import './styles.css';

document.title = t('app.title');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
