import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import './styles.css';
import { AuthProvider } from './lib/auth.jsx';
import { IS_DEMO } from './lib/api.js';
import App from './App.jsx';

// The published demo is static files on a sub-path with no server rewrites, so
// hash routing is what keeps a refresh or a shared deep link from 404ing.
const Router = IS_DEMO ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  </StrictMode>
);
