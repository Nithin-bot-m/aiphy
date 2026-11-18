// Domain constants & DEFAULT scoring configuration.
//
// IMPORTANT: these values are product defaults, NOT scientifically validated
// parameters. At runtime the deterministic engines read overrides from the
// `admin_settings` / `scoring_rules` tables; these constants are the fallback
// used when a key is absent (and the values used by unit tests for determinism).

const ROLES = { CANDIDATE: 'candidate', PARENT: 'parent', ADMIN: 'admin' };
const ROLE_VALUES = Object.values(ROLES);

const STREAM_KEYS = ['pcm', 'pcb', 'commerce_math', 'commerce_no_math', 'humanities_law', 'design', 'vocational'];

const STREAMS = {
  PCM: 'Science / PCM',
  PCB: 'Science / PCB',
  COMMERCE_MATH: 'Commerce with Mathematics',
  COMMERCE_NO_MATH: 'Commerce without Mathematics',
  HUMANITIES_LAW: 'Humanities / Law',
  DESIGN: 'Design / Creative Arts',
  VOCATIONAL: 'Vocational / Applied Tech'
};

const RIASEC_DIMENSIONS = ['R', 'I', 'A', 'S', 'E', 'C'];
const RIASEC_NAMES = {
  R: 'Realistic', I: 'Investigative', A: 'Artistic',
  S: 'Social', E: 'Enterprising', C: 'Conventional'
};

const APTITUDE_DIMENSIONS = ['numerical', 'abstract', 'verbal', 'spatial', 'logical', 'data'];

const GRIT_DIMENSIONS = [
  'persistence', 'focus', 'conscientiousness', 'curiosity',
  'stress_resilience', 'deliberate_practice', 'response_to_failure'
];

const PARENT_PERCEPTION_DIMENSIONS = [
  'observed_analytical', 'observed_creative', 'observed_study_habits', 'observed_stress_resilience'
];

const BOARDS = ['CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge (IGCSE)'];

// ---- Default scoring configuration (overridable via admin_settings) ----
const DEFAULT_SCORING_CONFIG = {
  // Difficulty weights for aptitude items. Product heuristic, not validated.
  difficulty_weights: { easy: 1.0, medium: 1.5, hard: 2.0 },

  // Fit bands are PRODUCT interpretation bands, not clinical categories.
  fit_bands: [
    { min: 75, max: 100, label: 'Strong Fit' },
    { min: 55, max: 74.999, label: 'Possible Fit' },
    { min: 0, max: 54.999, label: 'Explore Further' }
  ],

  // Congruence: blend of stream-match score and perception-gap score.
  congruence: {
    stream_match_weight: 0.6,
    perception_gap_weight: 0.4,
    // Rank ladder for parent's expected stream position in the student's ranking.
    stream_match_rank_scores: { 1: 100, 2: 80, 3: 65 },
    same_family_bonus: 70,     // both streams belong to the same stream family
    cross_family_score: 30,    // different families, no overlap
    no_match_score: 25,        // expected stream unknown to ranking
    // Perception-gap tuning: gap (0-100) scaled & floored to keep bands meaningful.
    gap_scale: 0.8,
    gap_floor: 20,
    friction_gap_threshold: 25,
    bands: [
      { min: 85, max: 100, label: 'High Alignment' },
      { min: 50, max: 84, label: 'Moderate Alignment' },
      { min: 0, max: 49, label: 'High Friction' }
    ]
  },

  // RIASEC Holland-code tie-break order (fixed, deterministic, documented).
  // When two dimensions share an identical score, the dimension appearing
  // earlier in this list ranks higher. Order follows the hexagon model
  // (R-I-A-S-E-C) so ties resolve consistently for every assessment version.
  riasec_tie_break_order: ['R', 'I', 'A', 'S', 'E', 'C'],

  // Stream fit tie-break: alphabetical by stream_id (fully deterministic).
  stream_tie_break: 'alphabetical'
};

// Stream families used by the congruence engine for "same field" detection.
const STREAM_FAMILIES = {
  pcm: ['pcm', 'pcb'],            // Science family
  pcb: ['pcm', 'pcb'],
  commerce_math: ['commerce_math', 'commerce_no_math'],
  commerce_no_math: ['commerce_math', 'commerce_no_math'],
  humanities_law: ['humanities_law', 'design'],
  design: ['humanities_law', 'design'],
  vocational: ['vocational']
};

module.exports = {
  ROLES, ROLE_VALUES, STREAM_KEYS, STREAMS,
  RIASEC_DIMENSIONS, RIASEC_NAMES, APTITUDE_DIMENSIONS,
  GRIT_DIMENSIONS, PARENT_PERCEPTION_DIMENSIONS, BOARDS,
  DEFAULT_SCORING_CONFIG, STREAM_FAMILIES
};
