import { createContext, useContext } from 'react';

export type UserSession = {
  id: number;
  nombre: string;
  usuario: string;
  foto?: string | null;
  rol: string;
  rol_label?: string;
  tipo_usuario?: 'SISTEMA' | 'EMPRESA';
  alcance?: 'SISTEMA' | 'EMPRESA' | 'SEDE';
  empresa_id?: number | null;
  sede_id: number | null;
  sede_ids?: number[];
  sede_nombre?: string;
  permisos?: string[];
  modulos_visibles?: string[] | null;
  estado?: 'activo' | 'inactivo';
  ultimo_acceso_at?: string | null;
  password_actualizado_at?: string | null;
};

export type AuthContextType = {
  user: UserSession | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: UserSession) => void;
  logout: () => void;
  updateUser?: (updated: Partial<UserSession>) => void;
  isAuthenticated: boolean;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) throw new Error('useAuth debe usarse dentro de un AuthProvider');
  return context;
}
