import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import { AuthProvider } from './hooks/useAuth'
import { Analytics } from '@vercel/analytics/react'
import './styles/index.css'

console.log('Main.tsx loaded');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

console.log('Root element found, rendering app...');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
      {/* Analytics removed because it only works on Vercel hosting */}
      {/* <Analytics /> */}
    </AuthProvider>
  </React.StrictMode>,
);

console.log('App rendered');
