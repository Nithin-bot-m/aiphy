# PSYCHOMETRIC_METHODS.md — Psychometric AI v2.0.0

This document specifies **exactly** how every number in the system is produced, so that any
engine output can be re-derived by hand. All formulas were verified in this audit with
hand-calculated vectors (`scripts/final-verify-engines.js`, 134/134 checks).

**Status statement:** these are transparent, deterministic scoring rules for an educational
guidance tool. The instrument is **not** validated (no reliability/validity study), there is
**no normative population**, and every 0–100 output is a **normalized index, not a percentile**.
See `docs/PSYCHOMETRIC_LIMITATIONS.md`.

---

## 1. Response capture (input integrity)

- All items live in the versioned `questions`/`question_options` tables; batteries are pinned
  to an `assessment_version` (V1 today). Results store the version they were produced with.
- The client submits `{question_id, selected_option_id}` only. The server derives the score
  from the option row; `score_value` never reaches the client.
- A question must belong to the assessment's active version (`400` otherwise). One stored
  response per (assessment, question, respondent) — re-answering upserts.
- Completion requires **every active student item answered** (44/44): otherwise HTTP 422
  `ASSESSMENT_INCOMPLETE`. Missing data is never auto-scored; unmeasured components propagate
  as explicit `null`.

## 2. Aptitude engine (`aptitudeEngine.js`)

Six dimensions: `numerical, abstract, verbal, spatial, logical, data`.

```
per dimension:  index = round( Σ(is_correct × difficulty_weight) / Σ(difficulty_weight) × 100 )
overall_index  = round( mean(index of MEASURED dimensions) )        # unmeasured excluded, not zero
```

- `difficulty_weight` comes from the DB scoring config (default easy **1.0**, medium **1.5**,
  hard **2.0** — product heuristics, configurable by admins, not validated parameters).
- A dimension with zero answered items → `index = null, measured = false` (never a mid-scale 50).
- Zero measured dimensions overall → `ScoringError` (no fabricated result).

**Verified vectors** (from the audit):
- all correct (easy) → every dim 100, overall 100; all wrong → 0.
- mixed: numerical {E✓,M✗,H✓} → (1+0+2)/(1+1.5+2)=3/4.5 → **67**; abstract {M✓} → 100;
  verbal {H✗} → 0; spatial {E✗,E✓} → 50; logical/data unanswered → **null**;
  overall = round((67+100+0+50)/4) = **54**.
- weight effect: {E✗,H✓} → (0·1+1·2)/3 = 2/3 → **67**.

## 3. RIASEC engine (`riasecEngine.js`)

Holland model, six dimensions R/I/A/S/E/C, Likert 1–5.

```
per dimension:  mean  = mean(answers)             # null/invalid answers SKIPPED, not zero
                index = round(mean / 5 × 100)
holland_code    = first 3 dimensions of the deterministic ranking
ranking order   = index DESC, then tie-break order R > I > A > S > E > C  (hexagon, configured)
```

- Ties are **never random**: identical indices resolve by the configured hexagon order
  (`riasec_tie_break_order` in admin_settings); `tie_break_applied` is reported when a tie exists.
- Unmeasured dimensions → `index = null`; they rank below measured ones (deterministically,
  by hexagon order among themselves). The completeness gate normally prevents this case.
- Zero valid answers → `ScoringError`.

**Verified vectors**: single-dimension max ranks top for each of R/I/A/S/E/C;
mixed {R:[4,2],I:[5,5,4],A:[1],S:[3,4],E:[4,4],C:[2,3]} → R60 I93 A20 S70 E80 C50, code **IES**;
full tie → **RIA** (hexagon), tie_break_applied=true; partial tie E=C=70 → **IEC** with the
40-level tie resolving R before A before S.

## 4. Grit / work-style engine (`gritEngine.js`)

Seven dimensions: `persistence, focus, conscientiousness, curiosity, stress_resilience,
deliberate_practice, response_to_failure`. Likert 1–5, **no reverse-scored items** (verified
by monotonicity test: raising all answers raises the composite).

```
per dimension:  score = mean(answers), rounded to 2dp        # null if unmeasured
composite       = mean(score of MEASURED dimensions), 2dp    # unmeasured excluded
normalized_index= round(composite / 5 × 100)                 # 0–100 index, NOT a percentile
```

**Verified vectors**: all-1 → composite 1.00, index 20; all-5 → 5.00/100;
mixed (13 items as listed in the script) → composite **3.36** (= 23.5/7), index **67**;
partial (2 of 7 answered: 5,3) → composite 4.00, curiosity **null**, `all_dimensions_measured=false`.

## 5. Stream fit engine (`streamEngine.js`)

Seven streams: `pcm, pcb, commerce_math, commerce_no_math, humanities_law, design, vocational`.

```
fit_score = Σ(weight × component_index) / Σ(weight)          # over the stream's components
band      = fit_score ≥ 75 → Strong Fit | 55–74.999 → Possible Fit | else Explore Further
rank      = fit_score DESC, then stream_id ASC (alphabetical) — fully deterministic
```

- Component keys map to aptitude dimension indices, `riasec_<x>` indices, `grit` normalized
  index, or `aptitude_total` (overall index). All are 0–100, so the fit score is 0–100.
- **Weights sum to 1.0** per stream (verified for all 7 defaults); they are versioned in
  `scoring_rules` (admin-editable with a sum≠1 rejection at the API) and fall back to
  `DEFAULT_STREAM_WEIGHTS` only when a version has no active rule.
- **Every contribution is stored**: `{component, weight, value, contribution}` where
  `contribution = weight × value` — the UI can always answer "why this score?".
- A required component that is unmeasured (null) → `ScoringError`: the engine **never**
  substitutes a default such as 50.
- Weights from the DB override defaults; inactive rules are ignored (both verified).

**Verified vector** (hand-computed for all 7 streams with aptitude N82/A76/V70/Sp80/L84/D73,
overall 78; RIASEC R65/I86/A58/S62/E70/C75; grit index 79.6):

| Stream | Formula | Score | Band |
|---|---|---|---|
| pcm | .35·82 + .25·76 + .25·86 + .15·65 | **79.0** | Strong Fit |
| pcb | .20·82 + .20·76 + .35·86 + .15·62 + .10·79.6 | **79.0** | Strong Fit |
| commerce_math | .30·82 + .30·70 + .20·75 + .20·79.6 | **76.5** | Strong Fit |
| commerce_no_math | .35·70 + .30·75 + .20·62 + .15·79.6 | **71.3** | Possible Fit |
| humanities_law | .35·70 + .25·62 + .25·58 + .15·70 | **65.0** | Possible Fit |
| design | .35·80 + .35·58 + .15·76 + .15·86 | **72.6** | Possible Fit |
| vocational | .40·65 + .30·75 + .30·78 | **71.9** | Possible Fit |

Recommendations = top 3 ranked streams only; all 7 are always shown with their contributions.

## 6. Parent inventory & congruence engine (`congruenceEngine.js`)

Parents do **not** take the student battery. They submit: expected stream, secondary stream,
outcome priority, and four perception ratings (1–5: analytical, creative, study habits, stress
resilience) — stored as "parent perception", materialized into
`parent_expectations`/`parent_perceptions`.

```
if no parent expectations      → has_parent_data=false, ALL scores null (explicit state)
stream_match    = rank of parent's expected stream in the student's ranking:
                  rank1→100, rank2→80, rank3→65 (config ladder);
                  same stream-family (e.g. pcm/pcb) → 70; different family → 30;
                  stream absent → 25          # all values are configured, not invented
perception_gap  = mean over dimensions where BOTH sides exist of |parent−student| (0–100 each),
                  then 100 − meanGap × 0.8, clamped to [20, 100]; null if no comparable pair
congruence_pct  = round(0.6 × stream_match + 0.4 × perception_gap)      # perception null → stream match only
band            = ≥85 High Alignment | 50–84 Moderate Alignment | ≤49 High Friction
```

- **Friction factors are symmetric and neutral** (fixed in this audit): both "rated higher at
  home" and "rated lower at home" produce factual, non-judgmental statements; the engine never
  takes a side. A loaded-language assertion (must/destined/guarantee/blame/fault/…) runs in
  every verification pass.
- The five required cases were verified with hand math:
  agree → 100/High; disagree (cross-family + 60-pt gaps) → 39/High Friction; rank-2 → 88/High;
  parent missing → explicit null state; student data missing → 25 (documented stream-only basis).

## 7. LLM explanation layer (not a scorer)

- The LLM (or the offline template engine) receives ONLY: the DB-versioned system prompt +
  canonical structured JSON (`psychometric-result/1.0`). It receives no scores-modifying power,
  no database, no other users' data, minimal PII (first name, grade, board).
- System prompt rules: never invent/modify scores, ranks, percentiles or bands; render nulls as
  "not available"; guidance-only language; no diagnoses or guarantees.
- Output is validated (structure) and sanitized (HTML tag allowlist) before storage; the client
  applies a second-pass sanitizer.
- Provider failure (timeout/5xx/invalid key/malformed/empty) → deterministic offline narrative
  built strictly from the supplied JSON; the report's `status` records `fallback`.

## 8. Reproducibility & versioning (verified)

- Same stored responses re-scored → **byte-identical** engine output (JSON snapshot equality).
- `reports.structured_input_hash` = sha256(canonical JSON at generation time); regenerating
  without input change keeps the hash identical; adding parent context changes it (by design —
  the hash tracks inputs, and `report_versions` keeps every generation).
- V1 responses remain reproducible after V2 exists (V1 question rows untouched; new assessments
  can be pinned to V2 without altering history; completed-assessment questions are locked
  against silent edits).

## 9. Explicit limitations (do not overclaim)

1. Scores are **normalized indices on a 0–100 scale** — never call them percentiles; a true
   percentile requires a normative reference population (roadmap item).
2. Difficulty weights, fit bands, congruence weights/ladders and tie-break orders are **product
   heuristics**, documented and admin-configurable — not scientifically validated parameters.
3. The battery is a fixed-form **screening-depth** instrument (44 student items): suitable for
   educational guidance conversations, not for clinical, diagnostic or selection use.
4. Grit/work-style items are self-report and measure study-habit tendencies in an educational
   context; no character or clinical judgement is implied.
5. Congruence compares self-report with parent perception — differing perspectives are
   expected data, not faults; the system intentionally never arbitrates "who is right".
6. CAT/IRT is a labelled future interface (`AssessmentStrategy` / `catIrtLab.js`) — nothing
   adaptive is implemented or advertised.
