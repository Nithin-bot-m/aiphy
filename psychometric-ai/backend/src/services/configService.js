// Central scoring configuration service.
//
// Design: the psychometric ENGINES are pure synchronous functions and read the
// cached config via getScoringConfig() (defaults until populated). The async
// DB override (admin_settings) is resolved by scoringService through
// loadScoringConfig() BEFORE engines run — so DB-driven config is effective
// in production while engine unit tests stay deterministic and db-free.
const { db } = require('../config/db');
const { DEFAULT_SCORING_CONFIG } = require('../config/constants');

const SETTINGS_KEY = 'scoring_config';

let cached = null;
let cachedAt = 0;
const CACHE_TTL_MS = 15_000;

async function readFromDb() {
  try {
    const row = await db.prepare('SELECT value_json FROM admin_settings WHERE key = ?').get(SETTINGS_KEY);
    if (!row) return null;
    return JSON.parse(row.value_json);
  } catch {
    // Table may not exist during bootstrap/migrations; fall back to defaults.
    return null;
  }
}

function deepMerge(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(override || {})) {
    const o = override[key];
    if (o && typeof o === 'object' && !Array.isArray(o) && base && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      out[key] = deepMerge(base[key], o);
    } else {
      out[key] = o;
    }
  }
  return out;
}

/** SYNC accessor for pure engines: returns the cached config (defaults until loaded). */
function getScoringConfig() {
  return cached || DEFAULT_SCORING_CONFIG;
}

/** ASYNC loader: refreshes the cache from admin_settings (15s TTL). */
async function loadScoringConfig() {
  const now = Date.now();
  if (cached && now - cachedAt < CACHE_TTL_MS) return cached;
  const override = await readFromDb();
  cached = override ? deepMerge(DEFAULT_SCORING_CONFIG, override) : DEFAULT_SCORING_CONFIG;
  cachedAt = now;
  return cached;
}

function invalidateConfigCache() {
  cached = null;
}

async function saveScoringConfig(partial) {
  const current = await loadScoringConfig();
  const next = deepMerge(current, partial);
  await db.prepare(`
    INSERT INTO admin_settings (key, value_json, description, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
  `).run(SETTINGS_KEY, JSON.stringify(next), 'Deterministic engine scoring configuration');
  invalidateConfigCache();
  return next;
}

module.exports = { getScoringConfig, loadScoringConfig, saveScoringConfig, invalidateConfigCache };
