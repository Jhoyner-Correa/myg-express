import type { JntPackage, JntConsigneeGroup } from './types';

export function buildJntPackageRows(packages: JntPackage[]) {
  return packages.map((p, index) => ({
    '#': index + 1,
    'Página PDF': p.pagina,
    'Código Guía': p.guia,
    'Destinatario / Consignado': p.consignado,
    'Celular': p.telefono,
    'Distrito': p.distrito,
    'Provincia': p.provincia,
    'Departamento': p.departamento,
    'Dirección': p.direccion,
    'C.P.': p.codigoPostal,
    'Ruta Interna': p.codigoRuta,
    'Peso (kg)': p.pesoKg !== null ? p.pesoKg : '',
    'Contenido': p.contenido,
    'Piezas': p.piezas
  }));
}

export function buildJntConsigneeRows(consignees: JntConsigneeGroup[]) {
  return consignees.map((c, index) => ({
    '#': index + 1,
    'Destinatario / Consignado': c.consignado,
    'Celular': c.telefono,
    'Total Paquetes': c.totalPaquetes,
    'Distrito Principal': c.distrito,
    'Guías': c.guias.join(', ')
  }));
}

export async function exportJntPackagesToExcel(packages: JntPackage[], fileName = 'paquetes_jnt.xlsx') {
  const XLSX = await import('xlsx');
  const rows = buildJntPackageRows(packages);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Paquetes J&T');
  XLSX.writeFile(workbook, fileName);
}

export async function exportJntConsigneesToExcel(consignees: JntConsigneeGroup[], fileName = 'consignados_jnt.xlsx') {
  const XLSX = await import('xlsx');
  const rows = buildJntConsigneeRows(consignees);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Consignados J&T');
  XLSX.writeFile(workbook, fileName);
}
