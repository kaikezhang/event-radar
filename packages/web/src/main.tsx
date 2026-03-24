import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource/inter/index.css';
import { App } from './App.js';
import { applyStoredFontScaleGuard } from './lib/font-scale.js';
import { applyDarkModeGuard } from './lib/theme-guard.js';
import { registerPwaServiceWorker } from './lib/pwa.js';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
    },
  },
});

applyDarkModeGuard();
applyStoredFontScaleGuard();
registerPwaServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
