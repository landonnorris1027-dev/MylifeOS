import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { LanguageProvider } from './contexts/LanguageContext';
import ErrorBoundary from './components/ErrorBoundary';
import { KEYS } from './services/storage/localStorageStore';
import { hydrateNativePreferences } from './services/storage/nativePreferences';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const renderApp = () => {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <LanguageProvider>
        <ErrorBoundary
          title="Application failed to start"
          message="The app hit an unexpected error while rendering. Try reloading this view."
          resetLabel="Reload app"
          className="min-h-screen bg-[#F7F7F5] p-6 flex items-center justify-center"
        >
          <App />
        </ErrorBoundary>
      </LanguageProvider>
    </React.StrictMode>
  );
};

hydrateNativePreferences(Object.values(KEYS))
  .catch((error) => {
    console.error('MyLifeOS: Failed to hydrate native preferences; using WebView storage.', error);
  })
  .finally(renderApp);
