const test = require('node:test');
const assert = require('node:assert/strict');
const { DniLookupService } = require('../dist/modules/rrhh/services/DniLookupService');

function providerResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function identityResponse(overrides = {}) {
  return providerResponse({
    success: true,
    message: 'exito',
    data: {
      numero: '12345678',
      nombres: 'MARÍA ELENA',
      apellido_paterno: 'DE LA CRUZ',
      apellido_materno: 'QUISPE',
      direccion_completa: 'JR. PRUEBA 123',
      ...overrides,
    },
  });
}

test('consulta identidad y RUC asociado usando JSON.pe desde el backend', async () => {
  const requests = [];
  const service = new DniLookupService({
    apiUrl: 'https://api.json.pe/api/dni-ruc',
    apiToken: 'private-test-token',
    fetcher: async (url, options) => {
      requests.push({ url: String(url), options });
      return String(url).endsWith('/dni-ruc')
        ? providerResponse({ success: true, data: { ruc: '10123456781' } })
        : identityResponse();
    },
  });

  const result = await service.lookup('12345678');

  assert.deepEqual(result, {
    dni: '12345678',
    nombres: 'María Elena',
    apellidoPaterno: 'De La Cruz',
    apellidoMaterno: 'Quispe',
    apellidos: 'De La Cruz Quispe',
    direccion: 'JR. PRUEBA 123',
    ruc: '10123456781',
    rucStatus: 'FOUND',
  });
  assert.deepEqual(requests.map(item => item.url).sort(), [
    'https://api.json.pe/api/dni',
    'https://api.json.pe/api/dni-ruc',
  ]);
  for (const request of requests) {
    assert.equal(request.options.method, 'POST');
    assert.equal(request.options.headers.Authorization, 'Bearer private-test-token');
    assert.deepEqual(JSON.parse(request.options.body), { dni: '12345678' });
  }
});

test('un DNI sin RUC sigue devolviendo la identidad como resultado válido', async () => {
  const service = new DniLookupService({
    apiToken: 'private-test-token',
    fetcher: async url => String(url).endsWith('/dni-ruc')
      ? providerResponse({ success: false, message: 'El DNI no cuenta con RUC' }, 404)
      : identityResponse(),
  });

  const result = await service.lookup('12345678');
  assert.equal(result.ruc, null);
  assert.equal(result.rucStatus, 'NOT_FOUND');
  assert.equal(result.nombres, 'María Elena');
});

test('una falla aislada de la consulta RUC no descarta la identidad', async () => {
  const service = new DniLookupService({
    apiToken: 'private-test-token',
    fetcher: async url => String(url).endsWith('/dni-ruc')
      ? providerResponse({ message: 'temporal' }, 503)
      : identityResponse(),
  });

  const result = await service.lookup('12345678');
  assert.equal(result.ruc, null);
  assert.equal(result.rucStatus, 'UNAVAILABLE');
});

test('rechaza documentos que no sean un DNI de ocho dígitos', async () => {
  const service = new DniLookupService({ apiToken: 'private-test-token', fetcher: async () => providerResponse({}) });
  await assert.rejects(() => service.lookup('12A'), error => error.code === 'DNI_INVALID' && error.statusCode === 400);
});

test('rechaza una identidad que no corresponde al DNI consultado', async () => {
  const service = new DniLookupService({
    apiToken: 'private-test-token',
    fetcher: async url => String(url).endsWith('/dni-ruc')
      ? providerResponse({ success: false }, 404)
      : identityResponse({ numero: '87654321' }),
  });
  await assert.rejects(() => service.lookup('12345678'), error => error.code === 'DNI_PROVIDER_INVALID_RESPONSE');
});
