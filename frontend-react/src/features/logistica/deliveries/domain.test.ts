import { describe, expect, it } from 'vitest';
import { formatRelativeDeliveryDate, formatWeight, latestPackageDate, maskPhone, packageDetail, routeLabel, splitPackages } from './domain';
import type { DeliveryPackage } from './types';

const base: DeliveryPackage = {
  id: 1, lote_id: 8, codigo_paquete: 'PK-1', fecha_ingreso: '2026-08-11T10:00:00',
  peso_kg: 1.5, estado_entrega: 'pendiente', ruta: { nombre: 'MYG-8', zona: 'Villa Rica' },
};

describe('dominio de Gestión de entregas', () => {
  it('enmascara teléfonos sin exponer el número completo', () => {
    expect(maskPhone('987654321')).toBe('987 *** 321');
    expect(maskPhone('123')).toBe('123');
    expect(maskPhone(null)).toBe('Sin teléfono');
  });

  it('formatea fechas relativas y pesos', () => {
    const now = new Date('2026-08-12T17:00:00');
    expect(formatRelativeDeliveryDate('2026-08-12T09:00:00', now)).toBe('Hoy');
    expect(formatRelativeDeliveryDate('2026-08-11T09:00:00', now)).toBe('Ayer');
    expect(formatWeight(1.5)).toBe('1.5 kg');
    expect(formatWeight(null)).toBe('Sin peso');
  });

  it('separa paquetes y determina el ingreso más reciente', () => {
    const delivered = { ...base, id: 2, estado_entrega: 'recogido' as const, fecha_ingreso: '2026-08-12T10:00:00' };
    expect(splitPackages([base, delivered])).toEqual({ pending: [base], delivered: [delivered] });
    expect(latestPackageDate([base, delivered])).toBe(delivered.fecha_ingreso);
  });

  it('construye etiquetas y detalle operativo', () => {
    const item = { ...base, tamano_paquete: { label: 'Mediano', codigo: 'mediano', rango: '1–3 kg' }, piezas: 2, contenido_paquete: 'Ropa' };
    expect(routeLabel(item)).toBe('MYG-8');
    expect(packageDetail(item)).toBe('1–3 kg · 2 piezas · Ropa');
  });
});
