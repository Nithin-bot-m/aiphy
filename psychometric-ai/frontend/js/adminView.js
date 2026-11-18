// Admin Dashboard — analytics, question bank, scoring config, prompts, audit logs.
// v2: matches the refactored admin API; all dynamic text is escaped.
const AdminView = {
  activeTab: 'analytics',

  async init() {
    const container = document.getElementById('view-admin');
    if (!container) return;
    this.renderShell();
    this.switchTab(this.activeTab);
  },

  renderShell() {
    const container = document.getElementById('view-admin');
    container.innerHTML = `
      <div>
        <div class="admin-header">
          <div>
            <span class="role-pill role-admin" style="margin-bottom: 8px; display: inline-block;">Administration</span>
            <h1 style="font-size: 2rem;">Dashboard &amp; Governance</h1>
          </div>
          <div style="display: flex; gap: 12px;">
            <button class="btn btn-secondary btn-sm" data-act="AdminView:exportData" data-args='["candidates"]'>📥 Export Candidates (JSON)</button>
            <button class="btn btn-secondary btn-sm" data-act="AdminView:exportData" data-args='["audit"]'>📥 Export Audit (JSON)</button>
          </div>
        </div>

        <div class="admin-tabs">
          <button class="admin-tab-btn active" id="tab-btn-analytics" data-act="AdminView:switchTab" data-args='["analytics"]'>📊 Analytics</button>
          <button class="admin-tab-btn" id="tab-btn-candidates" data-act="AdminView:switchTab" data-args='["candidates"]'>👥 Candidates</button>
          <button class="admin-tab-btn" id="tab-btn-questions" data-act="AdminView:switchTab" data-args='["questions"]'>📚 Question Bank</button>
          <button class="admin-tab-btn" id="tab-btn-scoring" data-act="AdminView:switchTab" data-args='["scoring"]'>⚖️ Scoring</button>
          <button class="admin-tab-btn" id="tab-btn-prompts" data-act="AdminView:switchTab" data-args='["prompts"]'>🧠 Prompts</button>
          <button class="admin-tab-btn" id="tab-btn-audits" data-act="AdminView:switchTab" data-args='["audits"]'>🛡️ Audit Logs</button>
        </div>

        <div id="admin-tab-content">
          <div style="text-align: center; padding: 40px;">Loading dashboard data...</div>
        </div>
      </div>
    `;
  },

  switchTab(tabKey) {
    this.activeTab = tabKey;
    document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`tab-btn-${tabKey}`);
    if (activeBtn) activeBtn.classList.add('active');

    if (tabKey === 'analytics') this.loadAnalytics();
    else if (tabKey === 'candidates') this.loadCandidates();
    else if (tabKey === 'questions') this.loadQuestions();
    else if (tabKey === 'scoring') this.loadScoring();
    else if (tabKey === 'prompts') this.loadPrompts();
    else if (tabKey === 'audits') this.loadAuditLogs();
  },

  // ---------- Analytics ----------
  async loadAnalytics() {
    const container = document.getElementById('admin-tab-content');
    try {
      const data = await window.api.getAdminDashboard();
      const s = data.summary;
      const apt = data.average_aptitude || {};

      container.innerHTML = `
        <div class="kpi-grid">
          <div class="kpi-card">
            <span class="kpi-label">Candidates</span>
            <div class="kpi-value">${Number(s.candidates)}</div>
            <span class="kpi-subtext">registered students</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">Completed Assessments</span>
            <div class="kpi-value">${Number(s.completed_assessments)}</div>
            <span class="kpi-subtext">${Number(s.assessments)} initiated • ${Number(s.completion_rate)}% completion</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">Reports Generated</span>
            <div class="kpi-value">${Number(s.reports_generated)}</div>
            <span class="kpi-subtext">all types</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">Avg Reasoning Index</span>
            <div class="kpi-value">${apt.overall == null ? '—' : Number(apt.overall)}</div>
            <span class="kpi-subtext">normalized 0-100 (not a percentile)</span>
          </div>
        </div>

        <div class="charts-split" style="margin: 24px 0;">
          <div class="glass-card">
            <h4 style="margin-bottom: 12px;">Top Stream Distribution (rank 1)</h4>
            ${(data.stream_distribution || []).map(r => `
              <div style="display:flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-subtle); font-size: 0.9rem;">
                <span>${esc(r.stream_name)}</span><strong>${Number(r.count)}</strong>
              </div>
            `).join('') || '<p style="color:var(--text-muted); font-size: 0.85rem;">No completed assessments yet.</p>'}
          </div>
          <div class="glass-card">
            <h4 style="margin-bottom: 12px;">Alignment Distribution</h4>
            ${(data.alignment_distribution || []).map(r => `
              <div style="display:flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-subtle); font-size: 0.9rem;">
                <span>${esc(r.alignment_status)}</span><strong>${Number(r.count)}</strong>
              </div>
            `).join('') || '<p style="color:var(--text-muted); font-size: 0.85rem;">No congruence data yet.</p>'}
            <h4 style="margin: 16px 0 12px;">Holland Codes</h4>
            <div style="font-size: 0.85rem; color: var(--text-secondary);">
              ${(data.riasec_distribution || []).map(r => `${esc(r.holland_code)}: ${Number(r.count)}`).join(' • ') || '—'}
            </div>
          </div>
        </div>

        <div class="glass-card">
          <h4 style="margin-bottom: 12px;">Assessment Versions</h4>
          <table class="admin-table">
            <thead><tr><th>Code</th><th>Name</th><th>Active Questions</th><th>Active</th><th>Created</th></tr></thead>
            <tbody>
              ${(data.assessment_versions || []).map(v => `
                <tr>
                  <td>${esc(v.version_code)}</td>
                  <td>${esc(v.name)}</td>
                  <td>${Number(v.active_question_count)}</td>
                  <td>${v.is_active ? '✅' : '—'}</td>
                  <td>${esc(v.created_at || '')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="glass-card" style="margin-top: 20px;">
          <h4 style="margin-bottom: 12px;">Question Analytics (attempts &amp; correctness)</h4>
          <table class="admin-table">
            <thead><tr><th>ID</th><th>Module</th><th>Dimension</th><th>Difficulty</th><th>Attempts</th><th>Correct</th><th>Correct %</th></tr></thead>
            <tbody>
              ${(data.question_analytics || []).map(q => {
                const pct = q.attempts > 0 && q.correct != null ? Math.round((Number(q.correct) / Number(q.attempts)) * 100) : null;
                return `<tr>
                  <td>${Number(q.id)}</td>
                  <td>${esc(q.module)}</td>
                  <td>${esc(q.dimension)}</td>
                  <td>${esc(q.difficulty || '—')}</td>
                  <td>${Number(q.attempts)}</td>
                  <td>${q.correct == null ? 'n/a (Likert)' : Number(q.correct)}</td>
                  <td>${pct === null ? '—' : pct + '%'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="glass-card"><p style="color: var(--danger);">${esc(err.message)}</p></div>`;
    }
  },

  // ---------- Candidates ----------
  async loadCandidates() {
    const container = document.getElementById('admin-tab-content');
    try {
      const data = await window.api.getAdminCandidates();
      container.innerHTML = `
        <table class="admin-table">
          <thead><tr><th>ID</th><th>Name</th><th>Grade</th><th>Board</th><th>Code</th><th>Email</th><th>Top Stream</th><th>Alignment</th><th>DEMO</th></tr></thead>
          <tbody>
            ${data.candidates.map(c => `
              <tr>
                <td>${Number(c.id)}</td>
                <td>${esc(c.full_name)}</td>
                <td>${Number(c.grade)}</td>
                <td>${esc(c.board)}</td>
                <td><code>${esc(c.student_code)}</code></td>
                <td>${esc(c.email || '—')}</td>
                <td>${esc(c.top_stream || '—')}</td>
                <td>${c.congruence_pct == null ? '—' : Number(c.congruence_pct)}</td>
                <td>${c.is_demo ? 'DEMO' : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      container.innerHTML = `<div class="glass-card"><p style="color: var(--danger);">${esc(err.message)}</p></div>`;
    }
  },

  // ---------- Question bank ----------
  async loadQuestions() {
    const container = document.getElementById('admin-tab-content');
    try {
      const data = await window.api.getAdminQuestions();
      container.innerHTML = `
        <div style="display:flex; gap: 12px; margin-bottom: 16px;">
          <select class="form-select" id="q-filter-module" style="max-width: 220px;" data-change="AdminView:loadQuestions">
            <option value="">All modules</option>
            ${['aptitude', 'riasec', 'grit', 'parent_perception', 'parent_expectation'].map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" data-act="AdminView:showCreateQuestion">➕ New Question</button>
        </div>
        <table class="admin-table">
          <thead><tr><th>ID</th><th>Module</th><th>Dimension</th><th>Type</th><th>Text</th><th>Active</th><th>Actions</th></tr></thead>
          <tbody>
            ${data.questions.map(q => `
              <tr>
                <td>${Number(q.id)}</td>
                <td>${esc(q.module)}</td>
                <td>${esc(q.dimension)}</td>
                <td>${esc(q.question_type)}</td>
                <td style="max-width: 380px;">${esc(q.question_text.slice(0, 90))}${q.question_text.length > 90 ? '…' : ''}</td>
                <td>${q.is_active ? '✅' : '⛔'}</td>
                <td><button class="btn btn-secondary btn-sm" data-act="AdminView:toggleQuestion" data-args='[${Number(q.id)}]'>Toggle</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div id="create-question-panel"></div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="glass-card"><p style="color: var(--danger);">${esc(err.message)}</p></div>`;
    }
  },

  showCreateQuestion() {
    document.getElementById('create-question-panel').innerHTML = `
      <div class="glass-card" style="margin-top: 20px;">
        <h4 style="margin-bottom: 12px;">Create Question (added to the active version)</h4>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
          <select class="form-select" id="nq-module">
            ${['aptitude', 'riasec', 'grit', 'parent_perception', 'parent_expectation'].map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
          <input class="form-input" id="nq-dimension" placeholder="dimension (e.g. numerical / R / persistence)" />
          <select class="form-select" id="nq-type">
            <option value="single_choice">single_choice</option>
            <option value="likert_5">likert_5</option>
            <option value="categorical">categorical</option>
          </select>
          <select class="form-select" id="nq-difficulty">
            <option value="">no difficulty</option>
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </div>
        <textarea class="form-input" id="nq-text" rows="2" placeholder="Question text" style="margin-top: 12px;"></textarea>
        <textarea class="form-input" id="nq-options" rows="3" placeholder='Options JSON: [{"option_text":"...","score_value":0},...]' style="margin-top: 12px;"></textarea>
        <button class="btn btn-primary" style="margin-top: 12px;" data-act="AdminView:createQuestion">Create</button>
        <p id="nq-status" style="margin-top: 8px; font-size: 0.85rem; color: var(--text-muted);"></p>
      </div>
    `;
  },

  async createQuestion() {
    const status = document.getElementById('nq-status');
    try {
      let options;
      try { options = JSON.parse(document.getElementById('nq-options').value); }
      catch { throw new Error('Options must be valid JSON.'); }
      await window.api.createAdminQuestion({
        module: document.getElementById('nq-module').value,
        dimension: document.getElementById('nq-dimension').value,
        question_type: document.getElementById('nq-type').value,
        difficulty: document.getElementById('nq-difficulty').value || undefined,
        question_text: document.getElementById('nq-text').value,
        options
      });
      status.textContent = 'Question created.';
      this.loadQuestions();
    } catch (err) {
      status.textContent = err.message;
    }
  },

  async toggleQuestion(id) {
    try {
      await window.api.toggleAdminQuestion(id);
      this.loadQuestions();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  // ---------- Scoring ----------
  async loadScoring() {
    const container = document.getElementById('admin-tab-content');
    try {
      const [rulesData, configData] = await Promise.all([
        window.api.getAdminStreamRules(),
        window.api.getAdminScoringConfig()
      ]);
      const cfg = configData.scoring_config;

      container.innerHTML = `
        <div class="glass-card" style="margin-bottom: 20px;">
          <h4 style="margin-bottom: 8px;">Scoring Configuration (admin_settings:scoring_config)</h4>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
            Product heuristics — not scientifically validated parameters. Changes apply to future calculations.
          </p>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; font-size: 0.85rem;">
            <div><strong>Difficulty weights:</strong> ${esc(JSON.stringify(cfg.difficulty_weights))}</div>
            <div><strong>Fit bands:</strong> ${esc(JSON.stringify(cfg.fit_bands))}</div>
            <div><strong>Congruence weights:</strong> stream ${Number(cfg.congruence.stream_match_weight)} / perception ${Number(cfg.congruence.perception_gap_weight)}</div>
            <div><strong>RIASEC tie-break:</strong> ${esc(cfg.riasec_tie_break_order.join(' > '))}</div>
          </div>
        </div>

        <div class="glass-card">
          <h4 style="margin-bottom: 12px;">Stream Weights (versioned, must sum to 1.00)</h4>
          ${rulesData.rules.map(r => {
            const parsed = JSON.parse(r.weight_config_json || '{}');
            const weights = parsed.weights || {};
            return `
              <div style="border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <strong>${esc(r.stream_name)}</strong>
                  <button class="btn btn-secondary btn-sm" data-act="AdminView:editRule" data-args='${esc(JSON.stringify([r.stream_id, weights]))}>Edit weights</button>
                </div>
                <div style='font-size: 0.8rem; color: var(--text-secondary); font-family: var(--font-mono);">
                  ${Object.entries(weights).map(([k, v]) => `${esc(k)}=${Number(v)}`).join(' · ')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
        <div id="rule-edit-panel"></div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="glass-card"><p style="color: var(--danger);">${esc(err.message)}</p></div>`;
    }
  },

  editRule(streamId, weights) {
    const panel = document.getElementById('rule-edit-panel');
    const keys = Object.keys(weights);
    panel.innerHTML = `
      <div class="glass-card" style="margin-top: 16px;">
        <h4 style="margin-bottom: 12px;">Edit weights — ${esc(streamId)}</h4>
        ${keys.map(k => `
          <div style="display:flex; gap: 12px; align-items: center; margin-bottom: 8px;">
            <label class="form-label" style="min-width: 160px; margin: 0;" for="rw-status">${esc(k)}</label>
            <input class="form-input" id="rw-${esc(k)}" value="${Number(weights[k])}" style="max-width: 120px;" />
          </div>
        `).join('')}
        <button class="btn btn-primary" data-act="AdminView:saveRule" data-args='["${esc(streamId)}"]'>Save</button>
        <p id="rw-status" style="margin-top: 8px; font-size: 0.85rem; color: var(--text-muted);"></p>
      </div>
    `;
  },

  async saveRule(streamId) {
    const status = document.getElementById('rw-status');
    try {
      const weights = {};
      document.querySelectorAll('[id^="rw-"]').forEach(input => {
        if (input.id === 'rw-status') return;
        const key = input.id.slice(3);
        weights[key] = Number(input.value);
      });
      await window.api.updateAdminStreamRule(streamId, weights);
      status.textContent = 'Saved. Future scorings will use these weights.';
      setTimeout(() => this.loadScoring(), 800);
    } catch (err) {
      status.textContent = err.message;
    }
  },

  // ---------- Prompts ----------
  async loadPrompts() {
    const container = document.getElementById('admin-tab-content');
    try {
      const data = await window.api.getAdminPrompts();
      container.innerHTML = `
        <div class="glass-card">
          <h4 style="margin-bottom: 8px;">Prompt Versions</h4>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 16px;">
            Editing creates a NEW version — history is never rewritten. The active version is used by report generation.
          </p>
          <table class="admin-table">
            <thead><tr><th>ID</th><th>Type</th><th>Version</th><th>Active</th><th>Updated</th><th>Actions</th></tr></thead>
            <tbody>
              ${data.prompts.map(p => `
                <tr>
                  <td>${Number(p.id)}</td>
                  <td>${esc(p.prompt_type)}</td>
                  <td>${esc(p.version_code)}</td>
                  <td>${p.is_active ? '✅' : '—'}</td>
                  <td>${esc(p.updated_at || '')}</td>
                  <td><button class="btn btn-secondary btn-sm" data-act="AdminView:editPrompt" data-args='[${Number(p.id)}]'>View / Edit</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div id="prompt-edit-panel"></div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="glass-card"><p style="color: var(--danger);">${esc(err.message)}</p></div>`;
    }
  },

  async editPrompt(id) {
    const panel = document.getElementById('prompt-edit-panel');
    try {
      const data = await window.api.getAdminPromptDetail(id);
      const p = data.prompt;
      panel.innerHTML = `
        <div class="glass-card" style="margin-top: 16px;">
          <h4 style="margin-bottom: 12px;">Edit prompt: ${esc(p.prompt_type)} (${esc(p.version_code)})</h4>
          <label class="form-label" for="pe-system">System prompt</label>
          <textarea class="form-input" id="pe-system" rows="8">${esc(p.system_prompt)}</textarea>
          <label class="form-label" style="margin-top: 12px;" for="pe-template">User template ({{placeholders}} allowed)</label>
          <textarea class="form-input" id="pe-template" rows="10">${esc(p.user_template)}</textarea>
          <button class="btn btn-primary" style="margin-top: 12px;" data-act="AdminView:savePrompt" data-args='[${Number(p.id)}]'>Create new version</button>
          <p id="pe-status" style="margin-top: 8px; font-size: 0.85rem; color: var(--text-muted);"></p>
        </div>
      `;
    } catch (err) {
      panel.innerHTML = `<p style="color: var(--danger);">${esc(err.message)}</p>`;
    }
  },

  async savePrompt(id) {
    const status = document.getElementById('pe-status');
    try {
      const res = await window.api.updateAdminPrompt(id, {
        system_prompt: document.getElementById('pe-system').value,
        user_template: document.getElementById('pe-template').value
      });
      status.textContent = `New prompt version created (#${res.prompt_id}).`;
      this.loadPrompts();
    } catch (err) {
      status.textContent = err.message;
    }
  },

  // ---------- Audit ----------
  async loadAuditLogs() {
    const container = document.getElementById('admin-tab-content');
    try {
      const data = await window.api.getAdminAuditLogs(150, 0);
      container.innerHTML = `
        <table class="admin-table">
          <thead><tr><th>ID</th><th>Time</th><th>User</th><th>Role</th><th>Action</th><th>Resource</th><th>IP</th></tr></thead>
          <tbody>
            ${data.logs.map(l => `
              <tr>
                <td>${Number(l.id)}</td>
                <td>${esc(l.created_at)}</td>
                <td>${esc(l.email || 'system')}</td>
                <td>${esc(l.role || '—')}</td>
                <td>${esc(l.action)}</td>
                <td>${esc(l.resource_type)}#${esc(l.resource_id || '')}</td>
                <td>${esc(l.ip_address || '')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } catch (err) {
      container.innerHTML = `<div class="glass-card"><p style="color: var(--danger);">${esc(err.message)}</p></div>`;
    }
  },

  async exportData(type) {
    try {
      const data = await window.api.exportAdminData(type);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `psychometric-ai-export-${type}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }
};

window.AdminView = AdminView;
