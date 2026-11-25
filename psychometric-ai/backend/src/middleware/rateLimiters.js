// Rate limiters — strict on credential & OTP surfaces (fixes audited F6/F8).
//
// Single-instance deployments use the default in-memory store. Set REDIS_URL
// to share counters across multiple API instances (express-rate-limit requires
// a shared store behind a load balancer; see docs/DEPLOYMENT.md).
const rateLimit = require('express-rate-limit');

/** Optional shared Redis store (lazy — only when REDIS_URL is configured). */
function redisStore() {
  if (!process.env.REDIS_URL) return undefined;
  try {
    const { Redis } = require('ioredis');
    const { RedisStore } = require('rate-limit-redis');
    const client = new Redis(process.env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 });
    client.on('error', (err) => console.error('[rateLimit] redis error:', err.message));
    return new RedisStore({ sendCommand: (...args) => client.call(...args), prefix: 'prl:' });
  } catch (err) {
    console.error('[rateLimit] REDIS_URL set but redis deps unavailable — using memory store:', err.message);
    return undefined;
  }
}

const store = redisStore();

function makeLimiter({ windowMs, limit, message, ...extra }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: message },
    ...extra,
    ...(store ? { store } : {}),
  });
}

const generalLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  message: 'Too many requests. Please slow down.'
});

const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  message: 'Too many authentication attempts. Try again in 15 minutes.'
});

// Strict per-IP failed-login limiter (F-01): ignores successful sign-ins so shared
// school/family NAT networks are not penalized when multiple students sign in cleanly.
const loginIpLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: 'Too many failed sign-in attempts from this network. Try again in 15 minutes.'
});

const otpLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: 'Too many verification or recovery requests. Try again in 15 minutes.'
});

const linkLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: 'Too many link attempts. Try again in an hour.'
});

module.exports = { generalLimiter, authLimiter, loginIpLimiter, otpLimiter, linkLimiter };
