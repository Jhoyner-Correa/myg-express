const DEFAULT_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_PROVIDER_NAME = 'OpenStreetMap';
const DEFAULT_ATTRIBUTION_TEXT = 'OpenStreetMap';
const DEFAULT_ATTRIBUTION_URL = 'https://www.openstreetmap.org/copyright';
const DEFAULT_MAX_ZOOM = 19;

type MapEnvironment = {
  PROD?: boolean;
  VITE_MAP_TILE_URL?: string;
  VITE_MAP_PROVIDER_NAME?: string;
  VITE_MAP_ATTRIBUTION_TEXT?: string;
  VITE_MAP_ATTRIBUTION_URL?: string;
  VITE_MAP_MAX_ZOOM?: string;
};

export type MapTileConfig = {
  tileUrl: string;
  providerName: string;
  attribution: string;
  maxZoom: number;
  usesDefaultProvider: boolean;
};

function validTileUrl(value: string, production: boolean) {
  if (!value.includes('{z}') || !value.includes('{x}') || !value.includes('{y}')) return false;

  try {
    const testUrl = new URL(value.replaceAll('{s}', 'a').replaceAll('{z}', '0').replaceAll('{x}', '0').replaceAll('{y}', '0'));
    if (testUrl.protocol === 'https:') return true;
    return !production && testUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(testUrl.hostname);
  } catch {
    return false;
  }
}

function validAttributionUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function maxZoom(value: string | undefined) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? Math.min(22, Math.max(1, parsed)) : DEFAULT_MAX_ZOOM;
}

export function resolveMapTileConfig(environment: MapEnvironment): MapTileConfig {
  const requestedTileUrl = environment.VITE_MAP_TILE_URL?.trim() ?? '';
  const tileUrl = validTileUrl(requestedTileUrl, environment.PROD === true)
    ? requestedTileUrl
    : DEFAULT_TILE_URL;
  const usesDefaultProvider = tileUrl === DEFAULT_TILE_URL;

  const providerName = environment.VITE_MAP_PROVIDER_NAME?.trim()
    || (usesDefaultProvider ? DEFAULT_PROVIDER_NAME : 'Proveedor cartográfico');
  const attributionText = environment.VITE_MAP_ATTRIBUTION_TEXT?.trim()
    || (usesDefaultProvider ? DEFAULT_ATTRIBUTION_TEXT : providerName);
  const requestedAttributionUrl = environment.VITE_MAP_ATTRIBUTION_URL?.trim() ?? '';
  const attributionUrl = validAttributionUrl(requestedAttributionUrl)
    ? requestedAttributionUrl
    : usesDefaultProvider ? DEFAULT_ATTRIBUTION_URL : '';
  const safeText = escapeHtml(attributionText);
  const attribution = attributionUrl
    ? `&copy; <a href="${attributionUrl}" target="_blank" rel="noopener noreferrer">${safeText}</a>`
    : `&copy; ${safeText}`;

  return {
    tileUrl,
    providerName,
    attribution,
    maxZoom: maxZoom(environment.VITE_MAP_MAX_ZOOM),
    usesDefaultProvider,
  };
}

export const mapTileConfig = resolveMapTileConfig(import.meta.env);
