export type RucLookupStatus = 'FOUND' | 'NOT_FOUND' | 'UNAVAILABLE';

export type DniLookupResult = {
  dni: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  apellidos: string;
  direccion: string;
  ruc: string | null;
  rucStatus: RucLookupStatus;
};

export class DniLookupError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'DniLookupError';
  }
}

type JsonPeIdentity = {
  numero?: unknown;
  nombres?: unknown;
  apellido_paterno?: unknown;
  apellido_materno?: unknown;
  direccion?: unknown;
  direccion_completa?: unknown;
};

type JsonPeDniRuc = {
  ruc?: unknown;
};

type JsonPeEnvelope = {
  success?: unknown;
  message?: unknown;
  data?: unknown;
};

type DniLookupOptions = {
  apiUrl?: string;
  apiToken?: string;
  timeoutMs?: number;
  fetcher?: typeof fetch;
};

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function corporateName(value: unknown): string {
  return textValue(value)
    .toLocaleLowerCase('es-PE')
    .replace(/(^|[\s'-])(\p{L})/gu,
      (_, separator: string, letter: string) => `${separator}${letter.toLocaleUpperCase('es-PE')}`);
}

function safeTimeout(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(Math.trunc(value), 1500), 15000) : 6000;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '').replace(/\/(?:dni|dni-ruc)$/i, '');
}

async function parseEnvelope(response: Response): Promise<JsonPeEnvelope> {
  try {
    const body = await response.json();
    return body && typeof body === 'object' ? body as JsonPeEnvelope : {};
  } catch {
    throw new DniLookupError(
      'El proveedor devolvió una respuesta no válida.',
      502,
      'DNI_PROVIDER_INVALID_RESPONSE',
    );
  }
}

export class DniLookupService {
  private readonly apiUrlOverride?: string;
  private readonly apiTokenOverride?: string;
  private readonly timeoutMsOverride?: number;
  private readonly fetcher: typeof fetch;

  constructor(options: DniLookupOptions = {}) {
    this.apiUrlOverride = options.apiUrl;
    this.apiTokenOverride = options.apiToken;
    this.timeoutMsOverride = options.timeoutMs;
    this.fetcher = options.fetcher ?? fetch;
  }

  async lookup(dniInput: string): Promise<DniLookupResult> {
    const dni = String(dniInput ?? '').trim();
    if (!/^\d{8}$/.test(dni)) {
      throw new DniLookupError('Ingresa un DNI peruano válido de 8 dígitos.', 400, 'DNI_INVALID');
    }

    // El proveedor se invoca solo desde el backend para no exponer el token al navegador.
    const apiUrl = normalizeBaseUrl(String(
      this.apiUrlOverride ?? process.env.JSON_PE_API_URL ?? 'https://api.json.pe/api',
    ));
    const apiToken = String(this.apiTokenOverride ?? process.env.JSON_PE_API_TOKEN ?? '').trim();
    const timeoutMs = safeTimeout(this.timeoutMsOverride ?? Number(process.env.JSON_PE_TIMEOUT_MS ?? 6000));
    if (!apiToken) {
      throw new DniLookupError(
        'La consulta automática de DNI no está configurada.',
        503,
        'DNI_PROVIDER_NOT_CONFIGURED',
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const [identity, ruc] = await Promise.all([
        this.lookupIdentity(apiUrl, apiToken, dni, controller.signal),
        this.lookupRuc(apiUrl, apiToken, dni, controller.signal),
      ]);

      return {
        dni,
        nombres: identity.nombres,
        apellidoPaterno: identity.apellidoPaterno,
        apellidoMaterno: identity.apellidoMaterno,
        apellidos: [identity.apellidoPaterno, identity.apellidoMaterno].filter(Boolean).join(' '),
        direccion: identity.direccion,
        ruc: ruc.ruc,
        rucStatus: ruc.status,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        throw new DniLookupError(
          'La consulta de identidad tardó demasiado. Intenta nuevamente.',
          504,
          'DNI_PROVIDER_TIMEOUT',
        );
      }
      if (error instanceof DniLookupError) throw error;
      throw new DniLookupError(
        'No fue posible comunicarse con el servicio de identidad.',
        503,
        'DNI_PROVIDER_UNAVAILABLE',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async post(apiUrl: string, path: string, apiToken: string, dni: string, signal: AbortSignal) {
    return this.fetcher(`${apiUrl}/${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dni }),
      signal,
    });
  }

  private async lookupIdentity(apiUrl: string, apiToken: string, dni: string, signal: AbortSignal) {
    const response = await this.post(apiUrl, 'dni', apiToken, dni, signal);
    if (response.status === 404) {
      throw new DniLookupError('No se encontraron datos para el DNI indicado.', 404, 'DNI_NOT_FOUND');
    }
    this.assertProviderStatus(response);

    const envelope = await parseEnvelope(response);
    if (envelope.success !== true || !envelope.data || typeof envelope.data !== 'object') {
      throw new DniLookupError('No se encontraron datos para el DNI indicado.', 404, 'DNI_NOT_FOUND');
    }

    const payload = envelope.data as JsonPeIdentity;
    const returnedDni = textValue(payload.numero);
    const nombres = corporateName(payload.nombres);
    const apellidoPaterno = corporateName(payload.apellido_paterno);
    const apellidoMaterno = corporateName(payload.apellido_materno);

    if (returnedDni !== dni || !nombres || !apellidoPaterno) {
      throw new DniLookupError(
        'El proveedor devolvió datos de identidad inconsistentes.',
        502,
        'DNI_PROVIDER_INVALID_RESPONSE',
      );
    }

    return {
      nombres,
      apellidoPaterno,
      apellidoMaterno,
      direccion: textValue(payload.direccion_completa) || textValue(payload.direccion),
    };
  }

  private async lookupRuc(
    apiUrl: string,
    apiToken: string,
    dni: string,
    signal: AbortSignal,
  ): Promise<{ ruc: string | null; status: RucLookupStatus }> {
    try {
      const response = await this.post(apiUrl, 'dni-ruc', apiToken, dni, signal);
      if (response.status === 404) return { ruc: null, status: 'NOT_FOUND' };
      if (!response.ok) return { ruc: null, status: 'UNAVAILABLE' };

      const envelope = await parseEnvelope(response);
      if (envelope.success !== true || !envelope.data || typeof envelope.data !== 'object') {
        return { ruc: null, status: 'NOT_FOUND' };
      }

      const ruc = textValue((envelope.data as JsonPeDniRuc).ruc);
      return /^10\d{9}$/.test(ruc)
        ? { ruc, status: 'FOUND' }
        : { ruc: null, status: 'UNAVAILABLE' };
    } catch (error) {
      if (signal.aborted) throw error;
      return { ruc: null, status: 'UNAVAILABLE' };
    }
  }

  private assertProviderStatus(response: Response) {
    if (response.status === 401 || response.status === 403) {
      throw new DniLookupError(
        'El servicio de consulta de DNI no está habilitado.',
        503,
        'DNI_PROVIDER_UNAUTHORIZED',
      );
    }
    if (response.status === 429) {
      throw new DniLookupError(
        'Se alcanzó el límite temporal de consultas de DNI.',
        429,
        'DNI_PROVIDER_RATE_LIMIT',
      );
    }
    if (!response.ok) {
      throw new DniLookupError(
        'El proveedor de identidad no pudo procesar la consulta.',
        502,
        'DNI_PROVIDER_ERROR',
      );
    }
  }
}
