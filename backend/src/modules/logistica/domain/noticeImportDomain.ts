export const MAX_NOTICE_IMPORT_ROWS = 5_000;

export type NoticeImportRow = {
  nombre: string | null;
  telefono: string;
  codigo_paquete: string | null;
  peso_kg: number | null;
  tipo_paquete_urbano: string | null;
  piezas: number | null;
  contenido_paquete: string | null;
  id_plantilla: number | null;
  mensaje_personalizado: string | null;
};

export function normalizeNoticePhone(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '').slice(0, 20);
}

export function normalizeNoticeOptionalText(value: unknown, maxLength: number): string | null {
  const clean = String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, maxLength) : null;
}

export function normalizeNoticeWeight(value: unknown): number | null {
  const raw = String(value ?? '').replace(',', '.').replace(/[^\d.]/g, '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 && parsed < 100_000 ? Number(parsed.toFixed(3)) : null;
}

export function normalizeNoticePositiveInteger(value: unknown, maximum = 9_999): number | null {
  const raw = String(value ?? '').replace(/\D/g, '');
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : null;
}

export function parseNoticeImportRows(value: unknown): { rows: NoticeImportRow[]; invalid: number; duplicates: number } {
  if (!Array.isArray(value)) return { rows: [], invalid: 0, duplicates: 0 };
  const input = value.slice(0, MAX_NOTICE_IMPORT_ROWS);
  const rows: NoticeImportRow[] = [];
  const codes = new Set<string>();
  let invalid = value.length - input.length;
  let duplicates = 0;

  input.forEach(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { invalid += 1; return; }
    const item = raw as Record<string, unknown>;
    const telefono = normalizeNoticePhone(item.telefono);
    if (telefono.length < 8) { invalid += 1; return; }

    const codigo = normalizeNoticeOptionalText(item.codigo_paquete, 100);
    const codeKey = codigo?.toLocaleLowerCase('es') ?? '';
    if (codeKey && codes.has(codeKey)) { duplicates += 1; return; }
    if (codeKey) codes.add(codeKey);

    rows.push({
      nombre: normalizeNoticeOptionalText(item.nombre, 255),
      telefono,
      codigo_paquete: codigo,
      peso_kg: normalizeNoticeWeight(item.peso_kg ?? item.peso),
      tipo_paquete_urbano: normalizeNoticeOptionalText(item.tipo_paquete_urbano ?? item.tipo_paquete, 80),
      piezas: normalizeNoticePositiveInteger(item.piezas),
      contenido_paquete: normalizeNoticeOptionalText(item.contenido_paquete ?? item.contenido, 255),
      id_plantilla: normalizeNoticePositiveInteger(item.id_plantilla, 4_294_967_295),
      mensaje_personalizado: normalizeNoticeOptionalText(item.mensaje, 4_000),
    });
  });

  return { rows, invalid, duplicates };
}
