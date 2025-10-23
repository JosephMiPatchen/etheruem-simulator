import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import SimulatorContent from '../pages/SimulatorContent';
import EPMDemo from '../pages/EPMDemo';

/**
 * Application router component that handles all routes
 */
const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/simulator" replace />} />
        <Route path="/simulator" element={<SimulatorContent />} />
        <Route path="/epm-demo" element={<EPMDemo />} />
        <Route path="*" element={<Navigate to="/simulator" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default AppRouter;
