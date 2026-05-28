(function initRutasDetalleDataModule(global) {
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  async function optimizeImage(file) {
    if (!file.type.startsWith('image/')) throw new Error('Archivo no valido');
    const originalDataUrl = await readFileAsDataUrl(file);
    if (file.size <= 1024 * 1024) return originalDataUrl;

    const image = await loadImage(originalDataUrl);
    const canvas = document.createElement('canvas');
    const maxDimension = 1600;
    let { width, height } = image;

    if (width > maxDimension || height > maxDimension) {
      const scale = Math.min(maxDimension / width, maxDimension / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo procesar imagen');

    context.drawImage(image, 0, 0, width, height);

    let quality = 0.82;
    let result = canvas.toDataURL('image/jpeg', quality);
    while (result.length > 4 * 1024 * 1024 && quality > 0.45) {
      quality -= 0.08;
      result = canvas.toDataURL('image/jpeg', quality);
    }
    return result;
  }

  function detectSeparator(line) {
    if (line.includes('\t')) return '\t';
    if (line.includes(';')) return ';';
    return ',';
  }

  function normalizeHeader(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_');
  }

  function getColumnValue(row, aliases) {
    const match = Object.keys(row || {}).find((key) =>
      aliases.some((alias) => normalizeHeader(key).includes(normalizeHeader(alias)))
    );
    return match ? String(row[match] || '').trim() : '';
  }

  global.RutasDetalleDataModule = function createRutasDetalleDataModule({ getEmpresaOrigen }) {
    function normalizeImportRow(data) {
      return {
        telefono: String(data.telefono || '').trim(),
        nombre: String(data.nombre || '').trim(),
        codigo_paquete: String(data.codigo_paquete || '').trim(),
        empresa_origen: String(typeof getEmpresaOrigen === 'function' ? getEmpresaOrigen() : '').trim(),
        mensaje: null
      };
    }

    function parseDelimitedText(raw) {
      const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      if (!lines.length) return [];

      const separator = detectSeparator(lines[0]);
      const rows = lines.map((line) => line.split(separator).map((cell) => cell.trim()));
      const hasHeader = rows[0].some((cell) => ['telefono', 'nombre', 'codigo', 'codigo_paquete'].includes(normalizeHeader(cell)));
      const dataRows = hasHeader ? rows.slice(1) : rows;

      return dataRows
        .map((cols) => normalizeImportRow({
          telefono: cols[0] || '',
          nombre: cols[1] || '',
          codigo_paquete: cols[2] || ''
        }))
        .filter((item) => item.telefono || item.nombre);
    }

    function parseWorkbookRows(rows) {
      return rows
        .map((row) => normalizeImportRow({
          telefono: getColumnValue(row, ['telefono', 'celular', 'cel', 'phone', 'numero']),
          nombre: getColumnValue(row, ['nombre', 'name']),
          codigo_paquete: getColumnValue(row, ['codigo', 'code', 'cod', 'codigo_paquete', 'paquete'])
        }))
        .filter((item) => item.telefono || item.nombre);
    }

    async function extractRowsFromFile(file) {
      const ext = String(file.name.split('.').pop() || '').toLowerCase();

      if (ext === 'csv' || ext === 'txt') {
        return parseDelimitedText(await file.text());
      }

      if (ext === 'xlsx' || ext === 'xls') {
        if (typeof XLSX === 'undefined') {
          throw new Error('No se pudo cargar el lector de Excel.');
        }

        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        return parseWorkbookRows(rows);
      }

      throw new Error('Formato no soportado. Usa .xlsx, .xls o .csv');
    }

    return {
      extractRowsFromFile,
      optimizeImage
    };
  };
})(window);
