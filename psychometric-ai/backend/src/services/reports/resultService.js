// resultService — builds THE canonical structured result object (spec §15).
//
// This object is:
//   1. The single source of truth persisted alongside the assessment.
//   2. The ONLY psychometric data ever handed to the LLM.
//   3. Hashed (sha256) into reports for reproducibility.
//
// Construction is deterministic: same responses + same config version ⇒ same JSON.

function buildCanonicalResult({ assessment, version, student, scores, streamResults, parentContext }) {
  const { aptitude, riasec, grit } = scores;

  const aptitudeOut = {};
  for (const [dim, d] of Object.entries(aptitude.dimensions)) {
    aptitudeOut[dim] = d.index; // null when unmeasured — never fabricated
  }
  aptitudeOut.overall = aptitude.overall_index;
  aptitudeOut.scale = 'normalized_index_0_100';

  const riasecOut = {
    R: riasec.r_score, I: riasec.i_score, A: riasec.a_score,
    S: riasec.s_score, E: riasec.e_score, C: riasec.c_score,
    holland_code: riasec.holland_code,
    scale: 'normalized_index_0_100',
    tie_break_applied: !!riasec.tie_break_applied,
    ranking: riasec.ranking
  };

  const gritOut = {
    persistence: grit.persistence,
    focus: grit.focus,
    conscientiousness: grit.conscientiousness,
    curiosity: grit.curiosity,
    stress_resilience: grit.stress_resilience,
    deliberate_practice: grit.deliberate_practice,
    response_to_failure: grit.response_to_failure,
    composite: grit.composite_score,
    normalized_index: grit.normalized_index,
    scale: 'raw_1_5_and_normalized_index_0_100'
  };

  const streams = streamResults.map(s => ({
    id: s.stream_id,
    name: s.stream_name,
    score: s.fit_score,
    band: s.fit_band,
    rank: s.rank_order,
    contributions: s.contributions,
    career_clusters: s.career_clusters,
    curriculum_boards: s.curriculum_boards
  }));

  const congruence = parentContext?.congruence || null;

  return {
    schema: 'psychometric-result/1.0',
    assessment: {
      id: assessment.id,
      version_code: version.version_code,
      version_name: version.name,
      status: assessment.status,
      started_at: assessment.started_at,
      completed_at: assessment.completed_at,
      scoring_config: 'admin_settings:scoring_config@current'
    },
    student: {
      id: student.id,
      first_name: (student.full_name || '').split(' ')[0] || 'Student', // minimal PII for LLM context
      grade: student.grade,
      board: student.board,
      // full name & school are NOT included: LLM receives minimum necessary data
    },
    completeness: {
      aptitude: { items_answered: aptitude.items_answered, items_expected: aptitude.items_expected, complete: !!aptitude.all_dimensions_measured },
      riasec: { items_answered: riasec.items_answered, items_expected: riasec.items_expected, complete: !!riasec.all_dimensions_measured },
      grit: { items_answered: grit.items_answered, items_expected: grit.items_expected, complete: !!grit.all_dimensions_measured }
    },
    aptitude: aptitudeOut,
    riasec: riasecOut,
    grit: gritOut,
    streams,
    recommendations: streams.slice(0, 3).map(s => ({
      stream_id: s.id,
      stream_name: s.name,
      fit_band: s.band,
      fit_score: s.score
    })),
    parent: parentContext ? {
      expected_stream: parentContext.expectations?.expected_stream ?? null,
      expected_stream_name: parentContext.expectations?.expected_stream_name ?? null,
      secondary_stream: parentContext.expectations?.secondary_stream ?? null,
      outcome_priority: parentContext.expectations?.outcome_priority ?? null,
      perceptions: parentContext.perceptions ?? null,
      data_status: congruence?.has_parent_data ? 'available' : 'not_available'
    } : { data_status: 'not_available' },
    congruence: congruence ? {
      score: congruence.congruence_pct,
      band: congruence.alignment_status,
      stream_match_score: congruence.stream_match_score,
      perception_gap_score: congruence.perception_gap_score,
      friction_factors: congruence.friction_factors,
      discussion_areas: congruence.discussion_areas
    } : null,
    limitations: [
      'Scores are normalized indices (0-100), not normative percentiles.',
      'Fit bands are product interpretation bands, not validated diagnostic categories.',
      'This is an educational guidance tool and does not assess mental health or personality pathology.'
    ]
  };
}

module.exports = { buildCanonicalResult };
