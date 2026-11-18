// observability — optional Sentry error tracking.
//
// Enabled ONLY when SENTRY_DSN is set; without it every call is a no-op so
// local dev and CI never require the dependency at runtime. Traces are off by
// default (keep the deterministic core's latency profile untouched); error
// capture covers the central error handler and server bootstrap failures.
//
// PII policy: beforeSend strips query strings, request bodies and any obvious
// email/phone values from captured events (docs/PRIVACY.md).

let Sentry = null;

function init() {
  if (!process.env.SENTRY_DSN) return false;
  try {
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 0,
      beforeSend(event) {
        try {
          if (event.request) {
            delete event.request.data;      // bodies may contain answers/PII
            if (event.request.query_string) delete event.request.query_string;
            if (event.request.cookies) delete event.request.cookies;
          }
          const scrub = (s) => String(s || '')
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
            .replace(/(\+?\d[\d\s-]{7,}\d)/g, '[phone]');
          if (event.request?.url) event.request.url = scrub(event.request.url);
          if (event.message) event.message = scrub(event.message);
        } catch { /* never block error delivery on scrubbing */ }
        return event;
      },
    });
    console.log(`[observability] Sentry initialized (${process.env.NODE_ENV})`);
    return true;
  } catch (err) {
    console.error('[observability] SENTRY_DSN set but @sentry/node unavailable:', err.message);
    return false;
  }
}

function captureError(err, context = {}) {
  if (!Sentry) return;
  Sentry.captureException(err, { extra: context });
}

module.exports = { init, captureError };
