export type AccessScopeType = 'SISTEMA' | 'EMPRESA' | 'SEDE';
export type SystemUserType = 'SISTEMA' | 'EMPRESA';
export type SystemUserStatus = 'activo' | 'inactivo';

export type AccessModule = {
  code: string;
  name: string;
};

export type SystemUser = {
  id: number;
  name: string;
  username: string;
  foto: string | null;
  avatar_variant: 'male' | 'female';
  userType: SystemUserType;
  status: SystemUserStatus;
  lastAccessAt: string | null;
  passwordUpdatedAt: string | null;
  createdAt: string;
  role: { code: string; name: string };
  scope: {
    type: AccessScopeType;
    companyId: number | null;
    companyName: string | null;
    siteId: number | null;
    siteName: string | null;
    label: string;
  };
  access: { moduleCount: number; modules: AccessModule[] };
  security: { passwordConfigured: boolean; passwordUpdatedAt: string | null };
  protected: boolean;
};

export type SystemUserDetail = SystemUser & {
  recentActivity: Array<{ event: string; ip: string | null; createdAt: string }>;
};

export type AccessRole = {
  id: number;
  code: string;
  name: string;
  userType: SystemUserType;
  scopeType: AccessScopeType;
  description: string | null;
  permissionCount: number;
  managed: boolean;
  modules: AccessModule[];
};

export type AccessCatalog = {
  company: { id: number; nombre: string } | null;
  roles: AccessRole[];
};

export type SiteOption = {
  id: number;
  nombre: string;
  estado: 'activo' | 'inactivo';
};

export type SaveSystemUser = {
  nombre: string;
  usuario: string;
  password?: string;
  avatar_variant: 'male' | 'female';
  role_code: string;
  sede_id: number | null;
  estado: SystemUserStatus;
  module_codes: string[];
};

export type ChangeSystemUserPassword = {
  nueva_password: string;
  password_actual?: string;
};

export type UpdateMyModuleAccessResult = {
  modulos_visibles: string[];
  permisos: string[];
};
