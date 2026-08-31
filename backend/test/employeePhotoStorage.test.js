const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EMPLOYEE_PHOTO_PUBLIC_PREFIX,
  EmployeePhotoStorageService,
  detectEmployeePhoto,
} = require('../dist/modules/rrhh/services/EmployeePhotoStorageService');

test('detecta formatos de imagen permitidos por su firma real', () => {
  assert.equal(detectEmployeePhoto(Buffer.from([0xff, 0xd8, 0xff, 0x00])).mimeType, 'image/jpeg');
  assert.equal(detectEmployeePhoto(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).mimeType, 'image/png');
  assert.equal(detectEmployeePhoto(Buffer.from('RIFF0000WEBP')).mimeType, 'image/webp');
  assert.equal(detectEmployeePhoto(Buffer.from('<script>alert(1)</script>')), null);
});

test('rechaza discrepancias entre MIME declarado y contenido', async () => {
  const service = new EmployeePhotoStorageService();
  await assert.rejects(
    service.save(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/png'),
    error => error.code === 'INVALID_EMPLOYEE_PHOTO' && error.statusCode === 415,
  );
});

test('no elimina rutas externas ni intentos de traversal', async () => {
  const service = new EmployeePhotoStorageService();
  assert.equal(await service.removeManaged('https://example.com/photo.jpg'), false);
  assert.equal(await service.removeManaged(`${EMPLOYEE_PHOTO_PUBLIC_PREFIX}../secret.jpg`), false);
  assert.equal(await service.removeManaged(`${EMPLOYEE_PHOTO_PUBLIC_PREFIX}not-a-uuid.jpg`), false);
});
