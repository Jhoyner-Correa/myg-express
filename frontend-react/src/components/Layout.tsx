// ============================================================
// frontend-react/src/components/Layout.tsx
// Contenedor principal con el Sidebar y maquetación original
// ============================================================

import React, { useState } from 'react';
import { useAuth } from '../core/auth/authState';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { sidebarMenuConfig } from '../config/menuConfig';
import type { MenuItem } from '../config/menuConfig';

export const Layout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Estado para expandir/colapsar el menú de "WhatsApp Masivo"
  const [massSendOpen, setMassSendOpen] = useState(true);

  const getRoleLabel = () => {
    if (!user) return 'OPERADOR DEL SISTEMA';
    if (user.es_superadmin) return 'SYSADMIN';
    const rawRole = String(user.rol || '').toLowerCase().replace(/[\s_-]+/g, '');
    if (rawRole === 'sysadmin' || rawRole.includes('sysadmin')) {
      return 'SYSADMIN';
    }
    if (rawRole === 'adminempresa' || rawRole === 'admingeneral' || rawRole === 'administradorgeneral') {
      return 'ADMINISTRADOR GENERAL';
    }
    return 'OPERADOR DEL SISTEMA';
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const canShowItem = (item: MenuItem | Omit<MenuItem, 'group'>): boolean => {
    if (item.alwaysShow) return true;

    // Si tiene hijos, mostrar si al menos uno de ellos es visible
    if ('children' in item && item.children && item.children.length > 0) {
      return item.children.some(child => canShowItem(child));
    }

    // Validar restricción por rol
    if (item.roles && item.roles.length > 0) {
      if (!user?.rol || !item.roles.includes(user.rol)) {
        return false;
      }
    }

    // Validar restricción por permiso
    if (item.permission) {
      if (!user?.permisos?.includes(item.permission)) {
        return false;
      }
    }

    return true;
  };

  return (
    <div className="app-wrapper">
      {/* SIDEBAR ORIGINAL */}
      <aside className="sidebar" id="app-sidebar" data-collapsed="false" data-sidebar-ready="true">
        <div className="sidebar__scroll">
          <div className="sidebar__header">
            <a 
              className="sidebar__brand" 
              href="#" 
              onClick={(e) => {
                e.preventDefault();
                navigate('/dashboard');
              }}
              aria-label="MyG Express"
            >
              <span className="sidebar__logo-wrap">
                <img className="sidebar__logo" src="/img/logoblanco.png" alt="MyG Express" />
              </span>
              <span className="sidebar__brand-text">
                <span className="sidebar__brand-role" id="sidebar-role-label">
                  {getRoleLabel()}
                </span>
              </span>
            </a>
          </div>

          <nav className="sidebar__nav" aria-label="Menu principal">
            {sidebarMenuConfig.filter(canShowItem).map((item, index) => {
              if (item.children) {
                return (
                  <div key={index} className="sidebar__section sidebar-section" data-group={item.group}>
                    <button 
                      className="sidebar__link sidebar__section-header" 
                      type="button" 
                      aria-expanded={massSendOpen}
                      onClick={() => setMassSendOpen(!massSendOpen)}
                      title={item.title}
                    >
                      <span className="sidebar__link-icon">{item.icon}</span>
                      <span className="sidebar__link-text">{item.title}</span>
                      <svg className="sidebar__section-arrow" viewBox="0 0 24 24" aria-hidden="true" style={{ transform: massSendOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </button>

                    <div className={`sidebar__section-body ${massSendOpen ? '' : 'collapsed'}`} style={{ display: massSendOpen ? 'block' : 'none' }}>
                      <div className="sidebar__menu sidebar__menu--nested">
                        {item.children.filter(canShowItem).map((child, cIdx) => (
                          <a 
                            key={cIdx}
                            href={child.path} 
                            className={`nav-item sidebar__sub-link ${location.pathname === child.path ? 'active' : ''}`} 
                            onClick={(e) => { e.preventDefault(); if (child.path) navigate(child.path); }}
                            title={child.title}
                          >
                            <span className="sidebar__sub-icon">{child.icon}</span>
                            <span>{child.title}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={index} className="sidebar__section sidebar-section" data-group={item.group}>
                  {item.group === 'administration' ? (
                    <div className="sidebar__menu">
                      <a 
                        href={item.path} 
                        className={`nav-item sidebar__link ${location.pathname === item.path ? 'active' : ''}`} 
                        onClick={(e) => { e.preventDefault(); if (item.path) navigate(item.path); }}
                        title={item.title}
                      >
                        <span className="sidebar__link-icon">{item.icon}</span>
                        <span className="sidebar__link-text">{item.title}</span>
                      </a>
                    </div>
                  ) : (
                    <a 
                      href={item.path} 
                      className={`nav-item sidebar__link ${location.pathname === item.path ? 'active' : ''}`} 
                      onClick={(e) => { e.preventDefault(); if (item.path) navigate(item.path); }}
                      title={item.title}
                    >
                      <span className="sidebar__link-icon">{item.icon}</span>
                      <span className="sidebar__link-text">{item.title}</span>
                    </a>
                  )}
                </div>
              );
            })}
          </nav>

          <div className="sidebar__spacer"></div>

          <div className="sidebar__footer">
            <div className="sidebar__user-card">
              <div className="sidebar__avatar" id="user-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.25" />
                  <circle cx="12" cy="9.55" r="2.35" />
                  <path d="M7.8 16.65c.78-2.1 2.32-3.15 4.2-3.15s3.42 1.05 4.2 3.15" />
                </svg>
              </div>
              <div className="sidebar__user-info">
                <div className="sidebar__user-name" id="user-nombre">
                  {user?.nombre || 'OPERADOR'}
                </div>
                <div className="sidebar__user-role" id="user-sede">
                  {user?.sede_nombre || 'General'}
                </div>
              </div>
              <button 
                className="sidebar__logout" 
                id="btn-logout" 
                type="button" 
                title="Cerrar sesion" 
                aria-label="Cerrar sesion"
                onClick={handleLogout}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL */}
      <Outlet />
    </div>
  );
};
