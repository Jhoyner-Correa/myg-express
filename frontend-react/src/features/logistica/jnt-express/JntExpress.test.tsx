import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JntExpress } from './JntExpress';
import { jntService } from './jnt.service';

vi.mock('../../../core/auth/authState', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      nombre: 'Operador J&T',
      usuario: 'operador_jnt',
      rol: 'SupervisorSede',
      sede_id: 1,
      permisos: ['jnt.ver', 'jnt.gestionar'],
    },
  }),
}));

vi.mock('./jnt.service', () => ({
  jntService: {
    listBatches: vi.fn(),
    getBatchDetails: vi.fn(),
    renameBatch: vi.fn(),
    deleteBatch: vi.fn(),
    uploadPdf: vi.fn(),
    listAvailableRoutes: vi.fn(),
    createWhatsAppRoute: vi.fn(),
  },
}));

describe('JntExpress Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra estado vacío inicial si no hay lotes cargados', async () => {
    vi.mocked(jntService.listBatches).mockResolvedValueOnce([]);

    render(
      <MemoryRouter>
        <JntExpress />
      </MemoryRouter>
    );

    expect(screen.getByText('J&T Express')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Ningún lote cargado')).toBeInTheDocument();
    });
  });

  it('renderiza tarjetas de métricas y tabla cuando hay un lote activo', async () => {
    vi.mocked(jntService.listBatches).mockResolvedValueOnce([
      {
        id: 10,
        sede_id: 1,
        usuario_id: 1,
        nombre_archivo: 'manifiesto_jnt.pdf',
        total_paginas: 2,
        total_paquetes: 2,
        total_consignados: 1,
        lote_carga_id: null,
        created_at: new Date().toISOString(),
      },
    ]);

    vi.mocked(jntService.getBatchDetails).mockResolvedValueOnce({
      lote: {
        id: 10,
        sede_id: 1,
        usuario_id: 1,
        nombre_archivo: 'manifiesto_jnt.pdf',
        total_paginas: 2,
        total_paquetes: 2,
        total_consignados: 1,
        lote_carga_id: null,
        created_at: new Date().toISOString(),
      },
      totalPaginas: 2,
      totalPaquetes: 2,
      totalConsignados: 1,
      consignadosMultiples: 1,
      distritos: { Satipo: 2 },
      paquetes: [
        {
          pagina: 1,
          guia: 'JPE00001',
          consignado: 'MARIO VARGAS',
          telefono: '987654321',
          distrito: 'Satipo',
          provincia: 'SATIPO',
          departamento: 'JUNIN',
          direccion: 'Av Principal 123',
          codigoRuta: 'M01',
          codigoPostal: '120601',
          pesoKg: 0.5,
          contenido: 'Ropa',
          piezas: 1,
        },
        {
          pagina: 2,
          guia: 'JPE00002',
          consignado: 'MARIO VARGAS',
          telefono: '987654321',
          distrito: 'Satipo',
          provincia: 'SATIPO',
          departamento: 'JUNIN',
          direccion: 'Av Principal 123',
          codigoRuta: 'M01',
          codigoPostal: '120601',
          pesoKg: 0.8,
          contenido: 'Zapatos',
          piezas: 1,
        },
      ],
      consignados: [
        {
          consignado: 'MARIO VARGAS',
          telefono: '987654321',
          totalPaquetes: 2,
          distrito: 'Satipo',
          guias: ['JPE00001', 'JPE00002'],
          paquetes: [],
        },
      ],
    });

    render(
      <MemoryRouter>
        <JntExpress />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Todos/i })).toBeInTheDocument();
      expect(screen.getByText('JPE00001')).toBeInTheDocument();
      expect(screen.getByText('JPE00002')).toBeInTheDocument();
      expect(screen.getAllByText('MARIO VARGAS')[0]).toBeInTheDocument();
      expect(screen.getByText('Mandar a Ruta')).toBeInTheDocument();
    });

    vi.mocked(jntService.listAvailableRoutes).mockResolvedValueOnce([
      {
        id: 77,
        sede_id: 1,
        sede_nombre: 'LA MERCED',
        fecha: '2026-11-26',
        zona: 'Satipo',
        nombre_lote: 'Satipo Tarde',
        estado: 'pendiente',
        total_registros: 0,
        created_at: new Date().toISOString(),
      },
    ]);

    fireEvent.click(screen.getByText('Mandar a Ruta'));
    await waitFor(() => {
      expect(screen.getByText('Mandar Paquetes a Ruta')).toBeInTheDocument();
      expect(screen.getByRole('option', { name: /Satipo Tarde/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Cancelar'));

    fireEvent.click(screen.getByText('JPE00001'));
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Detalle de guía JPE00001' })).toBeInTheDocument();
      expect(screen.getByText('Enviar aviso por WhatsApp')).toBeInTheDocument();
    });
  });
});
