// Candidate Assessment Runner & Results — v2 (canonical result JSON).
// All dynamic text passes through esc(); scores come from the deterministic
// engine and are displayed as normalized indices (never "percentiles").

const CandidateView = {
  assessment: null,
  questions: [],
  currentIndex: 0,
  responses: {},
  timerInterval: null,
  startTime: null,

  async init() {
    const container = document.getElementById('view-candidate');
    if (!container) return;

    try {
      const res = await window.api.getCandidateResults().catch(() => null);
      if (res && res.result) {
        this.renderResults(res.result, res.assessment_id);
      } else {
        this.renderWelcome();
      }
    } catch (e) {
      this.renderWelcome();
    }
  },

  renderWelcome() {
    const container = document.getElementById('view-candidate');
    container.innerHTML = `
      <div class="glass-card" style="max-width: 720px; margin: 40px auto; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px;">🎯</div>
        <h2 style="font-size: 2rem; margin-bottom: 12px;">Grade 10 Guidance Assessment</h2>
        <p style="color: var(--text-secondary); margin-bottom: 24px; font-size: 1.05rem;">
          This assessment measures your reasoning skills, interests (RIASEC), and work style to suggest
          Grade 11 streams you might explore. It is educational guidance — not a psychological evaluation,
          and it does not decide your future.
        </p>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 32px; text-align: left;">
          <div style="background: var(--bg-tertiary); padding: 16px; border-radius: var(--radius-md);">
            <strong style="color: var(--secondary); display: block; margin-bottom: 4px;">Part 1: Aptitude</strong>
            <span style="font-size: 0.85rem; color: var(--text-secondary);">Numerical, Abstract, Verbal, Spatial, Logical &amp; Data reasoning</span>
          </div>
          <div style="background: var(--bg-tertiary); padding: 16px; border-radius: var(--radius-md);">
            <strong style="color: var(--primary-light); display: block; margin-bottom: 4px;">Part 2: Interests</strong>
            <span style="font-size: 0.85rem; color: var(--text-secondary);">RIASEC — Realistic, Investigative, Artistic, Social, Enterprising, Conventional</span>
          </div>
          <div style="background: var(--bg-tertiary); padding: 16px; border-radius: var(--radius-md);">
            <strong style="color: var(--success); display: block; margin-bottom: 4px;">Part 3: Work Style</strong>
            <span style="font-size: 0.85rem; color: var(--text-secondary);">Persistence, focus, curiosity &amp; stress resilience</span>
          </div>
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 16px;">
          Your answers save automatically — you can leave and resume any time.
        </p>
        <button class="btn btn-primary btn-lg" data-act="CandidateView:startTest">Begin Assessment</button>
      </div>
    `;
  },

  async startTest() {
    try {
      window.showToast('Preparing your session...', 'info');
      const startRes = await window.api.startAssessment();
      this.assessment = startRes.assessment;

      const qRes = await window.api.getAssessmentQuestions(this.assessment.id);
      this.questions = qRes.questions;
      this.responses = qRes.responses || {};
      this.currentIndex = 0;
      this.renderQuestionRunner();
      this.startTimer();
      this.attachKeyboardEvents();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  startTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.startTime = Date.now();
    this.timerInterval = setInterval(() => {
      const el = document.getElementById('test-timer-display');
      if (!el) return;
      const elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
      const mins = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
      const secs = (elapsedSec % 60).toString().padStart(2, '0');
      el.textContent = `${mins}:${secs}`;
    }, 1000);
  },

  attachKeyboardEvents() {
    window.onkeydown = (e) => {
      if (!document.getElementById('test-question-card')) return;
      const currentQ = this.questions[this.currentIndex];
      if (!currentQ) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= currentQ.options.length) {
        this.selectOption(currentQ.options[num - 1].id);
      } else if (e.key === 'ArrowRight') {
        this.nextQuestion();
      } else if (e.key === 'ArrowLeft') {
        this.prevQuestion();
      }
    };
  },

  renderQuestionRunner() {
    const container = document.getElementById('view-candidate');
    const q = this.questions[this.currentIndex];
    if (!q) return;

    const answered = Object.keys(this.responses).length;
    const progressPct = Math.round((answered / this.questions.length) * 100);
    const existingResp = this.responses[q.id];

    container.innerHTML = `
      <div class="assessment-container" id="test-question-card">
        <div class="assessment-header-bar">
          <div class="assessment-meta">
            <span class="module-pill">${esc(q.module.toUpperCase())}</span>
            <span class="question-counter">Question ${this.currentIndex + 1} of ${this.questions.length}</span>
          </div>
          <div class="assessment-timer" id="test-timer-display">00:00</div>
        </div>

        <div class="progress-bar-wrap" role="progressbar" aria-valuenow="${progressPct}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-bar-fill" style="width: ${progressPct}%;"></div>
        </div>

        <div class="question-card">
          <div class="question-category">${esc(q.category)}${q.difficulty ? ` • ${esc(q.difficulty)}` : ''}</div>
          <h2 class="question-text">${esc(q.question_text)}</h2>

          <div class="options-list">
            ${q.options.map((opt, idx) => {
              const isSelected = existingResp && existingResp.selected_option_id === opt.id;
              return `
                <div class="option-card ${isSelected ? 'selected' : ''}" role="button" tabindex="0"
                     data-act="CandidateView:selectOption" data-args='[${Number(opt.id)}]'
                     onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();CandidateView.selectOption(${Number(opt.id)});}">
                  <div class="option-key-badge">${idx + 1}</div>
                  <div class="option-text-content">${esc(opt.option_text)}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="assessment-nav">
          <button class="btn btn-secondary" data-act="CandidateView:prevQuestion" ${this.currentIndex === 0 ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
            ← Previous
          </button>
          <div style="font-size: 0.85rem; color: var(--text-muted);">${answered} of ${this.questions.length} answered</div>
          ${this.currentIndex === this.questions.length - 1 ? `
            <button class="btn btn-primary" data-act="CandidateView:submitAssessment">Complete &amp; See Results</button>
          ` : `
            <button class="btn btn-primary" data-act="CandidateView:nextQuestion">Next →</button>
          `}
        </div>
      </div>
    `;
  },

  async selectOption(optionId) {
    const q = this.questions[this.currentIndex];
    this.responses[q.id] = { selected_option_id: optionId };

    const cards = document.querySelectorAll('.option-card');
    cards.forEach((card, idx) => {
      if (q.options[idx] && q.options[idx].id === optionId) card.classList.add('selected');
      else card.classList.remove('selected');
    });

    // The server derives the score from the option — the client never sends values.
    try {
      await window.api.saveResponse(this.assessment.id, {
        question_id: q.id,
        selected_option_id: optionId,
        current_step: this.currentIndex + 1
      });
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  nextQuestion() {
    if (this.currentIndex < this.questions.length - 1) {
      this.currentIndex++;
      this.renderQuestionRunner();
    }
  },

  prevQuestion() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.renderQuestionRunner();
    }
  },

  async submitAssessment() {
    if (this.timerInterval) clearInterval(this.timerInterval);

    const container = document.getElementById('view-candidate');
    container.innerHTML = `
      <div class="glass-card" style="max-width: 600px; margin: 60px auto; text-align: center; padding: 48px;">
        <div class="loading-spinner" style="font-size: 40px; margin-bottom: 20px;">⚙️</div>
        <h3 style="font-size: 1.5rem; margin-bottom: 12px;">Calculating your results...</h3>
        <p style="color: var(--text-secondary);">Your scores are computed deterministically, then your guidance report is prepared.</p>
      </div>
    `;

    try {
      await window.api.completeAssessment(this.assessment.id);
      window.showToast('Assessment completed!', 'success');
      const results = await window.api.getCandidateResults();
      this.renderResults(results.result, results.assessment_id);
    } catch (err) {
      window.showToast(err.message, 'error');
      this.renderQuestionRunner();
    }
  },

  bandClass(band) {
    if (band === 'Strong Fit') return 'fit-strong';
    if (band === 'Possible Fit') return 'fit-possible';
    return 'fit-explore';
  },

  renderResults(result, assessmentId) {
    const container = document.getElementById('view-candidate');
    const apt = result.aptitude || {};
    const ria = result.riasec || {};
    const grit = result.grit || {};
    const streams = result.streams || [];

    const dims = [
      ['Numerical Reasoning', apt.numerical], ['Abstract Logic', apt.abstract],
      ['Verbal Reasoning', apt.verbal], ['Spatial Visualization', apt.spatial],
      ['Logical Deduction', apt.logical], ['Data Interpretation', apt.data]
    ];

    container.innerHTML = `
      <div class="results-container">
        <div class="results-header-banner">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
            <div>
              <span class="role-pill role-candidate" style="margin-bottom: 8px; display: inline-block;">Assessment Result • Guidance Only</span>
              <h1 style="font-size: 2.2rem; margin-bottom: 8px;">Your Stream Fit Profile</h1>
              <p style="color: var(--text-secondary); max-width: 620px;">
                Normalized indices (0-100) across reasoning, interests and work style. These are assessment scores, not percentiles or clinical results.
              </p>
              <div class="holland-badge-display">
                <span>Holland Interest Code:</span>
                <span style="color: var(--secondary);">${esc(ria.holland_code || '—')}</span>
              </div>
            </div>
            <div>
              <button class="btn btn-primary" data-act="ReportView:openReport" data-args='[${Number(assessmentId)}, "candidate"]'>
                📄 View Guidance Report
              </button>
            </div>
          </div>
        </div>

        <h3 style="margin-bottom: 6px; font-size: 1.3rem;">All Stream Directions (ranked)</h3>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px;">Fit bands are interpretation labels, not guarantees. Every stream is shown so you can explore beyond the top suggestions.</p>
        <div class="stream-grid">
          ${streams.map(s => `
            <div class="stream-card ${s.rank === 1 ? 'top-recommendation' : ''}">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">RANK #${Number(s.rank)}</span>
                <span class="stream-fit-badge ${this.bandClass(s.band)}">${esc(s.band)}</span>
              </div>
              <h3 style="font-size: 1.15rem; margin-bottom: 8px;">${esc(s.name)}</h3>
              <div style="display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px;">
                <span class="stream-score-val">${Number(s.score)}</span>
                <span style="color: var(--text-muted); font-size: 0.85rem;">fit index</span>
              </div>
              <details>
                <summary style="cursor: pointer; font-size: 0.8rem; color: var(--secondary);">Why this score?</summary>
                <div style="margin-top: 8px; font-size: 0.78rem; color: var(--text-secondary);">
                  ${(s.contributions || []).map(c => `
                    <div style="display:flex; justify-content: space-between; padding: 2px 0;">
                      <span>${esc(c.component)} × ${Number(c.weight)}</span>
                      <strong>${Number(c.contribution)}</strong>
                    </div>`).join('')}
                </div>
              </details>
            </div>
          `).join('')}
        </div>

        <div class="charts-split">
          <div class="chart-card">
            <h4 style="margin-bottom: 4px; font-size: 1.1rem;">Interest Profile (RIASEC)</h4>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 16px;">Normalized interest indices (0-100)</p>
            <canvas id="canvas-holland-radar" width="340" height="340"></canvas>
            <div style="display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap; justify-content: center; font-size: 0.8rem;">
              ${[['R', '#ef4444'], ['I', '#3b82f6'], ['A', '#ec4899'], ['S', '#10b981'], ['E', '#f59e0b'], ['C', '#8b5cf6']].map(([k, color]) => `
                <span style="color: ${color};">${k}: ${ria[k] === null || ria[k] === undefined ? 'not measured' : Number(ria[k])}</span>`).join('')}
            </div>
          </div>

          <div class="chart-card" style="align-items: stretch;">
            <h4 style="margin-bottom: 4px; font-size: 1.1rem;">Aptitude &amp; Reasoning</h4>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 16px;">Normalized indices (0-100) — unmeasured areas show as "not measured"</p>
            <div class="dim-bar-group">
              ${dims.map(([label, val]) => `
                <div class="dim-bar-item">
                  <div class="dim-bar-header">
                    <span>${esc(label)}</span>
                    <span>${val === null || val === undefined ? 'not measured' : Number(val)}</span>
                  </div>
                  <div class="dim-bar-track"><div class="dim-bar-value" style="width: ${Math.max(0, Math.min(100, Number(val || 0)))}%;"></div></div>
                </div>
              `).join('')}
            </div>
            <div style="margin-top: 24px; padding: 14px; background: var(--bg-tertiary); border-radius: var(--radius-md); text-align: center;">
              <span style="font-size: 0.85rem; color: var(--text-secondary);">Overall reasoning index: </span>
              <strong style="color: var(--secondary); font-size: 1.1rem;">${apt.overall == null ? '—' : Number(apt.overall)}</strong>
              <span style="font-size: 0.75rem; color: var(--text-muted);"> / 100</span>
            </div>
          </div>
        </div>

        <div class="glass-card" style="margin-bottom: 32px;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 16px;">
            <div>
              <h3 style="font-size: 1.25rem; margin-bottom: 4px;">Work Style</h3>
              <p style="color: var(--text-secondary); font-size: 0.9rem;">Study-habit indicators: persistence, focus, curiosity, resilience.</p>
            </div>
            <div style="text-align: right;">
              <div style="font-family: var(--font-heading); font-size: 2.2rem; font-weight: 800; color: #ffffff;">
                ${grit.composite == null ? '—' : Number(grit.composite)}<span style="font-size: 1rem; color: var(--text-muted);">/5</span>
              </div>
              <span style="font-size: 0.8rem; color: var(--success);">index ${grit.normalized_index == null ? '—' : Number(grit.normalized_index)} / 100</span>
            </div>
          </div>
        </div>

        <p style="font-size: 0.8rem; color: var(--text-muted); text-align: center; max-width: 700px; margin: 0 auto 24px;">
          ${(result.limitations || []).map(esc).join(' ')}
        </p>
      </div>
    `;

    setTimeout(() => {
      window.drawHollandRadar?.('canvas-holland-radar', {
        R: ria.R, I: ria.I, A: ria.A, S: ria.S, E: ria.E, C: ria.C
      });
    }, 50);
  }
};

window.CandidateView = CandidateView;
