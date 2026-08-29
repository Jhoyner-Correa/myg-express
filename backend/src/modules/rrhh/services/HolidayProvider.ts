import { ExternalHoliday, normalizeNagerHolidayPayload } from '../domain/holidayCalendarPolicy';

const DEFAULT_BASE_URL = 'https://date.nager.at/api/v3';

export class HolidayProviderError extends Error {
  constructor(message: string, readonly code: string, readonly statusCode = 502) {
    super(message);
    this.name = 'HolidayProviderError';
  }
}

function providerBaseUrl(): string {
  const value = String(process.env.RRHH_HOLIDAY_API_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/$/, '');
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new HolidayProviderError('La URL del proveedor de feriados no es válida.', 'HOLIDAY_PROVIDER_CONFIG', 500); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new HolidayProviderError('El proveedor de feriados debe usar HTTP o HTTPS.', 'HOLIDAY_PROVIDER_CONFIG', 500);
  }
  return value;
}

export class HolidayProvider {
  readonly name = 'NAGER_DATE';

  async getPeruHolidays(year: number): Promise<ExternalHoliday[]> {
    const endpoint = `${providerBaseUrl()}/PublicHolidays/${year}/PE`;
    const timeout = Math.min(Math.max(Number(process.env.RRHH_HOLIDAY_API_TIMEOUT_MS) || 8000, 1500), 20000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'MyG-Express-RRHH/1.0' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new HolidayProviderError(`El proveedor respondió con estado ${response.status}.`, 'HOLIDAY_PROVIDER_HTTP');
      }
      const payload: unknown = await response.json();
      const holidays = normalizeNagerHolidayPayload(payload, year, endpoint);
      if (!holidays.length) {
        throw new HolidayProviderError('El proveedor no devolvió feriados válidos para Perú.', 'HOLIDAY_PROVIDER_EMPTY');
      }
      return holidays;
    } catch (error) {
      if (error instanceof HolidayProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new HolidayProviderError('La consulta de feriados excedió el tiempo de espera.', 'HOLIDAY_PROVIDER_TIMEOUT', 504);
      }
      throw new HolidayProviderError('No fue posible consultar el proveedor de feriados.', 'HOLIDAY_PROVIDER_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
  }
}
