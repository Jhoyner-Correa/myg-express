// ============================================================
// frontend-react/src/App.tsx
// Configuración de Enrutamiento y Protección de Pantallas
// ============================================================

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './core/auth/AuthContext';
import { useAuth } from './core/auth/authState';
import { Layout } from './components/Layout';
import './App.css';

const Login = lazy(() => import('./features/auth/Login').then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => import('./features/dashboard/Dashboard').then((m) => ({ default: m.Dashboard })));
const Logistica = lazy(() => import('./features/logistica/Logistica').then((m) => ({ default: m.Logistica })));
const LoteDetalle = lazy(() => import('./features/logistica/LoteDetalle').then((m) => ({ default: m.LoteDetalle })));
const WhatsAppSessions = lazy(() => import('./features/logistica/WhatsAppSessions').then((m) => ({ default: m.WhatsAppSessions })));
const GestionEntregas = lazy(() => import('./features/logistica/GestionEntregas').then((m) => ({ default: m.GestionEntregas })));
const SavarScan = lazy(() => import('./features/logistica/SavarScan').then((m) => ({ default: m.SavarScan })));
const Etiquetas = lazy(() => import('./features/logistica/Etiquetas').then((m) => ({ default: m.Etiquetas })));
const ConsultaHistorica = lazy(() => import('./features/logistica/ConsultaHistorica').then((m) => ({ default: m.ConsultaHistorica })));
const Rrhh = lazy(() => import('./features/rrhh/Rrhh').then((m) => ({ default: m.Rrhh })));
const Gps = lazy(() => import('./features/gps/Gps').then((m) => ({ default: m.Gps })));
const Admin = lazy(() => import('./features/admin/Admin').then((m) => ({ default: m.Admin })));

const PageFallback = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
    <span className="spinner" style={{ width: '40px', height: '40px' }}></span>
  </div>
);

// Guardián de Rutas Protegidas
const ProtectedRoute: React.FC<{ children: React.ReactNode; permission?: string }> = ({ children, permission }) => {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <PageFallback />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (permission && !user?.es_superadmin && !user?.permisos?.includes(permission)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export const AppContent: React.FC = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
      <Routes>
        {/* Ruta Pública de Login */}
        <Route path="/login" element={<Login />} />

        {/* Rutas Privadas Protegidas */}
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          
          <Route path="logistica" element={<ProtectedRoute permission="rutas.ver"><Logistica /></ProtectedRoute>} />
          <Route path="rutas/:id" element={<ProtectedRoute permission="rutas.ver"><LoteDetalle /></ProtectedRoute>} />
          <Route path="logistica/whatsapp" element={<ProtectedRoute permission="whatsapp.ver"><WhatsAppSessions /></ProtectedRoute>} />
          <Route path="logistica/entregas" element={<ProtectedRoute permission="entregas.ver"><GestionEntregas /></ProtectedRoute>} />
          <Route path="logistica/savar-scan" element={<ProtectedRoute permission="savarscan.ver"><SavarScan /></ProtectedRoute>} />
          <Route path="logistica/etiquetas" element={<ProtectedRoute permission="etiquetas.ver"><Etiquetas /></ProtectedRoute>} />
          <Route path="logistica/consulta" element={<ProtectedRoute permission="urbano.rutas.ver"><ConsultaHistorica /></ProtectedRoute>} />
          <Route path="rrhh" element={<ProtectedRoute permission="rrhh.ver"><Rrhh /></ProtectedRoute>} />
          <Route path="gps" element={<ProtectedRoute permission="gps.ver"><Gps /></ProtectedRoute>} />
          <Route path="admin" element={<ProtectedRoute permission="admin.panel.ver"><Admin /></ProtectedRoute>} />
        </Route>

        {/* Ruta por defecto redirecciona al login */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
