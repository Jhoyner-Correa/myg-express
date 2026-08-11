const test = require('node:test');
const assert = require('node:assert/strict');

const {
  assertEntitySede,
  resolveSedeScope,
  SedeScopeError
} = require('../dist/core/auth/sedeScope');
const { requirePermission } = require('../dist/core/middlewares/permissionMiddleware');

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

test('superadmin omite comprobacion de permiso', () => {
  const middleware = requirePermission('rrhh.ver');
  let nextCalled = false;
  middleware(requestFor({ sedeId: null, superadmin: true }), {}, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
