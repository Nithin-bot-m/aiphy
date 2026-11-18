// Assessment strategy interface.
//
// The MVP ships FixedAssessmentStrategy: every active question of the version,
// in canonical module order. A future AdaptiveIRTStrategy will implement the
// same interface so CAT can replace fixed selection WITHOUT touching the API,
// controllers, or scoring engines (dependency inversion point).

class FixedAssessmentStrategy {
  constructor(questionRepository) {
    this.questionRepository = questionRepository;
  }

  /**
   * @param {number} versionId
   * @param {Object} opts { modules: string[] }
   * @returns {Array} ordered question rows
   */
  selectQuestions(versionId, opts = {}) {
    return this.questionRepository.getActiveQuestionsForVersion(versionId, opts);
  }

  get strategyName() { return 'fixed_v1'; }
}

module.exports = { FixedAssessmentStrategy };
