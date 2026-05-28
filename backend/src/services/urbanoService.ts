type UrbanoSession = {
  phpSessionId: string;
  username: string;
  connectedAt: string;
};

type UrbanoRouteRecord = {
  routeId: string;
  guia: string;
  rastreo: string;
  cliente: string;
  telefono: string;
  contrato: string;
  localidad: string;
};

const URBANO_BASE_URL = 'https://app.urbano.com.pe';
const URBANO_LOGIN_PAGE = `${URBANO_BASE_URL}/`;
const URBANO_LOGIN_VALIDATE = `${URBANO_BASE_URL}/login/index/valida`;
const URBANO_HOME = `${URBANO_BASE_URL}/inicio`;
const URBANO_ROUTE_DETAILS = `${URBANO_BASE_URL}/gestion/salidaRutas/scm_rutas_detalle_manifiestos/`;
const URBANO_TRACK_DETAILS = `${URBANO_BASE_URL}/gestion/consultaEspecifica/get_scm_api_track_guias/`;

const urbanoSessions = new Map<number, UrbanoSession>();

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

export async function loginToUrbano(userId: number, username: string, password: string) {
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

  urbanoSessions.set(userId, {
    phpSessionId,
    username,
    connectedAt: new Date().toISOString()
  });

  return {
    connected: true,
    username,
    connectedAt: urbanoSessions.get(userId)?.connectedAt || new Date().toISOString()
  };
}

export function getUrbanoStatus(userId: number) {
  const session = urbanoSessions.get(userId);

  if (!session) {
    return {
      connected: false,
      username: null,
      connectedAt: null
    };
  }

  return {
    connected: true,
    username: session.username,
    connectedAt: session.connectedAt
  };
}

export function logoutFromUrbano(userId: number) {
  urbanoSessions.delete(userId);
  return { connected: false };
}

export async function fetchRouteData(userId: number, routeId: string) {
  const session = urbanoSessions.get(userId);

  if (!session) {
    throw new Error('Primero debes conectar tu cuenta de Urbano.');
  }

  const manifestUrl = new URL(URBANO_ROUTE_DETAILS);
  manifestUrl.searchParams.set('_dc', String(Date.now()));
  manifestUrl.searchParams.set('vp_rou_id', routeId);
  manifestUrl.searchParams.set('vp_linea', '3');
  manifestUrl.searchParams.set('page', '1');
  manifestUrl.searchParams.set('start', '0');
  manifestUrl.searchParams.set('limit', '1000');

  try {
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
          localidad: String(item.localidad || '')
        };
      }
    );

    return {
      routeId,
      totalGuias: guias.length,
      totalRegistros: records.length,
      records
    };
  } catch (error: any) {
    if (String(error?.message || '').toLowerCase().includes('sesion de urbano vencio')) {
      urbanoSessions.delete(userId);
    }

    throw error;
  }
}
