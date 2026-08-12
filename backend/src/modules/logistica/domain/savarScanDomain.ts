export const MAX_SAVAR_IMPORT_ROWS = 10_000;

export type SavarImportedPackage = {
  codigo: string;
  consignado: string;
  direccion: string;
  telefono: string | null;
  departamento: string;
  provincia: string;
  distrito: string;
};

export type SavarImportResult = {
  rows: SavarImportedPackage[];
  duplicates: number;
  invalid: number;
};

export type SavarSedeScope = {
  where: string;
  params: number[];
};

export function savarSedeScope(alias: string, sedeId: number): SavarSedeScope {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Alias SQL inválido para el alcance SAVAR.');
  if (!Number.isInteger(sedeId) || sedeId <= 0) throw new Error('Sede inválida para el alcance SAVAR.');
  return { where: `${alias}.sede_id = ?`, params: [sedeId] };
}

export function cleanSavarText(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().slice(0, maxLength);
}

export function parseSavarImportRows(value: unknown): SavarImportResult {
  if (!Array.isArray(value)) return { rows: [], duplicates: 0, invalid: 0 };

  const unique = new Map<string, SavarImportedPackage>();
  let invalid = 0;
  let duplicates = 0;

  value.forEach(raw => {
    if (!raw || typeof raw !== 'object') {
      invalid += 1;
      return;
    }

    const item = raw as Record<string, unknown>;
    const parsed: SavarImportedPackage = {
      codigo: cleanSavarText(item.codigo ?? item.codigo_paquete, 100),
      consignado: cleanSavarText(item.consignado, 255),
      direccion: cleanSavarText(item.direccion, 255),
      telefono: cleanSavarText(item.telefono, 50) || null,
      departamento: cleanSavarText(item.departamento, 100),
      provincia: cleanSavarText(item.provincia, 100),
      distrito: cleanSavarText(item.distrito, 100),
    };

    if (!parsed.codigo || !parsed.consignado) {
      invalid += 1;
      return;
    }
    if (unique.has(parsed.codigo)) duplicates += 1;
    unique.set(parsed.codigo, parsed);
  });

  return { rows: [...unique.values()], duplicates, invalid };
}
