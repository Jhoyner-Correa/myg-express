type RuntimeTarget = 'api' | 'worker';

function required(name: string, errors: string[]) {
  const value = String(process.env[name] || '').trim();
  if (!value) errors.push(`${name} es obligatorio.`);
  return value;
}

function strongSecret(name: string, errors: string[]) {
  const value = required(name, errors);
  if (value && Buffer.byteLength(value, 'utf8') < 32) {
    errors.push(`${name} debe tener al menos 32 bytes.`);
  }
}

function isExplicitHttpsOrigin(origin: string) {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:' && parsed.origin === origin && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

/**
 * Impide iniciar un proceso de produccion con credenciales de desarrollo o
 * una superficie HTTP configurada de forma insegura.
 */
export function validateRuntimeEnvironment(target: RuntimeTarget) {
  if (process.env.NODE_ENV !== 'production') return;

  const errors: string[] = [];
  required('DB_HOST', errors);
  required('DB_USER', errors);
  required('DB_PASSWORD', errors);
  required('DB_NAME', errors);
  strongSecret('JWT_SECRET', errors);
  strongSecret('PAYMENTS_DATA_ENCRYPTION_KEY', errors);
  strongSecret('URBANO_CREDENTIALS_SECRET', errors);

  const trustProxy = Number(process.env.APP_TRUST_PROXY_HOPS);
  if (!Number.isInteger(trustProxy) || trustProxy < 1 || trustProxy > 5) {
    errors.push('APP_TRUST_PROXY_HOPS debe ser un entero entre 1 y 5.');
  }

  if (target === 'api') {
    const origins = String(process.env.APP_CORS_ORIGINS || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    if (!origins.length) errors.push('APP_CORS_ORIGINS es obligatorio para la API.');
    if (origins.some(origin => origin === '*' || !isExplicitHttpsOrigin(origin))) {
      errors.push('APP_CORS_ORIGINS solo puede contener origenes HTTPS explicitos.');
    }
    if (origins.some(origin => /localhost|127\.0\.0\.1/i.test(origin))) {
      errors.push('APP_CORS_ORIGINS no puede contener localhost en produccion.');
    }
  }

  if (errors.length) {
    throw new Error(`Configuracion de produccion invalida:\n- ${errors.join('\n- ')}`);
  }
}
