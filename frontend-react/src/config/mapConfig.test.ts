import { describe, expect, it } from 'vitest';
import { resolveMapTileConfig } from './mapConfig';

describe('resolveMapTileConfig', () => {
  it('uses the official OpenStreetMap endpoint by default', () => {
    const config = resolveMapTileConfig({ PROD: true });

    expect(config.tileUrl).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(config.providerName).toBe('OpenStreetMap');
    expect(config.usesDefaultProvider).toBe(true);
    expect(config.maxZoom).toBe(19);
  });

  it('accepts a production HTTPS tile provider', () => {
    const config = resolveMapTileConfig({
      PROD: true,
      VITE_MAP_TILE_URL: 'https://maps.example.com/style/{z}/{x}/{y}.png?key=public-key',
      VITE_MAP_PROVIDER_NAME: 'MyG Maps',
      VITE_MAP_ATTRIBUTION_TEXT: 'Proveedor cartográfico',
      VITE_MAP_ATTRIBUTION_URL: 'https://maps.example.com/legal',
      VITE_MAP_MAX_ZOOM: '21',
    });

    expect(config.tileUrl).toContain('maps.example.com');
    expect(config.providerName).toBe('MyG Maps');
    expect(config.attribution).toContain('maps.example.com/legal');
    expect(config.usesDefaultProvider).toBe(false);
    expect(config.maxZoom).toBe(21);
  });

  it('rejects insecure or malformed production endpoints', () => {
    const config = resolveMapTileConfig({
      PROD: true,
      VITE_MAP_TILE_URL: 'http://maps.example.com/{z}/{x}/{y}.png',
    });

    expect(config.tileUrl).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(config.usesDefaultProvider).toBe(true);
  });

  it('requires all coordinates and clamps the maximum zoom', () => {
    const config = resolveMapTileConfig({
      PROD: true,
      VITE_MAP_TILE_URL: 'https://maps.example.com/{z}/{x}.png',
      VITE_MAP_MAX_ZOOM: '99',
    });

    expect(config.usesDefaultProvider).toBe(true);
    expect(config.maxZoom).toBe(22);
  });
});
