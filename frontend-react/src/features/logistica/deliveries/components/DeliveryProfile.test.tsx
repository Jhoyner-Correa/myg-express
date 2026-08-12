import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DeliveryClient, DeliveryPackage } from '../types';
import { DeliveryProfile } from './DeliveryProfile';

const client: DeliveryClient = {
  cliente_key: 'cliente-1', nombre: 'MarÃ­a PÃ©rez', telefono: '987654321',
  total: 2, pendientes: 1, recogidos: 1, ultimo_ingreso: '2026-08-12T10:00:00',
};

const packages: DeliveryPackage[] = [
  { id: 1, lote_id: 8, codigo_paquete: 'PK-1', fecha_ingreso: '2026-08-12T10:00:00', peso_kg: 1, estado_entrega: 'pendiente', ruta: { nombre: 'MYG-8' } },
  { id: 2, lote_id: 8, codigo_paquete: 'PK-2', fecha_ingreso: '2026-08-11T10:00:00', peso_kg: 2, estado_entrega: 'recogido', ruta: { nombre: 'MYG-8' } },
];

const callbacks = { onExport: vi.fn(), onDeliver: vi.fn(), onRevert: vi.fn(), onRetry: vi.fn() };

describe('DeliveryProfile', () => {
  it('oculta cambios de estado a usuarios con permiso solo de lectura', () => {
    render(<DeliveryProfile client={client} packages={packages} siteName="Satipo" loading={false} canManage={false} {...callbacks} />);

    expect(screen.getByRole('heading', { name: 'MarÃ­a PÃ©rez' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /entregar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /revertir/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportar csv/i })).toBeInTheDocument();
  });

  it('habilita acciones operativas cuando el usuario puede gestionar', () => {
    render(<DeliveryProfile client={client} packages={packages} siteName="Satipo" loading={false} canManage {...callbacks} />);

    expect(screen.getByRole('button', { name: /entregar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /revertir/i })).toBeInTheDocument();
  });
});
