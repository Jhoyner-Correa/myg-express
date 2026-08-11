import { createContext, useContext } from 'react';

export type UserSession = {
  id: number;
  nombre: string;
  usuario: string;
  rol: string;
  es_superadmin: boolean;
  sede_id: number | null;
  sede_nombre?: string;
  permisos?: string[];
};

export type AuthContextType = {
  user: UserSession | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: UserSession) => void;
  logout: () => void;
  isAuthenticated: boolean;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth debe usarse dentro de un AuthProvider');
  return context;
}
