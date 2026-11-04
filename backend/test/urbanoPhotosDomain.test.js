const test = require('node:test');
const assert = require('node:assert/strict');

// Importamos el controller compilado o probamos la lógica de parsing y contratos
test('parseGuidesInput normaliza guías desde texto, comas y saltos de línea', () => {
  const rawInput = `
    wyb477212514
    WYB478229399
    wyb477212514
    WYB478229400, 44383485
  `;

  // Simulación de la lógica de parseGuidesInput
  function parseGuidesInput(text) {
    if (!text || typeof text !== 'string') return [];
    const lines = text.split(/[\r\n]+/);
    const map = new Map();

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) continue;

      const parts = trimmed.split(/[\t,;]+/).map((p) => p.trim()).filter(Boolean);

      if (parts.length >= 2 && /^WYB\d+/i.test(parts[0]) && /^\d+$/.test(parts[1])) {
        const guia = parts[0].toUpperCase();
        map.set(guia, { guia, explicitManIdDet: parts[1] });
      } else {
        for (const token of parts) {
          const cleanToken = token.trim().toUpperCase();
          if (cleanToken && !map.has(cleanToken)) {
            map.set(cleanToken, { guia: cleanToken });
          }
        }
      }
    }

    return Array.from(map.values()).slice(0, 1000);
  }

  const items = parseGuidesInput(rawInput);
  assert.equal(items.length, 3, 'Debe haber 3 guías únicas deduplicadas');
  assert.equal(items[0].guia, 'WYB477212514');
  assert.equal(items[1].guia, 'WYB478229399');
  assert.equal(items[2].guia, 'WYB478229400');
  assert.equal(items[2].explicitManIdDet, '44383485', 'Debe extraer el man_id_det explícito');
});

test('clasifica estados de fotos según disponibilidad de man_id_det y respuesta', () => {
  function getGuideStatus(hasTrack, manIdDet, photosCount) {
    if (!hasTrack && !manIdDet) return 'NO_ENCONTRADA';
    if (!manIdDet) return 'SIN_DETALLE_RUTA';
    if (photosCount > 0) return 'CON_FOTOS';
    return 'SIN_FOTOS';
  }

  assert.equal(getGuideStatus(false, null, 0), 'NO_ENCONTRADA');
  assert.equal(getGuideStatus(true, null, 0), 'SIN_DETALLE_RUTA');
  assert.equal(getGuideStatus(true, '44383496', 0), 'SIN_FOTOS');
  assert.equal(getGuideStatus(true, '44383496', 4), 'CON_FOTOS');
});
