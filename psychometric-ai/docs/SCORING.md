# Scoring Documentation

All numbers in this platform are produced by deterministic engines (`backend/src/services/psychometrics/`).
The same responses + the same scoring configuration **always** produce identical results — this is
verified by tests (`backend/tests/unit/`, `backend/tests/integration/assessment.test.js`).

**Terminology policy:** scores are *normalized indices* on a 0-100 scale. They are **not**
percentiles — a percentile requires a normative reference population, which this MVP does not
have. The word "percentile" is intentionally absent from scores, columns, APIs and UI.

---

## 1. Configuration source of truth

All constants live in `admin_settings.scoring_config` (seeded from
`backend/src/config/constants.js → DEFAULT_SCORING_CONFIG`) and are read by engines through
`configService.getScoringConfig()` (15s cache). Stream weights additionally live per version in
`scoring_rules`. Admin edits are audited; unit tests pin the defaults.

## 2. Aptitude engine

Inputs: responses `{dimension, difficulty, is_correct}`; expected per-dimension item counts.
- Per-dimension **weighted index** = Σ(is_correct × weight) / Σ(weight) × 100, with
  difficulty weights easy = 1.0, medium = 1.5, hard = 2.0 (product heuristic — configurable, NOT validated).
- **Overall index** = mean of measured dimension indices.
- Unmeasured dimension → `index: null`, `measured: false`, excluded from overall.
- No responses at all → `ScoringError` (never a silent 50).

## 3. RIASEC engine

Inputs: Likert 1-5 responses (invalid/empty values are ignored, never defaulted to 3).
- Dimension index = mean / 5 × 100.
- **Holland code** = top 3 dimensions by index.
- **Tie-break (explicit, deterministic):** on equal scores, the dimension earlier in the hexagon
  order **R > I > A > S > E > C** ranks higher. No randomness. `tie_break_applied` is reported
  in the canonical JSON whenever any two dimensions share an index.
- Unmeasured dimension → null; excluded from the code (a partial battery yields a partial code path
  flagged in the results).

## 4. Work style (grit) engine

- Dimension score = mean of Likert 1-5 answers (reported on the raw 1-5 scale).
- **Composite** = mean of measured dimension means.
- **normalized_index** = composite / 5 × 100. This is an index, NOT a percentile
  (the audited version computed `composite/5*100` and labelled it a percentile — fixed).

## 5. Stream engine

Seven streams: `pcm`, `pcb`, `commerce_math`, `commerce_no_math`, `humanities_law`, `design`,
`vocational`. Default weight profiles (seeded into `scoring_rules`, admin-editable, must sum to 1.00):

| Stream | Weights |
|---|---|
| PCM | numerical .35, abstract .25, riasec_i .25, riasec_r .15 |
| PCB | numerical .20, abstract .20, riasec_i .35, riasec_s .15, grit .10 |
| Commerce w/ Math | numerical .30, riasec_e .30, riasec_c .20, grit .20 |
| Commerce w/o Math | riasec_e .35, riasec_c .30, riasec_s .20, grit .15 |
| Humanities/Law | verbal .35, riasec_s .25, riasec_a .25, riasec_e .15 |
| Design | spatial .35, riasec_a .35, abstract .15, riasec_i .15 |
| Vocational | riasec_r .40, riasec_c .30, aptitude_total .30 |

- **fit_score** = Σ(weight × component) / Σ(weight). Components are 0-100 indices.
- **Fit bands (product interpretation labels, NOT validated categories):**
  - 75–100 → **Strong Fit**
  - 55–74.9 → **Possible Fit**
  - 0–54.9 → **Explore Further**
- **Explainability:** every stream stores per-component `{component, weight, value, contribution}`
  so the UI can answer "why this score?" (contribution example for PCM: numerical = 80 × 0.35 → 28.0).
- ALL seven streams are returned and shown; the top 3 are surfaced as `recommendations`.
- Ranking tie-break: fit_score DESC, then `stream_id` ASC (fully deterministic, tested).
- Missing required component → `ScoringError` (never a silent 50).

## 6. Congruence engine (parent ↔ student)

Inputs: student's ranked streams, parent's expected stream, parent perceptions (1-5),
student grit indicators.

1. **Stream match score (0-100):** parent's expected stream position in the student's ranking —
   rank 1 → 100, rank 2 → 80, rank 3 → 65, beyond rank 3 → max(40, 100 − 15×(rank−1)).
   If absent from ranking entirely: same stream family → 70, otherwise → 30.
   (Stream families: {pcm, pcb}, {commerce_math, commerce_no_math}, {humanities_law, design}, {vocational}.)
2. **Perception gap score (0-100):** |parent rating − measured counterpart| averaged over the
   dimensions where BOTH sides exist, scaled by 0.8 with a floor of 20. Counterparts:
   observed_analytical→grit normalized index; observed_stress_resilience→stress_resilience;
   observed_creative→curiosity; observed_study_habits→conscientiousness.
   Missing parent perception dimensions are excluded — never defaulted to 3.
3. **Congruence index** = stream_match × 0.6 + perception_gap × 0.4 (if perceptions are entirely
   missing, congruence = stream match only, and `components_used` discloses it).
4. **Bands:** 85–100 High Alignment · 50–84 Moderate Alignment · 0–49 High Friction
   (product-defined interpretation bands).
5. **Friction factors** use strictly neutral language ("There are differences between the
   student's measured profile and the parent's expectations…"). The engine never assigns blame
   and never recommends whose preference to follow.

**No parent data at all** → `has_parent_data: false` with `congruence_pct: null` — the audited
version fabricated a 75/"Moderate" default; that is forbidden now.

## 7. Reproducibility & versioning

- Assessments permanently reference `assessment_version` (V1) and were scored by the config
  snapshot recorded in `admin_settings` (bumps are audit-logged).
- Reports persist `structured_input_hash` = sha256(canonical JSON) + `prompt_version_id` +
  `model` + every generation in `report_versions`.
- Question rows used by completed assessments are locked: edits require deactivating the old row
  and creating a new one (soft versioning).
