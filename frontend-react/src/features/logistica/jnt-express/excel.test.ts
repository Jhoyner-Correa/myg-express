import { describe, it, expect } from 'vitest';
import { buildJntPackageRows, buildJntConsigneeRows } from './excel';
import type { JntPackage, JntConsigneeGroup } from './types';

describe('jnt-express excel export', () => {
  it('construye filas de paquetes formateadas para Excel', () => {
    const packages: JntPackage[] = [
      {
        pagina: 1,
        guia: 'JPE001',
        consignado: 'GINA ENRIQUE',
        telefono: '945556310',
        distrito: 'Coviriali',
        provincia: 'SATIPO',
        departamento: 'JUNIN',
        direccion: 'Bellavista',
        codigoRuta: 'M02',
        codigoPostal: '120602',
        pesoKg: 0.61,
        contenido: 'dress',
        piezas: 1
      }
    ];

    const rows = buildJntPackageRows(packages);
    expect(rows).toHaveLength(1);
    expect(rows[0]!['Código Guía']).toBe('JPE001');
    expect(rows[0]!['Destinatario / Consignado']).toBe('GINA ENRIQUE');
    expect(rows[0]!['Celular']).toBe('945556310');
    expect(rows[0]!['Distrito']).toBe('Coviriali');
    expect(rows[0]!['Peso (kg)']).toBe(0.61);
  });

  it('construye filas de consignados agrupados para Excel', () => {
    const consignees: JntConsigneeGroup[] = [
      {
        consignado: 'GINA ENRIQUE',
        telefono: '945556310',
        totalPaquetes: 2,
        distrito: 'Coviriali',
        guias: ['JPE001', 'JPE002'],
        paquetes: []
      }
    ];

    const rows = buildJntConsigneeRows(consignees);
    expect(rows).toHaveLength(1);
    expect(rows[0]!['Destinatario / Consignado']).toBe('GINA ENRIQUE');
    expect(rows[0]!['Total Paquetes']).toBe(2);
    expect(rows[0]!['Guías']).toBe('JPE001, JPE002');
  });
});
