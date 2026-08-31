import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';

const CSP_KEYWORDS = new Set([
  'self',
  'none',
  'unsafe-inline',
  'unsafe-eval',
  'unsafe-hashes',
  'strict-dynamic',
  'report-sample',
  'wasm-unsafe-eval'
]);

export function normalizeCspSource(source: string) {
  const value = source.trim();
  if (!value) return value;

  const unquotedValue = value.replace(/^['"]|['"]$/g, '');
  return CSP_KEYWORDS.has(unquotedValue) ? `'${unquotedValue}'` : value;
}

export function createHttpApp() {
  const app = express();

  const isProduction = process.env.NODE_ENV === 'production';
  const trustProxyHops = Number(process.env.APP_TRUST_PROXY_HOPS ?? (isProduction ? 1 : 0));
  app.set('trust proxy', Number.isFinite(trustProxyHops) && trustProxyHops > 0 ? trustProxyHops : false);

  const parseList = (value: string | undefined, fallback: string[]) => {
    const items = String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return items.length ? items : fallback;
  };
  const parseCspList = (value: string | undefined, fallback: string[]) => (
    parseList(value, fallback).map(normalizeCspSource)
  );
  const defaultCorsOrigins = isProduction ? [] : [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ];
  const corsOrigins = parseList(process.env.APP_CORS_ORIGINS, defaultCorsOrigins);
  if (isProduction && corsOrigins.length === 0) {
    console.warn('[Security] APP_CORS_ORIGINS no esta configurado. Solo se permitiran solicitudes same-origin/sin Origin.');
  }
  const developmentConnectSources = [
    ...defaultCorsOrigins,
    'ws://localhost:3000',
    'ws://127.0.0.1:3000',
    'ws://localhost:3001',
    'ws://127.0.0.1:3001'
  ];
  const connectSrc = parseCspList(
    process.env.APP_CSP_CONNECT_SRC,
    ["'self'", ...(isProduction ? [] : developmentConnectSources)]
  );
  const scriptSrc = parseCspList(process.env.APP_CSP_SCRIPT_SRC, [
    "'self'",
    'https://cdn.jsdelivr.net',
    'https://cdnjs.cloudflare.com'
  ]);
  const styleSrc = parseCspList(process.env.APP_CSP_STYLE_SRC, [
    "'self'",
    "'unsafe-inline'",
    'https://fonts.googleapis.com'
  ]);
  const fontSrc = parseCspList(process.env.APP_CSP_FONT_SRC, [
    "'self'",
    'https://fonts.gstatic.com',
    'data:'
  ]);
  const imgSrc = parseCspList(process.env.APP_CSP_IMG_SRC, [
    "'self'",
    'data:',
    'blob:',
    'https://*.tile.openstreetmap.org'
  ]);
  const mediaSrc = parseCspList(process.env.APP_CSP_MEDIA_SRC, [
    "'self'",
    'data:',
    'blob:'
  ]);
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1500,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const url = (req.originalUrl || req.url || '').toLowerCase();
      return url.includes('/webhook');
    },
    message: {
      ok: false,
      mensaje: 'Demasiadas solicitudes. Intenta nuevamente en unos minutos.'
    }
  });

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc,
        scriptSrcElem: scriptSrc,
        connectSrc: connectSrc,
        styleSrc,
        styleSrcElem: styleSrc,
        fontSrc,
        imgSrc,
        mediaSrc,
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'self'"]
      }
    }
  }));
  app.use(cors({
    origin(origin, callback) {
      if (
        !origin || 
        corsOrigins.includes(origin) || 
        corsOrigins.includes('*') ||
        (!isProduction && (
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:')
        ))
      ) {
        callback(null, true);
        return;
      }
      console.warn(`[CORS] Origen rechazado: "${origin}". Orígenes permitidos:`, corsOrigins);
      callback(new Error(`Origen no permitido por CORS: ${origin}`));
    }
  }));
  app.use(morgan(isProduction ? 'combined' : 'dev'));
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use('/api', apiLimiter);
  return app;
}
