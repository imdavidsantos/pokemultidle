import React from 'react';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary.jsx';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
