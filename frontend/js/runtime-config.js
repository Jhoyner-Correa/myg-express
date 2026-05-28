// Runtime config for local/prod without touching the app code.
// Default behavior:
// - localhost / 127.0.0.1 / ::1  -> http://localhost:3000/api
// - any other host               -> /api
//
// If you ever need to force a value, replace mode: 'auto' with:
// mode: 'manual'
// apiBase: 'http://localhost:3000/api'

(function () {
  const APP_CONFIG = {
    mode: 'auto',
    apiBase: '/api',
    whatsappApiBase: '/api',
    localApiBase: 'http://localhost:3000/api',
    localWhatsAppApiBase: 'http://localhost:3000/api',
    productionApiBase: '/api'
  };

  const host = window.location.hostname;
  const isLocalHost =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '';

  if (APP_CONFIG.mode === 'manual') {
    window.__APP_CONFIG__ = APP_CONFIG;
    window.__API_BASE__ = APP_CONFIG.apiBase;
    return;
  }

  const resolvedApiBase = isLocalHost
    ? APP_CONFIG.localApiBase
    : APP_CONFIG.productionApiBase;
  const resolvedWhatsAppApiBase = isLocalHost
    ? APP_CONFIG.localWhatsAppApiBase
    : APP_CONFIG.productionApiBase;

  window.__APP_CONFIG__ = {
    ...APP_CONFIG,
    apiBase: resolvedApiBase,
    whatsappApiBase: resolvedWhatsAppApiBase
  };
  window.__API_BASE__ = resolvedApiBase;
  window.__WHATSAPP_API_BASE__ = resolvedWhatsAppApiBase;
})();
