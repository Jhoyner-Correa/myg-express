// ============================================================
// utils/messageFormatter.ts
// Utilidad para personalizar mensajes usando variables dinámicas
// ============================================================

/**
 * Reemplaza las variables de una plantilla con los datos del cliente.
 *
 * Ejemplo:
 *   plantilla: "Hola {nombre}, tu pedido {codigo_pedido} llegó a {ciudad}."
 *   cliente:   { nombre: "María", codigo_pedido: "PED-001", ciudad: "Lima" }
 *   resultado: "Hola María, tu pedido PED-001 llegó a Lima."
 *
 * @param plantilla  Texto de la plantilla con variables entre llaves {variable}
 * @param datos      Objeto con los valores que reemplazarán las variables
 * @returns          Mensaje personalizado listo para enviar
 */
export function formatearMensaje(
  plantilla: string,
  datos: Record<string, string>
): string {
  let mensajePersonalizado = plantilla;

  // Iteramos cada clave del objeto y reemplazamos {clave} por su valor
  for (const [clave, valor] of Object.entries(datos)) {
    // Creamos una expresión regular global para reemplazar TODAS las ocurrencias
    const variable = new RegExp(`\\{${clave}\\}`, 'g');
    mensajePersonalizado = mensajePersonalizado.replace(variable, valor);
  }

  return mensajePersonalizado;
}
