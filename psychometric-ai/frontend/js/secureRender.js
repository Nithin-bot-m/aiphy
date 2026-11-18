// Shared frontend security helper — ALL dynamic strings must pass through esc()
// before being placed into innerHTML (audited vulnerability F7).
// This file is the DEFINITION site of the two shared globals; other files only
// consume them (declared in eslint.config.cjs sharedGlobals).
/* eslint-disable no-redeclare */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Renders server-sanitized report narrative HTML.
// The backend sanitizes stored narratives with a tag allowlist; this helper is a
// second layer that strips anything before insertion.
function renderNarrative(html) {
  const holder = document.createElement('div');
  holder.innerHTML = String(html || '');
  holder.querySelectorAll('script,style,iframe,object,embed,svg,link,meta').forEach(el => el.remove());
  holder.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => el.removeAttribute(attr.name));
  });
  return holder.innerHTML;
}
window.esc = esc;
window.renderNarrative = renderNarrative;

// ---------------------------------------------------------------------------
// CSP-safe event wiring.
//
// The production Content-Security-Policy sets `script-src-attr 'none'`, which
// BLOCKS all inline `onclick="..."` attributes. All UI event handlers are
// therefore expressed as declarative attributes and wired here ONCE:
//
//   <button data-act="Auth:openLoginModal">Sign in</button>
//   <button data-act="CandidateView:selectOption" data-args='[123]'>A</button>
//
// `data-args` is a JSON array, JSON.parse'd by this dispatcher — method
// signatures stay unchanged. Dynamic values inside data-args MUST be escaped
// with esc() (attribute-safe) before interpolation, same as any attribute.
// ---------------------------------------------------------------------------
function dispatchAction(el) {
  const [objName, fnName] = String(el.dataset.act || '').split(':');
  const target = window[objName];
  if (!target || typeof target[fnName] !== 'function') {
    console.error(`[actions] unknown handler: ${el.dataset.act}`);
    return;
  }
  let args = [];
  if (el.dataset.args) {
    try { args = JSON.parse(el.dataset.args); } catch { console.error('[actions] malformed data-args'); return; }
  }
  target[fnName](...args);
}

// Click delegation (buttons, cards, anchors)
document.addEventListener('click', (event) => {
  const el = event.target instanceof Element ? event.target.closest('[data-act]') : null;
  if (!el) return;
  if (el.tagName === 'A') event.preventDefault(); // anchors use data-act instead of javascript: hrefs
  dispatchAction(el);
});

// Submit delegation — replaces inline onsubmit="X(event)"; handlers keep the
// event-first signature: handleX(event, ...data-args)
document.addEventListener('submit', (event) => {
  const form = event.target instanceof Element ? event.target.closest('[data-submit]') : null;
  if (!form) return;
  event.preventDefault();
  const [objName, fnName] = String(form.dataset.submit || '').split(':');
  const target = window[objName];
  if (!target || typeof target[fnName] !== 'function') { console.error(`[actions] unknown submit handler: ${form.dataset.submit}`); return; }
  let args = [];
  if (form.dataset.args) {
    try { args = JSON.parse(form.dataset.args); } catch { console.error('[actions] malformed data-args'); return; }
  }
  target[fnName](event, ...args);
});

// Change delegation — handler receives (el.value, el); no-arg handlers ignore it
document.addEventListener('change', (event) => {
  const el = event.target instanceof Element ? event.target.closest('[data-change]') : null;
  if (!el) return;
  const [objName, fnName] = String(el.dataset.change || '').split(':');
  const target = window[objName];
  if (!target || typeof target[fnName] !== 'function') { console.error(`[actions] unknown change handler: ${el.dataset.change}`); return; }
  target[fnName](el.value, el);
});

// Keyboard activation (Enter / Space) for role="button" card elements
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const el = event.target instanceof Element ? event.target.closest('[data-act][role="button"]') : null;
  if (!el) return;
  event.preventDefault();
  dispatchAction(el);
});

// Small UI helpers replacing inline `window.*` handler attributes.
window.Ui = {
  print: () => window.print(),
  back: () => window.history.back(),
  closeModal: () => window.closeModal(),
  goLanding: () => { window.location.hash = '#view-landing'; }
};
