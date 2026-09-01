const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertEntitySede,
  resolveOptionalSedeScope,
  resolveSedeScope,
  SedeScopeError
} = require('../dist/core/auth/sedeScope');
const { requirePermission } = require('../dist/core/middlewares/permissionMiddleware');
const { getFinalPermissions, getPermissionsForRole, PERMISSIONS } = require('../dist/core/constants/permissions');
const {
  ACCESS_SCOPES,
  ROLES,
  getRoleLabel,
  getRoleScope,
  normalizeRole,
  roleRequiresSede,
} = require('../dist/core/constants/roles');
const { applyPermissionOverrides } = require('../dist/core/auth/accessControl');

function requestFor({ sedeId, permisos = [], superadmin = false }) {
  return {
    user: {
      id: 10,
      sede_id: sedeId,
      permisos,
      es_superadmin: superadmin
    }
  };
}

test('usuario de sede solo puede usar su propia sede', () => {
  const req = requestFor({ sedeId: 2 });
  assert.equal(resolveSedeScope(req, 2), 2);
  assert.equal(resolveSedeScope(req, undefined), 2);
  assert.throws(() => resolveSedeScope(req, 3), SedeScopeError);
});

test('rol global puede seleccionar una sede valida', () => {
  const req = requestFor({ sedeId: null });
  assert.equal(resolveSedeScope(req, 3), 3);
  assert.throws(() => resolveSedeScope(req, undefined), SedeScopeError);
});

test('rol global puede consultar todas las sedes y un usuario de sede permanece limitado', () => {
  assert.equal(resolveOptionalSedeScope(requestFor({ sedeId: null }), undefined), null);
  assert.equal(resolveOptionalSedeScope(requestFor({ sedeId: null }), 3), 3);
  assert.equal(resolveOptionalSedeScope(requestFor({ sedeId: 2 }), undefined), 2);
  assert.throws(() => resolveOptionalSedeScope(requestFor({ sedeId: 2 }), 3), SedeScopeError);
});

test('entidad de otra sede es rechazada', () => {
  const req = requestFor({ sedeId: 2 });
  assert.equal(assertEntitySede(req, 2), 2);
  assert.throws(() => assertEntitySede(req, 4), SedeScopeError);
});

test('middleware usa permisos efectivos del usuario', () => {
  const middleware = requirePermission('rrhh.ver');
  let nextCalled = false;
  const allowedReq = requestFor({ sedeId: 2, permisos: ['rrhh.ver'] });
  middleware(allowedReq, {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);

  let responseStatus = 0;
  const response = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json() {}
  };
  middleware(requestFor({ sedeId: 2, permisos: [] }), response, () => {});
  assert.equal(responseStatus, 403);
});

test('SysAdmin también usa permisos explícitos del rol', () => {
  const middleware = requirePermission('rrhh.ver');
  let nextCalled = false;
  middleware(requestFor({ sedeId: null, permisos: ['rrhh.ver'], superadmin: true }), {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('una excepción individual puede restringir pero no elevar el rol', () => {
  const effective = applyPermissionOverrides(
    [PERMISSIONS.ROUTES_VIEW, PERMISSIONS.ROUTES_MANAGE],
    [
      { codigo: PERMISSIONS.ROUTES_VIEW, efecto: 'DENEGAR' },
      { codigo: PERMISSIONS.RRHH_VIEW, efecto: 'PERMITIR' },
    ],
  );
  assert.equal(effective.includes(PERMISSIONS.ROUTES_VIEW), false);
  assert.equal(effective.includes(PERMISSIONS.ROUTES_MANAGE), true);
  assert.equal(effective.includes(PERMISSIONS.RRHH_VIEW), false);
});

test('SysAdmin obtiene capacidades por rol sin una bandera especial', () => {
  const permissions = getPermissionsForRole(ROLES.SYSADMIN);
  assert.equal(permissions.includes(PERMISSIONS.ADMIN_PANEL_VIEW), true);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_VIEW), true);
  assert.equal(permissions.includes(PERMISSIONS.ROUTES_MANAGE), true);
});

test('administrador de empresa gestiona RRHH con alcance global', () => {
  const permissions = getPermissionsForRole(ROLES.ADMIN_EMPRESA);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_VIEW), true);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_MANAGE), true);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_ATTENDANCE_MANAGE), true);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_PAYMENTS_VIEW), true);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_PAYMENTS_MANAGE), true);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_CONFIGURE), true);
});

test('gerencia controla la empresa y consulta pagos sin ejecutarlos', () => {
  const permissions = getPermissionsForRole(ROLES.GERENTE_EMPRESA);

  assert.equal(getRoleScope(ROLES.GERENTE_EMPRESA), ACCESS_SCOPES.COMPANY);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_VIEW), true);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_MANAGE), true);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_ATTENDANCE_MANAGE), true);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_PAYMENTS_VIEW), true);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_PAYMENTS_MANAGE), false);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_CONFIGURE), false);
  assert.equal(permissions.includes(PERMISSIONS.USERS_MANAGE), false);
});

test('supervisor o supervisora controla asistencia solo con alcance de sede', () => {
  const permissions = getPermissionsForRole(ROLES.SUPERVISOR_SEDE);

  assert.equal(normalizeRole('supervisora'), ROLES.SUPERVISOR_SEDE);
  assert.equal(getRoleLabel(ROLES.SUPERVISOR_SEDE), 'Supervisor/a de Sede');
  assert.equal(getRoleScope(ROLES.SUPERVISOR_SEDE), ACCESS_SCOPES.SITE);
  assert.equal(roleRequiresSede(ROLES.SUPERVISOR_SEDE), true);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_VIEW), true);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_ATTENDANCE_MANAGE), true);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_MANAGE), false);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_PAYMENTS_VIEW), false);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_CONFIGURE), false);
});

test('encargado de oficina no accede al panel administrativo de RRHH', () => {
  const permissions = getPermissionsForRole(ROLES.ENCARGADO_OFICINA);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_VIEW), false);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_MANAGE), false);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_CONFIGURE), false);
  assert.equal(permissions.includes(PERMISSIONS.GPS_VIEW), false);
});

test('permisos personalizados no pueden elevar el alcance del encargado', () => {
  const permissions = getFinalPermissions(ROLES.ENCARGADO_OFICINA, [
    PERMISSIONS.ROUTES_VIEW,
    PERMISSIONS.RRHH_VIEW,
    PERMISSIONS.ADMIN_PANEL_VIEW,
  ]);
  assert.equal(permissions.includes(PERMISSIONS.ROUTES_VIEW), true);
  assert.equal(permissions.includes(PERMISSIONS.RRHH_VIEW), false);
  assert.equal(permissions.includes(PERMISSIONS.ADMIN_PANEL_VIEW), false);
});
