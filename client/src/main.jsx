// client/src/main.jsx
//
// The app root. Three things get attached here and nowhere else: the Redux
// store, the router, and the Tailwind stylesheet.
//
// CONTRACT.md §5.2 — the store mounts the cms slice under the key `cms`. Every
// generated component reads `state.cms.allSections[pageName]` (§5, R4), so the
// namespace is contract surface, not a naming choice. The reducer map itself
// lives in ./redux/reducers.js so it stays testable without node_modules.
//
// The store is exported as well as used, so a test or a devtool can reach the
// same instance the app is running rather than constructing a second one.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import { reducerMap } from './redux/reducers.js';
import './index.css';

export const store = configureStore({ reducer: reducerMap });

const container = document.getElementById('root');
if (!container) {
  // Fail loudly rather than rendering into nothing. A silent no-op here looks
  // exactly like a build problem and wastes an hour finding it.
  throw new Error('main.jsx: #root is missing from index.html — nothing to mount into.');
}

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>,
);
