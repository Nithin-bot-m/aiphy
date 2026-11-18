// API Service Client — v2 endpoints (spec §24).
const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('psycho_token') || null;
  }

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('psycho_token', token);
    else localStorage.removeItem('psycho_token');
  }

  getToken() { return this.token; }

  async request(endpoint, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    let response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
    } catch (e) {
      throw new Error('Network error. Is the server running?');
    }

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && this.token && !endpoint.startsWith('/auth/')) {
        this.setToken(null);
        window.location.hash = '#view-landing';
        window.showToast?.('Session expired. Please log in again.', 'error');
      }
      // Envelope contract (spec §23): { success:false, error:{code,message} }
      const message = body?.error?.message || body?.error || `Request failed (${response.status})`;
      const err = new Error(message);
      err.code = body?.error?.code || body?.code;
      throw err;
    }
    // Success envelope: { success:true, data:<payload> } — unwrap centrally so
    // view code keeps consuming the domain payload directly.
    return body && body.success === true && 'data' in body ? body.data : body;
  }

  // ---------- Auth ----------
  login(identifier, password) {
    return this.request('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) })
      .then(res => { this.setToken(res.token); return res; });
  }

  register(userData) {
    return this.request('/auth/register', { method: 'POST', body: JSON.stringify(userData) })
      .then(res => { this.setToken(res.token); return res; });
  }

  sendOtp(phone) {
    return this.request('/auth/send-otp', { method: 'POST', body: JSON.stringify({ phone }) });
  }

  verifyOtp(phone, otp) {
    // NOTE: role can never be chosen via OTP — accounts must exist (server-enforced).
    return this.request('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, otp }) })
      .then(res => { this.setToken(res.token); return res; });
  }

  logout() {
    return this.request('/auth/logout', { method: 'POST' }).catch(() => ({})).then(r => { this.setToken(null); return r; });
  }

  getMe() { return this.request('/auth/me'); }

  // ---------- Candidate ----------
  getCandidateProfile() { return this.request('/candidate/profile'); }
  updateCandidateProfile(data) { return this.request('/candidate/profile', { method: 'PUT', body: JSON.stringify(data) }); }
  getMyCode() { return this.request('/candidate/code'); }
  listParentRequests() { return this.request('/candidate/parent-requests'); }
  approveParentRequest(id) { return this.request(`/candidate/parent-requests/${id}/approve`, { method: 'POST' }); }
  revokeParentRequest(id) { return this.request(`/candidate/parent-requests/${id}/revoke`, { method: 'POST' }); }

  // ---------- Assessment (spec §24 shape) ----------
  startAssessment() { return this.request('/candidate/assessment/start', { method: 'POST' }); }
  getAssessmentQuestions(assessmentId) { return this.request(`/assessments/${assessmentId}`); }
  saveResponse(assessmentId, body) { return this.request(`/assessments/${assessmentId}/responses`, { method: 'POST', body: JSON.stringify(body) }); }
  getProgress(assessmentId) { return this.request(`/assessments/${assessmentId}/progress`); }
  completeAssessment(assessmentId) { return this.request(`/assessments/${assessmentId}/complete`, { method: 'POST' }); }

  // ---------- Results & streams ----------
  getCandidateResults() { return this.request('/candidate/results'); }
  getResultByAssessment(id) { return this.request(`/results/${id}`); }
  getStreamAnalysis(id) { return this.request(`/results/${id}/streams`); }
  getCongruence(id) { return this.request(`/results/${id}/congruence`); }

  // ---------- Parent ----------
  getParentChildren() { return this.request('/parent/children'); }
  linkStudent(student_code) { return this.request('/parent/link-request', { method: 'POST', body: JSON.stringify({ student_code }) }); }
  submitParentInventory(data) { return this.request('/parent/inventory/submit', { method: 'POST', body: JSON.stringify(data) }); }
  getChildDashboard(assessmentId) { return this.request(`/parent/child?assessment_id=${assessmentId}`); }

  // ---------- Admin ----------
  getAdminDashboard() { return this.request('/admin/dashboard'); }
  getAdminCandidates() { return this.request('/admin/candidates'); }
  getAdminQuestions(filters = {}) {
    const params = new URLSearchParams();
    if (filters.module) params.set('module', filters.module);
    if (filters.difficulty) params.set('difficulty', filters.difficulty);
    const q = params.toString();
    return this.request(`/admin/questions${q ? '?' + q : ''}`);
  }
  createAdminQuestion(data) { return this.request('/admin/questions', { method: 'POST', body: JSON.stringify(data) }); }
  updateAdminQuestion(id, data) { return this.request(`/admin/questions/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  toggleAdminQuestion(id) { return this.request(`/admin/questions/${id}`, { method: 'DELETE' }); }
  getAdminScoringConfig() { return this.request('/admin/scoring-config'); }
  updateAdminScoringConfig(path, value) { return this.request('/admin/scoring-config', { method: 'PUT', body: JSON.stringify({ path, value }) }); }
  getAdminStreamRules() { return this.request('/admin/scoring-rules'); }
  updateAdminStreamRule(streamId, weights, versionId) { return this.request(`/admin/scoring-rules/${streamId}`, { method: 'PUT', body: JSON.stringify({ weights, version_id: versionId }) }); }
  getAdminPrompts() { return this.request('/admin/prompts'); }
  getAdminPromptDetail(id) { return this.request(`/admin/prompts/${id}`); }
  updateAdminPrompt(id, data) { return this.request(`/admin/prompts/${id}`, { method: 'PUT', body: JSON.stringify(data) }); }
  getAdminAuditLogs(limit = 100, offset = 0) { return this.request(`/admin/audit-logs?limit=${limit}&offset=${offset}`); }
  exportAdminData(type) { return this.request(`/admin/export/${type}`); }

  // ---------- Reports ----------
  getReport(assessmentId, type = 'candidate') { return this.request(`/reports/${assessmentId}/${type}`); }
  regenerateReport(assessmentId, type = 'candidate') { return this.request(`/reports/${assessmentId}/regenerate/${type}`, { method: 'POST' }); }
  getReportVersions(assessmentId) { return this.request(`/report-versions/${assessmentId}`); }
}

window.api = new ApiClient();
