// CAT / IRT LAB MODULE — NOT part of the production scoring pipeline.
//
// Production assessments use FixedAssessmentStrategy (see assessmentStrategy.js).
// The functions below are mathematically correct building blocks (3PL response
// probability, Fisher information) kept for the future adaptive-testing roadmap
// (docs: PSYCHOMETRIC_LIMITATIONS.md → "Future CAT/IRT roadmap").
//
// REMOVED from the audited version: `updateAbilityEstimate` — the previous
// ad-hoc step function was labelled "MLE/EAP" but was neither. A real ability
// estimator (MLE with fisher-information stepping or EAP with a normal prior)
// will be introduced WITH the adaptive strategy, alongside validation data.
// Nothing in this module is invoked by scoring or API code paths.

function calculateItemProbability(theta, a = 1.0, b = 0.0, c = 0.25) {
  return c + (1 - c) / (1 + Math.exp(-a * (theta - b)));
}

function calculateItemInformation(theta, a = 1.0, b = 0.0, c = 0.25) {
  const p = calculateItemProbability(theta, a, b, c);
  if (p <= 0 || p >= 1) return 0;
  const numerator = a * a * (p - c) * (p - c);
  const denominator = (1 - c) * (1 - c) * p * (1 - p);
  return denominator > 0 ? numerator / denominator : 0;
}

module.exports = { calculateItemProbability, calculateItemInformation };
