// Psychometric AI — Express server (v2, refactored).
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

const env = require('./config/env');
const { runMigrations } = require('../migrations/migrate');
const { seedDatabase } = require('../seeds/runSeed');
const routes = require('./routes');
const { HttpError } = require('./utils/helpers');
const { generalLimiter } = require('./middleware/rateLimiters');
const observability = require('./observability/sentry');

const app = express();

observability.init();

app.set('trust proxy', 1); // deployment behind reverse proxy

// ---------- Security headers ----------
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"], // report print styles use inline styles
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'", env.FRONTEND_URL, env.BACKEND_URL],
      'frame-ancestors': ["'none'"],
      'object-src': ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// ---------- CORS allowlist ----------
const allowedOrigins = [env.FRONTEND_URL, env.BACKEND_URL, 'http://localhost:5000', 'http://localhost:5173']
  .filter(Boolean)
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // same-origin / curl / tests
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new HttpError(403, 'Origin not allowed by CORS policy.'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600
}));

// ---------- API response envelope (spec §23) ----------
// Every /api JSON response uses ONE consistent contract:
//   2xx → { "success": true,  "data": <controller payload> }
//   4xx/5xx → { "success": false, "error": { "code": "...", "message": "..." } }
// Internal error details never reach the client: the central error handler
// sends a generic message for 5xx in production, and this layer never echoes
// stack traces or driver errors.
// NOTE: registered BEFORE the body parsers so malformed-JSON errors (thrown by
// express.json) are also shaped by this envelope.
const STATUS_CODES = {
  400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND',
  409: 'CONFLICT', 422: 'UNPROCESSABLE', 429: 'RATE_LIMITED', 500: 'INTERNAL', 501: 'NOT_IMPLEMENTED'
};
app.use('/api', (req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400) {
      const message = (body && (body.error || body.message)) || 'Request failed.';
      const code = (body && body.code) || STATUS_CODES[res.statusCode] || 'ERROR';
      return originalJson({ success: false, error: { code, message } });
    }
    if (body && typeof body === 'object' && body.success === false) return originalJson(body);
    return originalJson({ success: true, data: body });
  };
  next();
});

// ---------- Parsers ----------
app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

// ---------- Rate limiting ----------
app.use('/api', generalLimiter);

// ---------- API routes ----------
app.use('/api', routes);

// ---------- Static frontend ----------
const frontendPath = path.resolve(__dirname, '../../frontend');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath, { index: 'index.html' }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      return res.sendFile(path.join(frontendPath, 'index.html'));
    }
    next();
  });
}

// ---------- 404 for unknown API paths ----------
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// ---------- Central error handler ----------
// Emits the legacy {error, code} shape; when the request came through /api the
// envelope middleware (already on the chain) reshapes it to the final
// { success:false, error:{code,message} } contract (spec §23).
app.use((err, req, res, _next) => {
  const status = err instanceof HttpError ? err.status : (err.status || 500);
  const isServer = status >= 500;
  if (isServer) {
    console.error(`[error] ${req.method} ${req.path}:`, err.message, '\n', err.stack?.split('\n').slice(1, 4).join('\n'));
    observability.captureError(err, { method: req.method, path: req.path, status });
  }
  // Malformed bodies: never echo the parser's internal position details.
  const isParseError = err.type === 'entity.parse.failed' || (err instanceof SyntaxError && status === 400);
  res.status(status).json({
    error: isParseError ? 'Malformed request body.'
      : isServer && env.IS_PROD ? 'Internal server error.' : err.message,
    code: err.code || 'ERROR'
  });
});

// ---------- Bootstrap ----------
async function startServer({ migrate = true, seed = true } = {}) {
  try {
    if (migrate) await runMigrations();
    if (seed && env.SEED_DEMO_DATA) await seedDatabase();
  } catch (err) {
    observability.captureError(err, { phase: 'bootstrap' });
    throw err;
  }
  return new Promise((resolve) => {
    const server = app.listen(env.PORT, () => {
      console.log('====================================================');
      console.log(`Psychometric AI v2.0.0 → http://localhost:${env.PORT}`);
      console.log(`Environment: ${env.NODE_ENV} | LLM provider: ${env.LLM_PROVIDER} | DB: ${env.DB_DRIVER} | OTP: ${env.OTP_PROVIDER}`);
      console.log('Deterministic psychometric core: ACTIVE');
      console.log('====================================================');
      resolve(server);
    });
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { app, startServer };
