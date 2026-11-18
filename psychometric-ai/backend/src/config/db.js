// Driver-agnostic data layer — SAME async surface over SQLite (node:sqlite, default)
// or PostgreSQL (pg, DB_DRIVER=postgres). The rest of the codebase only sees:
//
//   db.prepare(sql)         -> { run(...p), get(...p), all(...p) }   (all return Promises)
//   db.exec(sql)            -> Promise<void>
//   transaction(fn)         -> Promise (fn may await; nested calls become savepoints)
//
// Async discipline: BOTH drivers return Promises, so a forgotten `await`
// fails the SQLite test suite immediately instead of hiding until PG mode.
//
// Positional (?, like node:sqlite) AND named (@x / :x, object binding) params
// are supported; the PG driver rewrites them to $1..$n.

const env = require('./env');

const DRIVER = (env.DB_DRIVER || 'sqlite').toLowerCase();

function isNamedObject(arg) {
  return arg !== null && typeof arg === 'object' && !Array.isArray(arg) && !(arg instanceof Buffer) && !(arg instanceof Uint8Array);
}

// ---------------------------------------------------------------------------
// Parameter rewriting (used by the PG driver)
// ---------------------------------------------------------------------------
// SQLite's datetime('now') is also rewritten to an equivalent UTC-text
// expression so runtime statements (and shared DDL defaults) are portable.
// The output format matches SQLite exactly: 'YYYY-MM-DD HH:MM:SS' — all
// timestamp comparisons in the app are lexicographic-safe TEXT on both engines.
function rewriteToPg(sql, args) {
  sql = sql.replace(/datetime\((?:\\'|')now(?:\\'|')\)/g, "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')");
  let idx = 0;
  const namedOrder = [];
  const namedIndex = new Map();
  // Quote-aware rewriting: `?` / `@name` / `:name` inside single-quoted string
  // literals (e.g. the 'HH24:MI:SS' to_char mask) must NOT become parameters.
  const LITERAL = '\u0000SQLLIT\u0000';
  const literals = [];
  const masked = sql.replace(/'(?:[^']|'')*'/g, (m) => {
    literals.push(m);
    return `${LITERAL}${literals.length - 1}${LITERAL}`;
  });
  const out = masked.replace(/(\?|[@:]([a-zA-Z_][a-zA-Z0-9_]*))/g, (m, _all, name) => {
    if (m === '?') {
      idx += 1;
      return `$${idx}`;
    }
    // Repeated named parameters REUSE their first index — the values array
    // stays exactly as long as the highest placeholder index.
    if (namedIndex.has(name)) return `$${namedIndex.get(name)}`;
    namedOrder.push(name);
    idx += 1;
    namedIndex.set(name, idx);
    return `$${idx}`;
  }).replace(new RegExp(`${LITERAL}(\\d+)${LITERAL}`, 'g'), (_, i) => literals[Number(i)]);
  let params;
  if (args.length === 1 && isNamedObject(args[0])) {
    const obj = args[0];
    params = namedOrder.map((n) => {
      if (!(n in obj)) throw new Error(`Named parameter @${n} not provided`);
      return obj[n];
    });
  } else {
    params = args;
  }
  // undefined → null AND NaN → null: PG rejects NaN for integer parameters and
  // a NULL never matches a row, mirroring SQLite's "no such row" outcome.
  return {
    sql: out,
    params: params.map((p) => (p === undefined || (typeof p === 'number' && Number.isNaN(p)) ? null : p))
  };
}

// ---------------------------------------------------------------------------
// SQLite driver (node:sqlite) — async-wrapped for uniform surface
// ---------------------------------------------------------------------------
function createSqliteDriver() {
  const { DatabaseSync } = require('node:sqlite');
  const fs = require('fs');
  const path = require('path');

  const dbDir = path.dirname(env.DB_PATH);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  const raw = new DatabaseSync(env.DB_PATH);
  raw.exec('PRAGMA journal_mode = WAL;');
  raw.exec('PRAGMA foreign_keys = ON;');

  function wrapStatement(stmt) {
    return {
      async run(...args) {
        const res = stmt.run(...args);
        return { changes: Number(res.changes), lastInsertRowid: res.lastInsertRowid };
      },
      async get(...args) {
        return stmt.get(...args);
      },
      async all(...args) {
        return stmt.all(...args);
      },
    };
  }

  const db = {
    driver: 'sqlite',
    prepare(sql) {
      return wrapStatement(raw.prepare(sql));
    },
    async exec(sql) {
      return raw.exec(sql);
    },
    async close() {
      raw.close();
    },
  };

  let transactionDepth = 0;
  async function transaction(fn) {
    if (transactionDepth > 0) {
      const savepoint = `sp_${transactionDepth}`;
      await db.exec(`SAVEPOINT ${savepoint};`);
      transactionDepth += 1;
      try {
        const result = await fn();
        transactionDepth -= 1;
        await db.exec(`RELEASE SAVEPOINT ${savepoint};`);
        return result;
      } catch (err) {
        transactionDepth -= 1;
        await db.exec(`ROLLBACK TO SAVEPOINT ${savepoint};`);
        throw err;
      }
    }
    await db.exec('BEGIN;');
    transactionDepth = 1;
    try {
      const result = await fn();
      transactionDepth = 0;
      await db.exec('COMMIT;');
      return result;
    } catch (err) {
      transactionDepth = 0;
      await db.exec('ROLLBACK;');
      throw err;
    }
  }

  return { db, transaction };
}

// ---------------------------------------------------------------------------
// PostgreSQL driver (pg Pool)
// ---------------------------------------------------------------------------
function createPostgresDriver() {
  const { Pool, types } = require('pg');

  // Value-parity with SQLite: int8 (COUNT/SUM/bigint ids) and numeric (AVG/ROUND)
  // come back as STRINGS by default — parse them to JS numbers so `count === 1`
  // comparisons behave exactly as they do on the SQLite driver. All values in
  // this domain are far below Number.MAX_SAFE_INTEGER.
  types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // int8
  types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric

  const poolConfig = { connectionString: env.DATABASE_URL, max: 10 };
  // Managed Postgres providers (Render external URLs, Railway public URLs,
  // Heroku, Neon, Supabase) usually REQUIRE TLS. Honour an explicit DB_SSL=true
  // and the sslmode parameter inside DATABASE_URL itself. rejectUnauthorized is
  // relaxed because providers rotate their own CA — the connection is still
  // fully encrypted. Internal/same-region URLs carry no sslmode and stay plain.
  const urlRequiresSsl = /sslmode=(?:require|verify-ca|verify-full)/.test(env.DATABASE_URL || '');
  if (env.DB_SSL || urlRequiresSsl) {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
  if (env.DB_SCHEMA) {
    if (!/^[a-z_][a-z0-9_]*$/.test(env.DB_SCHEMA)) {
      throw new Error('DB_SCHEMA must be a plain lowercase identifier');
    }
    poolConfig.options = `-c search_path=${env.DB_SCHEMA}`;
  }
  const pool = new Pool(poolConfig);

  let txClient = null; // all statements inside transaction() use one client

  const pkCache = new Map();
  async function primaryKeyOf(table) {
    if (pkCache.has(table)) return pkCache.get(table);
    const res = await pool.query(
      `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_name = $1 AND tc.table_schema = current_schema()
        ORDER BY kcu.ordinal_position
        LIMIT 1`,
      [table]
    );
    const pk = res.rows[0]?.column_name || null;
    pkCache.set(table, pk);
    return pk;
  }

  function clientFor() { return txClient || pool; }

  function prepared(sql) {
    const insertMatch = /^\s*INSERT\s+INTO\s+([a-zA-Z_][a-zA-Z0-9_]*)/i.exec(sql);
    const insertTable = insertMatch ? insertMatch[1] : null;

    async function resolve(sqlText, args) {
      const { sql: pgSql, params } = rewriteToPg(sqlText, args);
      let finalSql = pgSql;
      if (insertTable && !/\bRETURNING\b/i.test(pgSql)) {
        const pk = await primaryKeyOf(insertTable);
        if (pk) finalSql = `${pgSql} RETURNING ${pk} AS lastinsertrowid`;
      }
      return { finalSql, params };
    }

    return {
      async run(...args) {
        const { finalSql, params } = await resolve(sql, args);
        const res = await clientFor().query(finalSql, params);
        const returned = res.rows[0]?.lastinsertrowid;
        return { changes: res.rowCount, lastInsertRowid: returned !== undefined ? returned : undefined };
      },
      async get(...args) {
        const { finalSql, params } = await resolve(sql, args);
        const res = await clientFor().query(finalSql, params);
        return res.rows[0];
      },
      async all(...args) {
        const { finalSql, params } = await resolve(sql, args);
        const res = await clientFor().query(finalSql, params);
        return res.rows;
      },
    };
  }

  const db = {
    driver: 'postgres',
    prepare: prepared,
    async exec(sql) {
      // exec carries DDL/multi-statement SQL (migrations): apply only the
      // dialect-function rewrite, never the ? → $ parameter rewrite.
      await clientFor().query(sql.replace(/datetime\((?:\\'|')now(?:\\'|')\)/g, "to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')"));
    },
    async close() {
      await pool.end();
    },
  };

  // Serialize concurrent transaction() invocations (a single process shares
  // one tx client at a time — mirrors the single-connection SQLite semantics).
  let txChain = Promise.resolve();
  async function transaction(fn) {
    const run = async () => {
      const client = await pool.connect();
      const prev = txClient;
      txClient = client;
      try {
        await client.query('BEGIN');
        const result = await fn();
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* connection may be dead */ }
        throw err;
      } finally {
        txClient = prev;
        client.release();
      }
    };
    const launched = txChain.then(run, run);
    txChain = launched.catch(() => {});
    return launched;
  }

  return { db, transaction };
}

// ---------------------------------------------------------------------------
const driverImpl = DRIVER === 'postgres' ? createPostgresDriver() : createSqliteDriver();

module.exports = { db: driverImpl.db, transaction: driverImpl.transaction, rewriteToPg, DRIVER };
