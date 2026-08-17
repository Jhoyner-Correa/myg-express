// ============================================================
// frontend-react/src/core/auth/AuthContext.tsx
// Contexto global para la gestión de la sesión y autenticación
// ============================================================

import React, { useState, useEffect } from 'react';
import { AuthContext } from './authState';
import type { UserSession } from './authState';
import { apiClient } from '../api/apiClient';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSession | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (!storedToken || !storedUser) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setToken(storedToken);

    try {
      setUser(JSON.parse(storedUser));
    } catch (error) {
      console.error('Error parseando sesión guardada:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setToken(null);
      setLoading(false);
      return;
    }

    void apiClient.get<{ user: UserSession }>('/auth/perfil', { signal: controller.signal })
      .then(({ data }) => {
        localStorage.setItem('user', JSON.stringify(data.user));
        setUser(data.user);
      })
      .catch(error => {
        if (!controller.signal.aborted) {
          console.warn('No se pudo actualizar el perfil de la sesión:', error);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const login = (newToken: string, newUser: UserSession) => {
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const updateUser = (updated: Partial<UserSession>) => {
    setUser(current => {
      if (!current) return current;
      const next = { ...current, ...updated };
      localStorage.setItem('user', JSON.stringify(next));
      return next;
    });
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};
