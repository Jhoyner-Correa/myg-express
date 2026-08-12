export function parseUrbanoRouteId(value: unknown): string | null {
  const routeId = String(value ?? '').trim();
  return /^\d{1,20}$/.test(routeId) ? routeId : null;
}

export function publicUrbanoErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const publicMessages = [
    'Esta operacion requiere una sede con credenciales Urbano configuradas.',
    'Esta sede no tiene credenciales Urbano activas. Configuralas desde el panel SysAdmin.',
    'Falta configurar URBANO_CREDENTIALS_SECRET para usar credenciales Urbano por sede.',
    'Falta ejecutar la migracion urbano_credenciales_sede antes de usar Urbano por sede.',
    'No se pudo iniciar sesion en Urbano. Verifica tus credenciales.',
    'La sesion de Urbano vencio. Vuelve a iniciar sesion para consultar nuevamente.',
  ];
  return publicMessages.includes(message) ? message : 'No se pudo consultar la ruta en Urbano.';
}
