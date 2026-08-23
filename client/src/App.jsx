import React from 'react';
import { Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';

import { Shell } from './components/Shell.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Studio from './pages/Studio.jsx';
import Preview from './pages/Preview.jsx';

import './App.css';
import './modern-mobile.css';
import './studio.css';

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/generate" element={<Studio />} />
        <Route path="/preview" element={<Navigate to="/preview/Home" replace />} />
        <Route path="/preview/:pageName" element={<Preview />} />
      </Routes>
    </Shell>
  );
}
