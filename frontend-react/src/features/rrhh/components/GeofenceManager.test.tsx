import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rrhhService } from '../rrhh.service';
import { GeofenceManager } from './GeofenceManager';
import { capturePreciseSiteLocation } from './site-location-capture';

vi.mock('../rrhh.service', () => ({
  rrhhService: { saveGeofence: vi.fn() },
}));
vi.mock('./site-location-capture', () => ({
  capturePreciseSiteLocation: vi.fn(),
}));
vi.mock('../../../core/utils/toast', () => ({ showToast: vi.fn() }));

describe('GeofenceManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(capturePreciseSiteLocation).mockResolvedValue({
      latitude: -11.252721,
      longitude: -74.638612,
      accuracyMeters: 12,
      capturedAt: new Date(),
    });
    vi.mocked(rrhhService.saveGeofence).mockResolvedValue({
      site_id: 2, latitude: -11.252721, longitude: -74.638612,
      radius_meters: 30, maximum_accuracy_meters: 20,
    });
  });

  it('captura el punto presencial y conserva su trazabilidad al guardar', async () => {
    const onCatalogChanged = vi.fn().mockResolvedValue(undefined);
    render(<GeofenceManager
      siteId={2}
      sites={[{ id: 2, name: 'SATIPO', status: 'activo' }]}
      geofences={[]}
      canManage
      onSiteChange={vi.fn()}
      onCatalogChanged={onCatalogChanged}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Capturar ubicación aquí' }));
    await waitFor(() => expect(screen.getByDisplayValue('-11.25272100')).toBeInTheDocument());
    expect(screen.getByText(/12 m de precisión/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Guardar geocerca de SATIPO/i }));
    await waitFor(() => expect(rrhhService.saveGeofence).toHaveBeenCalledWith(2, {
      latitude: -11.252721,
      longitude: -74.638612,
      radius_meters: 30,
      maximum_accuracy_meters: 20,
      capture_method: 'DEVICE_GPS',
      capture_accuracy_meters: 12,
    }));
    expect(onCatalogChanged).toHaveBeenCalledOnce();
  });
});
