// Unit tests: sanitizers, helpers, config service, assessment versioning policy.
const { test } = require('node:test');
const assert = require('node:assert');

const { sanitizeNarrativeHtml, escapeHtml } = require('../../src/utils/htmlSanitizer');
const { isValidEmail, isValidPhone, isValidStudentCode, assertStrongPassword, randomCode, sha256Hex, timingSafeEqualStr } = require('../../src/utils/helpers');
const { getScoringConfig } = require('../../src/services/configService');

// ---------- HTML sanitizer (LLM output boundary) ----------
test('sanitizer: strips script tags and content', () => {
  const out = sanitizeNarrativeHtml('<h3>Report</h3><script>alert(1)</script><p>Fine</p>');
  assert.ok(!out.includes('script'), 'no script tag');
  assert.ok(!out.includes('alert(1)'), 'no script payload');
  assert.ok(out.includes('<h3>Report</h3>'));
  assert.ok(out.includes('<p>Fine</p>'));
});

test('sanitizer: strips event handlers and javascript: URLs by removing attributes', () => {
  const out = sanitizeNarrativeHtml('<p onclick="evil()">x</p><a href="javascript:evil()">y</a>');
  assert.ok(!out.includes('onclick'));
  assert.ok(!out.includes('javascript:'));
});

test('sanitizer: allows expected report tags and drops others', () => {
  const out = sanitizeNarrativeHtml('<h3>A</h3><iframe src="x"></iframe><em>b</em><style>body{}</style>');
  assert.ok(out.includes('<h3>A</h3>'));
  assert.ok(out.includes('<em>b</em>'));
  assert.ok(!out.includes('iframe'));
  assert.ok(!out.includes('style'));
});

test('escapeHtml: neutralizes injection characters', () => {
  assert.strictEqual(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});

// ---------- Validation helpers ----------
test('helpers: validators', () => {
  assert.ok(isValidEmail('a@b.co'));
  assert.ok(!isValidEmail('not-an-email'));
  assert.ok(isValidPhone('+919876543210'));
  assert.ok(!isValidPhone('123'));
  assert.ok(isValidStudentCode('PC-AB12CD34'));
  assert.ok(!isValidStudentCode('STU-1234'));
  assert.throws(() => assertStrongPassword('short'), /at least 8/);
  assert.throws(() => assertStrongPassword('onlyletters'), /letters and numbers/);
  assert.ok(randomCode(8).length === 8);
  assert.strictEqual(sha256Hex('x'), sha256Hex('x'));
  assert.ok(timingSafeEqualStr('abc', 'abc'));
  assert.ok(!timingSafeEqualStr('abc', 'abd'));
});

// ---------- Scoring config service ----------
test('config: defaults available & include documented tie-break order', () => {
  const cfg = getScoringConfig();
  assert.deepStrictEqual(cfg.riasec_tie_break_order, ['R', 'I', 'A', 'S', 'E', 'C']);
  assert.strictEqual(cfg.difficulty_weights.easy, 1.0);
  assert.strictEqual(cfg.difficulty_weights.medium, 1.5);
  assert.strictEqual(cfg.difficulty_weights.hard, 2.0);
  assert.ok(cfg.fit_bands.some(b => b.label === 'Strong Fit' && b.min === 75));
});
