# Privacy Documentation

Students on this platform are typically **minors (age 15-16)**. Privacy choices follow a
minimum-necessary principle, and the platform makes **no legal-compliance claims** (e.g. GDPR,
COPPA, India DPDP) beyond what is actually implemented below — deployment in any jurisdiction
requires a review against local law.

## 1. What is collected

| Data | Purpose | Required |
|---|---|---|
| Email and/or phone | authentication | one of the two |
| Full name | report personalization, linking | yes |
| Grade, board, school name (candidate) | report context | grade+board yes; school optional |
| Date of birth (candidate) | age-appropriate language (optional field) | no |
| Assessment responses | scoring | yes |
| Parent expectations/perceptions | congruence analysis | only if parent participates |
| Link relationships + consent timestamps | access control | yes |
| IPs + action metadata | security audit | yes (security purpose) |

Not collected: addresses, financial data, sensitive categories, free-text beyond one optional
parent comment field (2 KB cap).

## 2. Minimum-necessary exposure to the LLM

The canonical JSON handed to the LLM contains the student's **first name, grade and board** and
the psychometric scores. It does NOT contain: full name, email, phone, school, user IDs, or
parent identity. LLM payloads are tested to exclude secrets/SQL and are persisted for audit.

## 3. Consent & parental access

- A parent can only see a student's results after the **student explicitly approves** the link
  (`pending_student_approval` → `linked` with `student_consented_at` timestamp).
- Consent is revocable by the student at any time; revocation stops all future parental access.
- The parent instrument is labelled throughout as a "Parent Expectation & Perception Inventory"
  (a perception survey), never a psychological evaluation of the parent or child.
- Registration includes a plain-language notice that this is educational guidance, not a
  clinical evaluation, and that students control parental access.

## 4. Children's data handling notes

- Data minimization: single optional free-text field; no behavioural tracking; no third-party
  analytics or advertising; no cookies beyond the auth token in `localStorage`.
- The LLM is the only external processor; the offline provider keeps narratives fully local.
- Demo accounts are flagged `is_demo` and labelled in the UI; they are never mixed with real
  records and are excluded unless `SEED_DEMO_DATA=true`.

## 5. Logging

- Audit logs store user id, action, resource, IP, timestamp, small details JSON — security
  purpose only. Assessment responses and report narratives are NOT written to audit logs.
- LLM audit rows store prompts (score JSON + prompts) and sanitized outputs for reproducibility.
- Logs must never contain passwords (never hashed/stored raw) or OTP codes (hash only).

## 6. Data subject rights — implemented (updated)

- **Access/export:** admin JSON export of candidate data and audit trail
  (`GET /api/admin/export/:type`); per-subject portable export covering profile,
  mappings, assessments, responses, scores, stream results and report metadata
  (`GET /api/admin/users/:id/export`, DPDP §11 right to access).
- **Erasure (DPDP §12):** `POST /api/admin/users/:id/erase` anonymizes identity
  (email → `deleted-user-<id>@anonymized.invalid`; name, DOB, school, parent
  occupation, inventory comments and OTP hashes are scrubbed) while preserving
  psychometric records and security history for aggregate integrity. Admins
  cannot erase themselves or other admins; every access/erasure is audited.
- **Retention schedule (DPDP §8(7)):** enforced by `backend/scripts/retention.js`
  (daily timer or `POST /api/admin/retention/run`):

| Data class | Default retention | Config |
|---|---|---|
| LLM request/response audit rows | 180 days | `RETENTION_LLM_DAYS` |
| Security audit logs | 365 days | `RETENTION_AUDIT_DAYS` |
| OTP delivery outbox (masked) | 90 days | `RETENTION_OUTBOX_DAYS` |
| Abandoned incomplete assessments | keep (opt-in) | `RETENTION_INCOMPLETE_DAYS` |
| Scores, reports, accounts | purpose of service — not auto-deleted | — |

## 8. India — Digital Personal Data Protection Act, 2023 (DPDP) mapping

This platform is designed for Grade 10 students in India; the operator is the
**Data Fiduciary** and the student/parent are **Data Principals**.

| DPDP obligation | Implementation |
|---|---|
| §5 Grounds & notice | Plain-language notice at registration (educational guidance, not clinical); this document is the reference policy |
| §6 Consent | Registration consent + student-controlled parent linking (`student_consented_at`); free, specific, informed, unambiguous; revocable at any time |
| §6(5)/§6(6) Withdrawal | Student link revocation stops all parental access immediately; erasure endpoint available |
| §8(4) Security safeguards | bcrypt-12, hashed OTP + lockout, RBAC + ownership middleware, CSP, rate limiting, audit trail, TLS via Caddy |
| §8(5) Breach notification | Audit trail + Sentry; operator procedure required (notify DPB and affected principals per rules) |
| §8(6) Data minimization | No addresses/financial/sensitive data; one optional 2 KB free-text field; no advertising or behavioral tracking |
| §8(7) Erasure when purpose served | Retention job per schedule above |
| §9 Children (under 18) | Students are typically 15-16: no tracking/behavioural monitoring or targeted advertising at children; parent access is consent-gated by the student account holder |
| §10 Significant Data Fiduciary duties | Platform is NOT registered as SDF; if the operator's scale triggers SDF classification, appoint a DPO and complete a DPIA |
| §11 Right to access | Per-subject export endpoint above |
| §12 Right to correction & erasure | Erasure endpoint; correction via profile update (`PUT /candidate/profile`) |
| §13 Right to nominate | NOT yet implemented (see §9 outstanding items) |
| §14-17 Data Protection Board | Breach reporting procedure is the operator's responsibility |

**Verifiable parental consent for signup:** the current consent model governs
parent *viewing access*. Where the jurisdiction or the school's policy requires
verifiable guardian consent at account creation, enable it at the school/booking
layer before onboarding minors (documented in §9).

**Cross-border transfer (§16):** the LLM provider (if `gemini`/`openai` is
enabled) processes payload data outside India — restrict to the offline
provider, or sign the provider's DPA and rely on its India-resident processing
options where available. Assessment scores and identity data otherwise stay in
the operator's database.

**Grievance Officer (required to publish):**
`Name: ______ · Contact: ______ · Response within 72 hours` — fill before launch.

## 9. Data subject rights — outstanding (required before public launch)

- Self-service student export/deletion with identity verification (admin-mediated flows exist).
- Verifiable guardian-consent workflow at account creation where jurisdictionally required.
- §13 nomination workflow.
- LLM data-processing agreement / zero-retention configuration with the chosen provider.
- Privacy policy + terms pages generated from this document with legal review.

## 10. Jurisdiction note

Consent age thresholds, verifiable-guardian requirements, and data-residency rules differ by
jurisdiction (e.g. DPDP in India, GDPR in the EU, COPPA in the US). The deployment operator must
configure and review the consent flow accordingly before production use.
