// Driver-portability unit tests: the PG SQL rewriter must translate SQLite
// dialect constructs WITHOUT corrupting string literals or parameter order.
const { test } = require('node:test');
const assert = require('node:assert');
const { rewriteToPg } = require('../../src/config/db');

test('pg rewriter: datetime(now) → to_char with identical output format', () => {
  const { sql } = rewriteToPg("UPDATE users SET updated_at = datetime('now') WHERE id = ?", [7]);
  assert.ok(sql.includes("to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')"), 'rewritten expression present');
  assert.ok(!sql.includes('datetime('), 'no sqlite function remains');
  assert.strictEqual(sql.includes('$1'), true, 'positional param preserved');
});

test('pg rewriter: to_char mask literals survive (no :MI/:SS params)', () => {
  const { sql, params } = rewriteToPg("SELECT * FROM t WHERE a = ? AND b = 'HH24:MI:SS'", [1]);
  assert.ok(sql.includes("'HH24:MI:SS'"), 'string literal untouched');
  assert.strictEqual(params.length, 1, 'literal did not become a parameter');
  assert.strictEqual((sql.match(/\$\d/g) || []).length, 1, 'exactly one placeholder');
});

test('pg rewriter: named parameters keep first-use order (repeats reuse the index)', () => {
  const { sql, params } = rewriteToPg(
    'INSERT INTO t (a, b) VALUES (@alpha, @beta) ON CONFLICT (a) DO UPDATE SET b = @beta',
    [{ beta: 2, alpha: 1 }]
  );
  assert.strictEqual(sql, 'INSERT INTO t (a, b) VALUES ($1, $2) ON CONFLICT (a) DO UPDATE SET b = $2');
  assert.deepStrictEqual(params, [1, 2], 'each unique name indexed once; repeats reuse it');
});

test('pg rewriter: undefined and NaN parameters map to null', () => {
  const { params } = rewriteToPg('SELECT * FROM t WHERE a = ? AND b = ? AND c = ?', [undefined, NaN, 'x']);
  assert.deepStrictEqual(params, [null, null, 'x']);
});

test('pg rewriter: escaped-quote datetime variant (historical admin statement)', () => {
  const { sql } = rewriteToPg("UPDATE prompt_versions SET updated_at = datetime(\\'now\\') WHERE id = 1", []);
  assert.ok(sql.includes('to_char('), 'escaped variant rewritten');
});
