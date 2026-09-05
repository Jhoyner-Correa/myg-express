export type UrbanoDispatchQuery = {
  dispatchId: string;
  line: number;
  page: number;
  limit: 25 | 50 | 100 | 500;
  start: number;
};

export type UrbanoDispatchListQuery = {
  fromDate: string;
  toDate: string;
  line: 3;
};

export class UrbanoDispatchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UrbanoDispatchValidationError';
  }
}

function numericIdentifier(value: unknown, label: string, maxLength: number): string {
  const normalized = String(value ?? '').trim();
  if (!new RegExp(`^\\d{1,${maxLength}}$`).test(normalized) || Number(normalized) <= 0) {
    throw new UrbanoDispatchValidationError(`${label} debe ser un número válido.`);
  }
  return normalized;
}

function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > maximum) {
    throw new UrbanoDispatchValidationError('Los parámetros de paginación no son válidos.');
  }
  return parsed;
}

export function parseUrbanoDispatchQuery(input: Record<string, unknown>): UrbanoDispatchQuery {
  const dispatchId = numericIdentifier(input.dispatch_id, 'El CDP', 20);
  const line = 3;
  const page = positiveInteger(input.page, 1, 10_000);
  const requestedLimit = positiveInteger(input.limit, 500, 500);

  if (![25, 50, 100, 500].includes(requestedLimit)) {
    throw new UrbanoDispatchValidationError('El tamaño de consulta permitido es 25, 50, 100 o 500.');
  }

  const limit = requestedLimit as UrbanoDispatchQuery['limit'];
  return {
    dispatchId,
    line,
    page,
    limit,
    start: (page - 1) * limit,
  };
}

function parseIsoDate(value: unknown, label: string): { iso: string; urbano: string; time: number } {
  const iso = String(value ?? '').trim();
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new UrbanoDispatchValidationError(`${label} no es valida.`);
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(time);
  if (
    date.getUTCFullYear() !== Number(match[1])
    || date.getUTCMonth() !== Number(match[2]) - 1
    || date.getUTCDate() !== Number(match[3])
  ) {
    throw new UrbanoDispatchValidationError(`${label} no es valida.`);
  }
  return { iso, urbano: `${match[3]}/${match[2]}/${match[1]}`, time };
}

export function parseUrbanoDispatchListQuery(input: Record<string, unknown>): UrbanoDispatchListQuery {
  const from = parseIsoDate(input.from_date, 'La fecha inicial');
  const to = parseIsoDate(input.to_date, 'La fecha final');
  if (from.time > to.time) {
    throw new UrbanoDispatchValidationError('La fecha inicial no puede ser posterior a la fecha final.');
  }
  const days = Math.floor((to.time - from.time) / 86_400_000) + 1;
  if (days > 31) {
    throw new UrbanoDispatchValidationError('El rango maximo de consulta es de 31 dias.');
  }
  return { fromDate: from.urbano, toDate: to.urbano, line: 3 };
}

export function parseAdminSiteId(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new UrbanoDispatchValidationError('Selecciona una sede válida.');
  }
  return parsed;
}

export function parseUrbanoGuide(value: unknown): string {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (!/^WYB\d{6,20}$/.test(normalized)) {
    throw new UrbanoDispatchValidationError('La guía WYB no tiene un formato válido.');
  }
  return normalized;
}

export function publicUrbanoDispatchErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const publicMessages = [
    'Esta operacion requiere una sede con credenciales Urbano configuradas.',
    'Esta sede no tiene credenciales Urbano activas. Configuralas desde el panel SysAdmin.',
    'Falta configurar URBANO_CREDENTIALS_SECRET para usar credenciales Urbano por sede.',
    'Falta ejecutar la migracion urbano_credenciales_sede antes de usar Urbano por sede.',
    'No se pudo iniciar sesion en Urbano. Verifica tus credenciales.',
    'La sesion de Urbano vencio. Vuelve a iniciar sesion para consultar nuevamente.',
    'Urbano no informo la agencia operativa asociada a esta cuenta.',
    'Urbano no encontro informacion para esta guia.',
  ];
  return publicMessages.includes(message)
    ? message
    : 'Urbano no pudo completar la consulta del CDP. Intenta nuevamente.';
}
