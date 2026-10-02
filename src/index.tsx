import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { LanguageProvider } from './contexts/LanguageContext';
import ErrorBoundary from './components/ErrorBoundary';
import StorageBoundary from './components/StorageBoundary';
import { isAndroid } from './services/platform';
import { bootstrapNativeStorage } from './services/nativeRuntime';
import { KEYS } from './services/storage/localStorageStore';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const render = () => ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <LanguageProvider>
      <ErrorBoundary
        title="Application failed to start"
        message="The app hit an unexpected error while rendering. Try reloading this view."
        resetLabel="Reload app"
        className="min-h-screen bg-[#F7F7F5] p-6 flex items-center justify-center"
      >
        <StorageBoundary><App /></StorageBoundary>
      </ErrorBoundary>
    </LanguageProvider>
  </React.StrictMode>
);

if (isAndroid()) void bootstrapNativeStorage(Object.values(KEYS)).then(render);
else render();
