# TEST_REPORT.md — Psychometric AI v2.0.0

All numbers below are from actual runs performed in this audit session. No results are
transcribed from earlier phases. Environment: Node v24.21.0, npm 11.19.0, Linux, clean
`npm install` (0 vulnerabilities).

---

## 1. Automated test suite (`npm test`)

Runner: `node --test` (native), each test file gets an **isolated, pid-unique SQLite DB**
(auto-deleted on close) and an ephemeral-port server.

| Suite | Tests | Pass | Fail | Skipped |
|---|---|---|---|---|
| `backend/tests/unit/` (engines, sanitizer, validators, config) | 30 | 30 | 0 | 0 |
| `backend/tests/integration/` (auth, assessment lifecycle, reports, parent consent, versioning, **API contract**) | 19 | 19 | 0 | 0 |
| `backend/tests/security/` (IDOR matrix, RBAC, OTP backdoor, brute force, LLM boundary, audit payload scan) | 18 | 18 | 0 | 0 |
| **Total** | **67** | **67** | **0** | **0** |

```
ℹ tests 67  ℹ pass 67  ℹ fail 0  ℹ cancelled 0  ℹ skipped 0  ℹ duration_ms ≈ 6.0s
```

Warnings: none. Notable coverage inside the suite: RIASEC `Number(null)=0` regression,
difficulty-weighted scoring, deterministic tie-breaks, `ASSESSMENT_INCOMPLETE` 422 gate,
no-score-leakage in question payloads, report hash/prompt-version presence, parent consent
gate, "static OTP must not mint an admin", LLM payload contains no secrets.

## 2. Final-audit verification scripts

| Script | Checks | Result | Covers instruction § |
|---|---|---|---|
| `node scripts/verify-db.js` | 90 | **90 PASS / 0 FAIL** | §3 database from zero, schema introspection, seed |
| `node scripts/final-verify-engines.js` | 134 | **134 PASS / 0 FAIL** | §7–§14 engines, §21 reproducibility, §22 versioning |
| `node scripts/final-verify-live-a.js` | 77 | **77 PASS / 0 FAIL** | §4 auth, §5 authz matrix, §6 assessment, §19 input security, §31-A |
| `node scripts/final-verify-live-b.js` | 76 | **76 PASS / 0 FAIL** | §15 LLM boundary, §16 failure modes, §17 injection, §18 privacy, §20 reports, §22 lock, §31-B/C |
| **Total audit checks** | **377** | **377 PASS** | |

Each script exits non-zero on any failure and prints a PASS/FAIL line per check
(rerunnable evidence — see command list in §5).

## 3. Lint and build

| Command | Result |
|---|---|
| `npm run lint` (ESLint 9 flat config) | **0 errors, 0 warnings** (started this audit with 316 errors → fixed 15 real dead-code issues + env config; final state clean) |
| `npm run build` (verification build) | **BUILD OK** — 65 JS files syntax-verified, 15 HTML asset refs resolved, no hardcoded absolute URLs, `build-manifest.json` emitted |

## 4. Browser QA (interactive, strict CSP on)

| Journey | Steps exercised | Result |
|---|---|---|
| Landing + demo student | click DEMO Student → dashboard renders 7 ranked streams → open report | OK, no console errors |
| Admin | login → analytics/questions/scoring/prompts/audit tabs → table data renders | OK, no console errors |
| New candidate | register modal (role select, name, email, password) → auto-login → Begin Assessment → select option by **click** → select by **Enter key** → Next → "Question 2 of 44" | OK, no console errors |
| Viewports | 375×812, 768×1024, 1440×900 | no horizontal scroll |
| Console / page errors across all journeys | — | **0 / 0** |

## 5. Reproduction commands

```bash
npm install
npm test                          # 67/67
npm run test:unit                 # 30/30
npm run test:integration          # 19/19
npm run test:security             # 18/18
npm run lint                      # 0 errors
npm run build                     # BUILD OK
node scripts/verify-db.js         # 90/90
node scripts/final-verify-engines.js   # 134/134
node scripts/final-verify-live-a.js    # 77/77
node scripts/final-verify-live-b.js    # 76/76
npm audit                         # 0 vulnerabilities
```

## 6. Recorded issues → resolution

See `FINAL_AUDIT.md` §3 (F-01…F-13). Every issue discovered by these tests was fixed and
the corresponding check re-run to green before this report was written. One test was updated
during the audit to follow the new §23 error envelope (`assessment.test.js` now asserts
`error.code === 'ASSESSMENT_INCOMPLETE'`); six new API-contract tests were added.
