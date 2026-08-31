const assert = require('node:assert/strict');
const test = require('node:test');
const bcrypt = require('bcrypt');
const { AuthService } = require('../dist/modules/auth/auth.service');

async function repositoryFixture() {
  const passwordHash = await bcrypt.hash('ActualSegura!123', 4);
  const user = {
    id: 3,
    nombre: 'Renzo Administrador',
    usuario: 'renzo_admin',
    passwordHash,
    tipoUsuario: 'EMPRESA',
    estado: 'activo',
    ultimoAccesoAt: null,
    passwordActualizadoAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let update = null;
  return {
    repository: {
      buscarPorUsuario: async () => user,
      buscarPorId: async () => user,
      registrarUltimoAcceso: async () => undefined,
      actualizarPerfil: async (id, nombre, usuario, password) => {
        update = { id, nombre, usuario, password };
        return true;
      },
    },
    getUpdate: () => update,
  };
}

test('actualizarPerfil normaliza datos y persiste una contraseña fuerte', async () => {
  const fixture = await repositoryFixture();
  const service = new AuthService(fixture.repository);

  await service.actualizarPerfil(3, '  Renzo Morales  ', ' renzo_admin ', 'ActualSegura!123', 'NuevaSegura!123');

  const update = fixture.getUpdate();
  assert.equal(update.nombre, 'Renzo Morales');
  assert.equal(update.usuario, 'renzo_admin');
  assert.equal(await bcrypt.compare('NuevaSegura!123', update.password), true);
});

test('actualizarPerfil rechaza contraseñas débiles antes de persistir', async () => {
  const fixture = await repositoryFixture();
  const service = new AuthService(fixture.repository);

  await assert.rejects(
    service.actualizarPerfil(3, 'Renzo Morales', 'renzo_admin', 'ActualSegura!123', 'debil123'),
    /12 caracteres/,
  );
  assert.equal(fixture.getUpdate(), null);
});

test('actualizarPerfil exige la contraseña actual al cambiar el usuario de acceso', async () => {
  const fixture = await repositoryFixture();
  const service = new AuthService(fixture.repository);

  await assert.rejects(
    service.actualizarPerfil(3, 'Renzo Administrador', 'renzo.nuevo', '', undefined),
    /contraseña actual/,
  );
  assert.equal(fixture.getUpdate(), null);
});
