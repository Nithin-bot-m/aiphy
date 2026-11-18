// Parent Portal — link (with student consent), inventory, alignment dashboard.
const ParentView = {
  activeChild: null,

  async init() {
    const container = document.getElementById('view-parent');
    if (!container) return;
    try {
      const res = await window.api.getParentChildren();
      this.renderChildrenList(res.children || []);
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  renderChildrenList(children) {
    const container = document.getElementById('view-parent');
    const rows = children.length === 0 ? `
      <div class="glass-card" style="text-align: center; padding: 40px;">
        <p style="color: var(--text-secondary);">No students linked yet. Enter your child's student code (e.g. <code>PC-XXXXXXXX</code>) above.</p>
      </div>
    ` : children.map(c => {
      const statusLabel = c.link_status === 'linked'
        ? '<span class="role-pill role-candidate">Linked</span>'
        : c.link_status === 'pending_student_approval'
          ? '<span class="role-pill role-parent">Waiting for student approval</span>'
          : '<span class="role-pill role-parent">Link revoked</span>';
      const actions = c.link_status === 'linked' && c.latest_assessment_id ? `
        <button class="btn btn-secondary btn-sm" data-act="ParentView:openInventory" data-args='${esc(JSON.stringify([Number(c.latest_assessment_id), c.full_name]))}'>📝 Parent Inventory</button>
        <button class="btn btn-primary btn-sm" data-act="ParentView:openDashboard" data-args='[${Number(c.latest_assessment_id)}]'>🤝 View Alignment &amp; Guidance</button>
      ` : '<span style="font-size: 0.85rem; color: var(--text-muted);">Available once the student approves the link' + (c.assessment_status === 'completed' ? '' : ' and completes the assessment') + '</span>';
      return `
        <div class="glass-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
            <div>
              <h3 style="font-size: 1.35rem; margin-bottom: 4px;">${esc(c.full_name)} ${c.is_demo ? '<span class="role-pill role-admin">DEMO</span>' : ''}</h3>
              <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 8px;">
                Grade ${Number(c.grade)} • ${esc(c.board || 'CBSE')}
              </p>
              ${statusLabel}
            </div>
            <div style="display: flex; gap: 12px; flex-wrap: wrap;">${actions}</div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="parent-portal-container">
        <div class="link-student-card">
          <h3 style="font-size: 1.25rem; margin-bottom: 8px;">🔗 Link with Your Child</h3>
          <p style="color: var(--text-secondary); font-size: 0.9rem;">
            Enter the student code from your child's profile. The student must <strong>approve</strong> the link before you can view any results — this platform gives students control over who sees their data.
          </p>
          <div class="link-input-group">
            <input type="text" id="link-student-code" class="form-input" placeholder="e.g. PC-AB12CD34" style="text-transform: uppercase;">
            <button class="btn btn-accent" data-act="ParentView:linkStudent">Request Link</button>
          </div>
        </div>
        <h2 style="font-size: 1.6rem; margin-bottom: 20px;">Linked Students</h2>
        ${rows}
      </div>
    `;
  },

  async linkStudent() {
    const input = document.getElementById('link-student-code');
    if (!input || !input.value.trim()) {
      window.showToast('Please enter a valid student code.', 'error');
      return;
    }
    try {
      const res = await window.api.linkStudent(input.value.trim());
      window.showToast(res.message || 'Request sent.', 'success');
      this.init();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async openInventory(assessmentId, studentName) {
    const container = document.getElementById('view-parent');
    container.innerHTML = `
      <div class="parent-portal-container">
        <button class="btn btn-secondary btn-sm" data-act="ParentView:init" style="margin-bottom: 20px;">← Back</button>
        <div class="glass-card">
          <span class="role-pill role-parent" style="margin-bottom: 12px; display: inline-block;">Parent Perception — not a test of you</span>
          <h2 style="font-size: 1.8rem; margin-bottom: 8px;">Parent Expectation &amp; Perception Inventory</h2>
          <p style="color: var(--text-secondary); margin-bottom: 24px;">
            About your child: <strong>${esc(studentName)}</strong>. This survey captures your observations of your child's
            learning patterns and your own priorities. It is <strong>not</strong> a psychological evaluation of you or your child.
          </p>

          <form id="parent-inventory-form" data-submit="ParentView:submitInventory" data-args="[${Number(assessmentId)}]">
            <h3 style="font-size: 1.15rem; color: var(--secondary); margin-bottom: 16px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
              Part 1: Your Observations (1 = rarely … 5 = consistently)
            </h3>
            ${this.perceptionSelect('observed_analytical', 'Independent problem solving', 'My child chooses to tackle maths / technical / scientific problems without reminders.')}
            ${this.perceptionSelect('observed_creative', 'Creative & verbal expression', 'My child writes, draws, debates, or creates things in free time.')}
            ${this.perceptionSelect('observed_study_habits', 'Study habits', 'My child maintains a steady study schedule without supervision.')}
            ${this.perceptionSelect('observed_stress_resilience', 'Stress response', 'After disappointing results, my child recovers and tries constructive next steps.')}

            <h3 style="font-size: 1.15rem; color: var(--secondary); margin: 24px 0 16px; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
              Part 2: Your Expectations
            </h3>
            <div class="form-group">
              <label class="form-label" for="inv-expected-stream">Stream you primarily envision for Grade 11</label>
              <select class="form-select" id="inv-expected-stream" required>
                <option value="">Select a stream…</option>
                <option value="pcm">Science (PCM)</option>
                <option value="pcb">Science (PCB)</option>
                <option value="commerce_math">Commerce with Mathematics</option>
                <option value="commerce_no_math">Commerce without Mathematics</option>
                <option value="humanities_law">Humanities / Law</option>
                <option value="design">Design / Creative Arts</option>
                <option value="vocational">Vocational / Applied Technology</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="inv-priority">What matters most to you in your child's future career?</label>
              <select class="form-select" id="inv-priority" required>
                <option value="">Select a priority…</option>
                <option value="stability">Financial stability &amp; job security</option>
                <option value="prestige">Professional prestige</option>
                <option value="fulfillment">Passion &amp; self-expression</option>
                <option value="entrepreneurship">Building something of their own</option>
                <option value="balanced">A balanced mix</option>
                <option value="exploration">Keeping options open</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="inv-comments">Anything you'd like the counsellor to know? <span style="color:var(--text-muted)">(optional)</span></label>
              <textarea class="form-input" id="inv-comments" rows="3" maxlength="2000" placeholder="Shared only with authorised counsellors."></textarea>
            </div>

            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 8px;">Submit Inventory &amp; Compute Alignment</button>
            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 12px;">
              All four observation ratings are required — missing ratings are never guessed or filled in automatically.
            </p>
          </form>
        </div>
      </div>
    `;
  },

  perceptionSelect(id, label, hint) {
    return `
      <div class="form-group">
        <label class="form-label">${esc(label)}</label>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">${esc(hint)}</p>
        <select class="form-select" id="inv-${esc(id)}" required>
          <option value="">Select…</option>
          <option value="1">1 — Rarely</option>
          <option value="2">2 — Occasionally</option>
          <option value="3">3 — Sometimes</option>
          <option value="4">4 — Often</option>
          <option value="5">5 — Consistently</option>
        </select>
      </div>
    `;
  },

  async submitInventory(e, assessmentId) {
    e.preventDefault();
    const val = (id) => {
      const v = document.getElementById(id)?.value;
      return v === '' || v === undefined ? null : Number(v);
    };
    const perceptions = {
      observed_analytical: val('inv-observed_analytical'),
      observed_creative: val('inv-observed_creative'),
      observed_study_habits: val('inv-observed_study_habits'),
      observed_stress_resilience: val('inv-observed_stress_resilience')
    };

    try {
      window.showToast('Submitting inventory...', 'info');
      await window.api.submitParentInventory({
        assessment_id: assessmentId,
        expected_stream: document.getElementById('inv-expected-stream').value,
        outcome_priority: document.getElementById('inv-priority').value,
        perceptions,
        comments: document.getElementById('inv-comments')?.value || ''
      });
      window.showToast('Inventory submitted — alignment computed.', 'success');
      this.openDashboard(assessmentId);
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async openDashboard(assessmentId) {
    const container = document.getElementById('view-parent');
    container.innerHTML = '<div style="text-align:center; padding: 60px; color: var(--text-secondary);">Loading alignment view...</div>';
    try {
      const d = await window.api.getChildDashboard(assessmentId);
      const cong = d.congruence;
      container.innerHTML = `
        <div class="parent-portal-container">
          <button class="btn btn-secondary btn-sm" data-act="ParentView:init" style="margin-bottom: 20px;">← Back to Linked Students</button>
          <div class="glass-card" style="margin-bottom: 20px;">
            <span class="role-pill role-parent" style="margin-bottom: 12px; display: inline-block;">Alignment Overview</span>
            <h2 style="font-size: 1.8rem; margin-bottom: 8px;">${esc(d.student.first_name)} — Grade ${Number(d.student.grade)} (${esc(d.student.board)}) ${d.student.is_demo ? '<span class="role-pill role-admin">DEMO</span>' : ''}</h2>
            <p style="color: var(--text-secondary);">
              Assessment: ${d.assessment.status === 'completed' ? 'Completed' : 'In progress'} • Version ${esc(d.assessment.version_code || '—')}
            </p>
          </div>

          <div class="glass-card" style="margin-bottom: 20px;">
            <h3 style="margin-bottom: 12px;">Top Stream Directions (student's measured profile)</h3>
            ${d.top_streams.map(s => `
              <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-subtle);">
                <span>#${Number(s.rank)} ${esc(s.name)}</span>
                <strong style="color: var(--secondary);">${Number(s.score)} — ${esc(s.band)}</strong>
              </div>
            `).join('')}
            <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 8px;">Fit bands are product interpretation labels, not validated categories or guarantees.</p>
          </div>

          <div class="glass-card" style="margin-bottom: 20px;">
            <h3 style="margin-bottom: 12px;">Parent–Student Alignment</h3>
            ${cong ? `
              <div style="display: flex; align-items: center; gap: 24px; flex-wrap: wrap;">
                <div style="font-size: 3rem; font-weight: 800; color: var(--secondary);">${Number(cong.score)}</div>
                <div>
                  <div style="font-weight: 700; margin-bottom: 4px;">${esc(cong.band)}</div>
                  <div style="font-size: 0.85rem; color: var(--text-secondary);">
                    Stream match: ${Number(cong.stream_match_score)} / 100 • Perception agreement: ${cong.perception_gap_score === null ? 'not computable' : Number(cong.perception_gap_score) + ' / 100'}
                  </div>
                </div>
              </div>
              ${cong.friction?.friction_factors?.length ? `
                <h4 style="margin-top: 16px; margin-bottom: 8px;">Areas of difference (neutral)</h4>
                <ul>${cong.friction.friction_factors.map(f => `<li style="color: var(--text-secondary); font-size: 0.9rem;">${esc(f.detail)}</li>`).join('')}</ul>
              ` : '<p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 12px;">No significant areas of difference were flagged.</p>'}
              ${cong.friction?.discussion_areas?.length ? `
                <h4 style="margin-top: 16px; margin-bottom: 8px;">Suggested discussion areas</h4>
                <ul>${cong.friction.discussion_areas.map(a => `<li style="color: var(--text-secondary); font-size: 0.9rem;">${esc(a)}</li>`).join('')}</ul>
              ` : ''}
              <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 12px;">
                There are differences between the student's measured profile and the parent's expectations — the platform takes no side. Use these as neutral conversation starters.
              </p>
            ` : `
              <p style="color: var(--text-secondary);">No alignment analysis is available yet${d.my_expectations?.submitted ? ' — the student assessment may still be in progress.' : '. Submit the parent inventory first.'}</p>
            `}
          </div>

          ${d.my_perceptions ? `
            <div class="glass-card">
              <h3 style="margin-bottom: 8px;">Your Submitted Perceptions</h3>
              <p style="font-size: 0.78rem; color: var(--text-muted); margin-bottom: 12px;">${esc(d.my_perceptions.note || 'Parent perception — not a psychological evaluation.')}</p>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; font-size: 0.9rem;">
                <div>Analytical: <strong>${Number(d.my_perceptions.observed_analytical)}/5</strong></div>
                <div>Creative: <strong>${Number(d.my_perceptions.observed_creative)}/5</strong></div>
                <div>Study habits: <strong>${Number(d.my_perceptions.observed_study_habits)}/5</strong></div>
                <div>Stress response: <strong>${Number(d.my_perceptions.observed_stress_resilience)}/5</strong></div>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="glass-card"><p style="color: var(--danger);">${esc(err.message)}</p></div>`;
    }
  }
};

window.ParentView = ParentView;
