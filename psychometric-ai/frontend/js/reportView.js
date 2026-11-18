// Report View — candidate / parent / counselor.
// narrative_html is sanitized server-side AND defensively re-cleaned client-side.
const ReportView = {
  currentAssessmentId: null,
  currentReportType: 'candidate',

  openReport(assessmentId, reportType = 'candidate') {
    this.currentAssessmentId = assessmentId;
    this.currentReportType = reportType;
    window.location.hash = '#view-report';
    this.loadReport();
  },

  async loadReport() {
    const container = document.getElementById('view-report');
    if (!container) return;

    container.innerHTML = `
      <div style="text-align: center; padding: 60px;">
        <div class="loading-spinner" style="font-size: 36px; margin-bottom: 16px;">📄</div>
        <p style="color: var(--text-secondary);">Loading report...</p>
      </div>
    `;

    try {
      const data = await window.api.getReport(this.currentAssessmentId, this.currentReportType);
      const rep = data.report;
      const s = rep.structured_data || {};

      const canSwitch = window.Auth?.currentUser?.role === 'admin' ||
        (window.Auth?.currentUser?.role === 'parent' && ['candidate', 'parent'].includes(this.currentReportType));

      container.innerHTML = `
        <div style="max-width: 900px; margin: 0 auto;">
          <div class="no-print" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;">
            <button class="btn btn-secondary btn-sm" data-act="Ui:back">← Back</button>
            <div style="display: flex; gap: 10px;">
              ${window.Auth?.currentUser?.role === 'admin' || window.Auth?.currentUser?.role === 'parent' ? `
                <button class="btn btn-secondary btn-sm" data-act="ReportView:regenerate">✨ Regenerate narrative</button>
              ` : ''}
              <button class="btn btn-primary btn-sm" data-act="Ui:print">🖨️ Download / Print PDF</button>
            </div>
          </div>

          <div class="report-print-header">
            <h2>EDUCATIONAL GUIDANCE REPORT</h2>
            <p>
              Student: <strong>${esc(s.student?.first_name || 'Student')}</strong> •
              Grade: ${esc(s.student?.grade ?? '—')} • Board: ${esc(s.student?.board || '—')} •
              Version: ${esc(s.assessment?.version_code || '—')}
            </p>
            <p style="font-size: 0.8rem;">Report type: ${esc((rep.report_type || '').toUpperCase())} • Generated: ${esc(rep.generated_at || '')} • Input hash: ${esc((rep.structured_input_hash || '').slice(0, 16))}…</p>
          </div>

          <div class="glass-card" style="padding: 40px; margin-bottom: 40px;">
            <div class="no-print" style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 20px; margin-bottom: 28px;">
              <span class="role-pill role-candidate" style="margin-bottom: 8px; display: inline-block;">
                Educational guidance — not a clinical or psychological evaluation
              </span>
              <h1 style="font-size: 2rem; margin-bottom: 6px;">${esc(rep.title)}</h1>
              <p style="color: var(--text-muted); font-size: 0.9rem;">
                Holland code: <strong style="color: var(--secondary);">${esc(s.riasec?.holland_code || '—')}</strong> •
                Top stream: <strong style="color: var(--primary-light);">${esc(s.recommendations?.[0]?.stream_name || '—')}</strong> •
                Model: ${esc(rep.model || '—')}
              </p>
              ${canSwitch ? `
                <div style="display: inline-flex; gap: 6px; margin-top: 12px;">
                  ${['candidate', 'parent', 'counselor'].map(t => `
                    <button class="btn btn-sm ${this.currentReportType === t ? 'btn-primary' : 'btn-secondary'}" data-act="ReportView:switchType" data-args='["${t}"]'>${t[0].toUpperCase() + t.slice(1)}</button>
                  `).join('')}
                </div>
              ` : ''}
            </div>

            <div style="background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 20px; margin-bottom: 32px;">
              <h4 style="font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--secondary); margin-bottom: 12px;">
                Deterministic Scores (computed by the scoring engine)
              </h4>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; font-size: 0.9rem;">
                <div>
                  <span style="color: var(--text-muted); display: block;">Overall reasoning index</span>
                  <strong style="font-size: 1.1rem; color: #ffffff;">${s.aptitude?.overall == null ? '—' : Number(s.aptitude.overall)} / 100</strong>
                </div>
                <div>
                  <span style="color: var(--text-muted); display: block;">Holland interest code</span>
                  <strong style="font-size: 1.1rem; color: #ffffff;">${esc(s.riasec?.holland_code || '—')}</strong>
                </div>
                <div>
                  <span style="color: var(--text-muted); display: block;">Work style composite</span>
                  <strong style="font-size: 1.1rem; color: #ffffff;">${s.grit?.composite == null ? '—' : Number(s.grit.composite)} / 5</strong>
                </div>
                <div>
                  <span style="color: var(--text-muted); display: block;">Parent alignment</span>
                  <strong style="font-size: 1.1rem; color: #ffffff;">${s.congruence?.score == null ? 'Parent data not available' : `${Number(s.congruence.score)} (${esc(s.congruence.band)})`}</strong>
                </div>
              </div>
            </div>

            <div class="report-narrative-content" style="line-height: 1.7; font-size: 1.05rem; color: var(--text-primary);">
              ${renderNarrative(rep.narrative_html)}
            </div>

            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 32px; border-top: 1px solid var(--border-subtle); padding-top: 16px;">
              Scores are normalized indices (0-100), not normative percentiles. Fit bands are product interpretation labels.
              This report is educational guidance only: it does not diagnose, predict, or guarantee any academic or career outcome,
              and it does not replace a qualified counsellor.
            </p>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<p style="color: var(--danger); text-align:center; padding: 40px;">${esc(err.message)}</p>`;
    }
  },

  switchType(type) {
    this.currentReportType = type;
    this.loadReport();
  },

  async regenerate() {
    try {
      window.showToast('Regenerating narrative...', 'info');
      await window.api.regenerateReport(this.currentAssessmentId, this.currentReportType);
      window.showToast('Narrative regenerated.', 'success');
      this.loadReport();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};

window.ReportView = ReportView;
