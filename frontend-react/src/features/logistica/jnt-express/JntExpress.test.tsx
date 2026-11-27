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

  it('evita doble envío en clic rápido y confirma cuando las guías ya están en la ruta', async () => {
    vi.mocked(jntService.listBatches).mockResolvedValueOnce([
      {
        id: 12,
        sede_id: 1,
        usuario_id: 1,
        nombre_archivo: 'manifiesto_jnt_confirm.pdf',
        total_paginas: 2,
        total_paquetes: 2,
        total_consignados: 2,
        lote_carga_id: null,
        created_at: new Date().toISOString(),
      },
    ]);

    vi.mocked(jntService.getBatchDetails).mockResolvedValueOnce({
      lote: {
        id: 12,
        sede_id: 1,
        usuario_id: 1,
        nombre_archivo: 'manifiesto_jnt_confirm.pdf',
        total_paginas: 2,
        total_paquetes: 2,
        total_consignados: 2,
        lote_carga_id: null,
        created_at: new Date().toISOString(),
      },
      totalPaginas: 2,
      totalPaquetes: 2,
      totalConsignados: 2,
      consignadosMultiples: 0,
      distritos: { Satipo: 2 },
      paquetes: [
        {
          pagina: 1,
          guia: 'JPE10001',
          consignado: 'ANA TORRES',
          telefono: '987654321',
          distrito: 'Satipo',
          provincia: 'SATIPO',
          departamento: 'JUNIN',
          direccion: 'Av 1',
          codigoRuta: 'M01',
          codigoPostal: '120601',
          pesoKg: 0.5,
          contenido: 'Ropa',
          piezas: 1,
        },
        {
          pagina: 2,
          guia: 'JPE10002',
          consignado: 'LUIS DIAZ',
          telefono: '987654322',
          distrito: 'Satipo',
          provincia: 'SATIPO',
          departamento: 'JUNIN',
          direccion: 'Av 2',
          codigoRuta: 'M01',
          codigoPostal: '120601',
          pesoKg: 0.8,
          contenido: 'Zapatos',
          piezas: 1,
        },
      ],
      consignados: [],
    });

    render(
      <MemoryRouter>
        <JntExpress />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Mandar a Ruta')).toBeInTheDocument();
    });

    vi.mocked(jntService.listAvailableRoutes).mockResolvedValueOnce([
      {
        id: 88,
        sede_id: 1,
        sede_nombre: 'LA MERCED',
        fecha: '2026-11-26',
        zona: 'Satipo',
        nombre_lote: 'la merced',
        estado: 'pendiente',
        total_registros: 0,
        guias_existentes: [],
        created_at: new Date().toISOString(),
      },
    ]);

    let resolveSend: (value: any) => void;
    vi.mocked(jntService.createWhatsAppRoute).mockImplementationOnce(
      () => new Promise(resolve => { resolveSend = resolve; })
    );

    fireEvent.click(screen.getByText('Mandar a Ruta'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirmar y mandar \(2\)/i })).toBeInTheDocument();
    });

    const submitBtn = screen.getByRole('button', { name: /Confirmar y mandar \(2\)/i });
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    expect(jntService.createWhatsAppRoute).toHaveBeenCalledTimes(1);

    resolveSend!({
      lote_carga_id: 88,
      nombre_ruta: 'la merced',
      total_avisos: 2,
      omitidos: 0,
    });

    await waitFor(() => {
      expect(screen.getByText('¡Confirmado! Paquetes mandados a la ruta')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cerrar'));

    vi.mocked(jntService.listAvailableRoutes).mockResolvedValueOnce([
      {
        id: 88,
        sede_id: 1,
        sede_nombre: 'LA MERCED',
        fecha: '2026-11-26',
        zona: 'Satipo',
        nombre_lote: 'la merced',
        estado: 'pendiente',
        total_registros: 2,
        guias_existentes: ['JPE10001', 'JPE10002'],
        created_at: new Date().toISOString(),
      },
    ]);

    fireEvent.click(screen.getByText('Mandar a Ruta'));
    await waitFor(() => {
      expect(screen.getByText('Ya enviados')).toBeInTheDocument();
      expect(screen.getByText(/Confirmado: estos 2 paquetes ya fueron mandados a la merced/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Confirmar y mandar/i })).not.toBeInTheDocument();
    });
  });
});
