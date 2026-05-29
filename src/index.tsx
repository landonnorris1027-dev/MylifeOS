import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './tailwind.css';
import { LanguageProvider } from './contexts/LanguageContext';
import { AppProvider } from './contexts/AppContext';
import { migrateFromLocalStorage, migrateDailyLogsFormat } from './services/storage';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

const bootstrap = async () => {
  // Execute local storage migration before the app reads persisted data.
  await migrateFromLocalStorage();
  await migrateDailyLogsFormat();

  root.render(
    <React.StrictMode>
      <LanguageProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </LanguageProvider>
    </React.StrictMode>
  );
};

void bootstrap();
