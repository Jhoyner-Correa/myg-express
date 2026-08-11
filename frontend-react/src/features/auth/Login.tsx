// ============================================================
// frontend-react/src/features/auth/Login.tsx
// Componente de Login migrado fielmente desde login.html
// ============================================================

import React, { useState } from 'react';
import { useAuth } from '../../core/auth/authState';
import { getApiErrorMessage } from '../../core/api/errors';
import { useNavigate } from 'react-router-dom';
import { authService } from './auth.service';
import '../../css/login.css';

export const Login: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingForm, setLoadingForm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoadingForm(true);

    try {
      const session = await authService.login(usuario, password);
      login(session.token, session.user);
      navigate('/dashboard');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'No se pudo conectar con el servidor de autenticación'));
    } finally {
      setLoadingForm(false);
    }
  };

  return (
    <div className="login-container">
      {/* LEFT PANEL (Visual Logística de la Selva Central) */}
      <div className="left-panel">
        <div className="left-top-content">
          {/* Logotipo de la marca */}
          <div className="brand">
            <img src="/img/logoblanco.png" alt="MyG Express Logo" className="brand-logo" />
          </div>

          {/* Línea decorativa verde */}
          <div className="title-accent"></div>

          {/* Slogan Principal */}
          <h1 className="hero-title">
            Conectando la<br />
            <span className="highlight">Selva Central</span>
          </h1>

          {/* Subtítulo */}
          <p className="hero-subtitle">
            Administrá tus envíos, clientes y operaciones desde una única plataforma inteligente.
          </p>
        </div>
      </div>

      {/* RIGHT PANEL (Fondo Gris Claro) */}
      <div className="right-panel">
        {/* Wrapper del Formulario (Card Flotante con Glassmorphism) */}
        <div className="form-wrapper">
          {/* Logotipo móvil (Solo visible en pantallas pequeñas) */}
          <div className="mobile-logo-container">
            <img src="/img/logo.png" alt="MyG Express" className="mobile-logo" />
          </div>

          {/* Insignia Circular de Verificación */}
          <div className="card-header-icon">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>

          {/* Titles */}
          <h2 className="form-title">Bienvenido</h2>
          <p className="form-subtitle">Ingresa tus credenciales para continuar</p>

          {/* Formulario */}
          <form onSubmit={handleSubmit} id="login-form" autoComplete="off" noValidate>
            {/* Error Container */}
            {error && (
              <div id="login-error" style={{ display: 'flex' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px', color: '#ef4444', flexShrink: 0, marginRight: '8px' }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Campo Usuario */}
            <div className="form-group">
              <label htmlFor="input-usuario">Usuario</label>
              <div className="input-container">
                <input
                  type="text"
                  id="input-usuario"
                  name="usuario"
                  placeholder="tu usuario"
                  autoComplete="username"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  required
                  disabled={loadingForm}
                />
                <svg className="field-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
            </div>

            {/* Campo Contraseña */}
            <div className="form-group">
              <label htmlFor="input-password">Contraseña</label>
              <div className="input-container">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="input-password"
                  name="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loadingForm}
                />
                <svg className="field-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
                {/* Botón Mostrar/Ocultar */}
                <button
                  type="button"
                  id="toggle-password"
                  className="eye-toggle"
                  aria-label="Mostrar/Ocultar contraseña"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    /* Icono Ojo Cerrado */
                    <svg className="eye-hide" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    /* Icono Ojo Abierto */
                    <svg className="eye-show" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div className="options-row">
              <a
                href="#"
                id="forgot-password-link"
                className="forgot-link"
                onClick={(e) => {
                  e.preventDefault();
                  setShowSupportModal(true);
                }}
              >
                ¿Olvidaste tu contraseña?
              </a>
            </div>

            {/* Botón de Envío */}
            <button type="submit" id="btn-login" disabled={loadingForm}>
              {loadingForm ? <span className="spinner"></span> : 'Ingresar'}
            </button>
          </form>
        </div>

        {/* Footer Copyright */}
        <div className="right-panel-footer">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ marginRight: '4px' }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
          MyG Express &copy; 2026 — Panel Administrativo
        </div>
      </div>

      {/* Modal de Soporte para restablecer contraseña */}
      {showSupportModal && (
        <div id="support-modal" className="modal-overlay" style={{ display: 'flex' }}>
          <div className="modal-card">
            <div className="modal-icon" style={{ background: '#e0f7e9', color: '#1d7d48' }}>
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <h3 className="modal-title">Restablecer Contraseña</h3>
            <p className="modal-message">
              Para restablecer su contraseña, contáctenos vía WhatsApp al número:
            </p>
            <a href="https://wa.me/51916387639" target="_blank" rel="noopener noreferrer" className="whatsapp-link">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              916 387 639
            </a>
            <button
              type="button"
              id="close-support-modal"
              className="modal-btn"
              style={{ marginTop: '20px' }}
              onClick={() => setShowSupportModal(false)}
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
