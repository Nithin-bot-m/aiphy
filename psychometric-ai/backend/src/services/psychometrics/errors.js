// ScoringError: thrown by deterministic engines when scoring cannot be performed
// honestly (missing required data, malformed responses). MUST be surfaced to the
// caller as an explicit error — engines are forbidden from inventing fallback scores.
class ScoringError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'ScoringError';
    this.code = 'SCORING_ERROR';
    this.details = details;
  }
}

module.exports = { ScoringError };
