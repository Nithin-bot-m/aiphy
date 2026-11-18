# Psychometric Limitations

**Read this before trusting any number this platform produces.**

## 1. Status of the instrument

This is an **educational guidance MVP**, not a validated psychometric instrument. Specifically:

- No normative reference population exists. Every score is a **normalized index on a 0-100
  scale** (e.g. mean-correct × 100, Likert mean scaled × 20). These are **not percentiles** and
  must never be described as such. A true percentile (e.g. "you scored higher than 83% of a
  representative sample") requires a norming study — none has been performed.
- No reliability studies (internal consistency, test-retest) have been run. Any statement about
  reliability would be fabricated — which is why the audited codebase's "Reliability Index" was
  removed.
- No validity evidence (criterion, construct, content) has been collected.
- Fit bands ("Strong Fit" ≥ 75, "Possible Fit" ≥ 55, "Explore Further" < 55) and congruence bands
  (85/50) are **product interpretation labels**, not clinically or psychometrically validated
  categories.
- Difficulty weights (easy 1.0 / medium 1.5 / hard 2.0), stream weight profiles, and congruence
  blend ratios (0.6/0.4, gap scale 0.8) are **product heuristics** — configurable and documented,
  not empirically derived.

## 2. Battery depth limitations (V1)

| Module | Items | Limitation |
|---|---|---|
| Aptitude | 12 (2 per dimension) | A 2-item "scale" has enormous measurement error; a single wrong answer swings a dimension from 100 to 50. Aptitude measurement normally needs 10+ items per dimension. |
| RIASEC | 18 (3 per dimension) | 3-item interest scales are screening-depth. Short scales inflate the chance of tied indices — hence the explicit tie-break, but ties also signal genuine low differentiation. |
| Work style | 14 (2 per dimension) | Self-report Likert items are transparent and therefore fakeable; 2 items cannot separate related traits (e.g. focus vs conscientiousness). |
| Parent inventory | 8 + 2 categorical | Parent perceptions are observations, not measurements; halo effects and aspiration bias are expected and are part of what the congruence view surfaces. |

Several work-style items are transparently reverse-flavoured honesty probes; **reverse scoring is
NOT applied** in the MVP (documented decision — applying it without validation would be
pseudo-precision). This means disagreeing with "A bad result makes me want to give up" does not
raise the response_to_failure score in V1.

## 3. Interpretation rules the product follows

1. Language of guidance only: "strong fit", "possible fit", "explore further", "areas to
   consider". Never "you must", "you are destined to", "guaranteed".
2. Missing data is shown as missing. A skipped item is never averaged, defaulted (no 50s/3.0s),
   or imputed; incomplete assessments cannot be scored at all.
3. All streams are returned — the system does not hide low-fit streams; exploration is encouraged.
4. Congruence analysis is neutral: differences between student and parent views are described,
   never adjudicated.
5. Reports state that the tool does not diagnose, predict, or replace a qualified counsellor.

## 4. Known technical caveats

- **Single-item swings:** with 2 aptitude items per dimension, dimension indices move in ~50-point
  steps per item (weighted). Treat dimension-level aptitude as indicative only.
- **Self-report bias:** RIASEC/work-style answers reflect self-perception at one point in time;
  adolescent interests are expected to fluctuate.
- **Response quality is unmonitored** in the MVP (the schema keeps `response_time_ms`; no
  careless-response screening is implemented).
- **Language/culture:** items are written for Indian Grade 10 students (CBSE/ICSE/IB context);
  career-cluster naming is illustrative, not exhaustive or regionally complete.
- **Fixed-form only:** every student sees the same items; no adaptive difficulty (see roadmap).

## 5. Future roadmap (explicitly NOT in the MVP)

1. **Norming study** — collect a reference sample; then (and only then) introduce
   `estimated_percentile` alongside normalized indices, with documented sample size/population.
2. **IRT calibration** — calibrate item difficulty/discrimination (fields `difficulty_b`,
   `discrimination_a`, `guessing_c` already exist per question but are unused by scoring).
3. **CAT** — implement `AdaptiveIRTStrategy` (item-information selection, MLE/EAP theta
   estimation with a real prior, standard-error stopping rule) behind the existing
   assessment-strategy interface. The previous codebase's ad-hoc step function labelled
   "MLE/EAP" was removed as fake.
4. **Reverse-scored items** with validated keying.
5. **Reliability monitoring** (Cronbach's alpha per dimension) once item counts support it.
6. **Longitudinal validity** — follow-up on stream choices/satisfaction to refine weights.
