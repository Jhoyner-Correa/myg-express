import {
  getUrbanoCredentialsForSede,
  touchUrbanoCredentialLogin
} from './urbanoCredentialsService';

type UrbanoSession = {
  phpSessionId: string;
  username: string;
  connectedAt: string;
  sedeId: number | null;
  operationalProvinceCode: string | null;
  source: 'database';
};

export type UrbanoSessionContext = {
  userId: number;
  sedeId: number | null;
};

type UrbanoScalar = string | number | boolean | null;

export type UrbanoDispatchGuide = {
  id: string;
  guide: string;
  tracking: string;
  recipient: string;
  phone: string;
  destination: string;
  address: string;
  status: string;
  customer: string;
  service: string;
  manifest: string;
  pieces: number | null;
  weightKg: number | null;
  registeredAt: string;
  attributes: Record<string, UrbanoScalar>;
  detail: UrbanoGuideDetail | null;
};

export type UrbanoDispatchSummary = {
  id: string;
  cdp: string;
  destinationCode: string;
  destination: string;
  origin: string;
  dispatchedAt: string;
  admittedAt: string;
  containerType: string;
  operator: string;
  status: string;
  totalGuides: number;
  admittedGuides: number;
  totalPieces: number;
  admittedPieces: number;
  totalWeightKg: number;
  admittedWeightKg: number;
  line: number;
};

export type UrbanoDispatchListRequest = {
  fromDate: string;
  toDate: string;
  line: number;
};

export type UrbanoDispatchRequest = {
  dispatchId: string;
  line: number;
  page: number;
  limit: number;
  start: number;
};

export type UrbanoGuideDetail = {
  guide: string;
  tracking: string;
  recipient: string;
  phone: string;
  email: string;
  address: string;
  locality: string;
  origin: string;
  destination: string;
  sender: string;
  pieces: number | null;
  weightKg: number | null;
  status: string;
  statusDetail: string;
  service: string;
  seller: string;
  contract: string;
  contents: string;
  registeredAt: string;
  estimatedDeliveryDate: string;
  pieceReference: string;
  latitude: number | null;
  longitude: number | null;
  fragile: boolean | null;
  insured: boolean | null;
  insuranceValue: number | null;
  dates: {
    pickup: string;
    dispatched: string;
    admitted: string;
    outForDelivery: string;
    deadline: string;
  };
  retrievedAt: string;
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
const URBANO_DISPATCH_MODULE = `${URBANO_BASE_URL}/gestion/gestiondespachos/`;
const URBANO_DISPATCHES = `${URBANO_BASE_URL}/gestion/gestiondespachos/scm_despachos_panel/`;
const URBANO_DISPATCH_GUIDES = `${URBANO_BASE_URL}/gestion/gestiondespachos/scm_despachos_lista_guias/`;

const urbanoSessions = new Map<string, UrbanoSession>();
const urbanoLoginRequests = new Map<string, Promise<UrbanoSession>>();
const guideDetailRequests = new Map<string, Promise<UrbanoGuideDetail>>();
const guideDetailCache = new Map<string, { value: UrbanoGuideDetail; expiresAt: number }>();
const configuredGuideCacheMinutes = Number(process.env.URBANO_GUIDE_CACHE_TTL_MINUTES || 5);
const GUIDE_DETAIL_CACHE_TTL_MS = (
  Number.isFinite(configuredGuideCacheMinutes) && configuredGuideCacheMinutes >= 1
    ? Math.min(configuredGuideCacheMinutes, 60)
    : 5
) * 60_000;
const GUIDE_DETAIL_CACHE_MAX_ENTRIES = 2_000;

function getSessionScope(context: UrbanoSessionContext): string {
  return context.sedeId ? `sede:${context.sedeId}` : `user:${context.userId}`;
}

function getGuideCacheKey(session: UrbanoSession, guide: string): string {
  return `${session.sedeId ?? session.username}:${guide}`;
}

function pruneGuideDetailCache(now: number): void {
  for (const [key, entry] of guideDetailCache) {
    if (entry.expiresAt <= now) guideDetailCache.delete(key);
  }
  while (guideDetailCache.size >= GUIDE_DETAIL_CACHE_MAX_ENTRIES) {
    const oldestKey = guideDetailCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    guideDetailCache.delete(oldestKey);
  }
}

async function getCachedGuideDetail(session: UrbanoSession, guide: string): Promise<UrbanoGuideDetail> {
  const key = getGuideCacheKey(session, guide);
  const now = Date.now();
  const cached = guideDetailCache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;
  if (cached) guideDetailCache.delete(key);

  const pending = guideDetailRequests.get(key);
  if (pending) return pending;

  const request = executeGuideDetailFetch(session, guide)
    .then((value) => {
      pruneGuideDetailCache(Date.now());
      guideDetailCache.set(key, {
        value,
        expiresAt: Date.now() + GUIDE_DETAIL_CACHE_TTL_MS,
      });
      return value;
    })
    .finally(() => {
      if (guideDetailRequests.get(key) === request) guideDetailRequests.delete(key);
    });
  guideDetailRequests.set(key, request);
  return request;
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

async function resolveOperationalProvinceCode(session: UrbanoSession): Promise<string> {
  if (session.operationalProvinceCode) return session.operationalProvinceCode;

  const response = await fetch(URBANO_DISPATCH_MODULE, {
    headers: buildAjaxHeaders(session.phpSessionId),
    signal: AbortSignal.timeout(20_000),
  });
  const source = await response.text();
  if (!response.ok || /name=["']usuario["']/i.test(source)) {
    throw new Error('La sesion de Urbano vencio. Vuelve a iniciar sesion para consultar nuevamente.');
  }

  const provinceCode = source.match(/var\s+prov_codigo\s*=\s*["'](\d{1,10})["']/)?.[1] || '';
  if (!provinceCode || Number(provinceCode) <= 0) {
    throw new Error('Urbano no informo la agencia operativa asociada a esta cuenta.');
  }

  session.operationalProvinceCode = provinceCode;
  return provinceCode;
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

function parseNullableCoordinate(value: unknown): number | null {
  const normalized = String(value ?? '').replace(',', '.').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= -180 && parsed <= 180 && parsed !== 0
    ? parsed
    : null;
}

function parseNullableFlag(value: unknown): boolean | null {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (['1', 'S', 'SI', 'Y', 'YES', 'TRUE'].includes(normalized)) return true;
  if (['0', 'N', 'NO', 'FALSE'].includes(normalized)) return false;
  return null;
}

function cleanNullableText(value: unknown, maxLength = 255): string | null {
  const clean = String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return clean ? clean.slice(0, maxLength) : null;
}

function normalizeScalar(value: unknown): UrbanoScalar | undefined {
  if (value === null) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  return cleanNullableText(value, 500) || '';
}

function firstText(source: Record<string, unknown>, keys: string[], maxLength = 255): string {
  const caseInsensitiveKeys = new Map(
    Object.keys(source).map((key) => [key.toLowerCase(), key]),
  );
  for (const key of keys) {
    const sourceKey = Object.prototype.hasOwnProperty.call(source, key)
      ? key
      : caseInsensitiveKeys.get(key.toLowerCase());
    const value = cleanNullableText(sourceKey ? source[sourceKey] : undefined, maxLength);
    if (value) return value;
  }
  return '';
}

function firstValue(source: Record<string, unknown>, keys: string[]): unknown {
  const caseInsensitiveKeys = new Map(
    Object.keys(source).map((key) => [key.toLowerCase(), key]),
  );
  for (const key of keys) {
    const sourceKey = Object.prototype.hasOwnProperty.call(source, key)
      ? key
      : caseInsensitiveKeys.get(key.toLowerCase());
    if (sourceKey && source[sourceKey] !== null && source[sourceKey] !== '') return source[sourceKey];
  }
  return undefined;
}

function sanitizedAttributes(source: Record<string, unknown>): Record<string, UrbanoScalar> {
  return Object.entries(source).slice(0, 60).reduce<Record<string, UrbanoScalar>>((result, [key, value]) => {
    const normalized = normalizeScalar(value);
    if (normalized !== undefined) result[key.slice(0, 80)] = normalized;
    return result;
  }, {});
}

export function normalizeDispatchGuide(item: unknown, index: number): UrbanoDispatchGuide {
  const source = item && typeof item === 'object' && !Array.isArray(item)
    ? item as Record<string, unknown>
    : {};
  const guide = firstText(source, ['guia_wyb', 'guia_digit', 'guia_texto', 'guia', 'numero_guia', 'guia_numero', 'gui_numero', 'nro_guia', 'tracking_number'], 100);
  const tracking = firstText(source, ['rastreo', 'tracking', 'cod_rastreo', 'codigo_rastreo', 'guia_tracking', 'tracking_code'], 100);

  return {
    id: firstText(source, ['id', 'guia_id', 'id_guia', 'gui_id'], 100) || guide || tracking || String(index + 1),
    guide,
    tracking,
    recipient: firstText(source, ['consignado', 'destinatario', 'receptor', 'cliente_destino', 'nombre_destinatario', 'nom_destinatario', 'nombre'], 180),
    phone: firstText(source, ['telefonos', 'telefono', 'celular', 'telefono_destino', 'tel_destino'], 80),
    destination: firstText(source, ['localidad', 'destino', 'ubigeo', 'provincia_destino', 'prov_des_nombre', 'oficina_destino', 'ciudad_destino', 'provincia', 'distrito'], 180),
    address: firstText(source, ['direccion', 'direccion_destino', 'domicilio', 'dir_entrega', 'direccion_entrega'], 300),
    status: firstText(source, ['estado', 'estado_guia', 'guia_estado', 'estado_descripcion', 'ultimo_estado', 'situacion'], 120),
    customer: firstText(source, ['cliente', 'cliente_nombre', 'cliente_origen', 'cli_nombre', 'shipper', 'razon_social', 'contrato'], 180),
    service: firstText(source, ['servicio', 'servicio_nombre', 'tipo_servicio', 'sku_group', 'producto', 'tipo_paquete'], 120),
    manifest: firstText(source, ['manifiesto', 'numero_manifiesto', 'manifiesto_numero', 'nro_manifiesto', 'despacho', 'id_despacho', 'cdp'], 100),
    pieces: parseNullableInteger(firstValue(source, ['piezas', 'bultos', 'cantidad', 'cantidad_piezas'])),
    weightKg: parseNullableNumber(firstValue(source, ['peso', 'peso_kg', 'peso_total'])),
    registeredAt: firstText(source, ['fecha', 'fecha_registro', 'fecha_ingreso', 'fecha_despacho', 'created_at'], 80),
    attributes: sanitizedAttributes(source),
    detail: null,
  };
}

function nonNegativeNumber(value: unknown): number {
  return parseNullableNumber(value) ?? 0;
}

function nonNegativeInteger(value: unknown): number {
  return parseNullableInteger(value) ?? 0;
}

export function normalizeDispatchSummary(item: unknown, line = 3): UrbanoDispatchSummary | null {
  const source = item && typeof item === 'object' && !Array.isArray(item)
    ? item as Record<string, unknown>
    : {};
  const id = firstText(source, ['id_despacho'], 20);
  const destinationCode = firstText(source, ['prov_des'], 10);
  if (!/^\d+$/.test(id) || !/^\d+$/.test(destinationCode)) return null;

  const barcode = firstText(source, ['barra_des'], 40);
  const documentNumber = firstText(source, ['doc_numero', 'd_numero'], 40);
  const cdp = barcode || (documentNumber ? `CDP${documentNumber}` : `CDP${id}`);
  return {
    id,
    cdp,
    destinationCode,
    destination: firstText(source, ['destino'], 80),
    origin: firstText(source, ['origen'], 80),
    dispatchedAt: firstText(source, ['des_fecha_despacho'], 20),
    admittedAt: firstText(source, ['fecha_adm'], 20),
    containerType: firstText(source, ['nom_tipo_contenedor'], 100),
    operator: firstText(source, ['usr_codigo'], 120),
    status: firstText(source, ['estado_descri', 'des_estado', 'estado'], 100),
    totalGuides: nonNegativeInteger(firstValue(source, ['tot_guias'])),
    admittedGuides: nonNegativeInteger(firstValue(source, ['tot_guias_adm', 'tot_guias_ad'])),
    totalPieces: nonNegativeInteger(firstValue(source, ['tot_piezas'])),
    admittedPieces: nonNegativeInteger(firstValue(source, ['tot_piezas_adm', 'tot_piezas_ad'])),
    totalWeightKg: nonNegativeNumber(firstValue(source, ['tot_peso'])),
    admittedWeightKg: nonNegativeNumber(firstValue(source, ['tot_peso_adm', 'tot_peso_ad'])),
    line,
  };
}

export function normalizeGuideDetail(item: unknown, requestedGuide: string): UrbanoGuideDetail {
  const source = item && typeof item === 'object' && !Array.isArray(item)
    ? item as Record<string, unknown>
    : {};

  return {
    guide: firstText(source, ['guia_texto', 'guia_wyb', 'guia_digit'], 100) || requestedGuide,
    tracking: firstText(source, ['rastreo', 'cod_rastreo', 'tracking'], 100),
    recipient: firstText(source, ['cliente', 'consignado', 'destinatario', 'nombre'], 180),
    phone: firstText(source, ['telefonos', 'telefono', 'celular'], 80),
    email: firstText(source, ['e_mail', 'email', 'correo'], 180),
    address: firstText(source, ['direccion', 'direccion_destino', 'domicilio'], 500),
    locality: firstText(source, ['localidad', 'ubigeo'], 180),
    origin: firstText(source, ['origen'], 80),
    destination: firstText(source, ['destino'], 80),
    sender: firstText(source, ['remite', 'remitente'], 180),
    pieces: parseNullableInteger(firstValue(source, ['piezas', 'cantidad_piezas'])),
    weightKg: parseNullableNumber(firstValue(source, ['peso', 'peso_kg'])),
    status: firstText(source, ['estado', 'estado_descripcion'], 180),
    statusDetail: firstText(source, ['sub_estado', 'detalle_estado'], 300),
    service: firstText(source, ['servicio', 'tipo_paquete'], 300),
    seller: firstText(source, ['seller'], 180),
    contract: firstText(source, ['contrato'], 120),
    contents: firstText(source, ['guia_contenido', 'contenido'], 500),
    registeredAt: firstText(source, ['fecha_ss', 'fecha_registro'], 40),
    estimatedDeliveryDate: firstText(source, ['fecha_estimada'], 40),
    pieceReference: firstText(source, ['id_piezas'], 180),
    latitude: parseNullableCoordinate(firstValue(source, ['dir_px', 'latitud', 'latitude'])),
    longitude: parseNullableCoordinate(firstValue(source, ['dir_py', 'longitud', 'longitude'])),
    fragile: parseNullableFlag(firstValue(source, ['fragil_li', 'fragil'])),
    insured: parseNullableFlag(firstValue(source, ['seguro_li', 'seguro'])),
    insuranceValue: parseNullableNumber(firstValue(source, ['valor_seguro_li', 'valor_seguro'])),
    dates: {
      pickup: firstText(source, ['fecha_pu'], 40),
      dispatched: firstText(source, ['fecha_dd'], 40),
      admitted: firstText(source, ['fecha_ad'], 40),
      outForDelivery: firstText(source, ['fecha_er'], 40),
      deadline: firstText(source, ['fecha_dl'], 40),
    },
    retrievedAt: new Date().toISOString(),
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
    operationalProvinceCode: null,
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

async function executeDispatchFetch(session: UrbanoSession, query: UrbanoDispatchRequest) {
  const destinationProvince = await resolveOperationalProvinceCode(session);
  const requestUrl = new URL(URBANO_DISPATCH_GUIDES);
  requestUrl.searchParams.set('_dc', String(Date.now()));
  requestUrl.searchParams.set('vp_id_despacho', query.dispatchId);
  requestUrl.searchParams.set('vp_prov_des', destinationProvince);
  requestUrl.searchParams.set('vp_linea', String(query.line));
  requestUrl.searchParams.set('page', '1');
  requestUrl.searchParams.set('start', '0');
  requestUrl.searchParams.set('limit', '1000');

  const response = await fetch(requestUrl, {
    headers: buildAjaxHeaders(session.phpSessionId),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(`Urbano respondio con estado ${response.status}.`);
  }

  if (payload?.success === false) {
    const upstreamMessage = cleanNullableText(payload?.message ?? payload?.msg, 200);
    throw new Error(upstreamMessage || 'Urbano rechazo la consulta del despacho.');
  }

  if (!Array.isArray(payload?.data)) {
    throw new Error('La respuesta de Urbano no contiene una lista de guias valida.');
  }

  const allRecords = payload.data.map((item: unknown, index: number) => normalizeDispatchGuide(item, index));
  const reportedTotal = Number(payload.total ?? payload.totalCount ?? payload.recordsTotal);
  const total = Number.isFinite(reportedTotal) && reportedTotal >= 0 ? reportedTotal : allRecords.length;
  const pageRecords = allRecords.slice(query.start, query.start + query.limit);
  const records = await mapWithConcurrency<UrbanoDispatchGuide, UrbanoDispatchGuide>(
    pageRecords,
    5,
    async (record) => {
      try {
        const detail = await getCachedGuideDetail(session, record.guide);
        return {
          ...record,
          tracking: detail.tracking || record.tracking,
          recipient: detail.recipient || record.recipient,
          phone: detail.phone || record.phone,
          destination: detail.locality || detail.destination || record.destination,
          address: detail.address || record.address,
          status: detail.status || record.status,
          service: detail.service || record.service,
          pieces: detail.pieces ?? record.pieces,
          weightKg: detail.weightKg ?? record.weightKg,
          registeredAt: detail.registeredAt || record.registeredAt,
          detail,
        };
      } catch {
        return record;
      }
    },
  );

  return {
    dispatchId: query.dispatchId,
    destinationProvince,
    line: query.line,
    page: query.page,
    limit: query.limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.limit)),
    returned: records.length,
    retrievedAt: new Date().toISOString(),
    records,
  };
}

async function executeDispatchListFetch(session: UrbanoSession, query: UrbanoDispatchListRequest) {
  const destinationProvince = await resolveOperationalProvinceCode(session);
  const requestUrl = new URL(URBANO_DISPATCHES);
  const params: Record<string, string> = {
    _dc: String(Date.now()),
    vp_prov_org: '0',
    vp_prov_des: destinationProvince,
    vp_region: '0',
    vp_tipo_via: '0',
    vp_fec_desde: query.fromDate,
    vp_fec_hasta: query.toDate,
    vp_tip_envio: 'R',
    vp_estado: '999',
    vp_linea: String(query.line),
    page: '1',
    start: '0',
    limit: '500',
  };
  Object.entries(params).forEach(([key, value]) => requestUrl.searchParams.set(key, value));

  const response = await fetch(requestUrl, {
    headers: buildAjaxHeaders(session.phpSessionId),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) throw new Error(`Urbano respondio con estado ${response.status}.`);
  if (payload?.success === false) {
    const upstreamMessage = cleanNullableText(payload?.message ?? payload?.msg, 200);
    throw new Error(upstreamMessage || 'Urbano rechazo la consulta de despachos.');
  }
  if (!Array.isArray(payload?.data)) {
    throw new Error('La respuesta de Urbano no contiene una lista de despachos valida.');
  }

  const records = payload.data
    .map((item: unknown) => normalizeDispatchSummary(item, query.line))
    .filter((record: UrbanoDispatchSummary | null): record is UrbanoDispatchSummary => record !== null);

  return {
    fromDate: query.fromDate,
    toDate: query.toDate,
    total: records.length,
    retrievedAt: new Date().toISOString(),
    records,
  };
}

async function executeGuideDetailFetch(session: UrbanoSession, guide: string): Promise<UrbanoGuideDetail> {
  const requestUrl = new URL(URBANO_TRACK_DETAILS);
  const params: Record<string, string> = {
    _dc: String(Date.now()),
    vp_guia: guide,
    user: '',
    key: '',
    vp_linea: '3',
    page: '1',
    start: '0',
    limit: '25',
  };
  Object.entries(params).forEach(([key, value]) => requestUrl.searchParams.set(key, value));

  const response = await fetch(requestUrl, {
    headers: buildAjaxHeaders(session.phpSessionId),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) throw new Error(`Urbano respondio con estado ${response.status}.`);
  if (payload?.success === false) {
    const upstreamMessage = cleanNullableText(payload?.message ?? payload?.msg, 200);
    throw new Error(upstreamMessage || 'Urbano rechazo la consulta de la guia.');
  }
  if (!Array.isArray(payload?.data)) {
    throw new Error('La respuesta de Urbano no contiene el detalle de la guia.');
  }

  if (!payload.data[0]) throw new Error('Urbano no encontro informacion para esta guia.');
  return normalizeGuideDetail(payload.data[0], guide);
}

async function performSilentLogin(context: UrbanoSessionContext): Promise<UrbanoSession> {
  const scope = getSessionScope(context);
  const activeSession = urbanoSessions.get(scope);
  if (activeSession) return activeSession;

  const pendingLogin = urbanoLoginRequests.get(scope);
  if (pendingLogin) return pendingLogin;

  const request = (async () => {
    await loginToUrbano(context);
    const session = urbanoSessions.get(scope);
    if (!session) throw new Error('Fallo el inicio de sesion automatico en Urbano.');
    return session;
  })().finally(() => {
    if (urbanoLoginRequests.get(scope) === request) urbanoLoginRequests.delete(scope);
  });
  urbanoLoginRequests.set(scope, request);
  return request;
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

export async function fetchDispatchGuides(
  context: UrbanoSessionContext,
  query: UrbanoDispatchRequest,
) {
  const scope = getSessionScope(context);
  let session = urbanoSessions.get(scope);

  if (!session) {
    session = await performSilentLogin(context);
  }

  try {
    return await executeDispatchFetch(session, query);
  } catch (error: any) {
    const errorMessage = String(error?.message || '').toLowerCase();
    const isSessionExpired = errorMessage.includes('sesion de urbano vencio')
      || errorMessage.includes('json valido');

    if (isSessionExpired) {
      urbanoSessions.delete(scope);
      session = await performSilentLogin(context);
      return executeDispatchFetch(session, query);
    }

    throw error;
  }
}

export async function fetchDispatches(
  context: UrbanoSessionContext,
  query: UrbanoDispatchListRequest,
) {
  const scope = getSessionScope(context);
  let session = urbanoSessions.get(scope);
  if (!session) session = await performSilentLogin(context);

  try {
    return await executeDispatchListFetch(session, query);
  } catch (error: any) {
    const errorMessage = String(error?.message || '').toLowerCase();
    const isSessionExpired = errorMessage.includes('sesion de urbano vencio')
      || errorMessage.includes('json valido');
    if (isSessionExpired) {
      urbanoSessions.delete(scope);
      session = await performSilentLogin(context);
      return executeDispatchListFetch(session, query);
    }
    throw error;
  }
}

export async function fetchGuideDetails(context: UrbanoSessionContext, guide: string) {
  const scope = getSessionScope(context);
  let session = urbanoSessions.get(scope);
  if (!session) session = await performSilentLogin(context);

  try {
    return await getCachedGuideDetail(session, guide);
  } catch (error: any) {
    const errorMessage = String(error?.message || '').toLowerCase();
    const isSessionExpired = errorMessage.includes('sesion de urbano vencio')
      || errorMessage.includes('json valido');
    if (isSessionExpired) {
      urbanoSessions.delete(scope);
      session = await performSilentLogin(context);
      return getCachedGuideDetail(session, guide);
    }
    throw error;
  }
}
