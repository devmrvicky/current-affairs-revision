import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { reconcileSessionsOnBoot } from './services/sessionManager';

// Anything still "running" at startup can't be on screen: stop its clock at its last heartbeat
// (covers a browser killed without a chance to suspend the test).
reconcileSessionsOnBoot();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
