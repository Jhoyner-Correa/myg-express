import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rrhhService } from '../rrhh.service';
import { JobRoleManager } from './JobRoleManager';

vi.mock('../rrhh.service', () => ({
  rrhhService: { createJobRole: vi.fn(), updateJobRole: vi.fn() },
}));
vi.mock('../../../core/utils/toast', () => ({ showToast: vi.fn() }));

describe('JobRoleManager', () => {
  beforeEach(() => vi.clearAllMocks());

  it('permite seleccionar y actualizar un cargo existente', async () => {
    vi.mocked(rrhhService.updateJobRole).mockResolvedValue({
      id: 5, name: 'Supervisor de reparto', description: 'Coordina las entregas', default_tracking_type: 'CONTINUO',
    });
    const onCatalogChanged = vi.fn().mockResolvedValue(undefined);
    render(<JobRoleManager
      roles={[{ id: 5, name: 'Repartidor', description: 'Realiza entregas', default_tracking_type: 'CONTINUO' }]}
      canManage
      onCatalogChanged={onCatalogChanged}
    />);

    fireEvent.click(screen.getByRole('button', { name: /Repartidor/i }));
    const name = screen.getByLabelText('Nombre del cargo');
    fireEvent.change(name, { target: { value: 'Supervisor de reparto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(rrhhService.updateJobRole).toHaveBeenCalledWith(5, {
      name: 'Supervisor de reparto',
      description: 'Realiza entregas',
      default_tracking_type: 'CONTINUO',
    }));
    expect(onCatalogChanged).toHaveBeenCalledOnce();
  });
});
