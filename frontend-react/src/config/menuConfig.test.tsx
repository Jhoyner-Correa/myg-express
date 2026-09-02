import { describe, expect, it } from 'vitest';
import { sidebarMenuConfig } from './menuConfig';

describe('sidebarMenuConfig', () => {
  it('organiza Recursos Humanos como un módulo con rutas únicas', () => {
    const rrhh = sidebarMenuConfig.find(item => item.title === 'Recursos Humanos');
    const paths = rrhh?.children?.map(item => item.path);

    expect(rrhh?.path).toBeUndefined();
    expect(paths).toEqual([
      '/rrhh/resumen',
      '/rrhh/personal',
      '/rrhh/asistencia',
      '/rrhh/solicitudes',
      '/rrhh/horarios',
      '/rrhh/pagos',
      '/rrhh/gps',
      '/rrhh/configuracion',
    ]);
    expect(new Set(paths).size).toBe(paths?.length);
  });

  it('protege GPS con su permiso especializado', () => {
    const rrhh = sidebarMenuConfig.find(item => item.title === 'Recursos Humanos');
    const gps = rrhh?.children?.find(item => item.path === '/rrhh/gps');

    expect(gps?.permission).toBe('gps.ver');
  });

  it('separa pagos y configuracion de la consulta general de RRHH', () => {
    const rrhh = sidebarMenuConfig.find(item => item.title === 'Recursos Humanos');
    const payments = rrhh?.children?.find(item => item.path === '/rrhh/pagos');
    const configuration = rrhh?.children?.find(item => item.path === '/rrhh/configuracion');

    expect(payments?.permission).toBe('rrhh.pagos.ver');
    expect(configuration?.permission).toBe('rrhh.configurar');
  });

  it('no expone el módulo retirado de Gestión de entregas', () => {
    const serializedMenu = JSON.stringify(sidebarMenuConfig);

    expect(serializedMenu).not.toContain('/logistica/entregas');
    expect(serializedMenu).not.toContain('entregas.ver');
  });
});
