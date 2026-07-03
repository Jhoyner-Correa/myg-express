import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';

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
  const defaultCorsOrigins = isProduction ? [] : [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001'
  ];
  const corsOrigins = parseList(process.env.APP_CORS_ORIGINS, defaultCorsOrigins);
  if (isProduction && corsOrigins.length === 0) {
    console.warn('[Security] APP_CORS_ORIGINS no esta configurado. Solo se permitiran solicitudes same-origin/sin Origin.');
  }
  const connectSrc = parseList(process.env.APP_CSP_CONNECT_SRC, [
    "'self'",
    ...defaultCorsOrigins,
    'ws://localhost:3000',
    'ws://127.0.0.1:3000',
    'ws://localhost:3001',
    'ws://127.0.0.1:3001'
  ]);
  const scriptSrc = parseList(process.env.APP_CSP_SCRIPT_SRC, [
    "'self'",
    'https://cdn.jsdelivr.net',
    'https://cdnjs.cloudflare.com'
  ]);
  const styleSrc = parseList(process.env.APP_CSP_STYLE_SRC, [
    "'self'",
    "'unsafe-inline'",
    'https://fonts.googleapis.com'
  ]);
  const fontSrc = parseList(process.env.APP_CSP_FONT_SRC, [
    "'self'",
    'https://fonts.gstatic.com',
    'data:'
  ]);
  const imgSrc = parseList(process.env.APP_CSP_IMG_SRC, [
    "'self'",
    'data:',
    'blob:'
  ]);
  const mediaSrc = parseList(process.env.APP_CSP_MEDIA_SRC, [
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
      const ip = req.ip || '';
      return (
        url.includes('/webhook') ||
        ip === '127.0.0.1' ||
        ip === '::1' ||
        ip === '::ffff:127.0.0.1' ||
        ip.startsWith('172.') ||
        ip.startsWith('192.168.') ||
        ip.startsWith('10.')
      );
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
      if (!origin || corsOrigins.includes(origin) || corsOrigins.includes('*')) {
        callback(null, true);
        return;
      }
      callback(new Error('Origen no permitido por CORS'));
    }
  }));
  app.use(morgan('dev'));
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use('/api', apiLimiter);
  return app;
}
