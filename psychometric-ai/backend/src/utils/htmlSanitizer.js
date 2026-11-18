// Conservative HTML sanitizer for LLM-generated report narratives.
//
// The LLM output is UNTRUSTED content: prompt-injection or a compromised
// provider must never yield stored XSS. Strategy:
//   1. Drop dangerous blocks entirely (script/style/iframe/object/embed/svg/math + comments).
//   2. Allowlist tags; strip ALL attributes from allowed tags (reports need no attributes).
//   3. Escape anything that is not an allowed tag so it renders as literal text.
// Combined with the strict CSP set by helmet, this is defense in depth.

const ALLOWED_TAGS = new Set([
  'h3', 'h4', 'h5', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'hr',
  'blockquote', 'table', 'thead', 'tbody', 'tr', 'td', 'th'
]);

const DANGEROUS_BLOCKS = /<\s*(script|style|iframe|object|embed|svg|math|link|meta)[\s\S]*?(<\/\s*\1\s*>|$)/gi;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const TAG_TOKEN = /<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeNarrativeHtml(input) {
  if (typeof input !== 'string') return '';
  let text = input.replace(DANGEROUS_BLOCKS, '').replace(HTML_COMMENT, '');

  text = text.replace(TAG_TOKEN, (match, rawName, selfClose) => {
    const name = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return ''; // drop tag, keep inner text
    if (name === 'br' || name === 'hr') return `<${name}${selfClose ? ' /' : ''}>`;
    return match.startsWith('</') ? `</${name}>` : `<${name}>`;
  });

  // Escape leftover angle brackets that are not part of allowed tags we just emitted.
  text = text.replace(/<(?!\s*(\/?)(h3|h4|h5|p|ul|ol|li|strong|em|br|hr|blockquote|table|thead|tbody|tr|td|th)\b)/g, '&lt;');

  return text.trim();
}

module.exports = { sanitizeNarrativeHtml, escapeHtml };
