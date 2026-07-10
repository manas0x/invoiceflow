/* eslint-disable react-refresh/only-export-components */
import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { initializeData } from './data/mockData'
import SetupWizard from './pages/SetupWizard.jsx'
import { hydrateSetupConfig } from './config/setupConfig'

const App = React.lazy(() => import('./App.jsx'))

const InstallerGate = () => {
  const [setupComplete, setSetupComplete] = React.useState(null);

  React.useEffect(() => {
    hydrateSetupConfig().then(config => setSetupComplete(Boolean(config)));
  }, []);

  React.useEffect(() => {
    if (setupComplete) initializeData();
  }, [setupComplete]);

  if (setupComplete === null) return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm font-bold text-white">Checking installation...</div>;
  if (!setupComplete) return <SetupWizard onComplete={() => setSetupComplete(true)} />;
  return <React.Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm font-bold text-white">Loading InvoiceFlow...</div>}><App /></React.Suspense>;
};

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    // The worker bypasses Vite source requests on localhost, so native PWA
    // install prompts can also be tested during local development.
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Offline app shell unavailable:', error.message);
    });
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <InstallerGate />
  </StrictMode>,
)
