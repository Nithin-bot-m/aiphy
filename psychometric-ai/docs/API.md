# API Documentation (v2)

Base URL: `/api` · Auth: `Authorization: Bearer <JWT>` unless marked **public**.

## Response envelope (single contract)

Every `/api` response — success or failure — uses the same envelope:

```json
// 2xx
{ "success": true, "data": { ...controller payload as documented below... } }

// 4xx / 5xx
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Endpoint not found." } }
```

Error codes: `BAD_REQUEST` (400) · `UNAUTHORIZED` (401) · `FORBIDDEN` (403) ·
`NOT_FOUND` (404) · `CONFLICT` (409) · `ASSESSMENT_INCOMPLETE` (422) ·
`RATE_LIMITED` (429) · `INTERNAL` (500) · `OTP_UNAVAILABLE` (501, production
without an OTP delivery provider). Error bodies never contain stack traces,
SQL, driver messages, or environment values.

## Auth

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/auth/register` | `{role:'candidate'\|'parent', email?, phone?, password, full_name, board?, school_name?, grade?, relationship?}` | **public**; rate-limited; admin role rejected; returns `{token, user, profile}` (candidate profile includes `student_code`) |
| POST | `/auth/login` | `{identifier, password}` | **public**; identifier = email or phone |
| POST | `/auth/send-otp` | `{phone}` | **public**; existing accounts only; 501 in production until SMS/email provider configured |
| POST | `/auth/verify-otp` | `{phone, otp}` | **public**; existing accounts only; 5 attempts → 15-min lockout |
| POST | `/auth/logout` | — | audits event; client discards token |
| GET | `/auth/me` | — | `{user, profile}`; candidate profile includes `pending_parent_requests` |

## Candidate

| Method | Path | Notes |
|---|---|---|
| GET | `/candidate/profile` | own profile + `parent_links` |
| PUT | `/candidate/profile` | `{full_name?, dob?, grade?, school_name?, board?}` |
| GET | `/candidate/code` | own student code (share with a parent) |
| GET | `/candidate/parent-requests` | pending parent link requests |
| POST | `/candidate/parent-requests/:mappingId/approve` | grants parental access |
| POST | `/candidate/parent-requests/:mappingId/revoke` | revokes access |
| GET | `/candidate/results` | latest completed assessment → canonical result |
| GET | `/candidate/results` | latest completed assessment → canonical result |

## Assessment (spec §24)

| Method | Path | Notes |
|---|---|---|
| GET | `/assessments` | own assessment list |
| POST | `/assessments/:id/start` | resume-or-create semantics (alias `POST /candidate/assessment/start`) |
| GET | `/assessments/:id` | questions for the pinned version — options carry NO score values; includes saved responses |
| POST | `/assessments/:id/responses` | `{question_id, selected_option_id, current_step?}` — server derives score from the option; ownership + version membership enforced |
| POST | `/assessments/:id/complete` | completeness gate (422 if any active item unanswered) → deterministic scoring → reports |
| GET | `/assessments/:id/progress` | `{answered, total, percent}` |

## Results

| Method | Path | Notes |
|---|---|---|
| GET | `/results/:assessmentId` | canonical result JSON (schema `psychometric-result/1.0`) |
| GET | `/results/:assessmentId/streams` | all 7 streams + contribution breakdown |
| GET | `/results/:assessmentId/congruence` | `has_parent_data` explicit; null congruence when absent |

## Reports

| Method | Path | Notes |
|---|---|---|
| GET | `/reports/:assessmentId/:type` | `type ∈ candidate\|parent\|counselor`; access by role (candidate→own candidate; linked parent→candidate+parent; admin→all) |
| GET | `/reports/:assessmentId` | defaults to `candidate` |
| POST | `/reports/:assessmentId/regenerate/:type` | re-synthesis; appends `report_versions` row |
| GET | `/report-versions/:assessmentId` | admin: version history |

Report payload: `{id, assessment_id, report_type, title, status, model, generated_at,
structured_input_hash (sha256), structured_data, narrative_html}`.

## Parent

| Method | Path | Body / Query | Notes |
|---|---|---|---|
| GET | `/parent/children` | — | linked + pending children with assessment status |
| POST | `/parent/link-request` | `{student_code}` | creates `pending_student_approval` mapping (alias `/parent/link-student`) |
| POST | `/parent/inventory/submit` | `{assessment_id, expected_stream, outcome_priority, perceptions{4×1-5}, comments?}` | **requires linked+approved child**; all 4 perception integers required (no defaults); recomputes congruence; refreshes parent+counselor reports |
| POST | `/parent/expectations` · `/parent/perceptions` | same as above | aliases |
| GET | `/parent/child` | `?assessment_id=` | child dashboard: top streams, congruence, own expectations/perceptions |
| GET | `/parent/congruence/:assessmentId` | — | same dashboard payload |

Valid `expected_stream` values: `pcm, pcb, commerce_math, commerce_no_math, humanities_law, design, vocational`.
Valid `outcome_priority`: `stability, prestige, fulfillment, entrepreneurship, balanced, exploration`.

## Admin (all require `admin` role)

| Method | Path | Notes |
|---|---|---|
| GET | `/admin/dashboard` | summary KPIs, stream/RIASEC/alignment distributions, avg scores, question analytics, assessment versions |
| GET | `/admin/candidates` | candidate roster with latest results |
| GET | `/admin/questions?module=&difficulty=&version_id=` | full question bank |
| POST | `/admin/questions` | `{module, question_text, question_type, dimension, difficulty?, options[2-8]}` — added to ACTIVE version |
| PUT | `/admin/questions/:id` | partial update; questions used by completed assessments are LOCKED (create new version instead) |
| DELETE | `/admin/questions/:id` | soft toggle (never hard delete) |
| GET | `/admin/scoring-rules` | versioned stream weight profiles |
| PUT | `/admin/scoring-rules/:streamId` | `{weights (sum≈1.00), version_id?}` |
| GET/PUT | `/admin/scoring-config` | read / patch global scoring config (`{path, value}` dot-notation) |
| GET | `/admin/prompts` · `/admin/prompts/:id` | list / detail |
| PUT | `/admin/prompts/:id` | creates a NEW prompt version (history never rewritten) |
| GET | `/admin/audit-logs?limit=&offset=&action=` | paginated audit trail |
| GET | `/admin/export/:type` | `candidates` \| `audit` JSON export |

## Canonical result JSON (shape)

```json
{
  "schema": "psychometric-result/1.0",
  "assessment": { "id": 1, "version_code": "V1", "status": "completed", "...": "..." },
  "student": { "id": 1, "first_name": "Aarav", "grade": 10, "board": "CBSE" },
  "completeness": { "aptitude": {"items_answered": 12, "items_expected": 12, "complete": true}, "...": "..." },
  "aptitude": { "numerical": 82, "abstract": 76, "verbal": 70, "spatial": 80, "logical": 84, "data": 73,
                "overall": 78, "scale": "normalized_index_0_100" },
  "riasec": { "R": 65, "I": 86, "A": 58, "S": 62, "E": 70, "C": 75,
              "holland_code": "ICE", "scale": "normalized_index_0_100",
              "tie_break_applied": false, "ranking": [] },
  "grit": { "persistence": 4.1, "focus": 3.8, "conscientiousness": 4.0, "curiosity": 4.4,
            "stress_resilience": 3.6, "deliberate_practice": 4.0, "response_to_failure": 3.9,
            "composite": 3.97, "normalized_index": 79, "scale": "raw_1_5_and_normalized_index_0_100" },
  "streams": [ { "id": "pcm", "name": "Science / PCM", "score": 79.4, "band": "Strong Fit", "rank": 1,
                 "contributions": [{ "component": "numerical", "weight": 0.35, "value": 82, "contribution": 28.7 }],
                 "career_clusters": [], "curriculum_boards": {} } ],
  "recommendations": [ { "stream_id": "pcm", "stream_name": "Science / PCM", "fit_band": "Strong Fit", "fit_score": 79.4 } ],
  "parent": { "expected_stream": "pcm", "outcome_priority": "stability", "perceptions": {}, "data_status": "available" },
  "congruence": { "score": 72, "band": "Moderate Alignment", "stream_match_score": 80,
                  "perception_gap_score": 61, "friction_factors": [], "discussion_areas": [] },
  "limitations": ["..."]
}
```

`null` always means "not measured / not available" — no field is ever fabricated.
