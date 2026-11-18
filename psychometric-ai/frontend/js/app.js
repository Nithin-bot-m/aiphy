// Main Application Coordinator & Router
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message; // textContent — never inject HTML into toasts

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function openModal() {
  const modal = document.getElementById('modal-overlay');
  if (modal) modal.classList.add('active');
}

function closeModal() {
  const modal = document.getElementById('modal-overlay');
  if (modal) modal.classList.remove('active');
}

window.showToast = showToast;
window.openModal = openModal;
window.closeModal = closeModal;

// Router
function handleRoute() {
  const hash = window.location.hash || '#view-landing';
  const views = ['view-landing', 'view-candidate', 'view-parent', 'view-admin', 'view-report'];

  views.forEach(vId => {
    const el = document.getElementById(vId);
    if (el) el.style.display = `#${vId}` === hash ? 'block' : 'none';
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.getAttribute('href') === hash) btn.classList.add('active');
    else btn.classList.remove('active');
  });

  if (hash === '#view-candidate') {
    if (!window.Auth?.currentUser) {
      window.Auth?.openLoginModal();
    } else if (window.Auth.currentUser.role === 'candidate' || window.Auth.currentUser.role === 'admin') {
      window.CandidateView?.init();
    } else {
      window.showToast('Please use the parent portal for your account type.', 'info');
      window.location.hash = '#view-landing';
    }
  } else if (hash === '#view-parent') {
    if (!window.Auth?.currentUser) {
      window.Auth?.openLoginModal();
    } else if (window.Auth.currentUser.role === 'parent' || window.Auth.currentUser.role === 'admin') {
      window.ParentView?.init();
    } else {
      window.showToast('The parent portal requires a parent account.', 'info');
      window.location.hash = '#view-landing';
    }
  } else if (hash === '#view-admin') {
    if (!window.Auth?.currentUser || window.Auth.currentUser.role !== 'admin') {
      window.showToast('Admin authentication required.', 'error');
    } else {
      window.AdminView?.init();
    }
  }
}

window.addEventListener('hashchange', handleRoute);

document.addEventListener('DOMContentLoaded', async () => {
  await window.Auth?.init();
  handleRoute();
});
