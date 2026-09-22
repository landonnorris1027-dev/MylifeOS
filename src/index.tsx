import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { LanguageProvider } from './contexts/LanguageContext';
import ErrorBoundary from './components/ErrorBoundary';
import StorageBoundary from './components/StorageBoundary';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

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
        <StorageBoundary><App /></StorageBoundary>
      </ErrorBoundary>
    </LanguageProvider>
  </React.StrictMode>
);
