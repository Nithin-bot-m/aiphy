// Authentication Module (Password + OTP; DEMO accounts are clearly labelled).
const Auth = {
  currentUser: null,
  currentProfile: null,

  async init() {
    if (window.api.getToken()) {
      try {
        const res = await window.api.getMe();
        this.currentUser = res.user;
        this.currentProfile = res.profile;
      } catch (e) {
        window.api.setToken(null);
        this.currentUser = null;
      }
    }
    this.updateHeaderAuthUI();
  },

  updateHeaderAuthUI() {
    const authArea = document.getElementById('header-auth-area');
    if (!authArea) return;

    if (this.currentUser) {
      const role = esc(this.currentUser.role);
      const name = esc(this.currentProfile?.full_name || this.currentUser.email || 'User');
      authArea.innerHTML = `
        <div class="user-badge">
          <div style="text-align: right;">
            <div style="font-weight: 700; font-size: 0.9rem;">${name}</div>
            <span class="role-pill role-${role}">${role}</span>
          </div>
          <button class="btn btn-secondary btn-sm" data-act="Auth:logout">Sign Out</button>
        </div>
      `;
    } else {
      authArea.innerHTML = `
        <button class="btn btn-secondary btn-sm" data-act="Auth:openLoginModal">Sign In</button>
        <button class="btn btn-primary btn-sm" data-act="Auth:openRegisterModal">Get Started</button>
      `;
    }
  },

  openLoginModal() {
    document.getElementById('modal-content').innerHTML = `
      <div class="modal-header">
        <h3>Sign In to Your Account</h3>
        <button class="modal-close" data-act="Ui:closeModal">✕</button>
      </div>
      <div class="modal-body">
        <div style="display: flex; gap: 8px; margin-bottom: 20px;">
          <button class="btn btn-sm btn-primary" id="btn-tab-pwd" data-act="Auth:toggleAuthTab" data-args='["pwd"]'>Password</button>
          <button class="btn btn-sm btn-secondary" id="btn-tab-otp" data-act="Auth:toggleAuthTab" data-args='["otp"]'>OTP Login</button>
        </div>

        <form id="form-login-pwd" data-submit="Auth:handleLoginPassword">
          <div class="form-group">
            <label class="form-label" for="login-identifier">Email or Phone Number</label>
            <input type="text" id="login-identifier" class="form-input" placeholder="you@example.com" required autocomplete="username">
          </div>
          <div class="form-group">
            <label class="form-label" for="login-password">Password</label>
            <input type="password" id="login-password" class="form-input" placeholder="••••••••" required autocomplete="current-password">
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 8px;">Sign In</button>
        </form>

        <form id="form-login-otp" style="display: none;" data-submit="Auth:handleLoginOtp">
          <div class="form-group">
            <label class="form-label" for="login-phone">Registered Mobile Number</label>
            <div style="display: flex; gap: 8px;">
              <input type="text" id="login-phone" class="form-input" placeholder="+91XXXXXXXXXX" required>
              <button type="button" class="btn btn-secondary btn-sm" data-act="Auth:requestOtp">Send OTP</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="login-otp">6-Digit Verification Code</label>
            <input type="text" id="login-otp" class="form-input" inputmode="numeric" maxlength="6" placeholder="Enter the code you received" autocomplete="one-time-code">
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 8px;">Verify &amp; Sign In</button>
        </form>

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-subtle); text-align: center; font-size: 0.85rem; color: var(--text-secondary);">
          Don't have an account? <a href="#" data-act="Auth:openRegisterModal">Register as Student or Parent</a>
        </div>
      </div>
    `;
    window.openModal();
  },

  toggleAuthTab(tab) {
    const pwdForm = document.getElementById('form-login-pwd');
    const otpForm = document.getElementById('form-login-otp');
    const btnPwd = document.getElementById('btn-tab-pwd');
    const btnOtp = document.getElementById('btn-tab-otp');
    if (tab === 'pwd') {
      pwdForm.style.display = 'block'; otpForm.style.display = 'none';
      btnPwd.className = 'btn btn-sm btn-primary'; btnOtp.className = 'btn btn-sm btn-secondary';
    } else {
      pwdForm.style.display = 'none'; otpForm.style.display = 'block';
      btnPwd.className = 'btn btn-sm btn-secondary'; btnOtp.className = 'btn btn-sm btn-primary';
    }
  },

  async handleLoginPassword(e) {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier').value.trim();
    const password = document.getElementById('login-password').value;
    try {
      window.showToast('Signing in...', 'info');
      const res = await window.api.login(identifier, password);
      this.currentUser = res.user;
      window.showToast('Signed in successfully!', 'success');
      window.closeModal();
      await this.init();
      this.routeToRoleDashboard();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async requestOtp() {
    const phone = document.getElementById('login-phone').value.trim();
    if (!phone) { window.showToast('Please enter your registered mobile number.', 'error'); return; }
    try {
      const res = await window.api.sendOtp(phone);
      // The OTP itself is NEVER returned by the API. In development the server
      // prints it to the server console; production requires an SMS provider.
      window.showToast(res.message || 'If registered, an OTP was dispatched.', 'success');
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  async handleLoginOtp(e) {
    e.preventDefault();
    const phone = document.getElementById('login-phone').value.trim();
    const otp = document.getElementById('login-otp').value.trim();
    try {
      const res = await window.api.verifyOtp(phone, otp);
      this.currentUser = res.user;
      window.showToast('OTP verified!', 'success');
      window.closeModal();
      await this.init();
      this.routeToRoleDashboard();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  openRegisterModal() {
    document.getElementById('modal-content').innerHTML = `
      <div class="modal-header">
        <h3>Create Your Account</h3>
        <button class="modal-close" data-act="Ui:closeModal">✕</button>
      </div>
      <div class="modal-body">
        <form data-submit="Auth:handleRegister">
          <div class="form-group">
            <label class="form-label" for="reg-role">I am registering as a:</label>
            <select class="form-select" id="reg-role" required data-change="Auth:toggleRegFields">
              <option value="candidate">Grade 10 Student (Candidate)</option>
              <option value="parent">Parent / Guardian</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-name">Full Name</label>
            <input type="text" id="reg-name" class="form-input" placeholder="Your full name" required maxlength="120">
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-email">Email Address</label>
            <input type="email" id="reg-email" class="form-input" placeholder="name@example.com" required>
          </div>
          <div class="form-group">
            <label class="form-label" for="reg-phone">Mobile Number <span style="color:var(--text-muted)">(optional)</span></label>
            <input type="tel" id="reg-phone" class="form-input" placeholder="+91 98765 43210">
          </div>

          <div id="reg-candidate-extra">
            <div class="form-group">
              <label class="form-label" for="reg-board">Educational Board</label>
              <select class="form-select" id="reg-board">
                <option value="CBSE">CBSE</option>
                <option value="ICSE">ICSE / ISC</option>
                <option value="State Board">State Board</option>
                <option value="IB">IB (International Baccalaureate)</option>
                <option value="Cambridge (IGCSE)">Cambridge (IGCSE)</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="reg-school">School Name</label>
              <input type="text" id="reg-school" class="form-input" placeholder="e.g. Modern High School" maxlength="160">
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="reg-pwd">Password <span style="color:var(--text-muted)">(min 8 chars, letters + numbers)</span></label>
            <input type="password" id="reg-pwd" class="form-input" placeholder="At least 8 characters" required minlength="8" autocomplete="new-password">
          </div>

          <p style="font-size: 0.78rem; color: var(--text-muted); margin: 12px 0;">
            By creating an account you agree that this tool provides educational guidance only — it is not a psychological or clinical evaluation. Minimum necessary data is collected, and students control which parents can view their results.
          </p>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 4px;">Create Account</button>
        </form>

        <div style="margin-top: 18px; text-align: center; font-size: 0.85rem; color: var(--text-secondary);">
          Already have an account? <a href="#" data-act="Auth:openLoginModal">Sign In</a>
        </div>
      </div>
    `;
    window.openModal();
  },

  toggleRegFields(role) {
    const extra = document.getElementById('reg-candidate-extra');
    if (extra) extra.style.display = role === 'candidate' ? 'block' : 'none';
  },

  async handleRegister(e) {
    e.preventDefault();
    const role = document.getElementById('reg-role').value;
    const full_name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const password = document.getElementById('reg-pwd').value;
    const board = document.getElementById('reg-board')?.value || 'CBSE';
    const school_name = document.getElementById('reg-school')?.value || '';

    try {
      window.showToast('Creating account...', 'info');
      const res = await window.api.register({ role, full_name, email, phone, password, board, school_name, grade: 10 });
      this.currentUser = res.user;
      if (role === 'candidate' && res.profile?.student_code) {
        window.showToast(`Your student code: ${res.profile.student_code} — share it with a parent to link.`, 'success');
      } else {
        window.showToast('Account registered successfully!', 'success');
      }
      window.closeModal();
      await this.init();
      this.routeToRoleDashboard();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  // DEMO accounts only exist when the server is seeded with SEED_DEMO_DATA=true.
  async quickLoginDemo(role) {
    const accounts = {
      candidate: 'aarav@demo.psychometric-ai.local',
      parent: 'sunita@demo.psychometric-ai.local',
      admin: 'admin@demo.psychometric-ai.local'
    };
    try {
      window.showToast(`Signing in as DEMO ${role}...`, 'info');
      const res = await window.api.login(accounts[role], 'Demo@12345');
      this.currentUser = res.user;
      await this.init();
      window.showToast(`Logged in as DEMO ${role.toUpperCase()}.`, 'success');
      this.routeToRoleDashboard();
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  },

  routeToRoleDashboard() {
    if (!this.currentUser) return;
    if (this.currentUser.role === 'candidate') {
      window.location.hash = '#view-candidate';
      window.CandidateView?.init();
    } else if (this.currentUser.role === 'parent') {
      window.location.hash = '#view-parent';
      window.ParentView?.init();
    } else if (this.currentUser.role === 'admin') {
      window.location.hash = '#view-admin';
      window.AdminView?.init();
    }
  },

  async logout() {
    await window.api.logout();
    this.currentUser = null;
    this.currentProfile = null;
    this.updateHeaderAuthUI();
    window.location.hash = '#view-landing';
    window.showToast('Signed out.', 'info');
  }
};

window.Auth = Auth;
