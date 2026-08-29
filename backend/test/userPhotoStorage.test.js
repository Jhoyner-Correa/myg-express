const test = require('node:test');
const assert = require('node:assert/strict');

const {
  USER_PHOTO_PUBLIC_PREFIX,
  UserPhotoStorageService,
  detectUserPhoto,
} = require('../dist/modules/auth/services/UserPhotoStorageService');

test('valida la firma real de las fotos de usuarios', () => {
  assert.equal(detectUserPhoto(Buffer.from([0xff, 0xd8, 0xff, 0x00])).mimeType, 'image/jpeg');
  assert.equal(detectUserPhoto(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).mimeType, 'image/png');
  assert.equal(detectUserPhoto(Buffer.from('RIFF0000WEBP')).mimeType, 'image/webp');
  assert.equal(detectUserPhoto(Buffer.from('<script>alert(1)</script>')), null);
});

test('rechaza un MIME que no coincide con el contenido', async () => {
  const service = new UserPhotoStorageService();
  await assert.rejects(
    service.save(Buffer.from([0xff, 0xd8, 0xff, 0x00]), 'image/png'),
    error => error.code === 'INVALID_USER_PHOTO' && error.statusCode === 415,
  );
});

test('protege la eliminacion contra rutas externas y traversal', async () => {
  const service = new UserPhotoStorageService();
  assert.equal(await service.removeManaged('https://example.com/photo.jpg'), false);
  assert.equal(await service.removeManaged(`${USER_PHOTO_PUBLIC_PREFIX}../secret.jpg`), false);
  assert.equal(await service.removeManaged(`${USER_PHOTO_PUBLIC_PREFIX}not-a-uuid.jpg`), false);
});
