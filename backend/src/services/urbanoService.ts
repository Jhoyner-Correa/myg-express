import {
  getUrbanoCredentialsForSede,
  touchUrbanoCredentialLogin
} from './urbanoCredentialsService';

type UrbanoSession = {
  phpSessionId: string;
  username: string;
  connectedAt: string;
  sedeId: number | null;
  source: 'database';
};

type UrbanoSessionContext = {
  userId: number;
  sedeId: number | null;
};

type UrbanoRouteRecord = {
  routeId: string;
  guia: string;
  rastreo: string;
  cliente: string;
  telefono: string;
  contrato: string;
  localidad: string;
  peso_kg: number | null;
  tipo_paquete_urbano: string | null;
  piezas: number | null;
  contenido_paquete: string | null;
};

const URBANO_BASE_URL = 'https://app.urbano.com.pe';
const URBANO_LOGIN_PAGE = `${URBANO_BASE_URL}/`;
const URBANO_LOGIN_VALIDATE = `${URBANO_BASE_URL}/login/index/valida`;
const URBANO_HOME = `${URBANO_BASE_URL}/inicio`;
const URBANO_ROUTE_DETAILS = `${URBANO_BASE_URL}/gestion/salidaRutas/scm_rutas_detalle_manifiestos/`;
const URBANO_TRACK_DETAILS = `${URBANO_BASE_URL}/gestion/consultaEspecifica/get_scm_api_track_guias/`;

const urbanoSessions = new Map<string, UrbanoSession>();

function getSessionScope(context: UrbanoSessionContext): string {
  return context.sedeId ? `sede:${context.sedeId}` : `user:${context.userId}`;
}

function getCookieValues(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof headers.getSetCookie === 'function') {
    const values = headers.getSetCookie();
    if (values.length) return values;
  }

  const raw = response.headers.get('set-cookie');
  return raw ? [raw] : [];
}

function extractCookieValue(setCookies: string[], cookieName: string): string {
  for (const cookie of setCookies) {
    const match = cookie.match(new RegExp(`${cookieName}=([^;]+)`));
    if (match?.[1]) {
      return match[1];
    }
  }

  return '';
}

async function parseJsonResponse(response: Response) {
  const text = await response.text();

  try {
    return JSON.parse(text);
  } catch {
    const normalized = text.toLowerCase();
    const sessionExpired =
      normalized.includes('<!doctype html') ||
      normalized.includes('<html') ||
      normalized.includes('name="usuario"') ||
      normalized.includes('id="login"') ||
      normalized.includes('/login/') ||
      normalized.includes('iniciar sesion');

    if (sessionExpired) {
      throw new Error('La sesion de Urbano vencio. Vuelve a iniciar sesion para consultar nuevamente.');
    }

    throw new Error('La respuesta de Urbano no devolvio JSON valido.');
  }
}

function buildAjaxHeaders(phpSessionId: string): Record<string, string> {
  return {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    Cookie: `PHPSESSID=${phpSessionId}`,
    Referer: URBANO_HOME,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'X-Requested-With': 'XMLHttpRequest'
  };
}

function parseNullableNumber(value: unknown): number | null {
  const normalized = String(value ?? '')
    .replace(',', '.')
    .replace(/[^\d.]/g, '')
    .trim();

  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseNullableInteger(value: unknown): number | null {
  const parsed = parseNullableNumber(value);
  if (parsed === null) return null;
  return Math.floor(parsed);
}

function cleanNullableText(value: unknown, maxLength = 255): string | null {
  const clean = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return clean ? clean.slice(0, maxLength) : null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R | null>
): Promise<R[]> {
  const results = new Array<R | null>(items.length).fill(null);
  let cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      const currentIndex = cursor++;
      const value = await worker(items[currentIndex], currentIndex);
      results[currentIndex] = value;
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => runWorker());
  await Promise.all(workers);

  return results.filter((value): value is R => value !== null);
}

async function loginToUrbanoWithCredentials(
  context: UrbanoSessionContext,
  username: string,
  password: string,
  source: 'database'
) {
  const loginPageResponse = await fetch(URBANO_LOGIN_PAGE, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  });

  const initialPhpSessionId = extractCookieValue(getCookieValues(loginPageResponse), 'PHPSESSID');

  const loginResponse = await fetch(URBANO_LOGIN_VALIDATE, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: URBANO_BASE_URL,
      Referer: URBANO_LOGIN_PAGE,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      ...(initialPhpSessionId ? { Cookie: `PHPSESSID=${initialPhpSessionId}` } : {})
    },
    body: new URLSearchParams({
      usuario: username,
      password
    })
  });

  const setCookies = getCookieValues(loginResponse);
  const phpSessionId =
    extractCookieValue(setCookies, 'PHPSESSID') || initialPhpSessionId;

  const location = loginResponse.headers.get('location') || '';
  const loginSucceeded =
    Boolean(phpSessionId) &&
    (loginResponse.status === 302 ||
      loginResponse.status === 301 ||
      location.includes('/inicio') ||
      location === URBANO_HOME);

  if (!loginSucceeded) {
    throw new Error('No se pudo iniciar sesion en Urbano. Verifica tus credenciales.');
  }

  const scope = getSessionScope(context);
  urbanoSessions.set(scope, {
    phpSessionId,
    username,
    connectedAt: new Date().toISOString(),
    sedeId: context.sedeId,
    source
  });

  await touchUrbanoCredentialLogin(context.sedeId);

  return {
    connected: true,
    username,
    sedeId: context.sedeId,
    source,
    connectedAt: urbanoSessions.get(scope)?.connectedAt || new Date().toISOString()
  };
}

export async function loginToUrbano(context: UrbanoSessionContext) {
  const credentials = await getUrbanoCredentialsForSede(context.sedeId);
  return loginToUrbanoWithCredentials(
    context,
    credentials.username,
    credentials.password,
    credentials.source
  );
}

export function getUrbanoStatus(context: UrbanoSessionContext) {
  const session = urbanoSessions.get(getSessionScope(context));

  if (!session) {
    return {
      connected: false,
      username: null,
      sedeId: context.sedeId,
      source: null,
      connectedAt: null
    };
  }

  return {
    connected: true,
    username: session.username,
    sedeId: session.sedeId,
    source: session.source,
    connectedAt: session.connectedAt
  };
}

async function executeFetch(session: UrbanoSession, routeId: string) {
  const manifestUrl = new URL(URBANO_ROUTE_DETAILS);
  manifestUrl.searchParams.set('_dc', String(Date.now()));
  manifestUrl.searchParams.set('vp_rou_id', routeId);
  manifestUrl.searchParams.set('vp_linea', '3');
  manifestUrl.searchParams.set('page', '1');
  manifestUrl.searchParams.set('start', '0');
  manifestUrl.searchParams.set('limit', '1000');

  const manifestResponse = await fetch(manifestUrl, {
    headers: buildAjaxHeaders(session.phpSessionId)
  });

  const manifestData = await parseJsonResponse(manifestResponse);
  const guias = Array.isArray(manifestData?.data) ? manifestData.data : [];

  const records = await mapWithConcurrency<any, UrbanoRouteRecord>(
    guias,
    5,
    async (guia) => {
      const guiaValue = guia?.guia || guia?.guia_texto || guia?.tracking || '';
      if (!guiaValue) return null;

      const trackUrl = new URL(URBANO_TRACK_DETAILS);
      trackUrl.searchParams.set('_dc', String(Date.now()));
      trackUrl.searchParams.set('vp_guia', String(guiaValue));
      trackUrl.searchParams.set('vp_linea', '3');

      const trackResponse = await fetch(trackUrl, {
        headers: buildAjaxHeaders(session.phpSessionId)
      });

      const trackData = await parseJsonResponse(trackResponse);

      if (!trackData?.success || !trackData?.total || !Array.isArray(trackData.data) || !trackData.data[0]) {
        return null;
      }

      const item = trackData.data[0];

      return {
        routeId,
        guia: String(item.guia_texto || ''),
        rastreo: String(item.rastreo || ''),
        cliente: String(item.cliente || ''),
        telefono: String(item.telefonos || ''),
        contrato: String(item.contrato || ''),
        localidad: String(item.localidad || ''),
        peso_kg: parseNullableNumber(item.peso),
        tipo_paquete_urbano: cleanNullableText(item.tipo_paquete, 80),
        piezas: parseNullableInteger(item.piezas),
        contenido_paquete: cleanNullableText(item.guia_contenido)
      };
    }
  );

  return {
    routeId,
    totalGuias: guias.length,
    totalRegistros: records.length,
    records
  };
}

async function performSilentLogin(context: UrbanoSessionContext): Promise<UrbanoSession> {
  await loginToUrbano(context);
  const session = urbanoSessions.get(getSessionScope(context));
  if (!session) {
    throw new Error('Fallo el inicio de sesion automatico en Urbano.');
  }
  return session;
}

export async function fetchRouteData(context: UrbanoSessionContext, routeId: string) {
  const scope = getSessionScope(context);
  let session = urbanoSessions.get(scope);

  if (!session) {
    session = await performSilentLogin(context);
  }

  try {
    return await executeFetch(session, routeId);
  } catch (error: any) {
    const errorMsg = String(error?.message || '').toLowerCase();
    const isSessionExpired = errorMsg.includes('sesion de urbano vencio') || errorMsg.includes('json');

    if (isSessionExpired) {
      urbanoSessions.delete(scope);
      session = await performSilentLogin(context);
      return await executeFetch(session, routeId);
    }

    throw error;
  }
}
