// Parent-Student Congruence Engine — deterministic, neutral, config-driven.
//
// Returns a congruence index (0-100), alignment band, component scores and
// friction factors. The engine takes NO side: friction language is neutral.
//
// Missing parent data is an EXPLICIT STATE (has_parent_data=false, null scores)
// — this engine never fabricates a default alignment value.
const { STREAM_FAMILIES } = require('../../config/constants');
const { getScoringConfig } = require('../configService');

function sameFamily(streamIdA, streamIdB) {
  const famA = STREAM_FAMILIES[streamIdA] || [];
  return famA.includes(streamIdB);
}

function bandFor(value, bands) {
  return bands.find(b => value >= b.min && value <= b.max);
}

function calculateCongruence({ streamResults, parentExpectations, parentPerceptions, studentGrit }) {
  const config = getScoringConfig().congruence;

  // Explicit "no parent data" state — no fabricated 75.
  if (!parentExpectations || !parentExpectations.expected_stream) {
    return {
      has_parent_data: false,
      congruence_pct: null,
      alignment_status: null,
      stream_match_score: null,
      perception_gap_score: null,
      friction_factors: [],
      discussion_areas: []
    };
  }

  const expectedStreamId = String(parentExpectations.expected_stream).toLowerCase();
  const rankedStudent = (streamResults || []).filter(s => s && s.stream_id);
  const studentTop = rankedStudent[0] || null;

  // ---- 1. Stream match score (0-100) ----
  let streamMatchScore;
  const rankIndex = rankedStudent.findIndex(s => s.stream_id === expectedStreamId);
  if (rankIndex !== -1) {
    const ladder = config.stream_match_rank_scores;
    streamMatchScore = ladder[rankIndex + 1] ?? Math.max(40, 100 - rankIndex * 15);
  } else if (studentTop && sameFamily(studentTop.stream_id, expectedStreamId)) {
    streamMatchScore = config.same_family_bonus;
  } else if (studentTop) {
    streamMatchScore = config.cross_family_score;
  } else {
    streamMatchScore = config.no_match_score;
  }

  // ---- 2. Perception gap score (0-100) ----
  // Compares parent-observed ratings with the student's measured indicators.
  // Only dimensions with BOTH sides present contribute; nothing is defaulted.
  const perception = parentPerceptions || {};
  const gaps = [];

  if (perception.observed_analytical != null && studentGrit) {
    // Analytical proxy: composite of measured work-style + curiosity facets is
    // not available here, so we use the grit normalized index as the measured
    // counterpart of home-observed academic engagement.
    const parentSide = (perception.observed_analytical / 5) * 100;
    const studentSide = studentGrit.normalized_index;
    if (studentSide != null) gaps.push({ key: 'analytical', gap: Math.abs(parentSide - studentSide), parentHigher: parentSide > studentSide });
  }
  if (perception.observed_stress_resilience != null && studentGrit?.stress_resilience != null) {
    const parentSide = (perception.observed_stress_resilience / 5) * 100;
    const studentSide = (studentGrit.stress_resilience / 5) * 100;
    gaps.push({ key: 'stress_resilience', gap: Math.abs(parentSide - studentSide), parentHigher: parentSide > studentSide });
  }
  if (perception.observed_creative != null && studentGrit?.curiosity != null) {
    const parentSide = (perception.observed_creative / 5) * 100;
    const studentSide = (studentGrit.curiosity / 5) * 100;
    gaps.push({ key: 'creative', gap: Math.abs(parentSide - studentSide), parentHigher: parentSide > studentSide });
  }
  if (perception.observed_study_habits != null && studentGrit?.conscientiousness != null) {
    const parentSide = (perception.observed_study_habits / 5) * 100;
    const studentSide = (studentGrit.conscientiousness / 5) * 100;
    gaps.push({ key: 'study_habits', gap: Math.abs(parentSide - studentSide), parentHigher: parentSide > studentSide });
  }

  let perceptionGapScore = null;
  if (gaps.length > 0) {
    const avgGap = gaps.reduce((s, g) => s + g.gap, 0) / gaps.length;
    perceptionGapScore = Math.max(config.gap_floor, Math.min(100, Math.round(100 - avgGap * config.gap_scale)));
  }

  // ---- 3. Composite congruence ----
  // If perceptions are missing entirely, congruence rests on stream match only
  // (documented behaviour, not a fabricated value).
  let congruencePct;
  if (perceptionGapScore === null) {
    congruencePct = Math.round(streamMatchScore);
  } else {
    congruencePct = Math.round(streamMatchScore * config.stream_match_weight + perceptionGapScore * config.perception_gap_weight);
  }

  const band = bandFor(congruencePct, config.bands);
  const alignmentStatus = band ? band.label : 'Moderate Alignment';

  // ---- 4. Friction factors (neutral phrasing, no side-taking) ----
  const frictionFactors = [];
  const discussionAreas = [];

  if (streamMatchScore < 60 && studentTop) {
    frictionFactors.push({
      area: 'stream_direction',
      detail: `The student's measured profile aligns most closely with ${studentTop.stream_name}, while the expected stream is ${parentExpectations.expected_stream_name || expectedStreamId}.`
    });
    discussionAreas.push('Compare the day-to-day subjects of both streams before deciding.');
  }

  for (const g of gaps) {
    if (g.gap > config.friction_gap_threshold) {
      // Symmetric, neutral phrasing: a perception gap is flagged regardless of
      // which side rated higher — the engine never implies who is "right".
      const labels = {
        analytical: g.parentHigher
          ? 'Observed analytical engagement is rated higher at home than the assessment indicates.'
          : 'Observed analytical engagement is rated lower at home than the assessment indicates.',
        stress_resilience: g.parentHigher
          ? 'Parent-observed stress resilience is rated higher than the student self-reported.'
          : 'Parent-observed stress resilience is rated lower than the student self-reported.',
        creative: g.parentHigher
          ? 'Parent-observed creative engagement is rated higher than the student self-reported.'
          : 'Parent-observed creative engagement is rated lower than the student self-reported.',
        study_habits: g.parentHigher
          ? 'Parent-observed study discipline is rated higher than the student self-reported.'
          : 'Parent-observed study discipline is rated lower than the student self-reported.'
      };
      frictionFactors.push({ area: `perception_${g.key}`, detail: labels[g.key] });
      discussionAreas.push('Discuss where perceptions differ from the student\'s own experience and why.');
    }
  }

  return {
    has_parent_data: true,
    congruence_pct: congruencePct,
    alignment_status: alignmentStatus,
    stream_match_score: Math.round(streamMatchScore),
    perception_gap_score: perceptionGapScore,
    friction_factors: frictionFactors,
    discussion_areas: discussionAreas,
    student_top_stream: studentTop ? studentTop.stream_name : null,
    parent_expected_stream_id: expectedStreamId,
    parent_priority: parentExpectations.outcome_priority || null,
    components_used: {
      stream_match: true,
      perception_gap: perceptionGapScore !== null
    }
  };
}

module.exports = { calculateCongruence };
