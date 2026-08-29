const CODE_WIDTH = 4;

export function employeeCodePrefix(companyCode: string, companyId: number): string {
  if (companyCode.trim().toUpperCase() === 'MYG_EXPRESS') return 'MYG';
  if (!Number.isInteger(companyId) || companyId < 1) throw new Error('La empresa del colaborador no es valida.');
  return `EMP${companyId}`;
}

export function formatEmployeeCode(prefix: string, sequence: number): string {
  const normalizedPrefix = prefix.trim().toUpperCase();
  if (!/^[A-Z0-9]{2,10}$/.test(normalizedPrefix)) throw new Error('El prefijo del codigo de colaborador no es valido.');
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new Error('El correlativo del colaborador no es valido.');
  return `${normalizedPrefix}-${String(sequence).padStart(CODE_WIDTH, '0')}`;
}
